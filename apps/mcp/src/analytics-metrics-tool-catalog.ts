import { z } from "zod";

import { AnalyticsBundleAnalysisKindSchema } from "../../../packages/shared-types/src/index.js";

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
  },
  {
    name: "get_route_metrics",
    group: "analytics_metrics",
    description: "Get aggregate AnalyticsBundle route metrics for a project.",
    inputSchema: analyticsMetricsInputSchema()
  },
  {
    name: "get_journey_patterns",
    group: "analytics_metrics",
    description: "Get aggregate AnalyticsBundle journey transition patterns for a project.",
    inputSchema: analyticsMetricsInputSchema()
  },
  {
    name: "list_analytics_journey_samples",
    group: "analytics_metrics",
    description: "List retained redacted AnalyticsBundle journey sample metadata for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      service: z.string().optional(),
      environment: z.string().optional(),
      tag: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().optional()
    })
  },
  {
    name: "get_analytics_journey_sample",
    group: "analytics_metrics",
    description: "Get one retained redacted AnalyticsBundle journey sample artifact for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      sampleId: z.string()
    })
  },
  {
    name: "get_device_breakdown",
    group: "analytics_metrics",
    description: "Get aggregate AnalyticsBundle device, browser, OS, and language breakdowns.",
    inputSchema: analyticsMetricsInputSchema()
  },
  {
    name: "get_referrer_metrics",
    group: "analytics_metrics",
    description: "Get aggregate AnalyticsBundle referrer and UTM metrics.",
    inputSchema: analyticsMetricsInputSchema()
  },
  {
    name: "get_action_metrics",
    group: "analytics_metrics",
    description: "Get aggregate AnalyticsBundle action, marker, and conversion metrics.",
    inputSchema: analyticsMetricsInputSchema()
  },
  {
    name: "list_funnel_metrics",
    group: "analytics_metrics",
    description: "List aggregate AnalyticsBundle funnel conversion summaries for a project.",
    inputSchema: analyticsMetricsInputSchema()
  },
  {
    name: "get_funnel_analysis",
    group: "analytics_metrics",
    description: "Get aggregate AnalyticsBundle funnel conversion and dropoff analysis.",
    inputSchema: analyticsMetricsInputSchema().extend({
      funnelKey: z.string()
    })
  },
  {
    name: "list_analytics_opportunities",
    group: "analytics_metrics",
    description: "List AnalyticsBundle opportunities for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      status: z.enum(["open", "resolved", "snoozed", "all"]).optional(),
      kind: AnalyticsBundleAnalysisKindSchema.optional(),
      cursor: z.string().optional(),
      limit: z.number().optional()
    })
  },
  {
    name: "get_analytics_opportunity",
    group: "analytics_metrics",
    description: "Get an AnalyticsBundle opportunity for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      opportunityId: z.string()
    })
  },
  {
    name: "list_analytics_bundles",
    group: "analytics_metrics",
    description: "List AnalyticsBundle generation records for a project, including pending, completed, and failed states.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      status: z.enum(["all", "pending", "running", "completed", "failed"]).optional(),
      kind: AnalyticsBundleAnalysisKindSchema.optional(),
      cursor: z.string().optional(),
      limit: z.number().optional()
    })
  },
  {
    name: "generate_analytics_bundle",
    group: "analytics_metrics",
    description: "Request an AnalyticsBundle generation for a project analysis window and focus.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      analysisKind: AnalyticsBundleAnalysisKindSchema,
      from: z.string().optional(),
      to: z.string().optional(),
      last: z.string().optional(),
      funnel: z.string().optional(),
      route: z.string().optional(),
      incidentId: z.string().optional(),
      deployId: z.string().optional(),
      filters: z.record(z.string(), z.unknown()).optional()
    })
  },
  {
    name: "get_analytics_bundle",
    group: "analytics_metrics",
    description: "Get a generated AnalyticsBundle artifact or its pending/failed generation state.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      bundleGenerationId: z.string()
    })
  }
] as const;

function analyticsMetricsInputSchema(): z.ZodObject<{
  bearerToken: z.ZodString;
  projectId: z.ZodString;
  from: z.ZodOptional<z.ZodString>;
  to: z.ZodOptional<z.ZodString>;
  last: z.ZodOptional<z.ZodString>;
  granularity: z.ZodOptional<z.ZodEnum<["hour", "day"]>>;
  service: z.ZodOptional<z.ZodString>;
  environment: z.ZodOptional<z.ZodString>;
  limit: z.ZodOptional<z.ZodNumber>;
}> {
  return z.object({
    bearerToken: z.string(),
    projectId: z.string(),
    from: z.string().optional(),
    to: z.string().optional(),
    last: z.string().optional(),
    granularity: z.enum(["hour", "day"]).optional(),
    service: z.string().optional(),
    environment: z.string().optional(),
    limit: z.number().optional()
  });
}
