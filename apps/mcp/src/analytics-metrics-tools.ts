import { AnalyticsMetricsApiError } from "../../cli/src/analytics-metrics-commands.js";

export const ANALYTICS_METRICS_MCP_TOOL_NAMES = [
  "get_usage_summary",
  "get_route_metrics",
  "get_device_breakdown",
  "get_referrer_metrics",
  "get_funnel_analysis"
] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof AnalyticsMetricsApiError) {
    throw new Error(`mcp_tool_error:${error.message}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

function readOptionalString(input: Record<string, unknown>, key: string): string | undefined {
  return typeof input[key] === "string" ? input[key] : undefined;
}

function readOptionalNumber(input: Record<string, unknown>, key: string): number | undefined {
  return typeof input[key] === "number" ? input[key] : undefined;
}

function readGranularity(input: Record<string, unknown>): "hour" | "day" | undefined {
  const value = input["granularity"];
  return value === "hour" || value === "day" ? value : undefined;
}

export function createAnalyticsMetricsMcpTools(api: {
  getUsageSummary(input: AnalyticsMetricsToolInput): Promise<unknown>;
  getRouteMetrics(input: AnalyticsMetricsToolInput): Promise<unknown>;
  getDeviceBreakdown(input: AnalyticsMetricsToolInput): Promise<unknown>;
  getReferrerMetrics(input: AnalyticsMetricsToolInput): Promise<unknown>;
  getFunnelAnalysis(input: AnalyticsMetricsToolInput & { funnelKey: string }): Promise<unknown>;
}): Record<(typeof ANALYTICS_METRICS_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async get_usage_summary(input) {
      try {
        return await api.getUsageSummary(readMetricsInput(input));
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_route_metrics(input) {
      try {
        return await api.getRouteMetrics(readMetricsInput(input));
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_device_breakdown(input) {
      try {
        return await api.getDeviceBreakdown(readMetricsInput(input));
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_referrer_metrics(input) {
      try {
        return await api.getReferrerMetrics(readMetricsInput(input));
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_funnel_analysis(input) {
      try {
        return await api.getFunnelAnalysis({
          ...readMetricsInput(input),
          funnelKey: String(input["funnelKey"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}

type AnalyticsMetricsToolInput = {
    bearerToken: string;
    projectId: string;
    from?: string | undefined;
    to?: string | undefined;
    last?: string | undefined;
    granularity?: "hour" | "day" | undefined;
    service?: string | undefined;
    environment?: string | undefined;
    limit?: number | undefined;
};

function readMetricsInput(input: Record<string, unknown>): AnalyticsMetricsToolInput {
  return {
    bearerToken: String(input["bearerToken"]),
    projectId: String(input["projectId"]),
    from: readOptionalString(input, "from"),
    to: readOptionalString(input, "to"),
    last: readOptionalString(input, "last"),
    granularity: readGranularity(input),
    service: readOptionalString(input, "service"),
    environment: readOptionalString(input, "environment"),
    limit: readOptionalNumber(input, "limit")
  };
}
