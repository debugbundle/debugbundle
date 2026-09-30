import { expect, it, vi } from "vitest";
import {
  AnalyticsReportApiError,
  type AnalyticsReportApi
} from "../../../apps/cli/src/analytics-report-api.js";
import { ANALYTICS_REPORT_MCP_TOOL_CATALOG } from "../../../apps/mcp/src/analytics-report-tool-catalog.js";
import { createAnalyticsReportMcpTools } from "../../../apps/mcp/src/analytics-report-tools.js";
import { MCP_TOOL_CATALOG } from "../../../apps/mcp/src/tool-catalog.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const query = {
  projectId,
  reportKey: "signup_funnel",
  from: "2026-09-28T00:00:00.000Z",
  to: "2026-09-29T00:00:00.000Z"
};

it("registers a strict project report tool using the shared CLI API", async () => {
  expect(MCP_TOOL_CATALOG.some((tool) => tool.name === "analytics_report_query")).toBe(true);
  expect(
    ANALYTICS_REPORT_MCP_TOOL_CATALOG[0].inputSchema.safeParse({
      ...query,
      bearerToken: "member"
    }).success
  ).toBe(true);
  const execute = vi.fn<AnalyticsReportApi["execute"]>().mockResolvedValue({
    kind: "report",
    report: { status: "unavailable", reason: "insufficient_history" },
    evidence: {
      pending_events: "0",
      failed_events: "0",
      lost_events: "0",
      excluded_events: "0",
      erasure_tasks: "0",
      source_coverage: "unverified"
    }
  });
  const tool = createAnalyticsReportMcpTools({ execute }).analytics_report_query;
  expect(await tool({ ...query, bearerToken: "member" })).toMatchObject({ kind: "report" });
  expect(execute).toHaveBeenCalledWith({ bearerToken: "member", query });
  const recent = { projectId, reportKey: query.reportKey, last: "30d" };
  expect(await tool({ ...recent, bearerToken: "member" })).toMatchObject({ kind: "report" });
  expect(execute).toHaveBeenCalledWith({ bearerToken: "member", query: recent });
  await expect(tool({ ...recent, from: query.from, bearerToken: "member" })).rejects.toThrow(
    "mcp_tool_error:invalid_input"
  );
  await expect(tool({ ...query, bearerToken: "member", raw: "secret" })).rejects.toThrow(
    "mcp_tool_error:invalid_input"
  );
  await expect(tool({ ...query, bearerToken: "member", to: query.from })).rejects.toThrow(
    "mcp_tool_error:invalid_input"
  );
  execute.mockRejectedValueOnce(new AnalyticsReportApiError(403, "forbidden"));
  await expect(tool({ ...query, bearerToken: "member" })).rejects.toThrow(
    "mcp_tool_error:forbidden"
  );
  execute.mockRejectedValueOnce(new Error("untrusted customer.secret"));
  await expect(tool({ ...query, bearerToken: "member" })).rejects.toThrow(
    "mcp_tool_error:analytics_report_request_failed"
  );
});
