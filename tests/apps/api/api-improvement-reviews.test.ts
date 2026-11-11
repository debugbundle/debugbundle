import { buildCsrfToken, SESSION_COOKIE_NAME } from "../../../packages/auth/src/index.js";
import { expect, it, vi } from "vitest";
import { createTokenApiServer } from "../../helpers/api-tokens.js";
import { mockedObject } from "../../helpers/vitest.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { createImprovementReviewApi } from "../../../packages/improvement-review-client/src/index.js";
import {
  createImprovementReviewMcpTools,
  IMPROVEMENT_REVIEW_MCP_TOOL_CATALOG
} from "../../../apps/mcp/src/improvement-review-tools.js";
import { improvementReviewsWithAuthCommand } from "../../../apps/cli/src/improvement-review-commands.js";
import { SmartReportError } from "../../../packages/smart-reports/src/report-errors.js";
import { reportOrg, reportProject, reportRequest } from "../../helpers/smart-reports.js";
const settings = {
  version: 0,
  enabled: false,
  scope: [],
  privacy_mode: "restricted" as const,
  source_consent: false,
  next_due_at: null,
  requires_review: false
};
function setup(enabled = true): {
  app: ReturnType<typeof createTokenApiServer>;
  reviews: NonNullable<ApiDependencies["improvementReviews"]>;
  replace: ReturnType<typeof vi.fn>;
} {
  const replace = vi.fn().mockResolvedValue({ ...settings, version: 1 });
  const reviews = {
    store: {
      list: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      get: vi.fn().mockResolvedValue({
        id: reportRequest,
        project_id: reportProject,
        project_name: "Test project",
        period: {
          kind: "weekly",
          starts_at: "2026-11-02T00:00:00.000Z",
          ends_at: "2026-11-09T00:00:00.000Z",
          duration_days: 7
        },
        status: "queued",
        reason: null,
        created_at: "2026-11-09T09:00:00.000Z",
        expires_at: "2027-02-01T00:00:00.000Z"
      }),
      bundle: vi.fn().mockResolvedValue({ bundle: null, status: "queued" })
    },
    settings: { get: vi.fn().mockResolvedValue(settings), replace },
    allowance: vi.fn().mockResolvedValue({
      limit: 25,
      used: 0,
      remaining: 25,
      starts_at: "2026-11-01T00:00:00.000Z",
      ends_at: "2026-12-01T00:00:00.000Z"
    })
  };
  return {
    app: createTokenApiServer({
      improvementReviews: reviews,
      improvementReviewsEnabled: enabled,
      memberAuth: mockedObject<ApiDependencies["memberAuth"]>({
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: reportProject,
          organization_id: reportOrg,
          token_id: reportRequest,
          role: "owner"
        })
      })
    }),
    reviews,
    replace
  };
}
const base = `/v1/organizations/${reportOrg}/improvements/reviews`,
  headers = { authorization: "Bearer dbundle_mem_reader" };
