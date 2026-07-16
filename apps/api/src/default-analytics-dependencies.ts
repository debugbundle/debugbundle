import type { AnalyticsSettingsUpdate } from "../../../packages/shared-types/src/index.js";
import {
  createPostgresAnalyticsBundleGenerationStore,
  createPostgresAnalyticsJourneySampleStore,
  createPostgresAnalyticsMetricsStore,
  createPostgresAnalyticsOpportunityStore,
  createPostgresAnalyticsSavedFunnelStore,
  createPostgresAnalyticsSettingsStore,
  createPostgresAnalyticsUsageStore,
  type Queryable,
  type QueueClient
} from "../../../packages/storage/src/index.js";
import type { ApiDependencies } from "./api-types.js";

type ProjectScoped<T> = T & { organization_id: string };
type DefaultAnalyticsDependencies = {
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
}): DefaultAnalyticsDependencies {
  const bundleGenerationStore = createPostgresAnalyticsBundleGenerationStore(input.db);
  const journeySampleStore = createPostgresAnalyticsJourneySampleStore(input.db);
  const metricsStore = createPostgresAnalyticsMetricsStore(input.db);
  const opportunityStore = createPostgresAnalyticsOpportunityStore(input.db);
  const savedFunnelStore = createPostgresAnalyticsSavedFunnelStore(input.db);
  const settingsStore = createPostgresAnalyticsSettingsStore(input.db);

  return {
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
