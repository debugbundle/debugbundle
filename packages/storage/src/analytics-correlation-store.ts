import { createHash } from "node:crypto";

import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

export interface AnalyticsIncidentCorrelationInput {
  project_id: string;
  incident_id: string;
  event_id: string;
  service: string;
  environment: string;
  occurred_at: string;
  session_id_hash: string | null;
  trace_id_hash: string | null;
}

export interface AnalyticsRouteSessionCorrelationInput {
  project_id: string;
  service: string;
  environment: string;
  bucket_start: string;
  bucket_granularity: "hour" | "day";
  route_key: string;
  dimension_hash: string;
  subject_hash: string;
  trace_id_hash: string | null;
}

export interface AnalyticsCorrelationStore {
  recordIncidentCorrelation(input: AnalyticsIncidentCorrelationInput): Promise<{
    recorded: boolean;
    linked_sessions: number;
  }>;
  linkAnalyticsRouteSession(input: AnalyticsRouteSessionCorrelationInput): Promise<number>;
}

export function createPostgresAnalyticsCorrelationStore(db: Queryable): AnalyticsCorrelationStore {
  return {
    async recordIncidentCorrelation(input) {
      if (input.session_id_hash === null && input.trace_id_hash === null) {
        return { recorded: false, linked_sessions: 0 };
      }

      return runInTransaction(db, async (tx) => {
        const inserted = await tx.query<{ event_id: string }>(
          `
            WITH correlation_locks AS MATERIALIZED (
              SELECT pg_advisory_xact_lock(hashtextextended(lock_key, 0))
              FROM unnest($9::text[]) AS lock_key
              ORDER BY lock_key
            ),
            lock_barrier AS (
              SELECT COUNT(*) FROM correlation_locks
            )
            INSERT INTO analytics_incident_correlations (
              project_id,
              incident_id,
              event_id,
              service,
              environment,
              occurred_at,
              session_id_hash,
              trace_id_hash
            )
            SELECT $1, $2, $3, $4, $5, $6::timestamptz, $7, $8
            FROM lock_barrier
            ON CONFLICT (incident_id, event_id) DO NOTHING
            RETURNING event_id::text AS event_id
          `,
          [
            input.project_id,
            input.incident_id,
            input.event_id,
            input.service,
            input.environment,
            input.occurred_at,
            input.session_id_hash,
            input.trace_id_hash,
            buildCorrelationLockKeys(input.project_id, input.session_id_hash, input.trace_id_hash)
          ]
        );

        if (inserted.rows.length === 0) {
          return { recorded: false, linked_sessions: 0 };
        }

        const linkedSessions = await linkExistingRouteSessions(tx, input);
        return { recorded: true, linked_sessions: linkedSessions };
      });
    },

    async linkAnalyticsRouteSession(input) {
      const result = await db.query<{ linked_sessions: unknown }>(
        buildRouteSessionLinkSql("route_session"),
        [
          input.project_id,
          input.service,
          input.environment,
          input.bucket_start,
          input.bucket_granularity,
          input.route_key,
          input.dimension_hash,
          input.subject_hash,
          input.trace_id_hash,
          buildCorrelationLockKeys(input.project_id, input.subject_hash, input.trace_id_hash)
        ]
      );

      return toNonNegativeInteger(result.rows[0]?.linked_sessions);
    }
  };
}

export function hashAnalyticsCorrelationValue(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return createHash("sha256").update(value.trim(), "utf8").digest("hex");
}

export function hashAnalyticsSessionSubject(projectId: string, sessionId: string): string {
  return createHash("sha256")
    .update(`{"project_id":${JSON.stringify(projectId)},"session_id":${JSON.stringify(sessionId)}}`, "utf8")
    .digest("hex");
}

async function linkExistingRouteSessions(
  db: Queryable,
  input: AnalyticsIncidentCorrelationInput
): Promise<number> {
  const result = await db.query<{ linked_sessions: unknown }>(
    buildRouteSessionLinkSql("incident"),
    [
      input.project_id,
      input.incident_id,
      input.service,
      input.environment,
      input.occurred_at,
      input.session_id_hash,
      input.trace_id_hash,
      buildCorrelationLockKeys(input.project_id, input.session_id_hash, input.trace_id_hash)
    ]
  );

  return toNonNegativeInteger(result.rows[0]?.linked_sessions);
}

