import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

export type IngestionRejectedDiagnosticReason =
  | "capture_policy_rejected"
  | "capture_rule_dropped"
  | "capture_rule_sampled_out"
  | "invalid_event"
  | "monthly_quota_exceeded"
  | "rate_limited"
  | "remote_probes_disabled";

export interface RejectedIngestionDiagnosticEvent {
  rejection_reason: IngestionRejectedDiagnosticReason;
  project_id: string;
  sdk_name: string | null;
  sdk_version: string | null;
  event_type: string | null;
  service_name: string | null;
  service_environment: string | null;
  service_runtime: string | null;
  validation_code: string | null;
  validation_path: string | null;
}

export interface AdminMalformedRejectionSource {
  project_id: string | null;
  project_name: string | null;
  project_slug: string | null;
  service_name: string | null;
  service_environment: string | null;
  service_runtime: string | null;
  sdk_name: string | null;
  sdk_version: string | null;
  event_type: string | null;
  occurrences: number;
  last_seen_at: string | null;
}

export interface AdminMalformedRejectionFailure {
  sdk_name: string | null;
  sdk_version: string | null;
  event_type: string | null;
  validation_code: string | null;
  validation_path: string | null;
  occurrences: number;
  last_seen_at: string | null;
}

export interface AdminMalformedRejectionBreakdown {
  generated_at: string;
  window: {
    starts_at: string;
    ends_at: string;
  };
  total_malformed_rejections_this_month: number;
  top_sources: AdminMalformedRejectionSource[];
  top_validation_failures: AdminMalformedRejectionFailure[];
}

export interface IngestionRejectionDiagnosticStore {
  withDb(db: Queryable): IngestionRejectionDiagnosticStore;
  recordRejectedDiagnostics(input: {
    organization_id: string;
    occurred_at: string;
    events: RejectedIngestionDiagnosticEvent[];
  }): Promise<void>;
  getMalformedRejectionBreakdown(input: {
    now: string;
    limit: number;
  }): Promise<AdminMalformedRejectionBreakdown>;
}

type AnalyticsAccountRow = {
  analytics_account_id: string;
};

type MalformedSourceRow = {
  project_id: string | null;
  project_name: string | null;
  project_slug: string | null;
  service_name: string | null;
  service_environment: string | null;
  service_runtime: string | null;
  sdk_name: string | null;
  sdk_version: string | null;
  event_type: string | null;
  occurrences: string | number;
  last_seen_at: string | null;
};

type MalformedFailureRow = {
  sdk_name: string | null;
  sdk_version: string | null;
  event_type: string | null;
  validation_code: string | null;
  validation_path: string | null;
  occurrences: string | number;
  last_seen_at: string | null;
};

