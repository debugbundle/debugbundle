import { describe, expect, it, vi } from "vitest";
import { createTokenApiServer } from "../../helpers/api-tokens.js";
import { mockedObject } from "../../helpers/vitest.js";
import { reportOrg, reportProject, reportRequest } from "../../helpers/smart-reports.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { SmartReportError } from "../../../packages/smart-reports/src/report-errors.js";
import { buildCsrfToken, SESSION_COOKIE_NAME } from "../../../packages/auth/src/index.js";
const headers = { authorization: "Bearer dbundle_mem_pdf" };
const queued = { run_id: reportRequest, status: "queued", retry_after_seconds: 2 };
const body = Buffer.from("%PDF-1.7\nfixture\n%%EOF\n");
function fixture() {
  const request = vi.fn().mockResolvedValue(queued),
    status = vi.fn().mockResolvedValue(queued),
    download = vi.fn().mockResolvedValue(body);
  const app = createTokenApiServer({
    reportGenerationEnabled: false,
    memberAuth: mockedObject<ApiDependencies["memberAuth"]>({
      resolveMemberByTokenHash: vi.fn().mockResolvedValue({
        member_id: reportProject,
        organization_id: reportOrg,
        token_id: reportRequest,
        role: "member",
        token_policy: {
          version: 1,
          mode: "projects",
          permissions: ["project:read"],
          projects: [{ project_id: reportProject, origin_project_ids: [reportProject] }]
        }
      })
    }),
    reportPdf: { request, status, download, processNext: vi.fn() }
  });
  return { app, request, status, download };
}
describe("authenticated PDF cache API", () => {
  it("requires browser CSRF and enforces the write request budget before queue admission", async () => {
    const request = vi.fn().mockResolvedValue(queued),
      session = "report-pdf-browser-session",
      claimRequest = vi.fn().mockImplementation(async (input: { bucket: string }) => ({
        allowed: input.bucket !== "management-write",
        limit: 100,
        remaining: 0,
        retry_after_ms: 12000
      })),
      app = createTokenApiServer({
        authRateLimiter: { claimRequest },
        webAuth: {
          resolveSessionByToken: vi.fn().mockResolvedValue({
            user_id: reportProject,
            organization_id: reportOrg,
            email: "reader@example.test",
            email_verified_at: new Date().toISOString(),
            role: "member"
          })
        },
        reportPdf: { request, status: vi.fn(), download: vi.fn(), processNext: vi.fn() }
      }),
      url = `/v1/organizations/${reportOrg}/reports/${reportRequest}/pdf`,
      cookie = `${SESSION_COOKIE_NAME}=${session}`;
    expect(
      (await app.inject({ method: "POST", url, headers: { cookie }, payload: {} })).statusCode
    ).toBe(403);
    expect(request).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: { cookie, "x-csrf-token": buildCsrfToken(session) },
          payload: { expected_organization_id: reportOrg }
        })
      ).statusCode
    ).toBe(429);
    expect(claimRequest).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: "management-write", subject: `member:${reportProject}` })
    );
    expect(request).not.toHaveBeenCalled();
  });
  it("permits a scoped reader to request/read a retained PDF with generation disabled and does not accept authority or model fields", async () => {
    const { app, request, status } = fixture(),
      url = `/v1/organizations/${reportOrg}/reports/${reportRequest}/pdf`;
    const response = await app.inject({ method: "POST", url, headers, payload: {} });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ pdf: queued });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(request).toHaveBeenCalledWith({
      organization_id: reportOrg,
      id: reportRequest,
      initiator: {
        version: 1,
        kind: "member_token",
        user_id: reportProject,
        token_id: reportRequest
      }
    });
    expect((await app.inject({ method: "GET", url, headers })).json()).toEqual({ pdf: queued });
    expect(status).toHaveBeenCalledOnce();
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers,
          payload: { initiator: {}, model: "caller-model" }
        })
      ).statusCode
    ).toBe(400);
    expect(request).toHaveBeenCalledOnce();
  });
  it("serves only bounded PDF bytes with safe attachment headers under current whole-scope access", async () => {
    const { app, status, download } = fixture(),
      url = `/v1/organizations/${reportOrg}/reports/${reportRequest}/pdf/file`;
    status.mockResolvedValueOnce({ ...queued, status: "ready", retry_after_seconds: null });
    const response = await app.inject({ method: "GET", url, headers });
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(body);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="debugbundle-report-${reportRequest}.pdf"`
    );
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(download).toHaveBeenCalledWith(
      expect.objectContaining({
        id: reportRequest,
        initiator: expect.objectContaining({ token_id: reportRequest })
      })
    );
    expect((await app.inject({ method: "GET", url, headers })).statusCode).toBe(409);
    status.mockResolvedValueOnce({ ...queued, status: "ready", retry_after_seconds: null });
    download.mockResolvedValueOnce(Buffer.alloc(5 * 1024 * 1024 + 1));
    expect((await app.inject({ method: "GET", url, headers })).statusCode).toBe(500);
  });
  it("keeps denied/revoked/archive-expiry errors safe and rejects unauthenticated PDF access", async () => {
    const { app, status, request } = fixture(),
      url = `/v1/organizations/${reportOrg}/reports/${reportRequest}/pdf`;
    status.mockRejectedValueOnce(new SmartReportError("report_not_found"));
    expect((await app.inject({ method: "GET", url, headers })).statusCode).toBe(404);
    request.mockRejectedValueOnce(new Error("synthetic private provider body"));
    const failed = await app.inject({ method: "POST", url, headers, payload: {} });
    expect(failed.statusCode).toBe(500);
    expect(failed.body).not.toContain("private provider");
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
  });
});
