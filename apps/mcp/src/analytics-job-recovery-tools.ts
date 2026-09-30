import {
  AnalyticsJobRecoveryApiError,
  AnalyticsJobRecoveryInputSchema,
  type AnalyticsJobRecoveryApi
} from "../../cli/src/analytics-job-recovery-api.js";
import type { AnalyticsSemanticJobRetryResponse } from "../../../packages/shared-types/src/index.js";
import { ANALYTICS_JOB_RECOVERY_MCP_TOOL_CATALOG as catalog } from "./analytics-job-recovery-tool-catalog.js";

export function createAnalyticsJobRecoveryMcpTools(
  api: AnalyticsJobRecoveryApi
): Record<
  "analytics_job_retry",
  (input: Record<string, unknown>) => Promise<AnalyticsSemanticJobRetryResponse>
> {
  return {
    analytics_job_retry: async (input) => {
      if (!catalog[0].inputSchema.safeParse(input).success)
        throw new Error("mcp_tool_error:invalid_input");
      const { bearerToken, ...retry } = input;
      const parsed = AnalyticsJobRecoveryInputSchema.safeParse(retry);
      if (typeof bearerToken !== "string" || !parsed.success)
        throw new Error("mcp_tool_error:invalid_input");
      try {
        return await api.retry({ bearerToken, retry: parsed.data });
      } catch (error) {
        throw new Error(
          `mcp_tool_error:${error instanceof AnalyticsJobRecoveryApiError ? error.message : "analytics_job_recovery_request_failed"}`
        );
      }
    }
  };
}