function buildRouteSessionLinkSql(source: "incident" | "route_session"): string {
  const matches = source === "incident"
    ? `
        SELECT
          $1::uuid AS project_id,
          $2::uuid AS incident_id,
          uniques.service,
          uniques.environment,
          uniques.bucket_start,
          uniques.bucket_granularity,
          uniques.rollup_key AS route_key,
          uniques.dimension_hash,
          uniques.subject_hash
        FROM analytics_rollup_uniques uniques
        WHERE uniques.project_id = $1::uuid
          AND uniques.rollup_kind = 'route_session'
          AND uniques.environment = $4
          AND $5::timestamptz >= uniques.bucket_start - interval '5 minutes'
          AND $5::timestamptz < uniques.bucket_start
            + CASE uniques.bucket_granularity
                WHEN 'hour' THEN interval '1 hour'
                ELSE interval '1 day'
              END
            + interval '5 minutes'
          AND (
            ($6::text IS NOT NULL AND uniques.subject_hash = $6 AND uniques.service = $3)
            OR ($7::text IS NOT NULL AND uniques.trace_id_hash = $7)
          )
      `
    : `
        SELECT
          $1::uuid AS project_id,
          correlations.incident_id,
          $2::text AS service,
          $3::text AS environment,
          $4::timestamptz AS bucket_start,
          $5::text AS bucket_granularity,
          $6::text AS route_key,
          $7::text AS dimension_hash,
          $8::text AS subject_hash
        FROM analytics_incident_correlations correlations
        WHERE correlations.project_id = $1::uuid
          AND correlations.environment = $3
          AND correlations.occurred_at >= $4::timestamptz - interval '5 minutes'
          AND correlations.occurred_at < $4::timestamptz
            + CASE $5::text
                WHEN 'hour' THEN interval '1 hour'
                ELSE interval '1 day'
              END
            + interval '5 minutes'
          AND (
            (correlations.session_id_hash = $8::text AND correlations.service = $2)
            OR ($9::text IS NOT NULL AND correlations.trace_id_hash = $9)
          )
      `;

  return `
    WITH correlation_locks AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(hashtextextended(lock_key, 0))
      FROM unnest($${source === "incident" ? 8 : 10}::text[]) AS lock_key
      ORDER BY lock_key
    ),
    lock_barrier AS (
      SELECT COUNT(*) FROM correlation_locks
    ),
    matching_links AS (
      SELECT matched.*
      FROM (
        ${matches}
      ) matched
      CROSS JOIN lock_barrier
    ),
    inserted_links AS (
      INSERT INTO analytics_incident_session_links (
        project_id,
        incident_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        route_key,
        dimension_hash,
        subject_hash
      )
      SELECT DISTINCT
        project_id,
        incident_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        route_key,
        dimension_hash,
        subject_hash
      FROM matching_links
      ON CONFLICT DO NOTHING
      RETURNING
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        route_key,
        dimension_hash,
        subject_hash
    ),
    newly_linked_sessions AS (
      INSERT INTO analytics_rollup_uniques (
        project_id,
        rollup_kind,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        rollup_key,
        dimension_hash,
        subject_hash
      )
      SELECT DISTINCT
        project_id,
        'incident_route_session',
        service,
        environment,
        bucket_start,
        bucket_granularity,
        route_key,
        dimension_hash,
        subject_hash
      FROM inserted_links
      ON CONFLICT DO NOTHING
      RETURNING
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        rollup_key,
        dimension_hash
    ),
    increments AS (
      SELECT
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        rollup_key,
        dimension_hash,
        COUNT(*)::bigint AS linked_sessions
      FROM newly_linked_sessions
      GROUP BY
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        rollup_key,
        dimension_hash
    ),
    updated AS (
      UPDATE analytics_route_rollups routes
      SET
        linked_incident_sessions = routes.linked_incident_sessions + increments.linked_sessions,
        updated_at = now()
      FROM increments
      WHERE routes.project_id = increments.project_id
        AND routes.service = increments.service
        AND routes.environment = increments.environment
        AND routes.bucket_start = increments.bucket_start
        AND routes.bucket_granularity = increments.bucket_granularity
        AND routes.route_key = increments.rollup_key
        AND routes.dimension_hash = increments.dimension_hash
      RETURNING increments.linked_sessions
    )
    SELECT COALESCE(SUM(linked_sessions), 0)::bigint AS linked_sessions
    FROM updated
  `;
}

function toNonNegativeInteger(value: unknown): number {
  const parsed = typeof value === "bigint" ? Number(value) : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function buildCorrelationLockKeys(
  projectId: string,
  sessionIdHash: string | null,
  traceIdHash: string | null
): string[] {
  return [...new Set([
    sessionIdHash === null ? null : `${projectId}:session:${sessionIdHash}`,
    traceIdHash === null ? null : `${projectId}:trace:${traceIdHash}`
  ].filter((value): value is string => value !== null))].sort();
}
