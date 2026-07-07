import { z } from "zod";

export const ANALYTICS_METRICS_MCP_TOOL_CATALOG = [
  {
    name: "get_usage_summary",
    group: "analytics_metrics",
    description: "Get aggregate AnalyticsBundle usage summary metrics for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      from: z.string().optional(),
      to: z.string().optional(),
      last: z.string().optional(),
      granularity: z.enum(["hour", "day"]).optional(),
      service: z.string().optional(),
      environment: z.string().optional(),
      limit: z.number().optional()
    })
  }
] as const;
