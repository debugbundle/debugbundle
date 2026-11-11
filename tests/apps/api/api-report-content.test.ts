import { describe, expect, it, vi } from "vitest";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { SmartReportError } from "../../../packages/smart-reports/src/report-errors.js";
import { createTokenApiServer } from "../../helpers/api-tokens.js";
import { mockedObject } from "../../helpers/vitest.js";
import { reportDocumentFixture } from "../../helpers/report-document.js";
import { reportOrg, reportProject, reportRequest } from "../../helpers/smart-reports.js";
const headers = { authorization: "Bearer dbundle_mem_report" };
function fixture() {
  const view = vi
      .fn()
      .mockResolvedValue({ document: reportDocumentFixture(), available_source_refs: [] }),
    source = vi.fn().mockResolvedValue(null);
  const app = createTokenApiServer({
    reportGenerationEnabled: false,
    reportDashboardBaseUrl: "https://console.example.test",
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
    reportContent: { read: vi.fn(), view, source }
  });
  return { app, view, source };
}
describe("authenticated report output", () => {
  it("negotiates intended factual success while retaining the exact legacy document shape", async () => {
    const { app, view } = fixture();
    const document = {
      ...reportDocumentFixture(),
      version: 2,
      analysis: { status: "not_requested", reason: null, model: null, request_sha256: null }
    };
    view.mockResolvedValue({ document, available_source_refs: [] });
    const path = `/v1/organizations/${reportOrg}/reports/${reportRequest}/document`;
    const legacy = await app.inject({ method: "GET", url: path, headers });
    expect(legacy.statusCode).toBe(200);
    expect(legacy.json().document).toEqual(reportDocumentFixture());
    const current = await app.inject({ method: "GET", url: `${path}?version=2`, headers });
    expect(current.statusCode).toBe(200);
    expect(current.json().document).toEqual(document);
    expect(
      (await app.inject({ method: "GET", url: `${path}?version=3`, headers })).statusCode
    ).toBe(400);
    await app.close();
  });
  it("uses current actual reader scope with generation disabled and returns only the closed canonical view", async () => {
    const { app, view } = fixture();
    const response = await app.inject({
      method: "GET",
      url: `/v1/organizations/${reportOrg}/reports/${reportRequest}/document`,
      headers
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      document: reportDocumentFixture(),
      available_source_refs: []
    });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(view).toHaveBeenCalledWith({
      organization_id: reportOrg,
      id: reportRequest,
      initiator: {
        version: 1,
        kind: "member_token",
        user_id: reportProject,
        token_id: reportRequest
      }
    });
    view.mockResolvedValueOnce({
      document: reportDocumentFixture(),
      available_source_refs: [],
      private_model_payload: "secret"
    });
    const failed = await app.inject({
      method: "GET",
      url: `/v1/organizations/${reportOrg}/reports/${reportRequest}/document`,
      headers
    });
    expect(failed.statusCode).toBe(500);
    expect(failed.body).not.toContain("secret");
  });
  it("serves escaped static HTML under a restrictive content security policy", async () => {
    const { app, view } = fixture(),
      document = reportDocumentFixture();
    document.name = "<script>bad</script>";
    view.mockResolvedValueOnce({ document, available_source_refs: [] });
    const response = await app.inject({
      method: "GET",
      url: `/v1/organizations/${reportOrg}/reports/${reportRequest}/html`,
      headers
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(response.body).toContain("&lt;script&gt;");
    expect(response.body).not.toContain("<script>");
  });
  it("keeps expired source links authenticated, safe and explicitly unavailable", async () => {
    const { app, source, view } = fixture(),
      url = `/v1/organizations/${reportOrg}/reports/${reportRequest}/sources/s1`;
    expect((await app.inject({ method: "GET", url, headers })).json()).toEqual({
      error: "report_source_unavailable"
    });
    source.mockResolvedValueOnce(`/projects/${reportProject}/incidents/${reportRequest}`);
    const redirect = await app.inject({ method: "GET", url, headers });
    expect(redirect.statusCode).toBe(303);
    expect(redirect.headers.location).toBe(
      `https://console.example.test/projects/${reportProject}/incidents/${reportRequest}`
    );
    source.mockResolvedValueOnce(`/projects/${reportProject}/health`);
    const recovery = await app.inject({ method: "GET", url, headers });
    expect(recovery.statusCode).toBe(303);
    expect(recovery.headers.location).toBe(
      `https://console.example.test/projects/${reportProject}/health`
    );
    source.mockResolvedValueOnce("https://untrusted.example.test");
    expect((await app.inject({ method: "GET", url, headers })).statusCode).toBe(500);
    view.mockRejectedValueOnce(new SmartReportError("report_not_found"));
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/v1/organizations/${reportOrg}/reports/${reportRequest}/html`,
          headers
        })
      ).statusCode
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/v1/organizations/${reportOrg}/reports/${reportRequest}/document`
        })
      ).statusCode
    ).toBe(401);
  });
});
