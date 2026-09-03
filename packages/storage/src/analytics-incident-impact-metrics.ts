import {
  AnalyticsIncidentImpactResponseSchema,
  type AnalyticsIncidentImpactResponse,
  type AnalyticsMetricsGranularity
} from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";

export interface AnalyticsIncidentImpactInput {
  project_id: string;
  incident_id: string;
  from: string;
  to: string;
  granularity: AnalyticsMetricsGranularity;
  service?: string | undefined;
  environment?: string | undefined;
  route?: string | undefined;
  device_type?: string | undefined;
  browser?: string | undefined;
  os?: string | undefined;
  language?: string | undefined;
  country?: string | undefined;
  auth_state?: "anonymous" | "authenticated" | "unknown" | undefined;
  referrer?: string | undefined;
  utm_source?: string | undefined;
  utm_medium?: string | undefined;
  utm_campaign?: string | undefined;
  custom_dimensions?: Record<string, string> | undefined;
  limit?: number | undefined;
}

export interface AnalyticsIncidentImpactReadOptions {
  includeSampleIds?: boolean;
  includeBundleState?: boolean;
}

type CountRow = { affected_sessions: unknown };
type RouteRow = { route_key: unknown; affected_sessions: unknown };
type FunnelRow = { funnel_key: unknown; affected_sessions: unknown };
type SegmentRow = { value: unknown; affected_sessions: unknown };
type JourneyPatternRow = {
  from_route_key: unknown;
  to_route_key: unknown;
  affected_sessions: unknown;
};
type JourneyPatternSampleRow = { transition_tag: unknown; sample_id: unknown };
type BundleStateRow = { generation_id: unknown; status: unknown; failure_reason: unknown };

const DEFAULT_LIMIT = 10;
const MAX_INCIDENT_IMPACT_JOURNEY_SAMPLE_IDS = 3;

export async function readAnalyticsIncidentImpact(
  db: Queryable,
  input: AnalyticsIncidentImpactInput,
  options?: AnalyticsIncidentImpactReadOptions
): Promise<AnalyticsIncidentImpactResponse> {
  const limit = normalizeLimit(input.limit);
  const [affectedSessionResult, routes, funnels, deviceTypes, browsers, journeys, bundle] = await Promise.all([
    readAffectedSessionCount(db, input),
    readAffectedRoutes(db, input, limit),
    readAffectedFunnels(db, input, limit),
    readAffectedSegments(db, input, limit, "device_type"),
    readAffectedSegments(db, input, limit, "browser_family"),
    readAffectedJourneyPatterns(db, input, limit),
    options?.includeBundleState === false
      ? Promise.resolve(null)
      : readIncidentImpactBundleState(db, input)
  ]);
  const sampleIdsByTransition = options?.includeSampleIds === false
    ? new Map<string, string[]>()
    : await readAffectedJourneySampleIds(db, input, journeys.rows);

  return AnalyticsIncidentImpactResponseSchema.parse({
    incident_id: input.incident_id,
    window: {
      project_id: input.project_id,
      from: input.from,
      to: input.to,
      granularity: input.granularity,
      service: input.service ?? null,
      environment: input.environment ?? null
    },
    affected_sessions: toNonNegativeInteger(affectedSessionResult.rows[0]?.affected_sessions),
    affected_routes: routes.rows.map((row) => ({
      route_key: toNonEmptyString(row.route_key, "unknown"),
      affected_sessions: toNonNegativeInteger(row.affected_sessions)
    })),
    affected_funnels: funnels.rows.map((row) => ({
      funnel_key: toNonEmptyString(row.funnel_key, "unknown"),
      affected_sessions: toNonNegativeInteger(row.affected_sessions)
    })),
    top_device_types: deviceTypes.rows.map(toImpactSegment),
    top_browsers: browsers.rows.map(toImpactSegment),
    journey_patterns: journeys.rows.map((row) => ({
      from_route_key: toNonEmptyString(row.from_route_key, "unknown"),
      to_route_key: toNonEmptyString(row.to_route_key, "unknown"),
      affected_sessions: toNonNegativeInteger(row.affected_sessions),
      sample_ids: sampleIdsByTransition.get(toTransitionTag(
        toNonEmptyString(row.from_route_key, "unknown"),
        toNonEmptyString(row.to_route_key, "unknown")
      )) ?? []
    })),
    conversion_delta: {
      availability: "unavailable",
      value: null,
      unit: "percentage_points"
    },
    analytics_bundle: bundle === null
      ? { status: "not_requested", generation_id: null, failure_reason: null }
      : bundle
  });
}

