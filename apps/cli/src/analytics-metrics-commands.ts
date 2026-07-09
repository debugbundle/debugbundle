import {
  AnalyticsDeviceBreakdownResponseSchema,
  AnalyticsFunnelAnalysisResponseSchema,
  AnalyticsJourneyPatternsResponseSchema,
  AnalyticsOpportunitiesListResponseSchema,
  AnalyticsOpportunityResponseSchema,
  AnalyticsOpportunityStatusSchema,
  AnalyticsReferrerMetricsResponseSchema,
  AnalyticsRouteMetricsResponseSchema,
  AnalyticsUsageSummaryResponseSchema,
  type AnalyticsBundleAnalysisKind,
  type AnalyticsDeviceBreakdownResponse,
  type AnalyticsFunnelAnalysisResponse,
  type AnalyticsJourneyPatternsResponse,
  type AnalyticsMetricsGranularity,
  type AnalyticsOpportunitiesListResponse,
  type AnalyticsOpportunityResponse,
  type AnalyticsOpportunityStatus,
  type AnalyticsReferrerMetricsResponse,
  type AnalyticsRouteMetricsResponse,
  type AnalyticsUsageSummaryResponse
} from "../../../packages/shared-types/src/index.js";
import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState } from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";
import type { CliCommandResult } from "./token-commands.js";

type AnalyticsMetricsHttpRequest = {
  method: "GET";
  path: string;
  bearerToken: string;
};

type AnalyticsMetricsHttpResponse = {
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

export interface AnalyticsSummaryCommandInput {
  bearerToken: string;
  projectId: string;
  from?: string | undefined;
  to?: string | undefined;
  last?: string | undefined;
  granularity?: AnalyticsMetricsGranularity | undefined;
  service?: string | undefined;
  environment?: string | undefined;
  limit?: number | undefined;
  json?: boolean | undefined;
}

type AnalyticsMetricQueryInput = Omit<AnalyticsSummaryCommandInput, "json">;

export interface AnalyticsFunnelCommandInput extends AnalyticsSummaryCommandInput {
  funnelKey: string;
}

export interface AnalyticsOpportunitiesCommandInput {
  bearerToken: string;
  projectId: string;
  status?: AnalyticsOpportunityStatus | "all" | undefined;
  kind?: AnalyticsBundleAnalysisKind | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
  json?: boolean | undefined;
}

export interface AnalyticsOpportunityGetCommandInput {
  bearerToken: string;
  projectId: string;
  opportunityId: string;
  json?: boolean | undefined;
}

function toApiError(status: number, body: unknown, fallback: string): AnalyticsMetricsApiError {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
    return new AnalyticsMetricsApiError(status, body.error);
  }

  return new AnalyticsMetricsApiError(status, fallback);
}

