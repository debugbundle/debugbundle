import { describe, expect, it, vi } from "vitest";

import {
  ACCOUNT_METRIC_KEYS,
  AccountMetricKeySchema,
  createPostgresAccountAnalyticsStore,
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

describe("postgres account analytics store", () => {
  it("exports a Zod validator for the metric catalog", (): void => {
    expect(AccountMetricKeySchema.parse("project_created")).toBe("project_created");
    expect(AccountMetricKeySchema.safeParse("project_name").success).toBe(false);
  });

  it("ensures analytics accounts with a deletion-safe identity anchor", async (): Promise<void> => {
    const queryMock = vi.fn().mockResolvedValue(
      rowsResult([{ analytics_account_id: "analytics_123" }])
    );
    const query = queryMock as Queryable["query"];

    const store = createPostgresAccountAnalyticsStore({
      db: createTransactionalDb(query),
      analyticsHashSecret: "test-analytics-secret"
    });

    const result = await store.ensureAnalyticsAccount({
      organization_id: "org_123",
      organization_created_at: "2026-06-10T00:00:00.000Z",
      plan: "team",
      capacity_units: 2,
      metrics_collection_started_at: "2026-06-10T00:00:00.000Z"
    });

    expect(result).toEqual({ analytics_account_id: "analytics_123" });
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO account_analytics_accounts"),
      expect.arrayContaining(["org_123", "2026-06-10T00:00:00.000Z", "team", 2])
    );
  });

  it("records day, month, year, and lifetime metric periods once per dedupe key", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string) => {
      if (sqlText.includes("FROM account_analytics_accounts")) {
        return rowsResult([{ analytics_account_id: "analytics_123" }]);
      }
      if (sqlText.includes("INSERT INTO account_metric_events")) {
        return rowsResult([{ dedupe_key_hash: "hash_123" }]);
      }
      if (sqlText.includes("INSERT INTO account_metric_periods")) {
        return rowsResult([]);
      }

      throw new Error(`Unhandled SQL in recordMetricDeltas: ${sqlText}`);
    });
    const query = queryMock as Queryable["query"];

    const store = createPostgresAccountAnalyticsStore({
      db: createTransactionalDb(query),
      analyticsHashSecret: "test-analytics-secret"
    });

    const result = await store.recordMetricDeltas({
      organization_id: "org_123",
      occurred_at: "2026-06-10T14:15:16.000Z",
      source: "project_created",
      dedupe_key: "project_created:proj_123",
      deltas: {
        project_created: 1
      }
    });

    expect(result).toBe("recorded");
    const periodCalls = queryMock.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO account_metric_periods")
    );
    expect(periodCalls).toHaveLength(4);
  });

  it("starts completeness at the analytics launch cutover for existing organizations", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string) => {
      if (sqlText.includes("FROM account_analytics_accounts")) {
        return rowsResult([]);
      }
      if (sqlText.includes("FROM organizations")) {
        return rowsResult([
          {
            organization_id: "org_123",
            created_at: "2026-01-01T00:00:00.000Z",
            plan: "team",
            additional_capacity_units: 2
          }
        ]);
      }
      if (sqlText.includes("INSERT INTO account_analytics_accounts")) {
        return rowsResult([{ analytics_account_id: "analytics_123" }]);
      }
      if (sqlText.includes("INSERT INTO account_metric_events")) {
        return rowsResult([{ dedupe_key_hash: "hash_123" }]);
      }
      if (sqlText.includes("INSERT INTO account_metric_periods")) {
        return rowsResult([]);
      }

      throw new Error(`Unhandled SQL in metrics collection cutover test: ${sqlText}`);
    });

    const store = createPostgresAccountAnalyticsStore({
      db: createTransactionalDb(queryMock as Queryable["query"]),
      analyticsHashSecret: "test-analytics-secret"
    });

    await store.recordMetricDeltas({
      organization_id: "org_123",
      occurred_at: "2026-06-11T14:15:16.000Z",
      source: "project_created",
      dedupe_key: "project_created:proj_123",
      deltas: {
        project_created: 1
      }
    });

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO account_analytics_accounts"),
      expect.arrayContaining([
        "org_123",
        "2026-01-01T00:00:00.000Z",
        "2026-06-10T00:00:00.000Z",
        "team",
        2
      ])
    );
  });

  it("treats duplicate dedupe keys as no-ops", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string) => {
      if (sqlText.includes("FROM account_analytics_accounts")) {
        return rowsResult([{ analytics_account_id: "analytics_123" }]);
      }
      if (sqlText.includes("INSERT INTO account_metric_events")) {
        return rowsResult([]);
      }

      throw new Error(`Unhandled SQL in duplicate recordMetricDeltas: ${sqlText}`);
    });
    const query = queryMock as Queryable["query"];

    const store = createPostgresAccountAnalyticsStore({
      db: createTransactionalDb(query),
      analyticsHashSecret: "test-analytics-secret"
    });

    const result = await store.recordMetricDeltas({
      organization_id: "org_123",
      occurred_at: "2026-06-10T14:15:16.000Z",
      source: "project_deleted",
      dedupe_key: "project_deleted:proj_123",
      deltas: {
        project_deleted: 1
      }
    });

    expect(result).toBe("duplicate");
    expect(
      queryMock.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO account_metric_periods"))
    ).toBe(false);
  });

  it("rejects invalid or negative metric deltas", async (): Promise<void> => {
    const store = createPostgresAccountAnalyticsStore({
      db: createTransactionalDb(vi.fn() as Queryable["query"]),
      analyticsHashSecret: "test-analytics-secret"
    });

    await expect(
      store.recordMetricDeltas({
        organization_id: "org_123",
        occurred_at: "2026-06-10T14:15:16.000Z",
        source: "bad_metric",
        dedupe_key: "bad_metric:1",
        deltas: {
          bad_metric: 1
        } as unknown as Record<(typeof ACCOUNT_METRIC_KEYS)[number], number>
      })
    ).rejects.toThrow("account_metric_key_invalid");

    await expect(
      store.recordMetricDeltas({
        organization_id: "org_123",
        occurred_at: "2026-06-10T14:15:16.000Z",
        source: "project_deleted",
        dedupe_key: "project_deleted:1",
        deltas: {
          project_deleted: -1
        }
      })
    ).rejects.toThrow("account_metric_delta_invalid");
  });

  it("marks accounts deleted and preserves payment retention records", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string) => {
      if (sqlText.includes("FROM account_analytics_accounts")) {
        return rowsResult([{ analytics_account_id: "analytics_123" }]);
      }
      if (sqlText.includes("UPDATE account_analytics_accounts")) {
        return rowsResult([]);
      }
      if (sqlText.includes("INSERT INTO account_payment_retention_records")) {
        return rowsResult([]);
      }
      if (sqlText.includes("INSERT INTO account_payment_provider_events")) {
        return rowsResult([]);
      }

      throw new Error(`Unhandled SQL in delete preservation: ${sqlText}`);
    });
    const query = queryMock as Queryable["query"];

    const store = createPostgresAccountAnalyticsStore({
      db: createTransactionalDb(query),
      analyticsHashSecret: "test-analytics-secret"
    });

    await store.markAccountDeleted({
      organization_id: "org_123",
      deleted_at: "2026-06-10T15:00:00.000Z"
    });

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE account_analytics_accounts"),
      ["analytics_123", "2026-06-10T15:00:00.000Z"]
    );
  });

  it("returns a zero-filled account metric summary for a period", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string) => {
      if (sqlText.includes("FROM account_analytics_accounts")) {
        return rowsResult([{ analytics_account_id: "analytics_123" }]);
      }
      if (sqlText.includes("FROM account_metric_periods")) {
        return rowsResult([
          { period_starts_at: "2026-06-01T00:00:00.000Z", metric_key: "project_created", metric_value: 4 },
          { period_starts_at: "2026-06-01T00:00:00.000Z", metric_key: "incidents_opened", metric_value: 9 }
        ]);
      }

      throw new Error(`Unhandled SQL in getAccountMetricSummary: ${sqlText}`);
    });

    const store = createPostgresAccountAnalyticsStore({
      db: createTransactionalDb(queryMock as Queryable["query"]),
      analyticsHashSecret: "test-analytics-secret"
    });

    const summary = await store.getAccountMetricSummary({
      organization_id: "org_123",
      period_grain: "month",
      period_starts_at: "2026-06-15T12:00:00.000Z"
    });

    expect(summary).not.toBeNull();
    expect(summary?.project_created).toBe(4);
    expect(summary?.incidents_opened).toBe(9);
    expect(summary?.project_deleted).toBe(0);
    expect(summary?.weekly_reports_sent).toBe(0);
  });

  it("returns zero-filled metrics for each listed account period", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string) => {
      if (sqlText.includes("FROM account_analytics_accounts")) {
        return rowsResult([{ analytics_account_id: "analytics_123" }]);
      }
      if (sqlText.includes("FROM account_metric_periods")) {
        return rowsResult([
          { period_starts_at: "2026-05-01T00:00:00.000Z", metric_key: "project_created", metric_value: 2 },
          { period_starts_at: "2026-05-01T00:00:00.000Z", metric_key: "incidents_opened", metric_value: 5 },
          { period_starts_at: "2026-06-01T00:00:00.000Z", metric_key: "project_deleted", metric_value: 1 }
        ]);
      }

      throw new Error(`Unhandled SQL in listAccountMetricPeriods: ${sqlText}`);
    });

    const store = createPostgresAccountAnalyticsStore({
      db: createTransactionalDb(queryMock as Queryable["query"]),
      analyticsHashSecret: "test-analytics-secret"
    });

    const periods = await store.listAccountMetricPeriods({
      organization_id: "org_123",
      period_grain: "month",
      starts_at: "2026-05-01T00:00:00.000Z",
      ends_at: "2026-07-01T00:00:00.000Z"
    });

    expect(periods).toHaveLength(2);
    expect(periods[0]).toMatchObject({
      period_starts_at: "2026-05-01T00:00:00.000Z"
    });
    expect(periods[0]?.metrics.project_created).toBe(2);
    expect(periods[0]?.metrics.incidents_opened).toBe(5);
    expect(periods[0]?.metrics.project_deleted).toBe(0);
    expect(periods[1]?.metrics.project_deleted).toBe(1);
    expect(periods[1]?.metrics.weekly_reports_sent).toBe(0);
  });

  it("returns a zero-filled aggregate summary for internal analytics queries", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string) => {
      if (sqlText.includes("FROM account_metric_periods amp")) {
        return rowsResult([
          { metric_key: "trial_started", metric_value: 3 },
          { metric_key: "plan_upgraded", metric_value: 1 }
        ]);
      }

      throw new Error(`Unhandled SQL in getAggregateMetricSummary: ${sqlText}`);
    });

    const store = createPostgresAccountAnalyticsStore({
      db: createTransactionalDb(queryMock as Queryable["query"]),
      analyticsHashSecret: "test-analytics-secret"
    });

    const summary = await store.getAggregateMetricSummary({
      period_grain: "year",
      period_starts_at: "2026-06-10T15:00:00.000Z",
      account_deleted: true
    });

    expect(summary.trial_started).toBe(3);
    expect(summary.plan_upgraded).toBe(1);
    expect(summary.plan_downgraded).toBe(0);
    expect(summary.account_deleted).toBe(0);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("AND ($3::boolean IS NULL OR aaa.account_deleted = $3::boolean)"),
      ["year", "2026-01-01T00:00:00.000Z", true]
    );
  });

  it("builds an admin analytics summary with activity KPIs and bounded rates", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string) => {
      if (sqlText.includes("FROM account_metric_periods amp")) {
        return rowsResult([
          { metric_key: "raw_events_accepted", metric_value: 1200 },
          { metric_key: "billable_events_counted", metric_value: 1100 },
          { metric_key: "incident_signal_events_counted", metric_value: 400 },
          { metric_key: "context_signal_events_counted", metric_value: 500 },
          { metric_key: "operational_signal_events_counted", metric_value: 300 },
          { metric_key: "cloud_verification_events_accepted", metric_value: 8 },
          { metric_key: "local_verification_events_accepted", metric_value: 13 },
          { metric_key: "incidents_opened", metric_value: 10 },
          { metric_key: "incidents_resolved", metric_value: 15 },
          { metric_key: "incidents_reopened", metric_value: 2 },
          { metric_key: "incidents_regressed", metric_value: 1 },
          { metric_key: "incident_occurrences", metric_value: 27 },
          { metric_key: "incident_occurrences_high_severity", metric_value: 11 },
          { metric_key: "incident_occurrences_critical_severity", metric_value: 4 },
          { metric_key: "incidents_auto_detected_spiking", metric_value: 3 },
          { metric_key: "failure_bundles_created", metric_value: 9 },
          { metric_key: "failure_bundles_updated", metric_value: 6 },
          { metric_key: "failure_bundle_generations_failed", metric_value: 1 },
          { metric_key: "improvement_bundles_created", metric_value: 5 },
          { metric_key: "improvement_bundle_generations_failed", metric_value: 2 },
          { metric_key: "reproductions_created", metric_value: 7 },
          { metric_key: "reproductions_failed", metric_value: 1 },
          { metric_key: "improvements_opened", metric_value: 6 },
          { metric_key: "improvements_resolved", metric_value: 3 },
          { metric_key: "improvements_snoozed", metric_value: 1 },
          { metric_key: "recurring_incident_improvements_opened", metric_value: 2 },
          { metric_key: "post_deploy_regression_improvements_opened", metric_value: 1 },
          { metric_key: "slow_request_improvements_opened", metric_value: 1 },
          { metric_key: "request_failure_improvements_opened", metric_value: 1 },
          { metric_key: "warning_log_improvements_opened", metric_value: 1 },
          { metric_key: "trial_started", metric_value: 4 },
          { metric_key: "trial_converted", metric_value: 2 },
          { metric_key: "trial_expired", metric_value: 1 },
          { metric_key: "plan_upgraded", metric_value: 3 },
          { metric_key: "plan_downgraded", metric_value: 1 },
          { metric_key: "capacity_units_purchased", metric_value: 12 },
          { metric_key: "capacity_units_reduced", metric_value: 3 },
          { metric_key: "raw_events_rejected", metric_value: 17 },
          { metric_key: "events_rejected_malformed", metric_value: 4 },
          { metric_key: "events_rejected_rate_limited", metric_value: 5 },
          { metric_key: "events_rejected_quota", metric_value: 2 },
          { metric_key: "events_rejected_capture_policy", metric_value: 3 },
          { metric_key: "events_rejected_capture_rule", metric_value: 3 },
          { metric_key: "alert_deliveries_failed", metric_value: 2 },
          { metric_key: "webhook_deliveries_failed", metric_value: 1 },
          { metric_key: "weekly_reports_failed", metric_value: 1 },
          { metric_key: "github_dispatches_failed", metric_value: 2 },
          { metric_key: "webhooks_auto_disabled", metric_value: 1 },
          { metric_key: "operational_emails_sent", metric_value: 8 },
          { metric_key: "allowance_warning_emails_sent", metric_value: 2 },
          { metric_key: "allowance_limit_emails_sent", metric_value: 1 }
        ]);
      }
      if (sqlText.includes("WITH windows (window_key, starts_at, ends_at)")) {
        return rowsResult([
          { window_key: "today", active_accounts: "3" },
          { window_key: "this_week", active_accounts: "7" },
          { window_key: "this_month", active_accounts: "11" }
        ]);
      }
      if (sqlText.includes("COUNT(*) FILTER (WHERE account_deleted = false)")) {
        return rowsResult([
          {
            active_accounts_total: "14",
            deleted_accounts_total: "5",
            new_accounts_today: "1",
            new_accounts_this_week: "4",
            new_accounts_this_month: "6",
            deleted_accounts_this_month: "2",
            collection_started_at: "2026-06-10T00:00:00.000Z"
          }
        ]);
      }

      throw new Error(`Unhandled SQL in getAdminAnalyticsSummary: ${sqlText}`);
    });

    const store = createPostgresAccountAnalyticsStore({
      db: createTransactionalDb(queryMock as Queryable["query"]),
      analyticsHashSecret: "test-analytics-secret"
    });

    const summary = await store.getAdminAnalyticsSummary({
      now: "2026-06-12T15:30:00.000Z"
    });

    expect(summary.generated_at).toBe("2026-06-12T15:30:00.000Z");
    expect(summary.collection_started_at).toBe("2026-06-10T00:00:00.000Z");
    expect(summary.windows.today.starts_at).toBe("2026-06-12T00:00:00.000Z");
    expect(summary.windows.this_week.starts_at).toBe("2026-06-08T00:00:00.000Z");
    expect(summary.windows.this_month.starts_at).toBe("2026-06-01T00:00:00.000Z");
    expect(summary.kpis).toMatchObject({
      active_accounts_today: 3,
      active_accounts_this_week: 7,
      active_accounts_this_month: 11,
      new_accounts_today: 1,
      new_accounts_this_week: 4,
      new_accounts_this_month: 6,
      deleted_accounts_this_month: 2,
      active_accounts_total: 14,
      deleted_accounts_total: 5
    });
    expect(summary.usage.raw_events_accepted_this_month).toBe(1200);
    expect(summary.incidents.resolution_rate_this_month).toBe(1);
    expect(summary.improvements.resolution_rate_this_month).toBe(0.5);
    expect(summary.health.webhook_deliveries_failed_this_month).toBe(1);
    expect(summary).not.toHaveProperty("analytics_account_id");
    expect(summary).not.toHaveProperty("organization_id");
  });

  it("excludes backfill-only rows from active account KPIs and falls back to zero-safe defaults", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string) => {
      if (sqlText.includes("FROM account_metric_periods amp")) {
        return rowsResult([]);
      }
      if (sqlText.includes("WITH windows (window_key, starts_at, ends_at)")) {
        return rowsResult([
          { window_key: "today", active_accounts: "0" },
          { window_key: "this_week", active_accounts: "0" },
          { window_key: "this_month", active_accounts: "0" }
        ]);
      }
      if (sqlText.includes("COUNT(*) FILTER (WHERE account_deleted = false)")) {
        return rowsResult([
          {
            active_accounts_total: "0",
            deleted_accounts_total: "0",
            new_accounts_today: "0",
            new_accounts_this_week: "0",
            new_accounts_this_month: "0",
            deleted_accounts_this_month: "0",
            collection_started_at: null
          }
        ]);
      }

      throw new Error(`Unhandled SQL in backfill-only admin summary test: ${sqlText}`);
    });

    const store = createPostgresAccountAnalyticsStore({
      db: createTransactionalDb(queryMock as Queryable["query"]),
      analyticsHashSecret: "test-analytics-secret"
    });

    const summary = await store.getAdminAnalyticsSummary({
      now: "2026-06-12T15:30:00.000Z"
    });

    expect(summary.collection_started_at).toBe("2026-06-10T00:00:00.000Z");
    expect(summary.kpis.active_accounts_today).toBe(0);
    expect(summary.incidents.resolution_rate_this_month).toBe(0);
    expect(summary.improvements.resolution_rate_this_month).toBe(0);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("ame.metric_source <> 'backfill_retained_rows'"),
      [
        "2026-06-12T00:00:00.000Z",
        "2026-06-08T00:00:00.000Z",
        "2026-06-01T00:00:00.000Z",
        "2026-06-12T15:30:00.000Z"
      ]
    );
  });

  it("backfills retained rows through the same deduplicated metric ledger", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string) => {
      if (sqlText.includes("FROM account_analytics_accounts")) {
        return rowsResult([{ analytics_account_id: "analytics_123" }]);
      }
      if (sqlText.includes("FROM projects p") && sqlText.includes("'project_created'::text")) {
        return rowsResult([
          {
            period_starts_at: "2026-06-10T00:00:00.000Z",
            metric_key: "project_created",
            metric_value: 2
          }
        ]);
      }
      if (sqlText.includes("INSERT INTO account_metric_events")) {
        return rowsResult([{ dedupe_key_hash: "hash_123" }]);
      }
      if (sqlText.includes("INSERT INTO account_metric_periods")) {
        return rowsResult([]);
      }
      if (sqlText.includes("UPDATE account_analytics_accounts")) {
        return rowsResult([]);
      }
      if (
        sqlText.includes("FROM incidents") ||
        sqlText.includes("FROM incident_events") ||
        sqlText.includes("FROM bundle_generations") ||
        sqlText.includes("FROM improvement_opportunities") ||
        sqlText.includes("FROM alert_deliveries") ||
        sqlText.includes("FROM alert_email_digests") ||
        sqlText.includes("FROM webhook_deliveries") ||
        sqlText.includes("FROM weekly_report_deliveries") ||
        sqlText.includes("FROM github_dispatch_deliveries") ||
        sqlText.includes("FROM org_usage_counters") ||
        sqlText.includes("FROM probe_activations") ||
        sqlText.includes("FROM capture_rules") ||
        sqlText.includes("FROM github_dispatch_rules")
      ) {
        return rowsResult([]);
      }

      throw new Error(`Unhandled SQL in backfillRetainedRowsForOrganization: ${sqlText}`);
    });

    const store = createPostgresAccountAnalyticsStore({
      db: createTransactionalDb(queryMock as Queryable["query"]),
      analyticsHashSecret: "test-analytics-secret"
    });

    const result = await store.backfillRetainedRowsForOrganization({
      organization_id: "org_123",
      backfilled_at: "2026-06-10T15:00:00.000Z"
    });

    expect(result).toBe("backfilled");
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO account_metric_events"),
      expect.arrayContaining([
        expect.any(String),
        "analytics_123",
        "backfill_retained_rows",
        "2026-06-10T00:00:00.000Z"
      ])
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE account_analytics_accounts"),
      ["analytics_123", "2026-06-10T15:00:00.000Z"]
    );
  });
});