async function readAffectedSessionCount(db: Queryable, input: AnalyticsIncidentImpactInput): Promise<{ rows: CountRow[] }> {
  const where = buildLinkWhere(input);
  return await db.query<CountRow>(
    `
      SELECT COUNT(DISTINCT links.subject_hash)::bigint AS affected_sessions
      FROM analytics_incident_session_links links
      ${where.sql}
    `,
    where.params
  );
}

async function readAffectedRoutes(
  db: Queryable,
  input: AnalyticsIncidentImpactInput,
  limit: number
): Promise<{ rows: RouteRow[] }> {
  const where = buildLinkWhere(input);
  return await db.query<RouteRow>(
    `
      SELECT
        links.route_key,
        COUNT(DISTINCT links.subject_hash)::bigint AS affected_sessions
      FROM analytics_incident_session_links links
      ${where.sql}
      GROUP BY links.route_key
      ORDER BY affected_sessions DESC, links.route_key ASC
      LIMIT $${where.params.length + 1}
    `,
    [...where.params, limit]
  );
}

async function readAffectedFunnels(
  db: Queryable,
  input: AnalyticsIncidentImpactInput,
  limit: number
): Promise<{ rows: FunnelRow[] }> {
  const where = buildLinkWhere(input);
  return await db.query<FunnelRow>(
    `
      WITH linked_subjects AS (
        SELECT DISTINCT
          links.project_id,
          links.service,
          links.environment,
          links.bucket_start,
          links.bucket_granularity,
          links.subject_hash
        FROM analytics_incident_session_links links
        ${where.sql}
      )
      SELECT
        split_part(uniques.rollup_key, '|', 1) AS funnel_key,
        COUNT(DISTINCT uniques.subject_hash)::bigint AS affected_sessions
      FROM linked_subjects links
      JOIN analytics_rollup_uniques uniques
        ON uniques.project_id = links.project_id
        AND uniques.service = links.service
        AND uniques.environment = links.environment
        AND uniques.bucket_start = links.bucket_start
        AND uniques.bucket_granularity = links.bucket_granularity
        AND uniques.subject_hash = links.subject_hash
        AND uniques.rollup_kind = 'funnel_step_session'
      GROUP BY funnel_key
      ORDER BY affected_sessions DESC, funnel_key ASC
      LIMIT $${where.params.length + 1}
    `,
    [...where.params, limit]
  );
}

async function readAffectedSegments(
  db: Queryable,
  input: AnalyticsIncidentImpactInput,
  limit: number,
  segment: "device_type" | "browser_family"
): Promise<{ rows: SegmentRow[] }> {
  const where = buildLinkWhere(input);
  const expression = segment === "device_type"
    ? "COALESCE(NULLIF(route_rollups.device_type, ''), 'unknown')"
    : "COALESCE(NULLIF(route_rollups.browser_family, ''), 'unknown')";
  return await db.query<SegmentRow>(
    `
      SELECT
        ${expression} AS value,
        COUNT(DISTINCT links.subject_hash)::bigint AS affected_sessions
      FROM analytics_incident_session_links links
      JOIN analytics_route_rollups route_rollups
        ON route_rollups.project_id = links.project_id
        AND route_rollups.service = links.service
        AND route_rollups.environment = links.environment
        AND route_rollups.bucket_start = links.bucket_start
        AND route_rollups.bucket_granularity = links.bucket_granularity
        AND route_rollups.route_key = links.route_key
        AND route_rollups.dimension_hash = links.dimension_hash
      ${where.sql}
      GROUP BY value
      ORDER BY affected_sessions DESC, value ASC
      LIMIT $${where.params.length + 1}
    `,
    [...where.params, limit]
  );
}