export function createAnalyticsMetricsApi(httpClient: {
  request(request: AnalyticsMetricsHttpRequest): Promise<AnalyticsMetricsHttpResponse>;
}): {
  getUsageSummary(input: AnalyticsMetricQueryInput): Promise<AnalyticsUsageSummaryResponse>;
  getRouteMetrics(input: AnalyticsMetricQueryInput): Promise<AnalyticsRouteMetricsResponse>;
  getJourneyPatterns(input: AnalyticsMetricQueryInput): Promise<AnalyticsJourneyPatternsResponse>;
  getDeviceBreakdown(input: AnalyticsMetricQueryInput): Promise<AnalyticsDeviceBreakdownResponse>;
  getReferrerMetrics(input: AnalyticsMetricQueryInput): Promise<AnalyticsReferrerMetricsResponse>;
  getFunnelAnalysis(input: Omit<AnalyticsFunnelCommandInput, "json">): Promise<AnalyticsFunnelAnalysisResponse>;
  listOpportunities(input: Omit<AnalyticsOpportunitiesCommandInput, "json">): Promise<AnalyticsOpportunitiesListResponse>;
  getOpportunity(input: Omit<AnalyticsOpportunityGetCommandInput, "json">): Promise<AnalyticsOpportunityResponse>;
} {
  return {
    async getUsageSummary(input): Promise<AnalyticsUsageSummaryResponse> {
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/analytics/summary?${buildMetricsQueryString(input)}`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to get analytics summary.");
      }

      const parsed = AnalyticsUsageSummaryResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new AnalyticsMetricsApiError(500, "Invalid analytics summary response.");
      }

      return parsed.data;
    },

    async getRouteMetrics(input): Promise<AnalyticsRouteMetricsResponse> {
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/analytics/routes?${buildMetricsQueryString(input)}`,
        bearerToken: input.bearerToken
      });
      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to get analytics route metrics.");
      }
      const parsed = AnalyticsRouteMetricsResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new AnalyticsMetricsApiError(500, "Invalid analytics route metrics response.");
      }
      return parsed.data;
    },

    async getJourneyPatterns(input): Promise<AnalyticsJourneyPatternsResponse> {
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/analytics/journey-patterns?${buildMetricsQueryString(input)}`,
        bearerToken: input.bearerToken
      });
      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to get analytics journey patterns.");
      }
      const parsed = AnalyticsJourneyPatternsResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new AnalyticsMetricsApiError(500, "Invalid analytics journey patterns response.");
      }
      return parsed.data;
    },

    async getDeviceBreakdown(input): Promise<AnalyticsDeviceBreakdownResponse> {
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/analytics/devices?${buildMetricsQueryString(input)}`,
        bearerToken: input.bearerToken
      });
      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to get analytics device breakdown.");
      }
      const parsed = AnalyticsDeviceBreakdownResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new AnalyticsMetricsApiError(500, "Invalid analytics device breakdown response.");
      }
      return parsed.data;
    },

    async getReferrerMetrics(input): Promise<AnalyticsReferrerMetricsResponse> {
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/analytics/referrers?${buildMetricsQueryString(input)}`,
        bearerToken: input.bearerToken
      });
      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to get analytics referrer metrics.");
      }
      const parsed = AnalyticsReferrerMetricsResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new AnalyticsMetricsApiError(500, "Invalid analytics referrer metrics response.");
      }
      return parsed.data;
    },

    async getFunnelAnalysis(input): Promise<AnalyticsFunnelAnalysisResponse> {
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/analytics/funnels/${encodeURIComponent(input.funnelKey)}?${buildMetricsQueryString(input)}`,
        bearerToken: input.bearerToken
      });
      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to get analytics funnel analysis.");
      }
      const parsed = AnalyticsFunnelAnalysisResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new AnalyticsMetricsApiError(500, "Invalid analytics funnel analysis response.");
      }
      return parsed.data;
    },

    async listOpportunities(input): Promise<AnalyticsOpportunitiesListResponse> {
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/analytics/opportunities?${buildOpportunitiesQueryString(input)}`,
        bearerToken: input.bearerToken
      });
      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to list analytics opportunities.");
      }
      const parsed = AnalyticsOpportunitiesListResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new AnalyticsMetricsApiError(500, "Invalid analytics opportunities response.");
      }
      return parsed.data;
    },

    async getOpportunity(input): Promise<AnalyticsOpportunityResponse> {
      const params = new URLSearchParams({ project_id: input.projectId });
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/analytics/opportunities/${encodeURIComponent(input.opportunityId)}?${params.toString()}`,
        bearerToken: input.bearerToken
      });
      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to get analytics opportunity.");
      }
      const parsed = AnalyticsOpportunityResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new AnalyticsMetricsApiError(500, "Invalid analytics opportunity response.");
      }
      return parsed.data;
    }
  };
}

function buildMetricsQueryString(input: AnalyticsMetricQueryInput): string {
  const params = new URLSearchParams({ project_id: input.projectId });
  appendOptionalParam(params, "from", input.from);
  appendOptionalParam(params, "to", input.to);
  appendOptionalParam(params, "last", input.last);
  appendOptionalParam(params, "granularity", input.granularity);
  appendOptionalParam(params, "service", input.service);
  appendOptionalParam(params, "environment", input.environment);
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }

  return params.toString();
}

function appendOptionalParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined) {
    params.set(key, value);
  }
}

