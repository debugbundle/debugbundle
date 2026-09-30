import {
  AnalyticsReportApiError,
  AnalyticsReportRequestSchema,
  type AnalyticsReportApi,
  type AnalyticsReportResponse
} from "../../cli/src/analytics-report-api.js";
import { ANALYTICS_REPORT_MCP_TOOL_CATALOG as catalog } from "./analytics-report-tool-catalog.js";

export function createAnalyticsReportMcpTools(
  api: AnalyticsReportApi
): Record<
  "analytics_report_query",
  (input: Record<string, unknown>) => Promise<AnalyticsReportResponse>
> {
  return {
    analytics_report_query: async (input: Record<string, unknown>) => {
      if (!catalog[0].inputSchema.safeParse(input).success)
        throw new Error("mcp_tool_error:invalid_input");
      const { bearerToken, ...query } = input;
      const parsed = AnalyticsReportRequestSchema.safeParse(query);
      if (typeof bearerToken !== "string" || !parsed.success)
        throw new Error("mcp_tool_error:invalid_input");
      try {
        return await api.execute({ bearerToken, query: parsed.data });
      } catch (error) {
        throw new Error(
          `mcp_tool_error:${
            error instanceof AnalyticsReportApiError
              ? error.message
              : "analytics_report_request_failed"
          }`
        );
      }
    }
  };
}
