import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import {
  AnalyticsMetricsApiError,
  createAnalyticsMetricsApi,
  getAnalyticsDevicesCommand,
  getAnalyticsDevicesWithAuthCommand,
  getAnalyticsFunnelCommand,
  getAnalyticsFunnelWithAuthCommand,
  getAnalyticsOpportunityCommand,
  getAnalyticsOpportunityWithAuthCommand,
  getAnalyticsJourneysCommand,
  getAnalyticsJourneysWithAuthCommand,
  getAnalyticsActionsCommand,
  getAnalyticsActionsWithAuthCommand,
  getAnalyticsIncidentImpactCommand,
  getAnalyticsIncidentImpactWithAuthCommand,
  getAnalyticsReferrersCommand,
  getAnalyticsReferrersWithAuthCommand,
  getAnalyticsRoutesCommand,
  getAnalyticsRoutesWithAuthCommand,
  getAnalyticsSummaryCommand,
  getAnalyticsSummaryWithAuthCommand,
  listAnalyticsFunnelsCommand,
  listAnalyticsFunnelsWithAuthCommand,
  listAnalyticsOpportunitiesCommand,
  listAnalyticsOpportunitiesWithAuthCommand
} from "../../../apps/cli/src/analytics-metrics-commands.js";

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

const summaryResponse = {
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
} as const;

const journeyPatternsResponse = {
  window: metricsWindow,
  patterns: [
    {
      from_route_key: "/pricing",
      to_route_key: "/checkout",
      transition_count: 30,
      unique_sessions: 18,
      transition_share: 0.6,
      sample_ids: ["00000000-0000-4000-8000-000000000301"]
    }
  ]
} as const;

const funnelsResponse = {
  window: metricsWindow,
  funnels: [
    {
      funnel_key: "checkout",
      sessions_entered: 30,
      sessions_completed: 18,
      dropoffs: 12,
      conversion_rate: 0.6
    }
  ]
} as const;

const actionsResponse = {
  window: metricsWindow,
  actions: [
    { action_key: "signup_click", kind: "action", event_count: 14, unique_sessions: 9 },
    {
      action_key: "conversion:trial_started",
      kind: "conversion",
      event_count: 5,
      unique_sessions: 5
    }
  ]
} as const;

const routesResponse = {
  window: metricsWindow,
  routes: [
    {
      route_key: "/checkout",
      pageviews: 24,
      unique_sessions: 15,
      entrances: 8,
      exits: 4,
      bounces: 2,
      linked_incident_sessions: 1
    }
  ]
} as const;

const devicesResponse = {
  window: metricsWindow,
  device_types: [{ value: "mobile", sessions: 8, pageviews: 17 }],
  browsers: [{ value: "Safari", sessions: 6, pageviews: 12 }],
  os: [{ value: "iOS", sessions: 6, pageviews: 12 }],
  languages: [{ value: "en-US", sessions: 8, pageviews: 17 }]
} as const;

const referrersResponse = {
  window: metricsWindow,
  referrers: [{ value: "example.com", sessions: 4, pageviews: 10 }],
  utm_sources: [{ value: "google", sessions: 4, pageviews: 10 }],
  utm_mediums: [{ value: "cpc", sessions: 3, pageviews: 8 }],
  utm_campaigns: [{ value: "summer", sessions: 3, pageviews: 8 }]
} as const;

const funnelAnalysisResponse = {
  funnel: {
    ...metricsWindow,
    funnel_key: "checkout",
    sessions_entered: 30,
    sessions_completed: 18,
    dropoffs: 12,
    conversion_rate: 0.6
  },
  steps: [
    {
      step_key: "signup_started",
      step_order: 0,
      sessions_entered: 30,
      sessions_completed: 18,
      dropoffs: 12,
      conversion_rate: 0.6
    }
  ]
} as const;

const opportunity = {
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
} as const;

const opportunitiesResponse = {
  opportunities: [opportunity],
  next_cursor: null
} as const;

const incidentImpactResponse = {
  incident_id: "00000000-0000-4000-8000-000000000444",
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
} as const;