function buildOpportunitiesQueryString(input: Omit<AnalyticsOpportunitiesCommandInput, "json">): string {
  const params = new URLSearchParams({ project_id: input.projectId });
  appendOptionalParam(params, "status", input.status);
  appendOptionalParam(params, "kind", input.kind);
  appendOptionalParam(params, "cursor", input.cursor);
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }

  return params.toString();
}

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof AnalyticsMetricsApiError)) {
    return 1;
  }

  if (error.status === 401) {
    return 2;
  }
  if (error.status === 404) {
    return 3;
  }
  if (error.status === 400 || error.status === 403) {
    return 4;
  }

  return 1;
}

function formatTopSegments(label: string, segments: AnalyticsUsageSummaryResponse["breakdowns"]["device_types"]): string {
  if (segments.length === 0) {
    return `${label}: none`;
  }

  return `${label}: ${segments
    .slice(0, 5)
    .map((segment) => `${segment.value} (${segment.sessions} sessions, ${segment.pageviews} pageviews)`)
    .join("; ")}`;
}

function formatSummary(response: AnalyticsUsageSummaryResponse): string {
  return [
    `project_id: ${response.summary.project_id}`,
    `from: ${response.summary.from}`,
    `to: ${response.summary.to}`,
    `granularity: ${response.summary.granularity}`,
    `service: ${response.summary.service ?? ""}`,
    `environment: ${response.summary.environment ?? ""}`,
    `sessions: ${response.summary.sessions}`,
    `pageviews: ${response.summary.pageviews}`,
    `active_visitors: ${response.summary.active_visitors}`,
    `new_visitors: ${response.summary.new_visitors}`,
    `returning_visitors: ${response.summary.returning_visitors}`,
    `exits: ${response.summary.exits}`,
    `conversions: ${response.summary.conversions}`,
    formatTopSegments("top_device_types", response.breakdowns.device_types),
    formatTopSegments("top_browsers", response.breakdowns.browsers),
    formatTopSegments("top_referrers", response.breakdowns.referrers)
  ].join("\n");
}

