import { describe, expect, it, vi } from "vitest";

import {
  createPostgresAnalyticsRollupStore,
  type Queryable
} from "../../../packages/storage/src/index.js";
import type { AnalyticsEventEnvelope } from "../../../packages/shared-types/src/index.js";

function createPageViewEvent(
  overrides: Partial<AnalyticsEventEnvelope> = {}
): AnalyticsEventEnvelope {
  return {
    schema_version: "2026-07-analytics-01",
    event_id: "550e8400-e29b-41d4-a716-446655440000",
    event_type: "analytics_event",
    occurred_at: "2026-03-10T13:45:27.000Z",
    sdk_name: "@debugbundle/sdk-browser",
    sdk_version: "1.0.0",
    service: {
      name: "web",
      runtime: "browser",
      framework: "react",
      environment: "production"
    },
    correlation: {
      session_id: "sess_123",
      visitor_id_hash: null,
      user_id_hash: null,
      trace_id: null,
      deploy_id: null
    },
    payload: {
      kind: "page_view",
      route: {
        path: "/pricing",
        normalized_path: "/pricing",
        title: "Pricing"
      },
      dimensions: {
        auth_state: "anonymous",
        device_type: "desktop",
        browser_family: "Chrome",
        browser_major: 125,
        os_family: "macOS",
        os_major: 14,
        language: "en",
        locale: "en-US",
        viewport_bucket: "large",
        referrer_domain: "google.com",
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "summer",
        country_code: null,
        region_code: null
      },
      custom_dimensions: {
        account_tier: "team"
      }
    },
    ...overrides
  };
}

function createRouteChangeEvent(
  overrides: Partial<AnalyticsEventEnvelope> = {}
): AnalyticsEventEnvelope {
  return createPageViewEvent({
    event_id: "550e8400-e29b-41d4-a716-446655440001",
    payload: {
      kind: "route_change",
      route: {
        path: "/checkout",
        normalized_path: "/checkout",
        title: "Checkout"
      },
      previous_route: {
        path: "/pricing",
        normalized_path: "/pricing",
        title: "Pricing"
      },
      dimensions: {
        auth_state: "anonymous",
        device_type: "desktop",
        browser_family: "Chrome",
        browser_major: 125,
        os_family: "macOS",
        os_major: 14,
        language: "en",
        locale: "en-US",
        viewport_bucket: "large",
        referrer_domain: "google.com",
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "summer",
        country_code: null,
        region_code: null
      },
      custom_dimensions: {
        account_tier: "team"
      }
    },
    ...overrides
  } as Partial<AnalyticsEventEnvelope>);
}

function createFunnelStepEvent(
  overrides: Partial<AnalyticsEventEnvelope> = {}
): AnalyticsEventEnvelope {
  return createPageViewEvent({
    event_id: "550e8400-e29b-41d4-a716-446655440002",
    payload: {
      kind: "funnel_step",
      signal: {
        funnel_key: "checkout",
        step_key: "payment"
      },
      route: {
        path: "/checkout/payment",
        normalized_path: "/checkout/payment",
        title: "Payment"
      },
      dimensions: {
        auth_state: "anonymous",
        device_type: "desktop",
        browser_family: "Chrome",
        browser_major: 125,
        os_family: "macOS",
        os_major: 14,
        language: "en",
        locale: "en-US",
        viewport_bucket: "large",
        referrer_domain: "google.com",
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "summer",
        country_code: null,
        region_code: null
      },
      custom_dimensions: {
        account_tier: "team"
      }
    },
    ...overrides
  } as Partial<AnalyticsEventEnvelope>);
}

function createTransactionalDb(query: Queryable["query"]): Queryable {
  return {
    query,
    transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) =>
      callback({ query } as Queryable)
  };
}

