import { describe, expect, it, vi } from "vitest";
import {
  createReportPdfMcpTools,
  REPORT_PDF_MCP_TOOL_CATALOG
} from "../../../apps/mcp/src/report-pdf-tools.js";
import type { ReportPdfApi } from "../../../packages/report-client/src/index.js";
import { mockedObject } from "../../helpers/vitest.js";
import { reportOrg, reportRequest } from "../../helpers/smart-reports.js";
const input = { organizationId: reportOrg, runId: reportRequest, bearerToken: "member" };
describe("report PDF MCP", () => {
  it("prepares a cached PDF and returns an authenticated download location without embedding binary content", async () => {
    const request = vi
        .fn()
        .mockResolvedValue({ run_id: reportRequest, status: "queued", retry_after_seconds: 2 }),
      status = vi
        .fn()
        .mockResolvedValue({ run_id: reportRequest, status: "ready", retry_after_seconds: null });
    const tools = createReportPdfMcpTools(mockedObject<ReportPdfApi>({ request, status }), {
      apiBaseUrl: "https://api.example.test"
    });
    expect(await tools.prepare_report_pdf(input)).toEqual({
      pdf: { run_id: reportRequest, status: "queued", retry_after_seconds: 2 },
      download_url: null,
      requires_authentication: true
    });
    const result = await tools.get_report_pdf(input);
    expect(result).toEqual({
      pdf: { run_id: reportRequest, status: "ready", retry_after_seconds: null },
      download_url: `https://api.example.test/v1/organizations/${reportOrg}/reports/${reportRequest}/pdf/file`,
      requires_authentication: true
    });
    expect(JSON.stringify(result)).not.toContain("member");
    expect(request).toHaveBeenCalledWith(input);
  });
  it("keeps model/authority claims outside the tool schema and accurately describes the cache side effect", async () => {
    const request = vi.fn(),
      tools = createReportPdfMcpTools(mockedObject<ReportPdfApi>({ request }), {
        apiBaseUrl: "https://api.example.test"
      });
    await expect(tools.prepare_report_pdf({ ...input, model: "caller-model" })).rejects.toThrow(
      "invalid_report_input"
    );
    expect(request).not.toHaveBeenCalled();
    expect(
      REPORT_PDF_MCP_TOOL_CATALOG.find((tool) => tool.name === "prepare_report_pdf")?.annotations
    ).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    expect(
      REPORT_PDF_MCP_TOOL_CATALOG.find((tool) => tool.name === "get_report_pdf")?.annotations
        .readOnlyHint
    ).toBe(true);
  });
});
