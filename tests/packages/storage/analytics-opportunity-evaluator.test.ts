import { describe, expect, it, vi } from "vitest";

import {
  createPostgresAnalyticsOpportunityEvaluator,
  evaluateAnalyticsDeployConversionOpportunities,
  evaluateAnalyticsFunnelDropoffOpportunities,
  evaluateAnalyticsIncidentImpactOpportunities,
  evaluateAnalyticsMarkerFrictionOpportunities,
  evaluateAnalyticsJourneyFrictionOpportunities,
  evaluateAnalyticsRouteExitOpportunities,
  resolveStaleAnalyticsOpportunities,
  type Queryable
} from "../../../packages/storage/src/index.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

describe("analytics opportunity evaluator", () => {
  it("creates or updates funnel-dropoff opportunities from aggregate funnel rollups", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("FROM analytics_funnel_rollups")) {
        expect(params).toEqual([
          PROJECT_ID,
          "2026-03-04T00:00:00.000Z",
          "2026-03-11T00:00:00.000Z",
          "web",
          "production",
          20,
          10,
          0.4,
          5
        ]);
        return {
          rows: [
            {
              service: "web",
              environment: "production",
              funnel_key: "checkout",
              step_key: "payment",
              step_order: 2,
              sessions_entered: "100",
              sessions_completed: "35",
              dropoffs: "65"
            }
          ]
        };
      }

      if (sqlText.includes("FROM analytics_transition_rollups")) {
        expect(params).toEqual([
          PROJECT_ID,
          "2026-03-04T00:00:00.000Z",
          "2026-03-11T00:00:00.000Z",
          "web",
          "production",
          20,
          10,
          5,
          5
        ]);
        return { rows: [] };
      }

      if (sqlText.includes("FROM analytics_action_rollups")) {
        expect(params).toEqual([
          PROJECT_ID,
          "2026-03-04T00:00:00.000Z",
          "2026-03-11T00:00:00.000Z",
          "web",
          "production",
          ["marker:friction.repeated_click", "marker:friction.dead_click", "marker:friction.backtrack"],
          20,
          10,
          5
        ]);
        return { rows: [] };
      }

      if (sqlText.includes("FROM analytics_route_rollups")) {
        return { rows: [] };
      }

      if (sqlText.includes("FROM analytics_incident_session_links")) {
        return { rows: [] };
      }

      if (sqlText.includes("WITH deployment_sessions AS")) {
        return { rows: [] };
      }

      if (sqlText.includes("UPDATE analytics_opportunities")) {
        return { rows: [] };
      }

      if (sqlText.includes("INSERT INTO analytics_opportunities")) {
        expect(sqlText).toContain("ON CONFLICT (project_id, fingerprint)");
        expect(params[1]).toBe(PROJECT_ID);
        expect(params[2]).toBe("web");
        expect(params[3]).toBe("production");
        expect(params[4]).toBe("funnel_dropoff");
        expect(params[5]).toBe("high");
        expect(params[7]).toBe(
          "analytics-opportunity.v1:funnel_dropoff:11111111-1111-4111-8111-111111111111:web:production:checkout:payment"
        );
        expect(params[11]).toBe("2026-03-11T00:00:00.000Z");
        expect(JSON.parse(String(params[10]))).toMatchObject({
          funnel_key: "checkout",
          step_key: "payment",
          sessions_entered: 100,
          sessions_completed: 35,
          dropoffs: 65,
          dropoff_rate: 0.65
        });
        return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
      }

      throw new Error(`Unhandled evaluator SQL: ${sqlText}`);
    });

    const evaluator = createPostgresAnalyticsOpportunityEvaluator({
      query: queryMock as Queryable["query"]
    });

    await expect(
      evaluator.evaluateProjectOpportunities({
        project_id: PROJECT_ID,
        occurred_at: "2026-03-10T13:45:27.000Z",
        service: "web",
        environment: "production"
      })
    ).resolves.toEqual({ opportunities_created_or_updated: 1 });

    expect(queryMock).toHaveBeenCalledTimes(8);
  });

  it("creates or updates journey-friction opportunities from aggregate transition loops", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("FROM analytics_transition_rollups")) {
        expect(sqlText).toContain("WITH transitions AS");
        expect(sqlText).toContain("forward.from_route_key < forward.to_route_key");
        expect(params).toEqual([
          PROJECT_ID,
          "2026-03-04T00:00:00.000Z",
          "2026-03-11T00:00:00.000Z",
          "web",
          "production",
          20,
          10,
          5,
          5
        ]);
        return {
          rows: [
            {
              service: "web",
              environment: "production",
              from_route_key: "/checkout",
              to_route_key: "/pricing",
              forward_transition_count: "45",
              reverse_transition_count: "40",
              total_loop_transitions: "85",
              unique_sessions: "31"
            }
          ]
        };
      }

      if (sqlText.includes("INSERT INTO analytics_opportunities")) {
        expect(sqlText).toContain("ON CONFLICT (project_id, fingerprint)");
        expect(params[1]).toBe(PROJECT_ID);
        expect(params[2]).toBe("web");
        expect(params[3]).toBe("production");
        expect(params[4]).toBe("journey_friction");
        expect(params[5]).toBe("high");
        expect(params[7]).toBe(
          "analytics-opportunity.v1:journey_friction:11111111-1111-4111-8111-111111111111:web:production:/checkout:/pricing"
        );
        expect(params[11]).toBe("2026-03-11T00:00:00.000Z");
        expect(JSON.parse(String(params[10]))).toMatchObject({
          from_route_key: "/checkout",
          to_route_key: "/pricing",
          forward_transition_count: 45,
          reverse_transition_count: 40,
          total_loop_transitions: 85,
          unique_sessions: 31
        });
        return { rows: [{ id: "44444444-4444-4444-8444-444444444444" }] };
      }

      throw new Error(`Unhandled evaluator SQL: ${sqlText}`);
    });

    await expect(
      evaluateAnalyticsJourneyFrictionOpportunities(
        { query: queryMock as Queryable["query"] },
        {
          project_id: PROJECT_ID,
          occurred_at: "2026-03-10T13:45:27.000Z",
          service: "web",
          environment: "production"
        }
      )
    ).resolves.toEqual({ opportunities_created_or_updated: 1 });

    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("creates or updates journey-friction opportunities from aggregate browser friction markers", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("FROM analytics_action_rollups")) {
        expect(params).toEqual([
          PROJECT_ID,
          "2026-03-04T00:00:00.000Z",
          "2026-03-11T00:00:00.000Z",
          "web",
          "production",
          ["marker:friction.repeated_click", "marker:friction.dead_click", "marker:friction.backtrack"],
          20,
          10,
          5
        ]);
        return {
          rows: [
            {
              service: "web",
              environment: "production",
              action_key: "marker:friction.dead_click",
              route_key: "/checkout",
              event_count: "45",
              unique_sessions: "22"
            }
          ]
        };
      }

      if (sqlText.includes("INSERT INTO analytics_opportunities")) {
        expect(params[4]).toBe("journey_friction");
        expect(params[5]).toBe("medium");
        expect(params[7]).toBe(
          "analytics-opportunity.v1:journey_friction_marker:11111111-1111-4111-8111-111111111111:web:production:friction.dead_click:/checkout"
        );
        expect(JSON.parse(String(params[10]))).toMatchObject({
          source: "browser_friction_marker",
          marker_key: "friction.dead_click",
          route_key: "/checkout",
          event_count: 45,
          unique_sessions: 22
        });
        return { rows: [{ id: "55555555-5555-4555-8555-555555555555" }] };
      }

      throw new Error(`Unhandled evaluator SQL: ${sqlText}`);
    });

    await expect(
      evaluateAnalyticsMarkerFrictionOpportunities(
        { query: queryMock as Queryable["query"] },
        {
          project_id: PROJECT_ID,
          occurred_at: "2026-03-10T13:45:27.000Z",
          service: "web",
          environment: "production"
        }
      )
    ).resolves.toEqual({ opportunities_created_or_updated: 1 });

    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("does not create opportunities when no aggregate candidate crosses thresholds", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string) => {
      expect(sqlText).toContain("FROM analytics_funnel_rollups");
      return { rows: [] };
    });

    await expect(
      evaluateAnalyticsFunnelDropoffOpportunities(
        { query: queryMock as Queryable["query"] },
        {
          project_id: PROJECT_ID,
          occurred_at: "2026-03-10T13:45:27.000Z"
        }
      )
    ).resolves.toEqual({ opportunities_created_or_updated: 0 });

    expect(queryMock).toHaveBeenCalledOnce();
  });

  it("creates route-health opportunities only for material exit-rate increases", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("FROM analytics_route_rollups")) {
        expect(params).toEqual([
          PROJECT_ID,
          "2026-02-25T00:00:00.000Z",
          "2026-03-04T00:00:00.000Z",
          "2026-03-11T00:00:00.000Z",
          "web",
          "production",
          20,
          10,
          0.4,
          0.15,
          5
        ]);
        return { rows: [{
          service: "web",
          environment: "production",
          route_key: "/checkout",
          current_sessions: "100",
          current_exits: "55",
          baseline_sessions: "100",
          baseline_exits: "25"
        }] };
      }
      expect(sqlText).toContain("INSERT INTO analytics_opportunities");
      expect(params[4]).toBe("route_health");
      expect(params[7]).toContain(":route_exit:");
      expect(JSON.parse(String(params[10]))).toMatchObject({
        route_key: "/checkout",
        current_exit_rate: 0.55,
        baseline_exit_rate: 0.25,
        exit_rate_increase: 0.3
      });
      return { rows: [{ id: "11111111-2222-4333-8444-555555555555" }] };
    });

    await expect(evaluateAnalyticsRouteExitOpportunities(
      { query: queryMock as Queryable["query"] },
      { project_id: PROJECT_ID, occurred_at: "2026-03-10T13:45:27.000Z", service: "web", environment: "production" }
    )).resolves.toEqual({ opportunities_created_or_updated: 1 });
  });

  it("creates incident-impact opportunities with the related incident linkage", async (): Promise<void> => {
    const incidentId = "22222222-2222-4222-8222-222222222222";
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("FROM analytics_incident_session_links")) {
        expect(params.slice(5)).toEqual([10, 0.1, 5]);
        return { rows: [{
          service: "web",
          environment: "production",
          incident_id: incidentId,
          affected_sessions: "25",
          total_sessions: "100",
          affected_routes: "3"
        }] };
      }
      expect(params[4]).toBe("incident_impact");
      expect(params[12]).toEqual([incidentId]);
      expect(params[13]).toEqual([]);
      expect(JSON.parse(String(params[10]))).toMatchObject({ affected_share: 0.25 });
      return { rows: [{ id: "33333333-2222-4333-8444-555555555555" }] };
    });

    await expect(evaluateAnalyticsIncidentImpactOpportunities(
      { query: queryMock as Queryable["query"] },
      { project_id: PROJECT_ID, occurred_at: "2026-03-10T13:45:27.000Z", service: "web", environment: "production" }
    )).resolves.toEqual({ opportunities_created_or_updated: 1 });
  });

  it("creates deploy-comparison opportunities from the latest two deploy conversion rates", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      if (sqlText.includes("WITH deployment_sessions AS")) {
        expect(params.slice(5)).toEqual([20, 0.15, 5]);
        return { rows: [{
          service: "web",
          environment: "production",
          conversion_key: "checkout.completed",
          current_deploy_id: "deploy-2",
          baseline_deploy_id: "deploy-1",
          current_sessions: "100",
          current_conversions: "20",
          baseline_sessions: "100",
          baseline_conversions: "45"
        }] };
      }
      expect(params[4]).toBe("deploy_comparison");
      expect(params[12]).toEqual([]);
      expect(params[13]).toEqual(["deploy-2", "deploy-1"]);
      expect(JSON.parse(String(params[10]))).toMatchObject({
        conversion_key: "checkout.completed",
        deploy_id: "deploy-2",
        conversion_rate_decrease: 0.25
      });
      return { rows: [{ id: "44444444-2222-4333-8444-555555555555" }] };
    });

    await expect(evaluateAnalyticsDeployConversionOpportunities(
      { query: queryMock as Queryable["query"] },
      { project_id: PROJECT_ID, occurred_at: "2026-03-10T13:45:27.000Z", service: "web", environment: "production" }
    )).resolves.toEqual({ opportunities_created_or_updated: 1 });
  });

  it("resolves open opportunities only after they remain absent for a full lookback window", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      expect(sqlText).toContain("last_detected_at < $2::timestamptz");
      expect(sqlText).toContain("status = 'open'");
      expect(params).toEqual([
        PROJECT_ID,
        "2026-03-04T00:00:00.000Z",
        "2026-03-11T00:00:00.000Z",
        "web",
        "production"
      ]);
      return { rows: [] };
    });

    await resolveStaleAnalyticsOpportunities(
      { query: queryMock as Queryable["query"] },
      { project_id: PROJECT_ID, occurred_at: "2026-03-10T13:45:27.000Z", service: "web", environment: "production" }
    );
    expect(queryMock).toHaveBeenCalledOnce();
  });
});
