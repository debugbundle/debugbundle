import { createHmac, randomUUID } from "node:crypto";

import { z } from "zod";

import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

export const ACCOUNT_METRIC_KEYS = [
  "account_created",
  "account_deleted",
  "project_created",
  "project_deleted",
  "raw_events_accepted",
  "raw_events_rejected",
  "events_rejected_malformed",
  "events_rejected_rate_limited",
  "events_rejected_quota",
  "events_rejected_capture_policy",
  "events_rejected_capture_rule",
  "billable_events_counted",
  "incident_signal_events_counted",
  "context_signal_events_counted",
  "operational_signal_events_counted",
  "local_verification_events_accepted",
  "cloud_verification_events_accepted",
  "incidents_opened",
  "incidents_resolved",
  "incidents_reopened",
  "incidents_regressed",
  "incident_occurrences",
  "incident_occurrences_high_severity",
  "incident_occurrences_critical_severity",
  "incidents_auto_detected_spiking",
  "failure_bundles_created",
  "failure_bundles_updated",
  "failure_bundle_generations_failed",
  "improvement_bundles_created",
  "improvement_bundles_updated",
  "improvement_bundle_generations_failed",
  "reproductions_created",
  "reproductions_failed",
  "retention_bundle_owners_rotated",
  "improvements_opened",
  "improvements_resolved",
  "improvements_reopened",
  "improvements_snoozed",
  "recurring_incident_improvements_opened",
  "post_deploy_regression_improvements_opened",
  "slow_request_improvements_opened",
  "request_failure_improvements_opened",
  "warning_log_improvements_opened",
  "alert_deliveries_created",
  "alert_deliveries_delivered",
  "alert_deliveries_failed",
  "alert_email_digests_sent",
  "operational_emails_sent",
  "weekly_reports_sent",
  "weekly_reports_failed",
  "webhook_deliveries_created",
  "webhook_deliveries_delivered",
  "webhook_deliveries_failed",
  "webhooks_auto_disabled",
  "github_dispatches_created",
  "github_dispatches_delivered",
  "github_dispatches_failed",
  "github_dispatch_rules_created",
  "github_dispatch_rules_deleted",
  "remote_probe_activations_created",
  "remote_probe_activations_expired",
  "probe_events_accepted",
  "capture_rules_created",
  "capture_rules_deleted",
  "capture_policy_updates",
  "trial_started",
  "trial_converted",
  "trial_expired",
  "plan_upgraded",
  "plan_downgraded",
  "capacity_units_purchased",
  "capacity_units_reduced",
  "allowance_warning_emails_sent",
  "allowance_limit_emails_sent",
  "projects_existing_at_account_deletion",
  "open_incidents_existing_at_account_deletion",
  "open_improvements_existing_at_account_deletion"
] as const;

export type AccountMetricKey = (typeof ACCOUNT_METRIC_KEYS)[number];
export const AccountMetricKeySchema = z.enum(ACCOUNT_METRIC_KEYS);

const LIFETIME_PERIOD_START = "1970-01-01T00:00:00.000Z";
const DEFAULT_METRICS_COLLECTION_STARTED_AT = "2026-06-10T00:00:00.000Z";

type EnsureAnalyticsAccountInput = {
  organization_id: string;
  organization_created_at: string;
  plan: string | null;
  capacity_units: number | null;
  metrics_collection_started_at: string;
};

type BillingSnapshotSeed = {
  analytics_account_id: string;
  organization_id_hash: string;
  plan: string | null;
  billing_state: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_period_starts_at: string | null;
  billing_period_ends_at: string | null;
  additional_capacity_units: number | null;
  last_billing_event_id: string | null;
};

export interface AccountMetricPeriodRecord {
  period_starts_at: string;
  metrics: AccountMetricSummary;
}

export type AccountMetricSummary = Record<AccountMetricKey, number>;

export interface AccountAnalyticsStore {
  withDb(db: Queryable): AccountAnalyticsStore;
  ensureAnalyticsAccount(input: EnsureAnalyticsAccountInput): Promise<{ analytics_account_id: string }>;
  recordMetricDeltas(input: {
    organization_id: string;
    occurred_at: string;
    source: string;
    dedupe_key: string;
    deltas: Partial<Record<AccountMetricKey, number>>;
  }): Promise<"recorded" | "duplicate" | "account_missing">;
  markAccountDeleted(input: {
    organization_id: string;
    deleted_at: string;
  }): Promise<void>;
  preserveBillingRetentionForDeletedOrganization(input: {
    organization_id: string;
    deleted_at: string;
  }): Promise<void>;
  getAccountMetricSummary(input: {
    organization_id: string;
    period_grain: "month" | "year" | "lifetime";
    period_starts_at?: string;
  }): Promise<AccountMetricSummary | null>;
  listAccountMetricPeriods(input: {
    organization_id: string;
    period_grain: "month" | "year";
    starts_at: string;
    ends_at: string;
  }): Promise<AccountMetricPeriodRecord[]>;
  getAggregateMetricSummary(input: {
    period_grain: "month" | "year" | "lifetime";
    period_starts_at?: string;
    account_deleted?: boolean;
  }): Promise<AccountMetricSummary>;
  backfillRetainedRowsForOrganization(input: {
    organization_id: string;
    backfilled_at: string;
  }): Promise<"backfilled" | "account_missing">;
}

