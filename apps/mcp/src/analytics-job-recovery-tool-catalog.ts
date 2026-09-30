import { z } from "zod";
import { AnalyticsJobRecoveryInputSchema } from "../../cli/src/analytics-job-recovery-api.js";

export const ANALYTICS_JOB_RECOVERY_MCP_TOOL_CATALOG = [
  {
    name: "analytics_job_retry",
    group: "analytics_job_recovery",
    description:
      "Requeue one failed semantic event under current project owner/admin access while its exact accepted raw receipt is retained. Does not claim projection success. The default semantic recovery service is disabled.",
    inputSchema: AnalyticsJobRecoveryInputSchema.extend({
      bearerToken: z.string().min(1).max(4096)
    }).strict()
  }
] as const;
export const ANALYTICS_JOB_RECOVERY_MCP_TOOL_NAMES = ANALYTICS_JOB_RECOVERY_MCP_TOOL_CATALOG.map(
  (tool) => tool.name
);
