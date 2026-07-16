import { describe, expect, it, vi } from "vitest";

import {
  FROM,
  TO,
  INCIDENT_ID,
  PROJECT_ID,
  createAnalyticsMetricsDependency,
  createAnalyticsOpportunitiesDependency,
  createDependencies,
  createIncidentImpact,
  createOpportunity,
  createProjectAccess,
  createSummary,
  metricsWindow
} from "../../helpers/analytics-route-fixtures.js";

describe("analytics metrics routes", () => {
  it("returns project analytics summary through member-token project access", async () => {
    const getUsageSummaryForProject = vi.fn().mockResolvedValue(createSummary());
    const app = createDependencies({
      analyticsMetrics: createAnalyticsMetricsDependency({ getUsageSummaryForProject })
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/summary?project_id=${PROJECT_ID}&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}&granularity=day&environment=production&route=%2Fcheckout&device_type=mobile&browser=Chrome&os=iOS&language=en&country=US&auth_state=authenticated&referrer=example.com&utm_source=google&utm_medium=cpc&utm_campaign=summer&custom_dimension.account_tier=team&limit=5`,
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
      route: "/checkout",
      device_type: "mobile",
      browser: "Chrome",
      os: "iOS",
      language: "en",
      country: "US",
      auth_state: "authenticated",
      referrer: "example.com",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "summer",
      custom_dimensions: { account_tier: "team" },
      limit: 5
    });
  });

  it("serves Free project metrics while rejecting invalid queries and unavailable storage", async () => {
    const invalidQuery = await createDependencies({
      analyticsMetrics: createAnalyticsMetricsDependency({ getUsageSummaryForProject: vi.fn() })
    }).inject({
      method: "GET",
      url: "/v1/analytics/summary?project_id=not-a-uuid",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const freeMetrics = vi.fn().mockResolvedValue(createSummary());
    const freeProject = await createDependencies({
      projectAccess: createProjectAccess({ organization_plan: "free" }),
      analyticsMetrics: createAnalyticsMetricsDependency({ getUsageSummaryForProject: freeMetrics })
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
    expect(freeProject.statusCode).toBe(200);
    expect(freeProject.json()).toEqual(createSummary());
    expect(freeMetrics).toHaveBeenCalledOnce();
    expect(unavailable.statusCode).toBe(404);
    expect(unavailable.json()).toEqual({ error: "analytics_metrics_not_available" });
  });

  it("rejects malformed and excessive custom-dimension filters", async () => {
    const app = createDependencies({
      analyticsMetrics: createAnalyticsMetricsDependency({ getUsageSummaryForProject: vi.fn() })
    });
    const authHeaders = { authorization: "Bearer dbundle_mem_test_token" };
    const excessiveDimensions = Array.from(
      { length: 9 },
      (_, index) => `custom_dimension.dimension_${index}=value`
    ).join("&");

    const invalidKey = await app.inject({
      method: "GET",
      url: `/v1/analytics/summary?project_id=${PROJECT_ID}&custom_dimension.1invalid=value`,
      headers: authHeaders
    });
    const excessive = await app.inject({
      method: "GET",
      url: `/v1/analytics/summary?project_id=${PROJECT_ID}&${excessiveDimensions}`,
      headers: authHeaders
    });

    expect(invalidKey.statusCode).toBe(400);
    expect(invalidKey.json()).toEqual({ error: "invalid_query" });
    expect(excessive.statusCode).toBe(400);
    expect(excessive.json()).toEqual({ error: "invalid_query" });
  });

  it("returns detailed aggregate metrics through the analytics API routes", async () => {
    const analyticsMetrics = {
      getUsageSummaryForProject: vi.fn(),
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
      getIncidentImpactForProject: vi.fn()
    };
    const app = createDependencies({ analyticsMetrics });
    const authHeaders = { authorization: "Bearer dbundle_mem_test_token" };
    const query = `project_id=${PROJECT_ID}&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`;

    await expect(
      app.inject({ method: "GET", url: `/v1/analytics/routes?${query}`, headers: authHeaders })
    ).resolves.toMatchObject({
      statusCode: 200
    });
    await expect(
      app.inject({
        method: "GET",
        url: `/v1/analytics/journey-patterns?${query}`,
        headers: authHeaders
      })
    ).resolves.toMatchObject({
      statusCode: 200
    });
    await expect(
      app.inject({ method: "GET", url: `/v1/analytics/devices?${query}`, headers: authHeaders })
    ).resolves.toMatchObject({
      statusCode: 200
    });
    await expect(
      app.inject({ method: "GET", url: `/v1/analytics/referrers?${query}`, headers: authHeaders })
    ).resolves.toMatchObject({
      statusCode: 200
    });
    await expect(
      app.inject({ method: "GET", url: `/v1/analytics/actions?${query}`, headers: authHeaders })
    ).resolves.toMatchObject({
      statusCode: 200
    });
    await expect(
      app.inject({ method: "GET", url: `/v1/analytics/funnels?${query}`, headers: authHeaders })
    ).resolves.toMatchObject({
      statusCode: 200
    });
    await expect(
      app.inject({
        method: "GET",
        url: `/v1/analytics/funnels/checkout?${query}`,
        headers: authHeaders
      })
    ).resolves.toMatchObject({
      statusCode: 200
    });

    expect(analyticsMetrics.getRouteMetricsForProject).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: PROJECT_ID })
    );
    expect(analyticsMetrics.getJourneyPatternsForProject).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: PROJECT_ID })
    );
    expect(analyticsMetrics.getActionMetricsForProject).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: PROJECT_ID })
    );
    expect(analyticsMetrics.listFunnelsForProject).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: PROJECT_ID })
    );
    expect(analyticsMetrics.getFunnelAnalysisForProject).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: PROJECT_ID,
        funnel_key: "checkout"
      })
    );
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
      url: `/v1/analytics/incidents/${INCIDENT_ID}/impact?project_id=${PROJECT_ID}&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}&environment=production&route=%2Fcheckout&device_type=mobile&custom_dimension.account_tier=team`,
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
      route: "/checkout",
      device_type: "mobile",
      custom_dimensions: { account_tier: "team" },
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
      url: `/v1/analytics/opportunities?project_id=${PROJECT_ID}&status=all&kind=funnel_dropoff&service=web&environment=production&severity=high&bundle_status=completed&from=2026-03-01T00%3A00%3A00.000Z&to=2026-03-09T00%3A00%3A00.000Z&cursor=${encodeURIComponent(cursor)}&limit=5`,
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
      service: "web",
      environment: "production",
      severity: "high",
      bundle_status: "completed",
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-09T00:00:00.000Z",
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

  it("lists analytics opportunities across the caller organization without a project id", async () => {
    const listAnalyticsOpportunitiesForOrganization = vi.fn().mockResolvedValue({
      opportunities: [createOpportunity()],
      next_cursor: null
    });
    const analyticsOpportunities = createAnalyticsOpportunitiesDependency({
      listAnalyticsOpportunitiesForOrganization
    });
    const app = createDependencies({ analyticsOpportunities });

    const response = await app.inject({
      method: "GET",
      url: "/v1/analytics/opportunities?status=all&kind=funnel_dropoff&cursor=2026-03-08T00%3A00%3A00.000Z%7C00000000-0000-4000-8000-000000000101&limit=5",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ opportunities: [createOpportunity()], next_cursor: null });
    expect(listAnalyticsOpportunitiesForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      status: undefined,
      kind: "funnel_dropoff",
      cursor: {
        last_detected_at: TO,
        opportunity_id: createOpportunity().opportunity_id
      },
      limit: 5
    });
  });

  it("authenticates organization-wide inventory reads before checking availability", async () => {
    const response = await createDependencies().inject({
      method: "GET",
      url: "/v1/analytics/opportunities"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "invalid_member_token" });
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
    const invertedWindow = await createDependencies({
      analyticsOpportunities: createAnalyticsOpportunitiesDependency()
    }).inject({
      method: "GET",
      url: `/v1/analytics/opportunities?from=${encodeURIComponent(TO)}&to=${encodeURIComponent(FROM)}`,
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
    expect(invertedWindow.statusCode).toBe(400);
    expect(invertedWindow.json()).toEqual({ error: "invalid_query" });
    expect(unavailable.statusCode).toBe(404);
    expect(unavailable.json()).toEqual({ error: "analytics_opportunities_not_available" });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toEqual({ error: "analytics_opportunity_not_found" });
  });

});
