import {
  getTierCapabilities,
  TIER_CAPABILITIES,
  type AnalyticsSettingsUpdate
} from "../../../packages/shared-types/src/index.js";
import {
  createAnalyticsSpaceStore,
  createAnalyticsSpacePlanStore,
  createAnalyticsWriterStore,
  createAnalyticsMeasurementPlanStore,
  createPostgresAnalyticsBundleGenerationStore,
  createPostgresAnalyticsJourneySampleStore,
  createPostgresAnalyticsMetricsStore,
  createPostgresAnalyticsOpportunityStore,
  createPostgresAnalyticsSavedFunnelStore,
  createPostgresAnalyticsSettingsStore,
  createPostgresAnalyticsUsageStore,
  createSemanticAnalyticsReceiptStore,
  persistCurrentProjectSemanticAnalyticsEvent,
  resolveCurrentProjectSemanticAnalyticsCapability,
  type ObjectStoreClient,
  type Queryable,
  type QueueClient
} from "../../../packages/storage/src/index.js";
import {
  associateProjectAnalyticsIdentityContext,
  createProjectAnalyticsIdentityContext,
  revokeProjectAnalyticsIdentityContext
} from "../../../packages/storage/src/analytics-identity-context-store.js";
import {
  applyProjectAnalyticsIdentityNamespaceChange,
  previewProjectAnalyticsIdentityNamespaceChange,
  readProjectAnalyticsIdentityNamespace
} from "../../../packages/storage/src/analytics-identity-namespace-store.js";
import {
  readProjectAnalyticsSubjectErasureStatus,
  requestProjectAnalyticsSubjectErasure
} from "../../../packages/storage/src/analytics-subject-erasure-store.js";
import {
  readProjectSemanticFunnelReport,
  readRecentProjectSemanticFunnelReport
} from "../../../packages/storage/src/semantic-analytics-funnel-report.js";
import { retryFailedSemanticAnalyticsEvent } from "../../../packages/storage/src/semantic-analytics-job-recovery.js";
import type { ApiDependencies } from "./api-types.js";

type ProjectScoped<T> = T & { organization_id: string };
type DefaultAnalyticsDependencies = {
  semanticAnalyticsCapabilities: NonNullable<ApiDependencies["semanticAnalyticsCapabilities"]>;
  semanticAnalyticsReports: NonNullable<ApiDependencies["semanticAnalyticsReports"]>;
  semanticAnalyticsJobRecovery: NonNullable<ApiDependencies["semanticAnalyticsJobRecovery"]>;
  analyticsIdentityNamespace: NonNullable<ApiDependencies["analyticsIdentityNamespace"]>;
  semanticAnalyticsIdentityContexts: NonNullable<
    ApiDependencies["semanticAnalyticsIdentityContexts"]
  >;
  semanticAnalyticsSubjectErasure: NonNullable<ApiDependencies["semanticAnalyticsSubjectErasure"]>;
  analyticsSpaces: NonNullable<ApiDependencies["analyticsSpaces"]>;
  analyticsSpacePlans: NonNullable<ApiDependencies["analyticsSpacePlans"]>;
  analyticsWriters: NonNullable<ApiDependencies["analyticsWriters"]>;
  semanticAnalyticsDelivery: NonNullable<ApiDependencies["semanticAnalyticsDelivery"]>;
  semanticAnalyticsRelayDelivery: NonNullable<ApiDependencies["semanticAnalyticsRelayDelivery"]>;
  semanticAnalyticsClientDelivery: NonNullable<ApiDependencies["semanticAnalyticsClientDelivery"]>;
  analyticsPlans: NonNullable<ApiDependencies["analyticsPlans"]>;
  analyticsBundles: NonNullable<ApiDependencies["analyticsBundles"]>;
  analyticsJourneySamples: NonNullable<ApiDependencies["analyticsJourneySamples"]>;
  analyticsMetrics: NonNullable<ApiDependencies["analyticsMetrics"]>;
  analyticsOpportunities: NonNullable<ApiDependencies["analyticsOpportunities"]>;
  analyticsSavedFunnels: NonNullable<ApiDependencies["analyticsSavedFunnels"]>;
  analyticsSettingsManagement: NonNullable<ApiDependencies["analyticsSettingsManagement"]>;
  analyticsUsage: NonNullable<ApiDependencies["analyticsUsage"]>;
};

