import type {
  AnalyticsMetricsSegment,
  AnalyticsMetricsGranularity
} from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";
import type { AnalyticsUsageSummaryInput } from "./analytics-metrics-store.js";
export type AnalyticsSummaryTotalsRow = {
  sessions: unknown;
  pageviews: unknown;
  active_visitors: unknown;
  new_visitors: unknown;
  returning_visitors: unknown;
  exits: unknown;
};

export type AnalyticsConversionTotalsRow = {
  conversions: unknown;
};

export type AnalyticsActionMetricRow = {
  action_key: unknown;
  event_count: unknown;
  unique_sessions: unknown;
};

export type AnalyticsSegmentRow = {
  value: unknown;
  sessions: unknown;
  pageviews: unknown;
};

export type AnalyticsSegmentKey =
  | "device_types"
  | "browsers"
  | "os"
  | "languages"
  | "referrers"
  | "utm_sources"
  | "utm_mediums"
  | "utm_campaigns"
  | "auth_states";

export type AnalyticsRouteMetricRow = {
  route_key: unknown;
  pageviews: unknown;
  unique_sessions: unknown;
  entrances: unknown;
  exits: unknown;
  bounces: unknown;
  linked_incident_sessions: unknown;
};

export type AnalyticsJourneyPatternRow = {
  from_route_key: unknown;
  to_route_key: unknown;
  transition_count: unknown;
  unique_sessions: unknown;
  total_transitions: unknown;
};

export type AnalyticsJourneyPatternSampleRow = {
  transition_tag: unknown;
  sample_id: unknown;
};

export type AnalyticsFunnelStepMetricRow = {
  step_key: unknown;
  step_order: unknown;
  step_count: unknown;
  sessions_entered: unknown;
  sessions_completed: unknown;
  next_sessions_entered: unknown;
};

export type AnalyticsFunnelListRow = {
  funnel_key: unknown;
  sessions_entered: unknown;
  sessions_completed: unknown;
  dropoffs: unknown;
};

const DEFAULT_SEGMENT_LIMIT = 10;
const MAX_JOURNEY_PATTERN_SAMPLE_IDS = 3;

const SEGMENT_EXPRESSIONS: Record<AnalyticsSegmentKey, string> = {
  device_types: "COALESCE(NULLIF(device_type, ''), 'unknown')",
  browsers: "COALESCE(NULLIF(browser_family, ''), 'unknown')",
  os: "COALESCE(NULLIF(os_family, ''), 'unknown')",
  languages: "COALESCE(NULLIF(language, ''), 'unknown')",
  referrers: "COALESCE(NULLIF(dimensions->>'referrer_domain', ''), 'direct')",
  utm_sources: "COALESCE(NULLIF(dimensions->>'utm_source', ''), 'none')",
  utm_mediums: "COALESCE(NULLIF(dimensions->>'utm_medium', ''), 'none')",
  utm_campaigns: "COALESCE(NULLIF(dimensions->>'utm_campaign', ''), 'none')",
  auth_states: "COALESCE(NULLIF(auth_state, ''), 'unknown')"
};

export async function readSummaryTotals(
  db: Queryable,
  input: AnalyticsUsageSummaryInput
): Promise<{
  sessions: number;
  pageviews: number;
  active_visitors: number;
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
        COALESCE(SUM(active_visitors), 0)::bigint AS active_visitors,
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
    active_visitors: toNonNegativeInteger(row?.active_visitors),
    new_visitors: toNonNegativeInteger(row?.new_visitors),
    returning_visitors: toNonNegativeInteger(row?.returning_visitors),
    exits: toNonNegativeInteger(row?.exits)
  };
}

