import { API_BASE, buildBrowserSessionHeaders, readJson } from "./api-client.js";
import type {
  AnalyticsBundleGenerationsListResponse,
  AnalyticsBundleInventoryQuery,
  AnalyticsMetricsQuery,
  AnalyticsOpportunitiesListResponse,
  AnalyticsOpportunityInventoryQuery,
  ProjectAnalyticsDeviceMetricsResponse,
  ProjectAnalyticsFunnelAnalysisResponse,
  ProjectAnalyticsFunnelsResponse,
  ProjectAnalyticsJourneyPatternsResponse,
  ProjectAnalyticsJourneySampleResponse,
  ProjectAnalyticsReferrerMetricsResponse,
  ProjectAnalyticsRouteMetricsResponse,
  ProjectAnalyticsSettingsResponse,
  ProjectAnalyticsSettingsUpdate,
  ProjectAnalyticsUsageSummaryResponse
} from "./api-types.js";

export async function getProjectAnalyticsSettings(
  projectId: string
): Promise<ProjectAnalyticsSettingsResponse> {
  return readJson<ProjectAnalyticsSettingsResponse>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/analytics-settings`, {
      credentials: "include"
    })
  );
}

export async function updateProjectAnalyticsSettings(
  projectId: string,
  payload: ProjectAnalyticsSettingsUpdate
): Promise<ProjectAnalyticsSettingsResponse> {
  return readJson<ProjectAnalyticsSettingsResponse>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/analytics-settings`, {
      method: "PATCH",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );
}

function buildProjectAnalyticsSearchParams(
  projectId: string,
  query: AnalyticsMetricsQuery
): URLSearchParams {
  const searchParams = new URLSearchParams({ project_id: projectId });
  if (query.last !== undefined) searchParams.set("last", query.last);
  if (query.granularity !== undefined) searchParams.set("granularity", query.granularity);
  if (query.service !== undefined) searchParams.set("service", query.service);
  if (query.environment !== undefined) searchParams.set("environment", query.environment);
  if (query.limit !== undefined) searchParams.set("limit", String(query.limit));
  return searchParams;
}

export async function getProjectAnalyticsSummary(
  projectId: string,
  query: AnalyticsMetricsQuery
): Promise<ProjectAnalyticsUsageSummaryResponse> {
  return getProjectAnalyticsMetric(projectId, "/v1/analytics/summary", query);
}

export async function getProjectAnalyticsRoutes(
  projectId: string,
  query: AnalyticsMetricsQuery
): Promise<ProjectAnalyticsRouteMetricsResponse> {
  return getProjectAnalyticsMetric(projectId, "/v1/analytics/routes", query);
}

export async function getProjectAnalyticsDevices(
  projectId: string,
  query: AnalyticsMetricsQuery
): Promise<ProjectAnalyticsDeviceMetricsResponse> {
  return getProjectAnalyticsMetric(projectId, "/v1/analytics/devices", query);
}

export async function getProjectAnalyticsReferrers(
  projectId: string,
  query: AnalyticsMetricsQuery
): Promise<ProjectAnalyticsReferrerMetricsResponse> {
  return getProjectAnalyticsMetric(projectId, "/v1/analytics/referrers", query);
}

export async function getProjectAnalyticsFunnels(
  projectId: string,
  query: AnalyticsMetricsQuery
): Promise<ProjectAnalyticsFunnelsResponse> {
  return getProjectAnalyticsMetric(projectId, "/v1/analytics/funnels", query);
}

export async function getProjectAnalyticsFunnel(
  projectId: string,
  funnelKey: string,
  query: AnalyticsMetricsQuery
): Promise<ProjectAnalyticsFunnelAnalysisResponse> {
  return getProjectAnalyticsMetric(
    projectId,
    `/v1/analytics/funnels/${encodeURIComponent(funnelKey)}`,
    query
  );
}

export async function getProjectAnalyticsJourneyPatterns(
  projectId: string,
  query: AnalyticsMetricsQuery
): Promise<ProjectAnalyticsJourneyPatternsResponse> {
  return getProjectAnalyticsMetric(projectId, "/v1/analytics/journey-patterns", query);
}

export async function getProjectAnalyticsJourneySample(
  projectId: string,
  sampleId: string
): Promise<ProjectAnalyticsJourneySampleResponse> {
  const searchParams = new URLSearchParams({ project_id: projectId });
  return readJson<ProjectAnalyticsJourneySampleResponse>(
    await fetch(
      `${API_BASE}/v1/analytics/journey-samples/${encodeURIComponent(sampleId)}?${searchParams.toString()}`,
      { credentials: "include" }
    )
  );
}

async function getProjectAnalyticsMetric<TResponse>(
  projectId: string,
  path: string,
  query: AnalyticsMetricsQuery
): Promise<TResponse> {
  const searchParams = buildProjectAnalyticsSearchParams(projectId, query);
  return readJson<TResponse>(
    await fetch(`${API_BASE}${path}?${searchParams.toString()}`, {
      credentials: "include"
    })
  );
}

export async function listProjectAnalyticsOpportunities(
  projectId: string,
  limit = 20
): Promise<AnalyticsOpportunitiesListResponse> {
  const searchParams = new URLSearchParams({
    project_id: projectId,
    status: "open",
    limit: String(limit)
  });
  return readJson<AnalyticsOpportunitiesListResponse>(
    await fetch(`${API_BASE}/v1/analytics/opportunities?${searchParams.toString()}`, {
      credentials: "include"
    })
  );
}

function buildAnalyticsInventorySearchParams(
  query: AnalyticsOpportunityInventoryQuery | AnalyticsBundleInventoryQuery
): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (query.projectId !== undefined) searchParams.set("project_id", query.projectId);
  if (query.status !== undefined) searchParams.set("status", query.status);
  if (query.kind !== undefined) searchParams.set("kind", query.kind);
  if (query.service !== undefined) searchParams.set("service", query.service);
  if (query.environment !== undefined) searchParams.set("environment", query.environment);
  if (query.from !== undefined) searchParams.set("from", query.from);
  if (query.to !== undefined) searchParams.set("to", query.to);
  if (query.cursor !== undefined) searchParams.set("cursor", query.cursor);
  if (query.limit !== undefined) searchParams.set("limit", String(query.limit));
  return searchParams;
}

export async function listAnalyticsOpportunities(
  query: AnalyticsOpportunityInventoryQuery
): Promise<AnalyticsOpportunitiesListResponse> {
  const searchParams = buildAnalyticsInventorySearchParams(query);
  if (query.severity !== undefined) searchParams.set("severity", query.severity);
  if (query.bundleStatus !== undefined) searchParams.set("bundle_status", query.bundleStatus);
  return readJson<AnalyticsOpportunitiesListResponse>(
    await fetch(`${API_BASE}/v1/analytics/opportunities?${searchParams.toString()}`, {
      credentials: "include"
    })
  );
}

export async function listAnalyticsBundles(
  query: AnalyticsBundleInventoryQuery
): Promise<AnalyticsBundleGenerationsListResponse> {
  const searchParams = buildAnalyticsInventorySearchParams(query);
  return readJson<AnalyticsBundleGenerationsListResponse>(
    await fetch(`${API_BASE}/v1/analytics/bundles?${searchParams.toString()}`, {
      credentials: "include"
    })
  );
}
