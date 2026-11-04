import { randomUUID } from "node:crypto";
import { pruneRetainedBundleOwnersForProject } from "./retained-bundle-pruning.js";
import type { Queryable } from "./types.js";
import type { ImprovementOpportunityRow } from "./improvement-opportunity-shared.js";
import type {
  ImprovementOpportunityStore,
  ImprovementEventReference,
  ImprovementBundleTrigger
} from "./improvement-opportunity-types.js";

export function createImprovementBundleMetadata(
  db: Queryable
): Pick<
  ImprovementOpportunityStore,
  | "getImprovementBundleBuildContext"
  | "listImprovementEventReferences"
  | "hasImprovementBundleGenerationForSourceEvent"
  | "reserveImprovementBundleGeneration"
  | "markImprovementBundleGenerationFailure"
  | "pruneRetainedBundleOwnersForProject"
> {
  return {
    async getImprovementBundleBuildContext(input) {
      const result = await db.query<ImprovementOpportunityRow>(
        `
          SELECT
            io.id::text AS opportunity_id,
            io.project_id::text AS project_id,
            p.slug AS project_slug,
            io.service_id::text AS service_id,
            io.service_name,
            s.runtime AS service_runtime,
            s.framework AS service_framework,
            io.environment,
            io.kind,
            io.status,
            io.severity,
            io.confidence::float8 AS confidence,
            io.fingerprint,
            io.title,
            io.summary,
            io.occurrence_count,
            io.evidence,
            io.related_incident_ids::text[] AS related_incident_ids,
            io.first_detected_at::text AS first_detected_at,
            io.last_detected_at::text AS last_detected_at,
            io.last_source_event_id::text AS last_source_event_id,
            io.bundle_generation_number,
            io.bundle_created_at::text AS bundle_created_at,
            io.bundle_updated_at::text AS bundle_updated_at,
            io.bundle_source_event_id::text AS bundle_source_event_id,
            io.bundle_failure_reason
          FROM improvement_opportunities io
          JOIN projects p ON p.id = io.project_id
          LEFT JOIN services s ON s.id = io.service_id
          WHERE io.project_id = $1::uuid
            AND io.id = $2::uuid
          LIMIT 1
        `,
        [input.project_id, input.opportunity_id]
      );

      return result.rows[0] ?? null;
    },

    async listImprovementEventReferences(input) {
      const result = await db.query<ImprovementEventReference & Record<string, unknown>>(
        `
          SELECT
            event_id::text AS event_id,
            event_type,
            occurred_at::text AS occurred_at
          FROM improvement_opportunity_events
          WHERE improvement_opportunity_id = $1::uuid
          ORDER BY occurred_at DESC, event_id DESC
          LIMIT $2
        `,
        [input.opportunity_id, input.limit]
      );

      return result.rows.reverse();
    },

    async hasImprovementBundleGenerationForSourceEvent(input) {
      const result = await db.query<{ exists: boolean } & Record<string, unknown>>(
        `
          SELECT EXISTS(
            SELECT 1
            FROM bundle_generations
            WHERE improvement_opportunity_id = $1::uuid
              AND source_event_id = $2::uuid
          ) AS exists
        `,
        [input.opportunity_id, input.event_id]
      );

      return result.rows[0]?.exists ?? false;
    },

    async reserveImprovementBundleGeneration(input) {
      const result = await db.query<
        {
          project_id: string;
          generation_number: number;
          created_at: string;
          updated_at: string;
          source_event_id: string;
          source_occurred_at: string;
          trigger: ImprovementBundleTrigger;
        } & Record<string, unknown>
      >(
        `
          WITH reserved AS (
            UPDATE improvement_opportunities
            SET
              bundle_generation_number = CASE
                WHEN bundle_source_event_id = $2::uuid THEN bundle_generation_number
                ELSE GREATEST(bundle_generation_number, 0) + 1
              END,
              bundle_created_at = CASE
                WHEN bundle_source_event_id = $2::uuid AND bundle_created_at IS NOT NULL THEN bundle_created_at
                ELSE now()
              END,
              bundle_updated_at = CASE
                WHEN bundle_source_event_id = $2::uuid AND bundle_updated_at IS NOT NULL THEN bundle_updated_at
                ELSE now()
              END,
              bundle_source_event_id = $2::uuid,
              bundle_failure_reason = NULL,
              updated_at = now()
            WHERE id = $1::uuid
            RETURNING
              project_id::text AS project_id,
              bundle_generation_number AS generation_number,
              bundle_created_at::text AS created_at,
              bundle_updated_at::text AS updated_at,
              bundle_source_event_id::text AS source_event_id
          ),
          persisted AS (
            INSERT INTO bundle_generations (
              id,
              project_id,
              incident_id,
              improvement_opportunity_id,
              bundle_type,
              generation_number,
              source_event_id,
              source_occurred_at,
              trigger,
              created_at,
              updated_at
            )
            SELECT
              $5::uuid,
              reserved.project_id::uuid,
              NULL,
              $1::uuid,
              'improvement',
              reserved.generation_number,
              reserved.source_event_id::uuid,
              $3::timestamptz,
              $4,
              reserved.created_at::timestamptz,
              reserved.updated_at::timestamptz
            FROM reserved
            ON CONFLICT (improvement_opportunity_id, source_event_id)
            WHERE improvement_opportunity_id IS NOT NULL
            DO UPDATE SET
              generation_number = EXCLUDED.generation_number,
              trigger = EXCLUDED.trigger,
              updated_at = EXCLUDED.updated_at
            RETURNING 1
          )
          SELECT
            reserved.project_id,
            reserved.generation_number,
            reserved.created_at,
            reserved.updated_at,
            reserved.source_event_id,
            $3::timestamptz::text AS source_occurred_at,
            $4::text AS trigger
          FROM reserved
        `,
        [input.opportunity_id, input.event_id, input.occurred_at, input.trigger, randomUUID()]
      );

      const row = result.rows[0];
      if (row === undefined) {
        throw new Error("improvement_bundle_generation_reserve_failed");
      }

      return {
        generation_number: row.generation_number,
        created_at: row.created_at,
        updated_at: row.updated_at,
        source_event_id: row.source_event_id,
        source_occurred_at: row.source_occurred_at,
        trigger: row.trigger
      };
    },

    async markImprovementBundleGenerationFailure(input) {
      await db.query(
        `
          UPDATE improvement_opportunities
          SET
            bundle_failure_reason = $2,
            updated_at = now()
          WHERE id = $1::uuid
        `,
        [input.opportunity_id, input.reason]
      );
    },

    async pruneRetainedBundleOwnersForProject(input) {
      return pruneRetainedBundleOwnersForProject(db, input);
    }
  };
}
