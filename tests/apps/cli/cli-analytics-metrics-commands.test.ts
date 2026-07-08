import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import {
  AnalyticsMetricsApiError,
  createAnalyticsMetricsApi,
  getAnalyticsOpportunityCommand,
  getAnalyticsOpportunityWithAuthCommand,
  getAnalyticsJourneysCommand,
  getAnalyticsJourneysWithAuthCommand,
  getAnalyticsSummaryCommand,
  getAnalyticsSummaryWithAuthCommand,
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
      transition_share: 0.6
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
    expect(human.output).toContain("/pricing -> /checkout: 30 transitions, 18 sessions, 0.6 share");
    expect(JSON.parse(json.output)).toEqual(journeyPatternsResponse);
  });

  it("renders analytics opportunities in human and json mode", async () => {
    const human = await listAnalyticsOpportunitiesCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID },
      { listOpportunities: vi.fn().mockResolvedValue(opportunitiesResponse) }
    );
    const humanDetail = await getAnalyticsOpportunityCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, opportunityId: opportunity.opportunity_id },
      { getOpportunity: vi.fn().mockResolvedValue({ opportunity }) }
    );
    const json = await getAnalyticsOpportunityCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, opportunityId: opportunity.opportunity_id, json: true },
      { getOpportunity: vi.fn().mockResolvedValue({ opportunity }) }
    );

    expect(human.exitCode).toBe(0);
    expect(human.output).toContain(`${opportunity.opportunity_id} | medium | open | funnel_dropoff | Checkout dropoff increased`);
    expect(humanDetail.exitCode).toBe(0);
    expect(humanDetail.output).toContain(`Opportunity: ${opportunity.opportunity_id}`);
    expect(humanDetail.output).toContain("Related deploys: deploy-123");
    expect(humanDetail.output).toContain("Bundle status: not_requested");
    expect(JSON.parse(json.output)).toEqual({ opportunity });
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
      { authFilePath: "/tmp/auth.json", projectId: PROJECT_ID, from: FROM, to: TO, json: true },
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
      last: undefined,
      limit: undefined
    });
    expect(JSON.parse(result.output)).toEqual(journeyPatternsResponse);
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

  it("maps auth and API failures to stable exit codes", async () => {
    const authMissing = await getAnalyticsSummaryWithAuthCommand(
      { projectId: PROJECT_ID },
      { readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in.")) }
    );
    const unauthorized = await getAnalyticsSummaryCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID },
      { getUsageSummary: vi.fn().mockRejectedValue(new AnalyticsMetricsApiError(401, "invalid_member_token")) }
    );
    const forbidden = await getAnalyticsSummaryCommand(
      { bearerToken: "dbundle_mem_x", projectId: PROJECT_ID },
      { getUsageSummary: vi.fn().mockRejectedValue(new AnalyticsMetricsApiError(403, "upgrade_required")) }
    );

    expect(authMissing).toEqual({ exitCode: 2, output: "Not logged in." });
    expect(unauthorized).toEqual({ exitCode: 2, output: "invalid_member_token" });
    expect(forbidden).toEqual({ exitCode: 4, output: "upgrade_required" });
  });

  it("builds GET requests against the analytics summary API", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 200, body: summaryResponse })
      .mockResolvedValueOnce({ status: 200, body: { window: metricsWindow, routes: [] } })
      .mockResolvedValueOnce({ status: 200, body: journeyPatternsResponse })
      .mockResolvedValueOnce({
        status: 200,
        body: { window: metricsWindow, device_types: [], browsers: [], os: [], languages: [] }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: { window: metricsWindow, referrers: [], utm_sources: [], utm_mediums: [], utm_campaigns: [] }
      })
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
      .mockResolvedValueOnce({ status: 200, body: { opportunity } });
    const api = createAnalyticsMetricsApi({ request });

    await api.getUsageSummary({
      bearerToken: "dbundle_mem_x",
      projectId: PROJECT_ID,
      from: FROM,
      to: TO,
      granularity: "day",
      service: "web",
      environment: "production",
      limit: 5
    });
    await api.getRouteMetrics({ bearerToken: "dbundle_mem_x", projectId: PROJECT_ID });
    await api.getJourneyPatterns({ bearerToken: "dbundle_mem_x", projectId: PROJECT_ID });
    await api.getDeviceBreakdown({ bearerToken: "dbundle_mem_x", projectId: PROJECT_ID });
    await api.getReferrerMetrics({ bearerToken: "dbundle_mem_x", projectId: PROJECT_ID });
    await api.getFunnelAnalysis({ bearerToken: "dbundle_mem_x", projectId: PROJECT_ID, funnelKey: "checkout" });
    await api.listOpportunities({
      bearerToken: "dbundle_mem_x",
      projectId: PROJECT_ID,
      status: "all",
      kind: "funnel_dropoff",
      cursor: "cursor-1",
      limit: 5
    });
    await api.getOpportunity({
      bearerToken: "dbundle_mem_x",
      projectId: PROJECT_ID,
      opportunityId: opportunity.opportunity_id
    });

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/summary?project_id=${PROJECT_ID}&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}&granularity=day&service=web&environment=production&limit=5`,
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
      path: `/v1/analytics/funnels/checkout?project_id=${PROJECT_ID}`,
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/opportunities?project_id=${PROJECT_ID}&status=all&kind=funnel_dropoff&cursor=cursor-1&limit=5`,
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/analytics/opportunities/${opportunity.opportunity_id}?project_id=${PROJECT_ID}`,
      bearerToken: "dbundle_mem_x"
    });
  });
});
