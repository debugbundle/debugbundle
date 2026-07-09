import {
  AnalyticsActionMetricsResponseSchema,
  AnalyticsDeviceBreakdownResponseSchema,
  AnalyticsFunnelAnalysisResponseSchema,
  AnalyticsFunnelsResponseSchema,
  AnalyticsJourneyPatternsResponseSchema,
  AnalyticsReferrerMetricsResponseSchema,
  AnalyticsRouteMetricsResponseSchema,
  AnalyticsUsageSummaryResponseSchema,
  type AnalyticsActionMetricsResponse,
  type AnalyticsDeviceBreakdownResponse,
  type AnalyticsFunnelAnalysisResponse,
  type AnalyticsFunnelsResponse,
  type AnalyticsJourneyPatternsResponse,
  type AnalyticsMetricsGranularity,
  type AnalyticsMetricsSegment,
  type AnalyticsReferrerMetricsResponse,
  type AnalyticsRouteMetricsResponse,
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

export interface AnalyticsFunnelAnalysisInput extends AnalyticsUsageSummaryInput {
  funnel_key: string;
}

export interface AnalyticsMetricsStore {
  getUsageSummary(input: AnalyticsUsageSummaryInput): Promise<AnalyticsUsageSummaryResponse>;
  getRouteMetrics(input: AnalyticsUsageSummaryInput): Promise<AnalyticsRouteMetricsResponse>;
  getJourneyPatterns(input: AnalyticsUsageSummaryInput): Promise<AnalyticsJourneyPatternsResponse>;
  getDeviceBreakdown(input: AnalyticsUsageSummaryInput): Promise<AnalyticsDeviceBreakdownResponse>;
  getReferrerMetrics(input: AnalyticsUsageSummaryInput): Promise<AnalyticsReferrerMetricsResponse>;
  getActionMetrics(input: AnalyticsUsageSummaryInput): Promise<AnalyticsActionMetricsResponse>;
  listFunnels(input: AnalyticsUsageSummaryInput): Promise<AnalyticsFunnelsResponse>;
  getFunnelAnalysis(input: AnalyticsFunnelAnalysisInput): Promise<AnalyticsFunnelAnalysisResponse>;
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

type AnalyticsActionMetricRow = {
  action_key: unknown;
  event_count: unknown;
  unique_sessions: unknown;
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
  | "utm_sources"
  | "utm_mediums"
  | "utm_campaigns"
  | "auth_states";

type AnalyticsRouteMetricRow = {
  route_key: unknown;
  pageviews: unknown;
  unique_sessions: unknown;
  entrances: unknown;
  exits: unknown;
  bounces: unknown;
  linked_incident_sessions: unknown;
};

type AnalyticsJourneyPatternRow = {
  from_route_key: unknown;
  to_route_key: unknown;
  transition_count: unknown;
  unique_sessions: unknown;
  total_transitions: unknown;
};

type AnalyticsJourneyPatternSampleRow = {
  transition_tag: unknown;
  sample_id: unknown;
};

type AnalyticsFunnelStepMetricRow = {
  step_key: unknown;
  step_order: unknown;
  sessions_entered: unknown;
  sessions_completed: unknown;
  dropoffs: unknown;
};

type AnalyticsFunnelListRow = {
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
    },

    async getRouteMetrics(input) {
      const limit = normalizeLimit(input.limit);
      const where = buildAnalyticsRollupWhere(input);
      const result = await db.query<AnalyticsRouteMetricRow>(
        `
          SELECT
            route_key,
            COALESCE(SUM(pageviews), 0)::bigint AS pageviews,
            COALESCE(SUM(unique_sessions), 0)::bigint AS unique_sessions,
            COALESCE(SUM(entrances), 0)::bigint AS entrances,
            COALESCE(SUM(exits), 0)::bigint AS exits,
            COALESCE(SUM(bounces), 0)::bigint AS bounces,
            COALESCE(SUM(linked_incident_sessions), 0)::bigint AS linked_incident_sessions
          FROM analytics_route_rollups
          ${where.sql}
          GROUP BY route_key
          ORDER BY pageviews DESC, route_key ASC
          LIMIT $${where.params.length + 1}
        `,
        [...where.params, limit]
      );

      return AnalyticsRouteMetricsResponseSchema.parse({
        window: buildWindow(input),
        routes: result.rows.map((row) => ({
          route_key: toNonEmptyString(row.route_key, "unknown"),
          pageviews: toNonNegativeInteger(row.pageviews),
          unique_sessions: toNonNegativeInteger(row.unique_sessions),
          entrances: toNonNegativeInteger(row.entrances),
          exits: toNonNegativeInteger(row.exits),
          bounces: toNonNegativeInteger(row.bounces),
          linked_incident_sessions: toNonNegativeInteger(row.linked_incident_sessions)
        }))
      });
    },

    async getJourneyPatterns(input) {
      const limit = normalizeLimit(input.limit);
      const where = buildAnalyticsRollupWhere(input);
      const result = await db.query<AnalyticsJourneyPatternRow>(
        `
          SELECT
            from_route_key,
            to_route_key,
            COALESCE(SUM(transition_count), 0)::bigint AS transition_count,
            COALESCE(SUM(unique_sessions), 0)::bigint AS unique_sessions,
            COALESCE(SUM(SUM(transition_count)) OVER (), 0)::bigint AS total_transitions
          FROM analytics_transition_rollups
          ${where.sql}
          GROUP BY from_route_key, to_route_key
          HAVING COALESCE(SUM(transition_count), 0) > 0
          ORDER BY transition_count DESC, unique_sessions DESC, from_route_key ASC, to_route_key ASC
          LIMIT $${where.params.length + 1}
        `,
        [...where.params, limit]
      );
      const patterns = result.rows.map((row) => {
        const transitionCount = toNonNegativeInteger(row.transition_count);
        const totalTransitions = toNonNegativeInteger(row.total_transitions);
        return {
          from_route_key: toNonEmptyString(row.from_route_key, "unknown"),
          to_route_key: toNonEmptyString(row.to_route_key, "unknown"),
          transition_count: transitionCount,
          unique_sessions: toNonNegativeInteger(row.unique_sessions),
          transition_share: totalTransitions > 0 ? Math.min(1, transitionCount / totalTransitions) : 0
        };
      });
      const sampleIdsByTransition = await readJourneyPatternSampleIds(db, input, patterns);

      return AnalyticsJourneyPatternsResponseSchema.parse({
        window: buildWindow(input),
        patterns: patterns.map((pattern) => ({
          ...pattern,
          sample_ids: sampleIdsByTransition.get(toTransitionTag(pattern.from_route_key, pattern.to_route_key)) ?? []
        }))
      });
    },

    async getDeviceBreakdown(input) {
      const limit = normalizeLimit(input.limit);
      const [deviceTypes, browsers, os, languages] = await Promise.all([
        readSegments(db, input, "device_types", limit),
        readSegments(db, input, "browsers", limit),
        readSegments(db, input, "os", limit),
        readSegments(db, input, "languages", limit)
      ]);

      return AnalyticsDeviceBreakdownResponseSchema.parse({
        window: buildWindow(input),
        device_types: deviceTypes,
        browsers,
        os,
        languages
      });
    },

    async getReferrerMetrics(input) {
      const limit = normalizeLimit(input.limit);
      const [referrers, utmSources, utmMediums, utmCampaigns] = await Promise.all([
        readSegments(db, input, "referrers", limit),
        readSegments(db, input, "utm_sources", limit),
        readSegments(db, input, "utm_mediums", limit),
        readSegments(db, input, "utm_campaigns", limit)
      ]);

      return AnalyticsReferrerMetricsResponseSchema.parse({
        window: buildWindow(input),
        referrers,
        utm_sources: utmSources,
        utm_mediums: utmMediums,
        utm_campaigns: utmCampaigns
      });
    },

    async getActionMetrics(input) {
      const limit = normalizeLimit(input.limit);
      const where = buildAnalyticsRollupWhere(input);
      const result = await db.query<AnalyticsActionMetricRow>(
        `
          SELECT
            action_key,
            COALESCE(SUM(event_count), 0)::bigint AS event_count,
            COALESCE(SUM(unique_sessions), 0)::bigint AS unique_sessions
          FROM analytics_action_rollups
          ${where.sql}
          GROUP BY action_key
          HAVING COALESCE(SUM(event_count), 0) > 0 OR COALESCE(SUM(unique_sessions), 0) > 0
          ORDER BY event_count DESC, unique_sessions DESC, action_key ASC
          LIMIT $${where.params.length + 1}
        `,
        [...where.params, limit]
      );

      return AnalyticsActionMetricsResponseSchema.parse({
        window: buildWindow(input),
        actions: result.rows.map((row) => {
          const actionKey = toNonEmptyString(row.action_key, "unknown");
          return {
            action_key: actionKey,
            kind: toActionMetricKind(actionKey),
            event_count: toNonNegativeInteger(row.event_count),
            unique_sessions: toNonNegativeInteger(row.unique_sessions)
          };
        })
      });
    },

    async listFunnels(input) {
      const limit = normalizeLimit(input.limit);
      const where = buildAnalyticsRollupWhere(input);
      const result = await db.query<AnalyticsFunnelListRow>(
        `
          SELECT
            funnel_key,
            COALESCE(SUM(sessions_entered), 0)::bigint AS sessions_entered,
            COALESCE(SUM(sessions_completed), 0)::bigint AS sessions_completed,
            COALESCE(SUM(dropoffs), 0)::bigint AS dropoffs
          FROM analytics_funnel_rollups
          ${where.sql}
          GROUP BY funnel_key
          HAVING COALESCE(SUM(sessions_entered), 0) > 0
            OR COALESCE(SUM(sessions_completed), 0) > 0
            OR COALESCE(SUM(dropoffs), 0) > 0
          ORDER BY sessions_entered DESC, funnel_key ASC
          LIMIT $${where.params.length + 1}
        `,
        [...where.params, limit]
      );

      return AnalyticsFunnelsResponseSchema.parse({
        window: buildWindow(input),
        funnels: result.rows.map((row) => {
          const sessionsEntered = toNonNegativeInteger(row.sessions_entered);
          const sessionsCompleted = toNonNegativeInteger(row.sessions_completed);
          return {
            funnel_key: toNonEmptyString(row.funnel_key, "unknown"),
            sessions_entered: sessionsEntered,
            sessions_completed: sessionsCompleted,
            dropoffs: toNonNegativeInteger(row.dropoffs),
            conversion_rate: toConversionRate(sessionsCompleted, sessionsEntered)
          };
        })
      });
    },

    async getFunnelAnalysis(input) {
      const baseWhere = buildAnalyticsRollupWhere(input);
      const where = {
        sql: `${baseWhere.sql}\n        AND funnel_key = $${baseWhere.params.length + 1}`,
        params: [...baseWhere.params, input.funnel_key]
      };
      const result = await db.query<AnalyticsFunnelStepMetricRow>(
        `
          SELECT
            step_key,
            MIN(step_order)::integer AS step_order,
            COALESCE(SUM(sessions_entered), 0)::bigint AS sessions_entered,
            COALESCE(SUM(sessions_completed), 0)::bigint AS sessions_completed,
            COALESCE(SUM(dropoffs), 0)::bigint AS dropoffs
          FROM analytics_funnel_rollups
          ${where.sql}
          GROUP BY step_key
          ORDER BY step_order ASC, step_key ASC
        `,
        where.params
      );
      const steps = result.rows.map((row) => {
        const sessionsEntered = toNonNegativeInteger(row.sessions_entered);
        const sessionsCompleted = toNonNegativeInteger(row.sessions_completed);
        return {
          step_key: toNonEmptyString(row.step_key, "unknown"),
          step_order: toNonNegativeInteger(row.step_order),
          sessions_entered: sessionsEntered,
          sessions_completed: sessionsCompleted,
          dropoffs: toNonNegativeInteger(row.dropoffs),
          conversion_rate: toConversionRate(sessionsCompleted, sessionsEntered)
        };
      });
      const totals = steps.reduce(
        (sum, step) => ({
          sessions_entered: sum.sessions_entered + step.sessions_entered,
          sessions_completed: sum.sessions_completed + step.sessions_completed,
          dropoffs: sum.dropoffs + step.dropoffs
        }),
        { sessions_entered: 0, sessions_completed: 0, dropoffs: 0 }
      );

      return AnalyticsFunnelAnalysisResponseSchema.parse({
        funnel: {
          ...buildWindow(input),
          funnel_key: input.funnel_key,
          sessions_entered: totals.sessions_entered,
          sessions_completed: totals.sessions_completed,
          dropoffs: totals.dropoffs,
          conversion_rate: toConversionRate(totals.sessions_completed, totals.sessions_entered)
        },
        steps
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

async function readJourneyPatternSampleIds(
  db: Queryable,
  input: AnalyticsUsageSummaryInput,
  patterns: Array<{ from_route_key: string; to_route_key: string }>
): Promise<Map<string, string[]>> {
  if (patterns.length === 0) {
    return new Map();
  }

  const transitionTags = [...new Set(patterns.map((pattern) => toTransitionTag(pattern.from_route_key, pattern.to_route_key)))];
  const params: unknown[] = [input.project_id, new Date().toISOString(), transitionTags, input.from, input.to];
  const filters = [
    "samples.project_id = $1::uuid",
    "samples.expires_at > $2::timestamptz",
    "samples.last_seen_at >= $4::timestamptz",
    "samples.first_seen_at < $5::timestamptz",
    "samples.analysis_tags @> ARRAY[wanted.transition_tag]::text[]"
  ];

  if (input.service !== undefined) {
    params.push(input.service);
    filters.push(`samples.service = $${params.length}`);
  }

  if (input.environment !== undefined) {
    params.push(input.environment);
    filters.push(`samples.environment = $${params.length}`);
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
          samples.sample_id,
          row_number() OVER (
            PARTITION BY wanted.transition_tag
            ORDER BY samples.last_seen_at DESC, samples.sample_id DESC
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
    sampleIdsByTransition.set(row.transition_tag, [...(sampleIdsByTransition.get(row.transition_tag) ?? []), row.sample_id]);
  }

  return sampleIdsByTransition;
}

function buildAnalyticsRollupWhere(
  input: AnalyticsUsageSummaryInput,
  options: { extraConditions?: string[]; extraParams?: unknown[] } = {}
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

function buildWindow(input: AnalyticsUsageSummaryInput): {
  project_id: string;
  from: string;
  to: string;
  granularity: AnalyticsMetricsGranularity;
  service: string | null;
  environment: string | null;
} {
  return {
    project_id: input.project_id,
    from: input.from,
    to: input.to,
    granularity: input.granularity,
    service: input.service ?? null,
    environment: input.environment ?? null
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

function toNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function toConversionRate(completed: number, entered: number): number {
  return entered > 0 ? Math.min(1, Math.max(0, completed / entered)) : 0;
}

function toActionMetricKind(actionKey: string): "action" | "conversion" | "marker" {
  if (actionKey.startsWith("conversion:")) {
    return "conversion";
  }
  if (actionKey.startsWith("marker:")) {
    return "marker";
  }
  return "action";
}

function toTransitionTag(fromRouteKey: string, toRouteKey: string): string {
  return `transition:${fromRouteKey}->${toRouteKey}`.slice(0, 120);
}