describe("cli analytics metrics commands", () => {
  it("renders analytics summary in human and json mode", async () => {
    const human = await getAnalyticsSummaryCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, from: FROM, to: TO },
      { getUsageSummary: vi.fn().mockResolvedValue(summaryResponse) }
    );
    const json = await getAnalyticsSummaryCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, from: FROM, to: TO, json: true },
      { getUsageSummary: vi.fn().mockResolvedValue(summaryResponse) }
    );

    expect(human.exitCode).toBe(0);
    expect(human.output).toContain("sessions: 12");
    expect(human.output).toContain("pageviews: 30");
    expect(human.output).toContain("top_device_types: desktop (9 sessions, 20 pageviews)");
    expect(JSON.parse(json.output)).toEqual(summaryResponse);
  });

  it("renders analytics journey patterns in human and json mode", async () => {
    const human = await getAnalyticsJourneysCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, from: FROM, to: TO },
      { getJourneyPatterns: vi.fn().mockResolvedValue(journeyPatternsResponse) }
    );
    const json = await getAnalyticsJourneysCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, from: FROM, to: TO, json: true },
      { getJourneyPatterns: vi.fn().mockResolvedValue(journeyPatternsResponse) }
    );

    expect(human.exitCode).toBe(0);
    expect(human.output).toContain(
      "/pricing -> /checkout: 30 transitions, 18 sessions, 0.6 share, 1 samples"
    );
    expect(JSON.parse(json.output)).toEqual(journeyPatternsResponse);
  });

  it("renders analytics funnel summaries in human and json mode", async () => {
    const human = await listAnalyticsFunnelsCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, from: FROM, to: TO },
      { listFunnels: vi.fn().mockResolvedValue(funnelsResponse) }
    );
    const json = await listAnalyticsFunnelsCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, from: FROM, to: TO, json: true },
      { listFunnels: vi.fn().mockResolvedValue(funnelsResponse) }
    );

    expect(human.exitCode).toBe(0);
    expect(human.output).toContain(
      "checkout: 30 entered, 18 completed, 12 dropoffs, 0.6 conversion"
    );
    expect(JSON.parse(json.output)).toEqual(funnelsResponse);
  });

  it("renders analytics action metrics in human and json mode", async () => {
    const human = await getAnalyticsActionsCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, from: FROM, to: TO },
      { getActionMetrics: vi.fn().mockResolvedValue(actionsResponse) }
    );
    const json = await getAnalyticsActionsCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, from: FROM, to: TO, json: true },
      { getActionMetrics: vi.fn().mockResolvedValue(actionsResponse) }
    );

    expect(human.exitCode).toBe(0);
    expect(human.output).toContain("signup_click: 14 events, 9 sessions, action");
    expect(human.output).toContain("conversion:trial_started: 5 events, 5 sessions, conversion");
    expect(JSON.parse(json.output)).toEqual(actionsResponse);
  });

  it("renders route, device, referrer, and detailed funnel metrics", async () => {
    const input = { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, from: FROM, to: TO };
    const routes = await getAnalyticsRoutesCommand(input, {
      getRouteMetrics: vi.fn().mockResolvedValue(routesResponse)
    });
    const devices = await getAnalyticsDevicesCommand(input, {
      getDeviceBreakdown: vi.fn().mockResolvedValue(devicesResponse)
    });
    const referrers = await getAnalyticsReferrersCommand(input, {
      getReferrerMetrics: vi.fn().mockResolvedValue(referrersResponse)
    });
    const funnel = await getAnalyticsFunnelCommand(
      { ...input, funnelKey: "checkout" },
      { getFunnelAnalysis: vi.fn().mockResolvedValue(funnelAnalysisResponse) }
    );

    expect(routes.output).toContain("/checkout: 24 pageviews, 15 sessions, 4 exits");
    expect(devices.output).toContain("device_types: mobile (8 sessions, 17 pageviews)");
    expect(referrers.output).toContain("utm_sources: google (4 sessions, 10 pageviews)");
    expect(funnel.output).toContain("sessions_completed: 18");
    expect(funnel.output).toContain("signup_started: 30 entered, 18 completed, 12 dropoffs");
  });

  it("renders stable empty states for metric inventories", async () => {
    const input = { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID };

    await expect(
      getAnalyticsRoutesCommand(input, {
        getRouteMetrics: vi.fn().mockResolvedValue({ window: metricsWindow, routes: [] })
      })
    ).resolves.toMatchObject({ output: "No route metrics found." });
    await expect(
      getAnalyticsJourneysCommand(input, {
        getJourneyPatterns: vi.fn().mockResolvedValue({ window: metricsWindow, patterns: [] })
      })
    ).resolves.toMatchObject({ output: "No journey patterns found." });
    await expect(
      getAnalyticsActionsCommand(input, {
        getActionMetrics: vi.fn().mockResolvedValue({ window: metricsWindow, actions: [] })
      })
    ).resolves.toMatchObject({ output: "No action metrics found." });
    await expect(
      listAnalyticsFunnelsCommand(input, {
        listFunnels: vi.fn().mockResolvedValue({ window: metricsWindow, funnels: [] })
      })
    ).resolves.toMatchObject({ output: "No funnel metrics found." });
    await expect(
      listAnalyticsOpportunitiesCommand(input, {
        listOpportunities: vi.fn().mockResolvedValue({ opportunities: [], next_cursor: null })
      })
    ).resolves.toMatchObject({ output: "No analytics opportunities found." });
  });

  it("renders incident impact in human and json mode", async () => {
    const human = await getAnalyticsIncidentImpactCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: PROJECT_ID,
        incidentId: incidentImpactResponse.incident_id,
        from: FROM,
        to: TO
      },
      { getIncidentImpact: vi.fn().mockResolvedValue(incidentImpactResponse) }
    );
    const json = await getAnalyticsIncidentImpactCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: PROJECT_ID,
        incidentId: incidentImpactResponse.incident_id,
        from: FROM,
        to: TO,
        json: true
      },
      { getIncidentImpact: vi.fn().mockResolvedValue(incidentImpactResponse) }
    );

    expect(human.exitCode).toBe(0);
    expect(human.output).toContain("affected_sessions: 4");
    expect(human.output).toContain("conversion_delta: unavailable");
    expect(JSON.parse(json.output)).toEqual(incidentImpactResponse);
  });

  it("renders analytics opportunities in human and json mode", async () => {
    const human = await listAnalyticsOpportunitiesCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID },
      { listOpportunities: vi.fn().mockResolvedValue(opportunitiesResponse) }
    );
    const humanDetail = await getAnalyticsOpportunityCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: PROJECT_ID,
        opportunityId: opportunity.opportunity_id
      },
      { getOpportunity: vi.fn().mockResolvedValue({ opportunity }) }
    );
    const json = await getAnalyticsOpportunityCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: PROJECT_ID,
        opportunityId: opportunity.opportunity_id,
        json: true
      },
      { getOpportunity: vi.fn().mockResolvedValue({ opportunity }) }
    );

    expect(human.exitCode).toBe(0);
    expect(human.output).toContain(
      `${opportunity.opportunity_id} | medium | open | funnel_dropoff | Checkout dropoff increased`
    );
    expect(humanDetail.exitCode).toBe(0);
    expect(humanDetail.output).toContain(`Opportunity: ${opportunity.opportunity_id}`);
    expect(humanDetail.output).toContain("Related deploys: deploy-123");
    expect(humanDetail.output).toContain("Bundle status: not_requested");
    expect(JSON.parse(json.output)).toEqual({ opportunity });
  });

  it("omits project_id for an explicit organization-wide opportunities request", async () => {
    const request = vi.fn().mockResolvedValue({
      status: 200,
      body: opportunitiesResponse
    });
    const api = createAnalyticsMetricsApi({ request });

    await expect(
      api.listOpportunities({ bearerToken: "dbundle_mem_x", status: "all", limit: 5 })
    ).resolves.toEqual(opportunitiesResponse);

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/analytics/opportunities?status=all&limit=5",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("preserves list-specific fallback errors for funnel and opportunity inventory", async () => {
    const api = createAnalyticsMetricsApi({
      request: vi.fn().mockResolvedValue({ status: 503, body: null })
    });

    await expect(
      api.listFunnels({ bearerToken: "dbundle_mem_x", projectId: PROJECT_ID })
    ).rejects.toThrow("Failed to list analytics funnels.");
    await expect(
      api.listOpportunities({ bearerToken: "dbundle_mem_x", projectId: PROJECT_ID })
    ).rejects.toThrow("Failed to list analytics opportunities.");
  });

  it("loads auth state and forwards authenticated summary calls", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createHttpClient = vi.fn().mockReturnValue({ request: vi.fn() });
    const getUsageSummary = vi.fn().mockResolvedValue(summaryResponse);
    const createApi = vi.fn().mockReturnValue({ getUsageSummary });

    const result = await getAnalyticsSummaryWithAuthCommand(
      { authFilePath: "/tmp/auth.json", projectId: PROJECT_ID, from: FROM, to: TO, json: true },
      { readAuthState, createHttpClient, createApi }
    );

    expect(createHttpClient).toHaveBeenCalledWith({ baseUrl: "https://selfhost.debugbundle.test" });
    expect(getUsageSummary).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: PROJECT_ID,
      from: FROM,
      to: TO,
      granularity: undefined,
      service: undefined,
      environment: undefined,
      last: undefined,
      limit: undefined
    });
    expect(JSON.parse(result.output)).toEqual(summaryResponse);
  });

  it("loads auth state and forwards authenticated journey pattern calls", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createHttpClient = vi.fn().mockReturnValue({ request: vi.fn() });
    const getJourneyPatterns = vi.fn().mockResolvedValue(journeyPatternsResponse);
    const createApi = vi.fn().mockReturnValue({ getJourneyPatterns });

    const result = await getAnalyticsJourneysWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: PROJECT_ID,
        from: FROM,
        to: TO,
        route: "/checkout",
        deviceType: "mobile",
        referrer: "example.com",
        utmSource: "google",
        customDimensions: { account_tier: "team" },
        json: true
      },
      { readAuthState, createHttpClient, createApi }
    );

    expect(createHttpClient).toHaveBeenCalledWith({ baseUrl: "https://selfhost.debugbundle.test" });
    expect(getJourneyPatterns).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: PROJECT_ID,
      from: FROM,
      to: TO,
      granularity: undefined,
      service: undefined,
      environment: undefined,
      route: "/checkout",
      deviceType: "mobile",
      referrer: "example.com",
      utmSource: "google",
      customDimensions: { account_tier: "team" },
      last: undefined,
      limit: undefined
    });
    expect(JSON.parse(result.output)).toEqual(journeyPatternsResponse);
  });

  it("loads auth state and forwards authenticated funnel summary calls", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createHttpClient = vi.fn().mockReturnValue({ request: vi.fn() });
    const listFunnels = vi.fn().mockResolvedValue(funnelsResponse);
    const createApi = vi.fn().mockReturnValue({ listFunnels });

    const result = await listAnalyticsFunnelsWithAuthCommand(
      { authFilePath: "/tmp/auth.json", projectId: PROJECT_ID, from: FROM, to: TO, json: true },
      { readAuthState, createHttpClient, createApi }
    );

    expect(createHttpClient).toHaveBeenCalledWith({ baseUrl: "https://selfhost.debugbundle.test" });
    expect(listFunnels).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: PROJECT_ID,
      from: FROM,
      to: TO,
      granularity: undefined,
      service: undefined,
      environment: undefined,
      last: undefined,
      limit: undefined
    });
    expect(JSON.parse(result.output)).toEqual(funnelsResponse);
  });

  it("loads auth state and forwards authenticated action metric calls", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createHttpClient = vi.fn().mockReturnValue({ request: vi.fn() });
    const getActionMetrics = vi.fn().mockResolvedValue(actionsResponse);
    const createApi = vi.fn().mockReturnValue({ getActionMetrics });

    const result = await getAnalyticsActionsWithAuthCommand(
      { authFilePath: "/tmp/auth.json", projectId: PROJECT_ID, from: FROM, to: TO, json: true },
      { readAuthState, createHttpClient, createApi }
    );

    expect(createHttpClient).toHaveBeenCalledWith({ baseUrl: "https://selfhost.debugbundle.test" });
    expect(getActionMetrics).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: PROJECT_ID,
      from: FROM,
      to: TO,
      granularity: undefined,
      service: undefined,
      environment: undefined,
      last: undefined,
      limit: undefined
    });
    expect(JSON.parse(result.output)).toEqual(actionsResponse);
  });

  it("loads auth state and forwards authenticated opportunity list calls", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createHttpClient = vi.fn().mockReturnValue({ request: vi.fn() });
    const listOpportunities = vi.fn().mockResolvedValue(opportunitiesResponse);
    const createApi = vi.fn().mockReturnValue({ listOpportunities });

    const result = await listAnalyticsOpportunitiesWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: PROJECT_ID,
        status: "all",
        kind: "funnel_dropoff",
        service: "web",
        environment: "production",
        severity: "high",
        bundleStatus: "completed",
        from: FROM,
        to: TO,
        cursor: "cursor-1",
        limit: 5,
        json: true
      },
      { readAuthState, createHttpClient, createApi }
    );

    expect(createHttpClient).toHaveBeenCalledWith({ baseUrl: "https://selfhost.debugbundle.test" });
    expect(listOpportunities).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: PROJECT_ID,
      status: "all",
      kind: "funnel_dropoff",
      service: "web",
      environment: "production",
      severity: "high",
      bundleStatus: "completed",
      from: FROM,
      to: TO,
      cursor: "cursor-1",
      limit: 5
    });
    expect(JSON.parse(result.output)).toEqual(opportunitiesResponse);
  });

  it("loads auth state and forwards authenticated opportunity detail calls", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createHttpClient = vi.fn().mockReturnValue({ request: vi.fn() });
    const getOpportunity = vi.fn().mockResolvedValue({ opportunity });
    const createApi = vi.fn().mockReturnValue({ getOpportunity });

    const result = await getAnalyticsOpportunityWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: PROJECT_ID,
        opportunityId: opportunity.opportunity_id,
        json: true
      },
      { readAuthState, createHttpClient, createApi }
    );

    expect(createHttpClient).toHaveBeenCalledWith({ baseUrl: "https://selfhost.debugbundle.test" });
    expect(getOpportunity).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: PROJECT_ID,
      opportunityId: opportunity.opportunity_id
    });
    expect(JSON.parse(result.output)).toEqual({ opportunity });
  });

  it("forwards the remaining authenticated metric commands", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createHttpClient = vi.fn().mockReturnValue({ request: vi.fn() });
    const api = {
      getRouteMetrics: vi.fn().mockResolvedValue(routesResponse),
      getDeviceBreakdown: vi.fn().mockResolvedValue(devicesResponse),
      getReferrerMetrics: vi.fn().mockResolvedValue(referrersResponse),
      getFunnelAnalysis: vi.fn().mockResolvedValue(funnelAnalysisResponse),
      getIncidentImpact: vi.fn().mockResolvedValue(incidentImpactResponse)
    };
    const dependencies = {
      readAuthState,
      createHttpClient,
      createApi: vi.fn().mockReturnValue(api)
    };
    const input = { authFilePath: "/tmp/auth.json", projectId: PROJECT_ID, json: true };

    await getAnalyticsRoutesWithAuthCommand(input, dependencies);
    await getAnalyticsDevicesWithAuthCommand(input, dependencies);
    await getAnalyticsReferrersWithAuthCommand(input, dependencies);
    await getAnalyticsFunnelWithAuthCommand({ ...input, funnelKey: "checkout" }, dependencies);
    await getAnalyticsIncidentImpactWithAuthCommand(
      { ...input, incidentId: incidentImpactResponse.incident_id },
      dependencies
    );

    expect(api.getRouteMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ bearerToken: "dbundle_mem_saved", projectId: PROJECT_ID })
    );
    expect(api.getDeviceBreakdown).toHaveBeenCalledOnce();
    expect(api.getReferrerMetrics).toHaveBeenCalledOnce();
    expect(api.getFunnelAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ funnelKey: "checkout" })
    );
    expect(api.getIncidentImpact).toHaveBeenCalledWith(
      expect.objectContaining({ incidentId: incidentImpactResponse.incident_id })
    );
  });

  it("uses the default authenticated HTTP client when only fetch is injected", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(routesResponse), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const result = await getAnalyticsRoutesWithAuthCommand(
      { projectId: PROJECT_ID, json: true },
      {
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_saved",
          base_url: "https://selfhost.debugbundle.test"
        }),
        fetchImpl
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual(routesResponse);
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://selfhost.debugbundle.test/v1/analytics/routes?project_id=${PROJECT_ID}`,
      expect.objectContaining({ method: "GET" })
    );
  });

  it("rejects invalid opportunity filters before calling the API", async () => {
    const listOpportunities = vi.fn();
    const api = { listOpportunities };

    await expect(
      listAnalyticsOpportunitiesCommand(
        { bearerToken: "token", status: "invalid" as never },
        api
      )
    ).resolves.toEqual({ exitCode: 4, output: "Invalid value for --status." });
    await expect(
      listAnalyticsOpportunitiesCommand(
        { bearerToken: "token", severity: "invalid" as never },
        api
      )
    ).resolves.toEqual({ exitCode: 4, output: "Invalid value for --severity." });
    await expect(
      listAnalyticsOpportunitiesCommand(
        { bearerToken: "token", bundleStatus: "invalid" as never },
        api
      )
    ).resolves.toEqual({ exitCode: 4, output: "Invalid value for --bundle-status." });
    expect(listOpportunities).not.toHaveBeenCalled();
  });

  it("maps metric, funnel, and opportunity failures to stable exit codes", async () => {
    const routes = await getAnalyticsRoutesCommand(
      { bearerToken: "token", projectId: PROJECT_ID },
      { getRouteMetrics: vi.fn().mockRejectedValue(new Error("route unavailable")) }
    );
    const funnel = await getAnalyticsFunnelCommand(
      { bearerToken: "token", projectId: PROJECT_ID, funnelKey: "checkout" },
      {
        getFunnelAnalysis: vi
          .fn()
          .mockRejectedValue(new AnalyticsMetricsApiError(404, "funnel not found"))
      }
    );
    const opportunities = await listAnalyticsOpportunitiesCommand(
      { bearerToken: "token" },
      {
        listOpportunities: vi
          .fn()
          .mockRejectedValue(new AnalyticsMetricsApiError(500, "inventory unavailable"))
      }
    );
    const detail = await getAnalyticsOpportunityCommand(
      { bearerToken: "token", projectId: PROJECT_ID, opportunityId: opportunity.opportunity_id },
      {
        getOpportunity: vi
          .fn()
          .mockRejectedValue(new AnalyticsMetricsApiError(400, "invalid opportunity"))
      }
    );

    expect(routes).toEqual({ exitCode: 1, output: "route unavailable" });
    expect(funnel).toEqual({ exitCode: 3, output: "funnel not found" });
    expect(opportunities).toEqual({ exitCode: 1, output: "inventory unavailable" });
    expect(detail).toEqual({ exitCode: 4, output: "invalid opportunity" });
  });

  it("maps auth and API failures to stable exit codes", async () => {
    const authMissing = await getAnalyticsSummaryWithAuthCommand(
      { projectId: PROJECT_ID },
      {
        readAuthState: vi
          .fn()
          .mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );
    const unauthorized = await getAnalyticsSummaryCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID },
      {
        getUsageSummary: vi
          .fn()
          .mockRejectedValue(new AnalyticsMetricsApiError(401, "invalid_member_token"))
      }
    );
    const forbidden = await getAnalyticsSummaryCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID },
      {
        getUsageSummary: vi
          .fn()
          .mockRejectedValue(new AnalyticsMetricsApiError(403, "upgrade_required"))
      }
    );

    expect(authMissing).toEqual({ exitCode: 2, output: "Not logged in." });
    expect(unauthorized).toEqual({ exitCode: 2, output: "invalid_member_token" });
    expect(forbidden).toEqual({ exitCode: 4, output: "upgrade_required" });
  });

  it("builds GET requests against the analytics summary API", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, body: summaryResponse })
      .mockResolvedValueOnce({ status: 200, body: { window: metricsWindow, routes: [] } })
      .mockResolvedValueOnce({ status: 200, body: journeyPatternsResponse })
      .mockResolvedValueOnce({
        status: 200,
        body: { window: metricsWindow, device_types: [], browsers: [], os: [], languages: [] }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          window: metricsWindow,
          referrers: [],
          utm_sources: [],
          utm_mediums: [],
          utm_campaigns: []
        }
      })
      .mockResolvedValueOnce({ status: 200, body: actionsResponse })
      .mockResolvedValueOnce({ status: 200, body: funnelsResponse })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          funnel: {
            ...metricsWindow,
            funnel_key: "checkout",
            sessions_entered: 0,
            sessions_completed: 0,
            dropoffs: 0,
            conversion_rate: 0
          },
          steps: []
        }
      })
      .mockResolvedValueOnce({ status: 200, body: opportunitiesResponse })
      .mockResolvedValueOnce({ status: 200, body: { opportunity } })
      .mockResolvedValueOnce({ status: 200, body: incidentImpactResponse });
    const api = createAnalyticsMetricsApi({ request });

    await api.getUsageSummary({
      bearerToken: "dbundle_mem_x",
      projectId: PROJECT_ID,
      from: FROM,
      to: TO,
      granularity: "day",
      service: "web",
      environment: "production",
      route: "/checkout",
      deviceType: "mobile",
      browser: "Chrome",
      os: "iOS",
      language: "en",
      country: "US",
      authState: "authenticated",
      referrer: "example.com",
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "summer",
      customDimensions: { account_tier: "team" },
      limit: 5
    });
    await api.getRouteMetrics({ bearerToken: "dbundle_mem_x", projectId: PROJECT_ID });
    await api.getJourneyPatterns({ bearerToken: "dbundle_mem_x", projectId: PROJECT_ID });
    await api.getDeviceBreakdown({ bearerToken: "dbundle_mem_x", projectId: PROJECT_ID });
    await api.getReferrerMetrics({ bearerToken: "dbundle_mem_x", projectId: PROJECT_ID });
    await api.getActionMetrics({ bearerToken: "dbundle_mem_x", projectId: PROJECT_ID });
    await api.listFunnels({ bearerToken: "dbundle_mem_x", projectId: PROJECT_ID });
    await api.getFunnelAnalysis({
      bearerToken: "dbundle_mem_x",
      projectId: PROJECT_ID,
      funnelKey: "checkout"
    });
    await api.listOpportunities({
      bearerToken: "dbundle_mem_x",
      projectId: PROJECT_ID,
      status: "all",
      kind: "funnel_dropoff",
      service: "web",
      environment: "production",
      severity: "high",
      bundleStatus: "completed",
      from: FROM,
      to: TO,
      cursor: "cursor-1",
      limit: 5
    });
    await api.getOpportunity({
      bearerToken: "dbundle_mem_x",
      projectId: PROJECT_ID,
      opportunityId: opportunity.opportunity_id
    });
    await api.getIncidentImpact({
      bearerToken: "dbundle_mem_x",
      projectId: PROJECT_ID,
      incidentId: incidentImpactResponse.incident_id
    });

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/summary?project_id=${PROJECT_ID}&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}&granularity=day&service=web&environment=production&route=%2Fcheckout&device_type=mobile&browser=Chrome&os=iOS&language=en&country=US&auth_state=authenticated&referrer=example.com&utm_source=google&utm_medium=cpc&utm_campaign=summer&custom_dimension.account_tier=team&limit=5`,
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/routes?project_id=${PROJECT_ID}`,
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/journey-patterns?project_id=${PROJECT_ID}`,
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/devices?project_id=${PROJECT_ID}`,
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/referrers?project_id=${PROJECT_ID}`,
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/actions?project_id=${PROJECT_ID}`,
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/funnels?project_id=${PROJECT_ID}`,
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/funnels/checkout?project_id=${PROJECT_ID}`,
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/opportunities?project_id=${PROJECT_ID}&status=all&kind=funnel_dropoff&service=web&environment=production&severity=high&bundle_status=completed&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}&cursor=cursor-1&limit=5`,
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/opportunities/${opportunity.opportunity_id}?project_id=${PROJECT_ID}`,
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/incidents/${incidentImpactResponse.incident_id}/impact?project_id=${PROJECT_ID}`,
      bearerToken: "dbundle_mem_x"
    });
  });
});
