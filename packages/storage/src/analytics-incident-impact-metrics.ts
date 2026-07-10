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
  limit?: number | undefined;
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
type BundleStateRow = { generation_id: unknown; status: unknown; failure_reason: unknown };

const DEFAULT_LIMIT = 10;

export async function readAnalyticsIncidentImpact(
  db: Queryable,
  input: AnalyticsIncidentImpactInput
): Promise<AnalyticsIncidentImpactResponse> {
  const limit = normalizeLimit(input.limit);
  const [affectedSessionResult, routes, funnels, deviceTypes, browsers, journeys, bundle] = await Promise.all([
    readAffectedSessionCount(db, input),
    readAffectedRoutes(db, input, limit),
    readAffectedFunnels(db, input, limit),
    readAffectedSegments(db, input, limit, "device_type"),
    readAffectedSegments(db, input, limit, "browser_family"),
    readAffectedJourneyPatterns(db, input, limit),
    readIncidentImpactBundleState(db, input)
  ]);

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
      affected_sessions: toNonNegativeInteger(row.affected_sessions)
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

function toNonNegativeInteger(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}
