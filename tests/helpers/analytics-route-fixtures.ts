import { gzipSync } from "node:zlib";
import { vi } from "vitest";

import type { ApiDependencies } from "../../apps/api/src/api-types.js";
import { createApiServer } from "../../apps/api/src/server.js";
import { buildAnalyticsBundle } from "../../packages/analytics-bundle-engine/src/index.js";
import type {
  AnalyticsJourneySampleResponse,
  AnalyticsJourneySamplesListResponse,
  AnalyticsIncidentImpactResponse,
  AnalyticsOpportunitiesListResponse,
  AnalyticsOpportunityResponse,
  AnalyticsUsageSummaryResponse
} from "../../packages/shared-types/src/index.js";

export const PROJECT_ID = "00000000-0000-0000-0000-000000000001";
export const BUNDLE_GENERATION_ID = "00000000-0000-4000-8000-000000000222";
export const JOURNEY_SAMPLE_ID = "00000000-0000-4000-8000-000000000333";
export const INCIDENT_ID = "00000000-0000-4000-8000-000000000444";
export const FROM = "2026-03-01T00:00:00.000Z";
export const TO = "2026-03-08T00:00:00.000Z";
export const metricsWindow = {
  project_id: PROJECT_ID,
  from: FROM,
  to: TO,
  granularity: "day",
  service: null,
  environment: null
} as const;

export function createProjectAccess(
  overrides: Partial<{
    effective_role: "owner" | "admin" | "member";
    organization_plan: "free" | "solo" | "team";
    relationship: "owned" | "shared";
  }> = {}
) {
  return {
    project_id: PROJECT_ID,
    organization_id: "org_123",
    owner_user_id: "usr_owner",
    owner_email: "owner@example.com",
    relationship: overrides.relationship ?? "owned",
    effective_role: overrides.effective_role ?? "owner",
    organization_plan: overrides.organization_plan ?? "solo"
  };
}

export function createSummary(): AnalyticsUsageSummaryResponse {
  return {
    summary: {
      project_id: PROJECT_ID,
      from: FROM,
      to: TO,
      granularity: "day",
      service: null,
      environment: "production",
      sessions: 12,
      pageviews: 30,
      active_visitors: 0,
      new_visitors: 0,
      returning_visitors: 0,
      exits: 2,
      conversions: 5
    },
    breakdowns: {
      device_types: [{ value: "desktop", sessions: 9, pageviews: 20 }],
      browsers: [],
      os: [],
      languages: [],
      referrers: [],
      auth_states: []
    }
  };
}

export function createAnalyticsMetricsDependency(
  overrides: Partial<NonNullable<ApiDependencies["analyticsMetrics"]>> = {}
): NonNullable<ApiDependencies["analyticsMetrics"]> {
  return {
    getUsageSummaryForProject: vi.fn().mockResolvedValue(createSummary()),
    getRouteMetricsForProject: vi.fn().mockResolvedValue({ window: metricsWindow, routes: [] }),
    getJourneyPatternsForProject: vi
      .fn()
      .mockResolvedValue({ window: metricsWindow, patterns: [] }),
    getDeviceBreakdownForProject: vi.fn().mockResolvedValue({
      window: metricsWindow,
      device_types: [],
      browsers: [],
      os: [],
      languages: []
    }),
    getReferrerMetricsForProject: vi.fn().mockResolvedValue({
      window: metricsWindow,
      referrers: [],
      utm_sources: [],
      utm_mediums: [],
      utm_campaigns: []
    }),
    getActionMetricsForProject: vi.fn().mockResolvedValue({ window: metricsWindow, actions: [] }),
    listFunnelsForProject: vi.fn().mockResolvedValue({ window: metricsWindow, funnels: [] }),
    getFunnelAnalysisForProject: vi.fn().mockResolvedValue({
      funnel: {
        ...metricsWindow,
        funnel_key: "checkout",
        sessions_entered: 0,
        sessions_completed: 0,
        dropoffs: 0,
        conversion_rate: 0
      },
      steps: []
    }),
    getIncidentImpactForProject: vi.fn(),
    ...overrides
  };
}

export function createIncidentImpact(): AnalyticsIncidentImpactResponse {
  return {
    incident_id: INCIDENT_ID,
    window: metricsWindow,
    affected_sessions: 4,
    affected_routes: [{ route_key: "/checkout", affected_sessions: 4 }],
    affected_funnels: [{ funnel_key: "checkout", affected_sessions: 3 }],
    top_device_types: [{ value: "mobile", affected_sessions: 3 }],
    top_browsers: [{ value: "Chrome", affected_sessions: 2 }],
    journey_patterns: [
      {
        from_route_key: "/pricing",
        to_route_key: "/checkout",
        affected_sessions: 2,
        sample_ids: []
      }
    ],
    conversion_delta: { availability: "unavailable", value: null, unit: "percentage_points" },
    analytics_bundle: { status: "not_requested", generation_id: null, failure_reason: null }
  };
}

