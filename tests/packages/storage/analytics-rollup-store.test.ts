import { describe, expect, it, vi } from "vitest";

import {
  createPostgresAnalyticsRollupStore,
  type Queryable
} from "../../../packages/storage/src/index.js";
import type { AnalyticsEventEnvelope } from "../../../packages/shared-types/src/index.js";

function createPageViewEvent(overrides: Partial<AnalyticsEventEnvelope> = {}): AnalyticsEventEnvelope {
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
    expect(sqlCalls.filter((sql) => sql.includes("INSERT INTO analytics_session_rollups"))).toHaveLength(2);
    expect(sqlCalls.filter((sql) => sql.includes("INSERT INTO analytics_route_rollups"))).toHaveLength(2);
    expect(queryMock.mock.calls.some(([, params]) => JSON.stringify(params).includes("account_tier"))).toBe(true);
    expect(queryMock.mock.calls.some(([, params]) => JSON.stringify(params).includes("google.com"))).toBe(true);
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
});
