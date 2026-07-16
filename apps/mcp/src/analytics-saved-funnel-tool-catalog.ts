import {
  AnalyticsSavedFunnelKeySchema,
  AnalyticsSavedFunnelStepsSchema
} from "../../../packages/shared-types/src/index.js";
import { z } from "zod";

const baseSchema = z.object({
  bearerToken: z.string(),
  projectId: z.string()
});

export const ANALYTICS_SAVED_FUNNEL_MCP_TOOL_CATALOG = [
  {
    name: "list_saved_analytics_funnels",
    group: "analytics_saved_funnels",
    description: "List active saved AnalyticsBundle funnel definitions for a project.",
    inputSchema: baseSchema
  },
  {
    name: "create_saved_analytics_funnel",
    group: "analytics_saved_funnels",
    description: "Create a reusable AnalyticsBundle funnel definition for a project.",
    inputSchema: baseSchema.extend({
      funnelKey: AnalyticsSavedFunnelKeySchema,
      displayName: z.string().trim().min(1).max(120),
      steps: AnalyticsSavedFunnelStepsSchema
    })
  },
  {
    name: "update_saved_analytics_funnel",
    group: "analytics_saved_funnels",
    description: "Update the name or ordered steps of a saved AnalyticsBundle funnel.",
    inputSchema: baseSchema
      .extend({
        funnelKey: AnalyticsSavedFunnelKeySchema,
        displayName: z.string().trim().min(1).max(120).optional(),
        steps: AnalyticsSavedFunnelStepsSchema.optional()
      })
      .refine((value) => value.displayName !== undefined || value.steps !== undefined, {
        message: "A displayName or steps update is required."
      })
  },
  {
    name: "archive_saved_analytics_funnel",
    group: "analytics_saved_funnels",
    description: "Archive a saved AnalyticsBundle funnel definition for a project.",
    inputSchema: baseSchema.extend({ funnelKey: AnalyticsSavedFunnelKeySchema })
  }
] as const;