async function readAffectedJourneyPatterns(
  db: Queryable,
  input: AnalyticsIncidentImpactInput,
  limit: number
): Promise<{ rows: JourneyPatternRow[] }> {
  const where = buildLinkWhere(input);
  return await db.query<JourneyPatternRow>(
    `
      WITH linked_subjects AS (
        SELECT DISTINCT
          links.project_id,
          links.service,
          links.environment,
          links.bucket_start,
          links.bucket_granularity,
          links.subject_hash
        FROM analytics_incident_session_links links
        ${where.sql}
      )
      SELECT
        split_part(uniques.rollup_key, '|', 1) AS from_route_key,
        split_part(uniques.rollup_key, '|', 2) AS to_route_key,
        COUNT(DISTINCT uniques.subject_hash)::bigint AS affected_sessions
      FROM linked_subjects links
      JOIN analytics_rollup_uniques uniques
        ON uniques.project_id = links.project_id
        AND uniques.service = links.service
        AND uniques.environment = links.environment
        AND uniques.bucket_start = links.bucket_start
        AND uniques.bucket_granularity = links.bucket_granularity
        AND uniques.subject_hash = links.subject_hash
        AND uniques.rollup_kind = 'transition_session'
      GROUP BY from_route_key, to_route_key
      ORDER BY affected_sessions DESC, from_route_key ASC, to_route_key ASC
      LIMIT $${where.params.length + 1}
    `,
    [...where.params, limit]
  );
}

async function readAffectedJourneySampleIds(
  db: Queryable,
  input: AnalyticsIncidentImpactInput,
  patterns: JourneyPatternRow[]
): Promise<Map<string, string[]>> {
  const transitionTags = [...new Set(patterns.map((pattern) => toTransitionTag(
    toNonEmptyString(pattern.from_route_key, "unknown"),
    toNonEmptyString(pattern.to_route_key, "unknown")
  )))];
  if (transitionTags.length === 0) {
    return new Map();
  }

  const where = buildLinkWhere(input);
  const params: unknown[] = [
    ...where.params,
    transitionTags,
    new Date().toISOString(),
    input.from,
    input.to,
    MAX_INCIDENT_IMPACT_JOURNEY_SAMPLE_IDS
  ];
  const transitionTagsIndex = where.params.length + 1;
  const nowIndex = transitionTagsIndex + 1;
  const fromIndex = nowIndex + 1;
  const toIndex = fromIndex + 1;
  const limitIndex = toIndex + 1;
  const result = await db.query<JourneyPatternSampleRow>(
    `
      WITH linked_subjects AS (
        SELECT DISTINCT
          links.project_id,
          links.service,
          links.environment,
          links.subject_hash
        FROM analytics_incident_session_links links
        ${where.sql}
      ),
      wanted_tags AS (
        SELECT unnest($${transitionTagsIndex}::text[]) AS transition_tag
      ),
      matching_samples AS (
        SELECT DISTINCT
          wanted.transition_tag,
          samples.id::text AS sample_id,
          samples.last_seen_at
        FROM wanted_tags wanted
        JOIN linked_subjects links ON true
        JOIN analytics_journey_samples samples
          ON samples.project_id = links.project_id
          AND samples.correlation_session_hash = links.subject_hash
          AND samples.service = links.service
          AND samples.environment = links.environment
          AND samples.has_artifact = true
          AND samples.expires_at > $${nowIndex}::timestamptz
          AND samples.last_seen_at >= $${fromIndex}::timestamptz
          AND samples.first_seen_at < $${toIndex}::timestamptz
          AND samples.analysis_tags @> ARRAY[wanted.transition_tag]::text[]
      )
      SELECT transition_tag, sample_id
      FROM (
        SELECT
          transition_tag,
          sample_id,
          row_number() OVER (
            PARTITION BY transition_tag
            ORDER BY last_seen_at DESC, sample_id DESC
          ) AS sample_rank
        FROM matching_samples
      ) ranked
      WHERE sample_rank <= $${limitIndex}
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

async function readIncidentImpactBundleState(
  db: Queryable,
  input: AnalyticsIncidentImpactInput
): Promise<{ status: "pending" | "running" | "completed" | "failed"; generation_id: string; failure_reason: string | null } | null> {
  const result = await db.query<BundleStateRow>(
    `
      SELECT
        id::text AS generation_id,
        status,
        failure_reason
      FROM analytics_bundle_generations
      WHERE project_id = $1::uuid
        AND analysis_kind = 'incident_impact'
        AND (
          analysis_spec ->> 'incident_id' = $2::text
          OR COALESCE(analysis_spec -> 'related_incident_ids', '[]'::jsonb) @> jsonb_build_array($2::text)
        )
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [input.project_id, input.incident_id]
  );
  const row = result.rows[0];
  if (row === undefined || typeof row.generation_id !== "string") {
    return null;
  }

  const status = row.status;
  if (status !== "pending" && status !== "running" && status !== "completed" && status !== "failed") {
    return null;
  }
  return {
    status,
    generation_id: row.generation_id,
    failure_reason: typeof row.failure_reason === "string" && row.failure_reason.length > 0 ? row.failure_reason : null
  };
}

