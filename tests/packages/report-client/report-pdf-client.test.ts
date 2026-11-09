import { expect, it, vi } from "vitest";
import {
  createReportPdfApi,
  reportPdfDownloadPath
} from "../../../packages/report-client/src/pdf-api.js";
import { reportOrg, reportRequest } from "../../helpers/smart-reports.js";
const scope = { organizationId: reportOrg, runId: reportRequest, bearerToken: "member" };
const pdf = { run_id: reportRequest, status: "queued", retry_after_seconds: 2 };
const body = new TextEncoder().encode("%PDF-1.7\nfixture\n%%EOF\n");
it("shares authenticated status/preparation without model or generation options", async () => {
  const request = vi.fn().mockResolvedValue({ status: 202, body: { pdf } }),
    api = createReportPdfApi({ request });
  expect(await api.request({ ...scope, expectedOrganizationId: reportOrg })).toEqual(pdf);
  expect(request).toHaveBeenCalledWith({
    method: "POST",
    path: `/v1/organizations/${reportOrg}/reports/${reportRequest}/pdf`,
    bearerToken: "member",
    body: { expected_organization_id: reportOrg }
  });
  expect(await api.status(scope)).toEqual(pdf);
  expect(request).toHaveBeenLastCalledWith({
    method: "GET",
    path: `/v1/organizations/${reportOrg}/reports/${reportRequest}/pdf`,
    bearerToken: "member"
  });
  expect(reportPdfDownloadPath(scope)).toBe(
    `/v1/organizations/${reportOrg}/reports/${reportRequest}/pdf/file`
  );
});
it("keeps downloads bounded and accepts only PDF bytes from the dedicated binary transport", async () => {
  const requestBinary = vi
      .fn()
      .mockResolvedValue({ status: 200, body, contentType: "application/pdf" }),
    api = createReportPdfApi({ request: vi.fn(), requestBinary });
  expect(await api.download(scope)).toEqual(body);
  expect(requestBinary).toHaveBeenCalledWith({
    method: "GET",
    path: reportPdfDownloadPath(scope),
    bearerToken: "member",
    maxBytes: 5 * 1024 * 1024
  });
  requestBinary.mockResolvedValueOnce({ status: 200, body, contentType: "text/html" });
  await expect(api.download(scope)).rejects.toThrow("invalid_report_pdf_response");
  requestBinary.mockResolvedValueOnce({
    status: 200,
    body: new Uint8Array(5 * 1024 * 1024 + 1),
    contentType: "application/pdf"
  });
  await expect(api.download(scope)).rejects.toThrow("invalid_report_pdf_response");
  requestBinary.mockResolvedValueOnce({
    status: 409,
    body: new TextEncoder().encode('{"error":"report_pdf_not_ready"}'),
    contentType: "application/json"
  });
  await expect(api.download(scope)).rejects.toThrow("report_pdf_not_ready");
});
it("refuses unsafe identities, expanded private responses and unsupported binary transport", async () => {
  const request = vi
      .fn()
      .mockResolvedValue({ status: 200, body: { pdf: { ...pdf, object_key: "private-key" } } }),
    api = createReportPdfApi({ request });
  await expect(api.status(scope)).rejects.toThrow("invalid_response");
  await expect(api.status({ ...scope, runId: "../private" })).rejects.toThrow(
    "invalid_resource_id"
  );
  expect(request).toHaveBeenCalledOnce();
  await expect(api.download(scope)).rejects.toThrow("report_pdf_transport_unavailable");
});
