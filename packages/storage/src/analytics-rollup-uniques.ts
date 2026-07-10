import type { Queryable } from "./types.js";

export interface AnalyticsUniqueRollupSubjectInput {
  projectId: string;
  rollupKind:
    | "session"
    | "route_session"
    | "transition_session"
    | "action_session"
    | "funnel_step_session"
    | "funnel_completion_session";
  service: string;
  environment: string;
  bucketStart: string;
  bucketGranularity: "hour" | "day";
  rollupKey: string;
  dimensionHash: string;
  subjectHash: string;
  traceIdHash: string | null;
  deployId: string | null;
}

export async function recordAnalyticsUniqueRollupSubject(
  db: Queryable,
  input: AnalyticsUniqueRollupSubjectInput
): Promise<{ inserted: boolean; correlation_enriched: boolean }> {
  const result = await db.query<{ inserted: boolean; correlation_enriched: boolean }>(
    `
      WITH inserted AS (
        INSERT INTO analytics_rollup_uniques (
          project_id,
          rollup_kind,
          service,
          environment,
          bucket_start,
          bucket_granularity,
          rollup_key,
          dimension_hash,
          subject_hash,
          trace_id_hash,
          deploy_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT DO NOTHING
        RETURNING 1
      ),
      enriched AS (
        UPDATE analytics_rollup_uniques
        SET
          trace_id_hash = COALESCE(analytics_rollup_uniques.trace_id_hash, $10),
          deploy_id = COALESCE(analytics_rollup_uniques.deploy_id, $11)
        WHERE NOT EXISTS (SELECT 1 FROM inserted)
          AND project_id = $1
          AND rollup_kind = $2
          AND service = $3
          AND environment = $4
          AND bucket_start = $5
          AND bucket_granularity = $6
          AND rollup_key = $7
          AND dimension_hash = $8
          AND subject_hash = $9
          AND (
            trace_id_hash IS DISTINCT FROM COALESCE(trace_id_hash, $10)
            OR deploy_id IS DISTINCT FROM COALESCE(deploy_id, $11)
          )
        RETURNING 1
      )
      SELECT
        EXISTS(SELECT 1 FROM inserted) AS inserted,
        EXISTS(SELECT 1 FROM enriched) AS correlation_enriched
    `,
    [
      input.projectId,
      input.rollupKind,
      input.service,
      input.environment,
      input.bucketStart,
      input.bucketGranularity,
      input.rollupKey,
      input.dimensionHash,
      input.subjectHash,
      input.traceIdHash,
      input.deployId
    ]
  );

  return result.rows[0] ?? { inserted: false, correlation_enriched: false };
}
