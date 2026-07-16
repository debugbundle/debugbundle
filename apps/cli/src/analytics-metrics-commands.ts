import {
  AnalyticsOpportunityBundleStatusSchema,
  AnalyticsBundleSeveritySchema,
  AnalyticsOpportunityStatusSchema,
  type AnalyticsActionMetricsResponse,
  type AnalyticsBundleAnalysisKind,
  type AnalyticsBundleSeverity,
  type AnalyticsDeviceBreakdownResponse,
  type AnalyticsFunnelAnalysisResponse,
  type AnalyticsFunnelsResponse,
  type AnalyticsIncidentImpactResponse,
  type AnalyticsJourneyPatternsResponse,
  type AnalyticsMetricsGranularity,
  type AnalyticsOpportunitiesListResponse,
  type AnalyticsOpportunityResponse,
  type AnalyticsOpportunityBundleStatus,
  type AnalyticsOpportunityStatus,
  type AnalyticsReferrerMetricsResponse,
  type AnalyticsRouteMetricsResponse,
  type AnalyticsUsageSummaryResponse
} from "../../../packages/shared-types/src/index.js";
import {
  AnalyticsMetricsApiError,
  createAnalyticsMetricsApi,
  type AnalyticsMetricsHttpRequest,
  type AnalyticsMetricsHttpResponse
} from "./analytics-metrics-api.js";
import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState } from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";
import type { CliCommandResult } from "./token-commands.js";

export { AnalyticsMetricsApiError, createAnalyticsMetricsApi } from "./analytics-metrics-api.js";

export interface AnalyticsSummaryCommandInput {
  bearerToken: string;
  projectId: string;
  from?: string | undefined;
  to?: string | undefined;
  last?: string | undefined;
  granularity?: AnalyticsMetricsGranularity | undefined;
  service?: string | undefined;
  environment?: string | undefined;
  route?: string | undefined;
  deviceType?: string | undefined;
  browser?: string | undefined;
  os?: string | undefined;
  language?: string | undefined;
  country?: string | undefined;
  authState?: "anonymous" | "authenticated" | "unknown" | undefined;
  referrer?: string | undefined;
  utmSource?: string | undefined;
  utmMedium?: string | undefined;
  utmCampaign?: string | undefined;
  customDimensions?: Record<string, string> | undefined;
  limit?: number | undefined;
  json?: boolean | undefined;
}

export type AnalyticsMetricQueryInput = Omit<AnalyticsSummaryCommandInput, "json">;

export interface AnalyticsFunnelCommandInput extends AnalyticsSummaryCommandInput {
  funnelKey: string;
}

export interface AnalyticsIncidentImpactCommandInput extends AnalyticsSummaryCommandInput {
  incidentId: string;
}

