import { describe, expect, it, vi } from "vitest";

import {
  createPostgresAnalyticsMetricsStore,
  type Queryable
} from "../../../packages/storage/src/index.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

describe("analytics metrics store", () => {
  it("reads aggregate usage summary and bounded breakdowns from analytics rollups", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("FROM analytics_session_rollups") && sqlText.includes("SUM(new_visitors)")) {
        return {
          rows: [{
            sessions: "12",
            pageviews: "30",
            new_visitors: "4",
            returning_visitors: "3",
            exits: "2"
          }]
        };
      }

      if (sqlText.includes("FROM analytics_action_rollups") && sqlText.includes("GROUP BY action_key")) {
        expect(params.at(-1)).toBe(3);
        return {
          rows: [{
            action_key: "signup_click",
            event_count: "14",
            unique_sessions: "9"
          }, {
            action_key: "conversion:trial_started",
            event_count: "5",
            unique_sessions: "5"
          }]
        };
      }

      if (sqlText.includes("FROM analytics_action_rollups")) {
        return { rows: [{ conversions: "5" }] };
      }

      if (sqlText.includes("GROUP BY value")) {
        expect(params.at(-1)).toBe(3);
        if (sqlText.includes("device_type")) {
          return { rows: [{ value: "desktop", sessions: "9", pageviews: "20" }] };
        }
        if (sqlText.includes("browser_family")) {
          return { rows: [{ value: "Chrome", sessions: "7", pageviews: "18" }] };
        }
        if (sqlText.includes("os_family")) {
          return { rows: [{ value: "macOS", sessions: "6", pageviews: "16" }] };
        }
        if (sqlText.includes("language")) {
          return { rows: [{ value: "en", sessions: "10", pageviews: "25" }] };
        }
        if (sqlText.includes("referrer_domain")) {
          return { rows: [{ value: "google.com", sessions: "5", pageviews: "12" }] };
        }
        if (sqlText.includes("auth_state")) {
          return { rows: [{ value: "authenticated", sessions: "8", pageviews: "19" }] };
        }
      }

      throw new Error(`Unhandled analytics metrics SQL: ${sqlText}`);
    });

    const store = createPostgresAnalyticsMetricsStore({ query: queryMock as Queryable["query"] });

    await expect(
      store.getUsageSummary({
        project_id: PROJECT_ID,
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-08T00:00:00.000Z",
        granularity: "day",
        service: "web",
        environment: "production",
        limit: 3
      })
    ).resolves.toEqual({
      summary: {
        project_id: PROJECT_ID,
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-08T00:00:00.000Z",
        granularity: "day",
        service: "web",
        environment: "production",
        sessions: 12,
        pageviews: 30,
        active_visitors: 7,
        new_visitors: 4,
        returning_visitors: 3,
        exits: 2,
        conversions: 5
      },
      breakdowns: {
        device_types: [{ value: "desktop", sessions: 9, pageviews: 20 }],
        browsers: [{ value: "Chrome", sessions: 7, pageviews: 18 }],
        os: [{ value: "macOS", sessions: 6, pageviews: 16 }],
        languages: [{ value: "en", sessions: 10, pageviews: 25 }],
        referrers: [{ value: "google.com", sessions: 5, pageviews: 12 }],
        auth_states: [{ value: "authenticated", sessions: 8, pageviews: 19 }]
      }
    });

    await expect(
      store.getActionMetrics({
        project_id: PROJECT_ID,
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-08T00:00:00.000Z",
        granularity: "day",
        service: "web",
        environment: "production",
        limit: 3
      })
    ).resolves.toEqual({
      window: {
        project_id: PROJECT_ID,
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-08T00:00:00.000Z",
        granularity: "day",
        service: "web",
        environment: "production"
      },
      actions: [
        { action_key: "signup_click", kind: "action", event_count: 14, unique_sessions: 9 },
        { action_key: "conversion:trial_started", kind: "conversion", event_count: 5, unique_sessions: 5 }
      ]
    });
  });

  it("reads route, referrer, device, and funnel aggregates from rollups", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("FROM analytics_route_rollups")) {
        return {
          rows: [{
            route_key: "/pricing",
            pageviews: "40",
            unique_sessions: "22",
            entrances: "15",
            exits: "6",
            bounces: "3",
            linked_incident_sessions: "2"
          }]
        };
      }

      if (sqlText.includes("FROM analytics_funnel_rollups") && sqlText.includes("GROUP BY funnel_key")) {
        expect(params.at(-1)).toBe(10);
        return {
          rows: [{
            funnel_key: "checkout",
            sessions_entered: "30",
            sessions_completed: "18",
            dropoffs: "12"
          }]
        };
      }

      if (sqlText.includes("FROM analytics_funnel_rollups")) {
        expect(params).toContain("checkout");
        return {
          rows: [{
            step_key: "payment",
            step_order: 2,
            sessions_entered: "20",
            sessions_completed: "12",
            dropoffs: "8"
          }]
        };
      }

      if (sqlText.includes("FROM analytics_session_rollups") && sqlText.includes("GROUP BY value")) {
        if (sqlText.includes("device_type")) {
          return { rows: [{ value: "mobile", sessions: "8", pageviews: "17" }] };
        }
        if (sqlText.includes("referrer_domain")) {
          return { rows: [{ value: "google.com", sessions: "5", pageviews: "12" }] };
        }
        if (sqlText.includes("utm_source")) {
          return { rows: [{ value: "google", sessions: "4", pageviews: "10" }] };
        }
        return { rows: [] };
      }

      throw new Error(`Unhandled analytics metrics SQL: ${sqlText}`);
    });

    const store = createPostgresAnalyticsMetricsStore({ query: queryMock as Queryable["query"] });
    const input = {
      project_id: PROJECT_ID,
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-08T00:00:00.000Z",
      granularity: "day" as const
    };

    await expect(store.getRouteMetrics(input)).resolves.toEqual({
      window: expect.objectContaining({ project_id: PROJECT_ID }),
      routes: [{
        route_key: "/pricing",
        pageviews: 40,
        unique_sessions: 22,
        entrances: 15,
        exits: 6,
        bounces: 3,
        linked_incident_sessions: 2
      }]
    });
    await expect(store.getDeviceBreakdown(input)).resolves.toMatchObject({
      device_types: [{ value: "mobile", sessions: 8, pageviews: 17 }]
    });
    await expect(store.getReferrerMetrics(input)).resolves.toMatchObject({
      referrers: [{ value: "google.com", sessions: 5, pageviews: 12 }],
      utm_sources: [{ value: "google", sessions: 4, pageviews: 10 }]
    });
    await expect(store.listFunnels(input)).resolves.toEqual({
      window: expect.objectContaining({ project_id: PROJECT_ID }),
      funnels: [{
        funnel_key: "checkout",
        sessions_entered: 30,
        sessions_completed: 18,
        dropoffs: 12,
        conversion_rate: 0.6
      }]
    });
    await expect(store.getFunnelAnalysis({ ...input, funnel_key: "checkout" })).resolves.toEqual({
      funnel: expect.objectContaining({
        project_id: PROJECT_ID,
        funnel_key: "checkout",
        sessions_entered: 20,
        sessions_completed: 12,
        dropoffs: 8,
        conversion_rate: 0.6
      }),
      steps: [{
        step_key: "payment",
        step_order: 2,
        sessions_entered: 20,
        sessions_completed: 12,
        dropoffs: 8,
        conversion_rate: 0.6
      }]
    });
  });

  it("reads aggregate journey patterns from transition rollups", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("FROM analytics_transition_rollups")) {
        expect(params.at(-1)).toBe(2);
        return {
          rows: [
            {
              from_route_key: "/pricing",
              to_route_key: "/checkout",
              transition_count: "30",
              unique_sessions: "18",
              total_transitions: "50"
            },
            {
              from_route_key: "/docs",
              to_route_key: "/signup",
              transition_count: "20",
              unique_sessions: "12",
              total_transitions: "50"
            }
          ]
        };
      }

      if (sqlText.includes("JOIN analytics_journey_samples")) {
        expect(params[0]).toBe(PROJECT_ID);
        expect(params[2]).toEqual([
          "transition:/pricing->/checkout",
          "transition:/docs->/signup"
        ]);
        expect(params[3]).toBe("2026-03-01T00:00:00.000Z");
        expect(params[4]).toBe("2026-03-08T00:00:00.000Z");
        expect(params.at(-3)).toBe("web");
        expect(params.at(-2)).toBe("production");
        expect(params.at(-1)).toBe(3);
        return {
          rows: [
            {
              transition_tag: "transition:/pricing->/checkout",
              sample_id: "00000000-0000-4000-8000-000000000201"
            },
            {
              transition_tag: "transition:/pricing->/checkout",
              sample_id: "00000000-0000-4000-8000-000000000202"
            }
          ]
        };
      }

      throw new Error(`Unhandled analytics metrics SQL: ${sqlText}`);
    });

    const store = createPostgresAnalyticsMetricsStore({ query: queryMock as Queryable["query"] });

    await expect(
      store.getJourneyPatterns({
        project_id: PROJECT_ID,
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-08T00:00:00.000Z",
        granularity: "day",
        service: "web",
        environment: "production",
        limit: 2
      })
    ).resolves.toEqual({
      window: {
        project_id: PROJECT_ID,
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-08T00:00:00.000Z",
        granularity: "day",
        service: "web",
        environment: "production"
      },
      patterns: [
        {
          from_route_key: "/pricing",
          to_route_key: "/checkout",
          transition_count: 30,
          unique_sessions: 18,
          transition_share: 0.6,
          sample_ids: [
            "00000000-0000-4000-8000-000000000201",
            "00000000-0000-4000-8000-000000000202"
          ]
        },
        {
          from_route_key: "/docs",
          to_route_key: "/signup",
          transition_count: 20,
          unique_sessions: 12,
          transition_share: 0.4,
          sample_ids: []
        }
      ]
    });
  });

  it("narrows route and journey-pattern queries to an explicit route context", async (): Promise<void> => {
    const observed: Array<{ sql: string; params: unknown[] }> = [];
    const queryMock = vi.fn(async (sql: string, params: unknown[]) => {
      observed.push({ sql, params });
      return { rows: [] };
    });
    const store = createPostgresAnalyticsMetricsStore({ query: queryMock as Queryable["query"] });
    const input = {
      project_id: PROJECT_ID,
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-08T00:00:00.000Z",
      granularity: "day" as const,
      route: "/checkout"
    };

    await store.getRouteMetrics(input);
    await store.getJourneyPatterns(input);

    const routeQuery = observed.find((query) => query.sql.includes("FROM analytics_route_rollups"));
    const patternQuery = observed.find((query) => query.sql.includes("FROM analytics_transition_rollups"));
    expect(routeQuery?.sql).toContain("route_key = $5");
    expect(routeQuery?.params).toEqual([
      PROJECT_ID,
      input.from,
      input.to,
      "day",
      "/checkout",
      10
    ]);
    expect(patternQuery?.sql).toContain("(from_route_key = $5 OR to_route_key = $5)");
    expect(patternQuery?.params).toEqual([
      PROJECT_ID,
      input.from,
      input.to,
      "day",
      "/checkout",
      10
    ]);
  });

  it("reads incident impact only from correlation links, aggregate ledgers, and generation metadata", async (): Promise<void> => {
    const incidentId = "00000000-0000-4000-8000-000000000701";
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("GROUP BY links.route_key")) {
        return { rows: [{ route_key: "/checkout", affected_sessions: "4" }] };
      }
      if (sqlText.includes("rollup_kind = 'funnel_step_session'")) {
        return { rows: [{ funnel_key: "checkout", affected_sessions: "3" }] };
      }
      if (sqlText.includes("route_rollups.device_type")) {
        return { rows: [{ value: "mobile", affected_sessions: "3" }] };
      }
      if (sqlText.includes("route_rollups.browser_family")) {
        return { rows: [{ value: "Chrome", affected_sessions: "2" }] };
      }
      if (sqlText.includes("rollup_kind = 'transition_session'")) {
        return {
          rows: [{
            from_route_key: "/pricing",
            to_route_key: "/checkout",
            affected_sessions: "2",
            transition_count: "2"
          }]
        };
      }
      if (sqlText.includes("samples.correlation_session_hash = links.subject_hash")) {
        expect(params[7]).toEqual(["transition:/pricing->/checkout"]);
        expect(params[9]).toBe("2026-03-01T00:00:00.000Z");
        expect(params[10]).toBe("2026-03-08T00:00:00.000Z");
        expect(params[11]).toBe(3);
        return {
          rows: [{
            transition_tag: "transition:/pricing->/checkout",
            sample_id: "00000000-0000-4000-8000-000000000703"
          }]
        };
      }
      if (sqlText.includes("analysis_kind = 'incident_impact'")) {
        return {
          rows: [{
            generation_id: "00000000-0000-4000-8000-000000000702",
            status: "pending",
            failure_reason: null
          }]
        };
      }
      if (sqlText.includes("COUNT(DISTINCT links.subject_hash)") && sqlText.includes("analytics_incident_session_links")) {
        return { rows: [{ affected_sessions: "4" }] };
      }
      throw new Error(`Unhandled incident impact SQL: ${sqlText}`);
    });
    const store = createPostgresAnalyticsMetricsStore({ query: queryMock as Queryable["query"] });

    await expect(store.getIncidentImpact({
      project_id: PROJECT_ID,
      incident_id: incidentId,
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-08T00:00:00.000Z",
      granularity: "day",
      service: "web",
      environment: "production",
      limit: 10
    })).resolves.toEqual({
      incident_id: incidentId,
      window: {
        project_id: PROJECT_ID,
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-08T00:00:00.000Z",
        granularity: "day",
        service: "web",
        environment: "production"
      },
      affected_sessions: 4,
      affected_routes: [{ route_key: "/checkout", affected_sessions: 4 }],
      affected_funnels: [{ funnel_key: "checkout", affected_sessions: 3 }],
      top_device_types: [{ value: "mobile", affected_sessions: 3 }],
      top_browsers: [{ value: "Chrome", affected_sessions: 2 }],
      journey_patterns: [{
        from_route_key: "/pricing",
        to_route_key: "/checkout",
        affected_sessions: 2,
        sample_ids: ["00000000-0000-4000-8000-000000000703"]
      }],
      conversion_delta: {
        availability: "unavailable",
        value: null,
        unit: "percentage_points"
      },
      analytics_bundle: {
        status: "pending",
        generation_id: "00000000-0000-4000-8000-000000000702",
        failure_reason: null
      }
    });
  });
});
