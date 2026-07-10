import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { createApiServer } from "../../../apps/api/src/server.js";
import { buildAnalyticsBundle } from "../../../packages/analytics-bundle-engine/src/index.js";
import type {
  AnalyticsJourneySampleResponse,
  AnalyticsJourneySamplesListResponse,
  AnalyticsIncidentImpactResponse,
  AnalyticsOpportunitiesListResponse,
  AnalyticsOpportunityResponse,
  AnalyticsUsageSummaryResponse
} from "../../../packages/shared-types/src/index.js";

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";
const BUNDLE_GENERATION_ID = "00000000-0000-4000-8000-000000000222";
const JOURNEY_SAMPLE_ID = "00000000-0000-4000-8000-000000000333";
const INCIDENT_ID = "00000000-0000-4000-8000-000000000444";
const FROM = "2026-03-01T00:00:00.000Z";
const TO = "2026-03-08T00:00:00.000Z";
const metricsWindow = {
  project_id: PROJECT_ID,
  from: FROM,
  to: TO,
  granularity: "day",
  service: null,
  environment: null
} as const;

function createProjectAccess(overrides: Partial<{
  effective_role: "owner" | "admin" | "member";
  organization_plan: "free" | "solo" | "team";
  relationship: "owned" | "shared";
}> = {}) {
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

function createSummary(): AnalyticsUsageSummaryResponse {
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

function createAnalyticsMetricsDependency(
  overrides: Partial<NonNullable<ApiDependencies["analyticsMetrics"]>> = {}
): NonNullable<ApiDependencies["analyticsMetrics"]> {
  return {
    getUsageSummaryForProject: vi.fn().mockResolvedValue(createSummary()),
    getRouteMetricsForProject: vi.fn().mockResolvedValue({ window: metricsWindow, routes: [] }),
    getJourneyPatternsForProject: vi.fn().mockResolvedValue({ window: metricsWindow, patterns: [] }),
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
      funnel: { ...metricsWindow, funnel_key: "checkout", sessions_entered: 0, sessions_completed: 0, dropoffs: 0, conversion_rate: 0 },
      steps: []
    }),
    getIncidentImpactForProject: vi.fn(),
    ...overrides
  };
}

function createIncidentImpact(): AnalyticsIncidentImpactResponse {
  return {
    incident_id: INCIDENT_ID,
    window: metricsWindow,
    affected_sessions: 4,
    affected_routes: [{ route_key: "/checkout", affected_sessions: 4 }],
    affected_funnels: [{ funnel_key: "checkout", affected_sessions: 3 }],
    top_device_types: [{ value: "mobile", affected_sessions: 3 }],
    top_browsers: [{ value: "Chrome", affected_sessions: 2 }],
    journey_patterns: [{ from_route_key: "/pricing", to_route_key: "/checkout", affected_sessions: 2 }],
    conversion_delta: { availability: "unavailable", value: null, unit: "percentage_points" },
    analytics_bundle: { status: "not_requested", generation_id: null, failure_reason: null }
  };
}

function createOpportunity(): AnalyticsOpportunityResponse["opportunity"] {
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
    bundle_failure_reason: null
  };
}

function createAnalyticsOpportunitiesDependency(
  overrides: Partial<NonNullable<ApiDependencies["analyticsOpportunities"]>> = {}
): NonNullable<ApiDependencies["analyticsOpportunities"]> {
  const listResponse: AnalyticsOpportunitiesListResponse = {
    opportunities: [createOpportunity()],
    next_cursor: null
  };
  return {
    listAnalyticsOpportunitiesForProject: vi.fn().mockResolvedValue(listResponse),
    getAnalyticsOpportunityForProject: vi.fn().mockResolvedValue({ opportunity: createOpportunity() }),
    ...overrides
  };
}

function createAnalyticsBundleGeneration(overrides: Partial<Awaited<ReturnType<NonNullable<ApiDependencies["analyticsBundles"]>["getAnalyticsBundleGenerationForProject"]>>> = {}) {
  return {
    generation_id: BUNDLE_GENERATION_ID,
    project_id: PROJECT_ID,
    opportunity_id: null,
    requested_by_user_id: null,
    analysis_kind: "usage_summary",
    analysis_spec: {},
    input_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    status: "completed",
    object_key: "analytics-bundles/00000000-0000-0000-0000-000000000001/00000000-0000-4000-8000-000000000222/bundle.json.gz",
    failure_reason: null,
    created_at: FROM,
    claimed_at: FROM,
    completed_at: TO,
    updated_at: TO,
    ...overrides
  } as const;
}

