import type { PostgresMetadataStore, Queryable } from "./types.js";
import { type IncidentRetrievalRow, mapIncidentRetrievalRow } from "./metadata-incident-shared.js";
import { mapOptionalRow } from "./metadata-shared.js";

export function createMetadataIncidentLifecycle(
  db: Queryable
): Pick<
  PostgresMetadataStore,
  | "resolveIncidentForOrganization"
  | "resolveIncidentsForOrganization"
  | "reopenIncidentForOrganization"
  | "reopenIncidentsForOrganization"
> {
  return {
    async resolveIncidentForOrganization(input) {
      const result = await db.query<IncidentRetrievalRow>(
        `
          WITH updated AS (
            UPDATE incidents i
            SET status = 'resolved',
                resolved_at = CASE
                  WHEN i.status = 'regressed' THEN $4::timestamptz
                  ELSE COALESCE(i.resolved_at, $4::timestamptz)
                END,
                resolved_by_member_id = CASE
                  WHEN i.status = 'regressed' THEN $3::uuid
                  ELSE COALESCE(i.resolved_by_member_id, $3::uuid)
                END,
                regressed_at = NULL,
                updated_at = now()
            FROM projects p
            WHERE i.project_id = p.id
              AND (
                (
                  $5::uuid IS NULL
                  AND p.organization_id = $1
                )
                OR (
                  $5::uuid IS NOT NULL
                  AND (
                    p.owner_user_id = $5::uuid
                    OR EXISTS (
                      SELECT 1
                      FROM project_members pm
                      WHERE pm.project_id = p.id
                        AND pm.user_id = $5::uuid
                    )
                  )
                )
              )
              AND i.id = $2
              AND i.status <> 'resolved'
            RETURNING
              i.id AS incident_id,
              i.project_id,
              i.service_id,
              i.latest_deployment_id::text AS latest_deployment_id,
              i.environment,
              i.fingerprint,
              i.fingerprint_version,
              i.title,
              i.severity,
              i.status,
              i.first_seen_at::text AS first_seen_at,
              i.last_seen_at::text AS last_seen_at,
              i.occurrence_count,
              i.spike_detected_at::text AS spike_detected_at,
              i.resolved_at::text AS resolved_at,
              i.regressed_at::text AS regressed_at,
              COALESCE(i.matched_fields, ARRAY[]::text[]) AS matched_fields
          )
          SELECT
            updated.incident_id,
            updated.project_id,
            p.name AS project_name,
            p.color_tag AS project_color_tag,
            updated.service_id,
            s.name AS service_name,
            updated.latest_deployment_id,
            updated.environment,
            updated.fingerprint,
            updated.fingerprint_version,
            updated.title,
            updated.severity,
            updated.status,
            updated.first_seen_at,
            updated.last_seen_at,
            updated.occurrence_count,
            updated.spike_detected_at,
            updated.resolved_at,
            updated.regressed_at,
            updated.matched_fields,
            primary_signal.event_type AS incident_reason_event_type,
            primary_signal.event_class AS incident_reason_event_class,
            primary_signal.level AS incident_reason_level
          FROM updated
          JOIN projects p ON p.id = updated.project_id
          LEFT JOIN services s ON s.id = updated.service_id
          LEFT JOIN LATERAL (
            SELECT ie.event_type, ie.event_class, ie.level
            FROM incident_events ie
            WHERE ie.incident_id = updated.incident_id::uuid
              AND ie.event_class = 'incident_signal'
            ORDER BY ie.occurred_at ASC, ie.event_id ASC
            LIMIT 1
          ) primary_signal ON TRUE
        `,
        [
          input.organization_id,
          input.incident_id,
          input.resolved_by_member_id,
          input.resolved_at,
          input.user_id ?? null
        ]
      );

      return mapOptionalRow(result.rows[0], mapIncidentRetrievalRow);
    },

    async resolveIncidentsForOrganization(input) {
      const result = await db.query<IncidentRetrievalRow & { input_order: number }>(
        `
          WITH requested AS (
            SELECT incident_id, MIN(input_order)::int AS input_order
            FROM unnest($2::uuid[]) WITH ORDINALITY AS input_ids(incident_id, input_order)
            GROUP BY incident_id
          ),
          accessible AS (
            SELECT requested.incident_id, requested.input_order
            FROM requested
            JOIN incidents i ON i.id = requested.incident_id
            JOIN projects p ON p.id = i.project_id
            WHERE (
              (
                $5::uuid IS NULL
                AND p.organization_id = $1
              )
              OR (
                $5::uuid IS NOT NULL
                AND (
                  p.owner_user_id = $5::uuid
                  OR EXISTS (
                    SELECT 1
                    FROM project_members pm
                    WHERE pm.project_id = p.id
                      AND pm.user_id = $5::uuid
                  )
                )
              )
            )
          ),
          counts AS (
            SELECT
              (SELECT COUNT(*)::int FROM requested) AS requested_count,
              (SELECT COUNT(*)::int FROM accessible) AS accessible_count
          ),
          updated AS (
            UPDATE incidents i
            SET status = 'resolved',
                resolved_at = CASE
                  WHEN i.status = 'regressed' THEN $4::timestamptz
                  ELSE COALESCE(i.resolved_at, $4::timestamptz)
                END,
                resolved_by_member_id = CASE
                  WHEN i.status = 'regressed' THEN $3::uuid
                  ELSE COALESCE(i.resolved_by_member_id, $3::uuid)
                END,
                regressed_at = NULL,
                updated_at = now()
            FROM accessible a, counts c
            WHERE c.requested_count = c.accessible_count
              AND i.id = a.incident_id
              AND i.status <> 'resolved'
            RETURNING
              a.input_order,
              i.id AS incident_id,
              i.project_id,
              i.service_id,
              i.latest_deployment_id::text AS latest_deployment_id,
              i.environment,
              i.fingerprint,
              i.fingerprint_version,
              i.title,
              i.severity,
              i.status,
              i.first_seen_at::text AS first_seen_at,
              i.last_seen_at::text AS last_seen_at,
              i.occurrence_count,
              i.spike_detected_at::text AS spike_detected_at,
              i.resolved_at::text AS resolved_at,
              i.regressed_at::text AS regressed_at,
              COALESCE(i.matched_fields, ARRAY[]::text[]) AS matched_fields
          )
          SELECT
            updated.input_order,
            updated.incident_id,
            updated.project_id,
            p.name AS project_name,
            p.color_tag AS project_color_tag,
            updated.service_id,
            s.name AS service_name,
            updated.latest_deployment_id,
            updated.environment,
            updated.fingerprint,
            updated.fingerprint_version,
            updated.title,
            updated.severity,
            updated.status,
            updated.first_seen_at,
            updated.last_seen_at,
            updated.occurrence_count,
            updated.spike_detected_at,
            updated.resolved_at,
            updated.regressed_at,
            updated.matched_fields,
            primary_signal.event_type AS incident_reason_event_type,
            primary_signal.event_class AS incident_reason_event_class,
            primary_signal.level AS incident_reason_level
          FROM updated
          JOIN projects p ON p.id = updated.project_id
          LEFT JOIN services s ON s.id = updated.service_id
          LEFT JOIN LATERAL (
            SELECT ie.event_type, ie.event_class, ie.level
            FROM incident_events ie
            WHERE ie.incident_id = updated.incident_id::uuid
              AND ie.event_class = 'incident_signal'
            ORDER BY ie.occurred_at ASC, ie.event_id ASC
            LIMIT 1
          ) primary_signal ON TRUE
          ORDER BY updated.input_order ASC
        `,
        [
          input.organization_id,
          input.incident_ids,
          input.resolved_by_member_id,
          input.resolved_at,
          input.user_id ?? null
        ]
      );

      return result.rows.map((row) => mapIncidentRetrievalRow(row));
    },

    async reopenIncidentForOrganization(input) {
      const result = await db.query<IncidentRetrievalRow>(
        `
          WITH updated AS (
            UPDATE incidents i
            SET status = 'open',
                resolved_at = NULL,
                resolved_by_member_id = NULL,
                regressed_at = NULL,
                updated_at = now()
            FROM projects p
            WHERE i.project_id = p.id
              AND (
                (
                  $3::uuid IS NULL
                  AND p.organization_id = $1
                )
                OR (
                  $3::uuid IS NOT NULL
                  AND (
                    p.owner_user_id = $3::uuid
                    OR EXISTS (
                      SELECT 1
                      FROM project_members pm
                      WHERE pm.project_id = p.id
                        AND pm.user_id = $3::uuid
                    )
                  )
                )
              )
              AND i.id = $2
              AND i.status <> 'open'
            RETURNING
              i.id AS incident_id,
              i.project_id,
              i.service_id,
              i.latest_deployment_id::text AS latest_deployment_id,
              i.environment,
              i.fingerprint,
              i.fingerprint_version,
              i.title,
              i.severity,
              i.status,
              i.first_seen_at::text AS first_seen_at,
              i.last_seen_at::text AS last_seen_at,
              i.occurrence_count,
              i.spike_detected_at::text AS spike_detected_at,
              i.resolved_at::text AS resolved_at,
              i.regressed_at::text AS regressed_at,
              COALESCE(i.matched_fields, ARRAY[]::text[]) AS matched_fields
          )
          SELECT
            updated.incident_id,
            updated.project_id,
            p.name AS project_name,
            p.color_tag AS project_color_tag,
            updated.service_id,
            s.name AS service_name,
            updated.latest_deployment_id,
            updated.environment,
            updated.fingerprint,
            updated.fingerprint_version,
            updated.title,
            updated.severity,
            updated.status,
            updated.first_seen_at,
            updated.last_seen_at,
            updated.occurrence_count,
            updated.spike_detected_at,
            updated.resolved_at,
            updated.regressed_at,
            updated.matched_fields,
            primary_signal.event_type AS incident_reason_event_type,
            primary_signal.event_class AS incident_reason_event_class,
            primary_signal.level AS incident_reason_level
          FROM updated
          JOIN projects p ON p.id = updated.project_id
          LEFT JOIN services s ON s.id = updated.service_id
          LEFT JOIN LATERAL (
            SELECT ie.event_type, ie.event_class, ie.level
            FROM incident_events ie
            WHERE ie.incident_id = updated.incident_id::uuid
              AND ie.event_class = 'incident_signal'
            ORDER BY ie.occurred_at ASC, ie.event_id ASC
            LIMIT 1
          ) primary_signal ON TRUE
        `,
        [input.organization_id, input.incident_id, input.user_id ?? null]
      );

      return mapOptionalRow(result.rows[0], mapIncidentRetrievalRow);
    },

    async reopenIncidentsForOrganization(input) {
      const result = await db.query<IncidentRetrievalRow & { input_order: number }>(
        `
          WITH requested AS (
            SELECT incident_id, MIN(input_order)::int AS input_order
            FROM unnest($2::uuid[]) WITH ORDINALITY AS input_ids(incident_id, input_order)
            GROUP BY incident_id
          ),
          accessible AS (
            SELECT requested.incident_id, requested.input_order
            FROM requested
            JOIN incidents i ON i.id = requested.incident_id
            JOIN projects p ON p.id = i.project_id
            WHERE (
              (
                $3::uuid IS NULL
                AND p.organization_id = $1
              )
              OR (
                $3::uuid IS NOT NULL
                AND (
                  p.owner_user_id = $3::uuid
                  OR EXISTS (
                    SELECT 1
                    FROM project_members pm
                    WHERE pm.project_id = p.id
                      AND pm.user_id = $3::uuid
                  )
                )
              )
            )
          ),
          counts AS (
            SELECT
              (SELECT COUNT(*)::int FROM requested) AS requested_count,
              (SELECT COUNT(*)::int FROM accessible) AS accessible_count
          ),
          updated AS (
            UPDATE incidents i
            SET status = 'open',
                resolved_at = NULL,
                resolved_by_member_id = NULL,
                regressed_at = NULL,
                updated_at = now()
            FROM accessible a, counts c
            WHERE c.requested_count = c.accessible_count
              AND i.id = a.incident_id
            RETURNING
              a.input_order,
              i.id AS incident_id,
              i.project_id,
              i.service_id,
              i.latest_deployment_id::text AS latest_deployment_id,
              i.environment,
              i.fingerprint,
              i.fingerprint_version,
              i.title,
              i.severity,
              i.status,
              i.first_seen_at::text AS first_seen_at,
              i.last_seen_at::text AS last_seen_at,
              i.occurrence_count,
              i.spike_detected_at::text AS spike_detected_at,
              i.resolved_at::text AS resolved_at,
              i.regressed_at::text AS regressed_at,
              COALESCE(i.matched_fields, ARRAY[]::text[]) AS matched_fields
          )
          SELECT
            updated.input_order,
            updated.incident_id,
            updated.project_id,
            p.name AS project_name,
            p.color_tag AS project_color_tag,
            updated.service_id,
            s.name AS service_name,
            updated.latest_deployment_id,
            updated.environment,
            updated.fingerprint,
            updated.fingerprint_version,
            updated.title,
            updated.severity,
            updated.status,
            updated.first_seen_at,
            updated.last_seen_at,
            updated.occurrence_count,
            updated.spike_detected_at,
            updated.resolved_at,
            updated.regressed_at,
            updated.matched_fields,
            primary_signal.event_type AS incident_reason_event_type,
            primary_signal.event_class AS incident_reason_event_class,
            primary_signal.level AS incident_reason_level
          FROM updated
          JOIN projects p ON p.id = updated.project_id
          LEFT JOIN services s ON s.id = updated.service_id
          LEFT JOIN LATERAL (
            SELECT ie.event_type, ie.event_class, ie.level
            FROM incident_events ie
            WHERE ie.incident_id = updated.incident_id::uuid
              AND ie.event_class = 'incident_signal'
            ORDER BY ie.occurred_at ASC, ie.event_id ASC
            LIMIT 1
          ) primary_signal ON TRUE
          ORDER BY updated.input_order ASC
        `,
        [input.organization_id, input.incident_ids, input.user_id ?? null]
      );

      return result.rows.map((row) => mapIncidentRetrievalRow(row));
    }
  };
}
