import { TIER_CAPABILITIES } from "../../shared-types/src/index.js";

import {
  buildAnalyticsRawEventObjectKey,
  buildBundleObjectKey,
  buildRawEventObjectKey,
  buildReproductionObjectKey
} from "./helpers.js";
import type {
  CleanupRetentionJob,
  ObjectStoreClient,
  Queryable,
  RetentionAnalyticsBundleGenerationReference,
  RetentionAnalyticsJourneySampleReference,
  RetentionAnalyticsRawEventReference,
  RetentionAnalyticsRollupPruneResult,
  RetentionExpiredIncidentReference,
  RetentionRawEventReference,
  RetentionStore
} from "./types.js";

const DEFAULT_RETENTION_CLEANUP_BATCH_SIZE = 100;
const DEFAULT_RETENTION_CLEANUP_MAX_BATCHES = 10;

const ANALYTICS_ROLLUP_TABLES = [
  "analytics_rollup_uniques",
  "analytics_session_rollups",
  "analytics_route_rollups",
  "analytics_action_rollups",
  "analytics_funnel_rollups",
  "analytics_transition_rollups",
  "analytics_incident_session_links"
] as const;

type AnalyticsRetentionTable =
  | (typeof ANALYTICS_ROLLUP_TABLES)[number]
  | "analytics_incident_correlations"
  | "analytics_ingestion_ledger"
  | "analytics_visitor_first_seen";

function buildUuidValuesPlaceholders(count: number): string {
  return Array.from({ length: count }, (_, index) => `($${index + 1}::uuid)`).join(", ");
}

function buildUuidPairValuesPlaceholders(count: number): string {
  return Array.from(
    { length: count },
    (_, index) => `($${index * 2 + 1}::uuid, $${index * 2 + 2}::uuid)`
  ).join(", ");
}

function buildAnalyticsBundleGenerationValuesPlaceholders(count: number): string {
  return Array.from(
    { length: count },
    (_, index) =>
      `($${index * 4 + 1}::uuid, $${index * 4 + 2}::uuid, $${index * 4 + 3}, $${index * 4 + 4})`
  ).join(", ");
}

async function pruneExpiredAnalyticsRollupTable(input: {
  db: Queryable;
  tableName: AnalyticsRetentionTable;
  dateColumn?: "bucket_start" | "occurred_at" | "last_seen_at";
  hasBucketGranularity?: boolean;
  now: string;
  limit: number;
}): Promise<number> {
  const retentionCutoff = input.hasBucketGranularity
    ? `CASE
            WHEN candidate.bucket_granularity = 'hour'
              THEN $1::timestamptz
                - make_interval(days => COALESCE(settings.hourly_retention_days, 30)::int)
            ELSE $1::timestamptz
              - make_interval(months => COALESCE(settings.aggregate_retention_months, 12)::int)
          END`
    : `(
          $1::timestamptz
            - make_interval(months => COALESCE(settings.aggregate_retention_months, 12)::int)
        )`;
  const result = await input.db.query<{ deleted: number }>(
    `
      DELETE FROM ${input.tableName} target
      WHERE target.ctid IN (
        SELECT candidate.ctid
        FROM ${input.tableName} candidate
        LEFT JOIN project_analytics_settings settings ON settings.project_id = candidate.project_id
        WHERE candidate.${input.dateColumn ?? "bucket_start"} < ${retentionCutoff}
        ORDER BY candidate.${input.dateColumn ?? "bucket_start"} ASC, candidate.project_id ASC
        LIMIT $2
      )
      RETURNING 1 AS deleted
    `,
    [input.now, input.limit]
  );

  return result.rows.length;
}

