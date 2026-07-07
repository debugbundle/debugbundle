import { describe, expect, it, vi } from "vitest";

import { AnalyticsMetricsApiError } from "../../../apps/cli/src/analytics-metrics-commands.js";
import {
  ANALYTICS_METRICS_MCP_TOOL_NAMES,
  createAnalyticsMetricsMcpTools
} from "../../../apps/mcp/src/analytics-metrics-tools.js";

describe("mcp analytics metrics tools", () => {
  it("declares analytics metrics tool parity", () => {
    expect(ANALYTICS_METRICS_MCP_TOOL_NAMES).toEqual([
      "get_usage_summary",
      "get_route_metrics",
      "get_device_breakdown",
      "get_referrer_metrics",
      "get_funnel_analysis"
    ]);
  });

  it("returns analytics summary payloads", async () => {
    const summaryFixture = { summary: { sessions: 12 }, breakdowns: {} };
    const getUsageSummary = vi.fn().mockResolvedValue(summaryFixture);
    const tools = createAnalyticsMetricsMcpTools({
      getUsageSummary,
      getRouteMetrics: vi.fn(),
      getDeviceBreakdown: vi.fn(),
      getReferrerMetrics: vi.fn(),
      getFunnelAnalysis: vi.fn()
    });

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

  it("returns detailed analytics metric payloads", async () => {
    const api = {
      getUsageSummary: vi.fn(),
      getRouteMetrics: vi.fn().mockResolvedValue({ routes: [] }),
      getDeviceBreakdown: vi.fn().mockResolvedValue({ device_types: [] }),
      getReferrerMetrics: vi.fn().mockResolvedValue({ referrers: [] }),
      getFunnelAnalysis: vi.fn().mockResolvedValue({ funnel: { funnel_key: "checkout" }, steps: [] })
    };
    const tools = createAnalyticsMetricsMcpTools(api);

    await expect(tools.get_route_metrics({ bearerToken: "token", projectId: "proj_1" })).resolves.toEqual({ routes: [] });
    await expect(tools.get_device_breakdown({ bearerToken: "token", projectId: "proj_1" })).resolves.toEqual({ device_types: [] });
    await expect(tools.get_referrer_metrics({ bearerToken: "token", projectId: "proj_1" })).resolves.toEqual({ referrers: [] });
    await expect(tools.get_funnel_analysis({ bearerToken: "token", projectId: "proj_1", funnelKey: "checkout" })).resolves.toEqual({
      funnel: { funnel_key: "checkout" },
      steps: []
    });

    expect(api.getFunnelAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      bearerToken: "token",
      projectId: "proj_1",
      funnelKey: "checkout"
    }));
  });

  it("maps analytics metrics API and unknown errors to MCP tool errors", async () => {
    const tools = createAnalyticsMetricsMcpTools({
      getUsageSummary: vi.fn().mockRejectedValue(new AnalyticsMetricsApiError(401, "invalid_member_token")),
      getRouteMetrics: vi.fn(),
      getDeviceBreakdown: vi.fn(),
      getReferrerMetrics: vi.fn(),
      getFunnelAnalysis: vi.fn()
    });
    const unknownTools = createAnalyticsMetricsMcpTools({
      getUsageSummary: vi.fn().mockRejectedValue(new Error("boom")),
      getRouteMetrics: vi.fn(),
      getDeviceBreakdown: vi.fn(),
      getReferrerMetrics: vi.fn(),
      getFunnelAnalysis: vi.fn()
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
