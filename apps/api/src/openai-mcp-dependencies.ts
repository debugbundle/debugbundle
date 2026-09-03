import {
  createPostgresAvailabilityCheckStore,
  createPostgresAnalyticsMetricsStore,
  createPostgresImprovementOpportunityStore,
  createPostgresMetadataStore,
  type ObjectStoreReader,
  type Queryable
} from "../../../packages/storage/src/index.js";

import type { OpenAiHostedReadDependencies } from "./openai-mcp-operations.js";

/**
 * Builds the hosted projection from explicit read methods only. The returned object has
 * no queue, regeneration, object writer, or customer-state mutation capability.
 */
export function createOpenAiHostedReadDependencies(input: {
  db: Queryable;
  objectStoreReader: Pick<ObjectStoreReader, "getObject">;
}): OpenAiHostedReadDependencies {
  const metadata = createPostgresMetadataStore(input.db);
  const improvements = createPostgresImprovementOpportunityStore(input.db);
  const availability = createPostgresAvailabilityCheckStore(input.db);
  const analytics = createPostgresAnalyticsMetricsStore(input.db);

  return {
    projectManagement: {
      resolveProjectAccessForUser: (request) => metadata.resolveProjectAccessForUser!(request),
      listProjectsForUser: (request) => metadata.listProjectsForUser!(request)
    },
    incidentRetrieval: {
      listIncidentsForOrganization: (request) => metadata.listIncidentsForOrganization(request),
      getIncidentForOrganization: (request) => metadata.getIncidentForOrganization(request),
      listServicesForOrganization: (request) => metadata.listServicesForOrganization!(request)
    },
    improvementManagement: {
      listImprovementsForOrganization: (request) =>
        improvements.listImprovementsForOrganization(request),
      getImprovementForOrganization: (request) =>
        improvements.getImprovementForOrganization(request)
    },
    availabilityCheckManagement: {
      listChecksForProjectInOrganization: (request) =>
        availability.listChecksForProjectInOrganization(request),
      getCheckForProjectInOrganization: (request) =>
        availability.getCheckForProjectInOrganization(request),
      listResultsForCheckInOrganization: (request) =>
        availability.listResultsForCheckInOrganization(request),
      listDailyRollupsForCheckInOrganization: (request) =>
        availability.listDailyRollupsForCheckInOrganization(request)
    },
    analyticsMetrics: {
      getUsageSummary: (request) => analytics.getUsageSummary(request),
      getRouteMetrics: (request) => analytics.getRouteMetrics(request),
      getJourneyPatterns: (request) =>
        analytics.getJourneyPatterns(request, { includeSampleIds: false }),
      getDeviceBreakdown: (request) => analytics.getDeviceBreakdown(request),
      getReferrerMetrics: (request) => analytics.getReferrerMetrics(request),
      getActionMetrics: (request) => analytics.getActionMetrics(request),
      listFunnels: (request) => analytics.listFunnels(request),
      getFunnelAnalysis: (request) => analytics.getFunnelAnalysis(request),
      getIncidentImpact: (request) =>
        analytics.getIncidentImpact(request, {
          includeSampleIds: false,
          includeBundleState: false
        })
    },
    objectStoreReader: {
      getObject: (request) => input.objectStoreReader.getObject(request)
    }
  };
}