describe("analytics rollup store", () => {
  it("records accepted analytics events into hourly and daily rollups", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      void params;
      if (sqlText.includes("INSERT INTO analytics_ingestion_ledger")) {
        return { rows: [{ event_id: "550e8400-e29b-41d4-a716-446655440000" }] };
      }
      if (sqlText.includes("INSERT INTO analytics_rollup_uniques")) {
        return { rows: [{ subject_hash: "subject_hash" }] };
      }
      if (
        sqlText.includes("INSERT INTO analytics_session_rollups") ||
        sqlText.includes("INSERT INTO analytics_route_rollups")
      ) {
        return { rows: [] };
      }

      throw new Error(`Unhandled analytics rollup SQL: ${sqlText}`);
    });

    const store = createPostgresAnalyticsRollupStore(
      createTransactionalDb(queryMock as Queryable["query"])
    );

    await expect(
      store.recordAnalyticsEvent({
        project_id: "11111111-1111-4111-8111-111111111111",
        event: createPageViewEvent()
      })
    ).resolves.toEqual({ recorded: true });

    const sqlCalls = queryMock.mock.calls.map(([sql]) => String(sql));
    expect(
      sqlCalls.filter((sql) => sql.includes("INSERT INTO analytics_session_rollups"))
    ).toHaveLength(2);
    expect(
      sqlCalls.filter((sql) => sql.includes("INSERT INTO analytics_route_rollups"))
    ).toHaveLength(2);
    expect(
      queryMock.mock.calls.some(([, params]) => JSON.stringify(params).includes("account_tier"))
    ).toBe(true);
    expect(
      queryMock.mock.calls.some(([, params]) => JSON.stringify(params).includes("google.com"))
    ).toBe(true);
  });

  it("records route-change transitions into hourly and daily rollups", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      void params;
      if (sqlText.includes("INSERT INTO analytics_ingestion_ledger")) {
        return { rows: [{ event_id: "550e8400-e29b-41d4-a716-446655440001" }] };
      }
      if (sqlText.includes("INSERT INTO analytics_rollup_uniques")) {
        return { rows: [{ subject_hash: "subject_hash" }] };
      }
      if (
        sqlText.includes("INSERT INTO analytics_session_rollups") ||
        sqlText.includes("INSERT INTO analytics_route_rollups") ||
        sqlText.includes("INSERT INTO analytics_transition_rollups")
      ) {
        return { rows: [] };
      }
      if (sqlText.includes("FROM analytics_transition_rollups")) {
        return { rows: [] };
      }

      throw new Error(`Unhandled analytics rollup SQL: ${sqlText}`);
    });

    const store = createPostgresAnalyticsRollupStore(
      createTransactionalDb(queryMock as Queryable["query"])
    );

    await expect(
      store.recordAnalyticsEvent({
        project_id: "11111111-1111-4111-8111-111111111111",
        event: createRouteChangeEvent()
      })
    ).resolves.toEqual({ recorded: true });

    const transitionCalls = queryMock.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO analytics_transition_rollups")
    );
    expect(transitionCalls).toHaveLength(2);
    expect(transitionCalls.every(([, params]) => JSON.stringify(params).includes("/pricing"))).toBe(
      true
    );
    expect(
      transitionCalls.every(([, params]) => JSON.stringify(params).includes("/checkout"))
    ).toBe(true);
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes("FROM analytics_transition_rollups")
      )
    ).toBe(true);
  });

  it("does not update rollups when the event is already in the ingestion ledger", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      void params;
      if (sqlText.includes("INSERT INTO analytics_ingestion_ledger")) {
        return { rows: [] };
      }

      throw new Error(`Duplicate events should not touch rollups: ${sqlText}`);
    });

    const store = createPostgresAnalyticsRollupStore(
      createTransactionalDb(queryMock as Queryable["query"])
    );

    await expect(
      store.recordAnalyticsEvent({
        project_id: "11111111-1111-4111-8111-111111111111",
        event: createPageViewEvent()
      })
    ).resolves.toEqual({ recorded: false });

    expect(queryMock).toHaveBeenCalledOnce();
  });

  it("evaluates funnel-dropoff opportunities after recording funnel rollups", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      void params;
      if (sqlText.includes("INSERT INTO analytics_ingestion_ledger")) {
        return { rows: [{ event_id: "550e8400-e29b-41d4-a716-446655440002" }] };
      }
      if (sqlText.includes("INSERT INTO analytics_rollup_uniques")) {
        return { rows: [{ subject_hash: "subject_hash" }] };
      }
      if (
        sqlText.includes("INSERT INTO analytics_session_rollups") ||
        sqlText.includes("INSERT INTO analytics_route_rollups") ||
        sqlText.includes("INSERT INTO analytics_funnel_rollups")
      ) {
        return { rows: [] };
      }
      if (sqlText.includes("FROM analytics_funnel_rollups")) {
        return {
          rows: [
            {
              service: "web",
              environment: "production",
              funnel_key: "checkout",
              step_key: "payment",
              step_order: 0,
              sessions_entered: "100",
              sessions_completed: "40",
              dropoffs: "60"
            }
          ]
        };
      }
      if (sqlText.includes("INSERT INTO analytics_opportunities")) {
        return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
      }

      throw new Error(`Unhandled analytics rollup SQL: ${sqlText}`);
    });

    const store = createPostgresAnalyticsRollupStore(
      createTransactionalDb(queryMock as Queryable["query"])
    );

    await expect(
      store.recordAnalyticsEvent({
        project_id: "11111111-1111-4111-8111-111111111111",
        event: createFunnelStepEvent()
      })
    ).resolves.toEqual({ recorded: true });

    expect(
      queryMock.mock.calls.filter(([sql]) =>
        String(sql).includes("INSERT INTO analytics_funnel_rollups")
      )
    ).toHaveLength(2);
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO analytics_opportunities")
      )
    ).toBe(true);
  });

  it("evaluates journey-friction opportunities after recording route-change transition rollups", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      void params;
      if (sqlText.includes("INSERT INTO analytics_ingestion_ledger")) {
        return { rows: [{ event_id: "550e8400-e29b-41d4-a716-446655440001" }] };
      }
      if (sqlText.includes("INSERT INTO analytics_rollup_uniques")) {
        return { rows: [{ subject_hash: "subject_hash" }] };
      }
      if (
        sqlText.includes("INSERT INTO analytics_session_rollups") ||
        sqlText.includes("INSERT INTO analytics_route_rollups") ||
        sqlText.includes("INSERT INTO analytics_transition_rollups")
      ) {
        return { rows: [] };
      }
      if (sqlText.includes("FROM analytics_transition_rollups")) {
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
        expect(params[4]).toBe("journey_friction");
        return { rows: [{ id: "44444444-4444-4444-8444-444444444444" }] };
      }

      throw new Error(`Unhandled analytics rollup SQL: ${sqlText}`);
    });

    const store = createPostgresAnalyticsRollupStore(
      createTransactionalDb(queryMock as Queryable["query"])
    );

    await expect(
      store.recordAnalyticsEvent({
        project_id: "11111111-1111-4111-8111-111111111111",
        event: createRouteChangeEvent()
      })
    ).resolves.toEqual({ recorded: true });

    expect(
      queryMock.mock.calls.filter(([sql]) =>
        String(sql).includes("INSERT INTO analytics_transition_rollups")
      )
    ).toHaveLength(2);
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes("FROM analytics_transition_rollups")
      )
    ).toBe(true);
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO analytics_opportunities")
      )
    ).toBe(true);
  });
});
