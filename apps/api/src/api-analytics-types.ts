import type {
  AnalyticsSettings,
  AnalyticsSettingsUpdate,
  AnalyticsActionMetricsResponse,
  AnalyticsBundleAnalysisKind,
  AnalyticsBundleSeverity,
  AnalyticsDeviceBreakdownResponse,
  AnalyticsFunnelAnalysisResponse,
  AnalyticsFunnelsResponse,
  AnalyticsIncidentImpactResponse,
  AnalyticsJourneySampleMetadata,
  AnalyticsJourneyPatternsResponse,
  AnalyticsOpportunitiesListResponse,
  AnalyticsOpportunityResponse,
  AnalyticsOpportunityBundleStatus,
  AnalyticsOpportunityStatus,
  AnalyticsReferrerMetricsResponse,
  AnalyticsRouteMetricsResponse,
  AnalyticsSavedFunnel,
  AnalyticsSavedFunnelCreate,
  AnalyticsSavedFunnelUpdate,
  AnalyticsUsageSummaryResponse
} from "../../../packages/shared-types/src/index.js";
import type {
  AnalyticsAllowanceClaimInput,
  AnalyticsAllowanceClaimResult,
  AnalyticsAllowanceReleaseInput,
  AnalyticsAllowanceUsageSummary,
  AnalyticsBundleGenerationInventoryRecord,
  AnalyticsBundleGenerationRecord,
  AnalyticsBundleGenerationStatus
} from "../../../packages/storage/src/index.js";

