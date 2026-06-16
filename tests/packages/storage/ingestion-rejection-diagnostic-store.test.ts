import { describe, expect, it, vi } from "vitest";

import {
  createPostgresIngestionRejectionDiagnosticStore,
  type Queryable
} from "../../../packages/storage/src/index.js";

function rowsResult<Row extends Record<string, unknown>>(rows: Row[]): { rows: Row[] } {
  return { rows };
}

function createTransactionalDb(query: Queryable["query"]): Queryable {
  return {
    query,
    transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) =>
      callback({ query } as Queryable)
  };
}

describe("postgres ingestion rejection diagnostic store", () => {
  it("records aggregated rejection diagnostics once per grouped signature", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, _params?: unknown[]) => {
      if (sqlText.includes("FROM account_analytics_accounts")) {
        return rowsResult([{ analytics_account_id: "analytics_123" }]);
      }
      if (sqlText.includes("INSERT INTO ingestion_rejection_diagnostic_periods")) {
        return rowsResult([]);
      }

      throw new Error(`Unhandled SQL in recordRejectedDiagnostics: ${sqlText}`);
    });

    const store = createPostgresIngestionRejectionDiagnosticStore({
      db: createTransactionalDb(queryMock as Queryable["query"])
    });

    await store.recordRejectedDiagnostics({
      organization_id: "11111111-1111-4111-8111-111111111111",
      occurred_at: "2026-06-16T08:00:00.000Z",
      events: [
        {
          rejection_reason: "invalid_event",
          project_id: "22222222-2222-4222-8222-222222222222",
          sdk_name: "@debugbundle/sdk-browser",
          sdk_version: "0.1.0",
          event_type: "frontend_exception",
          service_name: "tasktime-web",
          service_environment: "production",
          service_runtime: "browser",
          validation_code: "invalid_type",
          validation_path: "payload.stack"
        },
        {
          rejection_reason: "invalid_event",
          project_id: "22222222-2222-4222-8222-222222222222",
          sdk_name: "@debugbundle/sdk-browser",
          sdk_version: "0.1.0",
          event_type: "frontend_exception",
          service_name: "tasktime-web",
          service_environment: "production",
          service_runtime: "browser",
          validation_code: "invalid_type",
          validation_path: "payload.stack"
        }
      ]
    });

    const insertCalls = queryMock.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO ingestion_rejection_diagnostic_periods")
    );

    expect(insertCalls).toHaveLength(1);
    const insertParams = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO ingestion_rejection_diagnostic_periods")
    )?.[1];
    expect(insertParams).toEqual([
      "analytics_123",
      "2026-06-16T00:00:00.000Z",
      "invalid_event",
      "22222222-2222-4222-8222-222222222222",
      "tasktime-web",
      "production",
      "browser",
      "@debugbundle/sdk-browser",
      "0.1.0",
      "frontend_exception",
      "invalid_type",
      "payload.stack",
      2,
      "2026-06-16T08:00:00.000Z",
      "2026-06-16T08:00:00.000Z"
    ]);
  });

  it("returns the malformed rejection breakdown for the current month", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, _params?: unknown[]) => {
      if (sqlText.includes("COALESCE(SUM(occurrences), 0)::text AS total")) {
        return rowsResult([{ total: "100862" }]);
      }
      if (sqlText.includes("LEFT JOIN projects p")) {
        return rowsResult([
          {
            project_id: "22222222-2222-4222-8222-222222222222",
            project_name: "tasktime",
            project_slug: "tasktime",
            service_name: "tasktime-web",
            service_environment: "production",
            service_runtime: "browser",
            sdk_name: "@debugbundle/sdk-browser",
            sdk_version: "0.1.0",
            event_type: "frontend_exception",
            occurrences: "100000",
            last_seen_at: "2026-06-16T08:24:04.562Z"
          }
        ]);
      }
      if (sqlText.includes("GROUP BY sdk_name, sdk_version, event_type, validation_code, validation_path")) {
        return rowsResult([
          {
            sdk_name: "@debugbundle/sdk-browser",
            sdk_version: "0.1.0",
            event_type: "frontend_exception",
            validation_code: "invalid_type",
            validation_path: "payload.stack",
            occurrences: "100000",
            last_seen_at: "2026-06-16T08:24:04.562Z"
          }
        ]);
      }

      throw new Error(`Unhandled SQL in getMalformedRejectionBreakdown: ${sqlText}`);
    });

    const store = createPostgresIngestionRejectionDiagnosticStore({
      db: createTransactionalDb(queryMock as Queryable["query"])
    });

    const breakdown = await store.getMalformedRejectionBreakdown({
      now: "2026-06-16T09:00:00.000Z",
      limit: 10
    });

    expect(breakdown).toEqual({
      generated_at: "2026-06-16T09:00:00.000Z",
      window: {
        starts_at: "2026-06-01T00:00:00.000Z",
        ends_at: "2026-06-16T09:00:00.000Z"
      },
      total_malformed_rejections_this_month: 100862,
      top_sources: [
        {
          project_id: "22222222-2222-4222-8222-222222222222",
          project_name: "tasktime",
          project_slug: "tasktime",
          service_name: "tasktime-web",
          service_environment: "production",
          service_runtime: "browser",
          sdk_name: "@debugbundle/sdk-browser",
          sdk_version: "0.1.0",
          event_type: "frontend_exception",
          occurrences: 100000,
          last_seen_at: "2026-06-16T08:24:04.562Z"
        }
      ],
      top_validation_failures: [
        {
          sdk_name: "@debugbundle/sdk-browser",
          sdk_version: "0.1.0",
          event_type: "frontend_exception",
          validation_code: "invalid_type",
          validation_path: "payload.stack",
          occurrences: 100000,
          last_seen_at: "2026-06-16T08:24:04.562Z"
        }
      ]
    });
  });
});
