import { z } from "zod";
import { AnalyticsErasureStatusInputSchema } from "../../cli/src/analytics-erasure-status-api.js";

export const ANALYTICS_ERASURE_STATUS_MCP_TOOL_CATALOG = [
  {
    name: "analytics_erasure_status",
    group: "analytics_erasure",
    description:
      "Read the payload-free status of one project subject erasure task with current owner/admin access. The default semantic erasure service is disabled.",
    inputSchema: AnalyticsErasureStatusInputSchema.extend({
      bearerToken: z.string().min(1).max(4096)
    }).strict()
  }
] as const;
export const ANALYTICS_ERASURE_STATUS_MCP_TOOL_NAMES =
  ANALYTICS_ERASURE_STATUS_MCP_TOOL_CATALOG.map((tool) => tool.name);
