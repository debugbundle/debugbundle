import { AnalyticsMetricsApiError } from "../../cli/src/analytics-metrics-commands.js";

export const ANALYTICS_METRICS_MCP_TOOL_NAMES = ["get_usage_summary"] as const;

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
  getUsageSummary(input: {
    bearerToken: string;
    projectId: string;
    from?: string | undefined;
    to?: string | undefined;
    last?: string | undefined;
    granularity?: "hour" | "day" | undefined;
    service?: string | undefined;
    environment?: string | undefined;
    limit?: number | undefined;
  }): Promise<unknown>;
}): Record<(typeof ANALYTICS_METRICS_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async get_usage_summary(input) {
      try {
        return await api.getUsageSummary({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          from: readOptionalString(input, "from"),
          to: readOptionalString(input, "to"),
          last: readOptionalString(input, "last"),
          granularity: readGranularity(input),
          service: readOptionalString(input, "service"),
          environment: readOptionalString(input, "environment"),
          limit: readOptionalNumber(input, "limit")
        });
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}