export function createOpportunity(
  overrides: Partial<AnalyticsOpportunityResponse["opportunity"]> = {}
): AnalyticsOpportunityResponse["opportunity"] {
  return {
    opportunity_id: "00000000-0000-4000-8000-000000000101",
    project_id: PROJECT_ID,
    project_name: "Marketing site",
    project_color_tag: "blue",
    service: "web",
    environment: "production",
    kind: "funnel_dropoff",
    status: "open",
    severity: "medium",
    confidence: 0.82,
    title: "Checkout dropoff increased",
    summary: "Payment-step exits increased for mobile sessions.",
    evidence: { sessions: 120 },
    related_incident_ids: [],
    related_deploy_ids: ["deploy-123"],
    first_detected_at: FROM,
    last_detected_at: TO,
    resolved_at: null,
    snoozed_until: null,
    bundle_generation_id: null,
    bundle_status: "not_requested",
    bundle_created_at: null,
    bundle_updated_at: null,
    bundle_failure_reason: null,
    ...overrides
  };
}

export function createAnalyticsOpportunitiesDependency(
  overrides: Partial<NonNullable<ApiDependencies["analyticsOpportunities"]>> = {}
): NonNullable<ApiDependencies["analyticsOpportunities"]> {
  const listResponse: AnalyticsOpportunitiesListResponse = {
    opportunities: [createOpportunity()],
    next_cursor: null
  };
  return {
    listAnalyticsOpportunitiesForProject: vi.fn().mockResolvedValue(listResponse),
    listAnalyticsOpportunitiesForOrganization: vi.fn().mockResolvedValue(listResponse),
    getAnalyticsOpportunityForProject: vi
      .fn()
      .mockResolvedValue({ opportunity: createOpportunity() }),
    ...overrides
  };
}

export function createAnalyticsBundleGeneration(
  overrides: Partial<
    Awaited<
      ReturnType<
        NonNullable<ApiDependencies["analyticsBundles"]>["getAnalyticsBundleGenerationForProject"]
      >
    > & {
      project_name: string;
      project_color_tag: string | null;
    }
  > = {}
) {
  return {
    generation_id: BUNDLE_GENERATION_ID,
    project_id: PROJECT_ID,
    opportunity_id: null,
    requested_by_user_id: null,
    analysis_kind: "usage_summary",
    analysis_spec: {},
    input_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    status: "completed",
    object_key:
      "analytics-bundles/00000000-0000-0000-0000-000000000001/00000000-0000-4000-8000-000000000222/bundle.json.gz",
    failure_reason: null,
    created_at: FROM,
    claimed_at: FROM,
    completed_at: TO,
    updated_at: TO,
    ...overrides
  } as const;
}

export function createAnalyticsBundlesDependency(
  overrides: Partial<NonNullable<ApiDependencies["analyticsBundles"]>> = {}
): NonNullable<ApiDependencies["analyticsBundles"]> {
  return {
    listAnalyticsBundleGenerationsForProject: vi.fn().mockResolvedValue({
      bundles: [createAnalyticsBundleGeneration()],
      next_cursor: null
    }),
    listAnalyticsBundleGenerationsForOrganization: vi.fn().mockResolvedValue({
      bundles: [
        createAnalyticsBundleGeneration({
          project_name: "Marketing site",
          project_color_tag: "blue"
        })
      ],
      next_cursor: null
    }),
    requestAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue(
      createAnalyticsBundleGeneration({
        status: "pending",
        object_key: null
      })
    ),
    getAnalyticsBundleGenerationForProject: vi
      .fn()
      .mockResolvedValue(createAnalyticsBundleGeneration()),
    ...overrides
  };
}

export function createJourneySample(): AnalyticsJourneySamplesListResponse["samples"][number] & {
  object_key: string;
} {
  return {
    sample_id: JOURNEY_SAMPLE_ID,
    project_id: PROJECT_ID,
    service: "web",
    environment: "production",
    session_id_hash: "sha256:session",
    visitor_id_hash: "sha256:visitor",
    analysis_tags: ["checkout", "loop"],
    first_seen_at: FROM,
    last_seen_at: TO,
    dimensions_summary: { device_type: "mobile" },
    has_artifact: true,
    object_key: `analytics-journeys/${PROJECT_ID}/${JOURNEY_SAMPLE_ID}.json.gz`,
    expires_at: "2026-03-15T00:00:00.000Z",
    created_at: TO
  };
}

export function createAnalyticsJourneySamplesDependency(
  overrides: Partial<NonNullable<ApiDependencies["analyticsJourneySamples"]>> = {}
): NonNullable<ApiDependencies["analyticsJourneySamples"]> {
  return {
    listAnalyticsJourneySamplesForProject: vi.fn().mockResolvedValue({
      samples: [createJourneySample()],
      next_cursor: null
    }),
    getAnalyticsJourneySampleForProject: vi.fn().mockResolvedValue(createJourneySample()),
    ...overrides
  };
}

