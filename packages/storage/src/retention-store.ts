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
  RetentionAnalyticsJourneySampleReference,
  RetentionAnalyticsRawEventReference,
  RetentionExpiredIncidentReference,
  RetentionRawEventReference,
  RetentionStore
} from "./types.js";

const DEFAULT_RETENTION_CLEANUP_BATCH_SIZE = 100;
const DEFAULT_RETENTION_CLEANUP_MAX_BATCHES = 10;

function buildUuidValuesPlaceholders(count: number): string {
  return Array.from({ length: count }, (_, index) => `($${index + 1}::uuid)`).join(", ");
}

function buildUuidPairValuesPlaceholders(count: number): string {
  return Array.from(
    { length: count },
    (_, index) => `($${index * 2 + 1}::uuid, $${index * 2 + 2}::uuid)`
  ).join(", ");
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
          DELETE FROM analytics_ingestion_ledger ail
          USING expired
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
        const expiredIncidents = await input.retentionStore.listExpiredIncidents({
          now: job.scheduled_at,
          limit: batchSize
        });

        if (
          expiredReferences.length === 0 &&
          expiredAnalyticsRawEvents.length === 0 &&
          expiredAnalyticsJourneySamples.length === 0 &&
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
          deletedIncidents.length === 0 &&
          expiredReferences.length < batchSize &&
          expiredAnalyticsRawEvents.length < batchSize &&
          expiredAnalyticsJourneySamples.length < batchSize &&
          expiredIncidents.length < batchSize
        ) {
          return;
        }

        if (
          expiredReferences.length < batchSize &&
          expiredAnalyticsRawEvents.length < batchSize &&
          expiredAnalyticsJourneySamples.length < batchSize &&
          expiredIncidents.length < batchSize
        ) {
          return;
        }
      }
    }
  };
}