export interface AnalyticsOpportunitiesCommandInput {
  bearerToken: string;
  projectId?: string | undefined;
  status?: AnalyticsOpportunityStatus | "all" | undefined;
  kind?: AnalyticsBundleAnalysisKind | undefined;
  service?: string | undefined;
  environment?: string | undefined;
  severity?: AnalyticsBundleSeverity | undefined;
  bundleStatus?: AnalyticsOpportunityBundleStatus | undefined;
  from?: string | undefined;
  to?: string | undefined;
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

function toAnalyticsMetricQueryInput(
  input: AnalyticsSummaryCommandInput
): AnalyticsMetricQueryInput {
  return {
    bearerToken: input.bearerToken,
    projectId: input.projectId,
    from: input.from,
    to: input.to,
    last: input.last,
    granularity: input.granularity,
    service: input.service,
    environment: input.environment,
    ...(input.route === undefined ? {} : { route: input.route }),
    ...(input.deviceType === undefined ? {} : { deviceType: input.deviceType }),
    ...(input.browser === undefined ? {} : { browser: input.browser }),
    ...(input.os === undefined ? {} : { os: input.os }),
    ...(input.language === undefined ? {} : { language: input.language }),
    ...(input.country === undefined ? {} : { country: input.country }),
    ...(input.authState === undefined ? {} : { authState: input.authState }),
    ...(input.referrer === undefined ? {} : { referrer: input.referrer }),
    ...(input.utmSource === undefined ? {} : { utmSource: input.utmSource }),
    ...(input.utmMedium === undefined ? {} : { utmMedium: input.utmMedium }),
    ...(input.utmCampaign === undefined ? {} : { utmCampaign: input.utmCampaign }),
    ...(input.customDimensions === undefined ? {} : { customDimensions: input.customDimensions }),
    limit: input.limit
  };
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

function formatTopSegments(
  label: string,
  segments: AnalyticsUsageSummaryResponse["breakdowns"]["device_types"]
): string {
  if (segments.length === 0) {
    return `${label}: none`;
  }

  return `${label}: ${segments
    .slice(0, 5)
    .map(
      (segment) => `${segment.value} (${segment.sessions} sessions, ${segment.pageviews} pageviews)`
    )
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
    const response = await api.getUsageSummary(toAnalyticsMetricQueryInput(input));

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
    .map(
      (route) =>
        `${route.route_key}: ${route.pageviews} pageviews, ${route.unique_sessions} sessions, ${route.exits} exits`
    )
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

function formatActionMetrics(response: AnalyticsActionMetricsResponse): string {
  if (response.actions.length === 0) {
    return "No action metrics found.";
  }

  return response.actions
    .map(
      (action) =>
        `${action.action_key}: ${action.event_count} events, ${action.unique_sessions} sessions, ${action.kind}`
    )
    .join("\n");
}

function formatFunnelAnalysis(response: AnalyticsFunnelAnalysisResponse): string {
  return [
    `funnel_key: ${response.funnel.funnel_key}`,
    `sessions_entered: ${response.funnel.sessions_entered}`,
    `sessions_completed: ${response.funnel.sessions_completed}`,
    `dropoffs: ${response.funnel.dropoffs}`,
    `conversion_rate: ${response.funnel.conversion_rate}`,
    ...response.steps.map(
      (step) =>
        `${step.step_key}: ${step.sessions_entered} entered, ${step.sessions_completed} completed, ${step.dropoffs} dropoffs`
    )
  ].join("\n");
}

function formatFunnels(response: AnalyticsFunnelsResponse): string {
  if (response.funnels.length === 0) {
    return "No funnel metrics found.";
  }

  return response.funnels
    .map(
      (funnel) =>
        `${funnel.funnel_key}: ${funnel.sessions_entered} entered, ${funnel.sessions_completed} completed, ${funnel.dropoffs} dropoffs, ${funnel.conversion_rate} conversion`
    )
    .join("\n");
}

function formatIncidentImpact(response: AnalyticsIncidentImpactResponse): string {
  return [
    `incident_id: ${response.incident_id}`,
    `affected_sessions: ${response.affected_sessions}`,
    `affected_routes: ${response.affected_routes.map((route) => `${route.route_key} (${route.affected_sessions})`).join(", ") || "none"}`,
    `affected_funnels: ${response.affected_funnels.map((funnel) => `${funnel.funnel_key} (${funnel.affected_sessions})`).join(", ") || "none"}`,
    `top_device_types: ${response.top_device_types.map((segment) => `${segment.value} (${segment.affected_sessions})`).join(", ") || "none"}`,
    `top_browsers: ${response.top_browsers.map((segment) => `${segment.value} (${segment.affected_sessions})`).join(", ") || "none"}`,
    `journey_patterns: ${response.journey_patterns.map((pattern) => `${pattern.from_route_key} -> ${pattern.to_route_key} (${pattern.affected_sessions})`).join(", ") || "none"}`,
    `conversion_delta: ${response.conversion_delta.availability === "available" ? response.conversion_delta.value : "unavailable"}`,
    `analytics_bundle_status: ${response.analytics_bundle.status}`
  ].join("\n");
}

function formatOpportunities(response: AnalyticsOpportunitiesListResponse): string {
  if (response.opportunities.length === 0) {
    return "No analytics opportunities found.";
  }

  const rows = response.opportunities.map(
    (opportunity) =>
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
    const response = await apiCall(toAnalyticsMetricQueryInput(input));

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
  api: {
    getJourneyPatterns(input: AnalyticsMetricQueryInput): Promise<AnalyticsJourneyPatternsResponse>;
  }
): Promise<CliCommandResult> {
  return runAnalyticsMetricCommand(
    input,
    (request) => api.getJourneyPatterns(request),
    formatJourneyPatterns
  );
}

export async function getAnalyticsDevicesCommand(
  input: AnalyticsSummaryCommandInput,
  api: {
    getDeviceBreakdown(input: AnalyticsMetricQueryInput): Promise<AnalyticsDeviceBreakdownResponse>;
  }
): Promise<CliCommandResult> {
  return runAnalyticsMetricCommand(
    input,
    (request) => api.getDeviceBreakdown(request),
    formatDeviceBreakdown
  );
}

export async function getAnalyticsReferrersCommand(
  input: AnalyticsSummaryCommandInput,
  api: {
    getReferrerMetrics(input: AnalyticsMetricQueryInput): Promise<AnalyticsReferrerMetricsResponse>;
  }
): Promise<CliCommandResult> {
  return runAnalyticsMetricCommand(
    input,
    (request) => api.getReferrerMetrics(request),
    formatReferrerMetrics
  );
}

export async function getAnalyticsActionsCommand(
  input: AnalyticsSummaryCommandInput,
  api: {
    getActionMetrics(input: AnalyticsMetricQueryInput): Promise<AnalyticsActionMetricsResponse>;
  }
): Promise<CliCommandResult> {
  return runAnalyticsMetricCommand(
    input,
    (request) => api.getActionMetrics(request),
    formatActionMetrics
  );
}

export async function listAnalyticsFunnelsCommand(
  input: AnalyticsSummaryCommandInput,
  api: { listFunnels(input: AnalyticsMetricQueryInput): Promise<AnalyticsFunnelsResponse> }
): Promise<CliCommandResult> {
  return runAnalyticsMetricCommand(input, (request) => api.listFunnels(request), formatFunnels);
}

export async function getAnalyticsFunnelCommand(
  input: AnalyticsFunnelCommandInput,
  api: {
    getFunnelAnalysis(
      input: Omit<AnalyticsFunnelCommandInput, "json">
    ): Promise<AnalyticsFunnelAnalysisResponse>;
  }
): Promise<CliCommandResult> {
  try {
    const response = await api.getFunnelAnalysis({
      ...toAnalyticsMetricQueryInput(input),
      funnelKey: input.funnelKey
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

export async function getAnalyticsIncidentImpactCommand(
  input: AnalyticsIncidentImpactCommandInput,
  api: {
    getIncidentImpact(
      input: Omit<AnalyticsIncidentImpactCommandInput, "json">
    ): Promise<AnalyticsIncidentImpactResponse>;
  }
): Promise<CliCommandResult> {
  return runAnalyticsMetricCommand(
    input,
    (request) => api.getIncidentImpact({ ...request, incidentId: input.incidentId }),
    formatIncidentImpact
  );
}

export async function listAnalyticsOpportunitiesCommand(
  input: AnalyticsOpportunitiesCommandInput,
  api: {
    listOpportunities(
      input: Omit<AnalyticsOpportunitiesCommandInput, "json">
    ): Promise<AnalyticsOpportunitiesListResponse>;
  }
): Promise<CliCommandResult> {
  try {
    if (
      input.status !== undefined &&
      input.status !== "all" &&
      !AnalyticsOpportunityStatusSchema.safeParse(input.status).success
    ) {
      return { exitCode: 4, output: "Invalid value for --status." };
    }
    if (
      input.severity !== undefined &&
      !AnalyticsBundleSeveritySchema.safeParse(input.severity).success
    ) {
      return { exitCode: 4, output: "Invalid value for --severity." };
    }
    if (
      input.bundleStatus !== undefined &&
      !AnalyticsOpportunityBundleStatusSchema.safeParse(input.bundleStatus).success
    ) {
      return { exitCode: 4, output: "Invalid value for --bundle-status." };
    }

    const response = await api.listOpportunities({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      status: input.status,
      kind: input.kind,
      service: input.service,
      environment: input.environment,
      severity: input.severity,
      bundleStatus: input.bundleStatus,
      from: input.from,
      to: input.to,
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
  api: {
    getOpportunity(
      input: Omit<AnalyticsOpportunityGetCommandInput, "json">
    ): Promise<AnalyticsOpportunityResponse>;
  }
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
    createHttpClient?: (input: { baseUrl: string }) => {
      request(request: AnalyticsMetricsHttpRequest): Promise<AnalyticsMetricsHttpResponse>;
    };
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
  const createHttpClient =
    dependencies?.createHttpClient ??
    ((clientInput: { baseUrl: string }) => {
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
          route: input.route,
          deviceType: input.deviceType,
          browser: input.browser,
          os: input.os,
          language: input.language,
          country: input.country,
          authState: input.authState,
          referrer: input.referrer,
          utmSource: input.utmSource,
          utmMedium: input.utmMedium,
          utmCampaign: input.utmCampaign,
          customDimensions: input.customDimensions,
          limit: input.limit,
          json: input.json
        },
        api
      );
    }
  });
}

type AnalyticsMetricWithAuthInput = Omit<AnalyticsSummaryCommandInput, "bearerToken"> & {
  authFilePath?: string;
};
type AnalyticsFunnelWithAuthInput = Omit<AnalyticsFunnelCommandInput, "bearerToken"> & {
  authFilePath?: string;
};
type AnalyticsIncidentImpactWithAuthInput = Omit<
  AnalyticsIncidentImpactCommandInput,
  "bearerToken"
> & { authFilePath?: string };
type AnalyticsOpportunitiesWithAuthInput = Omit<
  AnalyticsOpportunitiesCommandInput,
  "bearerToken"
> & { authFilePath?: string };
type AnalyticsOpportunityGetWithAuthInput = Omit<
  AnalyticsOpportunityGetCommandInput,
  "bearerToken"
> & { authFilePath?: string };

async function runAnalyticsMetricWithAuthCommand(
  input: AnalyticsMetricWithAuthInput,
  dependencies: Parameters<typeof createAuthenticatedAnalyticsMetricsApi>[1] | undefined,
  run: (
    authState: CliAuthState,
    api: ReturnType<typeof createAnalyticsMetricsApi>
  ) => Promise<CliCommandResult>
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
    route: input.route,
    deviceType: input.deviceType,
    browser: input.browser,
    os: input.os,
    language: input.language,
    country: input.country,
    authState: input.authState,
    referrer: input.referrer,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    customDimensions: input.customDimensions,
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

export async function getAnalyticsActionsWithAuthCommand(
  input: AnalyticsMetricWithAuthInput,
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsMetricsApi>[1]
): Promise<CliCommandResult> {
  return runAnalyticsMetricWithAuthCommand(input, dependencies, (authState, api) =>
    getAnalyticsActionsCommand(withBearerToken(authState, input), api)
  );
}

export async function listAnalyticsFunnelsWithAuthCommand(
  input: AnalyticsMetricWithAuthInput,
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsMetricsApi>[1]
): Promise<CliCommandResult> {
  return runAnalyticsMetricWithAuthCommand(input, dependencies, (authState, api) =>
    listAnalyticsFunnelsCommand(withBearerToken(authState, input), api)
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

export async function getAnalyticsIncidentImpactWithAuthCommand(
  input: AnalyticsIncidentImpactWithAuthInput,
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsMetricsApi>[1]
): Promise<CliCommandResult> {
  return runAnalyticsMetricWithAuthCommand(input, dependencies, (authState, api) =>
    getAnalyticsIncidentImpactCommand(
      {
        ...withBearerToken(authState, input),
        incidentId: input.incidentId
      },
      api
    )
  );
}

export async function listAnalyticsOpportunitiesWithAuthCommand(
  input: AnalyticsOpportunitiesWithAuthInput,
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsMetricsApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedAnalyticsMetricsApi,
    dependencies,
    runCommand: (authState, api) =>
      listAnalyticsOpportunitiesCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          status: input.status,
          kind: input.kind,
          service: input.service,
          environment: input.environment,
          severity: input.severity,
          bundleStatus: input.bundleStatus,
          from: input.from,
          to: input.to,
          cursor: input.cursor,
          limit: input.limit,
          json: input.json
        },
        api
      )
  });
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
