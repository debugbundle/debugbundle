import type {
  IncidentLogRecord,
  IncidentRetrievalRecord,
  PostgresMetadataStore,
  Queryable
} from "./types.js";
import { type IncidentRetrievalRow, mapIncidentRetrievalRow } from "./metadata-incident-shared.js";
import { mapOptionalRow } from "./metadata-shared.js";

export function createMetadataIncidentRead(
  db: Queryable
): Pick<
  PostgresMetadataStore,
  | "listIncidentsForOrganization"
  | "getIncidentForOrganization"
  | "listIncidentLogsForOrganization"
  | "getBundleFailureReasonForOrganization"
  | "getBundleSourceForOrganization"
> {
  return {
    async listIncidentsForOrganization(input): Promise<IncidentRetrievalRecord[]> {
      const params: unknown[] = [input.organization_id, input.user_id ?? null];
      const conditions = [
        `(
          (
            $2::uuid IS NULL
            AND p.organization_id = $1::uuid
          )
          OR (
            $2::uuid IS NOT NULL
            AND (
              p.owner_user_id = $2::uuid
              OR EXISTS (
                SELECT 1
                FROM project_members pm
                WHERE pm.project_id = p.id
                  AND pm.user_id = $2::uuid
              )
            )
          )
        )`
      ];

      if (input.project_id !== undefined) {
        params.push(input.project_id);
        conditions.push(`i.project_id = $${params.length}`);
      }

      if (input.environment !== undefined) {
        params.push(input.environment);
        conditions.push(`i.environment = $${params.length}`);
      }

      if (input.service !== undefined) {
        params.push(input.service);
        conditions.push(`s.name = $${params.length}`);
      }

      if (input.status === "active") {
        conditions.push(`i.status IN ('open', 'regressed')`);
      } else if (input.status !== undefined) {
        params.push(input.status);
        conditions.push(`i.status = $${params.length}`);
      }

      if (input.severity !== undefined) {
        params.push(input.severity);
        conditions.push(`i.severity = $${params.length}`);
      }

      if (input.first_seen_after !== undefined) {
        params.push(input.first_seen_after);
        conditions.push(`i.first_seen_at >= $${params.length}::timestamptz`);
      }

      if (input.attention_after !== undefined) {
        params.push(input.attention_after);
        const attentionAfterIndex = params.length;
        conditions.push(
          `(
            i.first_seen_at >= $${attentionAfterIndex}::timestamptz
            OR (
              i.regressed_at IS NOT NULL
              AND i.regressed_at >= $${attentionAfterIndex}::timestamptz
            )
          )`
        );
      }

      if (input.cursor !== undefined) {
        params.push(input.cursor.last_seen_at);
        const lastSeenAtIndex = params.length;
        params.push(input.cursor.incident_id);
        const incidentIdIndex = params.length;
        conditions.push(
          `(i.last_seen_at < $${lastSeenAtIndex} OR (i.last_seen_at = $${lastSeenAtIndex} AND i.id < $${incidentIdIndex}))`
        );
      }

      params.push(input.limit);
      const limitIndex = params.length;

      const result = await db.query<IncidentRetrievalRow>(
        `
          SELECT
            i.id AS incident_id,
            i.project_id,
            p.name AS project_name,
            p.color_tag AS project_color_tag,
            i.service_id,
            s.name AS service_name,
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
            COALESCE(i.matched_fields, ARRAY[]::text[]) AS matched_fields,
            primary_signal.event_type AS incident_reason_event_type,
            primary_signal.event_class AS incident_reason_event_class,
            primary_signal.level AS incident_reason_level
          FROM incidents i
          JOIN projects p ON p.id = i.project_id
          LEFT JOIN services s ON s.id = i.service_id
          LEFT JOIN LATERAL (
            SELECT ie.event_type, ie.event_class, ie.level
            FROM incident_events ie
            WHERE ie.incident_id = i.id
              AND ie.event_class = 'incident_signal'
            ORDER BY ie.occurred_at ASC, ie.event_id ASC
            LIMIT 1
          ) primary_signal ON TRUE
          WHERE ${conditions.join("\n            AND ")}
          ORDER BY i.last_seen_at DESC, i.id DESC
          LIMIT $${limitIndex}
        `,
        params
      );

      return result.rows.map(mapIncidentRetrievalRow);
    },

    async getIncidentForOrganization(input): Promise<IncidentRetrievalRecord | null> {
      const result = await db.query<IncidentRetrievalRow>(
        `
          SELECT
            i.id AS incident_id,
            i.project_id,
            p.name AS project_name,
            p.color_tag AS project_color_tag,
            i.service_id,
            s.name AS service_name,
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
            COALESCE(i.matched_fields, ARRAY[]::text[]) AS matched_fields,
            primary_signal.event_type AS incident_reason_event_type,
            primary_signal.event_class AS incident_reason_event_class,
            primary_signal.level AS incident_reason_level
          FROM incidents i
          JOIN projects p ON p.id = i.project_id
          LEFT JOIN services s ON s.id = i.service_id
          LEFT JOIN LATERAL (
            SELECT ie.event_type, ie.event_class, ie.level
            FROM incident_events ie
            WHERE ie.incident_id = i.id
              AND ie.event_class = 'incident_signal'
            ORDER BY ie.occurred_at ASC, ie.event_id ASC
            LIMIT 1
          ) primary_signal ON TRUE
          WHERE i.id = $2
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
          LIMIT 1
        `,
        [input.organization_id, input.incident_id, input.user_id ?? null]
      );

      return mapOptionalRow(result.rows[0], mapIncidentRetrievalRow);
    },

    async listIncidentLogsForOrganization(input): Promise<IncidentLogRecord[]> {
      const cursorOccurredAt = input.cursor?.occurred_at ?? null;
      const cursorEventId = input.cursor?.event_id ?? null;
      const level = input.level ?? null;

      const result = await db.query<IncidentLogRecord>(
        `
          SELECT
            ie.event_id,
            ie.event_type,
            ie.occurred_at::text AS occurred_at,
            ie.is_sampled,
            ie.level
          FROM incident_events ie
          JOIN incidents i ON i.id = ie.incident_id
          JOIN projects p ON p.id = i.project_id
          WHERE i.id = $1
            AND (
              (
                $7::uuid IS NULL
                AND p.organization_id = $2
              )
              OR (
                $7::uuid IS NOT NULL
                AND (
                  p.owner_user_id = $7::uuid
                  OR EXISTS (
                    SELECT 1
                    FROM project_members pm
                    WHERE pm.project_id = p.id
                      AND pm.user_id = $7::uuid
                  )
                )
              )
            )
            AND ($3::text IS NULL OR ie.level = $3)
            AND (
              $4::timestamptz IS NULL
              OR (ie.occurred_at, ie.event_id) < ($4::timestamptz, $5::uuid)
            )
          ORDER BY ie.occurred_at DESC
          LIMIT $6
        `,
        [
          input.incident_id,
          input.organization_id,
          level,
          cursorOccurredAt,
          cursorEventId,
          input.limit,
          input.user_id ?? null
        ]
      );

      return result.rows;
    },

    async getBundleFailureReasonForOrganization(input): Promise<string | null> {
      const result = await db.query<{ bundle_failure_reason: string | null }>(
        `
          SELECT i.bundle_failure_reason
          FROM incidents i
          JOIN projects p ON p.id = i.project_id
          WHERE p.organization_id = $1
            AND i.id = $2
          LIMIT 1
        `,
        [input.organization_id, input.incident_id]
      );

      return result.rows[0]?.bundle_failure_reason ?? null;
    },

    async getBundleSourceForOrganization(input: {
      organization_id: string;
      incident_id: string;
    }): Promise<{
      event_id: string;
      occurred_at: string;
      occurrence_count: number;
      trigger: string;
    } | null> {
      const result = await db.query<{
        event_id: string;
        occurred_at: string;
        occurrence_count: number;
        trigger: string;
      }>(
        `
          SELECT
            COALESCE(i.bundle_source_event_id, fallback_event.event_id)::text AS event_id,
            COALESCE(i.bundle_source_occurred_at, fallback_event.occurred_at)::text AS occurred_at,
            i.occurrence_count,
            COALESCE(i.bundle_trigger, 'regeneration') AS trigger
          FROM incidents i
          JOIN projects p ON p.id = i.project_id
          LEFT JOIN LATERAL (
            SELECT
              ie.event_id,
              ie.occurred_at
            FROM incident_events ie
            WHERE ie.incident_id = i.id
            ORDER BY
              (ie.event_class = 'incident_signal') DESC,
              ie.is_sampled DESC,
              ie.occurred_at DESC,
              ie.event_id DESC
            LIMIT 1
          ) fallback_event ON TRUE
          WHERE p.organization_id = $1
            AND i.id = $2
            AND COALESCE(i.bundle_source_event_id, fallback_event.event_id) IS NOT NULL
          LIMIT 1
        `,
        [input.organization_id, input.incident_id]
      );

      return result.rows[0] ?? null;
    }
  };
}