it("keeps existing review reads independent from activation and rejects invalid input without mutation", async () => {
  const { app, replace } = setup(false);
  for (const suffix of ["", "/settings", "/allowance", `/${reportRequest}/bundle`]) {
    const response = await app.inject({ method: "GET", url: base + suffix, headers });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
  }
  expect((await app.inject({ method: "GET", url: base })).statusCode).toBe(401);
  expect((await app.inject({ method: "GET", url: base + "?limit=500", headers })).statusCode).toBe(
    400
  );
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: base + "/settings",
        headers,
        payload: {
          expected_version: 0,
          enabled: true,
          project_ids: [reportProject],
          source_consent: true
        }
      })
    ).statusCode
  ).toBe(503);
  expect(replace).not.toHaveBeenCalled();
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: base + "/settings",
        headers,
        payload: { expected_version: 0, enabled: false, project_ids: [], source_consent: false }
      })
    ).statusCode
  ).toBe(200);
  expect(replace).toHaveBeenCalledOnce();
  await app.close();
});
it("routes API, CLI and ordinary MCP through the same shared client and domain store", async () => {
  const { app, reviews } = setup();
  const request = vi.fn<Parameters<typeof createImprovementReviewApi>[0]["request"]>(
    async (input) => {
      const result = await app.inject({
        method: input.method,
        url: input.path,
        headers: { authorization: `Bearer ${input.bearerToken}` },
        ...(input.body === undefined ? {} : { payload: input.body as object })
      });
      return { status: result.statusCode, body: result.json<unknown>() };
    }
  );
  const api = createImprovementReviewApi({ request }),
    scope = { organizationId: reportOrg, bearerToken: "dbundle_mem_reader" };
  expect(await api.list(scope)).toEqual({ reviews: [], next_cursor: null });
  const tools = createImprovementReviewMcpTools(api);
  expect(await tools.list_improvement_reviews(scope)).toEqual({ reviews: [], next_cursor: null });
  const cli = await improvementReviewsWithAuthCommand(
    { organizationId: reportOrg, action: "list", json: true },
    {
      readAuthState: async () => ({
        base_url: "http://local.test",
        bearer_token: scope.bearerToken
      }),
      createHttpClient: () => ({ request })
    }
  );
  expect(cli.exitCode).toBe(0);
  expect(JSON.parse(cli.output)).toEqual({ reviews: [], next_cursor: null });
  expect(reviews.store.list).toHaveBeenCalledTimes(3);
  for (const name of [
    "get_improvement_review",
    "get_improvement_review_bundle",
    "get_improvement_review_settings",
    "get_improvement_review_allowance"
  ] as const)
    await tools[name]({
      ...scope,
      ...(name === "get_improvement_review" || name === "get_improvement_review_bundle"
        ? { reviewId: reportRequest }
        : {})
    });
  for (const action of ["get", "bundle", "settings", "allowance"] as const)
    expect(
      (
        await improvementReviewsWithAuthCommand(
          {
            organizationId: reportOrg,
            action,
            ...(action === "get" || action === "bundle" ? { reviewId: reportRequest } : {})
          } as Parameters<typeof improvementReviewsWithAuthCommand>[0],
          {
            readAuthState: async () => ({
              base_url: "http://local.test",
              bearer_token: scope.bearerToken
            }),
            createHttpClient: () => ({ request })
          }
        )
      ).exitCode
    ).toBe(0);

  await tools.update_improvement_review_settings({
    ...scope,
    command: { expected_version: 0, enabled: false, project_ids: [], source_consent: false }
  });
  expect(reviews.settings.replace).toHaveBeenCalledWith(
    expect.objectContaining({
      initiator: {
        version: 1,
        kind: "member_token",
        user_id: reportProject,
        token_id: reportRequest
      }
    })
  );
  expect(
    IMPROVEMENT_REVIEW_MCP_TOOL_CATALOG.find(
      (tool) => tool.name === "update_improvement_review_settings"
    )?.annotations
  ).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  await app.close();
});
it("returns safe failures and never exposes private receipt fields", async () => {
  const { app, reviews } = setup();
  vi.mocked(reviews.store.bundle).mockRejectedValueOnce(new Error("secret-internal-receipt"));
  const failed = await app.inject({
    method: "GET",
    url: base + `/${reportRequest}/bundle`,
    headers
  });
  expect(failed.statusCode).toBe(500);
  expect(failed.body).not.toContain("secret-internal");
  vi.mocked(reviews.store.bundle).mockRejectedValueOnce(new SmartReportError("report_not_found"));
  expect(
    (await app.inject({ method: "GET", url: base + `/${reportRequest}/bundle`, headers })).json()
  ).toEqual({ error: "improvement_review_not_found" });
  await app.close();
});

it("enforces browser CSRF and rejects a stale workspace before replacing consent", async () => {
  const f = setup(),
    session = "synthetic-review-session";
  const app = createTokenApiServer({
    improvementReviews: f.reviews,
    improvementReviewsEnabled: true,
    webAuth: {
      resolveSessionByToken: vi.fn().mockResolvedValue({
        user_id: reportProject,
        organization_id: reportOrg,
        email: "owner@example.test",
        email_verified_at: new Date().toISOString(),
        role: "owner"
      })
    }
  });
  const payload = { expected_version: 0, enabled: false, project_ids: [], source_consent: false },
    cookie = `${SESSION_COOKIE_NAME}=${session}`;
  expect(
    (await app.inject({ method: "PATCH", url: base + "/settings", headers: { cookie }, payload }))
      .statusCode
  ).toBe(403);
  expect(f.replace).not.toHaveBeenCalled();
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: base + "/settings",
        headers: { cookie, "x-csrf-token": buildCsrfToken(session) },
        payload: { ...payload, expected_organization_id: reportProject }
      })
    ).statusCode
  ).toBe(409);
  expect(f.replace).not.toHaveBeenCalled();
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: base + "/settings",
        headers: { cookie, "x-csrf-token": buildCsrfToken(session) },
        payload: { ...payload, expected_organization_id: reportOrg }
      })
    ).statusCode
  ).toBe(200);
  expect(f.replace).toHaveBeenCalledOnce();
  await app.close();
  await f.app.close();
});