function startOfUtcDay(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

function startOfUtcMonth(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function normalizeDiagnosticText(candidate: string | null | undefined, maxLength = 160): string {
  if (typeof candidate !== "string") {
    return "";
  }

  const normalized = candidate.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return "";
  }

  return normalized.slice(0, maxLength);
}

function toCount(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

function buildDiagnosticKey(input: {
  period_starts_at: string;
  rejection_reason: IngestionRejectedDiagnosticReason;
  project_id: string;
  service_name: string;
  service_environment: string;
  service_runtime: string;
  sdk_name: string;
  sdk_version: string;
  event_type: string;
  validation_code: string;
  validation_path: string;
}): string {
  return [
    input.period_starts_at,
    input.rejection_reason,
    input.project_id,
    input.service_name,
    input.service_environment,
    input.service_runtime,
    input.sdk_name,
    input.sdk_version,
    input.event_type,
    input.validation_code,
    input.validation_path
  ].join(":");
}

export function createPostgresIngestionRejectionDiagnosticStore(input: {
  db: Queryable;
}): IngestionRejectionDiagnosticStore {
  function buildStore(boundDb: Queryable, manageTransactions: boolean): IngestionRejectionDiagnosticStore {
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

      async recordRejectedDiagnostics(inputValue): Promise<void> {
        if (inputValue.events.length === 0) {
          return;
        }

        await inStoreTransaction(async (tx) => {
          const analyticsAccountResult = await tx.query<AnalyticsAccountRow>(
            `
              SELECT analytics_account_id::text AS analytics_account_id
              FROM account_analytics_accounts
              WHERE organization_id = $1::uuid
              LIMIT 1
            `,
            [inputValue.organization_id]
          );

          const analyticsAccountId = analyticsAccountResult.rows[0]?.analytics_account_id;
          if (analyticsAccountId === undefined) {
            return;
          }

          const grouped = new Map<
            string,
            {
              period_starts_at: string;
              rejection_reason: IngestionRejectedDiagnosticReason;
              project_id_text: string;
              service_name: string;
              service_environment: string;
              service_runtime: string;
              sdk_name: string;
              sdk_version: string;
              event_type: string;
              validation_code: string;
              validation_path: string;
              occurrences: number;
              first_seen_at: string;
              last_seen_at: string;
            }
          >();

          for (const event of inputValue.events) {
            const occurredAt = new Date(inputValue.occurred_at);
            const periodStartsAt = startOfUtcDay(occurredAt);
            const projectIdText = normalizeDiagnosticText(event.project_id, 64);
            const serviceName = normalizeDiagnosticText(event.service_name, 120);
            const serviceEnvironment = normalizeDiagnosticText(event.service_environment, 80);
            const serviceRuntime = normalizeDiagnosticText(event.service_runtime, 80);
            const sdkName = normalizeDiagnosticText(event.sdk_name, 120);
            const sdkVersion = normalizeDiagnosticText(event.sdk_version, 64);
            const eventType = normalizeDiagnosticText(event.event_type, 80);
            const validationCode = normalizeDiagnosticText(event.validation_code, 80);
            const validationPath = normalizeDiagnosticText(event.validation_path, 160);
            const key = buildDiagnosticKey({
              period_starts_at: periodStartsAt,
              rejection_reason: event.rejection_reason,
              project_id: projectIdText,
              service_name: serviceName,
              service_environment: serviceEnvironment,
              service_runtime: serviceRuntime,
              sdk_name: sdkName,
              sdk_version: sdkVersion,
              event_type: eventType,
              validation_code: validationCode,
              validation_path: validationPath
            });

            const existing = grouped.get(key);
            if (existing === undefined) {
              grouped.set(key, {
                period_starts_at: periodStartsAt,
                rejection_reason: event.rejection_reason,
                project_id_text: projectIdText,
                service_name: serviceName,
                service_environment: serviceEnvironment,
                service_runtime: serviceRuntime,
                sdk_name: sdkName,
                sdk_version: sdkVersion,
                event_type: eventType,
                validation_code: validationCode,
                validation_path: validationPath,
                occurrences: 1,
                first_seen_at: inputValue.occurred_at,
                last_seen_at: inputValue.occurred_at
              });
              continue;
            }

            existing.occurrences += 1;
            if (inputValue.occurred_at < existing.first_seen_at) {
              existing.first_seen_at = inputValue.occurred_at;
            }
            if (inputValue.occurred_at > existing.last_seen_at) {
              existing.last_seen_at = inputValue.occurred_at;
            }
          }

          for (const entry of grouped.values()) {
            await tx.query(
              `
                INSERT INTO ingestion_rejection_diagnostic_periods (
                  analytics_account_id,
                  period_starts_at,
                  rejection_reason,
                  project_id_text,
                  service_name,
                  service_environment,
                  service_runtime,
                  sdk_name,
                  sdk_version,
                  event_type,
                  validation_code,
                  validation_path,
                  occurrences,
                  first_seen_at,
                  last_seen_at,
                  updated_at
                )
                VALUES (
                  $1::uuid,
                  $2::timestamptz,
                  $3,
                  $4,
                  $5,
                  $6,
                  $7,
                  $8,
                  $9,
                  $10,
                  $11,
                  $12,
                  $13::bigint,
                  $14::timestamptz,
                  $15::timestamptz,
                  now()
                )
                ON CONFLICT (
                  analytics_account_id,
                  period_starts_at,
                  rejection_reason,
                  project_id_text,
                  service_name,
                  service_environment,
                  service_runtime,
                  sdk_name,
                  sdk_version,
                  event_type,
                  validation_code,
                  validation_path
                )
                DO UPDATE SET
                  occurrences = ingestion_rejection_diagnostic_periods.occurrences + EXCLUDED.occurrences,
                  first_seen_at = LEAST(
                    ingestion_rejection_diagnostic_periods.first_seen_at,
                    EXCLUDED.first_seen_at
                  ),
                  last_seen_at = GREATEST(
                    ingestion_rejection_diagnostic_periods.last_seen_at,
                    EXCLUDED.last_seen_at
                  ),
                  updated_at = now()
              `,
              [
                analyticsAccountId,
                entry.period_starts_at,
                entry.rejection_reason,
                entry.project_id_text,
                entry.service_name,
                entry.service_environment,
                entry.service_runtime,
                entry.sdk_name,
                entry.sdk_version,
                entry.event_type,
                entry.validation_code,
                entry.validation_path,
                entry.occurrences,
                entry.first_seen_at,
                entry.last_seen_at
              ]
            );
          }
        });
      },

      async getMalformedRejectionBreakdown(inputValue): Promise<AdminMalformedRejectionBreakdown> {
        return inStoreTransaction(async (tx) => {
          const now = new Date(inputValue.now);
          const generatedAt = now.toISOString();
          const windowStartsAt = startOfUtcMonth(now);
          const windowEndsAt = generatedAt;
          const limit = Math.max(1, Math.min(inputValue.limit, 25));

          const totalResult = await tx.query<{ total: string | number }>(
            `
              SELECT COALESCE(SUM(occurrences), 0)::text AS total
              FROM ingestion_rejection_diagnostic_periods
              WHERE rejection_reason = 'invalid_event'
                AND period_starts_at >= $1::timestamptz
                AND period_starts_at < $2::timestamptz
            `,
            [windowStartsAt, windowEndsAt]
          );

          const topSourcesResult = await tx.query<MalformedSourceRow>(
            `
              SELECT
                NULLIF(di.project_id_text, '') AS project_id,
                p.name AS project_name,
                p.slug AS project_slug,
                NULLIF(di.service_name, '') AS service_name,
                NULLIF(di.service_environment, '') AS service_environment,
                NULLIF(di.service_runtime, '') AS service_runtime,
                NULLIF(di.sdk_name, '') AS sdk_name,
                NULLIF(di.sdk_version, '') AS sdk_version,
                NULLIF(di.event_type, '') AS event_type,
                SUM(di.occurrences)::text AS occurrences,
                MAX(di.last_seen_at)::text AS last_seen_at
              FROM ingestion_rejection_diagnostic_periods di
              LEFT JOIN projects p
                ON p.id::text = NULLIF(di.project_id_text, '')
              WHERE di.rejection_reason = 'invalid_event'
                AND di.period_starts_at >= $1::timestamptz
                AND di.period_starts_at < $2::timestamptz
              GROUP BY
                di.project_id_text,
                p.name,
                p.slug,
                di.service_name,
                di.service_environment,
                di.service_runtime,
                di.sdk_name,
                di.sdk_version,
                di.event_type
              ORDER BY SUM(di.occurrences) DESC, MAX(di.last_seen_at) DESC
              LIMIT $3
            `,
            [windowStartsAt, windowEndsAt, limit]
          );

          const topFailuresResult = await tx.query<MalformedFailureRow>(
            `
              SELECT
                NULLIF(sdk_name, '') AS sdk_name,
                NULLIF(sdk_version, '') AS sdk_version,
                NULLIF(event_type, '') AS event_type,
                NULLIF(validation_code, '') AS validation_code,
                NULLIF(validation_path, '') AS validation_path,
                SUM(occurrences)::text AS occurrences,
                MAX(last_seen_at)::text AS last_seen_at
              FROM ingestion_rejection_diagnostic_periods
              WHERE rejection_reason = 'invalid_event'
                AND period_starts_at >= $1::timestamptz
                AND period_starts_at < $2::timestamptz
              GROUP BY sdk_name, sdk_version, event_type, validation_code, validation_path
              ORDER BY SUM(occurrences) DESC, MAX(last_seen_at) DESC
              LIMIT $3
            `,
            [windowStartsAt, windowEndsAt, limit]
          );

          return {
            generated_at: generatedAt,
            window: {
              starts_at: windowStartsAt,
              ends_at: windowEndsAt
            },
            total_malformed_rejections_this_month: toCount(totalResult.rows[0]?.total ?? 0),
            top_sources: topSourcesResult.rows.map((row) => ({
              project_id: row.project_id,
              project_name: row.project_name,
              project_slug: row.project_slug,
              service_name: row.service_name,
              service_environment: row.service_environment,
              service_runtime: row.service_runtime,
              sdk_name: row.sdk_name,
              sdk_version: row.sdk_version,
              event_type: row.event_type,
              occurrences: toCount(row.occurrences),
              last_seen_at: row.last_seen_at
            })),
            top_validation_failures: topFailuresResult.rows.map((row) => ({
              sdk_name: row.sdk_name,
              sdk_version: row.sdk_version,
              event_type: row.event_type,
              validation_code: row.validation_code,
              validation_path: row.validation_path,
              occurrences: toCount(row.occurrences),
              last_seen_at: row.last_seen_at
            }))
          };
        });
      }
    };
  }

  return buildStore(input.db, true);
}