function hashWithSecret(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function startOfUtcDay(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

function startOfUtcMonth(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function startOfUtcYear(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1)).toISOString();
}

function maxIsoTimestamp(left: string, right: string): string {
  return new Date(Math.max(new Date(left).getTime(), new Date(right).getTime())).toISOString();
}

function assertValidMetricDeltas(
  deltas: Partial<Record<AccountMetricKey, number>>
): Array<[AccountMetricKey, number]> {
  const entries = Object.entries(deltas);
  const normalized: Array<[AccountMetricKey, number]> = [];

  for (const [metricKey, metricDelta] of entries) {
    if (!AccountMetricKeySchema.safeParse(metricKey).success) {
      throw new Error(`account_metric_key_invalid: ${metricKey}`);
    }
    if (
      typeof metricDelta !== "number" ||
      !Number.isFinite(metricDelta) ||
      !Number.isInteger(metricDelta) ||
      metricDelta < 0
    ) {
      throw new Error(`account_metric_delta_invalid: ${metricKey}`);
    }
    if (metricDelta === 0) {
      continue;
    }
    normalized.push([metricKey as AccountMetricKey, metricDelta]);
  }

  return normalized;
}

function emptyMetricSummary(): AccountMetricSummary {
  return Object.fromEntries(ACCOUNT_METRIC_KEYS.map((metricKey) => [metricKey, 0])) as AccountMetricSummary;
}

function summarizeMetricRows(
  rows: Array<{ metric_key: AccountMetricKey; metric_value: number | string }>
): AccountMetricSummary {
  const summary = emptyMetricSummary();

  for (const row of rows) {
    summary[row.metric_key] = Number(row.metric_value);
  }

  return summary;
}

function normalizeSummaryPeriodStart(
  periodGrain: "month" | "year" | "lifetime",
  periodStartsAt?: string
): string {
  if (periodGrain === "lifetime") {
    return LIFETIME_PERIOD_START;
  }

  const date = periodStartsAt === undefined ? new Date() : new Date(periodStartsAt);
  return periodGrain === "month" ? startOfUtcMonth(date) : startOfUtcYear(date);
}

type AccountMetricRow = {
  period_starts_at: string;
  metric_key: AccountMetricKey;
  metric_value: string;
};

type BackfillMetricRow = {
  period_starts_at: string;
  metric_key: AccountMetricKey;
  metric_value: string;
};

function groupBackfillMetricRows(
  rows: BackfillMetricRow[]
): Array<{ period_starts_at: string; deltas: Partial<Record<AccountMetricKey, number>> }> {
  const grouped = new Map<string, Partial<Record<AccountMetricKey, number>>>();

  for (const row of rows) {
    const deltas = grouped.get(row.period_starts_at) ?? {};
    deltas[row.metric_key] = Number(row.metric_value);
    grouped.set(row.period_starts_at, deltas);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([periodStartsAt, deltas]) => ({
      period_starts_at: periodStartsAt,
      deltas
    }));
}

async function resolveAnalyticsAccount(
  db: Queryable,
  organizationId: string
): Promise<{ analytics_account_id: string } | null> {
  const result = await db.query<{ analytics_account_id: string }>(
    `
      SELECT analytics_account_id::text AS analytics_account_id
      FROM account_analytics_accounts
      WHERE organization_id = $1::uuid
      LIMIT 1
    `,
    [organizationId]
  );

  return result.rows[0] ?? null;
}

async function resolveOrEnsureAnalyticsAccount(
  db: Queryable,
  organizationId: string,
  ensureAnalyticsAccountInTransaction: (
    tx: Queryable,
    seed: EnsureAnalyticsAccountInput
  ) => Promise<{ analytics_account_id: string }>
): Promise<{ analytics_account_id: string } | null> {
  let analyticsAccount = await resolveAnalyticsAccount(db, organizationId);
  if (analyticsAccount !== null) {
    return analyticsAccount;
  }

  const seed = await loadOrganizationAnalyticsSeed(db, organizationId);
  if (seed === null) {
    return null;
  }

  analyticsAccount = await ensureAnalyticsAccountInTransaction(db, seed);
  return analyticsAccount;
}

async function loadOrganizationAnalyticsSeed(
  db: Queryable,
  organizationId: string
): Promise<EnsureAnalyticsAccountInput | null> {
  const result = await db.query<{
    organization_id: string;
    created_at: string;
    plan: string | null;
    additional_capacity_units: number | null;
  }>(
    `
      SELECT
        id::text AS organization_id,
        created_at::text AS created_at,
        COALESCE(plan, 'free') AS plan,
        COALESCE(additional_capacity_units, 0)::int AS additional_capacity_units
      FROM organizations
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [organizationId]
  );

  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }

  return {
    organization_id: row.organization_id,
    organization_created_at: row.created_at,
    plan: row.plan,
    capacity_units: row.additional_capacity_units,
    metrics_collection_started_at: maxIsoTimestamp(row.created_at, DEFAULT_METRICS_COLLECTION_STARTED_AT)
  };
}

async function loadBillingSnapshotSeed(
  db: Queryable,
  organizationId: string,
  organizationIdHash: string
): Promise<BillingSnapshotSeed | null> {
  const result = await db.query<BillingSnapshotSeed>(
    `
      SELECT
        aaa.analytics_account_id::text AS analytics_account_id,
        aaa.organization_id_hash,
        COALESCE(o.plan, 'free') AS plan,
        o.billing_state,
        o.stripe_customer_id,
        o.stripe_subscription_id,
        o.billing_period_starts_at::text AS billing_period_starts_at,
        o.billing_period_ends_at::text AS billing_period_ends_at,
        COALESCE(o.additional_capacity_units, 0)::int AS additional_capacity_units,
        o.last_billing_event_id
      FROM organizations o
      JOIN account_analytics_accounts aaa
        ON aaa.organization_id = o.id
      WHERE o.id = $1::uuid
        AND aaa.organization_id_hash = $2
      LIMIT 1
    `,
    [organizationId, organizationIdHash]
  );

  return result.rows[0] ?? null;
}

export function createPostgresAccountAnalyticsStore(input: {
  db: Queryable;
  analyticsHashSecret: string;
}): AccountAnalyticsStore {
  function buildStore(boundDb: Queryable, manageTransactions: boolean): AccountAnalyticsStore {
    const inStoreTransaction = async <Result>(callback: (tx: Queryable) => Promise<Result>): Promise<Result> => {
      if (!manageTransactions) {
        return callback(boundDb);
      }

      return runInTransaction(boundDb, callback);
    };

    return {
      withDb(db) {
        return buildStore(db, false);
      },

      async ensureAnalyticsAccount(seed): Promise<{ analytics_account_id: string }> {
        return inStoreTransaction(async (tx) => ensureAnalyticsAccountInTransaction(tx, seed));
      },

      async recordMetricDeltas(metricInput): Promise<"recorded" | "duplicate" | "account_missing"> {
        const deltaEntries = assertValidMetricDeltas(metricInput.deltas);
        if (deltaEntries.length === 0) {
          return "duplicate";
        }

        return inStoreTransaction(async (tx) => {
          let analyticsAccount = await resolveAnalyticsAccount(tx, metricInput.organization_id);
          if (analyticsAccount === null) {
            const seed = await loadOrganizationAnalyticsSeed(tx, metricInput.organization_id);
            if (seed === null) {
              return "account_missing";
            }
            analyticsAccount = await ensureAnalyticsAccountInTransaction(tx, seed);
          }

          const dedupeKeyHash = hashWithSecret(analyticsHashSecret, metricInput.dedupe_key);
          const metricDeltaJson = JSON.stringify(Object.fromEntries(deltaEntries));
          const insertedDedupe = await tx.query<{ dedupe_key_hash: string }>(
            `
              INSERT INTO account_metric_events (
                dedupe_key_hash,
                analytics_account_id,
                metric_source,
                occurred_at,
                recorded_at,
                metric_deltas
              )
              VALUES (
                $1,
                $2::uuid,
                $3,
                $4::timestamptz,
                now(),
                $5::jsonb
              )
              ON CONFLICT (dedupe_key_hash) DO NOTHING
              RETURNING dedupe_key_hash
            `,
            [
              dedupeKeyHash,
              analyticsAccount.analytics_account_id,
              metricInput.source,
              metricInput.occurred_at,
              metricDeltaJson
            ]
          );

          if (insertedDedupe.rows[0] === undefined) {
            return "duplicate";
          }

          const occurredAt = new Date(metricInput.occurred_at);
          const periodStarts = [
            { period_grain: "day", period_starts_at: startOfUtcDay(occurredAt) },
            { period_grain: "month", period_starts_at: startOfUtcMonth(occurredAt) },
            { period_grain: "year", period_starts_at: startOfUtcYear(occurredAt) },
            { period_grain: "lifetime", period_starts_at: LIFETIME_PERIOD_START }
          ] as const;

          for (const [metricKey, metricValue] of deltaEntries) {
            for (const period of periodStarts) {
              await tx.query(
                `
                  INSERT INTO account_metric_periods (
                    analytics_account_id,
                    period_grain,
                    period_starts_at,
                    metric_key,
                    metric_value,
                    updated_at
                  )
                  VALUES (
                    $1::uuid,
                    $2,
                    $3::timestamptz,
                    $4,
                    $5::bigint,
                    now()
                  )
                  ON CONFLICT (analytics_account_id, period_grain, period_starts_at, metric_key)
                  DO UPDATE SET
                    metric_value = account_metric_periods.metric_value + EXCLUDED.metric_value,
                    updated_at = now()
                `,
                [
                  analyticsAccount.analytics_account_id,
                  period.period_grain,
                  period.period_starts_at,
                  metricKey,
                  metricValue
                ]
              );
            }
          }

          return "recorded";
        });
      },

      async markAccountDeleted(inputValue): Promise<void> {
        await inStoreTransaction(async (tx) => {
          let analyticsAccount = await resolveAnalyticsAccount(tx, inputValue.organization_id);
          if (analyticsAccount === null) {
            const seed = await loadOrganizationAnalyticsSeed(tx, inputValue.organization_id);
            if (seed === null) {
              return;
            }
            analyticsAccount = await ensureAnalyticsAccountInTransaction(tx, seed);
          }

          await tx.query(
            `
              UPDATE account_analytics_accounts
              SET
                deleted_at = $2::timestamptz,
                account_deleted = true,
                organization_id = NULL,
                updated_at = now()
              WHERE analytics_account_id = $1::uuid
            `,
            [analyticsAccount.analytics_account_id, inputValue.deleted_at]
          );
        });
      },

      async preserveBillingRetentionForDeletedOrganization(inputValue): Promise<void> {
        await inStoreTransaction(async (tx) => {
          const seed = await loadOrganizationAnalyticsSeed(tx, inputValue.organization_id);
          if (seed === null) {
            return;
          }

          const analyticsAccount = await ensureAnalyticsAccountInTransaction(tx, seed);
          const organizationIdHash = hashWithSecret(analyticsHashSecret, inputValue.organization_id);
          const billingSnapshot = await loadBillingSnapshotSeed(tx, inputValue.organization_id, organizationIdHash);
          if (billingSnapshot !== null) {
            await tx.query(
              `
                INSERT INTO account_payment_retention_records (
                  id,
                  analytics_account_id,
                  organization_id_hash,
                  provider,
                  plan,
                  billing_state,
                  stripe_customer_id,
                  stripe_subscription_id,
                  billing_period_starts_at,
                  billing_period_ends_at,
                  additional_capacity_units,
                  last_billing_event_id,
                  account_deleted_at,
                  recorded_at,
                  updated_at
                )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  $3,
                  'stripe',
                  $4,
                  $5,
                  $6,
                  $7,
                  $8::timestamptz,
                  $9::timestamptz,
                  $10,
                  $11,
                  $12::timestamptz,
                  now(),
                  now()
                )
                ON CONFLICT (analytics_account_id, provider)
                DO UPDATE SET
                  plan = EXCLUDED.plan,
                  billing_state = EXCLUDED.billing_state,
                  stripe_customer_id = EXCLUDED.stripe_customer_id,
                  stripe_subscription_id = EXCLUDED.stripe_subscription_id,
                  billing_period_starts_at = EXCLUDED.billing_period_starts_at,
                  billing_period_ends_at = EXCLUDED.billing_period_ends_at,
                  additional_capacity_units = EXCLUDED.additional_capacity_units,
                  last_billing_event_id = EXCLUDED.last_billing_event_id,
                  account_deleted_at = EXCLUDED.account_deleted_at,
                  updated_at = now()
              `,
              [
                randomUUID(),
                billingSnapshot.analytics_account_id,
                billingSnapshot.organization_id_hash,
                billingSnapshot.plan,
                billingSnapshot.billing_state,
                billingSnapshot.stripe_customer_id,
                billingSnapshot.stripe_subscription_id,
                billingSnapshot.billing_period_starts_at,
                billingSnapshot.billing_period_ends_at,
                billingSnapshot.additional_capacity_units,
                billingSnapshot.last_billing_event_id,
                inputValue.deleted_at
              ]
            );
          }

          await tx.query(
            `
              INSERT INTO account_payment_provider_events (
                provider_event_key,
                analytics_account_id,
                organization_id_hash,
                provider,
                provider_event_id,
                provider_event_type,
                processed_at,
                account_deleted_at,
                recorded_at
              )
              SELECT
                CONCAT('stripe:', pbe.event_id),
                $2::uuid,
                $3,
                'stripe',
                pbe.event_id,
                pbe.event_type,
                pbe.processed_at,
                $4::timestamptz,
                now()
              FROM processed_billing_events pbe
              WHERE pbe.organization_id = $1::uuid
              ON CONFLICT (provider, provider_event_id) DO NOTHING
            `,
            [
              inputValue.organization_id,
              analyticsAccount.analytics_account_id,
              organizationIdHash,
              inputValue.deleted_at
            ]
          );
        });
      },

      async getAccountMetricSummary(inputValue): Promise<AccountMetricSummary | null> {
        return inStoreTransaction(async (tx) => {
          const analyticsAccount = await resolveOrEnsureAnalyticsAccount(
            tx,
            inputValue.organization_id,
            ensureAnalyticsAccountInTransaction
          );
          if (analyticsAccount === null) {
            return null;
          }

          const periodStartsAt = normalizeSummaryPeriodStart(
            inputValue.period_grain,
            inputValue.period_starts_at
          );
          const result = await tx.query<AccountMetricRow>(
            `
              SELECT
                period_starts_at::text AS period_starts_at,
                metric_key,
                metric_value::text AS metric_value
              FROM account_metric_periods
              WHERE analytics_account_id = $1::uuid
                AND period_grain = $2
                AND period_starts_at = $3::timestamptz
            `,
            [analyticsAccount.analytics_account_id, inputValue.period_grain, periodStartsAt]
          );

          return summarizeMetricRows(result.rows);
        });
      },

      async listAccountMetricPeriods(inputValue): Promise<AccountMetricPeriodRecord[]> {
        return inStoreTransaction(async (tx) => {
          const analyticsAccount = await resolveOrEnsureAnalyticsAccount(
            tx,
            inputValue.organization_id,
            ensureAnalyticsAccountInTransaction
          );
          if (analyticsAccount === null) {
            return [];
          }

          const result = await tx.query<AccountMetricRow>(
            `
              SELECT
                period_starts_at::text AS period_starts_at,
                metric_key,
                metric_value::text AS metric_value
              FROM account_metric_periods
              WHERE analytics_account_id = $1::uuid
                AND period_grain = $2
                AND period_starts_at >= $3::timestamptz
                AND period_starts_at < $4::timestamptz
              ORDER BY period_starts_at ASC, metric_key ASC
            `,
            [
              analyticsAccount.analytics_account_id,
              inputValue.period_grain,
              inputValue.starts_at,
              inputValue.ends_at
            ]
          );

          const periods = new Map<string, Partial<Record<AccountMetricKey, number>>>();
          for (const row of result.rows) {
            const metrics = periods.get(row.period_starts_at) ?? {};
            metrics[row.metric_key] = Number(row.metric_value);
            periods.set(row.period_starts_at, metrics);
          }

          return Array.from(periods.entries()).map(([period_starts_at, metrics]) => ({
            period_starts_at,
            metrics: summarizeMetricRows(
              Object.entries(metrics).map(([metric_key, metric_value]) => ({
                metric_key: metric_key as AccountMetricKey,
                metric_value: Number(metric_value)
              }))
            )
          }));
        });
      },

      async getAggregateMetricSummary(inputValue): Promise<AccountMetricSummary> {
        return inStoreTransaction(async (tx) => {
          const periodStartsAt = normalizeSummaryPeriodStart(
            inputValue.period_grain,
            inputValue.period_starts_at
          );
          const result = await tx.query<{ metric_key: AccountMetricKey; metric_value: number }>(
            `
              SELECT
                amp.metric_key,
                SUM(amp.metric_value)::text AS metric_value
              FROM account_metric_periods amp
              JOIN account_analytics_accounts aaa
                ON aaa.analytics_account_id = amp.analytics_account_id
              WHERE amp.period_grain = $1
                AND amp.period_starts_at = $2::timestamptz
                AND ($3::boolean IS NULL OR aaa.account_deleted = $3::boolean)
              GROUP BY amp.metric_key
            `,
            [inputValue.period_grain, periodStartsAt, inputValue.account_deleted ?? null]
          );

          return summarizeMetricRows(result.rows);
        });
      },

      async backfillRetainedRowsForOrganization(inputValue): Promise<"backfilled" | "account_missing"> {
        return inStoreTransaction(async (tx) => {
          const analyticsAccount = await resolveOrEnsureAnalyticsAccount(
            tx,
            inputValue.organization_id,
            ensureAnalyticsAccountInTransaction
          );
          if (analyticsAccount === null) {
            return "account_missing";
          }

          const backfillStore = buildStore(tx, false);
          const backfillQueries: Array<{ source: string; sql: string; params: unknown[] }> = [
            {
              source: "projects",
              sql: `
                SELECT
                  date_trunc('day', p.created_at)::timestamptz::text AS period_starts_at,
                  'project_created'::text AS metric_key,
                  COUNT(*)::text AS metric_value
                FROM projects p
                WHERE p.organization_id = $1::uuid
                GROUP BY 1
              `,
              params: [inputValue.organization_id]
            },
            {
              source: "incidents",
              sql: `
                SELECT
                  period_starts_at,
                  metric_key,
                  SUM(metric_value)::text AS metric_value
                FROM (
                  SELECT
                    date_trunc('day', i.created_at)::timestamptz::text AS period_starts_at,
                    'incidents_opened'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM incidents i
                  JOIN projects p ON p.id = i.project_id
                  WHERE p.organization_id = $1::uuid
                  GROUP BY 1
                  UNION ALL
                  SELECT
                    date_trunc('day', i.resolved_at)::timestamptz::text AS period_starts_at,
                    'incidents_resolved'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM incidents i
                  JOIN projects p ON p.id = i.project_id
                  WHERE p.organization_id = $1::uuid
                    AND i.resolved_at IS NOT NULL
                  GROUP BY 1
                  UNION ALL
                  SELECT
                    date_trunc('day', i.regressed_at)::timestamptz::text AS period_starts_at,
                    'incidents_regressed'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM incidents i
                  JOIN projects p ON p.id = i.project_id
                  WHERE p.organization_id = $1::uuid
                    AND i.regressed_at IS NOT NULL
                  GROUP BY 1
                  UNION ALL
                  SELECT
                    date_trunc('day', i.spike_detected_at)::timestamptz::text AS period_starts_at,
                    'incidents_auto_detected_spiking'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM incidents i
                  JOIN projects p ON p.id = i.project_id
                  WHERE p.organization_id = $1::uuid
                    AND i.spike_detected_at IS NOT NULL
                  GROUP BY 1
                ) rows
                GROUP BY 1, 2
              `,
              params: [inputValue.organization_id]
            },
            {
              source: "incident_events",
              sql: `
                SELECT
                  period_starts_at,
                  metric_key,
                  SUM(metric_value)::text AS metric_value
                FROM (
                  SELECT
                    date_trunc('day', ie.occurred_at)::timestamptz::text AS period_starts_at,
                    'incident_occurrences'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM incident_events ie
                  JOIN incidents i ON i.id = ie.incident_id
                  JOIN projects p ON p.id = i.project_id
                  WHERE p.organization_id = $1::uuid
                  GROUP BY 1
                  UNION ALL
                  SELECT
                    date_trunc('day', ie.occurred_at)::timestamptz::text AS period_starts_at,
                    'incident_occurrences_high_severity'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM incident_events ie
                  JOIN incidents i ON i.id = ie.incident_id
                  JOIN projects p ON p.id = i.project_id
                  WHERE p.organization_id = $1::uuid
                    AND i.severity = 'high'
                  GROUP BY 1
                  UNION ALL
                  SELECT
                    date_trunc('day', ie.occurred_at)::timestamptz::text AS period_starts_at,
                    'incident_occurrences_critical_severity'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM incident_events ie
                  JOIN incidents i ON i.id = ie.incident_id
                  JOIN projects p ON p.id = i.project_id
                  WHERE p.organization_id = $1::uuid
                    AND i.severity = 'critical'
                  GROUP BY 1
                ) rows
                GROUP BY 1, 2
              `,
              params: [inputValue.organization_id]
            },
            {
              source: "bundle_generations",
              sql: `
                SELECT
                  period_starts_at,
                  metric_key,
                  SUM(metric_value)::text AS metric_value
                FROM (
                  SELECT
                    date_trunc('day', bg.created_at)::timestamptz::text AS period_starts_at,
                    CASE
                      WHEN bg.bundle_type = 'failure' AND bg.generation_number = 1 THEN 'failure_bundles_created'
                      WHEN bg.bundle_type = 'failure' THEN 'failure_bundles_updated'
                      WHEN bg.bundle_type = 'improvement' AND bg.generation_number = 1 THEN 'improvement_bundles_created'
                      ELSE 'improvement_bundles_updated'
                    END::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM bundle_generations bg
                  JOIN projects p ON p.id = bg.project_id
                  WHERE p.organization_id = $1::uuid
                  GROUP BY 1, 2
                ) rows
                GROUP BY 1, 2
              `,
              params: [inputValue.organization_id]
            },
            {
              source: "improvements",
              sql: `
                SELECT
                  period_starts_at,
                  metric_key,
                  SUM(metric_value)::text AS metric_value
                FROM (
                  SELECT
                    date_trunc('day', io.first_detected_at)::timestamptz::text AS period_starts_at,
                    'improvements_opened'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM improvement_opportunities io
                  JOIN projects p ON p.id = io.project_id
                  WHERE p.organization_id = $1::uuid
                  GROUP BY 1
                  UNION ALL
                  SELECT
                    date_trunc('day', io.first_detected_at)::timestamptz::text AS period_starts_at,
                    CASE io.kind
                      WHEN 'warning_hotspot' THEN 'warning_log_improvements_opened'
                      WHEN 'slow_request' THEN 'slow_request_improvements_opened'
                      WHEN 'request_failure_pattern' THEN 'request_failure_improvements_opened'
                      WHEN 'recurring_incident' THEN 'recurring_incident_improvements_opened'
                      ELSE 'post_deploy_regression_improvements_opened'
                    END::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM improvement_opportunities io
                  JOIN projects p ON p.id = io.project_id
                  WHERE p.organization_id = $1::uuid
                  GROUP BY 1, 2
                  UNION ALL
                  SELECT
                    date_trunc('day', io.resolved_at)::timestamptz::text AS period_starts_at,
                    'improvements_resolved'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM improvement_opportunities io
                  JOIN projects p ON p.id = io.project_id
                  WHERE p.organization_id = $1::uuid
                    AND io.resolved_at IS NOT NULL
                  GROUP BY 1
                  UNION ALL
                  SELECT
                    date_trunc('day', io.snoozed_until)::timestamptz::text AS period_starts_at,
                    'improvements_snoozed'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM improvement_opportunities io
                  JOIN projects p ON p.id = io.project_id
                  WHERE p.organization_id = $1::uuid
                    AND io.snoozed_until IS NOT NULL
                  GROUP BY 1
                ) rows
                GROUP BY 1, 2
              `,
              params: [inputValue.organization_id]
            },
            {
              source: "alert_deliveries",
              sql: `
                SELECT
                  period_starts_at,
                  metric_key,
                  SUM(metric_value)::text AS metric_value
                FROM (
                  SELECT
                    date_trunc('day', ad.created_at)::timestamptz::text AS period_starts_at,
                    'alert_deliveries_created'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM alert_deliveries ad
                  JOIN projects p ON p.id = ad.project_id
                  WHERE p.organization_id = $1::uuid
                  GROUP BY 1
                  UNION ALL
                  SELECT
                    date_trunc('day', ad.delivered_at)::timestamptz::text AS period_starts_at,
                    'alert_deliveries_delivered'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM alert_deliveries ad
                  JOIN projects p ON p.id = ad.project_id
                  WHERE p.organization_id = $1::uuid
                    AND ad.delivered_at IS NOT NULL
                  GROUP BY 1
                  UNION ALL
                  SELECT
                    date_trunc('day', ad.updated_at)::timestamptz::text AS period_starts_at,
                    'alert_deliveries_failed'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM alert_deliveries ad
                  JOIN projects p ON p.id = ad.project_id
                  WHERE p.organization_id = $1::uuid
                    AND ad.status = 'failed'
                  GROUP BY 1
                ) rows
                GROUP BY 1, 2
              `,
              params: [inputValue.organization_id]
            },
            {
              source: "alert_email_digests",
              sql: `
                SELECT
                  date_trunc('day', aed.delivered_at)::timestamptz::text AS period_starts_at,
                  'alert_email_digests_sent'::text AS metric_key,
                  COUNT(*)::text AS metric_value
                FROM alert_email_digests aed
                JOIN projects p ON p.id = aed.project_id
                WHERE p.organization_id = $1::uuid
                  AND aed.delivered_at IS NOT NULL
                GROUP BY 1
              `,
              params: [inputValue.organization_id]
            },
            {
              source: "webhook_deliveries",
              sql: `
                SELECT
                  period_starts_at,
                  metric_key,
                  SUM(metric_value)::text AS metric_value
                FROM (
                  SELECT
                    date_trunc('day', wd.created_at)::timestamptz::text AS period_starts_at,
                    'webhook_deliveries_created'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM webhook_deliveries wd
                  JOIN projects p ON p.id = wd.project_id
                  WHERE p.organization_id = $1::uuid
                  GROUP BY 1
                  UNION ALL
                  SELECT
                    date_trunc('day', wd.last_attempted_at)::timestamptz::text AS period_starts_at,
                    'webhook_deliveries_delivered'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM webhook_deliveries wd
                  JOIN projects p ON p.id = wd.project_id
                  WHERE p.organization_id = $1::uuid
                    AND wd.status = 'delivered'
                    AND wd.last_attempted_at IS NOT NULL
                  GROUP BY 1
                  UNION ALL
                  SELECT
                    date_trunc('day', wd.last_attempted_at)::timestamptz::text AS period_starts_at,
                    'webhook_deliveries_failed'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM webhook_deliveries wd
                  JOIN projects p ON p.id = wd.project_id
                  WHERE p.organization_id = $1::uuid
                    AND wd.status = 'failed'
                    AND wd.last_attempted_at IS NOT NULL
                  GROUP BY 1
                ) rows
                GROUP BY 1, 2
              `,
              params: [inputValue.organization_id]
            },
            {
              source: "weekly_report_deliveries",
              sql: `
                SELECT
                  period_starts_at,
                  metric_key,
                  SUM(metric_value)::text AS metric_value
                FROM (
                  SELECT
                    date_trunc('day', wrd.delivered_at)::timestamptz::text AS period_starts_at,
                    'weekly_reports_sent'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM weekly_report_deliveries wrd
                  JOIN projects p ON p.id = wrd.project_id
                  WHERE p.organization_id = $1::uuid
                    AND wrd.delivered_at IS NOT NULL
                  GROUP BY 1
                  UNION ALL
                  SELECT
                    date_trunc('day', wrd.updated_at)::timestamptz::text AS period_starts_at,
                    'weekly_reports_failed'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM weekly_report_deliveries wrd
                  JOIN projects p ON p.id = wrd.project_id
                  WHERE p.organization_id = $1::uuid
                    AND wrd.status = 'failed'
                  GROUP BY 1
                ) rows
                GROUP BY 1, 2
              `,
              params: [inputValue.organization_id]
            },
            {
              source: "github_dispatch_deliveries",
              sql: `
                SELECT
                  period_starts_at,
                  metric_key,
                  SUM(metric_value)::text AS metric_value
                FROM (
                  SELECT
                    date_trunc('day', gdd.created_at)::timestamptz::text AS period_starts_at,
                    'github_dispatches_created'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM github_dispatch_deliveries gdd
                  JOIN projects p ON p.id = gdd.project_id
                  WHERE p.organization_id = $1::uuid
                  GROUP BY 1
                  UNION ALL
                  SELECT
                    date_trunc('day', gdd.last_attempt_at)::timestamptz::text AS period_starts_at,
                    'github_dispatches_delivered'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM github_dispatch_deliveries gdd
                  JOIN projects p ON p.id = gdd.project_id
                  WHERE p.organization_id = $1::uuid
                    AND gdd.status = 'delivered'
                    AND gdd.last_attempt_at IS NOT NULL
                  GROUP BY 1
                  UNION ALL
                  SELECT
                    date_trunc('day', gdd.last_attempt_at)::timestamptz::text AS period_starts_at,
                    'github_dispatches_failed'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM github_dispatch_deliveries gdd
                  JOIN projects p ON p.id = gdd.project_id
                  WHERE p.organization_id = $1::uuid
                    AND gdd.status = 'failed'
                    AND gdd.last_attempt_at IS NOT NULL
                  GROUP BY 1
                ) rows
                GROUP BY 1, 2
              `,
              params: [inputValue.organization_id]
            },
            {
              source: "org_usage_counters",
              sql: `
                SELECT
                  ouc.period_starts_at::text AS period_starts_at,
                  'billable_events_counted'::text AS metric_key,
                  SUM(ouc.raw_ingested_events)::text AS metric_value
                FROM org_usage_counters ouc
                WHERE ouc.organization_id = $1::uuid
                GROUP BY 1
              `,
              params: [inputValue.organization_id]
            },
            {
              source: "probe_activations",
              sql: `
                SELECT
                  period_starts_at,
                  metric_key,
                  SUM(metric_value)::text AS metric_value
                FROM (
                  SELECT
                    date_trunc('day', pa.created_at)::timestamptz::text AS period_starts_at,
                    'remote_probe_activations_created'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM probe_activations pa
                  JOIN projects p ON p.id = pa.project_id
                  WHERE p.organization_id = $1::uuid
                  GROUP BY 1
                  UNION ALL
                  SELECT
                    date_trunc('day', pa.deactivated_at)::timestamptz::text AS period_starts_at,
                    'remote_probe_activations_expired'::text AS metric_key,
                    COUNT(*)::text AS metric_value
                  FROM probe_activations pa
                  JOIN projects p ON p.id = pa.project_id
                  WHERE p.organization_id = $1::uuid
                    AND pa.deactivated_at IS NOT NULL
                  GROUP BY 1
                ) rows
                GROUP BY 1, 2
              `,
              params: [inputValue.organization_id]
            },
            {
              source: "capture_rules",
              sql: `
                SELECT
                  date_trunc('day', cr.created_at)::timestamptz::text AS period_starts_at,
                  'capture_rules_created'::text AS metric_key,
                  COUNT(*)::text AS metric_value
                FROM capture_rules cr
                JOIN projects p ON p.id = cr.project_id
                WHERE p.organization_id = $1::uuid
                GROUP BY 1
              `,
              params: [inputValue.organization_id]
            },
            {
              source: "github_dispatch_rules",
              sql: `
                SELECT
                  date_trunc('day', gdr.created_at)::timestamptz::text AS period_starts_at,
                  'github_dispatch_rules_created'::text AS metric_key,
                  COUNT(*)::text AS metric_value
                FROM github_dispatch_rules gdr
                JOIN projects p ON p.id = gdr.project_id
                WHERE p.organization_id = $1::uuid
                GROUP BY 1
              `,
              params: [inputValue.organization_id]
            }
          ];

          for (const backfillQuery of backfillQueries) {
            const result = await tx.query<BackfillMetricRow>(backfillQuery.sql, backfillQuery.params);
            const groupedRows = groupBackfillMetricRows(result.rows);

            for (const row of groupedRows) {
              await backfillStore.recordMetricDeltas({
                organization_id: inputValue.organization_id,
                occurred_at: row.period_starts_at,
                source: "backfill_retained_rows",
                dedupe_key: `backfill_retained_rows:${backfillQuery.source}:${inputValue.organization_id}:${row.period_starts_at}`,
                deltas: row.deltas
              });
            }
          }

          await tx.query(
            `
              UPDATE account_analytics_accounts
              SET
                backfilled_from_retained_rows_at = $2::timestamptz,
                updated_at = now()
              WHERE analytics_account_id = $1::uuid
            `,
            [analyticsAccount.analytics_account_id, inputValue.backfilled_at]
          );

          return "backfilled";
        });
      }
    };
  }

  const analyticsHashSecret = input.analyticsHashSecret;

  async function ensureAnalyticsAccountInTransaction(
    tx: Queryable,
    seed: EnsureAnalyticsAccountInput
  ): Promise<{ analytics_account_id: string }> {
    const organizationIdHash = hashWithSecret(analyticsHashSecret, seed.organization_id);
    const analyticsAccountId = randomUUID();
    const result = await tx.query<{ analytics_account_id: string }>(
      `
        INSERT INTO account_analytics_accounts (
          analytics_account_id,
          organization_id,
          organization_id_hash,
          created_at,
          first_seen_at,
          metrics_collection_started_at,
          initial_plan,
          latest_known_plan,
          latest_capacity_units,
          account_deleted,
          metrics_schema_version,
          updated_at
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3,
          $4::timestamptz,
          now(),
          $5::timestamptz,
          $6,
          $6,
          $7,
          false,
          1,
          now()
        )
        ON CONFLICT (organization_id_hash)
        DO UPDATE SET
          organization_id = COALESCE(account_analytics_accounts.organization_id, EXCLUDED.organization_id),
          latest_known_plan = COALESCE(EXCLUDED.latest_known_plan, account_analytics_accounts.latest_known_plan),
          latest_capacity_units = COALESCE(EXCLUDED.latest_capacity_units, account_analytics_accounts.latest_capacity_units),
          updated_at = now()
        RETURNING analytics_account_id::text AS analytics_account_id
      `,
      [
        analyticsAccountId,
        seed.organization_id,
        organizationIdHash,
        seed.organization_created_at,
        seed.metrics_collection_started_at,
        seed.plan,
        seed.capacity_units
      ]
    );

    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("account_analytics_account_upsert_failed");
    }

    return row;
  }

  return buildStore(input.db, true);
}
