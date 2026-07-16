import { z } from "zod";

import {
  AnalyticsActionMetricsResponseSchema,
  AnalyticsBundleV1Schema,
  AnalyticsBundleGenerationsListResponseSchema,
  AnalyticsBundleGenerationStatusSchema,
  AnalyticsBundleSeveritySchema,
  AnalyticsOpportunitiesListResponseSchema,
  AnalyticsOpportunityBundleStatusSchema,
  AnalyticsOpportunityResponseSchema,
  AnalyticsDeviceBreakdownResponseSchema,
  AnalyticsFunnelAnalysisResponseSchema,
  AnalyticsFunnelsResponseSchema,
  AnalyticsBundleAnalysisKindSchema,
  AnalyticsJourneyPatternsResponseSchema,
  AnalyticsJourneySampleResponseSchema,
  AnalyticsJourneySamplesListResponseSchema,
  AnalyticsIncidentImpactResponseSchema,
  AnalyticsReferrerMetricsResponseSchema,
  AnalyticsRouteMetricsResponseSchema,
  AnalyticsUsageSummaryResponseSchema,
  AnalyticsSavedFunnelCreateSchema,
  AnalyticsSavedFunnelKeySchema,
  AnalyticsSavedFunnelResponseSchema,
  AnalyticsSavedFunnelsResponseSchema,
  AnalyticsSavedFunnelUpdateSchema
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
  method: "get" | "post" | "patch" | "delete";
  path: string;
  operationId: string;
  summary: string;
  tags: string[];
  security?: SecurityRequirement[];
  params?: unknown;
  query?: unknown;
  requestBody?: SchemaComponent;
  responses: Record<string, ResponseSpec>;
};

