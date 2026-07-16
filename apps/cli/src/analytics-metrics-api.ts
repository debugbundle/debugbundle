import {
  AnalyticsActionMetricsResponseSchema,
  AnalyticsDeviceBreakdownResponseSchema,
  AnalyticsFunnelAnalysisResponseSchema,
  AnalyticsFunnelsResponseSchema,
  AnalyticsIncidentImpactResponseSchema,
  AnalyticsJourneyPatternsResponseSchema,
  AnalyticsOpportunitiesListResponseSchema,
  AnalyticsOpportunityResponseSchema,
  AnalyticsReferrerMetricsResponseSchema,
  AnalyticsRouteMetricsResponseSchema,
  AnalyticsUsageSummaryResponseSchema,
  type AnalyticsActionMetricsResponse,
  type AnalyticsDeviceBreakdownResponse,
  type AnalyticsFunnelAnalysisResponse,
  type AnalyticsFunnelsResponse,
  type AnalyticsIncidentImpactResponse,
  type AnalyticsJourneyPatternsResponse,
  type AnalyticsOpportunitiesListResponse,
  type AnalyticsOpportunityResponse,
  type AnalyticsReferrerMetricsResponse,
  type AnalyticsRouteMetricsResponse,
  type AnalyticsUsageSummaryResponse
} from "../../../packages/shared-types/src/index.js";
import type {
  AnalyticsFunnelCommandInput,
  AnalyticsIncidentImpactCommandInput,
  AnalyticsMetricQueryInput,
  AnalyticsOpportunitiesCommandInput,
  AnalyticsOpportunityGetCommandInput
} from "./analytics-metrics-commands.js";

export type AnalyticsMetricsHttpRequest = {
  method: "GET";
  path: string;
  bearerToken: string;
};

export type AnalyticsMetricsHttpResponse = {
  status: number;
  body: unknown;
};

export class AnalyticsMetricsApiError extends Error {
  public readonly status: number;

  public constructor(status: number, message: string) {
    super(message);
    this.name = "AnalyticsMetricsApiError";
    this.status = status;
  }
}

export function createAnalyticsMetricsApi(httpClient: {
  request(request: AnalyticsMetricsHttpRequest): Promise<AnalyticsMetricsHttpResponse>;
}): {
  getUsageSummary(input: AnalyticsMetricQueryInput): Promise<AnalyticsUsageSummaryResponse>;
  getRouteMetrics(input: AnalyticsMetricQueryInput): Promise<AnalyticsRouteMetricsResponse>;
  getJourneyPatterns(input: AnalyticsMetricQueryInput): Promise<AnalyticsJourneyPatternsResponse>;
  getDeviceBreakdown(input: AnalyticsMetricQueryInput): Promise<AnalyticsDeviceBreakdownResponse>;
  getReferrerMetrics(input: AnalyticsMetricQueryInput): Promise<AnalyticsReferrerMetricsResponse>;
  getActionMetrics(input: AnalyticsMetricQueryInput): Promise<AnalyticsActionMetricsResponse>;
  listFunnels(input: AnalyticsMetricQueryInput): Promise<AnalyticsFunnelsResponse>;
  getFunnelAnalysis(
    input: Omit<AnalyticsFunnelCommandInput, "json">
  ): Promise<AnalyticsFunnelAnalysisResponse>;
  getIncidentImpact(
    input: Omit<AnalyticsIncidentImpactCommandInput, "json">
  ): Promise<AnalyticsIncidentImpactResponse>;
  listOpportunities(
    input: Omit<AnalyticsOpportunitiesCommandInput, "json">
  ): Promise<AnalyticsOpportunitiesListResponse>;
  getOpportunity(
    input: Omit<AnalyticsOpportunityGetCommandInput, "json">
  ): Promise<AnalyticsOpportunityResponse>;
} {
  return {
    getUsageSummary: (input) =>
      requestMetric(
        httpClient,
        `/v1/analytics/summary?${buildMetricsQueryString(input)}`,
        input.bearerToken,
        AnalyticsUsageSummaryResponseSchema,
        "summary"
      ),
    getRouteMetrics: (input) =>
      requestMetric(
        httpClient,
        `/v1/analytics/routes?${buildMetricsQueryString(input)}`,
        input.bearerToken,
        AnalyticsRouteMetricsResponseSchema,
        "route metrics"
      ),
    getJourneyPatterns: (input) =>
      requestMetric(
        httpClient,
        `/v1/analytics/journey-patterns?${buildMetricsQueryString(input)}`,
        input.bearerToken,
        AnalyticsJourneyPatternsResponseSchema,
        "journey patterns"
      ),
    getDeviceBreakdown: (input) =>
      requestMetric(
        httpClient,
        `/v1/analytics/devices?${buildMetricsQueryString(input)}`,
        input.bearerToken,
        AnalyticsDeviceBreakdownResponseSchema,
        "device breakdown"
      ),
    getReferrerMetrics: (input) =>
      requestMetric(
        httpClient,
        `/v1/analytics/referrers?${buildMetricsQueryString(input)}`,
        input.bearerToken,
        AnalyticsReferrerMetricsResponseSchema,
        "referrer metrics"
      ),
    getActionMetrics: (input) =>
      requestMetric(
        httpClient,
        `/v1/analytics/actions?${buildMetricsQueryString(input)}`,
        input.bearerToken,
        AnalyticsActionMetricsResponseSchema,
        "action metrics"
      ),
    listFunnels: (input) =>
      requestMetric(
        httpClient,
        `/v1/analytics/funnels?${buildMetricsQueryString(input)}`,
        input.bearerToken,
        AnalyticsFunnelsResponseSchema,
        "funnels",
        "list"
      ),
    getFunnelAnalysis: (input) =>
      requestMetric(
        httpClient,
        `/v1/analytics/funnels/${encodeURIComponent(input.funnelKey)}?${buildMetricsQueryString(input)}`,
        input.bearerToken,
        AnalyticsFunnelAnalysisResponseSchema,
        "funnel analysis"
      ),
    getIncidentImpact: (input) =>
      requestMetric(
        httpClient,
        `/v1/analytics/incidents/${encodeURIComponent(input.incidentId)}/impact?${buildMetricsQueryString(input)}`,
        input.bearerToken,
        AnalyticsIncidentImpactResponseSchema,
        "incident impact"
      ),
    listOpportunities: (input) =>
      requestMetric(
        httpClient,
        `/v1/analytics/opportunities?${buildOpportunitiesQueryString(input)}`,
        input.bearerToken,
        AnalyticsOpportunitiesListResponseSchema,
        "opportunities",
        "list"
      ),
    getOpportunity: (input) =>
      requestMetric(
        httpClient,
        `/v1/analytics/opportunities/${encodeURIComponent(input.opportunityId)}?${new URLSearchParams({ project_id: input.projectId })}`,
        input.bearerToken,
        AnalyticsOpportunityResponseSchema,
        "opportunity"
      )
  };
}

