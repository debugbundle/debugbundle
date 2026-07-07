import { z } from "zod";

export const ANALYTICS_SETTINGS_MCP_TOOL_CATALOG = [
  {
    name: "get_analytics_settings",
    group: "analytics_settings",
    description: "Get AnalyticsBundle settings for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string()
    })
  },
  {
    name: "update_analytics_settings",
    group: "analytics_settings",
    description: "Update AnalyticsBundle settings for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      update: z.object({
        enabled: z.boolean().optional(),
        privacy_mode: z.enum(["strict", "standard", "custom"]).optional(),
        consent_required: z.boolean().optional(),
        capture_page_views: z.boolean().optional(),
        capture_route_changes: z.boolean().optional(),
        capture_actions: z.boolean().optional(),
        capture_friction_signals: z.boolean().optional(),
        journey_sample_rate: z.number().min(0).max(1).optional(),
        raw_retention_days: z.number().int().min(1).max(30).optional(),
        sample_retention_days: z.number().int().min(1).max(365).optional(),
        aggregate_retention_months: z.number().int().min(1).max(120).optional(),
        max_saved_funnels: z.number().int().min(0).max(100).optional(),
        max_custom_dimensions: z.number().int().min(0).max(20).optional(),
        approved_custom_dimensions: z.array(z.string()).max(20).optional()
      })
    })
  }
] as const;