const AnalyticsSafeRouteSchema = z.string().trim().min(1).max(2048).regex(/^[^?#]+$/);

const AnalyticsSummaryQuerySchema = z
  .object({
    project_id: z.string().uuid(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    last: z.string().optional(),
    granularity: z.enum(["hour", "day"]).optional(),
    service: z.string().optional(),
    environment: z.string().optional(),
    route: AnalyticsSafeRouteSchema.optional(),
    device_type: z.string().optional(),
    browser: z.string().optional(),
    os: z.string().optional(),
    language: z.string().optional(),
    country: z.string().optional(),
    auth_state: z.enum(["anonymous", "authenticated", "unknown"]).optional(),
    referrer: z.string().optional(),
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
    custom_dimensions: z.record(z.string(), z.string()).optional(),
    limit: z.number().int().min(1).max(100).optional()
  })
  .strict();

const AnalyticsFunnelParamsSchema = z.object({ key: z.string().min(1).max(120) }).strict();
const AnalyticsOpportunityParamsSchema = z.object({ id: z.string().uuid() }).strict();
const AnalyticsOpportunitiesQuerySchema = z
  .object({
    project_id: z.string().uuid().optional(),
    status: z.enum(["open", "resolved", "snoozed", "all"]).optional(),
    kind: AnalyticsBundleAnalysisKindSchema.optional(),
    service: z.string().min(1).max(120).optional(),
    environment: z.string().min(1).max(120).optional(),
    severity: AnalyticsBundleSeveritySchema.optional(),
    bundle_status: AnalyticsOpportunityBundleStatusSchema.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional()
  })
  .strict();
const AnalyticsBundlesQuerySchema = z
  .object({
    project_id: z.string().uuid().optional(),
    status: z.union([AnalyticsBundleGenerationStatusSchema, z.literal("all")]).optional(),
    kind: AnalyticsBundleAnalysisKindSchema.optional(),
    service: z.string().min(1).max(120).optional(),
    environment: z.string().min(1).max(120).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional()
  })
  .strict();
const AnalyticsOpportunityQuerySchema = z.object({ project_id: z.string().uuid() }).strict();
const AnalyticsBundleParamsSchema = z.object({ id: z.string().uuid() }).strict();
const AnalyticsBundleQuerySchema = z.object({ project_id: z.string().uuid() }).strict();
const AnalyticsBundleCreateSchema = z
  .object({
    project_id: z.string().uuid(),
    opportunity_id: z.string().uuid().nullable().optional(),
    analysis_kind: AnalyticsBundleAnalysisKindSchema,
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    last: z.string().min(2).max(16).optional(),
    funnel: z.string().min(1).max(120).nullable().optional(),
    route: AnalyticsSafeRouteSchema.nullable().optional(),
    incident_id: z.string().uuid().nullable().optional(),
    deploy_id: z.string().min(1).max(120).nullable().optional(),
    filters: z.record(z.string(), z.unknown()).optional()
  })
  .strict();
const AnalyticsBundleResponseSchema = z.union([
  AnalyticsBundleV1Schema,
  z.object({ status: z.literal("pending"), bundle_generation_id: z.string().uuid() }).strict(),
  z.object({ status: z.literal("failed"), reason: z.string() }).strict()
]);
const AnalyticsJourneySamplesQuerySchema = AnalyticsSummaryQuerySchema.pick({
  project_id: true,
  service: true,
  environment: true
})
  .extend({
    tag: z.string().min(1).max(120).optional(),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional()
  })
  .strict();
const AnalyticsJourneySampleParamsSchema = z.object({ id: z.string().uuid() }).strict();
const AnalyticsIncidentImpactParamsSchema = z.object({ id: z.string().uuid() }).strict();
const AnalyticsSavedFunnelProjectParamsSchema = z.object({ id: z.string().uuid() }).strict();
const AnalyticsSavedFunnelParamsSchema = AnalyticsSavedFunnelProjectParamsSchema.extend({
  funnelKey: AnalyticsSavedFunnelKeySchema
}).strict();

function component(name: string, schema: unknown): SchemaComponent {
  return { name, schema };
}

export function createAnalyticsMetricOpenApiOperations(options: {
  apiError: SchemaComponent;
  anyMemberAuth: SecurityRequirement[];
}): OperationSpec[] {
  const analyticsUsageSummaryResponse = component(
    "AnalyticsUsageSummaryResponse",
    AnalyticsUsageSummaryResponseSchema
  );
  const analyticsOpportunitiesListResponse = component(
    "AnalyticsOpportunitiesListResponse",
    AnalyticsOpportunitiesListResponseSchema
  );
  const analyticsOpportunityResponse = component(
    "AnalyticsOpportunityResponse",
    AnalyticsOpportunityResponseSchema
  );
  const analyticsBundleGenerationsListResponse = component(
    "AnalyticsBundleGenerationsListResponse",
    AnalyticsBundleGenerationsListResponseSchema
  );
  const analyticsBundleCreate = component("AnalyticsBundleCreate", AnalyticsBundleCreateSchema);
  const analyticsBundleResponse = component(
    "AnalyticsBundleResponse",
    AnalyticsBundleResponseSchema
  );
  const analyticsJourneySamplesListResponse = component(
    "AnalyticsJourneySamplesListResponse",
    AnalyticsJourneySamplesListResponseSchema
  );
  const analyticsJourneySampleResponse = component(
    "AnalyticsJourneySampleResponse",
    AnalyticsJourneySampleResponseSchema
  );
  const analyticsIncidentImpactResponse = component(
    "AnalyticsIncidentImpactResponse",
    AnalyticsIncidentImpactResponseSchema
  );
  const analyticsRouteMetricsResponse = component(
    "AnalyticsRouteMetricsResponse",
    AnalyticsRouteMetricsResponseSchema
  );
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
  const analyticsActionMetricsResponse = component(
    "AnalyticsActionMetricsResponse",
    AnalyticsActionMetricsResponseSchema
  );
  const analyticsFunnelAnalysisResponse = component(
    "AnalyticsFunnelAnalysisResponse",
    AnalyticsFunnelAnalysisResponseSchema
  );
  const analyticsFunnelsResponse = component(
    "AnalyticsFunnelsResponse",
    AnalyticsFunnelsResponseSchema
  );
  const savedFunnelCreate = component(
    "AnalyticsSavedFunnelCreate",
    AnalyticsSavedFunnelCreateSchema
  );
  const savedFunnelUpdate = component(
    "AnalyticsSavedFunnelUpdate",
    AnalyticsSavedFunnelUpdateSchema
  );
  const savedFunnelResponse = component(
    "AnalyticsSavedFunnelResponse",
    AnalyticsSavedFunnelResponseSchema
  );
  const savedFunnelsResponse = component(
    "AnalyticsSavedFunnelsResponse",
    AnalyticsSavedFunnelsResponseSchema
  );
  const responses = {
    "400": { description: "Invalid query parameters.", schema: options.apiError },
    "401": { description: "Authentication is invalid.", schema: options.apiError },
    "403": { description: "An eligible tier is required.", schema: options.apiError },
    "404": {
      description: "Project was not found or analytics metrics are unavailable.",
      schema: options.apiError
    }
  };

  return [
    {
      method: "get",
      path: "/v1/projects/{id}/analytics/saved-funnels",
      operationId: "listSavedAnalyticsFunnels",
      summary: "List active saved analytics funnels for a project",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      params: AnalyticsSavedFunnelProjectParamsSchema,
      responses: {
        "200": { description: "Active saved analytics funnels.", schema: savedFunnelsResponse },
        ...responses
      }
    },
    {
      method: "post",
      path: "/v1/projects/{id}/analytics/saved-funnels",
      operationId: "createSavedAnalyticsFunnel",
      summary: "Create a saved analytics funnel for a project",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      params: AnalyticsSavedFunnelProjectParamsSchema,
      requestBody: savedFunnelCreate,
      responses: {
        "201": { description: "Saved analytics funnel created.", schema: savedFunnelResponse },
        ...responses,
        "409": {
          description: "The key exists or the saved-funnel limit was reached.",
          schema: options.apiError
        }
      }
    },
    {
      method: "patch",
      path: "/v1/projects/{id}/analytics/saved-funnels/{funnelKey}",
      operationId: "updateSavedAnalyticsFunnel",
      summary: "Update a saved analytics funnel",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      params: AnalyticsSavedFunnelParamsSchema,
      requestBody: savedFunnelUpdate,
      responses: {
        "200": { description: "Saved analytics funnel updated.", schema: savedFunnelResponse },
        ...responses
      }
    },
    {
      method: "delete",
      path: "/v1/projects/{id}/analytics/saved-funnels/{funnelKey}",
      operationId: "archiveSavedAnalyticsFunnel",
      summary: "Archive a saved analytics funnel",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      params: AnalyticsSavedFunnelParamsSchema,
      responses: {
        "200": { description: "Saved analytics funnel archived.", schema: savedFunnelResponse },
        ...responses
      }
    },
    {
      method: "get",
      path: "/v1/analytics/bundles",
      operationId: "listAnalyticsBundles",
      summary: "List AnalyticsBundle generations for a project or across the caller organization",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      query: AnalyticsBundlesQuerySchema,
      responses: {
        "200": {
          description: "AnalyticsBundle generations.",
          schema: analyticsBundleGenerationsListResponse
        },
        ...responses
      }
    },
    {
      method: "post",
      path: "/v1/analytics/bundles",
      operationId: "generateAnalyticsBundle",
      summary: "Request generation of a project analytics bundle",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      requestBody: analyticsBundleCreate,
      responses: {
        "200": {
          description: "Analytics bundle or explicit generation state.",
          schema: analyticsBundleResponse
        },
        ...responses,
        "429": {
          description: "Analytics generation allowance exhausted.",
          schema: options.apiError
        }
      }
    },
    {
      method: "get",
      path: "/v1/analytics/bundles/{id}",
      operationId: "getAnalyticsBundle",
      summary: "Get a generated analytics bundle or its generation state",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      params: AnalyticsBundleParamsSchema,
      query: AnalyticsBundleQuerySchema,
      responses: {
        "200": {
          description: "Analytics bundle or explicit generation state.",
          schema: analyticsBundleResponse
        },
        ...responses
      }
    },
    {
      method: "get",
      path: "/v1/analytics/opportunities",
      operationId: "listAnalyticsOpportunities",
      summary: "List AnalyticsBundle opportunities for a project or across the caller organization",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      query: AnalyticsOpportunitiesQuerySchema,
      responses: {
        "200": {
          description: "Analytics opportunities.",
          schema: analyticsOpportunitiesListResponse
        },
        ...responses
      }
    },
    {
      method: "get",
      path: "/v1/analytics/opportunities/{id}",
      operationId: "getAnalyticsOpportunity",
      summary: "Get an AnalyticsBundle opportunity for a project",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      params: AnalyticsOpportunityParamsSchema,
      query: AnalyticsOpportunityQuerySchema,
      responses: {
        "200": { description: "Analytics opportunity.", schema: analyticsOpportunityResponse },
        ...responses
      }
    },
    {
      method: "get",
      path: "/v1/analytics/journey-samples",
      operationId: "listAnalyticsJourneySamples",
      summary: "List retained redacted analytics journey samples for a project",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      query: AnalyticsJourneySamplesQuerySchema,
      responses: {
        "200": {
          description: "Retained analytics journey sample metadata.",
          schema: analyticsJourneySamplesListResponse
        },
        ...responses
      }
    },
    {
      method: "get",
      path: "/v1/analytics/journey-samples/{id}",
      operationId: "getAnalyticsJourneySample",
      summary: "Get a retained redacted analytics journey sample",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      params: AnalyticsJourneySampleParamsSchema,
      query: AnalyticsBundleQuerySchema,
      responses: {
        "200": {
          description: "Retained analytics journey artifact.",
          schema: analyticsJourneySampleResponse
        },
        ...responses
      }
    },
    {
      method: "get",
      path: "/v1/analytics/summary",
      operationId: "getAnalyticsSummary",
      summary: "Get aggregate AnalyticsBundle usage summary metrics for a project",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      query: AnalyticsSummaryQuerySchema,
      responses: {
        "200": {
          description: "Analytics usage summary metrics.",
          schema: analyticsUsageSummaryResponse
        },
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
        "200": {
          description: "Analytics referrer and UTM metrics.",
          schema: analyticsReferrerMetricsResponse
        },
        ...responses
      }
    },
    {
      method: "get",
      path: "/v1/analytics/actions",
      operationId: "getAnalyticsActions",
      summary: "Get aggregate AnalyticsBundle action and conversion metrics for a project",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      query: AnalyticsSummaryQuerySchema,
      responses: {
        "200": {
          description: "Analytics action, marker, and conversion metrics.",
          schema: analyticsActionMetricsResponse
        },
        ...responses
      }
    },
    {
      method: "get",
      path: "/v1/analytics/funnels",
      operationId: "listAnalyticsFunnels",
      summary: "List aggregate AnalyticsBundle funnel conversion summaries for a project",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      query: AnalyticsSummaryQuerySchema,
      responses: {
        "200": {
          description: "Analytics funnel conversion summaries.",
          schema: analyticsFunnelsResponse
        },
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
    },
    {
      method: "get",
      path: "/v1/analytics/incidents/{id}/impact",
      operationId: "getAnalyticsIncidentImpact",
      summary: "Get aggregate analytics impact for an incident",
      tags: ["Analytics"],
      security: options.anyMemberAuth,
      params: AnalyticsIncidentImpactParamsSchema,
      query: AnalyticsSummaryQuerySchema,
      responses: {
        "200": {
          description: "Aggregate incident impact metrics.",
          schema: analyticsIncidentImpactResponse
        },
        ...responses
      }
    }
  ];
}