export function createPostgresRetentionStore(db: Queryable): RetentionStore {
  return {
    async listExpiredSampledRawEvents(input): Promise<RetentionRawEventReference[]> {
      const result = await db.query<RetentionRawEventReference & Record<string, unknown>>(
        `
          SELECT
            i.project_id::text AS project_id,
            ie.event_id::text AS event_id,
            ie.occurred_at::text AS occurred_at
          FROM incident_events ie
          JOIN incidents i ON i.id = ie.incident_id
          JOIN projects p ON p.id = i.project_id
          LEFT JOIN organizations o ON o.id = p.organization_id
          WHERE ie.is_sampled = true
            AND ie.occurred_at < (
              $1::timestamptz - CASE COALESCE(o.plan, 'free')
                WHEN 'solo' THEN make_interval(days => $2::int)
                WHEN 'team' THEN make_interval(days => $3::int)
                ELSE make_interval(days => $4::int)
              END
            )
          ORDER BY ie.occurred_at ASC, ie.event_id ASC
          LIMIT $5
        `,
        [
          input.now,
          TIER_CAPABILITIES.solo.raw_event_retention_days,
          TIER_CAPABILITIES.team.raw_event_retention_days,
          TIER_CAPABILITIES.free.raw_event_retention_days,
          input.limit
        ]
      );

      return result.rows;
    },

    async markRawEventsExpired(input): Promise<void> {
      if (input.references.length === 0) {
        return;
      }

      const eventIds = input.references.map((reference) => reference.event_id);
      const valuesClause = buildUuidValuesPlaceholders(eventIds.length);

      await db.query(
        `
          WITH expired(event_id) AS (
            VALUES ${valuesClause}
          )
          UPDATE incident_events ie
          SET
            is_sampled = false,
            retain_first = false,
            retain_latest = false,
            retain_after_deploy = false,
            retain_highest_severity = false,
            retain_deploy_metadata = false
          FROM expired
          WHERE ie.event_id = expired.event_id
        `,
        eventIds
      );
    },

    async listExpiredAnalyticsRawEvents(input): Promise<RetentionAnalyticsRawEventReference[]> {
      const result = await db.query<RetentionAnalyticsRawEventReference & Record<string, unknown>>(
        `
          SELECT
            ail.project_id::text AS project_id,
            ail.event_id::text AS event_id,
            ail.occurred_at::text AS occurred_at
          FROM analytics_ingestion_ledger ail
          LEFT JOIN project_analytics_settings settings ON settings.project_id = ail.project_id
          WHERE ail.occurred_at < (
            $1::timestamptz - make_interval(days => COALESCE(settings.raw_retention_days, 1)::int)
          )
            AND ail.raw_deleted_at IS NULL
          ORDER BY ail.occurred_at ASC, ail.event_id ASC
          LIMIT $2
        `,
        [input.now, input.limit]
      );

      return result.rows;
    },

    async deleteExpiredAnalyticsRawEvents(input): Promise<void> {
      if (input.references.length === 0) {
        return;
      }

      const params = input.references.flatMap((reference) => [
        reference.project_id,
        reference.event_id
      ]);
      const valuesClause = buildUuidPairValuesPlaceholders(input.references.length);

      await db.query(
        `
          WITH expired(project_id, event_id) AS (
            VALUES ${valuesClause}
          )
          UPDATE analytics_ingestion_ledger ail
          SET raw_deleted_at = now()
          FROM expired
          WHERE ail.project_id = expired.project_id
            AND ail.event_id = expired.event_id
        `,
        params
      );
    },

    async listExpiredAnalyticsJourneySamples(
      input
    ): Promise<RetentionAnalyticsJourneySampleReference[]> {
      const result = await db.query<
        RetentionAnalyticsJourneySampleReference & Record<string, unknown>
      >(
        `
          SELECT
            project_id::text AS project_id,
            id::text AS sample_id,
            s3_object_key,
            expires_at::text AS expires_at
          FROM analytics_journey_samples
          WHERE expires_at < $1::timestamptz
          ORDER BY expires_at ASC, id ASC
          LIMIT $2
        `,
        [input.now, input.limit]
      );

      return result.rows;
    },

    async deleteExpiredAnalyticsJourneySamples(input): Promise<void> {
      if (input.references.length === 0) {
        return;
      }

      const sampleIds = input.references.map((reference) => reference.sample_id);
      const valuesClause = buildUuidValuesPlaceholders(sampleIds.length);

      await db.query(
        `
          WITH expired(sample_id) AS (
            VALUES ${valuesClause}
          )
          DELETE FROM analytics_journey_samples samples
          USING expired
          WHERE samples.id = expired.sample_id
        `,
        sampleIds
      );
    },

    async pruneExpiredAnalyticsRollups(input): Promise<RetentionAnalyticsRollupPruneResult> {
      let deletedRows = 0;
      let reachedBatchLimit = false;

      for (const tableName of ANALYTICS_ROLLUP_TABLES) {
        const deletedFromTable = await pruneExpiredAnalyticsRollupTable({
          db,
          tableName,
          hasBucketGranularity: true,
          now: input.now,
          limit: input.limit
        });
        deletedRows += deletedFromTable;
        reachedBatchLimit = reachedBatchLimit || deletedFromTable >= input.limit;
      }

      const deletedCorrelations = await pruneExpiredAnalyticsRollupTable({
        db,
        tableName: "analytics_incident_correlations",
        dateColumn: "occurred_at",
        now: input.now,
        limit: input.limit
      });
      deletedRows += deletedCorrelations;
      reachedBatchLimit = reachedBatchLimit || deletedCorrelations >= input.limit;

      const deletedLedgerRows = await pruneExpiredAnalyticsRollupTable({
        db,
        tableName: "analytics_ingestion_ledger",
        dateColumn: "occurred_at",
        now: input.now,
        limit: input.limit
      });
      deletedRows += deletedLedgerRows;
      reachedBatchLimit = reachedBatchLimit || deletedLedgerRows >= input.limit;

      const deletedVisitorRows = await pruneExpiredAnalyticsRollupTable({
        db,
        tableName: "analytics_visitor_first_seen",
        dateColumn: "last_seen_at",
        now: input.now,
        limit: input.limit
      });
      deletedRows += deletedVisitorRows;
      reachedBatchLimit = reachedBatchLimit || deletedVisitorRows >= input.limit;

      const deletedUsageClaims = await db.query<{ deleted: number }>(
        `
          DELETE FROM analytics_usage_claims claims
          WHERE claims.ctid IN (
            SELECT candidate.ctid
            FROM analytics_usage_claims candidate
            WHERE candidate.period_starts_at < $1::timestamptz - interval '13 months'
            ORDER BY candidate.period_starts_at ASC, candidate.organization_id ASC
            LIMIT $2
          )
          RETURNING 1 AS deleted
        `,
        [input.now, input.limit]
      );
      deletedRows += deletedUsageClaims.rows.length;
      reachedBatchLimit = reachedBatchLimit || deletedUsageClaims.rows.length >= input.limit;

      return {
        deleted_rows: deletedRows,
        reached_batch_limit: reachedBatchLimit
      };
    },

    async listExpiredAnalyticsBundleGenerations(
      input
    ): Promise<RetentionAnalyticsBundleGenerationReference[]> {
      const result = await db.query<
        RetentionAnalyticsBundleGenerationReference & Record<string, unknown>
      >(
        `
          SELECT
            abg.project_id::text AS project_id,
            abg.id::text AS generation_id,
            abg.opportunity_id::text AS opportunity_id,
            abg.status,
            abg.object_key,
            abg.completed_at::text AS completed_at,
            abg.updated_at::text AS updated_at
          FROM analytics_bundle_generations abg
          LEFT JOIN project_analytics_settings settings ON settings.project_id = abg.project_id
          WHERE abg.status IN ('completed', 'failed')
            AND COALESCE(abg.completed_at, abg.updated_at, abg.created_at) < (
              $1::timestamptz - make_interval(months => COALESCE(settings.aggregate_retention_months, 12)::int)
            )
          ORDER BY COALESCE(abg.completed_at, abg.updated_at, abg.created_at) ASC, abg.id ASC
          LIMIT $2
        `,
        [input.now, input.limit]
      );

      return result.rows;
    },

    async deleteExpiredAnalyticsBundleGenerations(input): Promise<void> {
      if (input.references.length === 0) {
        return;
      }

      const params = input.references.flatMap((reference) => [
        reference.generation_id,
        reference.opportunity_id,
        reference.status,
        reference.object_key
      ]);
      const valuesClause = buildAnalyticsBundleGenerationValuesPlaceholders(
        input.references.length
      );

      await db.query(
        `
          WITH expired(generation_id, opportunity_id, status, object_key) AS (
            VALUES ${valuesClause}
          ),
          target_generations AS (
            SELECT
              abg.id,
              abg.opportunity_id,
              abg.status,
              abg.object_key,
              abg.created_at
            FROM analytics_bundle_generations abg
            JOIN expired ON expired.generation_id = abg.id
          ),
          cleared_opportunities AS (
            UPDATE analytics_opportunities ao
            SET
              bundle_status = 'not_requested',
              bundle_object_key = NULL,
              bundle_failure_reason = NULL,
              updated_at = now()
            FROM target_generations target
            WHERE ao.id = target.opportunity_id
              AND ao.bundle_status = target.status
              AND ao.bundle_object_key IS NOT DISTINCT FROM target.object_key
              AND NOT EXISTS (
                SELECT 1
                FROM analytics_bundle_generations newer
                WHERE newer.opportunity_id = target.opportunity_id
                  AND newer.id <> target.id
                  AND (newer.created_at, newer.id) > (target.created_at, target.id)
              )
            RETURNING 1
          )
          DELETE FROM analytics_bundle_generations abg
          USING expired
          WHERE abg.id = expired.generation_id
        `,
        params
      );
    },

    async listExpiredIncidents(input): Promise<RetentionExpiredIncidentReference[]> {
      const result = await db.query<RetentionExpiredIncidentReference & Record<string, unknown>>(
        `
          SELECT
            i.project_id::text AS project_id,
            i.id::text AS incident_id
          FROM incidents i
          JOIN projects p ON p.id = i.project_id
          LEFT JOIN organizations o ON o.id = p.organization_id
          WHERE COALESCE(i.bundle_updated_at, i.bundle_created_at) IS NOT NULL
            AND COALESCE(i.bundle_updated_at, i.bundle_created_at) < (
              $1::timestamptz - CASE COALESCE(o.plan, 'free')
                WHEN 'solo' THEN make_interval(days => $2::int)
                WHEN 'team' THEN make_interval(days => $3::int)
                ELSE make_interval(days => $4::int)
              END
            )
          ORDER BY COALESCE(i.bundle_updated_at, i.bundle_created_at) ASC, i.id ASC
          LIMIT $5
        `,
        [
          input.now,
          TIER_CAPABILITIES.solo.bundle_retention_days,
          TIER_CAPABILITIES.team.bundle_retention_days,
          TIER_CAPABILITIES.free.bundle_retention_days,
          input.limit
        ]
      );

      return result.rows;
    },

    async deleteExpiredIncidents(input): Promise<void> {
      if (input.references.length === 0) {
        return;
      }

      const incidentIds = input.references.map((reference) => reference.incident_id);
      const valuesClause = buildUuidValuesPlaceholders(incidentIds.length);

      await db.query(
        `
          WITH expired(incident_id) AS (
            VALUES ${valuesClause}
          )
          DELETE FROM incidents i
          USING expired
          WHERE i.id = expired.incident_id
        `,
        incidentIds
      );
    }
  };
}

