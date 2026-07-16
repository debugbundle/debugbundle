import type { AnalyticsBundleSeverity } from "../../shared-types/src/index.js";
import {
  buildAnalyticsOpportunityEvaluationWindow,
  roundOpportunityRatio,
  toOpportunityInteger,
  toOpportunityString,
  upsertAnalyticsOpportunity,
  type AnalyticsOpportunityEvaluationInput,
  type AnalyticsOpportunityEvaluationResult
} from "./analytics-opportunity-recording.js";
import type { Queryable } from "./types.js";

const ROUTE_EXIT_MIN_SESSIONS = 20;
const ROUTE_EXIT_MIN_EXITS = 10;
const ROUTE_EXIT_MIN_RATE = 0.4;
const ROUTE_EXIT_MIN_INCREASE = 0.15;
const ROUTE_EXIT_LIMIT = 5;
const INCIDENT_IMPACT_MIN_SESSIONS = 10;
const INCIDENT_IMPACT_MIN_SHARE = 0.1;
const INCIDENT_IMPACT_LIMIT = 5;
const DEPLOY_CONVERSION_MIN_SESSIONS = 20;
const DEPLOY_CONVERSION_MIN_DECREASE = 0.15;
const DEPLOY_CONVERSION_LIMIT = 5;

type RouteExitCandidateRow = {
  service: unknown;
  environment: unknown;
  route_key: unknown;
  current_sessions: unknown;
  current_exits: unknown;
  baseline_sessions: unknown;
  baseline_exits: unknown;
};

type IncidentImpactCandidateRow = {
  service: unknown;
  environment: unknown;
  incident_id: unknown;
  affected_sessions: unknown;
  total_sessions: unknown;
  affected_routes: unknown;
};

type DeployConversionCandidateRow = {
  service: unknown;
  environment: unknown;
  conversion_key: unknown;
  current_deploy_id: unknown;
  baseline_deploy_id: unknown;
  current_sessions: unknown;
  current_conversions: unknown;
  baseline_sessions: unknown;
  baseline_conversions: unknown;
};

