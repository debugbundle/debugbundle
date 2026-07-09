import type { AnalyticsJourneySampleMetadata } from "../../shared-types/src/analytics-journey-samples.js";
import type { Queryable } from "./types.js";

export type AnalyticsJourneySampleRecord = AnalyticsJourneySampleMetadata & {
  object_key: string;
};

export interface AnalyticsJourneySamplesCursor {
  last_seen_at: string;
  sample_id: string;
}

export interface AnalyticsJourneySampleStore {
  listAnalyticsJourneySamplesForProject(input: {
    project_id: string;
    service?: string | undefined;
    environment?: string | undefined;
    tag?: string | undefined;
    cursor?: AnalyticsJourneySamplesCursor | undefined;
    limit: number;
    now: string;
  }): Promise<{ samples: AnalyticsJourneySampleRecord[]; next_cursor: string | null }>;
  getAnalyticsJourneySampleForProject(input: {
    project_id: string;
    sample_id: string;
    now: string;
  }): Promise<AnalyticsJourneySampleRecord | null>;
}

type AnalyticsJourneySampleRow = {
  sample_id: string;
  project_id: string;
  service: string;
  environment: string;
  session_id_hash: string;
  visitor_id_hash: string | null;
  analysis_tags: string[];
  first_seen_at: string;
  last_seen_at: string;
  dimensions_summary: Record<string, unknown>;
  object_key: string;
  expires_at: string;
  created_at: string;
};

export function buildAnalyticsJourneySamplesCursor(input: {
  last_seen_at: string;
  sample_id: string;
}): string {
  return `${input.last_seen_at}|${input.sample_id}`;
}

export function createPostgresAnalyticsJourneySampleStore(db: Queryable): AnalyticsJourneySampleStore {
  function toRecord(row: AnalyticsJourneySampleRow): AnalyticsJourneySampleRecord {
    return {
      sample_id: row.sample_id,
      project_id: row.project_id,
      service: row.service === "" ? null : row.service,
      environment: row.environment === "" ? null : row.environment,
      session_id_hash: row.session_id_hash,
      visitor_id_hash: row.visitor_id_hash,
      analysis_tags: row.analysis_tags,
      first_seen_at: row.first_seen_at,
      last_seen_at: row.last_seen_at,
      dimensions_summary: row.dimensions_summary,
      has_artifact: true,
      object_key: row.object_key,
      expires_at: row.expires_at,
      created_at: row.created_at
    };
  }

  async function listAnalyticsJourneySamplesForProject(input: {
    project_id: string;
    service?: string | undefined;
    environment?: string | undefined;
    tag?: string | undefined;
    cursor?: AnalyticsJourneySamplesCursor | undefined;
    limit: number;
    now: string;
  }): Promise<{ samples: AnalyticsJourneySampleRecord[]; next_cursor: string | null }> {
    const params: unknown[] = [input.project_id, input.now];
    const where = ["project_id = $1::uuid", "expires_at > $2::timestamptz"];

    if (input.service !== undefined) {
      params.push(input.service);
      where.push(`service = $${params.length}`);
    }
    if (input.environment !== undefined) {
      params.push(input.environment);
      where.push(`environment = $${params.length}`);
    }
    if (input.tag !== undefined) {
      params.push(input.tag);
      where.push(`analysis_tags @> ARRAY[$${params.length}]::text[]`);
    }
    if (input.cursor !== undefined) {
      params.push(input.cursor.last_seen_at, input.cursor.sample_id);
      where.push(`(last_seen_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
    }

    params.push(input.limit + 1);
    const result = await db.query<AnalyticsJourneySampleRow>(
      `
        SELECT
          id::text AS sample_id,
          project_id::text AS project_id,
          service,
          environment,
          session_id_hash,
          visitor_id_hash,
          analysis_tags,
          first_seen_at::text AS first_seen_at,
          last_seen_at::text AS last_seen_at,
          dimensions_summary,
          s3_object_key AS object_key,
          expires_at::text AS expires_at,
          created_at::text AS created_at
        FROM analytics_journey_samples
        WHERE ${where.join("\n          AND ")}
        ORDER BY last_seen_at DESC, id DESC
        LIMIT $${params.length}
      `,
      params
    );

    const records = result.rows.map(toRecord);
    const visible = records.slice(0, input.limit);
    const overflow = records[input.limit];
    const lastVisible = visible.at(-1);

    return {
      samples: visible,
      next_cursor: overflow === undefined || lastVisible === undefined
        ? null
        : buildAnalyticsJourneySamplesCursor({
            last_seen_at: lastVisible.last_seen_at,
            sample_id: lastVisible.sample_id
          })
    };
  }

  return {
    listAnalyticsJourneySamplesForProject,

    async getAnalyticsJourneySampleForProject(input) {
      const result = await db.query<AnalyticsJourneySampleRow>(
        `
          SELECT
            id::text AS sample_id,
            project_id::text AS project_id,
            service,
            environment,
            session_id_hash,
            visitor_id_hash,
            analysis_tags,
            first_seen_at::text AS first_seen_at,
            last_seen_at::text AS last_seen_at,
            dimensions_summary,
            s3_object_key AS object_key,
            expires_at::text AS expires_at,
            created_at::text AS created_at
          FROM analytics_journey_samples
          WHERE project_id = $1::uuid
            AND id = $2::uuid
            AND expires_at > $3::timestamptz
        `,
        [input.project_id, input.sample_id, input.now]
      );

      return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
    }
  };
}
