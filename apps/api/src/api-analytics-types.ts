import type {
  AnalyticsSettings,
  AnalyticsSettingsUpdate,
  AnalyticsActionMetricsResponse,
  AnalyticsBundleAnalysisKind,
  AnalyticsBundleSeverity,
  AnalyticsCapabilities,
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
  AnalyticsSpaceStore,
  AnalyticsSpacePlanStore,
  AnalyticsWriterStore,
  AnalyticsMeasurementPlanStore,
  AnalyticsAllowanceClaimInput,
  AnalyticsAllowanceClaimResult,
  AnalyticsAllowanceReleaseInput,
  AnalyticsAllowanceUsageSummary,
  AnalyticsBundleGenerationInventoryRecord,
  AnalyticsBundleGenerationRecord,
  AnalyticsBundleGenerationStatus
} from "../../../packages/storage/src/index.js";
import type { persistCurrentProjectSemanticAnalyticsEvent } from "../../../packages/storage/src/semantic-analytics-persistence.js";
import type { readProjectSemanticFunnelReport } from "../../../packages/storage/src/semantic-analytics-funnel-report.js";
import type { readRecentProjectSemanticFunnelReport } from "../../../packages/storage/src/semantic-analytics-funnel-report.js";
import type { retryFailedSemanticAnalyticsEvent } from "../../../packages/storage/src/semantic-analytics-job-recovery.js";
import type {
  associateProjectAnalyticsIdentityContext,
  createProjectAnalyticsIdentityContext,
  revokeProjectAnalyticsIdentityContext
} from "../../../packages/storage/src/analytics-identity-context-store.js";
import type {
  applyProjectAnalyticsIdentityNamespaceChange,
  previewProjectAnalyticsIdentityNamespaceChange,
  readProjectAnalyticsIdentityNamespace,
  ProjectAnalyticsIdentityNamespaceChange
} from "../../../packages/storage/src/analytics-identity-namespace-store.js";
import type {
  AnalyticsIdentityAssociation,
  AnalyticsIdentityContextCreate,
  AnalyticsIdentityRevoke,
  AnalyticsRelayIdentityContextReference
} from "../../../packages/shared-types/src/analytics-identity.js";
import type {
  readProjectAnalyticsSubjectErasureStatus,
  requestProjectAnalyticsSubjectErasure
} from "../../../packages/storage/src/analytics-subject-erasure-store.js";
import type { AnalyticsSubjectErasureRequest } from "../../../packages/shared-types/src/analytics-identity.js";

type SemanticDeliveryResult = Awaited<
  ReturnType<typeof persistCurrentProjectSemanticAnalyticsEvent>
>;

