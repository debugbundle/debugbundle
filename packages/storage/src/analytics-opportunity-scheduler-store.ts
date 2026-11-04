import type { Queryable } from "./types.js";

const ANALYTICS_OPPORTUNITY_LOOKBACK_DAYS = 7;

export interface AnalyticsOpportunitySchedulerStore {
  listProjectsForOpportunityEvaluation(input: {
    cursor: string | null;
    limit: number;
    occurred_at: string;
  }): Promise<string[]>;
}

export function createPostgresAnalyticsOpportunitySchedulerStore(
  db: Queryable
): AnalyticsOpportunitySchedulerStore {
  return {
    async listProjectsForOpportunityEvaluation(input): Promise<string[]> {
      const window = buildOpportunityEvaluationWindow(input.occurred_at);
      if (window === null) {
        return [];
      }

      const result = await db.query<{ project_id: string }>(
        `
          SELECT origin.id::text AS project_id
          FROM projects origin JOIN project_analytics_settings settings
            ON settings.project_id=debugbundle_canonical_project(origin.id)
          WHERE settings.enabled = true
            AND ($1::uuid IS NULL OR origin.id > $1::uuid)
            AND EXISTS (
              SELECT 1
              FROM analytics_session_rollups rollup
              WHERE rollup.project_id = origin.id
                AND rollup.bucket_granularity = 'day'
                AND rollup.bucket_start >= $2::timestamptz
                AND rollup.bucket_start < $3::timestamptz
            )
          ORDER BY origin.id ASC
          LIMIT $4
        `,
        [input.cursor, window.from, window.to, input.limit]
      );

      return result.rows
        .map((row) => row.project_id)
        .filter((projectId) => typeof projectId === "string" && projectId.length > 0);
    }
  };
}

function buildOpportunityEvaluationWindow(occurredAt: string): { from: string; to: string } | null {
  const parsed = Date.parse(occurredAt);
  if (Number.isNaN(parsed)) {
    return null;
  }

  const anchor = new Date(parsed);
  const dayStart = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate());
  return {
    from: new Date(
      dayStart - (ANALYTICS_OPPORTUNITY_LOOKBACK_DAYS - 1) * 24 * 60 * 60 * 1000
    ).toISOString(),
    to: new Date(dayStart + 24 * 60 * 60 * 1000).toISOString()
  };
}
