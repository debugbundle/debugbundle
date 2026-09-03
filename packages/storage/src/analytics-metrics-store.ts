import {
  AnalyticsActionMetricsResponseSchema,
  AnalyticsDeviceBreakdownResponseSchema,
  AnalyticsFunnelAnalysisResponseSchema,
  AnalyticsFunnelsResponseSchema,
  AnalyticsJourneyPatternsResponseSchema,
  type AnalyticsIncidentImpactResponse,
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
import {
  readAnalyticsIncidentImpact,
  type AnalyticsIncidentImpactInput
} from "./analytics-incident-impact-metrics.js";
import type { Queryable } from "./types.js";

export interface AnalyticsUsageSummaryInput {
  project_id: string;
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

export interface AnalyticsRouteContextInput extends AnalyticsUsageSummaryInput {
  route?: string | undefined;
}

export interface AnalyticsFunnelAnalysisInput extends AnalyticsUsageSummaryInput {
  funnel_key: string;
}

export interface AnalyticsJourneyPatternReadOptions {
  includeSampleIds?: boolean;
}

export interface AnalyticsIncidentImpactReadOptions extends AnalyticsJourneyPatternReadOptions {
  includeBundleState?: boolean;
}

export interface AnalyticsMetricsStore {
  getUsageSummary(input: AnalyticsUsageSummaryInput): Promise<AnalyticsUsageSummaryResponse>;
  getRouteMetrics(input: AnalyticsRouteContextInput): Promise<AnalyticsRouteMetricsResponse>;
  getJourneyPatterns(
    input: AnalyticsRouteContextInput,
    options?: AnalyticsJourneyPatternReadOptions
  ): Promise<AnalyticsJourneyPatternsResponse>;
  getDeviceBreakdown(input: AnalyticsUsageSummaryInput): Promise<AnalyticsDeviceBreakdownResponse>;
  getReferrerMetrics(input: AnalyticsUsageSummaryInput): Promise<AnalyticsReferrerMetricsResponse>;
  getActionMetrics(input: AnalyticsUsageSummaryInput): Promise<AnalyticsActionMetricsResponse>;
  listFunnels(input: AnalyticsUsageSummaryInput): Promise<AnalyticsFunnelsResponse>;
  getFunnelAnalysis(input: AnalyticsFunnelAnalysisInput): Promise<AnalyticsFunnelAnalysisResponse>;
  getIncidentImpact(
    input: AnalyticsIncidentImpactInput,
    options?: AnalyticsIncidentImpactReadOptions
  ): Promise<AnalyticsIncidentImpactResponse>;
}

type AnalyticsSummaryTotalsRow = {
  sessions: unknown;
  pageviews: unknown;
  active_visitors: unknown;
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
  step_count: unknown;
  sessions_entered: unknown;
  sessions_completed: unknown;
  next_sessions_entered: unknown;
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
          active_visitors: totals.active_visitors,
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
      const where = buildAnalyticsRollupWhere(input, { routeColumns: ["route_key"] });
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

    async getJourneyPatterns(input, options) {
      const limit = normalizeLimit(input.limit);
      const where = buildAnalyticsRollupWhere(input, {
        routeColumns: ["from_route_key", "to_route_key"]
      });
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
      const sampleIdsByTransition = options?.includeSampleIds === false
        ? new Map<string, string[]>()
        : await readJourneyPatternSampleIds(db, input, patterns);

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
      const where = buildAnalyticsRollupWhere(input, { routeColumns: ["route_key"] });
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
          WITH funnel_steps AS (
            SELECT
              definition.funnel_key,
              step.value->>'step_key' AS step_key,
              (step.ordinality - 1)::integer AS step_order,
              jsonb_array_length(definition.steps)::integer AS step_count
            FROM analytics_funnel_definitions definition
            CROSS JOIN LATERAL jsonb_array_elements(definition.steps)
              WITH ORDINALITY AS step(value, ordinality)
            WHERE definition.project_id = $1::uuid
              AND definition.archived_at IS NULL
          ),
          rollups AS (
            SELECT
              funnel_key,
              step_key,
              COALESCE(SUM(sessions_entered), 0)::bigint AS sessions_entered,
              COALESCE(SUM(sessions_completed), 0)::bigint AS sessions_completed
            FROM analytics_funnel_rollups
            ${where.sql}
            GROUP BY funnel_key, step_key
          )
          SELECT
            steps.funnel_key,
            COALESCE(MAX(rollups.sessions_entered) FILTER (WHERE steps.step_order = 0), 0)::bigint
              AS sessions_entered,
            COALESCE(MAX(rollups.sessions_completed) FILTER (
              WHERE steps.step_order = steps.step_count - 1
            ), 0)::bigint AS sessions_completed,
            GREATEST(
              COALESCE(MAX(rollups.sessions_entered) FILTER (WHERE steps.step_order = 0), 0)
                - COALESCE(MAX(rollups.sessions_completed) FILTER (
                    WHERE steps.step_order = steps.step_count - 1
                  ), 0),
              0
            )::bigint AS dropoffs
          FROM funnel_steps steps
          LEFT JOIN rollups
            ON rollups.funnel_key = steps.funnel_key
           AND rollups.step_key = steps.step_key
          GROUP BY steps.funnel_key
          HAVING COALESCE(MAX(rollups.sessions_entered) FILTER (WHERE steps.step_order = 0), 0) > 0
            OR COALESCE(MAX(rollups.sessions_completed) FILTER (
              WHERE steps.step_order = steps.step_count - 1
            ), 0) > 0
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
          WITH funnel_steps AS (
            SELECT
              definition.funnel_key,
              step.value->>'step_key' AS step_key,
              (step.ordinality - 1)::integer AS step_order,
              jsonb_array_length(definition.steps)::integer AS step_count
            FROM analytics_funnel_definitions definition
            CROSS JOIN LATERAL jsonb_array_elements(definition.steps)
              WITH ORDINALITY AS step(value, ordinality)
            WHERE definition.project_id = $1::uuid
              AND definition.funnel_key = $${baseWhere.params.length + 1}
              AND definition.archived_at IS NULL
          ),
          rollups AS (
            SELECT
              funnel_key,
              step_key,
              COALESCE(SUM(sessions_entered), 0)::bigint AS sessions_entered,
              COALESCE(SUM(sessions_completed), 0)::bigint AS sessions_completed
            FROM analytics_funnel_rollups
            ${where.sql}
            GROUP BY funnel_key, step_key
          ),
          joined AS (
            SELECT
              steps.step_key,
              steps.step_order,
              steps.step_count,
              COALESCE(rollups.sessions_entered, 0)::bigint AS sessions_entered,
              COALESCE(rollups.sessions_completed, 0)::bigint AS sessions_completed
            FROM funnel_steps steps
            LEFT JOIN rollups
              ON rollups.funnel_key = steps.funnel_key
             AND rollups.step_key = steps.step_key
          )
          SELECT
            step_key,
            step_order,
            step_count,
            sessions_entered,
            sessions_completed,
            LEAD(sessions_entered, 1, 0) OVER (ORDER BY step_order ASC)::bigint
              AS next_sessions_entered
          FROM joined
          ORDER BY step_order ASC, step_key ASC
        `,
        where.params
      );
      const steps = result.rows.map((row) => {
        const sessionsEntered = toNonNegativeInteger(row.sessions_entered);
        const stepOrder = toNonNegativeInteger(row.step_order);
        const stepCount = Math.max(1, toNonNegativeInteger(row.step_count));
        const sessionsCompleted = stepOrder === stepCount - 1
          ? toNonNegativeInteger(row.sessions_completed)
          : toNonNegativeInteger(row.next_sessions_entered);
        return {
          step_key: toNonEmptyString(row.step_key, "unknown"),
          step_order: stepOrder,
          sessions_entered: sessionsEntered,
          sessions_completed: sessionsCompleted,
          dropoffs: Math.max(0, sessionsEntered - sessionsCompleted),
          conversion_rate: toConversionRate(sessionsCompleted, sessionsEntered)
        };
      });
      const sessionsEntered = steps[0]?.sessions_entered ?? 0;
      const sessionsCompleted = steps.at(-1)?.sessions_completed ?? 0;

      return AnalyticsFunnelAnalysisResponseSchema.parse({
        funnel: {
          ...buildWindow(input),
          funnel_key: input.funnel_key,
          sessions_entered: sessionsEntered,
          sessions_completed: sessionsCompleted,
          dropoffs: Math.max(0, sessionsEntered - sessionsCompleted),
          conversion_rate: toConversionRate(sessionsCompleted, sessionsEntered)
        },
        steps
      });
    },

    async getIncidentImpact(input, options) {
      return await readAnalyticsIncidentImpact(db, input, options);
    }
  };
}

async function readSummaryTotals(
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

  for (const [key, value] of Object.entries(input.custom_dimensions ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    params.push(key, value);
    filters.push(`jsonb_extract_path_text(samples.dimensions_summary, 'custom_dimensions', $${params.length - 1}::text) = $${params.length}`);
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
    sampleIdsByTransition.set(row.transition_tag, [...(sampleIdsByTransition.get(row.transition_tag) ?? []), row.sample_id]);
  }

  return sampleIdsByTransition;
}

function buildAnalyticsRollupWhere(
  input: AnalyticsUsageSummaryInput,
  options: {
    extraConditions?: string[];
    extraParams?: unknown[];
    routeColumns?: string[];
  } = {}
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

  for (const [key, value] of Object.entries(input.custom_dimensions ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    params.push(key, value);
    conditions.push(`jsonb_extract_path_text(dimensions, 'custom_dimensions', $${params.length - 1}::text) = $${params.length}`);
  }

  const route = "route" in input && typeof input.route === "string" ? input.route : undefined;
  if (route !== undefined && options.routeColumns !== undefined && options.routeColumns.length > 0) {
    params.push(route);
    const placeholder = `$${params.length}`;
    conditions.push(`(${options.routeColumns.map((column) => `${column} = ${placeholder}`).join(" OR ")})`);
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