export interface ApiAnalyticsDependencies {
  semanticAnalyticsCapabilities?: {
    enabled: boolean;
    resolve(input: {
      projectId: string;
      principal: "server_writer" | "project_token";
      credentialHash: string;
      receivedAt: string;
    }): Promise<AnalyticsCapabilities | null>;
  };
  semanticAnalyticsReports?: {
    enabled: boolean;
    read(input: {
      actorUserId: string;
      projectId: string;
      reportKey: string;
      from: string;
      to: string;
    }): ReturnType<typeof readProjectSemanticFunnelReport>;
    readRecent(input: {
      actorUserId: string;
      projectId: string;
      reportKey: string;
      last: string;
    }): ReturnType<typeof readRecentProjectSemanticFunnelReport>;
  };
  semanticAnalyticsJobRecovery?: {
    enabled: boolean;
    retry(input: {
      actorUserId: string;
      projectId: string;
      eventId: string;
    }): ReturnType<typeof retryFailedSemanticAnalyticsEvent>;
  };
  analyticsIdentityNamespace?: {
    enabled: boolean;
    read(
      actorUserId: string,
      projectId: string
    ): ReturnType<typeof readProjectAnalyticsIdentityNamespace>;
    preview(
      change: ProjectAnalyticsIdentityNamespaceChange
    ): ReturnType<typeof previewProjectAnalyticsIdentityNamespaceChange>;
    apply(
      change: ProjectAnalyticsIdentityNamespaceChange
    ): ReturnType<typeof applyProjectAnalyticsIdentityNamespaceChange>;
  };
  semanticAnalyticsIdentityContexts?: {
    enabled: boolean;
    create(
      credentialHash: string,
      request: AnalyticsIdentityContextCreate
    ): ReturnType<typeof createProjectAnalyticsIdentityContext>;
    associate(
      credentialHash: string,
      request: AnalyticsIdentityAssociation
    ): ReturnType<typeof associateProjectAnalyticsIdentityContext>;
    revoke(
      credentialHash: string,
      request: AnalyticsIdentityRevoke
    ): ReturnType<typeof revokeProjectAnalyticsIdentityContext>;
  };
  semanticAnalyticsSubjectErasure?: {
    enabled: boolean;
    readStatus(input: {
      actorUserId: string;
      projectId: string;
      taskId: string;
    }): ReturnType<typeof readProjectAnalyticsSubjectErasureStatus>;
    request(
      credentialHash: string,
      request: AnalyticsSubjectErasureRequest
    ): ReturnType<typeof requestProjectAnalyticsSubjectErasure>;
  };
  semanticAnalyticsDelivery?: {
    enabled: boolean;
    getRateLimitPerMinute(projectId: string): Promise<number | null>;
    persist(input: {
      projectId: string;
      credentialHash: string;
      event: unknown;
    }): Promise<SemanticDeliveryResult>;
  };
  semanticAnalyticsRelayDelivery?: {
    enabled: boolean;
    getRateLimitPerMinute(projectId: string): Promise<number | null>;
    persist(input: {
      projectId: string;
      credentialHash: string;
      event: unknown;
      identityContext?: AnalyticsRelayIdentityContextReference;
    }): Promise<SemanticDeliveryResult>;
  };
  semanticAnalyticsClientDelivery?: {
    enabled: boolean;
    persist(input: {
      projectId: string;
      credentialHash: string;
      event: unknown;
    }): Promise<SemanticDeliveryResult>;
  };
  analyticsSpaces?: AnalyticsSpaceStore | undefined;
  analyticsSpacePlans?: AnalyticsSpacePlanStore | undefined;
  analyticsWriters?: AnalyticsWriterStore | undefined;
  analyticsPlans?: AnalyticsMeasurementPlanStore | undefined;
  analyticsSavedFunnels?:
    | {
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
      }
    | undefined;
  analyticsSettingsManagement?:
    | {
        getAnalyticsSettingsForProject(input: {
          organization_id: string;
          project_id: string;
        }): Promise<AnalyticsSettings | null>;
        updateAnalyticsSettingsForProject(input: {
          organization_id: string;
          project_id: string;
          update: AnalyticsSettingsUpdate;
        }): Promise<AnalyticsSettings | null>;
      }
    | undefined;
  analyticsMetrics?:
    | {
        getUsageSummaryForProject(
          input: AnalyticsMetricsQueryInput
        ): Promise<AnalyticsUsageSummaryResponse>;
        getRouteMetricsForProject(
          input: AnalyticsMetricsQueryInput
        ): Promise<AnalyticsRouteMetricsResponse>;
        getJourneyPatternsForProject(
          input: AnalyticsMetricsQueryInput
        ): Promise<AnalyticsJourneyPatternsResponse>;
        getDeviceBreakdownForProject(
          input: AnalyticsMetricsQueryInput
        ): Promise<AnalyticsDeviceBreakdownResponse>;
        getReferrerMetricsForProject(
          input: AnalyticsMetricsQueryInput
        ): Promise<AnalyticsReferrerMetricsResponse>;
        getActionMetricsForProject(
          input: AnalyticsMetricsQueryInput
        ): Promise<AnalyticsActionMetricsResponse>;
        listFunnelsForProject(input: AnalyticsMetricsQueryInput): Promise<AnalyticsFunnelsResponse>;
        getFunnelAnalysisForProject(
          input: AnalyticsFunnelQueryInput
        ): Promise<AnalyticsFunnelAnalysisResponse>;
        getIncidentImpactForProject(
          input: AnalyticsIncidentImpactQueryInput
        ): Promise<AnalyticsIncidentImpactResponse>;
      }
    | undefined;
  analyticsJourneySamples?:
    | {
        listAnalyticsJourneySamplesForProject(input: {
          organization_id: string;
          project_id: string;
          service?: string | undefined;
          environment?: string | undefined;
          tag?: string | undefined;
          cursor?: { last_seen_at: string; sample_id: string } | undefined;
          limit: number;
          now: string;
        }): Promise<{
          samples: Array<AnalyticsJourneySampleMetadata & { object_key: string }>;
          next_cursor: string | null;
        }>;
        getAnalyticsJourneySampleForProject(input: {
          organization_id: string;
          project_id: string;
          sample_id: string;
          now: string;
        }): Promise<(AnalyticsJourneySampleMetadata & { object_key: string }) | null>;
      }
    | undefined;
  analyticsOpportunities?:
    | {
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
      }
    | undefined;
  analyticsUsage?:
    | {
        getAnalyticsUsageForOrganization(input: {
          organization_id: string;
          period_starts_at: string;
        }): Promise<AnalyticsAllowanceUsageSummary>;
        claimAnalyticsUsageForOrganization(
          input: AnalyticsAllowanceClaimInput
        ): Promise<AnalyticsAllowanceClaimResult>;
        releaseAnalyticsUsageForOrganization(input: AnalyticsAllowanceReleaseInput): Promise<void>;
      }
    | undefined;
  analyticsBundles?:
    | {
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
        }): Promise<{
          bundles: AnalyticsBundleGenerationInventoryRecord[];
          next_cursor: string | null;
        }>;
        requestAnalyticsBundleGenerationForProject(input: {
          organization_id: string;
          project_id: string;
          opportunity_id?: string | null | undefined;
          requested_by_user_id: string | null;
          analysis_kind: AnalyticsBundleAnalysisKind;
          analysis_spec: Record<string, unknown>;
        }): Promise<AnalyticsBundleGenerationRecord>;
        getAnalyticsBundleGenerationForProject(input: {
          organization_id: string;
          project_id: string;
          generation_id: string;
        }): Promise<AnalyticsBundleGenerationRecord | null>;
      }
    | undefined;
}

type AnalyticsMetricsQueryInput = {
  organization_id: string;
  project_id: string;
  from: string;
  to: string;
  granularity: "hour" | "day";
  service?: string | undefined;
  environment?: string | undefined;
  route?: string | undefined;
  device_type?: string | undefined;
  browser?: string | undefined;
  os?: string | undefined;
  language?: string | undefined;
  country?: string | undefined;
  auth_state?: "anonymous" | "authenticated" | "unknown" | undefined;
  referrer?: string | undefined;
  utm_source?: string | undefined;
  utm_medium?: string | undefined;
  utm_campaign?: string | undefined;
  custom_dimensions?: Record<string, string> | undefined;
  limit?: number | undefined;
};

type AnalyticsFunnelQueryInput = AnalyticsMetricsQueryInput & {
  funnel_key: string;
};

type AnalyticsIncidentImpactQueryInput = AnalyticsMetricsQueryInput & {
  incident_id: string;
};
