import { describe, expect, it, vi } from "vitest";

import { AnalyticsMetricsApiError } from "../../../apps/cli/src/analytics-metrics-commands.js";
import {
  ANALYTICS_METRICS_MCP_TOOL_NAMES,
  createAnalyticsMetricsMcpTools
} from "../../../apps/mcp/src/analytics-metrics-tools.js";

describe("mcp analytics metrics tools", () => {
  it("declares analytics metrics tool parity", () => {
    expect(ANALYTICS_METRICS_MCP_TOOL_NAMES).toEqual(["get_usage_summary"]);
  });

  it("returns analytics summary payloads", async () => {
    const summaryFixture = { summary: { sessions: 12 }, breakdowns: {} };
    const getUsageSummary = vi.fn().mockResolvedValue(summaryFixture);
    const tools = createAnalyticsMetricsMcpTools({ getUsageSummary });

    await expect(
      tools.get_usage_summary({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-08T00:00:00.000Z",
        granularity: "day"
      })
    ).resolves.toEqual(summaryFixture);

    expect(getUsageSummary).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-08T00:00:00.000Z",
      granularity: "day",
      service: undefined,
      environment: undefined,
      last: undefined,
      limit: undefined
    });
  });

  it("maps analytics metrics API and unknown errors to MCP tool errors", async () => {
    const tools = createAnalyticsMetricsMcpTools({
      getUsageSummary: vi.fn().mockRejectedValue(new AnalyticsMetricsApiError(401, "invalid_member_token"))
    });
    const unknownTools = createAnalyticsMetricsMcpTools({
      getUsageSummary: vi.fn().mockRejectedValue(new Error("boom"))
    });

    await expect(
      tools.get_usage_summary({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).rejects.toThrow("mcp_tool_error:invalid_member_token");
    await expect(
      unknownTools.get_usage_summary({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).rejects.toThrow("mcp_tool_error:unknown_error");
  });
});