export interface ApiAnalyticsDependencies {
  analyticsSavedFunnels?: {
    listSavedFunnelsForProject(input: {
      organization_id: string;
      project_id: string;
    }): Promise<AnalyticsSavedFunnel[]>;
    createSavedFunnelForProject(input: {
      organization_id: string;
      project_id: string;
      created_by_user_id: string;
      definition: AnalyticsSavedFunnelCreate;
    }): Promise<
      | { status: "created"; funnel: AnalyticsSavedFunnel }
      | { status: "project_not_found" | "funnel_key_taken" | "limit_reached" }
    >;
    updateSavedFunnelForProject(input: {
      organization_id: string;
      project_id: string;
      funnel_key: string;
      update: AnalyticsSavedFunnelUpdate;
    }): Promise<AnalyticsSavedFunnel | null>;
    archiveSavedFunnelForProject(input: {
      organization_id: string;
      project_id: string;
      funnel_key: string;
    }): Promise<AnalyticsSavedFunnel | null>;
  } | undefined;
  analyticsSettingsManagement?: {
    getAnalyticsSettingsForProject(input: {
      organization_id: string;
      project_id: string;
    }): Promise<AnalyticsSettings | null>;
    updateAnalyticsSettingsForProject(input: {
      organization_id: string;
      project_id: string;
      update: AnalyticsSettingsUpdate;
    }): Promise<AnalyticsSettings | null>;
  } | undefined;
  analyticsMetrics?: {
    getUsageSummaryForProject(input: AnalyticsMetricsQueryInput): Promise<AnalyticsUsageSummaryResponse>;
    getRouteMetricsForProject(input: AnalyticsMetricsQueryInput): Promise<AnalyticsRouteMetricsResponse>;
    getJourneyPatternsForProject(input: AnalyticsMetricsQueryInput): Promise<AnalyticsJourneyPatternsResponse>;
    getDeviceBreakdownForProject(input: AnalyticsMetricsQueryInput): Promise<AnalyticsDeviceBreakdownResponse>;
    getReferrerMetricsForProject(input: AnalyticsMetricsQueryInput): Promise<AnalyticsReferrerMetricsResponse>;
    getActionMetricsForProject(input: AnalyticsMetricsQueryInput): Promise<AnalyticsActionMetricsResponse>;
    listFunnelsForProject(input: AnalyticsMetricsQueryInput): Promise<AnalyticsFunnelsResponse>;
    getFunnelAnalysisForProject(input: AnalyticsFunnelQueryInput): Promise<AnalyticsFunnelAnalysisResponse>;
    getIncidentImpactForProject(input: AnalyticsIncidentImpactQueryInput): Promise<AnalyticsIncidentImpactResponse>;
  } | undefined;
  analyticsJourneySamples?: {
    listAnalyticsJourneySamplesForProject(input: {
      organization_id: string;
      project_id: string;
      service?: string | undefined;
      environment?: string | undefined;
      tag?: string | undefined;
      cursor?: { last_seen_at: string; sample_id: string } | undefined;
      limit: number;
      now: string;
    }): Promise<{ samples: Array<AnalyticsJourneySampleMetadata & { object_key: string }>; next_cursor: string | null }>;
    getAnalyticsJourneySampleForProject(input: {
      organization_id: string;
      project_id: string;
      sample_id: string;
      now: string;
    }): Promise<(AnalyticsJourneySampleMetadata & { object_key: string }) | null>;
  } | undefined;
  analyticsOpportunities?: {
    listAnalyticsOpportunitiesForProject(input: {
      organization_id: string;
      project_id: string;
      status?: AnalyticsOpportunityStatus | undefined;
      kind?: AnalyticsBundleAnalysisKind | undefined;
      service?: string | undefined;
      environment?: string | undefined;
      severity?: AnalyticsBundleSeverity | undefined;
      bundle_status?: AnalyticsOpportunityBundleStatus | undefined;
      from?: string | undefined;
      to?: string | undefined;
      cursor?: { last_detected_at: string; opportunity_id: string } | undefined;
      limit: number;
    }): Promise<AnalyticsOpportunitiesListResponse>;
    listAnalyticsOpportunitiesForOrganization(input: {
      organization_id: string;
      status?: AnalyticsOpportunityStatus | undefined;
      kind?: AnalyticsBundleAnalysisKind | undefined;
      service?: string | undefined;
      environment?: string | undefined;
      severity?: AnalyticsBundleSeverity | undefined;
      bundle_status?: AnalyticsOpportunityBundleStatus | undefined;
      from?: string | undefined;
      to?: string | undefined;
      cursor?: { last_detected_at: string; opportunity_id: string } | undefined;
      limit: number;
    }): Promise<AnalyticsOpportunitiesListResponse>;
    getAnalyticsOpportunityForProject(input: {
      organization_id: string;
      project_id: string;
      opportunity_id: string;
    }): Promise<AnalyticsOpportunityResponse | null>;
  } | undefined;
  analyticsUsage?: {
    getAnalyticsUsageForOrganization(input: {
      organization_id: string;
      period_starts_at: string;
    }): Promise<AnalyticsAllowanceUsageSummary>;
    claimAnalyticsUsageForOrganization(input: AnalyticsAllowanceClaimInput): Promise<AnalyticsAllowanceClaimResult>;
    releaseAnalyticsUsageForOrganization(input: AnalyticsAllowanceReleaseInput): Promise<void>;
  } | undefined;
  analyticsBundles?: {
    listAnalyticsBundleGenerationsForProject(input: {
      organization_id: string;
      project_id: string;
      status?: AnalyticsBundleGenerationStatus | undefined;
      analysis_kind?: AnalyticsBundleAnalysisKind | undefined;
      service?: string | undefined;
      environment?: string | undefined;
      from?: string | undefined;
      to?: string | undefined;
      cursor?: { created_at: string; generation_id: string } | undefined;
      limit: number;
    }): Promise<{ bundles: AnalyticsBundleGenerationRecord[]; next_cursor: string | null }>;
    listAnalyticsBundleGenerationsForOrganization(input: {
      organization_id: string;
      status?: AnalyticsBundleGenerationStatus | undefined;
      analysis_kind?: AnalyticsBundleAnalysisKind | undefined;
      service?: string | undefined;
      environment?: string | undefined;
      from?: string | undefined;
      to?: string | undefined;
      cursor?: { created_at: string; generation_id: string } | undefined;
      limit: number;
    }): Promise<{ bundles: AnalyticsBundleGenerationInventoryRecord[]; next_cursor: string | null }>;
    requestAnalyticsBundleGenerationForProject(input: {
      organization_id: string;
      project_id: string;
      requested_by_user_id: string | null;
      analysis_kind: AnalyticsBundleAnalysisKind;
      analysis_spec: Record<string, unknown>;
    }): Promise<AnalyticsBundleGenerationRecord>;
    getAnalyticsBundleGenerationForProject(input: {
      organization_id: string;
      project_id: string;
      generation_id: string;
    }): Promise<AnalyticsBundleGenerationRecord | null>;
  } | undefined;
}

type AnalyticsMetricsQueryInput = {
  organization_id: string;
  project_id: string;
  from: string;
  to: string;
  granularity: "hour" | "day";
  service?: string | undefined;
  environment?: string | undefined;
  limit?: number | undefined;
};

type AnalyticsFunnelQueryInput = AnalyticsMetricsQueryInput & {
  funnel_key: string;
};

type AnalyticsIncidentImpactQueryInput = AnalyticsMetricsQueryInput & {
  incident_id: string;
};