export async function readConversionTotal(
  db: Queryable,
  input: AnalyticsUsageSummaryInput
): Promise<number> {
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

export async function readSegments(
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

export async function readJourneyPatternSampleIds(
  db: Queryable,
  input: AnalyticsUsageSummaryInput,
  patterns: Array<{ from_route_key: string; to_route_key: string }>
): Promise<Map<string, string[]>> {
  if (patterns.length === 0) {
    return new Map();
  }

  const transitionTags = [
    ...new Set(
      patterns.map((pattern) => toTransitionTag(pattern.from_route_key, pattern.to_route_key))
    )
  ];
  const params: unknown[] = [
    input.project_id,
    new Date().toISOString(),
    transitionTags,
    input.from,
    input.to
  ];
  const filters = [
    "samples.project_id=ANY(debugbundle_project_origins($1::uuid))",
    "samples.expires_at > $2::timestamptz",
    "samples.last_seen_at >= $4::timestamptz",
    "samples.first_seen_at < $5::timestamptz",
    "samples.analysis_tags @> ARRAY[wanted.transition_tag]::text[]"
  ];

  if (input.origin_project_ids !== undefined) {
    params.push(input.origin_project_ids);
    filters.push(`samples.project_id=ANY($${params.length}::uuid[])`);
  }
  if (input.service !== undefined) {
    params.push(input.service);
    filters.push(
      `debugbundle_service_matches($1::uuid,samples.project_id,samples.service,$${params.length})`
    );
  }

  if (input.environment !== undefined) {
    params.push(input.environment);
    filters.push(`samples.environment = $${params.length}`);
  }

  const sampleDimensionFilters: Array<[string, unknown]> = [
    ["device_type", input.device_type],
    ["browser_family", input.browser],
    ["os_family", input.os],
    ["language", input.language],
    ["country_code", input.country],
    ["auth_state", input.auth_state],
    ["referrer_domain", input.referrer],
    ["utm_source", input.utm_source],
    ["utm_medium", input.utm_medium],
    ["utm_campaign", input.utm_campaign]
  ];
  for (const [key, value] of sampleDimensionFilters) {
    if (value !== undefined) {
      params.push(value);
      filters.push(`samples.dimensions_summary->>'${key}' = $${params.length}`);
    }
  }

  if (input.route !== undefined) {
    params.push(`route:${input.route}`);
    filters.push(`samples.analysis_tags @> ARRAY[$${params.length}]::text[]`);
  }

  for (const [key, value] of Object.entries(input.custom_dimensions ?? {}).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    params.push(key, value);
    filters.push(
      `jsonb_extract_path_text(samples.dimensions_summary, 'custom_dimensions', $${params.length - 1}::text) = $${params.length}`
    );
  }

  params.push(MAX_JOURNEY_PATTERN_SAMPLE_IDS);
  const result = await db.query<AnalyticsJourneyPatternSampleRow>(
    `
      WITH wanted_tags AS (
        SELECT unnest($3::text[]) AS transition_tag
      )
      SELECT transition_tag, sample_id
      FROM (
        SELECT
          wanted.transition_tag,
          samples.id::text AS sample_id,
          row_number() OVER (
            PARTITION BY wanted.transition_tag
            ORDER BY samples.last_seen_at DESC, samples.id DESC
          ) AS sample_rank
        FROM wanted_tags wanted
        JOIN analytics_journey_samples samples
          ON ${filters.join("\n          AND ")}
      ) ranked
      WHERE sample_rank <= $${params.length}
      ORDER BY transition_tag ASC, sample_rank ASC
    `,
    params
  );

  const sampleIdsByTransition = new Map<string, string[]>();
  for (const row of result.rows) {
    if (typeof row.transition_tag !== "string" || typeof row.sample_id !== "string") {
      continue;
    }
    sampleIdsByTransition.set(row.transition_tag, [
      ...(sampleIdsByTransition.get(row.transition_tag) ?? []),
      row.sample_id
    ]);
  }

  return sampleIdsByTransition;
}

export function buildAnalyticsRollupWhere(
  input: AnalyticsUsageSummaryInput,
  options: {
    extraConditions?: string[];
    extraParams?: unknown[];
    routeColumns?: string[];
  } = {}
): { sql: string; params: unknown[] } {
  const conditions = [
    "project_id=ANY(debugbundle_project_origins($1::uuid))",
    "bucket_start >= $2::timestamptz",
    "bucket_start < $3::timestamptz",
    "bucket_granularity = $4"
  ];
  const params: unknown[] = [input.project_id, input.from, input.to, input.granularity];

  if (input.origin_project_ids !== undefined) {
    params.push(input.origin_project_ids);
    conditions.push(`project_id=ANY($${params.length}::uuid[])`);
  }
  if (input.service !== undefined) {
    params.push(input.service);
    conditions.push(`debugbundle_service_matches($1::uuid,project_id,service,$${params.length})`);
  }

  if (input.environment !== undefined) {
    params.push(input.environment);
    conditions.push(`environment = $${params.length}`);
  }

  const scalarFilters: Array<[string, unknown]> = [
    ["device_type", input.device_type],
    ["browser_family", input.browser],
    ["os_family", input.os],
    ["language", input.language],
    ["country_code", input.country],
    ["auth_state", input.auth_state]
  ];
  for (const [column, value] of scalarFilters) {
    if (value !== undefined) {
      params.push(value);
      conditions.push(`${column} = $${params.length}`);
    }
  }

  const dimensionFilters: Array<[string, unknown]> = [
    ["referrer_domain", input.referrer],
    ["utm_source", input.utm_source],
    ["utm_medium", input.utm_medium],
    ["utm_campaign", input.utm_campaign]
  ];
  for (const [key, value] of dimensionFilters) {
    if (value !== undefined) {
      params.push(value);
      conditions.push(`dimensions->>'${key}' = $${params.length}`);
    }
  }

  for (const [key, value] of Object.entries(input.custom_dimensions ?? {}).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    params.push(key, value);
    conditions.push(
      `jsonb_extract_path_text(dimensions, 'custom_dimensions', $${params.length - 1}::text) = $${params.length}`
    );
  }

  const route = "route" in input && typeof input.route === "string" ? input.route : undefined;
  if (
    route !== undefined &&
    options.routeColumns !== undefined &&
    options.routeColumns.length > 0
  ) {
    params.push(route);
    const placeholder = `$${params.length}`;
    conditions.push(
      `(${options.routeColumns.map((column) => `${column} = ${placeholder}`).join(" OR ")})`
    );
  }

  for (const extraParam of options.extraParams ?? []) {
    params.push(extraParam);
  }

  for (const condition of options.extraConditions ?? []) {
    conditions.push(condition);
  }

  return {
    sql: `WHERE ${conditions.join("\n        AND ")}`,
    params
  };
}

export async function buildWindow(
  db: Queryable,
  input: AnalyticsUsageSummaryInput
): Promise<{
  project_id: string;
  from: string;
  to: string;
  granularity: AnalyticsMetricsGranularity;
  service: string | null;
  environment: string | null;
  origin_scope?: {
    origin_project_ids: string[];
    unique_count_semantics: "sum_of_origin_scoped_counts";
  };
}> {
  return {
    ...(await readAnalyticsOriginScope(db, input.project_id, input.origin_project_ids)),
    project_id: input.project_id,
    from: input.from,
    to: input.to,
    granularity: input.granularity,
    service: input.service ?? null,
    environment: input.environment ?? null
  };
}

export function normalizeLimit(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_SEGMENT_LIMIT;
  }

  return Math.min(100, Math.max(1, Math.trunc(value)));
}

export function toNonNegativeInteger(value: unknown): number {
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

export function toNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

export function toConversionRate(completed: number, entered: number): number {
  return entered > 0 ? Math.min(1, Math.max(0, completed / entered)) : 0;
}

export function toActionMetricKind(actionKey: string): "action" | "conversion" | "marker" {
  if (actionKey.startsWith("conversion:")) {
    return "conversion";
  }
  if (actionKey.startsWith("marker:")) {
    return "marker";
  }
  return "action";
}

export function toTransitionTag(fromRouteKey: string, toRouteKey: string): string {
  return `transition:${fromRouteKey}->${toRouteKey}`.slice(0, 120);
}

export async function readAnalyticsOriginScope(
  db: Queryable,
  projectId: string,
  originIds?: string[]
): Promise<{
  origin_scope?: {
    origin_project_ids: string[];
    unique_count_semantics: "sum_of_origin_scoped_counts";
  };
}> {
  const result = await db.query<{ origin_ids: string[] }>(
    "SELECT debugbundle_project_origins($1::uuid)::text[] AS origin_ids",
    [projectId]
  );
  const current = result.rows[0]?.origin_ids;
  const ids = current?.filter((id) => originIds === undefined || originIds.includes(id));
  return Array.isArray(ids) && ids.length > 0 && (current?.length ?? 0) > 1
    ? {
        origin_scope: {
          origin_project_ids: ids,
          unique_count_semantics: "sum_of_origin_scoped_counts"
        }
      }
    : {};
}
