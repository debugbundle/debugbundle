import { describe, expect, it, vi } from "vitest";

import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { createApiServer } from "../../../apps/api/src/server.js";
import type {
  AnalyticsOpportunitiesListResponse,
  AnalyticsOpportunityResponse,
  AnalyticsUsageSummaryResponse
} from "../../../packages/shared-types/src/index.js";

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";
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
    ...overrides
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

function createDependencies(overrides: {
  analyticsMetrics?: ApiDependencies["analyticsMetrics"];
  analyticsOpportunities?: ApiDependencies["analyticsOpportunities"];
  projectAccess?: ReturnType<typeof createProjectAccess> | null;
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
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: { getObject: vi.fn() },
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
    analyticsOpportunities: overrides.analyticsOpportunities
  });
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
      })
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
    await expect(app.inject({ method: "GET", url: `/v1/analytics/funnels/checkout?${query}`, headers: authHeaders })).resolves.toMatchObject({
      statusCode: 200
    });

    expect(analyticsMetrics.getRouteMetricsForProject).toHaveBeenCalledWith(expect.objectContaining({ project_id: PROJECT_ID }));
    expect(analyticsMetrics.getJourneyPatternsForProject).toHaveBeenCalledWith(expect.objectContaining({ project_id: PROJECT_ID }));
    expect(analyticsMetrics.getFunnelAnalysisForProject).toHaveBeenCalledWith(expect.objectContaining({
      project_id: PROJECT_ID,
      funnel_key: "checkout"
    }));
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
});
