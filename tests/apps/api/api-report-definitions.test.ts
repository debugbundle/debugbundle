import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createTokenApiServer } from "../../helpers/api-tokens.js";
import { mockedObject } from "../../helpers/vitest.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { SmartReportError } from "../../../packages/smart-reports/src/report-errors.js";
import { buildCsrfToken, SESSION_COOKIE_NAME } from "../../../packages/auth/src/index.js";
const org = randomUUID(),
  user = randomUUID(),
  project = randomUUID(),
  id = randomUUID(),
  tokenId = randomUUID();
const definition = {
  name: "Monthly review",
  cadence: "monthly",
  project_ids: [project],
  source_collection_consent: true
};
function fixture(policy?: unknown) {
  const create = vi.fn().mockResolvedValue({ id }),
    list = vi.fn().mockResolvedValue([]),
    replace = vi.fn(),
    remove = vi.fn().mockResolvedValue(true),
    get = vi.fn().mockResolvedValue(null);
  const app = createTokenApiServer({
    memberAuth: mockedObject<ApiDependencies["memberAuth"]>({
      resolveMemberByTokenHash: vi.fn().mockResolvedValue({
        member_id: user,
        organization_id: org,
        role: "member",
        token_id: tokenId,
        ...(policy === undefined ? {} : { token_policy: policy })
      })
    }),
    reportDefinitions: { create, list, replace, remove, get }
  });
  return { app, create, list, replace, remove, get };
}
const headers = { authorization: "Bearer dbundle_mem_test" };
describe("report definition HTTP boundaries", () => {
  it("admits an explicit definition using the actual token identity instead of requiring Org Admin", async () => {
    const { app, create } = fixture(),
      request = randomUUID();
    const response = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org}/report-definitions`,
      headers,
      payload: { request_id: request, definition }
    });
    expect(response.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: org,
        request_id: request,
        initiator: { version: 1, kind: "member_token", user_id: user, token_id: tokenId },
        definition: expect.objectContaining({
          privacy_mode: "full",
          source_collection_consent: true
        })
      })
    );
  });
  it("rejects caller authority/origins and stale browser workspace before mutation", async () => {
    const { app, create } = fixture();
    const response = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org}/report-definitions`,
      headers,
      payload: {
        request_id: randomUUID(),
        definition: { ...definition, initiator: { user_id: user }, origin_project_ids: [project] }
      }
    });
    expect(response.statusCode).toBe(400);
    expect(create).not.toHaveBeenCalled();
    const session = "session-test";
    const browser = createTokenApiServer({
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: user,
          organization_id: org,
          email: "owner@example.test",
          email_verified_at: new Date().toISOString(),
          role: "owner"
        })
      },
      reportDefinitions: mockedObject<NonNullable<ApiDependencies["reportDefinitions"]>>({ create })
    });
    const stale = await browser.inject({
      method: "POST",
      url: `/v1/organizations/${org}/report-definitions`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${session}`,
        "x-csrf-token": buildCsrfToken(session)
      },
      payload: {
        request_id: randomUUID(),
        definition: { ...definition, expected_organization_id: randomUUID() }
      }
    });
    expect(stale.statusCode).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });
  it("keeps restricted project readers in read paths and administration in domain scope checks", async () => {
    const policy = {
      version: 1,
      mode: "projects",
      permissions: ["project:read"],
      projects: [{ project_id: project, origin_project_ids: [project] }]
    };
    const { app, list, create } = fixture(policy);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/v1/organizations/${org}/report-definitions`,
          headers
        })
      ).statusCode
    ).toBe(200);
    expect(list).toHaveBeenCalledOnce();
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/organizations/${org}/report-definitions`,
          headers,
          payload: { request_id: randomUUID(), definition }
        })
      ).statusCode
    ).toBe(403);
    expect(create).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/v1/organizations/${org}/report-definitions/${id}`,
          headers
        })
      ).statusCode
    ).toBe(404);
  });
  it("maps version and entitlement failures without exposing internal errors", async () => {
    const { app, replace } = fixture();
    replace.mockRejectedValueOnce(new SmartReportError("report_version_conflict"));
    const request = {
      method: "PATCH" as const,
      url: `/v1/organizations/${org}/report-definitions/${id}`,
      headers,
      payload: { ...definition, expected_version: 1 }
    };
    expect((await app.inject(request)).statusCode).toBe(409);
    replace.mockRejectedValueOnce(new Error("sensitive database detail"));
    const response = await app.inject(request);
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("sensitive");
  });
  it("retains browser CSRF protection and records only mutation metadata, including refusal", async () => {
    const create = vi.fn().mockResolvedValue({ id }),
      audit = vi.fn().mockResolvedValue(undefined),
      session = "session-audit";
    const app = createTokenApiServer({
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: user,
          organization_id: org,
          email: "owner@example.test",
          email_verified_at: new Date().toISOString(),
          role: "owner"
        })
      },
      reportDefinitions: mockedObject<NonNullable<ApiDependencies["reportDefinitions"]>>({
        create
      }),
      auditLogging: { createAuditLog: audit }
    });
    const request = {
      method: "POST" as const,
      url: `/v1/organizations/${org}/report-definitions`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${session}` },
      payload: { request_id: randomUUID(), definition }
    };
    expect((await app.inject(request)).statusCode).toBe(403);
    expect(create).not.toHaveBeenCalled();
    const response = await app.inject({
      ...request,
      headers: { ...request.headers, "x-csrf-token": buildCsrfToken(session) }
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "report.definition.create",
        status: "failure",
        metadata: { status_code: 403 }
      })
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "report.definition.create",
        status: "success",
        metadata: { status_code: 201 }
      })
    );
    expect(JSON.stringify(audit.mock.calls)).not.toContain("Monthly review");
  });
  it("permits project-admin scoped requests while refusing a different named organisation", async () => {
    const scoped = fixture({
      version: 1,
      mode: "projects",
      permissions: ["project:admin"],
      projects: [{ project_id: project, origin_project_ids: [project] }]
    });
    expect(
      (
        await scoped.app.inject({
          method: "POST",
          url: `/v1/organizations/${org}/report-definitions`,
          headers,
          payload: { request_id: randomUUID(), definition }
        })
      ).statusCode
    ).toBe(201);
    const named = fixture({
      version: 1,
      mode: "organization",
      organization_id: org,
      permissions: ["project:admin"]
    });
    expect(
      (
        await named.app.inject({
          method: "GET",
          url: `/v1/organizations/${randomUUID()}/report-definitions`,
          headers
        })
      ).statusCode
    ).toBe(404);
    expect(named.list).not.toHaveBeenCalled();
  });
});
