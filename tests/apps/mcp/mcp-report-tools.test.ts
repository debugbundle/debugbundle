import { describe, expect, it, vi } from "vitest";
import {
  createReportMcpTools,
  REPORT_MCP_TOOL_CATALOG
} from "../../../apps/mcp/src/report-tools.js";
import { ReportApiError, type ReportApi } from "../../../packages/report-client/src/index.js";
import { mockedObject } from "../../helpers/vitest.js";
import {
  reportDefinitionFixture,
  reportDefinitionInput,
  reportId,
  reportOrg,
  reportRequest
} from "../../helpers/smart-reports.js";
describe("Smart Report MCP definitions", () => {
  it("uses the shared client without permitting caller origin or actor claims", async () => {
    const create = vi.fn().mockResolvedValue(reportDefinitionFixture()),
      tools = createReportMcpTools(mockedObject<ReportApi>({ create }));
    const input = {
      bearerToken: "member",
      organizationId: reportOrg,
      requestId: reportRequest,
      definition: reportDefinitionInput()
    };
    expect(await tools.create_report_definition(input)).toEqual({
      definition: reportDefinitionFixture()
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: reportRequest,
        definition: expect.objectContaining({ source_collection_consent: true })
      })
    );
    await expect(
      tools.create_report_definition({
        ...input,
        definition: { ...input.definition, origin_project_ids: [reportId] }
      })
    ).rejects.toThrow("invalid_report_input");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("preserves version fences and policy refusals, and describes deletion accurately", async () => {
    const remove = vi.fn().mockRejectedValue(new ReportApiError(409, "report_version_conflict")),
      tools = createReportMcpTools(mockedObject<ReportApi>({ remove }));
    await expect(
      tools.delete_report_definition({
        bearerToken: "member",
        organizationId: reportOrg,
        definitionId: reportId,
        expectedVersion: 1
      })
    ).rejects.toThrow("report_version_conflict");
    const deletion = REPORT_MCP_TOOL_CATALOG.find(
      (tool) => tool.name === "delete_report_definition"
    );
    expect(deletion?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false
    });
    expect(
      REPORT_MCP_TOOL_CATALOG.find((tool) => tool.name === "list_report_definitions")?.annotations
        .readOnlyHint
    ).toBe(true);
  });
});

it("offers the same read-only allowance forecast through ordinary MCP", async () => {
  const allowance = vi.fn().mockResolvedValue({ remaining: 33 }),
    tools = createReportMcpTools(mockedObject<ReportApi>({ allowance }));
  expect(
    await tools.get_report_allowance({
      bearerToken: "member",
      organizationId: reportOrg,
      definitionId: reportId
    })
  ).toEqual({ allowance: { remaining: 33 } });
  expect(
    REPORT_MCP_TOOL_CATALOG.find((tool) => tool.name === "get_report_allowance")?.annotations
  ).toMatchObject({ readOnlyHint: true, destructiveHint: false });
  await expect(
    tools.get_report_allowance({
      bearerToken: "member",
      organizationId: reportOrg,
      definitionId: reportId,
      limit: 999
    })
  ).rejects.toThrow("invalid_report_input");
  expect(allowance).toHaveBeenCalledOnce();
});
