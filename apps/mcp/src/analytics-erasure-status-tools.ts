import {
  AnalyticsErasureStatusApiError,
  AnalyticsErasureStatusInputSchema,
  type AnalyticsErasureStatusApi
} from "../../cli/src/analytics-erasure-status-api.js";
import type { AnalyticsSubjectErasureTaskStatus } from "../../../packages/shared-types/src/index.js";
import { ANALYTICS_ERASURE_STATUS_MCP_TOOL_CATALOG as catalog } from "./analytics-erasure-status-tool-catalog.js";

export function createAnalyticsErasureStatusMcpTools(
  api: AnalyticsErasureStatusApi
): Record<
  "analytics_erasure_status",
  (input: Record<string, unknown>) => Promise<AnalyticsSubjectErasureTaskStatus>
> {
  return {
    analytics_erasure_status: async (input) => {
      if (!catalog[0].inputSchema.safeParse(input).success)
        throw new Error("mcp_tool_error:invalid_input");
      const { bearerToken, ...query } = input;
      const parsed = AnalyticsErasureStatusInputSchema.safeParse(query);
      if (typeof bearerToken !== "string" || !parsed.success)
        throw new Error("mcp_tool_error:invalid_input");
      try {
        return await api.read({ bearerToken, query: parsed.data });
      } catch (error) {
        throw new Error(
          `mcp_tool_error:${error instanceof AnalyticsErasureStatusApiError ? error.message : "analytics_erasure_status_request_failed"}`
        );
      }
    }
  };
}
