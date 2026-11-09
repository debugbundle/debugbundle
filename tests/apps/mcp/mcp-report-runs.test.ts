import { describe, expect, it, vi } from "vitest";
import {
  createReportRunMcpTools,
  REPORT_RUN_MCP_TOOL_CATALOG
} from "../../../apps/mcp/src/report-run-tools.js";
import { type ReportRunApi, ReportApiError } from "../../../packages/report-client/src/index.js";
import { mockedObject } from "../../helpers/vitest.js";
import { reportDocumentFixture } from "../../helpers/report-document.js";
import {
  reportOrg,
  reportId,
  reportRequest,
  reportRunFixture
} from "../../helpers/smart-reports.js";
describe("report run MCP", () => {
  it("reads canonical content and produces the same private HTML without a generation call", async () => {
    const view = { document: reportDocumentFixture(), available_source_refs: [] },
      content = vi.fn().mockResolvedValue(view),
      tools = createReportRunMcpTools(mockedObject<ReportRunApi>({ content }));
    const input = { bearerToken: "member", organizationId: reportOrg, runId: reportRequest };
    expect(await tools.get_report_content(input)).toEqual(view);
    expect(await tools.get_report_html(input)).toEqual({
      html: expect.stringContaining("<!doctype html>")
    });
    expect(content).toHaveBeenCalledTimes(2);
    expect(
      REPORT_RUN_MCP_TOOL_CATALOG.find((tool) => tool.name === "get_report_content")?.annotations
    ).toMatchObject({ readOnlyHint: true, openWorldHint: false });
  });
  it("forwards fixed user commands and refuses authority or model claims", async () => {
    const generate = vi.fn().mockResolvedValue(reportRunFixture()),
      tools = createReportRunMcpTools(mockedObject<ReportRunApi>({ generate }));
    const input = {
      bearerToken: "member",
      organizationId: reportOrg,
      command: {
        request_id: reportRequest,
        definition_id: reportId,
        expected_version: 1,
        period: reportRunFixture().period
      }
    };
    expect(await tools.generate_report(input)).toEqual({ run: reportRunFixture() });
    expect(generate).toHaveBeenCalledWith({
      ...input,
      command: { ...input.command, send_email: false }
    });
    for (const extra of [{ profile: {} }, { initiator: {} }, { monthly_budget_nano_usd: 9 }])
      await expect(
        tools.generate_report({ ...input, command: { ...input.command, ...extra } })
      ).rejects.toThrow("invalid_report_input");
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("describes external generation and destructive deletion and preserves refusals", async () => {
    const cancel = vi.fn().mockRejectedValue(new ReportApiError(409, "report_run_not_cancellable")),
      tools = createReportRunMcpTools(mockedObject<ReportRunApi>({ cancel }));
    await expect(
      tools.cancel_report({
        bearerToken: "member",
        organizationId: reportOrg,
        runId: reportRequest
      })
    ).rejects.toThrow("report_run_not_cancellable");
    expect(
      REPORT_RUN_MCP_TOOL_CATALOG.find((tool) => tool.name === "generate_report")?.annotations
    ).toMatchObject({ readOnlyHint: false, openWorldHint: true, idempotentHint: true });
    expect(
      REPORT_RUN_MCP_TOOL_CATALOG.find((tool) => tool.name === "delete_report")?.annotations
    ).toMatchObject({ destructiveHint: true, openWorldHint: false });
    expect(
      REPORT_RUN_MCP_TOOL_CATALOG.find((tool) => tool.name === "list_reports")?.annotations
        .readOnlyHint
    ).toBe(true);
  });
});