async function requestMetric<Response>(
  httpClient: {
    request(request: AnalyticsMetricsHttpRequest): Promise<AnalyticsMetricsHttpResponse>;
  },
  path: string,
  bearerToken: string,
  schema: { safeParse(value: unknown): { success: true; data: Response } | { success: false } },
  label: string,
  action: "get" | "list" = "get"
): Promise<Response> {
  const response = await httpClient.request({ method: "GET", path, bearerToken });
  if (response.status !== 200) {
    throw toApiError(response.status, response.body, `Failed to ${action} analytics ${label}.`);
  }
  const parsed = schema.safeParse(response.body);
  if (!parsed.success) {
    throw new AnalyticsMetricsApiError(500, `Invalid analytics ${label} response.`);
  }
  return parsed.data;
}

function buildMetricsQueryString(input: AnalyticsMetricQueryInput): string {
  const params = new URLSearchParams({ project_id: input.projectId });
  appendOptionalParam(params, "from", input.from);
  appendOptionalParam(params, "to", input.to);
  appendOptionalParam(params, "last", input.last);
  appendOptionalParam(params, "granularity", input.granularity);
  appendOptionalParam(params, "service", input.service);
  appendOptionalParam(params, "environment", input.environment);
  appendOptionalParam(params, "route", input.route);
  appendOptionalParam(params, "device_type", input.deviceType);
  appendOptionalParam(params, "browser", input.browser);
  appendOptionalParam(params, "os", input.os);
  appendOptionalParam(params, "language", input.language);
  appendOptionalParam(params, "country", input.country);
  appendOptionalParam(params, "auth_state", input.authState);
  appendOptionalParam(params, "referrer", input.referrer);
  appendOptionalParam(params, "utm_source", input.utmSource);
  appendOptionalParam(params, "utm_medium", input.utmMedium);
  appendOptionalParam(params, "utm_campaign", input.utmCampaign);
  for (const [key, value] of Object.entries(input.customDimensions ?? {}).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    params.set(`custom_dimension.${key}`, value);
  }
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  return params.toString();
}

function buildOpportunitiesQueryString(
  input: Omit<AnalyticsOpportunitiesCommandInput, "json">
): string {
  const params = new URLSearchParams();
  appendOptionalParam(params, "project_id", input.projectId);
  appendOptionalParam(params, "status", input.status);
  appendOptionalParam(params, "kind", input.kind);
  appendOptionalParam(params, "service", input.service);
  appendOptionalParam(params, "environment", input.environment);
  appendOptionalParam(params, "severity", input.severity);
  appendOptionalParam(params, "bundle_status", input.bundleStatus);
  appendOptionalParam(params, "from", input.from);
  appendOptionalParam(params, "to", input.to);
  appendOptionalParam(params, "cursor", input.cursor);
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  return params.toString();
}

function appendOptionalParam(
  params: URLSearchParams,
  key: string,
  value: string | undefined
): void {
  if (value !== undefined) params.set(key, value);
}

function toApiError(status: number, body: unknown, fallback: string): AnalyticsMetricsApiError {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return new AnalyticsMetricsApiError(status, body.error);
  }
  return new AnalyticsMetricsApiError(status, fallback);
}
