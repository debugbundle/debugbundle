import { randomUUID } from "node:crypto";
import { pruneRetainedBundleOwnersForProject } from "./retained-bundle-pruning.js";
import type {
  BuildBundleJob,
  BundleBuildContext,
  IncidentEventReference,
  LogEventCandidateReference,
  PostgresMetadataStore,
  ProbeEventCandidateReference,
  Queryable
} from "./types.js";

export function createMetadataBundles(
  db: Queryable
): Pick<
  PostgresMetadataStore,
  | "getBundleBuildContext"
  | "getDeploymentForServiceAt"
  | "hasBundleGenerationForSourceEvent"
  | "markBundleGenerationFailure"
  | "pruneRetainedBundleOwnersForProject"
  | "reserveBundleGeneration"
  | "listIncidentEventReferences"
  | "listProbeEventCandidatesForServiceWindow"
  | "listLogEventCandidatesForServiceWindow"
> {
  return {
    async getDeploymentForServiceAt(input) {
      const result = await db.query<{
        commit_sha: string;
        deploy_version: string;
        branch: string;
        deployed_at: string;
      }>(
        `
        SELECT d.commit_sha, d.version AS deploy_version, d.branch, d.deployed_at::text AS deployed_at
        FROM deployments d
        WHERE d.project_id = $1 AND d.service_id = $2 AND d.environment = $3
          AND d.deployed_at <= $4::timestamptz
        ORDER BY d.deployed_at DESC, d.source_event_id DESC
        LIMIT 1
      `,
        [input.project_id, input.service_id, input.environment, input.occurred_at]
      );
      return result.rows[0] ?? null;
    },
    async getBundleBuildContext(input): Promise<BundleBuildContext | null> {
      const result = await db.query<BundleBuildContext & Record<string, unknown>>(
        `
          SELECT
            i.id::text AS incident_id,
            i.project_id::text AS project_id,
            i.service_id::text AS service_id,
            COALESCE(s.name, 'unknown') AS service_name,
            s.runtime AS service_runtime,
            s.framework AS service_framework,
            i.environment,
            i.fingerprint,
            i.title,
            i.severity,
            i.first_seen_at::text AS first_seen_at,
            i.last_seen_at::text AS last_seen_at,
            i.occurrence_count,
            CASE WHEN i.fingerprint_version = 'v3' THEN (
              SELECT jsonb_build_object(
                'items', COALESCE(jsonb_agg(
                  jsonb_build_object('route', route, 'occurrences', occurrences)
                  ORDER BY occurrences DESC, route COLLATE "C" ASC
                ), '[]'::jsonb),
                'recorded_occurrences', COALESCE(MAX(recorded), 0),
                'unattributed_occurrences', GREATEST(0, i.occurrence_count - COALESCE(MAX(recorded), 0)),
                'omitted_routes', GREATEST(0, COALESCE(MAX(total_routes), 0) - 20),
                'coverage', 'occurrence_metadata'
              )
              FROM (
                SELECT resource_route AS route, COUNT(*) AS occurrences,
                  SUM(COUNT(*)) OVER () AS recorded, COUNT(*) OVER () AS total_routes
                FROM incident_events resource_events
                WHERE resource_events.incident_id = i.id AND resource_route IS NOT NULL
                GROUP BY resource_route
                ORDER BY COUNT(*) DESC, resource_route COLLATE "C" ASC
                LIMIT 20
              ) resource_summary
            ) END AS resource_routes,
            COALESCE(
              ARRAY_AGG(DISTINCT ie.event_type ORDER BY ie.event_type)
                FILTER (WHERE ie.event_type IS NOT NULL),
              ARRAY[]::text[]
            ) AS source_event_types
          FROM incidents i
          LEFT JOIN services s ON s.id = i.service_id
          LEFT JOIN incident_events ie ON ie.incident_id = i.id
          WHERE i.project_id = $1
            AND i.id = $2
          GROUP BY
            i.id,
            i.project_id,
            i.service_id,
            s.name,
            s.runtime,
            s.framework,
            i.environment,
            i.fingerprint,
            i.fingerprint_version,
            i.title,
            i.severity,
            i.first_seen_at,
            i.last_seen_at,
            i.occurrence_count
          LIMIT 1
        `,
        [input.project_id, input.incident_id]
      );

      const row = result.rows[0];
      if (row === undefined) return null;
      // One statement keeps incident totals and bounded route counts on the same database snapshot.
      const { resource_routes, ...context } = row;
      return resource_routes == null ? context : { ...context, resource_routes };
    },

    async hasBundleGenerationForSourceEvent(input): Promise<boolean> {
      const result = await db.query<{ exists: boolean }>(
        `
          SELECT EXISTS(
            SELECT 1
            FROM bundle_generations
            WHERE incident_id = $1
              AND source_event_id = $2
          ) AS exists
        `,
        [input.incident_id, input.event_id]
      );

      return result.rows[0]?.exists ?? false;
    },

    async markBundleGenerationFailure(input): Promise<void> {
      await db.query(
        `
          UPDATE incidents
          SET
            bundle_failure_reason = $2,
            updated_at = now()
          WHERE id = $1
        `,
        [input.incident_id, input.reason]
      );
    },

    async pruneRetainedBundleOwnersForProject(input) {
      return pruneRetainedBundleOwnersForProject(db, input);
    },

    async reserveBundleGeneration(input): Promise<{
      generation_number: number;
      created_at: string;
      updated_at: string;
      source_event_id: string;
      source_occurred_at: string;
      trigger: BuildBundleJob["trigger"];
    }> {
      const result = await db.query<
        {
          project_id: string;
          generation_number: number;
          created_at: string;
          updated_at: string;
          source_event_id: string;
          source_occurred_at: string;
          trigger: BuildBundleJob["trigger"];
        } & Record<string, unknown>
      >(
        `
          WITH reserved AS (
            UPDATE incidents
            SET
              bundle_generation_number = CASE
                WHEN bundle_source_event_id = $2::uuid THEN bundle_generation_number
                WHEN bundle_source_occurred_at IS NOT NULL AND bundle_source_occurred_at > $3::timestamptz
                  THEN bundle_generation_number
                ELSE GREATEST(bundle_generation_number, 0) + 1
              END,
              bundle_created_at = CASE
                WHEN bundle_source_event_id = $2::uuid AND bundle_created_at IS NOT NULL THEN bundle_created_at
                WHEN bundle_source_occurred_at IS NOT NULL AND bundle_source_occurred_at > $3::timestamptz
                  THEN bundle_created_at
                ELSE now()
              END,
              bundle_updated_at = CASE
                WHEN bundle_source_event_id = $2::uuid AND bundle_updated_at IS NOT NULL THEN bundle_updated_at
                WHEN bundle_source_occurred_at IS NOT NULL AND bundle_source_occurred_at > $3::timestamptz
                  THEN bundle_updated_at
                ELSE now()
              END,
              bundle_source_event_id = CASE
                WHEN bundle_source_occurred_at IS NOT NULL AND bundle_source_occurred_at > $3::timestamptz
                  THEN bundle_source_event_id
                ELSE $2::uuid
              END,
              bundle_source_occurred_at = CASE
                WHEN bundle_source_occurred_at IS NOT NULL AND bundle_source_occurred_at > $3::timestamptz
                  THEN bundle_source_occurred_at
                ELSE $3::timestamptz
              END,
              bundle_trigger = CASE
                WHEN bundle_source_occurred_at IS NOT NULL AND bundle_source_occurred_at > $3::timestamptz
                  THEN bundle_trigger
                ELSE $4
              END,
              bundle_failure_reason = NULL,
              updated_at = now()
            WHERE id = $1
            RETURNING
              project_id::text AS project_id,
              id::text AS incident_id,
              bundle_generation_number AS generation_number,
              bundle_created_at::text AS created_at,
              bundle_updated_at::text AS updated_at,
              bundle_source_event_id::text AS source_event_id,
              bundle_source_occurred_at::text AS source_occurred_at,
              bundle_trigger AS trigger
          ),
          persisted AS (
            INSERT INTO bundle_generations (
              id,
              project_id,
              incident_id,
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
              reserved.incident_id::uuid,
              'failure',
              reserved.generation_number,
              reserved.source_event_id::uuid,
              reserved.source_occurred_at::timestamptz,
              reserved.trigger,
              reserved.created_at::timestamptz,
              reserved.updated_at::timestamptz
            FROM reserved
            ON CONFLICT (incident_id, source_event_id)
            WHERE incident_id IS NOT NULL
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
            reserved.source_occurred_at,
            reserved.trigger
          FROM reserved
        `,
        [input.incident_id, input.event_id, input.occurred_at, input.trigger, randomUUID()]
      );

      const row = result.rows[0];
      if (row === undefined) {
        throw new Error("bundle_generation_reserve_failed");
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

    async listIncidentEventReferences(input): Promise<IncidentEventReference[]> {
      const result = await db.query<IncidentEventReference & Record<string, unknown>>(
        `
          SELECT
            ie.event_id,
            ie.event_type,
            ie.occurred_at::text AS occurred_at
          FROM incident_events ie
          WHERE ie.incident_id = $1
            AND ie.is_sampled = true
          ORDER BY ie.occurred_at ASC, ie.event_id ASC
        `,
        [input.incident_id]
      );

      return result.rows;
    },

    async listProbeEventCandidatesForServiceWindow(input): Promise<ProbeEventCandidateReference[]> {
      const result = await db.query<ProbeEventCandidateReference & Record<string, unknown>>(
        `
          SELECT
            ie.event_id,
            ie.occurred_at::text AS occurred_at
          FROM incident_events ie
          JOIN incidents i ON i.id = ie.incident_id
          LEFT JOIN services s ON s.id = i.service_id
          WHERE i.project_id = $1
            AND i.environment = $2
            AND COALESCE(s.name, 'unknown') = $3
            AND ie.event_type = 'probe_event'
            AND ie.occurred_at >= $4::timestamptz
            AND ie.occurred_at <= $5::timestamptz
          ORDER BY ie.occurred_at ASC, ie.event_id ASC
        `,
        [
          input.project_id,
          input.environment,
          input.service_name,
          input.window_start,
          input.window_end
        ]
      );

      return result.rows;
    },

    async listLogEventCandidatesForServiceWindow(input): Promise<LogEventCandidateReference[]> {
      const result = await db.query<LogEventCandidateReference & Record<string, unknown>>(
        `
          SELECT
            ie.event_id,
            ie.occurred_at::text AS occurred_at
          FROM incident_events ie
          JOIN incidents i ON i.id = ie.incident_id
          LEFT JOIN services s ON s.id = i.service_id
          WHERE i.project_id = $1
            AND i.environment = $2
            AND COALESCE(s.name, 'unknown') = $3
            AND ie.event_type = 'log_event'
            AND ie.is_sampled = true
            AND ie.occurred_at >= $4::timestamptz
            AND ie.occurred_at <= $5::timestamptz
          ORDER BY ie.occurred_at ASC, ie.event_id ASC
        `,
        [
          input.project_id,
          input.environment,
          input.service_name,
          input.window_start,
          input.window_end
        ]
      );

      return result.rows;
    }
  };
}
