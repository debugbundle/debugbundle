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
      "get_journey_patterns",
      "list_analytics_journey_samples",
      "get_analytics_journey_sample",
      "get_device_breakdown",
      "get_referrer_metrics",
      "get_action_metrics",
      "list_funnel_metrics",
      "get_funnel_analysis",
      "get_incident_impact",
      "list_analytics_opportunities",
      "get_analytics_opportunity",
      "list_analytics_bundles",
      "generate_analytics_bundle",
      "get_analytics_bundle"
    ]);
  });

  it("returns analytics summary payloads", async () => {
    const summaryFixture = { summary: { sessions: 12 }, breakdowns: {} };
    const getUsageSummary = vi.fn().mockResolvedValue(summaryFixture);
    const tools = createAnalyticsMetricsMcpTools({
      getUsageSummary,
      getRouteMetrics: vi.fn(),
      getJourneyPatterns: vi.fn(),
      listJourneySamples: vi.fn(),
      getJourneySample: vi.fn(),
      getDeviceBreakdown: vi.fn(),
      getReferrerMetrics: vi.fn(),
      getActionMetrics: vi.fn(),
      listFunnels: vi.fn(),
      getFunnelAnalysis: vi.fn(),
      getIncidentImpact: vi.fn(),
      listOpportunities: vi.fn(),
      getOpportunity: vi.fn(),
      listBundles: vi.fn(),
      createBundle: vi.fn(),
      getBundle: vi.fn()
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
      getJourneyPatterns: vi.fn().mockResolvedValue({ patterns: [] }),
      listJourneySamples: vi.fn().mockResolvedValue({ samples: [], next_cursor: null }),
      getJourneySample: vi.fn().mockResolvedValue({ sample: { sample_id: "sample_1" }, journey: {} }),
      getDeviceBreakdown: vi.fn().mockResolvedValue({ device_types: [] }),
      getReferrerMetrics: vi.fn().mockResolvedValue({ referrers: [] }),
      getActionMetrics: vi.fn().mockResolvedValue({ actions: [] }),
      listFunnels: vi.fn().mockResolvedValue({ funnels: [] }),
      getFunnelAnalysis: vi.fn().mockResolvedValue({ funnel: { funnel_key: "checkout" }, steps: [] }),
      getIncidentImpact: vi.fn().mockResolvedValue({ incident_id: "incident_1", affected_sessions: 2 }),
      listOpportunities: vi.fn().mockResolvedValue({ opportunities: [], next_cursor: null }),
      getOpportunity: vi.fn().mockResolvedValue({ opportunity: { opportunity_id: "opp_1" } }),
      listBundles: vi.fn().mockResolvedValue({ bundles: [], next_cursor: null }),
      createBundle: vi.fn().mockResolvedValue({ status: "pending", bundle_generation_id: "gen_1" }),
      getBundle: vi.fn().mockResolvedValue({ status: "pending", bundle_generation_id: "gen_1" })
    };
    const tools = createAnalyticsMetricsMcpTools(api);

    await expect(tools.get_route_metrics({ bearerToken: "token", projectId: "proj_1" })).resolves.toEqual({ routes: [] });
    await expect(tools.get_journey_patterns({ bearerToken: "token", projectId: "proj_1" })).resolves.toEqual({ patterns: [] });
    await expect(
      tools.list_analytics_journey_samples({
        bearerToken: "token",
        projectId: "proj_1",
        service: "web",
        environment: "production",
        tag: "checkout",
        cursor: "cursor-1",
        limit: 5
      })
    ).resolves.toEqual({ samples: [], next_cursor: null });
    await expect(
      tools.get_analytics_journey_sample({
        bearerToken: "token",
        projectId: "proj_1",
        sampleId: "sample_1"
      })
    ).resolves.toEqual({ sample: { sample_id: "sample_1" }, journey: {} });
    await expect(tools.get_device_breakdown({ bearerToken: "token", projectId: "proj_1" })).resolves.toEqual({ device_types: [] });
    await expect(tools.get_referrer_metrics({ bearerToken: "token", projectId: "proj_1" })).resolves.toEqual({ referrers: [] });
    await expect(tools.get_action_metrics({ bearerToken: "token", projectId: "proj_1" })).resolves.toEqual({ actions: [] });
    await expect(tools.list_funnel_metrics({ bearerToken: "token", projectId: "proj_1" })).resolves.toEqual({ funnels: [] });
    await expect(tools.get_funnel_analysis({ bearerToken: "token", projectId: "proj_1", funnelKey: "checkout" })).resolves.toEqual({
      funnel: { funnel_key: "checkout" },
      steps: []
    });
    await expect(tools.get_incident_impact({ bearerToken: "token", projectId: "proj_1", incidentId: "incident_1" })).resolves.toEqual({
      incident_id: "incident_1",
      affected_sessions: 2
    });
    await expect(
      tools.list_analytics_opportunities({
        bearerToken: "token",
        projectId: "proj_1",
        status: "all",
        kind: "funnel_dropoff",
        cursor: "cursor-1",
        limit: 5
      })
    ).resolves.toEqual({ opportunities: [], next_cursor: null });
    await expect(
      tools.list_analytics_opportunities({ bearerToken: "token", status: "all" })
    ).resolves.toEqual({ opportunities: [], next_cursor: null });
    await expect(
      tools.get_analytics_opportunity({
        bearerToken: "token",
        projectId: "proj_1",
        opportunityId: "opp_1"
      })
    ).resolves.toEqual({ opportunity: { opportunity_id: "opp_1" } });
    await expect(
      tools.list_analytics_bundles({
        bearerToken: "token",
        projectId: "proj_1",
        status: "completed",
        kind: "usage_summary",
        cursor: "cursor-1",
        limit: 5
      })
    ).resolves.toEqual({ bundles: [], next_cursor: null });
    await expect(
      tools.list_analytics_bundles({ bearerToken: "token", status: "completed" })
    ).resolves.toEqual({ bundles: [], next_cursor: null });
    await expect(
      tools.generate_analytics_bundle({
        bearerToken: "token",
        projectId: "proj_1",
        analysisKind: "funnel_dropoff",
        last: "7d",
        funnel: "checkout",
        filters: { auth_state: "logged_in" }
      })
    ).resolves.toEqual({ status: "pending", bundle_generation_id: "gen_1" });
    await expect(
      tools.generate_analytics_bundle({
        bearerToken: "token",
        projectId: "proj_1",
        analysisKind: "usage_summary",
        last: "7d"
      })
    ).resolves.toEqual({ status: "pending", bundle_generation_id: "gen_1" });
    await expect(
      tools.get_analytics_bundle({
        bearerToken: "token",
        projectId: "proj_1",
        bundleGenerationId: "gen_1"
      })
    ).resolves.toEqual({ status: "pending", bundle_generation_id: "gen_1" });

    expect(api.getFunnelAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      bearerToken: "token",
      projectId: "proj_1",
      funnelKey: "checkout"
    }));
    expect(api.getIncidentImpact).toHaveBeenCalledWith(expect.objectContaining({
      bearerToken: "token",
      projectId: "proj_1",
      incidentId: "incident_1"
    }));
    expect(api.listFunnels).toHaveBeenCalledWith(expect.objectContaining({
      bearerToken: "token",
      projectId: "proj_1"
    }));
    expect(api.getActionMetrics).toHaveBeenCalledWith(expect.objectContaining({
      bearerToken: "token",
      projectId: "proj_1"
    }));
    expect(api.getJourneyPatterns).toHaveBeenCalledWith(expect.objectContaining({
      bearerToken: "token",
      projectId: "proj_1"
    }));
    expect(api.listJourneySamples).toHaveBeenCalledWith({
      bearerToken: "token",
      projectId: "proj_1",
      service: "web",
      environment: "production",
      tag: "checkout",
      cursor: "cursor-1",
      limit: 5
    });
    expect(api.getJourneySample).toHaveBeenCalledWith({
      bearerToken: "token",
      projectId: "proj_1",
      sampleId: "sample_1"
    });
    expect(api.listOpportunities).toHaveBeenCalledWith({
      bearerToken: "token",
      projectId: "proj_1",
      status: "all",
      kind: "funnel_dropoff",
      cursor: "cursor-1",
      limit: 5
    });
    expect(api.listOpportunities).toHaveBeenCalledWith({
      bearerToken: "token",
      projectId: undefined,
      status: "all",
      kind: undefined,
      cursor: undefined,
      limit: undefined
    });
    expect(api.getOpportunity).toHaveBeenCalledWith({
      bearerToken: "token",
      projectId: "proj_1",
      opportunityId: "opp_1"
    });
    expect(api.listBundles).toHaveBeenCalledWith({
      bearerToken: "token",
      projectId: "proj_1",
      status: "completed",
      kind: "usage_summary",
      cursor: "cursor-1",
      limit: 5
    });
    expect(api.listBundles).toHaveBeenCalledWith({
      bearerToken: "token",
      projectId: undefined,
      status: "completed",
      kind: undefined,
      cursor: undefined,
      limit: undefined
    });
    expect(api.createBundle).toHaveBeenNthCalledWith(1, {
      bearerToken: "token",
      projectId: "proj_1",
      analysisKind: "funnel_dropoff",
      from: undefined,
      to: undefined,
      last: "7d",
      funnel: "checkout",
      route: undefined,
      incidentId: undefined,
      deployId: undefined,
      filters: { auth_state: "logged_in" }
    });
    expect(api.createBundle).toHaveBeenNthCalledWith(2, {
      bearerToken: "token",
      projectId: "proj_1",
      analysisKind: "usage_summary",
      from: undefined,
      to: undefined,
      last: "7d",
      funnel: undefined,
      route: undefined,
      incidentId: undefined,
      deployId: undefined,
      filters: undefined
    });
    expect(api.getBundle).toHaveBeenCalledWith({
      bearerToken: "token",
      projectId: "proj_1",
      bundleGenerationId: "gen_1"
    });
  });

  it("maps analytics metrics API and unknown errors to MCP tool errors", async () => {
    const tools = createAnalyticsMetricsMcpTools({
      getUsageSummary: vi.fn().mockRejectedValue(new AnalyticsMetricsApiError(401, "invalid_member_token")),
      getRouteMetrics: vi.fn(),
      getJourneyPatterns: vi.fn(),
      listJourneySamples: vi.fn(),
      getJourneySample: vi.fn(),
      getDeviceBreakdown: vi.fn(),
      getReferrerMetrics: vi.fn(),
      getActionMetrics: vi.fn(),
      listFunnels: vi.fn(),
      getFunnelAnalysis: vi.fn(),
      getIncidentImpact: vi.fn(),
      listOpportunities: vi.fn(),
      getOpportunity: vi.fn(),
      listBundles: vi.fn(),
      createBundle: vi.fn(),
      getBundle: vi.fn()
    });
    const unknownTools = createAnalyticsMetricsMcpTools({
      getUsageSummary: vi.fn().mockRejectedValue(new Error("boom")),
      getRouteMetrics: vi.fn(),
      getJourneyPatterns: vi.fn(),
      listJourneySamples: vi.fn(),
      getJourneySample: vi.fn(),
      getDeviceBreakdown: vi.fn(),
      getReferrerMetrics: vi.fn(),
      getActionMetrics: vi.fn(),
      listFunnels: vi.fn(),
      getFunnelAnalysis: vi.fn(),
      getIncidentImpact: vi.fn(),
      listOpportunities: vi.fn(),
      getOpportunity: vi.fn(),
      listBundles: vi.fn(),
      createBundle: vi.fn(),
      getBundle: vi.fn()
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
