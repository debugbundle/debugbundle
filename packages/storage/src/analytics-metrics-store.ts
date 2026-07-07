import {
  AnalyticsUsageSummaryResponseSchema,
  type AnalyticsMetricsGranularity,
  type AnalyticsMetricsSegment,
  type AnalyticsUsageSummaryResponse
} from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";

export interface AnalyticsUsageSummaryInput {
  project_id: string;
  from: string;
  to: string;
  granularity: AnalyticsMetricsGranularity;
  service?: string | undefined;
  environment?: string | undefined;
  limit?: number | undefined;
}

export interface AnalyticsMetricsStore {
  getUsageSummary(input: AnalyticsUsageSummaryInput): Promise<AnalyticsUsageSummaryResponse>;
}

type AnalyticsSummaryTotalsRow = {
  sessions: unknown;
  pageviews: unknown;
  new_visitors: unknown;
  returning_visitors: unknown;
  exits: unknown;
};

type AnalyticsConversionTotalsRow = {
  conversions: unknown;
};

type AnalyticsSegmentRow = {
  value: unknown;
  sessions: unknown;
  pageviews: unknown;
};

type AnalyticsSegmentKey =
  | "device_types"
  | "browsers"
  | "os"
  | "languages"
  | "referrers"
  | "auth_states";

const DEFAULT_SEGMENT_LIMIT = 10;

const SEGMENT_EXPRESSIONS: Record<AnalyticsSegmentKey, string> = {
  device_types: "COALESCE(NULLIF(device_type, ''), 'unknown')",
  browsers: "COALESCE(NULLIF(browser_family, ''), 'unknown')",
  os: "COALESCE(NULLIF(os_family, ''), 'unknown')",
  languages: "COALESCE(NULLIF(language, ''), 'unknown')",
  referrers: "COALESCE(NULLIF(dimensions->>'referrer_domain', ''), 'direct')",
  auth_states: "COALESCE(NULLIF(auth_state, ''), 'unknown')"
};

export function createPostgresAnalyticsMetricsStore(db: Queryable): AnalyticsMetricsStore {
  return {
    async getUsageSummary(input) {
      const limit = normalizeLimit(input.limit);
      const totals = await readSummaryTotals(db, input);
      const conversions = await readConversionTotal(db, input);

      const [
        deviceTypes,
        browsers,
        os,
        languages,
        referrers,
        authStates
      ] = await Promise.all([
        readSegments(db, input, "device_types", limit),
        readSegments(db, input, "browsers", limit),
        readSegments(db, input, "os", limit),
        readSegments(db, input, "languages", limit),
        readSegments(db, input, "referrers", limit),
        readSegments(db, input, "auth_states", limit)
      ]);

      return AnalyticsUsageSummaryResponseSchema.parse({
        summary: {
          project_id: input.project_id,
          from: input.from,
          to: input.to,
          granularity: input.granularity,
          service: input.service ?? null,
          environment: input.environment ?? null,
          sessions: totals.sessions,
          pageviews: totals.pageviews,
          active_visitors: totals.new_visitors + totals.returning_visitors,
          new_visitors: totals.new_visitors,
          returning_visitors: totals.returning_visitors,
          exits: totals.exits,
          conversions
        },
        breakdowns: {
          device_types: deviceTypes,
          browsers,
          os,
          languages,
          referrers,
          auth_states: authStates
        }
      });
    }
  };
}

async function readSummaryTotals(
  db: Queryable,
  input: AnalyticsUsageSummaryInput
): Promise<{
  sessions: number;
  pageviews: number;
  new_visitors: number;
  returning_visitors: number;
  exits: number;
}> {
  const where = buildAnalyticsRollupWhere(input);
  const result = await db.query<AnalyticsSummaryTotalsRow>(
    `
      SELECT
        COALESCE(SUM(sessions), 0)::bigint AS sessions,
        COALESCE(SUM(total_pageviews), 0)::bigint AS pageviews,
        COALESCE(SUM(new_visitors), 0)::bigint AS new_visitors,
        COALESCE(SUM(returning_visitors), 0)::bigint AS returning_visitors,
        COALESCE(SUM(exits), 0)::bigint AS exits
      FROM analytics_session_rollups
      ${where.sql}
    `,
    where.params
  );
  const row = result.rows[0];

  return {
    sessions: toNonNegativeInteger(row?.sessions),
    pageviews: toNonNegativeInteger(row?.pageviews),
    new_visitors: toNonNegativeInteger(row?.new_visitors),
    returning_visitors: toNonNegativeInteger(row?.returning_visitors),
    exits: toNonNegativeInteger(row?.exits)
  };
}

async function readConversionTotal(db: Queryable, input: AnalyticsUsageSummaryInput): Promise<number> {
  const where = buildAnalyticsRollupWhere(input, {
    extraConditions: ["action_key LIKE 'conversion:%'"]
  });
  const result = await db.query<AnalyticsConversionTotalsRow>(
    `
      SELECT COALESCE(SUM(event_count), 0)::bigint AS conversions
      FROM analytics_action_rollups
      ${where.sql}
    `,
    where.params
  );

  return toNonNegativeInteger(result.rows[0]?.conversions);
}

async function readSegments(
  db: Queryable,
  input: AnalyticsUsageSummaryInput,
  key: AnalyticsSegmentKey,
  limit: number
): Promise<AnalyticsMetricsSegment[]> {
  const where = buildAnalyticsRollupWhere(input);
  const expression = SEGMENT_EXPRESSIONS[key];
  const result = await db.query<AnalyticsSegmentRow>(
    `
      SELECT
        ${expression} AS value,
        COALESCE(SUM(sessions), 0)::bigint AS sessions,
        COALESCE(SUM(total_pageviews), 0)::bigint AS pageviews
      FROM analytics_session_rollups
      ${where.sql}
      GROUP BY value
      HAVING COALESCE(SUM(sessions), 0) > 0 OR COALESCE(SUM(total_pageviews), 0) > 0
      ORDER BY sessions DESC, value ASC
      LIMIT $${where.params.length + 1}
    `,
    [...where.params, limit]
  );

  return result.rows.map((row) => ({
    value: typeof row.value === "string" && row.value.trim().length > 0 ? row.value : "unknown",
    sessions: toNonNegativeInteger(row.sessions),
    pageviews: toNonNegativeInteger(row.pageviews)
  }));
}

function buildAnalyticsRollupWhere(
  input: AnalyticsUsageSummaryInput,
  options: { extraConditions?: string[] } = {}
): { sql: string; params: unknown[] } {
  const conditions = [
    "project_id = $1",
    "bucket_start >= $2::timestamptz",
    "bucket_start < $3::timestamptz",
    "bucket_granularity = $4"
  ];
  const params: unknown[] = [input.project_id, input.from, input.to, input.granularity];

  if (input.service !== undefined) {
    params.push(input.service);
    conditions.push(`service = $${params.length}`);
  }

  if (input.environment !== undefined) {
    params.push(input.environment);
    conditions.push(`environment = $${params.length}`);
  }

  for (const condition of options.extraConditions ?? []) {
    conditions.push(condition);
  }

  return {
    sql: `WHERE ${conditions.join("\n        AND ")}`,
    params
  };
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_SEGMENT_LIMIT;
  }

  return Math.min(100, Math.max(1, Math.trunc(value)));
}

function toNonNegativeInteger(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "bigint") {
    return Number(value < 0n ? 0n : value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  }

  return 0;
}