export async function getAnalyticsSummaryCommand(
  input: AnalyticsSummaryCommandInput,
  api: {
    getUsageSummary(input: AnalyticsMetricQueryInput): Promise<AnalyticsUsageSummaryResponse>;
  }
): Promise<CliCommandResult> {
  try {
    const response = await api.getUsageSummary({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      from: input.from,
      to: input.to,
      last: input.last,
      granularity: input.granularity,
      service: input.service,
      environment: input.environment,
      limit: input.limit
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : formatSummary(response)
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

function formatRoutes(response: AnalyticsRouteMetricsResponse): string {
  if (response.routes.length === 0) {
    return "No route metrics found.";
  }

  return response.routes
    .map((route) => `${route.route_key}: ${route.pageviews} pageviews, ${route.unique_sessions} sessions, ${route.exits} exits`)
    .join("\n");
}

function formatJourneyPatterns(response: AnalyticsJourneyPatternsResponse): string {
  if (response.patterns.length === 0) {
    return "No journey patterns found.";
  }

  return response.patterns
    .map((pattern) => {
      const sampleCount = pattern.sample_ids?.length ?? 0;
      const samples = sampleCount > 0 ? `, ${sampleCount} samples` : "";
      return `${pattern.from_route_key} -> ${pattern.to_route_key}: ${pattern.transition_count} transitions, ${pattern.unique_sessions} sessions, ${pattern.transition_share} share${samples}`;
    })
    .join("\n");
}

function formatSegmentList(
  label: string,
  segments: Array<{ value: string; sessions: number; pageviews: number }>
): string {
  return formatTopSegments(label, segments);
}

function formatDeviceBreakdown(response: AnalyticsDeviceBreakdownResponse): string {
  return [
    formatSegmentList("device_types", response.device_types),
    formatSegmentList("browsers", response.browsers),
    formatSegmentList("os", response.os),
    formatSegmentList("languages", response.languages)
  ].join("\n");
}

function formatReferrerMetrics(response: AnalyticsReferrerMetricsResponse): string {
  return [
    formatSegmentList("referrers", response.referrers),
    formatSegmentList("utm_sources", response.utm_sources),
    formatSegmentList("utm_mediums", response.utm_mediums),
    formatSegmentList("utm_campaigns", response.utm_campaigns)
  ].join("\n");
}

function formatFunnelAnalysis(response: AnalyticsFunnelAnalysisResponse): string {
  return [
    `funnel_key: ${response.funnel.funnel_key}`,
    `sessions_entered: ${response.funnel.sessions_entered}`,
    `sessions_completed: ${response.funnel.sessions_completed}`,
    `dropoffs: ${response.funnel.dropoffs}`,
    `conversion_rate: ${response.funnel.conversion_rate}`,
    ...response.steps.map((step) =>
      `${step.step_key}: ${step.sessions_entered} entered, ${step.sessions_completed} completed, ${step.dropoffs} dropoffs`
    )
  ].join("\n");
}

function formatOpportunities(response: AnalyticsOpportunitiesListResponse): string {
  if (response.opportunities.length === 0) {
    return "No analytics opportunities found.";
  }

  const rows = response.opportunities.map((opportunity) =>
    `${opportunity.opportunity_id} | ${opportunity.severity} | ${opportunity.status} | ${opportunity.kind} | ${opportunity.title}`
  );

  return `${rows.join("\n")}${response.next_cursor === null ? "" : `\nnext_cursor: ${response.next_cursor}`}`;
}

function formatOpportunity(response: AnalyticsOpportunityResponse): string {
  const opportunity = response.opportunity;
  return [
    `Opportunity: ${opportunity.opportunity_id}`,
    `Project: ${opportunity.project_name}`,
    `Title: ${opportunity.title}`,
    `Kind: ${opportunity.kind}`,
    `Severity: ${opportunity.severity}`,
    `Status: ${opportunity.status}`,
    `Service: ${opportunity.service ?? ""}`,
    `Environment: ${opportunity.environment ?? ""}`,
    `Confidence: ${opportunity.confidence}`,
    `Last detected: ${opportunity.last_detected_at}`,
    ...(opportunity.related_incident_ids.length === 0
      ? []
      : [`Related incidents: ${opportunity.related_incident_ids.join(", ")}`]),
    ...(opportunity.related_deploy_ids.length === 0
      ? []
      : [`Related deploys: ${opportunity.related_deploy_ids.join(", ")}`]),
    `Bundle status: ${opportunity.bundle_status}`,
    `Summary: ${opportunity.summary}`
  ].join("\n");
}

async function runAnalyticsMetricCommand<Response>(
  input: AnalyticsSummaryCommandInput,
  apiCall: (request: AnalyticsMetricQueryInput) => Promise<Response>,
  format: (response: Response) => string
): Promise<CliCommandResult> {
  try {
    const response = await apiCall({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      from: input.from,
      to: input.to,
      last: input.last,
      granularity: input.granularity,
      service: input.service,
      environment: input.environment,
      limit: input.limit
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : format(response)
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function getAnalyticsRoutesCommand(
  input: AnalyticsSummaryCommandInput,
  api: { getRouteMetrics(input: AnalyticsMetricQueryInput): Promise<AnalyticsRouteMetricsResponse> }
): Promise<CliCommandResult> {
  return runAnalyticsMetricCommand(input, (request) => api.getRouteMetrics(request), formatRoutes);
}

export async function getAnalyticsJourneysCommand(
  input: AnalyticsSummaryCommandInput,
  api: { getJourneyPatterns(input: AnalyticsMetricQueryInput): Promise<AnalyticsJourneyPatternsResponse> }
): Promise<CliCommandResult> {
  return runAnalyticsMetricCommand(input, (request) => api.getJourneyPatterns(request), formatJourneyPatterns);
}

export async function getAnalyticsDevicesCommand(
  input: AnalyticsSummaryCommandInput,
  api: { getDeviceBreakdown(input: AnalyticsMetricQueryInput): Promise<AnalyticsDeviceBreakdownResponse> }
): Promise<CliCommandResult> {
  return runAnalyticsMetricCommand(input, (request) => api.getDeviceBreakdown(request), formatDeviceBreakdown);
}

export async function getAnalyticsReferrersCommand(
  input: AnalyticsSummaryCommandInput,
  api: { getReferrerMetrics(input: AnalyticsMetricQueryInput): Promise<AnalyticsReferrerMetricsResponse> }
): Promise<CliCommandResult> {
  return runAnalyticsMetricCommand(input, (request) => api.getReferrerMetrics(request), formatReferrerMetrics);
}

export async function getAnalyticsFunnelCommand(
  input: AnalyticsFunnelCommandInput,
  api: { getFunnelAnalysis(input: Omit<AnalyticsFunnelCommandInput, "json">): Promise<AnalyticsFunnelAnalysisResponse> }
): Promise<CliCommandResult> {
  try {
    const response = await api.getFunnelAnalysis({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      funnelKey: input.funnelKey,
      from: input.from,
      to: input.to,
      last: input.last,
      granularity: input.granularity,
      service: input.service,
      environment: input.environment,
      limit: input.limit
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : formatFunnelAnalysis(response)
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function listAnalyticsOpportunitiesCommand(
  input: AnalyticsOpportunitiesCommandInput,
  api: { listOpportunities(input: Omit<AnalyticsOpportunitiesCommandInput, "json">): Promise<AnalyticsOpportunitiesListResponse> }
): Promise<CliCommandResult> {
  try {
    if (input.status !== undefined && input.status !== "all" && !AnalyticsOpportunityStatusSchema.safeParse(input.status).success) {
      return { exitCode: 4, output: "Invalid value for --status." };
    }

    const response = await api.listOpportunities({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      status: input.status,
      kind: input.kind,
      cursor: input.cursor,
      limit: input.limit
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : formatOpportunities(response)
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function getAnalyticsOpportunityCommand(
  input: AnalyticsOpportunityGetCommandInput,
  api: { getOpportunity(input: Omit<AnalyticsOpportunityGetCommandInput, "json">): Promise<AnalyticsOpportunityResponse> }
): Promise<CliCommandResult> {
  try {
    const response = await api.getOpportunity({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      opportunityId: input.opportunityId
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : formatOpportunity(response)
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

async function createAuthenticatedAnalyticsMetricsApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: {
      baseUrl: string;
    }) => { request(request: AnalyticsMetricsHttpRequest): Promise<AnalyticsMetricsHttpResponse> };
    createApi?: typeof createAnalyticsMetricsApi;
    fetchImpl?: typeof fetch;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createAnalyticsMetricsApi> }> {
  const readAuthState = dependencies?.readAuthState ?? readCliAuthState;
  const authStateInput: { authFilePath?: string } = {};
  if (input.authFilePath !== undefined) {
    authStateInput.authFilePath = input.authFilePath;
  }

  const authState = await readAuthState(authStateInput);
  const createHttpClient = dependencies?.createHttpClient ?? ((clientInput: { baseUrl: string }) => {
    const httpClientDependencies: { fetchImpl?: typeof fetch } = {};
    if (dependencies?.fetchImpl !== undefined) {
      httpClientDependencies.fetchImpl = dependencies.fetchImpl;
    }

    return createCliHttpClient(clientInput, httpClientDependencies);
  });
  const httpClient = createHttpClient({ baseUrl: authState.base_url });
  const createApi = dependencies?.createApi ?? createAnalyticsMetricsApi;

  return {
    authState,
    api: createApi(httpClient)
  };
}

export async function getAnalyticsSummaryWithAuthCommand(
  input: Omit<AnalyticsSummaryCommandInput, "bearerToken"> & { authFilePath?: string },
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsMetricsApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedAnalyticsMetricsApi,
    dependencies,
    runCommand: (authState, api) => {
      return getAnalyticsSummaryCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          from: input.from,
          to: input.to,
          last: input.last,
          granularity: input.granularity,
          service: input.service,
          environment: input.environment,
          limit: input.limit,
          json: input.json
        },
        api
      );
    }
  });
}

type AnalyticsMetricWithAuthInput = Omit<AnalyticsSummaryCommandInput, "bearerToken"> & { authFilePath?: string };
type AnalyticsFunnelWithAuthInput = Omit<AnalyticsFunnelCommandInput, "bearerToken"> & { authFilePath?: string };
type AnalyticsOpportunitiesWithAuthInput = Omit<AnalyticsOpportunitiesCommandInput, "bearerToken"> & { authFilePath?: string };
type AnalyticsOpportunityGetWithAuthInput = Omit<AnalyticsOpportunityGetCommandInput, "bearerToken"> & { authFilePath?: string };

async function runAnalyticsMetricWithAuthCommand(
  input: AnalyticsMetricWithAuthInput,
  dependencies: Parameters<typeof createAuthenticatedAnalyticsMetricsApi>[1] | undefined,
  run: (authState: CliAuthState, api: ReturnType<typeof createAnalyticsMetricsApi>) => Promise<CliCommandResult>
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedAnalyticsMetricsApi,
    dependencies,
    runCommand: run
  });
}

function withBearerToken(
  authState: CliAuthState,
  input: AnalyticsMetricWithAuthInput
): AnalyticsSummaryCommandInput {
  return {
    bearerToken: authState.bearer_token,
    projectId: input.projectId,
    from: input.from,
    to: input.to,
    last: input.last,
    granularity: input.granularity,
    service: input.service,
    environment: input.environment,
    limit: input.limit,
    json: input.json
  };
}

export async function getAnalyticsRoutesWithAuthCommand(
  input: AnalyticsMetricWithAuthInput,
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsMetricsApi>[1]
): Promise<CliCommandResult> {
  return runAnalyticsMetricWithAuthCommand(input, dependencies, (authState, api) =>
    getAnalyticsRoutesCommand(withBearerToken(authState, input), api)
  );
}

export async function getAnalyticsJourneysWithAuthCommand(
  input: AnalyticsMetricWithAuthInput,
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsMetricsApi>[1]
): Promise<CliCommandResult> {
  return runAnalyticsMetricWithAuthCommand(input, dependencies, (authState, api) =>
    getAnalyticsJourneysCommand(withBearerToken(authState, input), api)
  );
}

export async function getAnalyticsDevicesWithAuthCommand(
  input: AnalyticsMetricWithAuthInput,
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsMetricsApi>[1]
): Promise<CliCommandResult> {
  return runAnalyticsMetricWithAuthCommand(input, dependencies, (authState, api) =>
    getAnalyticsDevicesCommand(withBearerToken(authState, input), api)
  );
}

export async function getAnalyticsReferrersWithAuthCommand(
  input: AnalyticsMetricWithAuthInput,
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsMetricsApi>[1]
): Promise<CliCommandResult> {
  return runAnalyticsMetricWithAuthCommand(input, dependencies, (authState, api) =>
    getAnalyticsReferrersCommand(withBearerToken(authState, input), api)
  );
}

export async function getAnalyticsFunnelWithAuthCommand(
  input: AnalyticsFunnelWithAuthInput,
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsMetricsApi>[1]
): Promise<CliCommandResult> {
  return runAnalyticsMetricWithAuthCommand(input, dependencies, (authState, api) =>
    getAnalyticsFunnelCommand(
      {
        ...withBearerToken(authState, input),
        funnelKey: input.funnelKey
      },
      api
    )
  );
}

export async function listAnalyticsOpportunitiesWithAuthCommand(
  input: AnalyticsOpportunitiesWithAuthInput,
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsMetricsApi>[1]
): Promise<CliCommandResult> {
  return runAnalyticsMetricWithAuthCommand(input, dependencies, (authState, api) =>
    listAnalyticsOpportunitiesCommand(
      {
        bearerToken: authState.bearer_token,
        projectId: input.projectId,
        status: input.status,
        kind: input.kind,
        cursor: input.cursor,
        limit: input.limit,
        json: input.json
      },
      api
    )
  );
}

export async function getAnalyticsOpportunityWithAuthCommand(
  input: AnalyticsOpportunityGetWithAuthInput,
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsMetricsApi>[1]
): Promise<CliCommandResult> {
  return runAnalyticsMetricWithAuthCommand(input, dependencies, (authState, api) =>
    getAnalyticsOpportunityCommand(
      {
        bearerToken: authState.bearer_token,
        projectId: input.projectId,
        opportunityId: input.opportunityId,
        json: input.json
      },
      api
    )
  );
}
