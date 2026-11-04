import {
  readSummaryTotals,
  readConversionTotal,
  readSegments,
  readJourneyPatternSampleIds,
  buildAnalyticsRollupWhere,
  buildWindow,
  normalizeLimit,
  toNonNegativeInteger,
  toNonEmptyString,
  toConversionRate,
  toActionMetricKind,
  toTransitionTag,
  readAnalyticsOriginScope,
  type AnalyticsActionMetricRow,
  type AnalyticsRouteMetricRow,
  type AnalyticsJourneyPatternRow,
  type AnalyticsFunnelStepMetricRow,
  type AnalyticsFunnelListRow
} from "./analytics-metrics-queries.js";
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
  origin_project_ids?: string[];
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

export function createPostgresAnalyticsMetricsStore(db: Queryable): AnalyticsMetricsStore {
  return {
    async getUsageSummary(input) {
      const limit = normalizeLimit(input.limit);
      const totals = await readSummaryTotals(db, input);
      const conversions = await readConversionTotal(db, input);

      const [deviceTypes, browsers, os, languages, referrers, authStates] = await Promise.all([
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
          conversions,
          ...(await readAnalyticsOriginScope(db, input.project_id, input.origin_project_ids))
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
        window: await buildWindow(db, input),
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
          transition_share:
            totalTransitions > 0 ? Math.min(1, transitionCount / totalTransitions) : 0
        };
      });
      const sampleIdsByTransition =
        options?.includeSampleIds === false
          ? new Map<string, string[]>()
          : await readJourneyPatternSampleIds(db, input, patterns);

      return AnalyticsJourneyPatternsResponseSchema.parse({
        window: await buildWindow(db, input),
        patterns: patterns.map((pattern) => ({
          ...pattern,
          sample_ids:
            sampleIdsByTransition.get(
              toTransitionTag(pattern.from_route_key, pattern.to_route_key)
            ) ?? []
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
        window: await buildWindow(db, input),
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
        window: await buildWindow(db, input),
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
        window: await buildWindow(db, input),
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
            WHERE definition.project_id=ANY(debugbundle_project_origins($1::uuid))
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
        window: await buildWindow(db, input),
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
            WHERE definition.project_id=ANY(debugbundle_project_origins($1::uuid))
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
        const sessionsCompleted =
          stepOrder === stepCount - 1
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
          ...(await buildWindow(db, input)),
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
