import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createTokenApiServer } from "../../helpers/api-tokens.js";
import { mockedObject } from "../../helpers/vitest.js";
import {
  reportRunFixture,
  reportOrg,
  reportId,
  reportProject,
  reportRequest
} from "../../helpers/smart-reports.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { SmartReportError } from "../../../packages/smart-reports/src/report-errors.js";
import { buildCsrfToken, SESSION_COOKIE_NAME } from "../../../packages/auth/src/index.js";
const user = randomUUID(),
  token = randomUUID(),
  headers = { authorization: "Bearer dbundle_mem_test" };
const command = {
  request_id: reportRequest,
  definition_id: reportId,
  expected_version: 1,
  period: reportRunFixture().period
};
function fixture(policy?: unknown, generationEnabled = true) {
  const admit = vi.fn().mockResolvedValue(reportRunFixture()),
    list = vi.fn().mockResolvedValue({ items: [reportRunFixture()], next_cursor: null }),
    get = vi.fn().mockResolvedValue(reportRunFixture()),
    cancel = vi.fn().mockResolvedValue({ ...reportRunFixture(), status: "cancelled" }),
    remove = vi.fn().mockResolvedValue(undefined);
  const services = {
    admission: { admit },
    management: { get, list, cancel, remove, complete: vi.fn() }
  };
  const app = createTokenApiServer({
    memberAuth: mockedObject<ApiDependencies["memberAuth"]>({
      resolveMemberByTokenHash: vi.fn().mockResolvedValue({
        member_id: user,
        organization_id: reportOrg,
        role: "member",
        token_id: token,
        ...(policy === undefined ? {} : { token_policy: policy })
      })
    }),
    reportRuns: services,
    reportGenerationEnabled: generationEnabled
  });
  return { app, services, admit, list, get, cancel, remove };
}
describe("report run HTTP boundaries", () => {
  it("keeps retained history and deletion available while new generation is disabled", async () => {
    const { app, admit, get, remove } = fixture(undefined, false);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/organizations/${reportOrg}/reports`,
          headers,
          payload: command
        })
      ).statusCode
    ).toBe(404);
    expect(admit).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/v1/organizations/${reportOrg}/reports/${reportRequest}`,
          headers
        })
      ).statusCode
    ).toBe(200);
    expect(get).toHaveBeenCalledOnce();
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/v1/organizations/${reportOrg}/reports/${reportRequest}`,
          headers,
          payload: {}
        })
      ).statusCode
    ).toBe(200);
    expect(remove).toHaveBeenCalledOnce();
  });
  it("binds manual and explicit regeneration to the actual requester without accepting model or authority settings", async () => {
    const { app, admit } = fixture();
    const response = await app.inject({
      method: "POST",
      url: `/v1/organizations/${reportOrg}/reports`,
      headers,
      payload: command
    });
    expect(response.statusCode).toBe(202);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(admit).toHaveBeenCalledWith({
      ...command,
      send_email: false,
      organization_id: reportOrg,
      initiator: { version: 1, kind: "member_token", user_id: user, token_id: token },
      kind: "manual"
    });
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${reportOrg}/reports`,
      headers,
      payload: { ...command, regenerate_from_run_id: reportRequest }
    });
    expect(admit).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "regeneration", regenerate_from_run_id: reportRequest })
    );
    admit.mockClear();
    for (const field of [
      "kind",
      "profile",
      "monthly_budget_nano_usd",
      "initiator",
      "accepted_scope"
    ]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/v1/organizations/${reportOrg}/reports`,
            headers,
            payload: { ...command, [field]: "untrusted" }
          })
        ).statusCode
      ).toBe(400);
    }
    expect(admit).not.toHaveBeenCalled();
  });
  it("retains history cursors and keeps scoped read-only credentials out of generation and mutations", async () => {
    const { app, list, admit, cancel, remove } = fixture({
      version: 1,
      mode: "projects",
      permissions: ["project:read"],
      projects: [{ project_id: reportProject, origin_project_ids: [reportProject] }]
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/v1/organizations/${reportOrg}/reports?limit=1`,
          headers
        })
      ).json()
    ).toEqual({ runs: [reportRunFixture()], next_cursor: null });
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 1,
        organization_id: reportOrg,
        initiator: expect.objectContaining({ user_id: user, token_id: token })
      })
    );
    for (const request of [
      { method: "POST" as const, url: `/v1/organizations/${reportOrg}/reports`, payload: command },
      {
        method: "POST" as const,
        url: `/v1/organizations/${reportOrg}/reports/${reportRequest}/cancel`,
        payload: {}
      },
      {
        method: "DELETE" as const,
        url: `/v1/organizations/${reportOrg}/reports/${reportRequest}`,
        payload: {}
      }
    ])
      expect((await app.inject({ ...request, headers })).statusCode).toBe(403);
    expect(admit).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it("rejects malformed cursors and stale browser context before touching run storage", async () => {
    const { app, list, services, admit } = fixture();
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/v1/organizations/${reportOrg}/reports?cursor=invalid`,
          headers
        })
      ).statusCode
    ).toBe(400);
    expect(list).not.toHaveBeenCalled();
    const session = "report-browser-session",
      browser = createTokenApiServer({
        webAuth: {
          resolveSessionByToken: vi.fn().mockResolvedValue({
            user_id: user,
            organization_id: randomUUID(),
            email: "owner@example.test",
            email_verified_at: new Date().toISOString(),
            role: "owner"
          })
        },
        reportRuns: services
      });
    expect(
      (
        await browser.inject({
          method: "POST",
          url: `/v1/organizations/${reportOrg}/reports`,
          headers: {
            cookie: `${SESSION_COOKIE_NAME}=${session}`,
            "x-csrf-token": buildCsrfToken(session)
          },
          payload: { ...command, expected_organization_id: reportOrg }
        })
      ).statusCode
    ).toBe(409);
    expect(admit).not.toHaveBeenCalled();
  });
  it("maps quota and domain failures safely and refuses expanded private output records", async () => {
    const { app, admit, get } = fixture();
    admit.mockRejectedValueOnce(new SmartReportError("report_quota_exhausted"));
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/organizations/${reportOrg}/reports`,
          headers,
          payload: command
        })
      ).statusCode
    ).toBe(429);
    get.mockResolvedValueOnce({ ...reportRunFixture(), lease_token: "private-value" });
    const failed = await app.inject({
      method: "GET",
      url: `/v1/organizations/${reportOrg}/reports/${reportRequest}`,
      headers
    });
    expect(failed.statusCode).toBe(500);
    expect(failed.body).not.toContain("private-value");
    admit.mockRejectedValueOnce(new Error("private provider body"));
    const error = await app.inject({
      method: "POST",
      url: `/v1/organizations/${reportOrg}/reports`,
      headers,
      payload: command
    });
    expect(error.json()).toEqual({ error: "report_run_failed" });
    expect(error.body).not.toContain("private provider");
  });
});