export async function evaluateAnalyticsRouteExitOpportunities(
  db: Queryable,
  input: AnalyticsOpportunityEvaluationInput
): Promise<AnalyticsOpportunityEvaluationResult> {
  const window = buildAnalyticsOpportunityEvaluationWindow(input.occurred_at);
  if (window === null) return { opportunities_created_or_updated: 0 };
  const currentFromMs = Date.parse(window.from);
  const baselineFrom = new Date(currentFromMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = await db.query<RouteExitCandidateRow>(
    `
      WITH route_windows AS (
        SELECT
          service,
          environment,
          route_key,
          COALESCE(SUM(unique_sessions) FILTER (WHERE bucket_start >= $3::timestamptz), 0)::bigint AS current_sessions,
          COALESCE(SUM(exits) FILTER (WHERE bucket_start >= $3::timestamptz), 0)::bigint AS current_exits,
          COALESCE(SUM(unique_sessions) FILTER (WHERE bucket_start < $3::timestamptz), 0)::bigint AS baseline_sessions,
          COALESCE(SUM(exits) FILTER (WHERE bucket_start < $3::timestamptz), 0)::bigint AS baseline_exits
        FROM analytics_route_rollups
        WHERE project_id = $1::uuid
          AND bucket_granularity = 'day'
          AND bucket_start >= $2::timestamptz
          AND bucket_start < $4::timestamptz
          AND ($5::text IS NULL OR service = $5)
          AND ($6::text IS NULL OR environment = $6)
        GROUP BY service, environment, route_key
      )
      SELECT *
      FROM route_windows
      WHERE current_sessions >= $7
        AND current_exits >= $8
        AND current_exits::numeric / NULLIF(current_sessions, 0) >= $9
        AND (
          current_exits::numeric / NULLIF(current_sessions, 0) -
          COALESCE(baseline_exits::numeric / NULLIF(baseline_sessions, 0), 0)
        ) >= $10
      ORDER BY
        current_exits::numeric / NULLIF(current_sessions, 0) -
          COALESCE(baseline_exits::numeric / NULLIF(baseline_sessions, 0), 0) DESC,
        current_exits DESC,
        route_key ASC
      LIMIT $11
    `,
    [
      input.project_id,
      baselineFrom,
      window.from,
      window.to,
      input.service ?? null,
      input.environment ?? null,
      ROUTE_EXIT_MIN_SESSIONS,
      ROUTE_EXIT_MIN_EXITS,
      ROUTE_EXIT_MIN_RATE,
      ROUTE_EXIT_MIN_INCREASE,
      ROUTE_EXIT_LIMIT
    ]
  );

  for (const row of result.rows) {
    const service = toOpportunityString(row.service, "unknown");
    const environment = toOpportunityString(row.environment, "production");
    const routeKey = toOpportunityString(row.route_key, "unknown");
    const currentSessions = toOpportunityInteger(row.current_sessions);
    const currentExits = toOpportunityInteger(row.current_exits);
    const baselineSessions = toOpportunityInteger(row.baseline_sessions);
    const baselineExits = toOpportunityInteger(row.baseline_exits);
    const currentRate = currentSessions === 0 ? 0 : currentExits / currentSessions;
    const baselineRate = baselineSessions === 0 ? 0 : baselineExits / baselineSessions;
    const increase = Math.max(0, currentRate - baselineRate);
    await upsertAnalyticsOpportunity(db, {
      projectId: input.project_id,
      service,
      environment,
      kind: "route_health",
      severity: rateSeverity(increase, currentExits),
      confidence: confidence(currentSessions, increase),
      fingerprint: ["analytics-opportunity.v1", "route_exit", input.project_id, service, environment, routeKey].join(":"),
      title: `Exit rate increased on ${routeKey}`,
      summary: `${currentExits} of ${currentSessions} sessions exited on ${routeKey}, an increase of ${Math.round(increase * 100)} percentage points.`,
      evidence: {
        analysis_window: window,
        baseline_window: { from: baselineFrom, to: window.from },
        thresholds: {
          min_sessions: ROUTE_EXIT_MIN_SESSIONS,
          min_exits: ROUTE_EXIT_MIN_EXITS,
          min_exit_rate: ROUTE_EXIT_MIN_RATE,
          min_exit_rate_increase: ROUTE_EXIT_MIN_INCREASE
        },
        route_key: routeKey,
        current_sessions: currentSessions,
        current_exits: currentExits,
        current_exit_rate: roundOpportunityRatio(currentRate),
        baseline_sessions: baselineSessions,
        baseline_exits: baselineExits,
        baseline_exit_rate: roundOpportunityRatio(baselineRate),
        exit_rate_increase: roundOpportunityRatio(increase)
      },
      detectedAt: window.to
    });
  }
  return { opportunities_created_or_updated: result.rows.length };
}

export async function evaluateAnalyticsIncidentImpactOpportunities(
  db: Queryable,
  input: AnalyticsOpportunityEvaluationInput
): Promise<AnalyticsOpportunityEvaluationResult> {
  const window = buildAnalyticsOpportunityEvaluationWindow(input.occurred_at);
  if (window === null) return { opportunities_created_or_updated: 0 };
  const result = await db.query<IncidentImpactCandidateRow>(
    `
      WITH affected AS (
        SELECT
          service,
          environment,
          incident_id,
          COUNT(DISTINCT subject_hash)::bigint AS affected_sessions,
          COUNT(DISTINCT route_key)::bigint AS affected_routes
        FROM analytics_incident_session_links
        WHERE project_id = $1::uuid
          AND bucket_granularity = 'day'
          AND bucket_start >= $2::timestamptz
          AND bucket_start < $3::timestamptz
          AND ($4::text IS NULL OR service = $4)
          AND ($5::text IS NULL OR environment = $5)
        GROUP BY service, environment, incident_id
      ), totals AS (
        SELECT service, environment, COUNT(DISTINCT subject_hash)::bigint AS total_sessions
        FROM analytics_rollup_uniques
        WHERE project_id = $1::uuid
          AND rollup_kind = 'session'
          AND bucket_granularity = 'day'
          AND bucket_start >= $2::timestamptz
          AND bucket_start < $3::timestamptz
        GROUP BY service, environment
      )
      SELECT affected.*, totals.total_sessions
      FROM affected
      JOIN totals USING (service, environment)
      WHERE affected.affected_sessions >= $6
        AND affected.affected_sessions::numeric / NULLIF(totals.total_sessions, 0) >= $7
      ORDER BY affected.affected_sessions DESC, affected.incident_id ASC
      LIMIT $8
    `,
    [
      input.project_id,
      window.from,
      window.to,
      input.service ?? null,
      input.environment ?? null,
      INCIDENT_IMPACT_MIN_SESSIONS,
      INCIDENT_IMPACT_MIN_SHARE,
      INCIDENT_IMPACT_LIMIT
    ]
  );

  for (const row of result.rows) {
    const service = toOpportunityString(row.service, "unknown");
    const environment = toOpportunityString(row.environment, "production");
    const incidentId = toOpportunityString(row.incident_id, "");
    if (incidentId.length === 0) continue;
    const affectedSessions = toOpportunityInteger(row.affected_sessions);
    const totalSessions = toOpportunityInteger(row.total_sessions);
    const affectedRoutes = toOpportunityInteger(row.affected_routes);
    const share = totalSessions === 0 ? 0 : affectedSessions / totalSessions;
    await upsertAnalyticsOpportunity(db, {
      projectId: input.project_id,
      service,
      environment,
      kind: "incident_impact",
      severity: share >= 0.25 ? "high" : share >= 0.15 ? "medium" : "low",
      confidence: confidence(totalSessions, share),
      fingerprint: ["analytics-opportunity.v1", "incident_impact", input.project_id, incidentId].join(":"),
      title: `Incident affected ${affectedSessions} analytics sessions`,
      summary: `${affectedSessions} of ${totalSessions} sessions were correlated with this incident across ${affectedRoutes} routes.`,
      evidence: {
        analysis_window: window,
        thresholds: {
          min_affected_sessions: INCIDENT_IMPACT_MIN_SESSIONS,
          min_affected_share: INCIDENT_IMPACT_MIN_SHARE
        },
        incident_id: incidentId,
        affected_sessions: affectedSessions,
        total_sessions: totalSessions,
        affected_routes: affectedRoutes,
        affected_share: roundOpportunityRatio(share)
      },
      relatedIncidentIds: [incidentId],
      detectedAt: window.to
    });
  }
  return { opportunities_created_or_updated: result.rows.length };
}

export async function evaluateAnalyticsDeployConversionOpportunities(
  db: Queryable,
  input: AnalyticsOpportunityEvaluationInput
): Promise<AnalyticsOpportunityEvaluationResult> {
  const window = buildAnalyticsOpportunityEvaluationWindow(input.occurred_at);
  if (window === null) return { opportunities_created_or_updated: 0 };
  const result = await db.query<DeployConversionCandidateRow>(
    `
      WITH deployment_sessions AS (
        SELECT service, environment, deploy_id,
          COUNT(DISTINCT subject_hash)::bigint AS sessions,
          MAX(bucket_start) AS last_seen_at
        FROM analytics_rollup_uniques
        WHERE project_id = $1::uuid
          AND rollup_kind = 'session'
          AND bucket_granularity = 'day'
          AND bucket_start >= $2::timestamptz
          AND bucket_start < $3::timestamptz
          AND deploy_id IS NOT NULL
          AND ($4::text IS NULL OR service = $4)
          AND ($5::text IS NULL OR environment = $5)
        GROUP BY service, environment, deploy_id
      ), ranked_deployments AS (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY service, environment ORDER BY last_seen_at DESC, deploy_id DESC
        ) AS deploy_rank
        FROM deployment_sessions
      ), conversion_keys AS (
        SELECT DISTINCT service, environment, split_part(rollup_key, '|conversion:', 2) AS conversion_key
        FROM analytics_rollup_uniques
        WHERE project_id = $1::uuid
          AND rollup_kind = 'action_session'
          AND bucket_granularity = 'day'
          AND bucket_start >= $2::timestamptz
          AND bucket_start < $3::timestamptz
          AND rollup_key LIKE '%|conversion:%'
      ), rates AS (
        SELECT ranked.service, ranked.environment, ranked.deploy_id, ranked.deploy_rank,
          ranked.sessions, keys.conversion_key,
          COUNT(DISTINCT actions.subject_hash)::bigint AS conversions
        FROM ranked_deployments ranked
        JOIN conversion_keys keys USING (service, environment)
        LEFT JOIN analytics_rollup_uniques actions
          ON actions.project_id = $1::uuid
         AND actions.service = ranked.service
         AND actions.environment = ranked.environment
         AND actions.deploy_id = ranked.deploy_id
         AND actions.rollup_kind = 'action_session'
         AND actions.bucket_granularity = 'day'
         AND actions.bucket_start >= $2::timestamptz
         AND actions.bucket_start < $3::timestamptz
         AND split_part(actions.rollup_key, '|conversion:', 2) = keys.conversion_key
        WHERE ranked.deploy_rank <= 2
        GROUP BY ranked.service, ranked.environment, ranked.deploy_id, ranked.deploy_rank,
          ranked.sessions, keys.conversion_key
      )
      SELECT current.service, current.environment, current.conversion_key,
        current.deploy_id AS current_deploy_id,
        baseline.deploy_id AS baseline_deploy_id,
        current.sessions AS current_sessions,
        current.conversions AS current_conversions,
        baseline.sessions AS baseline_sessions,
        baseline.conversions AS baseline_conversions
      FROM rates current
      JOIN rates baseline
        ON baseline.service = current.service
       AND baseline.environment = current.environment
       AND baseline.conversion_key = current.conversion_key
       AND baseline.deploy_rank = 2
      WHERE current.deploy_rank = 1
        AND current.sessions >= $6
        AND baseline.sessions >= $6
        AND baseline.conversions::numeric / NULLIF(baseline.sessions, 0) -
          current.conversions::numeric / NULLIF(current.sessions, 0) >= $7
      ORDER BY
        baseline.conversions::numeric / NULLIF(baseline.sessions, 0) -
          current.conversions::numeric / NULLIF(current.sessions, 0) DESC,
        current.conversion_key ASC
      LIMIT $8
    `,
    [
      input.project_id,
      window.from,
      window.to,
      input.service ?? null,
      input.environment ?? null,
      DEPLOY_CONVERSION_MIN_SESSIONS,
      DEPLOY_CONVERSION_MIN_DECREASE,
      DEPLOY_CONVERSION_LIMIT
    ]
  );

  for (const row of result.rows) {
    const service = toOpportunityString(row.service, "unknown");
    const environment = toOpportunityString(row.environment, "production");
    const conversionKey = toOpportunityString(row.conversion_key, "unknown");
    const currentDeploy = toOpportunityString(row.current_deploy_id, "unknown");
    const baselineDeploy = toOpportunityString(row.baseline_deploy_id, "unknown");
    const currentSessions = toOpportunityInteger(row.current_sessions);
    const currentConversions = toOpportunityInteger(row.current_conversions);
    const baselineSessions = toOpportunityInteger(row.baseline_sessions);
    const baselineConversions = toOpportunityInteger(row.baseline_conversions);
    const currentRate = currentSessions === 0 ? 0 : currentConversions / currentSessions;
    const baselineRate = baselineSessions === 0 ? 0 : baselineConversions / baselineSessions;
    const decrease = Math.max(0, baselineRate - currentRate);
    await upsertAnalyticsOpportunity(db, {
      projectId: input.project_id,
      service,
      environment,
      kind: "deploy_comparison",
      severity: rateSeverity(decrease, baselineConversions - currentConversions),
      confidence: confidence(Math.min(currentSessions, baselineSessions), decrease),
      fingerprint: ["analytics-opportunity.v1", "deploy_conversion", input.project_id, service, environment, currentDeploy, conversionKey].join(":"),
      title: `${conversionKey} conversion decreased after ${currentDeploy}`,
      summary: `Conversion decreased by ${Math.round(decrease * 100)} percentage points compared with ${baselineDeploy}.`,
      evidence: {
        analysis_window: window,
        thresholds: {
          min_sessions_per_deploy: DEPLOY_CONVERSION_MIN_SESSIONS,
          min_conversion_rate_decrease: DEPLOY_CONVERSION_MIN_DECREASE
        },
        conversion_key: conversionKey,
        deploy_id: currentDeploy,
        baseline_deploy_id: baselineDeploy,
        current_sessions: currentSessions,
        current_conversions: currentConversions,
        current_conversion_rate: roundOpportunityRatio(currentRate),
        baseline_sessions: baselineSessions,
        baseline_conversions: baselineConversions,
        baseline_conversion_rate: roundOpportunityRatio(baselineRate),
        conversion_rate_decrease: roundOpportunityRatio(decrease)
      },
      relatedDeployIds: [currentDeploy, baselineDeploy],
      detectedAt: window.to
    });
  }
  return { opportunities_created_or_updated: result.rows.length };
}

export async function resolveStaleAnalyticsOpportunities(
  db: Queryable,
  input: AnalyticsOpportunityEvaluationInput
): Promise<void> {
  const window = buildAnalyticsOpportunityEvaluationWindow(input.occurred_at);
  if (window === null) return;
  await db.query(
    `
      UPDATE analytics_opportunities
      SET status = 'resolved', resolved_at = $3::timestamptz, updated_at = $3::timestamptz
      WHERE project_id = $1::uuid
        AND status = 'open'
        AND last_detected_at < $2::timestamptz
        AND ($4::text IS NULL OR service = $4)
        AND ($5::text IS NULL OR environment = $5)
    `,
    [input.project_id, window.from, window.to, input.service ?? null, input.environment ?? null]
  );
}

function rateSeverity(delta: number, affected: number): AnalyticsBundleSeverity {
  if (delta >= 0.3 && affected >= 30) return "high";
  if (delta >= 0.2 || affected >= 20) return "medium";
  return "low";
}

function confidence(sampleSize: number, effectSize: number): number {
  return roundOpportunityRatio(
    Math.min(0.95, 0.5 + Math.min(0.25, sampleSize / 400) + Math.min(0.2, effectSize * 0.5))
  );
}