export function createDefaultAnalyticsDependencies(input: {
  db: Queryable;
  queue: QueueClient;
  objectStore: Pick<ObjectStoreClient, "putObject">;
}): DefaultAnalyticsDependencies {
  const bundleGenerationStore = createPostgresAnalyticsBundleGenerationStore(input.db);
  const journeySampleStore = createPostgresAnalyticsJourneySampleStore(input.db);
  const metricsStore = createPostgresAnalyticsMetricsStore(input.db);
  const opportunityStore = createPostgresAnalyticsOpportunityStore(input.db);
  const savedFunnelStore = createPostgresAnalyticsSavedFunnelStore(input.db);
  const settingsStore = createPostgresAnalyticsSettingsStore(input.db);
  const semanticReceipts = createSemanticAnalyticsReceiptStore(input.db);
  const getSemanticRateLimitPerMinute = async (projectId: string): Promise<number | null> => {
    const row = (
      await input.db.query<{ plan: string }>(
        `SELECT org.plan FROM projects p JOIN organizations org ON org.id=p.organization_id
         WHERE p.id=$1::uuid AND org.suspended_at IS NULL`,
        [projectId]
      )
    ).rows[0];
    if (row === undefined || !Object.hasOwn(TIER_CAPABILITIES, row.plan)) return null;
    return getTierCapabilities(row.plan).ingestion_rate_per_min;
  };

  return {
    semanticAnalyticsCapabilities: {
      enabled: false,
      resolve: (request) => resolveCurrentProjectSemanticAnalyticsCapability(input.db, request)
    },
    semanticAnalyticsReports: {
      enabled: false,
      read: (request) => readProjectSemanticFunnelReport(input.db, request),
      readRecent: (request) => readRecentProjectSemanticFunnelReport(input.db, request)
    },
    semanticAnalyticsJobRecovery: {
      enabled: false,
      retry: (request) => retryFailedSemanticAnalyticsEvent(input.db, request)
    },
    analyticsIdentityNamespace: {
      enabled: false,
      read: (actorUserId, projectId) =>
        readProjectAnalyticsIdentityNamespace(input.db, actorUserId, projectId),
      preview: (change) => previewProjectAnalyticsIdentityNamespaceChange(input.db, change),
      apply: (change) => applyProjectAnalyticsIdentityNamespaceChange(input.db, change)
    },
    semanticAnalyticsIdentityContexts: {
      enabled: false,
      create: (credentialHash, request) =>
        createProjectAnalyticsIdentityContext(input.db, credentialHash, request),
      associate: (credentialHash, request) =>
        associateProjectAnalyticsIdentityContext(input.db, credentialHash, request),
      revoke: (credentialHash, request) =>
        revokeProjectAnalyticsIdentityContext(input.db, credentialHash, request)
    },
    semanticAnalyticsSubjectErasure: {
      enabled: false,
      readStatus: (request) => readProjectAnalyticsSubjectErasureStatus(input.db, request),
      request: (credentialHash, request) =>
        requestProjectAnalyticsSubjectErasure(input.db, credentialHash, request)
    },
    analyticsSpaces: createAnalyticsSpaceStore(input.db),
    analyticsSpacePlans: createAnalyticsSpacePlanStore(input.db),
    analyticsWriters: createAnalyticsWriterStore(input.db),
    semanticAnalyticsDelivery: {
      enabled: false,
      getRateLimitPerMinute: getSemanticRateLimitPerMinute,
      persist: ({ projectId, credentialHash, event }) =>
        persistCurrentProjectSemanticAnalyticsEvent(input.db, semanticReceipts, input.objectStore, {
          policy: { projectId, credentialHash, principal: "server_writer" },
          event
        })
    },
    semanticAnalyticsRelayDelivery: {
      enabled: false,
      getRateLimitPerMinute: getSemanticRateLimitPerMinute,
      persist: ({ projectId, credentialHash, event, identityContext }) =>
        persistCurrentProjectSemanticAnalyticsEvent(input.db, semanticReceipts, input.objectStore, {
          policy: { projectId, credentialHash, principal: "relay" },
          event,
          ...(identityContext === undefined ? {} : { identityContext })
        })
    },
    semanticAnalyticsClientDelivery: {
      enabled: false,
      persist: ({ projectId, credentialHash, event }) =>
        persistCurrentProjectSemanticAnalyticsEvent(input.db, semanticReceipts, input.objectStore, {
          policy: { projectId, credentialHash, principal: "project_token" },
          event
        })
    },
    analyticsPlans: createAnalyticsMeasurementPlanStore(input.db),
    analyticsSettingsManagement: {
      getAnalyticsSettingsForProject: (request: {
        organization_id: string;
        project_id: string;
      }) => {
        void request.organization_id;
        return settingsStore.getAnalyticsSettingsByProjectId(request.project_id);
      },
      updateAnalyticsSettingsForProject: (request: {
        organization_id: string;
        project_id: string;
        update: AnalyticsSettingsUpdate;
      }) => {
        void request.organization_id;
        return settingsStore.updateAnalyticsSettings({
          project_id: request.project_id,
          update: request.update
        });
      }
    },
    analyticsSavedFunnels: savedFunnelStore,
    analyticsMetrics: {
      getUsageSummaryForProject: (
        request: ProjectScoped<Parameters<typeof metricsStore.getUsageSummary>[0]>
      ) => {
        void request.organization_id;
        return metricsStore.getUsageSummary(request);
      },
      getRouteMetricsForProject: (
        request: ProjectScoped<Parameters<typeof metricsStore.getRouteMetrics>[0]>
      ) => {
        void request.organization_id;
        return metricsStore.getRouteMetrics(request);
      },
      getJourneyPatternsForProject: (
        request: ProjectScoped<Parameters<typeof metricsStore.getJourneyPatterns>[0]>
      ) => {
        void request.organization_id;
        return metricsStore.getJourneyPatterns(request);
      },
      getDeviceBreakdownForProject: (
        request: ProjectScoped<Parameters<typeof metricsStore.getDeviceBreakdown>[0]>
      ) => {
        void request.organization_id;
        return metricsStore.getDeviceBreakdown(request);
      },
      getReferrerMetricsForProject: (
        request: ProjectScoped<Parameters<typeof metricsStore.getReferrerMetrics>[0]>
      ) => {
        void request.organization_id;
        return metricsStore.getReferrerMetrics(request);
      },
      getActionMetricsForProject: (
        request: ProjectScoped<Parameters<typeof metricsStore.getActionMetrics>[0]>
      ) => {
        void request.organization_id;
        return metricsStore.getActionMetrics(request);
      },
      listFunnelsForProject: (
        request: ProjectScoped<Parameters<typeof metricsStore.listFunnels>[0]>
      ) => {
        void request.organization_id;
        return metricsStore.listFunnels(request);
      },
      getFunnelAnalysisForProject: (
        request: ProjectScoped<Parameters<typeof metricsStore.getFunnelAnalysis>[0]>
      ) => {
        void request.organization_id;
        return metricsStore.getFunnelAnalysis(request);
      },
      getIncidentImpactForProject: (
        request: ProjectScoped<Parameters<typeof metricsStore.getIncidentImpact>[0]>
      ) => {
        void request.organization_id;
        return metricsStore.getIncidentImpact(request);
      }
    },
    analyticsJourneySamples: {
      listAnalyticsJourneySamplesForProject: (
        request: ProjectScoped<
          Parameters<typeof journeySampleStore.listAnalyticsJourneySamplesForProject>[0]
        >
      ) => {
        void request.organization_id;
        return journeySampleStore.listAnalyticsJourneySamplesForProject(request);
      },
      getAnalyticsJourneySampleForProject: (
        request: ProjectScoped<
          Parameters<typeof journeySampleStore.getAnalyticsJourneySampleForProject>[0]
        >
      ) => {
        void request.organization_id;
        return journeySampleStore.getAnalyticsJourneySampleForProject(request);
      }
    },
    analyticsBundles: {
      listAnalyticsBundleGenerationsForProject: (
        request: ProjectScoped<
          Parameters<typeof bundleGenerationStore.listAnalyticsBundleGenerationsForProject>[0]
        >
      ) => {
        void request.organization_id;
        return bundleGenerationStore.listAnalyticsBundleGenerationsForProject(request);
      },
      listAnalyticsBundleGenerationsForOrganization: (
        request: Parameters<
          NonNullable<typeof bundleGenerationStore.listAnalyticsBundleGenerationsForOrganization>
        >[0]
      ) => bundleGenerationStore.listAnalyticsBundleGenerationsForOrganization!(request),
      requestAnalyticsBundleGenerationForProject: async (
        request: Parameters<
          DefaultAnalyticsDependencies["analyticsBundles"]["requestAnalyticsBundleGenerationForProject"]
        >[0]
      ) => {
        void request.organization_id;
        const generation = await bundleGenerationStore.reserveAnalyticsBundleGeneration({
          project_id: request.project_id,
          opportunity_id: request.opportunity_id ?? null,
          requested_by_user_id: request.requested_by_user_id,
          analysis_kind: request.analysis_kind,
          analysis_spec: request.analysis_spec
        });

        if (generation.status === "pending" || generation.status === "running") {
          await input.queue.enqueue("build-analytics-bundle", {
            project_id: generation.project_id,
            generation_id: generation.generation_id,
            requested_at: new Date().toISOString(),
            trigger: "manual"
          });
        }

        return generation;
      },
      getAnalyticsBundleGenerationForProject: (
        request: ProjectScoped<
          Parameters<typeof bundleGenerationStore.getAnalyticsBundleGenerationForProject>[0]
        >
      ) => {
        void request.organization_id;
        return bundleGenerationStore.getAnalyticsBundleGenerationForProject(request);
      }
    },
    analyticsOpportunities: {
      listAnalyticsOpportunitiesForProject: (
        request: Parameters<typeof opportunityStore.listAnalyticsOpportunitiesForProject>[0]
      ) => opportunityStore.listAnalyticsOpportunitiesForProject(request),
      listAnalyticsOpportunitiesForOrganization: (
        request: Parameters<typeof opportunityStore.listAnalyticsOpportunitiesForOrganization>[0]
      ) => opportunityStore.listAnalyticsOpportunitiesForOrganization(request),
      getAnalyticsOpportunityForProject: (
        request: Parameters<typeof opportunityStore.getAnalyticsOpportunityForProject>[0]
      ) => opportunityStore.getAnalyticsOpportunityForProject(request)
    },
    analyticsUsage: createPostgresAnalyticsUsageStore(input.db)
  };
}