function buildLinkWhere(input: AnalyticsIncidentImpactInput): { sql: string; params: unknown[] } {
  const params: unknown[] = [input.project_id, input.incident_id, input.from, input.to, input.granularity];
  const conditions = [
    "links.project_id = $1::uuid",
    "links.incident_id = $2::uuid",
    "links.bucket_start >= $3::timestamptz",
    "links.bucket_start < $4::timestamptz",
    "links.bucket_granularity = $5"
  ];
  if (input.service !== undefined) {
    params.push(input.service);
    conditions.push(`links.service = $${params.length}`);
  }
  if (input.environment !== undefined) {
    params.push(input.environment);
    conditions.push(`links.environment = $${params.length}`);
  }

  if (input.route !== undefined) {
    params.push(input.route);
    conditions.push(`links.route_key = $${params.length}`);
  }

  const rollupFilters: string[] = [];
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
      rollupFilters.push(`filtered_rollups.${column} = $${params.length}`);
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
      rollupFilters.push(`filtered_rollups.dimensions->>'${key}' = $${params.length}`);
    }
  }

  for (const [key, value] of Object.entries(input.custom_dimensions ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    params.push(key, value);
    rollupFilters.push(
      `jsonb_extract_path_text(filtered_rollups.dimensions, 'custom_dimensions', $${params.length - 1}::text) = $${params.length}`
    );
  }

  if (rollupFilters.length > 0) {
    conditions.push(`EXISTS (
          SELECT 1
          FROM analytics_route_rollups filtered_rollups
          WHERE filtered_rollups.project_id = links.project_id
            AND filtered_rollups.service = links.service
            AND filtered_rollups.environment = links.environment
            AND filtered_rollups.bucket_start = links.bucket_start
            AND filtered_rollups.bucket_granularity = links.bucket_granularity
            AND filtered_rollups.route_key = links.route_key
            AND filtered_rollups.dimension_hash = links.dimension_hash
            AND ${rollupFilters.join("\n            AND ")}
        )`);
  }
  return { sql: `WHERE ${conditions.join("\n        AND ")}`, params };
}

function normalizeLimit(value: number | undefined): number {
  return Math.min(Math.max(value ?? DEFAULT_LIMIT, 1), 100);
}

function toImpactSegment(row: SegmentRow): { value: string; affected_sessions: number } {
  return {
    value: toNonEmptyString(row.value, "unknown"),
    affected_sessions: toNonNegativeInteger(row.affected_sessions)
  };
}

function toNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function toTransitionTag(fromRouteKey: string, toRouteKey: string): string {
  return `transition:${fromRouteKey}->${toRouteKey}`;
}

function toNonNegativeInteger(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}