export function createAnalyticsSettingsManagementDependency(
  overrides: Partial<NonNullable<ApiDependencies["analyticsSettingsManagement"]>> = {}
): NonNullable<ApiDependencies["analyticsSettingsManagement"]> {
  return {
    getAnalyticsSettingsForProject: vi.fn().mockResolvedValue({
      project_id: PROJECT_ID,
      enabled: true,
      privacy_mode: "standard",
      consent_required: false,
      capture_page_views: true,
      capture_route_changes: true,
      capture_actions: true,
      capture_friction_signals: true,
      journey_sample_rate: 1,
      raw_retention_days: 30,
      sample_retention_days: 14,
      hourly_retention_days: 30,
      aggregate_retention_months: 24,
      max_saved_funnels: 10,
      max_custom_dimensions: 0,
      approved_custom_dimensions: [],
      updated_at: TO
    }),
    updateAnalyticsSettingsForProject: vi.fn(),
    ...overrides
  };
}

export function createDependencies(
  overrides: {
    analyticsMetrics?: ApiDependencies["analyticsMetrics"];
    analyticsJourneySamples?: ApiDependencies["analyticsJourneySamples"];
    analyticsOpportunities?: ApiDependencies["analyticsOpportunities"];
    analyticsBundles?: ApiDependencies["analyticsBundles"];
    analyticsSettingsManagement?: ApiDependencies["analyticsSettingsManagement"];
    analyticsUsage?: ApiDependencies["analyticsUsage"];
    billingManagement?: ApiDependencies["billingManagement"];
    objectStoreReader?: ApiDependencies["objectStoreReader"];
    projectAccess?: ReturnType<typeof createProjectAccess> | null;
    incident?: { project_id: string; first_seen_at: string; last_seen_at: string } | null;
  } = {}
): ReturnType<typeof createApiServer> {
  return createApiServer({
    ingestionPersistence: { persistAndEnqueue: vi.fn() },
    ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
    memberAuth: {
      resolveMemberByTokenHash: vi.fn().mockResolvedValue({
        member_id: "usr_owner",
        organization_id: "org_123",
        role: "owner",
        revoked_at: null,
        expires_at: null
      })
    },
    tokenManagement: {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    },
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(overrides.incident ?? null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: overrides.objectStoreReader ?? { getObject: vi.fn() },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue(null)
    },
    projectManagement: {
      resolveProjectAccessForUser: vi
        .fn()
        .mockResolvedValue(overrides.projectAccess ?? createProjectAccess()),
      listProjectsForOrganization: vi.fn().mockResolvedValue([]),
      createProjectForOrganization: vi.fn(),
      updateProjectForOrganization: vi.fn(),
      deleteProjectForOrganization: vi.fn()
    },
    analyticsMetrics: overrides.analyticsMetrics,
    analyticsJourneySamples: overrides.analyticsJourneySamples,
    analyticsOpportunities: overrides.analyticsOpportunities,
    analyticsBundles: overrides.analyticsBundles,
    analyticsSettingsManagement: overrides.analyticsSettingsManagement,
    analyticsUsage: overrides.analyticsUsage,
    billingManagement: overrides.billingManagement
  });
}

export function createBillingManagementForAnalyticsQuota(
  plan: "free" | "solo" = "solo"
): NonNullable<ApiDependencies["billingManagement"]> {
  return {
    getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
      plan,
      billing_state: "active",
      stripe_customer_id: null,
      active_projects: 1,
      capacity_units: {
        total: 1,
        included: 1,
        additional_purchased: 0,
        pending_reduction: null
      },
      usage_window: {
        starts_at: "2026-03-01T00:00:00.000Z",
        ends_at: "2026-04-01T00:00:00.000Z"
      },
      allowances: {
        monthly_bundle_requests: { used: 0, limit: 25 },
        monthly_raw_ingested_events: { used: 0, limit: 10_000 },
        retained_bundle_cap: { used: 0, limit: 5 },
        monthly_remote_activations: { used: 0, limit: 5 },
        monthly_alert_deliveries: { used: 0, limit: 100 },
        monthly_webhook_deliveries: { used: 0, limit: 100 }
      },
      trial: {
        available: false,
        active: false,
        plan: null,
        started_at: null,
        ends_at: null,
        used_at: null,
        converted_at: null,
        expired_at: null,
        days_remaining: null
      }
    }),
    createCheckoutLink: vi.fn().mockResolvedValue(null),
    createPortalLink: vi.fn().mockResolvedValue(null)
  };
}

export { gzipSync, buildAnalyticsBundle };
export type { AnalyticsJourneySampleResponse };