function createAnalyticsBundlesDependency(
  overrides: Partial<NonNullable<ApiDependencies["analyticsBundles"]>> = {}
): NonNullable<ApiDependencies["analyticsBundles"]> {
  return {
    listAnalyticsBundleGenerationsForProject: vi.fn().mockResolvedValue({
      bundles: [createAnalyticsBundleGeneration()],
      next_cursor: null
    }),
    requestAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue(createAnalyticsBundleGeneration({
      status: "pending",
      object_key: null
    })),
    getAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue(createAnalyticsBundleGeneration()),
    ...overrides
  };
}

function createJourneySample(): AnalyticsJourneySamplesListResponse["samples"][number] & { object_key: string } {
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

function createAnalyticsJourneySamplesDependency(
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

function createAnalyticsSettingsManagementDependency(
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

function createDependencies(overrides: {
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
} = {}): ReturnType<typeof createApiServer> {
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
      resolveProjectAccessForUser: vi.fn().mockResolvedValue(overrides.projectAccess ?? createProjectAccess()),
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

function createBillingManagementForAnalyticsQuota(): NonNullable<ApiDependencies["billingManagement"]> {
  return {
    getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
      plan: "solo",
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

describe("analytics metrics routes", () => {
  it("returns project analytics summary through member-token project access", async () => {
    const getUsageSummaryForProject = vi.fn().mockResolvedValue(createSummary());
    const app = createDependencies({
      analyticsMetrics: createAnalyticsMetricsDependency({ getUsageSummaryForProject })
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/summary?project_id=${PROJECT_ID}&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}&granularity=day&environment=production&limit=5`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(createSummary());
    expect(getUsageSummaryForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID,
      from: FROM,
      to: TO,
      granularity: "day",
      service: undefined,
      environment: "production",
      limit: 5
    });
  });

  it("rejects invalid queries, Free projects, and unavailable metrics storage", async () => {
    const invalidQuery = await createDependencies({
      analyticsMetrics: createAnalyticsMetricsDependency({ getUsageSummaryForProject: vi.fn() })
    }).inject({
      method: "GET",
      url: "/v1/analytics/summary?project_id=not-a-uuid",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const freeProject = await createDependencies({
      projectAccess: createProjectAccess({ organization_plan: "free" }),
      analyticsMetrics: createAnalyticsMetricsDependency({ getUsageSummaryForProject: vi.fn() })
    }).inject({
      method: "GET",
      url: `/v1/analytics/summary?project_id=${PROJECT_ID}&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const unavailable = await createDependencies().inject({
      method: "GET",
      url: `/v1/analytics/summary?project_id=${PROJECT_ID}&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(invalidQuery.statusCode).toBe(400);
    expect(invalidQuery.json()).toEqual({ error: "invalid_query" });
    expect(freeProject.statusCode).toBe(403);
    expect(freeProject.json()).toEqual({ error: "upgrade_required" });
    expect(unavailable.statusCode).toBe(404);
    expect(unavailable.json()).toEqual({ error: "analytics_metrics_not_available" });
  });

  it("returns detailed aggregate metrics through the analytics API routes", async () => {
    const analyticsMetrics = {
      getUsageSummaryForProject: vi.fn(),
      getRouteMetricsForProject: vi.fn().mockResolvedValue({ window: metricsWindow, routes: [] }),
      getJourneyPatternsForProject: vi.fn().mockResolvedValue({ window: metricsWindow, patterns: [] }),
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
        funnel: { ...metricsWindow, funnel_key: "checkout", sessions_entered: 0, sessions_completed: 0, dropoffs: 0, conversion_rate: 0 },
        steps: []
      }),
      getIncidentImpactForProject: vi.fn()
    };
    const app = createDependencies({ analyticsMetrics });
    const authHeaders = { authorization: "Bearer dbundle_mem_test_token" };
    const query = `project_id=${PROJECT_ID}&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`;

    await expect(app.inject({ method: "GET", url: `/v1/analytics/routes?${query}`, headers: authHeaders })).resolves.toMatchObject({
      statusCode: 200
    });
    await expect(app.inject({ method: "GET", url: `/v1/analytics/journey-patterns?${query}`, headers: authHeaders })).resolves.toMatchObject({
      statusCode: 200
    });
    await expect(app.inject({ method: "GET", url: `/v1/analytics/devices?${query}`, headers: authHeaders })).resolves.toMatchObject({
      statusCode: 200
    });
    await expect(app.inject({ method: "GET", url: `/v1/analytics/referrers?${query}`, headers: authHeaders })).resolves.toMatchObject({
      statusCode: 200
    });
    await expect(app.inject({ method: "GET", url: `/v1/analytics/actions?${query}`, headers: authHeaders })).resolves.toMatchObject({
      statusCode: 200
    });
    await expect(app.inject({ method: "GET", url: `/v1/analytics/funnels?${query}`, headers: authHeaders })).resolves.toMatchObject({
      statusCode: 200
    });
    await expect(app.inject({ method: "GET", url: `/v1/analytics/funnels/checkout?${query}`, headers: authHeaders })).resolves.toMatchObject({
      statusCode: 200
    });

    expect(analyticsMetrics.getRouteMetricsForProject).toHaveBeenCalledWith(expect.objectContaining({ project_id: PROJECT_ID }));
    expect(analyticsMetrics.getJourneyPatternsForProject).toHaveBeenCalledWith(expect.objectContaining({ project_id: PROJECT_ID }));
    expect(analyticsMetrics.getActionMetricsForProject).toHaveBeenCalledWith(expect.objectContaining({ project_id: PROJECT_ID }));
    expect(analyticsMetrics.listFunnelsForProject).toHaveBeenCalledWith(expect.objectContaining({ project_id: PROJECT_ID }));
    expect(analyticsMetrics.getFunnelAnalysisForProject).toHaveBeenCalledWith(expect.objectContaining({
      project_id: PROJECT_ID,
      funnel_key: "checkout"
    }));
  });

  it("returns incident impact through authorized aggregate correlation metrics", async () => {
    const getIncidentImpactForProject = vi.fn().mockResolvedValue(createIncidentImpact());
    const app = createDependencies({
      incident: {
        project_id: PROJECT_ID,
        first_seen_at: FROM,
        last_seen_at: TO
      },
      analyticsMetrics: createAnalyticsMetricsDependency({ getIncidentImpactForProject })
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/incidents/${INCIDENT_ID}/impact?project_id=${PROJECT_ID}&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}&environment=production`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(createIncidentImpact());
    expect(getIncidentImpactForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID,
      incident_id: INCIDENT_ID,
      from: FROM,
      to: TO,
      granularity: "day",
      service: undefined,
      environment: "production",
      limit: 10
    });
  });

  it("does not expose impact for an incident outside the requested project", async () => {
    const getIncidentImpactForProject = vi.fn();
    const app = createDependencies({
      incident: {
        project_id: "00000000-0000-0000-0000-000000000099",
        first_seen_at: FROM,
        last_seen_at: TO
      },
      analyticsMetrics: createAnalyticsMetricsDependency({ getIncidentImpactForProject })
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/incidents/${INCIDENT_ID}/impact?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "incident_not_found" });
    expect(getIncidentImpactForProject).not.toHaveBeenCalled();
  });

  it("lists and gets analytics opportunities through project access", async () => {
    const analyticsOpportunities = createAnalyticsOpportunitiesDependency();
    const app = createDependencies({ analyticsOpportunities });
    const authHeaders = { authorization: "Bearer dbundle_mem_test_token" };
    const opportunityId = createOpportunity().opportunity_id;

    const cursor = `${TO}|${opportunityId}`;
    const list = await app.inject({
      method: "GET",
      url: `/v1/analytics/opportunities?project_id=${PROJECT_ID}&status=all&kind=funnel_dropoff&cursor=${encodeURIComponent(cursor)}&limit=5`,
      headers: authHeaders
    });
    const detail = await app.inject({
      method: "GET",
      url: `/v1/analytics/opportunities/${opportunityId}?project_id=${PROJECT_ID}`,
      headers: authHeaders
    });

    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({ opportunities: [createOpportunity()], next_cursor: null });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toEqual({ opportunity: createOpportunity() });
    expect(analyticsOpportunities.listAnalyticsOpportunitiesForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID,
      kind: "funnel_dropoff",
      cursor: {
        last_detected_at: TO,
        opportunity_id: opportunityId
      },
      limit: 5
    });
    expect(analyticsOpportunities.getAnalyticsOpportunityForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID,
      opportunity_id: opportunityId
    });
  });

  it("rejects invalid analytics opportunity reads and unavailable storage", async () => {
    const invalidCursor = await createDependencies({
      analyticsOpportunities: createAnalyticsOpportunitiesDependency()
    }).inject({
      method: "GET",
      url: `/v1/analytics/opportunities?project_id=${PROJECT_ID}&cursor=not-a-cursor`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const unavailable = await createDependencies().inject({
      method: "GET",
      url: `/v1/analytics/opportunities?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const notFound = await createDependencies({
      analyticsOpportunities: createAnalyticsOpportunitiesDependency({
        getAnalyticsOpportunityForProject: vi.fn().mockResolvedValue(null)
      })
    }).inject({
      method: "GET",
      url: `/v1/analytics/opportunities/${createOpportunity().opportunity_id}?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(invalidCursor.statusCode).toBe(400);
    expect(invalidCursor.json()).toEqual({ error: "invalid_query" });
    expect(unavailable.statusCode).toBe(404);
    expect(unavailable.json()).toEqual({ error: "analytics_opportunities_not_available" });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toEqual({ error: "analytics_opportunity_not_found" });
  });

  it("lists AnalyticsBundle generation records through project access", async () => {
    const cursor = `${FROM}|${BUNDLE_GENERATION_ID}`;
    const generation = createAnalyticsBundleGeneration({
      analysis_kind: "funnel_dropoff",
      status: "completed",
      analysis_spec: { funnel: "checkout" }
    });
    const listAnalyticsBundleGenerationsForProject = vi.fn().mockResolvedValue({
      bundles: [generation],
      next_cursor: null
    });
    const analyticsBundles = createAnalyticsBundlesDependency({ listAnalyticsBundleGenerationsForProject });
    const app = createDependencies({ analyticsBundles });

    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/bundles?project_id=${PROJECT_ID}&status=completed&kind=funnel_dropoff&cursor=${encodeURIComponent(cursor)}&limit=5`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      bundles: [{
        generation_id: BUNDLE_GENERATION_ID,
        project_id: PROJECT_ID,
        opportunity_id: null,
        requested_by_user_id: null,
        analysis_kind: "funnel_dropoff",
        analysis_spec: { funnel: "checkout" },
        input_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        status: "completed",
        has_artifact: true,
        failure_reason: null,
        created_at: FROM,
        claimed_at: FROM,
        completed_at: TO,
        updated_at: TO
      }],
      next_cursor: null
    });
    expect(listAnalyticsBundleGenerationsForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID,
      status: "completed",
      analysis_kind: "funnel_dropoff",
      cursor: {
        created_at: FROM,
        generation_id: BUNDLE_GENERATION_ID
      },
      limit: 5
    });
  });

  it("rejects invalid AnalyticsBundle list cursors and unavailable storage", async () => {
    const invalidCursor = await createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency()
    }).inject({
      method: "GET",
      url: `/v1/analytics/bundles?project_id=${PROJECT_ID}&cursor=not-a-cursor`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const unavailable = await createDependencies().inject({
      method: "GET",
      url: `/v1/analytics/bundles?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(invalidCursor.statusCode).toBe(400);
    expect(invalidCursor.json()).toEqual({ error: "invalid_query" });
    expect(unavailable.statusCode).toBe(404);
    expect(unavailable.json()).toEqual({ error: "analytics_bundles_not_available" });
  });

  it("lists retained analytics journey sample metadata through project access", async () => {
    const cursor = `${TO}|${JOURNEY_SAMPLE_ID}`;
    const listAnalyticsJourneySamplesForProject = vi.fn().mockResolvedValue({
      samples: [createJourneySample()],
      next_cursor: null
    });
    const analyticsJourneySamples = createAnalyticsJourneySamplesDependency({ listAnalyticsJourneySamplesForProject });
    const app = createDependencies({ analyticsJourneySamples });

    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/journey-samples?project_id=${PROJECT_ID}&service=web&environment=production&tag=checkout&cursor=${encodeURIComponent(cursor)}&limit=5`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      samples: [{
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
        expires_at: "2026-03-15T00:00:00.000Z",
        created_at: TO
      }],
      next_cursor: null
    });
    expect(listAnalyticsJourneySamplesForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID,
      service: "web",
      environment: "production",
      tag: "checkout",
      cursor: {
        last_seen_at: TO,
        sample_id: JOURNEY_SAMPLE_ID
      },
      limit: 5,
      now: expect.any(String)
    });
  });

  it("returns retained analytics journey sample artifacts through project access", async () => {
    const journey: AnalyticsJourneySampleResponse["journey"] = {
      schema_version: "analytics_journey_sample.v1",
      timeline: [
        { kind: "page_view", route: "/pricing" },
        { kind: "route_change", route: "/checkout" }
      ]
    };
    const sample = createJourneySample();
    const objectStoreReader = {
      getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(journey), "utf8")))
    };
    const analyticsJourneySamples = createAnalyticsJourneySamplesDependency({
      getAnalyticsJourneySampleForProject: vi.fn().mockResolvedValue(sample)
    });
    const app = createDependencies({ analyticsJourneySamples, objectStoreReader });

    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/journey-samples/${JOURNEY_SAMPLE_ID}?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sample: {
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
        expires_at: "2026-03-15T00:00:00.000Z",
        created_at: TO
      },
      journey
    });
    expect(analyticsJourneySamples.getAnalyticsJourneySampleForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID,
      sample_id: JOURNEY_SAMPLE_ID,
      now: expect.any(String)
    });
    expect(objectStoreReader.getObject).toHaveBeenCalledWith({ key: sample.object_key });
  });

  it("rejects invalid analytics journey sample reads and unavailable storage", async () => {
    const invalidCursor = await createDependencies({
      analyticsJourneySamples: createAnalyticsJourneySamplesDependency()
    }).inject({
      method: "GET",
      url: `/v1/analytics/journey-samples?project_id=${PROJECT_ID}&cursor=not-a-cursor`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const unavailable = await createDependencies().inject({
      method: "GET",
      url: `/v1/analytics/journey-samples?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const notFound = await createDependencies({
      analyticsJourneySamples: createAnalyticsJourneySamplesDependency({
        getAnalyticsJourneySampleForProject: vi.fn().mockResolvedValue(null)
      })
    }).inject({
      method: "GET",
      url: `/v1/analytics/journey-samples/${JOURNEY_SAMPLE_ID}?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(invalidCursor.statusCode).toBe(400);
    expect(invalidCursor.json()).toEqual({ error: "invalid_query" });
    expect(unavailable.statusCode).toBe(404);
    expect(unavailable.json()).toEqual({ error: "analytics_journey_samples_not_available" });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toEqual({ error: "analytics_journey_sample_not_found" });
  });

  it("requests AnalyticsBundle generation through project access", async () => {
    const requestAnalyticsBundleGenerationForProject = vi.fn().mockResolvedValue(createAnalyticsBundleGeneration({
      status: "pending",
      object_key: null
    }));
    const analyticsBundles = createAnalyticsBundlesDependency({ requestAnalyticsBundleGenerationForProject });
    const analyticsSettingsManagement = createAnalyticsSettingsManagementDependency();
    const app = createDependencies({ analyticsBundles, analyticsSettingsManagement });

    const response = await app.inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        project_id: PROJECT_ID,
        analysis_kind: "funnel_dropoff",
        from: FROM,
        to: TO,
        funnel: "checkout",
        incident_id: "44444444-4444-4444-8444-444444444444",
        deploy_id: "deploy_123",
        filters: { auth_state: "logged_in" }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "pending", bundle_generation_id: BUNDLE_GENERATION_ID });
    expect(analyticsSettingsManagement.getAnalyticsSettingsForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID
    });
    expect(requestAnalyticsBundleGenerationForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID,
      requested_by_user_id: "usr_owner",
      analysis_kind: "funnel_dropoff",
      analysis_spec: {
        from: FROM,
        to: TO,
        funnel: "checkout",
        route: null,
        incident_id: "44444444-4444-4444-8444-444444444444",
        deploy_id: "deploy_123",
        related_incident_ids: ["44444444-4444-4444-8444-444444444444"],
        related_deploy_ids: ["deploy_123"],
        filters: { auth_state: "logged_in" }
      }
    });
  });

  it("rejects AnalyticsBundle generation when the analytics bundle allowance is exhausted", async () => {
    const requestAnalyticsBundleGenerationForProject = vi.fn();
    const app = createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency({ requestAnalyticsBundleGenerationForProject }),
      analyticsSettingsManagement: createAnalyticsSettingsManagementDependency(),
      analyticsUsage: {
        getAnalyticsUsageForOrganization: vi.fn(),
        claimAnalyticsUsageForOrganization: vi.fn().mockResolvedValue({
          allowed: false,
          metric: "monthly_analytics_bundle_generations",
          used: 26,
          limit: 25,
          usage: {
            monthly_analytics_events: 0,
            monthly_analytics_sessions: 0,
            monthly_analytics_journey_samples: 0,
            monthly_analytics_bundle_generations: 25
          }
        }),
        releaseAnalyticsUsageForOrganization: vi.fn()
      },
      billingManagement: createBillingManagementForAnalyticsQuota()
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        project_id: PROJECT_ID,
        analysis_kind: "usage_summary",
        last: "7d"
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBeDefined();
    expect(response.json()).toMatchObject({
      error: "analytics_quota_exceeded"
    });
    expect(requestAnalyticsBundleGenerationForProject).not.toHaveBeenCalled();
  });

  it("rejects AnalyticsBundle create requests when analytics is disabled or invalid", async () => {
    const requestAnalyticsBundleGenerationForProject = vi.fn();
    const disabled = await createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency({ requestAnalyticsBundleGenerationForProject }),
      analyticsSettingsManagement: createAnalyticsSettingsManagementDependency({
        getAnalyticsSettingsForProject: vi.fn().mockResolvedValue(null)
      })
    }).inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        project_id: PROJECT_ID,
        analysis_kind: "usage_summary",
        last: "7d"
      }
    });
    const invalid = await createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency(),
      analyticsSettingsManagement: createAnalyticsSettingsManagementDependency()
    }).inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        project_id: PROJECT_ID,
        analysis_kind: "usage_summary",
        route: "/checkout?step=payment",
        last: "7d"
      }
    });

    expect(disabled.statusCode).toBe(403);
    expect(disabled.json()).toEqual({ error: "analytics_disabled" });
    expect(requestAnalyticsBundleGenerationForProject).not.toHaveBeenCalled();
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: "invalid_body" });
  });

  it("requires an accessible incident for incident-impact bundle generation", async () => {
    const requestAnalyticsBundleGenerationForProject = vi.fn().mockResolvedValue(createAnalyticsBundleGeneration({
      analysis_kind: "incident_impact",
      status: "pending",
      object_key: null
    }));
    const missingIncident = await createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency({ requestAnalyticsBundleGenerationForProject }),
      analyticsSettingsManagement: createAnalyticsSettingsManagementDependency()
    }).inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: { project_id: PROJECT_ID, analysis_kind: "incident_impact" }
    });
    const unrelatedIncident = await createDependencies({
      incident: {
        project_id: "00000000-0000-0000-0000-000000000099",
        first_seen_at: FROM,
        last_seen_at: TO
      },
      analyticsBundles: createAnalyticsBundlesDependency({ requestAnalyticsBundleGenerationForProject }),
      analyticsSettingsManagement: createAnalyticsSettingsManagementDependency()
    }).inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        project_id: PROJECT_ID,
        analysis_kind: "incident_impact",
        incident_id: INCIDENT_ID
      }
    });
    const validIncident = await createDependencies({
      incident: {
        project_id: PROJECT_ID,
        first_seen_at: FROM,
        last_seen_at: TO
      },
      analyticsBundles: createAnalyticsBundlesDependency({ requestAnalyticsBundleGenerationForProject }),
      analyticsSettingsManagement: createAnalyticsSettingsManagementDependency()
    }).inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        project_id: PROJECT_ID,
        analysis_kind: "incident_impact",
        incident_id: INCIDENT_ID
      }
    });

    expect(missingIncident.statusCode).toBe(400);
    expect(missingIncident.json()).toEqual({ error: "invalid_body" });
    expect(unrelatedIncident.statusCode).toBe(404);
    expect(unrelatedIncident.json()).toEqual({ error: "incident_not_found" });
    expect(validIncident.statusCode).toBe(200);
    expect(validIncident.json()).toEqual({ status: "pending", bundle_generation_id: BUNDLE_GENERATION_ID });
    expect(requestAnalyticsBundleGenerationForProject).toHaveBeenCalledOnce();
    expect(requestAnalyticsBundleGenerationForProject).toHaveBeenCalledWith(expect.objectContaining({
      analysis_kind: "incident_impact",
      analysis_spec: expect.objectContaining({
        incident_id: INCIDENT_ID,
        from: "2026-02-28T00:00:00.000Z",
        to: "2026-03-09T00:00:00.000Z"
      })
    }));
  });

  it("returns completed AnalyticsBundle artifacts through project access", async () => {
    const bundle = buildAnalyticsBundle({
      analysis_kind: "usage_summary",
      input_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      project: {
        project_id: PROJECT_ID,
        service: "web",
        environment: "production"
      },
      analysis_window: {
        from: FROM,
        to: TO,
        granularity: "day"
      },
      summary: {
        title: "Usage summary",
        description: "Important usage evidence for agents.",
        confidence: "high",
        severity: "low"
      },
      metrics: {
        sessions_analyzed: 12,
        affected_sessions: 0
      },
      segments: [],
      journey_patterns: [],
      representative_journeys: [],
      linked_incidents: [],
      linked_deploys: [],
      recommendations: [],
      redaction: {
        rules_applied: ["analytics-aggregate-only"],
        omitted_fields: ["raw_click_text"]
      }
    });
    const generation = createAnalyticsBundleGeneration();
    const objectStoreReader = {
      getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(bundle), "utf8")))
    };
    const analyticsBundles = createAnalyticsBundlesDependency({
      getAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue(generation)
    });
    const app = createDependencies({ analyticsBundles, objectStoreReader });

    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/bundles/${BUNDLE_GENERATION_ID}?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(bundle);
    expect(analyticsBundles.getAnalyticsBundleGenerationForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID,
      generation_id: BUNDLE_GENERATION_ID
    });
    expect(objectStoreReader.getObject).toHaveBeenCalledWith({ key: generation.object_key });
  });

  it("returns AnalyticsBundle generation state when bundles are pending or failed", async () => {
    const pending = await createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency({
        getAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue(createAnalyticsBundleGeneration({
          status: "running",
          object_key: null
        }))
      })
    }).inject({
      method: "GET",
      url: `/v1/analytics/bundles/${BUNDLE_GENERATION_ID}?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const failed = await createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency({
        getAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue(createAnalyticsBundleGeneration({
          status: "failed",
          object_key: null,
          failure_reason: "monthly_quota_exceeded"
        }))
      })
    }).inject({
      method: "GET",
      url: `/v1/analytics/bundles/${BUNDLE_GENERATION_ID}?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(pending.statusCode).toBe(200);
    expect(pending.json()).toEqual({ status: "pending", bundle_generation_id: BUNDLE_GENERATION_ID });
    expect(failed.statusCode).toBe(200);
    expect(failed.json()).toEqual({ status: "failed", reason: "monthly_quota_exceeded" });
  });

  it("rejects invalid AnalyticsBundle reads and unavailable storage", async () => {
    const invalidId = await createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency({
        getAnalyticsBundleGenerationForProject: vi.fn()
      })
    }).inject({
      method: "GET",
      url: `/v1/analytics/bundles/not-a-uuid?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const unavailable = await createDependencies().inject({
      method: "GET",
      url: `/v1/analytics/bundles/${BUNDLE_GENERATION_ID}?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const notFound = await createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency({
        getAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue(null)
      })
    }).inject({
      method: "GET",
      url: `/v1/analytics/bundles/${BUNDLE_GENERATION_ID}?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(invalidId.statusCode).toBe(400);
    expect(invalidId.json()).toEqual({ error: "invalid_bundle_generation_id" });
    expect(unavailable.statusCode).toBe(404);
    expect(unavailable.json()).toEqual({ error: "analytics_bundles_not_available" });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toEqual({ error: "analytics_bundle_not_found" });
  });
});
