import type { PostgresMetadataStore, Queryable, WeeklyProjectReportSummary } from "./types.js";

export function createMetadataWeeklyReports(
  db: Queryable
): Pick<PostgresMetadataStore, "listProjectsWithWeeklyActivity" | "getWeeklyProjectReport"> {
  return {
    async listProjectsWithWeeklyActivity(input): Promise<string[]> {
      const result = await db.query<{ project_id: string } & Record<string, unknown>>(
        `
          SELECT DISTINCT activity.project_id
          FROM (
            SELECT bg.project_id::text AS project_id
            FROM bundle_generations bg
            WHERE bg.created_at >= $1::timestamptz
              AND bg.created_at < $2::timestamptz

            UNION

            SELECT i.project_id::text AS project_id
            FROM incidents i
            WHERE i.first_seen_at >= $1::timestamptz
              AND i.first_seen_at < $2::timestamptz

            UNION

            SELECT i.project_id::text AS project_id
            FROM incidents i
            WHERE i.regressed_at IS NOT NULL
              AND i.regressed_at >= $1::timestamptz
              AND i.regressed_at < $2::timestamptz

            UNION

            SELECT i.project_id::text AS project_id
            FROM incidents i
            WHERE i.resolved_at IS NOT NULL
              AND i.resolved_at >= $1::timestamptz
              AND i.resolved_at < $2::timestamptz

            UNION

            SELECT i.project_id::text AS project_id
            FROM incidents i
            WHERE i.spike_detected_at IS NOT NULL
              AND i.spike_detected_at >= $1::timestamptz
              AND i.spike_detected_at < $2::timestamptz
          ) AS activity
          ORDER BY activity.project_id ASC
          LIMIT $3
        `,
        [input.window_start, input.window_end, input.limit]
      );

      return result.rows.map((row) => row.project_id);
    },

    async getWeeklyProjectReport(input): Promise<WeeklyProjectReportSummary | null> {
      const result = await db.query<
        {
          project_id: string;
          project_name: string;
          window_start: string;
          window_end: string;
          failure_bundles: number;
          improvement_bundles: number;
          new_incidents: number;
          resolved_incidents: number;
          opened_incidents_resolved: number;
          regressions: number;
          top_spiking_incidents: WeeklyProjectReportSummary["top_spiking_incidents"];
        } & Record<string, unknown>
      >(
        `
          WITH activity AS (
            SELECT 1
            FROM bundle_generations bg
            WHERE bg.project_id = $1::uuid
              AND bg.created_at >= $2::timestamptz
              AND bg.created_at < $3::timestamptz

            UNION ALL

            SELECT 1
            FROM incidents i
            WHERE i.project_id = $1::uuid
              AND i.first_seen_at >= $2::timestamptz
              AND i.first_seen_at < $3::timestamptz

            UNION ALL

            SELECT 1
            FROM incidents i
            WHERE i.project_id = $1::uuid
              AND i.regressed_at IS NOT NULL
              AND i.regressed_at >= $2::timestamptz
              AND i.regressed_at < $3::timestamptz

            UNION ALL

            SELECT 1
            FROM incidents i
            WHERE i.project_id = $1::uuid
              AND i.resolved_at IS NOT NULL
              AND i.resolved_at >= $2::timestamptz
              AND i.resolved_at < $3::timestamptz

            UNION ALL

            SELECT 1
            FROM incidents i
            WHERE i.project_id = $1::uuid
              AND i.spike_detected_at IS NOT NULL
              AND i.spike_detected_at >= $2::timestamptz
              AND i.spike_detected_at < $3::timestamptz
            LIMIT 1
          ),
          top_spikes AS (
            SELECT
              i.id::text AS incident_id,
              i.title,
              i.occurrence_count,
              i.spike_detected_at::text AS spike_detected_at
            FROM incidents i
            WHERE i.project_id = $1::uuid
              AND i.spike_detected_at IS NOT NULL
              AND i.spike_detected_at >= $2::timestamptz
              AND i.spike_detected_at < $3::timestamptz
            ORDER BY i.occurrence_count DESC, i.spike_detected_at DESC, i.id ASC
            LIMIT 5
          )
          SELECT
            $1::text AS project_id,
            p.name AS project_name,
            p.color_tag AS project_color_tag,
            $2::timestamptz::text AS window_start,
            $3::timestamptz::text AS window_end,
            COALESCE((
              SELECT COUNT(*)::integer
              FROM bundle_generations bg
              WHERE bg.project_id = $1::uuid
                AND bg.bundle_type = 'failure'
                AND bg.created_at >= $2::timestamptz
                AND bg.created_at < $3::timestamptz
            ), 0) AS failure_bundles,
            COALESCE((
              SELECT COUNT(*)::integer
              FROM bundle_generations bg
              WHERE bg.project_id = $1::uuid
                AND bg.bundle_type = 'improvement'
                AND bg.created_at >= $2::timestamptz
                AND bg.created_at < $3::timestamptz
            ), 0) AS improvement_bundles,
            COALESCE((
              SELECT COUNT(*)::integer
              FROM incidents i
              WHERE i.project_id = $1::uuid
                AND i.first_seen_at >= $2::timestamptz
                AND i.first_seen_at < $3::timestamptz
            ), 0) AS new_incidents,
            COALESCE((
              SELECT COUNT(*)::integer
              FROM incidents i
              WHERE i.project_id = $1::uuid
                AND i.resolved_at IS NOT NULL
                AND i.resolved_at >= $2::timestamptz
                AND i.resolved_at < $3::timestamptz
            ), 0) AS resolved_incidents,
            COALESCE((
              SELECT COUNT(*)::integer
              FROM incidents i
              WHERE i.project_id = $1::uuid
                AND i.first_seen_at >= $2::timestamptz
                AND i.first_seen_at < $3::timestamptz
                AND i.resolved_at IS NOT NULL
                AND i.resolved_at >= $2::timestamptz
                AND i.resolved_at < $3::timestamptz
            ), 0) AS opened_incidents_resolved,
            COALESCE((
              SELECT COUNT(*)::integer
              FROM incidents i
              WHERE i.project_id = $1::uuid
                AND i.regressed_at IS NOT NULL
                AND i.regressed_at >= $2::timestamptz
                AND i.regressed_at < $3::timestamptz
            ), 0) AS regressions,
            COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'incident_id', top_spikes.incident_id,
                  'title', top_spikes.title,
                  'occurrence_count', top_spikes.occurrence_count,
                  'spike_detected_at', top_spikes.spike_detected_at
                )
                ORDER BY top_spikes.occurrence_count DESC, top_spikes.spike_detected_at DESC, top_spikes.incident_id ASC
              )
              FROM top_spikes
            ), '[]'::jsonb) AS top_spiking_incidents
          FROM activity
          JOIN projects p ON p.id = $1::uuid
          LIMIT 1
        `,
        [input.project_id, input.window_start, input.window_end]
      );

      const row = result.rows[0];
      if (row === undefined) {
        return null;
      }

      return {
        project_id: row.project_id,
        project_name: row.project_name,
        window_start: row.window_start,
        window_end: row.window_end,
        bundle_counts: {
          failure: row.failure_bundles,
          improvement: row.improvement_bundles
        },
        new_incidents: row.new_incidents,
        resolved_incidents: row.resolved_incidents,
        opened_incidents_resolved: row.opened_incidents_resolved,
        regressions: row.regressions,
        top_spiking_incidents: row.top_spiking_incidents ?? []
      };
    }
  };
}
