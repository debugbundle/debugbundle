import { z } from "zod";

import {
  AnalyticsDeviceBreakdownResponseSchema,
  AnalyticsFunnelAnalysisResponseSchema,
  AnalyticsJourneyPatternsResponseSchema,
  AnalyticsReferrerMetricsResponseSchema,
  AnalyticsRouteMetricsResponseSchema,
  AnalyticsUsageSummaryResponseSchema
} from "../../../packages/shared-types/src/index.js";

type SecurityRequirement = Record<string, []>;

type SchemaComponent = {
  name: string;
  schema: unknown;
};

type ResponseSpec = {
  description: string;
  schema?: SchemaComponent;
};

type OperationSpec = {
  method: "get";
  path: string;
  operationId: string;
  summary: string;
  tags: string[];
  security?: SecurityRequirement[];
  params?: unknown;
  query?: unknown;
  responses: Record<string, ResponseSpec>;
};

const AnalyticsSummaryQuerySchema = z
  .object({
    project_id: z.string().uuid(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    last: z.string().optional(),
    granularity: z.enum(["hour", "day"]).optional(),
    service: z.string().optional(),
    environment: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional()
  })
  .strict();

const AnalyticsFunnelParamsSchema = z.object({ key: z.string().min(1).max(120) }).strict();

function component(name: string, schema: unknown): SchemaComponent {
  return { name, schema };
}

export function createAnalyticsMetricOpenApiOperations(options: {
  apiError: SchemaComponent;
  anyMemberAuth: SecurityRequirement[];
}): OperationSpec[] {
  const analyticsUsageSummaryResponse = component("AnalyticsUsageSummaryResponse", AnalyticsUsageSummaryResponseSchema);
  const analyticsRouteMetricsResponse = component("AnalyticsRouteMetricsResponse", AnalyticsRouteMetricsResponseSchema);
  const analyticsJourneyPatternsResponse = component(
    "AnalyticsJourneyPatternsResponse",
    AnalyticsJourneyPatternsResponseSchema
  );
  const analyticsDeviceBreakdownResponse = component(
    "AnalyticsDeviceBreakdownResponse",
    AnalyticsDeviceBreakdownResponseSchema
  );
  const analyticsReferrerMetricsResponse = component(
    "AnalyticsReferrerMetricsResponse",
    AnalyticsReferrerMetricsResponseSchema
  );
  const analyticsFunnelAnalysisResponse = component(
    "AnalyticsFunnelAnalysisResponse",
    AnalyticsFunnelAnalysisResponseSchema
  );
  const responses = {
    "400": { description: "Invalid query parameters.", schema: options.apiError },
    "401": { description: "Authentication is invalid.", schema: options.apiError },
    "403": { description: "An eligible tier is required.", schema: options.apiError },
    "404": { description: "Project was not found or analytics metrics are unavailable.", schema: options.apiError }
  };

  return [
    {
      method: "get",
      path: "/v1/analytics/summary",
      operationId: "getAnalyticsSummary",
      summary: "Get aggregate AnalyticsBundle usage summary metrics for a project",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      query: AnalyticsSummaryQuerySchema,
      responses: {
        "200": { description: "Analytics usage summary metrics.", schema: analyticsUsageSummaryResponse },
        ...responses
      }
    },
    {
      method: "get",
      path: "/v1/analytics/routes",
      operationId: "getAnalyticsRoutes",
      summary: "Get aggregate AnalyticsBundle route metrics for a project",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      query: AnalyticsSummaryQuerySchema,
      responses: {
        "200": { description: "Analytics route metrics.", schema: analyticsRouteMetricsResponse },
        ...responses
      }
    },
    {
      method: "get",
      path: "/v1/analytics/devices",
      operationId: "getAnalyticsDevices",
      summary: "Get aggregate AnalyticsBundle device metrics for a project",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      query: AnalyticsSummaryQuerySchema,
      responses: {
        "200": {
          description: "Analytics device, browser, OS, and language metrics.",
          schema: analyticsDeviceBreakdownResponse
        },
        ...responses
      }
    },
    {
      method: "get",
      path: "/v1/analytics/journey-patterns",
      operationId: "getAnalyticsJourneyPatterns",
      summary: "Get aggregate AnalyticsBundle journey transition patterns for a project",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      query: AnalyticsSummaryQuerySchema,
      responses: {
        "200": {
          description: "Analytics journey transition patterns.",
          schema: analyticsJourneyPatternsResponse
        },
        ...responses
      }
    },
    {
      method: "get",
      path: "/v1/analytics/referrers",
      operationId: "getAnalyticsReferrers",
      summary: "Get aggregate AnalyticsBundle referrer and UTM metrics for a project",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      query: AnalyticsSummaryQuerySchema,
      responses: {
        "200": { description: "Analytics referrer and UTM metrics.", schema: analyticsReferrerMetricsResponse },
        ...responses
      }
    },
    {
      method: "get",
      path: "/v1/analytics/funnels/{key}",
      operationId: "getAnalyticsFunnel",
      summary: "Get aggregate AnalyticsBundle funnel conversion and dropoff metrics for a project",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      params: AnalyticsFunnelParamsSchema,
      query: AnalyticsSummaryQuerySchema,
      responses: {
        "200": {
          description: "Analytics funnel conversion and dropoff metrics.",
          schema: analyticsFunnelAnalysisResponse
        },
        ...responses
      }
    }
  ];
}