export function createRetentionCleanupService(input: {
  retentionStore: RetentionStore;
  objectStore: Pick<ObjectStoreClient, "deleteObject">;
  batchSize?: number;
  maxBatches?: number;
}): {
  runCleanup(job: CleanupRetentionJob): Promise<void>;
} {
  const batchSize = input.batchSize ?? DEFAULT_RETENTION_CLEANUP_BATCH_SIZE;
  const maxBatches = input.maxBatches ?? DEFAULT_RETENTION_CLEANUP_MAX_BATCHES;

  return {
    async runCleanup(job): Promise<void> {
      if (input.objectStore.deleteObject === undefined) {
        return;
      }

      for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
        const expiredReferences = await input.retentionStore.listExpiredSampledRawEvents({
          now: job.scheduled_at,
          limit: batchSize
        });
        const expiredAnalyticsRawEvents = await input.retentionStore.listExpiredAnalyticsRawEvents({
          now: job.scheduled_at,
          limit: batchSize
        });
        const expiredAnalyticsJourneySamples =
          await input.retentionStore.listExpiredAnalyticsJourneySamples({
            now: job.scheduled_at,
            limit: batchSize
          });
        const prunedAnalyticsRollups = await input.retentionStore.pruneExpiredAnalyticsRollups({
          now: job.scheduled_at,
          limit: batchSize
        });
        const expiredAnalyticsBundleGenerations =
          await input.retentionStore.listExpiredAnalyticsBundleGenerations({
            now: job.scheduled_at,
            limit: batchSize
          });
        const expiredIncidents = await input.retentionStore.listExpiredIncidents({
          now: job.scheduled_at,
          limit: batchSize
        });

        if (
          expiredReferences.length === 0 &&
          expiredAnalyticsRawEvents.length === 0 &&
          expiredAnalyticsJourneySamples.length === 0 &&
          prunedAnalyticsRollups.deleted_rows === 0 &&
          expiredAnalyticsBundleGenerations.length === 0 &&
          expiredIncidents.length === 0
        ) {
          return;
        }

        const deletedReferences: RetentionRawEventReference[] = [];
        for (const reference of expiredReferences) {
          try {
            await input.objectStore.deleteObject({
              key: buildRawEventObjectKey({
                projectId: reference.project_id,
                occurredAt: new Date(reference.occurred_at),
                eventId: reference.event_id
              })
            });
            deletedReferences.push(reference);
          } catch {
            // Leave metadata untouched so the next cleanup run can retry safely.
          }
        }

        if (deletedReferences.length > 0) {
          await input.retentionStore.markRawEventsExpired({
            references: deletedReferences
          });
        }

        const deletedAnalyticsRawEvents: RetentionAnalyticsRawEventReference[] = [];
        for (const reference of expiredAnalyticsRawEvents) {
          try {
            await input.objectStore.deleteObject({
              key: buildAnalyticsRawEventObjectKey({
                projectId: reference.project_id,
                occurredAt: new Date(reference.occurred_at),
                eventId: reference.event_id
              })
            });
            deletedAnalyticsRawEvents.push(reference);
          } catch {
            // Leave metadata untouched so the next cleanup run can retry safely.
          }
        }

        if (deletedAnalyticsRawEvents.length > 0) {
          await input.retentionStore.deleteExpiredAnalyticsRawEvents({
            references: deletedAnalyticsRawEvents
          });
        }

        const deletedAnalyticsJourneySamples: RetentionAnalyticsJourneySampleReference[] = [];
        for (const reference of expiredAnalyticsJourneySamples) {
          try {
            await input.objectStore.deleteObject({
              key: reference.s3_object_key
            });
            deletedAnalyticsJourneySamples.push(reference);
          } catch {
            // Leave metadata untouched so the next cleanup run can retry safely.
          }
        }

        if (deletedAnalyticsJourneySamples.length > 0) {
          await input.retentionStore.deleteExpiredAnalyticsJourneySamples({
            references: deletedAnalyticsJourneySamples
          });
        }

        const deletedAnalyticsBundleGenerations: RetentionAnalyticsBundleGenerationReference[] = [];
        for (const reference of expiredAnalyticsBundleGenerations) {
          if (reference.object_key === null) {
            deletedAnalyticsBundleGenerations.push(reference);
            continue;
          }

          try {
            await input.objectStore.deleteObject({
              key: reference.object_key
            });
            deletedAnalyticsBundleGenerations.push(reference);
          } catch {
            // Leave metadata untouched so the next cleanup run can retry safely.
          }
        }

        if (deletedAnalyticsBundleGenerations.length > 0) {
          await input.retentionStore.deleteExpiredAnalyticsBundleGenerations({
            references: deletedAnalyticsBundleGenerations
          });
        }

        const deletedIncidents: RetentionExpiredIncidentReference[] = [];
        for (const reference of expiredIncidents) {
          try {
            await input.objectStore.deleteObject({
              key: buildBundleObjectKey(reference.project_id, reference.incident_id)
            });
            await input.objectStore.deleteObject({
              key: buildReproductionObjectKey(reference.project_id, reference.incident_id)
            });
            deletedIncidents.push(reference);
          } catch {
            // Leave incident metadata intact so the next cleanup run can retry safely.
          }
        }

        if (deletedIncidents.length > 0) {
          await input.retentionStore.deleteExpiredIncidents({
            references: deletedIncidents
          });
        }

        if (
          deletedReferences.length === 0 &&
          deletedAnalyticsRawEvents.length === 0 &&
          deletedAnalyticsJourneySamples.length === 0 &&
          prunedAnalyticsRollups.deleted_rows === 0 &&
          deletedAnalyticsBundleGenerations.length === 0 &&
          deletedIncidents.length === 0 &&
          expiredReferences.length < batchSize &&
          expiredAnalyticsRawEvents.length < batchSize &&
          expiredAnalyticsJourneySamples.length < batchSize &&
          !prunedAnalyticsRollups.reached_batch_limit &&
          expiredAnalyticsBundleGenerations.length < batchSize &&
          expiredIncidents.length < batchSize
        ) {
          return;
        }

        if (
          expiredReferences.length < batchSize &&
          expiredAnalyticsRawEvents.length < batchSize &&
          expiredAnalyticsJourneySamples.length < batchSize &&
          !prunedAnalyticsRollups.reached_batch_limit &&
          expiredAnalyticsBundleGenerations.length < batchSize &&
          expiredIncidents.length < batchSize
        ) {
          return;
        }
      }
    }
  };
}
