import { createHash } from "node:crypto";

import type {
  AnalyticsBundleSeverity,
  AnalyticsOpportunityRecord
} from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";

const ANALYTICS_OPPORTUNITY_LOOKBACK_DAYS = 7;
const FUNNEL_DROPOFF_MIN_SESSIONS = 20;
const FUNNEL_DROPOFF_MIN_DROPOFFS = 10;
const FUNNEL_DROPOFF_MIN_RATE = 0.4;
const FUNNEL_DROPOFF_LIMIT = 5;
const JOURNEY_FRICTION_MIN_LOOP_TRANSITIONS = 20;
const JOURNEY_FRICTION_MIN_UNIQUE_SESSIONS = 10;
const JOURNEY_FRICTION_MIN_REVERSE_TRANSITIONS = 5;
const JOURNEY_FRICTION_LIMIT = 5;
const MARKER_FRICTION_ACTION_KEYS = [
  "marker:friction.repeated_click",
  "marker:friction.dead_click",
  "marker:friction.backtrack"
] as const;
const MARKER_FRICTION_MIN_EVENTS = 20;
const MARKER_FRICTION_MIN_UNIQUE_SESSIONS = 10;
const MARKER_FRICTION_LIMIT = 5;

export interface AnalyticsOpportunityEvaluationInput {
  project_id: string;
  occurred_at: string;
  service?: string | undefined;
  environment?: string | undefined;
}

export interface AnalyticsOpportunityEvaluationResult {
  opportunities_created_or_updated: number;
}

export interface AnalyticsOpportunityEvaluator {
  evaluateProjectOpportunities(
    input: AnalyticsOpportunityEvaluationInput
  ): Promise<AnalyticsOpportunityEvaluationResult>;
}

type FunnelDropoffCandidateRow = {
  service: unknown;
  environment: unknown;
  funnel_key: unknown;
  step_key: unknown;
  step_order: unknown;
  sessions_entered: unknown;
  sessions_completed: unknown;
  dropoffs: unknown;
};

interface FunnelDropoffCandidate {
  service: string;
  environment: string;
  funnel_key: string;
  step_key: string;
  step_order: number;
  sessions_entered: number;
  sessions_completed: number;
  dropoffs: number;
  dropoff_rate: number;
}

type JourneyFrictionCandidateRow = {
  service: unknown;
  environment: unknown;
  from_route_key: unknown;
  to_route_key: unknown;
  forward_transition_count: unknown;
  reverse_transition_count: unknown;
  total_loop_transitions: unknown;
  unique_sessions: unknown;
};

interface JourneyFrictionCandidate {
  service: string;
  environment: string;
  from_route_key: string;
  to_route_key: string;
  forward_transition_count: number;
  reverse_transition_count: number;
  total_loop_transitions: number;
  unique_sessions: number;
}

type MarkerFrictionCandidateRow = {
  service: unknown;
  environment: unknown;
  action_key: unknown;
  route_key: unknown;
  event_count: unknown;
  unique_sessions: unknown;
};

interface MarkerFrictionCandidate {
  service: string;
  environment: string;
  marker_key: (typeof MARKER_FRICTION_ACTION_KEYS)[number];
  route_key: string;
  event_count: number;
  unique_sessions: number;
}

type AnalyticsOpportunityKind = "funnel_dropoff" | "journey_friction";

export function createPostgresAnalyticsOpportunityEvaluator(
  db: Queryable
): AnalyticsOpportunityEvaluator {
  return {
    async evaluateProjectOpportunities(input) {
      const funnelDropoffResult = await evaluateAnalyticsFunnelDropoffOpportunities(db, input);
      const journeyFrictionResult = await evaluateAnalyticsJourneyFrictionOpportunities(db, input);
      const markerFrictionResult = await evaluateAnalyticsMarkerFrictionOpportunities(db, input);

      return {
        opportunities_created_or_updated:
          funnelDropoffResult.opportunities_created_or_updated +
          journeyFrictionResult.opportunities_created_or_updated +
          markerFrictionResult.opportunities_created_or_updated
      };
    }
  };
}

export async function evaluateAnalyticsFunnelDropoffOpportunities(
  db: Queryable,
  input: AnalyticsOpportunityEvaluationInput
): Promise<AnalyticsOpportunityEvaluationResult> {
  const window = buildEvaluationWindow(input.occurred_at);
  if (window === null) {
    return { opportunities_created_or_updated: 0 };
  }

  const candidates = await readFunnelDropoffCandidates(db, input, window);
  let recorded = 0;
  for (const candidate of candidates) {
    await upsertFunnelDropoffOpportunity(db, input.project_id, window, candidate);
    recorded += 1;
  }

  return { opportunities_created_or_updated: recorded };
}

export async function evaluateAnalyticsJourneyFrictionOpportunities(
  db: Queryable,
  input: AnalyticsOpportunityEvaluationInput
): Promise<AnalyticsOpportunityEvaluationResult> {
  const window = buildEvaluationWindow(input.occurred_at);
  if (window === null) {
    return { opportunities_created_or_updated: 0 };
  }

  const candidates = await readJourneyFrictionCandidates(db, input, window);
  let recorded = 0;
  for (const candidate of candidates) {
    await upsertJourneyFrictionOpportunity(db, input.project_id, window, candidate);
    recorded += 1;
  }

  return { opportunities_created_or_updated: recorded };
}

export async function evaluateAnalyticsMarkerFrictionOpportunities(
  db: Queryable,
  input: AnalyticsOpportunityEvaluationInput
): Promise<AnalyticsOpportunityEvaluationResult> {
  const window = buildEvaluationWindow(input.occurred_at);
  if (window === null) {
    return { opportunities_created_or_updated: 0 };
  }

  const candidates = await readMarkerFrictionCandidates(db, input, window);
  let recorded = 0;
  for (const candidate of candidates) {
    await upsertMarkerFrictionOpportunity(db, input.project_id, window, candidate);
    recorded += 1;
  }

  return { opportunities_created_or_updated: recorded };
}

async function readFunnelDropoffCandidates(
  db: Queryable,
  input: AnalyticsOpportunityEvaluationInput,
  window: { from: string; to: string }
): Promise<FunnelDropoffCandidate[]> {
  const result = await db.query<FunnelDropoffCandidateRow>(
    `
      SELECT
        service,
        environment,
        funnel_key,
        step_key,
        MIN(step_order)::integer AS step_order,
        COALESCE(SUM(sessions_entered), 0)::bigint AS sessions_entered,
        COALESCE(SUM(sessions_completed), 0)::bigint AS sessions_completed,
        COALESCE(SUM(dropoffs), 0)::bigint AS dropoffs
      FROM analytics_funnel_rollups
      WHERE project_id = $1::uuid
        AND bucket_granularity = 'day'
        AND bucket_start >= $2::timestamptz
        AND bucket_start < $3::timestamptz
        AND ($4::text IS NULL OR service = $4)
        AND ($5::text IS NULL OR environment = $5)
      GROUP BY service, environment, funnel_key, step_key
      HAVING COALESCE(SUM(sessions_entered), 0) >= $6
        AND COALESCE(SUM(dropoffs), 0) >= $7
        AND COALESCE(SUM(dropoffs), 0)::numeric / NULLIF(COALESCE(SUM(sessions_entered), 0), 0) >= $8
      ORDER BY dropoffs DESC, sessions_entered DESC, funnel_key ASC, step_order ASC, step_key ASC
      LIMIT $9
    `,
    [
      input.project_id,
      window.from,
      window.to,
      input.service ?? null,
      input.environment ?? null,
      FUNNEL_DROPOFF_MIN_SESSIONS,
      FUNNEL_DROPOFF_MIN_DROPOFFS,
      FUNNEL_DROPOFF_MIN_RATE,
      FUNNEL_DROPOFF_LIMIT
    ]
  );

  return result.rows.map(mapFunnelDropoffCandidate);
}

async function readJourneyFrictionCandidates(
  db: Queryable,
  input: AnalyticsOpportunityEvaluationInput,
  window: { from: string; to: string }
): Promise<JourneyFrictionCandidate[]> {
  const result = await db.query<JourneyFrictionCandidateRow>(
    `
      WITH transitions AS (
        SELECT
          service,
          environment,
          bucket_start,
          from_route_key,
          to_route_key,
          COALESCE(SUM(transition_count), 0)::bigint AS transition_count,
          COALESCE(SUM(unique_sessions), 0)::bigint AS unique_sessions
        FROM analytics_transition_rollups
        WHERE project_id = $1::uuid
          AND bucket_granularity = 'day'
          AND bucket_start >= $2::timestamptz
          AND bucket_start < $3::timestamptz
          AND ($4::text IS NULL OR service = $4)
          AND ($5::text IS NULL OR environment = $5)
        GROUP BY service, environment, bucket_start, from_route_key, to_route_key
      )
      SELECT
        forward.service,
        forward.environment,
        forward.from_route_key,
        forward.to_route_key,
        COALESCE(SUM(forward.transition_count), 0)::bigint AS forward_transition_count,
        COALESCE(SUM(reverse.transition_count), 0)::bigint AS reverse_transition_count,
        (
          COALESCE(SUM(forward.transition_count), 0) +
          COALESCE(SUM(reverse.transition_count), 0)
        )::bigint AS total_loop_transitions,
        GREATEST(
          COALESCE(SUM(forward.unique_sessions), 0),
          COALESCE(SUM(reverse.unique_sessions), 0)
        )::bigint AS unique_sessions
      FROM transitions forward
      INNER JOIN transitions reverse
        ON reverse.service = forward.service
       AND reverse.environment = forward.environment
       AND reverse.bucket_start = forward.bucket_start
       AND reverse.from_route_key = forward.to_route_key
       AND reverse.to_route_key = forward.from_route_key
      WHERE forward.from_route_key < forward.to_route_key
      GROUP BY forward.service, forward.environment, forward.from_route_key, forward.to_route_key
      HAVING (
          COALESCE(SUM(forward.transition_count), 0) +
          COALESCE(SUM(reverse.transition_count), 0)
        ) >= $6
        AND GREATEST(
          COALESCE(SUM(forward.unique_sessions), 0),
          COALESCE(SUM(reverse.unique_sessions), 0)
        ) >= $7
        AND LEAST(
          COALESCE(SUM(forward.transition_count), 0),
          COALESCE(SUM(reverse.transition_count), 0)
        ) >= $8
      ORDER BY total_loop_transitions DESC, unique_sessions DESC, forward.from_route_key ASC, forward.to_route_key ASC
      LIMIT $9
    `,
    [
      input.project_id,
      window.from,
      window.to,
      input.service ?? null,
      input.environment ?? null,
      JOURNEY_FRICTION_MIN_LOOP_TRANSITIONS,
      JOURNEY_FRICTION_MIN_UNIQUE_SESSIONS,
      JOURNEY_FRICTION_MIN_REVERSE_TRANSITIONS,
      JOURNEY_FRICTION_LIMIT
    ]
  );

  return result.rows.map(mapJourneyFrictionCandidate);
}

async function readMarkerFrictionCandidates(
  db: Queryable,
  input: AnalyticsOpportunityEvaluationInput,
  window: { from: string; to: string }
): Promise<MarkerFrictionCandidate[]> {
  const result = await db.query<MarkerFrictionCandidateRow>(
    `
      SELECT
        service,
        environment,
        action_key,
        route_key,
        COALESCE(SUM(event_count), 0)::bigint AS event_count,
        COALESCE(SUM(unique_sessions), 0)::bigint AS unique_sessions
      FROM analytics_action_rollups
      WHERE project_id = $1::uuid
        AND bucket_granularity = 'day'
        AND bucket_start >= $2::timestamptz
        AND bucket_start < $3::timestamptz
        AND ($4::text IS NULL OR service = $4)
        AND ($5::text IS NULL OR environment = $5)
        AND action_key = ANY($6::text[])
        AND route_key <> ''
      GROUP BY service, environment, action_key, route_key
      HAVING COALESCE(SUM(event_count), 0) >= $7
        AND COALESCE(SUM(unique_sessions), 0) >= $8
      ORDER BY event_count DESC, unique_sessions DESC, action_key ASC, route_key ASC
      LIMIT $9
    `,
    [
      input.project_id,
      window.from,
      window.to,
      input.service ?? null,
      input.environment ?? null,
      [...MARKER_FRICTION_ACTION_KEYS],
      MARKER_FRICTION_MIN_EVENTS,
      MARKER_FRICTION_MIN_UNIQUE_SESSIONS,
      MARKER_FRICTION_LIMIT
    ]
  );

  return result.rows.flatMap(mapMarkerFrictionCandidate);
}

async function upsertFunnelDropoffOpportunity(
  db: Queryable,
  projectId: string,
  window: { from: string; to: string },
  candidate: FunnelDropoffCandidate
): Promise<void> {
  const fingerprint = buildFunnelDropoffFingerprint(projectId, candidate);
  const severity = getFunnelDropoffSeverity(candidate);
  const evidence = buildFunnelDropoffEvidence(window, candidate);
  const title = `Funnel dropoff increased at ${candidate.step_key}`;
  const summary = `${candidate.dropoffs} of ${candidate.sessions_entered} sessions dropped at ${candidate.step_key} in ${candidate.funnel_key}.`;

  await upsertAnalyticsOpportunity(db, {
    projectId,
    service: candidate.service,
    environment: candidate.environment,
    kind: "funnel_dropoff",
    severity,
    confidence: getFunnelDropoffConfidence(candidate),
    fingerprint,
    title,
    summary,
    evidence,
    detectedAt: window.to
  });
}

async function upsertJourneyFrictionOpportunity(
  db: Queryable,
  projectId: string,
  window: { from: string; to: string },
  candidate: JourneyFrictionCandidate
): Promise<void> {
  const fingerprint = buildJourneyFrictionFingerprint(projectId, candidate);
  const severity = getJourneyFrictionSeverity(candidate);
  const evidence = buildJourneyFrictionEvidence(window, candidate);
  const title = `Navigation loop between ${candidate.from_route_key} and ${candidate.to_route_key}`;
  const summary =
    `${candidate.total_loop_transitions} transitions moved back and forth between ` +
    `${candidate.from_route_key} and ${candidate.to_route_key} across ${candidate.unique_sessions} sessions.`;

  await upsertAnalyticsOpportunity(db, {
    projectId,
    service: candidate.service,
    environment: candidate.environment,
    kind: "journey_friction",
    severity,
    confidence: getJourneyFrictionConfidence(candidate),
    fingerprint,
    title,
    summary,
    evidence,
    detectedAt: window.to
  });
}

async function upsertMarkerFrictionOpportunity(
  db: Queryable,
  projectId: string,
  window: { from: string; to: string },
  candidate: MarkerFrictionCandidate
): Promise<void> {
  const fingerprint = buildMarkerFrictionFingerprint(projectId, candidate);
  const title = `Repeated ${candidate.marker_key.slice("marker:friction.".length).replaceAll("_", " ")} on ${candidate.route_key}`;
  const summary =
    `${candidate.event_count} ${candidate.marker_key.slice("marker:".length)} markers occurred ` +
    `on ${candidate.route_key} across ${candidate.unique_sessions} sessions.`;

  await upsertAnalyticsOpportunity(db, {
    projectId,
    service: candidate.service,
    environment: candidate.environment,
    kind: "journey_friction",
    severity: getMarkerFrictionSeverity(candidate),
    confidence: getMarkerFrictionConfidence(candidate),
    fingerprint,
    title,
    summary,
    evidence: buildMarkerFrictionEvidence(window, candidate),
    detectedAt: window.to
  });
}

async function upsertAnalyticsOpportunity(
  db: Queryable,
  input: {
    projectId: string;
    service: string;
    environment: string;
    kind: AnalyticsOpportunityKind;
    severity: AnalyticsBundleSeverity;
    confidence: AnalyticsOpportunityRecord["confidence"];
    fingerprint: string;
    title: string;
    summary: string;
    evidence: Record<string, unknown>;
    detectedAt: string;
  }
): Promise<void> {
  await db.query<{ id: string }>(
    `
      INSERT INTO analytics_opportunities (
        id,
        project_id,
        service,
        environment,
        kind,
        status,
        severity,
        confidence,
        fingerprint,
        title,
        summary,
        evidence,
        related_incident_ids,
        related_deploy_ids,
        first_detected_at,
        last_detected_at,
        bundle_status
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3,
        $4,
        $5,
        'open',
        $6,
        $7,
        $8,
        $9,
        $10,
        $11::jsonb,
        '{}'::uuid[],
        '{}'::text[],
        $12::timestamptz,
        $12::timestamptz,
        'not_requested'
      )
      ON CONFLICT (project_id, fingerprint)
      DO UPDATE SET
        service = EXCLUDED.service,
        environment = EXCLUDED.environment,
        severity = EXCLUDED.severity,
        confidence = EXCLUDED.confidence,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        evidence = EXCLUDED.evidence,
        status = CASE
          WHEN analytics_opportunities.status = 'snoozed'
            AND (
              analytics_opportunities.snoozed_until IS NULL
              OR analytics_opportunities.snoozed_until > EXCLUDED.last_detected_at
            )
            THEN analytics_opportunities.status
          ELSE 'open'
        END,
        resolved_at = CASE
          WHEN analytics_opportunities.status = 'snoozed'
            AND (
              analytics_opportunities.snoozed_until IS NULL
              OR analytics_opportunities.snoozed_until > EXCLUDED.last_detected_at
            )
            THEN analytics_opportunities.resolved_at
          ELSE NULL
        END,
        snoozed_until = CASE
          WHEN analytics_opportunities.status = 'snoozed'
            AND (
              analytics_opportunities.snoozed_until IS NULL
              OR analytics_opportunities.snoozed_until > EXCLUDED.last_detected_at
            )
            THEN analytics_opportunities.snoozed_until
          ELSE NULL
        END,
        last_detected_at = GREATEST(analytics_opportunities.last_detected_at, EXCLUDED.last_detected_at),
        updated_at = now()
      RETURNING id::text AS id
    `,
    [
      stableUuidFromFingerprint(input.fingerprint),
      input.projectId,
      input.service,
      input.environment,
      input.kind,
      input.severity,
      input.confidence,
      input.fingerprint,
      input.title,
      input.summary,
      JSON.stringify(input.evidence),
      input.detectedAt
    ]
  );
}

function buildEvaluationWindow(occurredAt: string): { from: string; to: string } | null {
  const parsed = Date.parse(occurredAt);
  if (Number.isNaN(parsed)) {
    return null;
  }

  const anchor = new Date(parsed);
  const dayStart = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate());
  const from = new Date(dayStart - (ANALYTICS_OPPORTUNITY_LOOKBACK_DAYS - 1) * 24 * 60 * 60 * 1000);
  const to = new Date(dayStart + 24 * 60 * 60 * 1000);

  return {
    from: from.toISOString(),
    to: to.toISOString()
  };
}

function mapFunnelDropoffCandidate(row: FunnelDropoffCandidateRow): FunnelDropoffCandidate {
  const sessionsEntered = toNonNegativeInteger(row.sessions_entered);
  const dropoffs = toNonNegativeInteger(row.dropoffs);

  return {
    service: toNonEmptyString(row.service, "unknown"),
    environment: toNonEmptyString(row.environment, "production"),
    funnel_key: toNonEmptyString(row.funnel_key, "unknown"),
    step_key: toNonEmptyString(row.step_key, "unknown"),
    step_order: toNonNegativeInteger(row.step_order),
    sessions_entered: sessionsEntered,
    sessions_completed: toNonNegativeInteger(row.sessions_completed),
    dropoffs,
    dropoff_rate: sessionsEntered > 0 ? Math.min(1, dropoffs / sessionsEntered) : 0
  };
}

function mapJourneyFrictionCandidate(row: JourneyFrictionCandidateRow): JourneyFrictionCandidate {
  return {
    service: toNonEmptyString(row.service, "unknown"),
    environment: toNonEmptyString(row.environment, "production"),
    from_route_key: toNonEmptyString(row.from_route_key, "unknown"),
    to_route_key: toNonEmptyString(row.to_route_key, "unknown"),
    forward_transition_count: toNonNegativeInteger(row.forward_transition_count),
    reverse_transition_count: toNonNegativeInteger(row.reverse_transition_count),
    total_loop_transitions: toNonNegativeInteger(row.total_loop_transitions),
    unique_sessions: toNonNegativeInteger(row.unique_sessions)
  };
}

function mapMarkerFrictionCandidate(row: MarkerFrictionCandidateRow): MarkerFrictionCandidate[] {
  const markerKey = typeof row.action_key === "string" ? row.action_key : null;
  if (!MARKER_FRICTION_ACTION_KEYS.includes(markerKey as (typeof MARKER_FRICTION_ACTION_KEYS)[number])) {
    return [];
  }

  const routeKey = toNonEmptyString(row.route_key, "");
  if (routeKey.length === 0) {
    return [];
  }

  return [{
    service: toNonEmptyString(row.service, "unknown"),
    environment: toNonEmptyString(row.environment, "production"),
    marker_key: markerKey as (typeof MARKER_FRICTION_ACTION_KEYS)[number],
    route_key: routeKey,
    event_count: toNonNegativeInteger(row.event_count),
    unique_sessions: toNonNegativeInteger(row.unique_sessions)
  }];
}

function buildFunnelDropoffFingerprint(
  projectId: string,
  candidate: FunnelDropoffCandidate
): string {
  return [
    "analytics-opportunity.v1",
    "funnel_dropoff",
    projectId,
    candidate.service,
    candidate.environment,
    candidate.funnel_key,
    candidate.step_key
  ].join(":");
}

function buildJourneyFrictionFingerprint(
  projectId: string,
  candidate: JourneyFrictionCandidate
): string {
  return [
    "analytics-opportunity.v1",
    "journey_friction",
    projectId,
    candidate.service,
    candidate.environment,
    candidate.from_route_key,
    candidate.to_route_key
  ].join(":");
}

function buildMarkerFrictionFingerprint(
  projectId: string,
  candidate: MarkerFrictionCandidate
): string {
  return [
    "analytics-opportunity.v1",
    "journey_friction_marker",
    projectId,
    candidate.service,
    candidate.environment,
    candidate.marker_key.slice("marker:".length),
    candidate.route_key
  ].join(":");
}

function buildFunnelDropoffEvidence(
  window: { from: string; to: string },
  candidate: FunnelDropoffCandidate
): Record<string, unknown> {
  return {
    analysis_window: window,
    thresholds: {
      min_sessions: FUNNEL_DROPOFF_MIN_SESSIONS,
      min_dropoffs: FUNNEL_DROPOFF_MIN_DROPOFFS,
      min_dropoff_rate: FUNNEL_DROPOFF_MIN_RATE
    },
    funnel_key: candidate.funnel_key,
    step_key: candidate.step_key,
    step_order: candidate.step_order,
    sessions_entered: candidate.sessions_entered,
    sessions_completed: candidate.sessions_completed,
    dropoffs: candidate.dropoffs,
    dropoff_rate: roundRatio(candidate.dropoff_rate)
  };
}

function buildJourneyFrictionEvidence(
  window: { from: string; to: string },
  candidate: JourneyFrictionCandidate
): Record<string, unknown> {
  return {
    analysis_window: window,
    thresholds: {
      min_loop_transitions: JOURNEY_FRICTION_MIN_LOOP_TRANSITIONS,
      min_unique_sessions: JOURNEY_FRICTION_MIN_UNIQUE_SESSIONS,
      min_reverse_transitions: JOURNEY_FRICTION_MIN_REVERSE_TRANSITIONS
    },
    from_route_key: candidate.from_route_key,
    to_route_key: candidate.to_route_key,
    forward_transition_count: candidate.forward_transition_count,
    reverse_transition_count: candidate.reverse_transition_count,
    total_loop_transitions: candidate.total_loop_transitions,
    unique_sessions: candidate.unique_sessions
  };
}

function buildMarkerFrictionEvidence(
  window: { from: string; to: string },
  candidate: MarkerFrictionCandidate
): Record<string, unknown> {
  return {
    source: "browser_friction_marker",
    analysis_window: window,
    thresholds: {
      min_events: MARKER_FRICTION_MIN_EVENTS,
      min_unique_sessions: MARKER_FRICTION_MIN_UNIQUE_SESSIONS
    },
    marker_key: candidate.marker_key.slice("marker:".length),
    route_key: candidate.route_key,
    event_count: candidate.event_count,
    unique_sessions: candidate.unique_sessions
  };
}

function getFunnelDropoffSeverity(candidate: FunnelDropoffCandidate): AnalyticsBundleSeverity {
  if (candidate.dropoff_rate >= 0.65 && candidate.dropoffs >= 30) {
    return "high";
  }

  if (candidate.dropoff_rate >= 0.5 || candidate.dropoffs >= 20) {
    return "medium";
  }

  return "low";
}

function getJourneyFrictionSeverity(candidate: JourneyFrictionCandidate): AnalyticsBundleSeverity {
  if (candidate.total_loop_transitions >= 80 && candidate.unique_sessions >= 30) {
    return "high";
  }

  if (candidate.total_loop_transitions >= 40 || candidate.unique_sessions >= 20) {
    return "medium";
  }

  return "low";
}

function getMarkerFrictionSeverity(candidate: MarkerFrictionCandidate): AnalyticsBundleSeverity {
  if (candidate.event_count >= 80 && candidate.unique_sessions >= 30) {
    return "high";
  }

  if (candidate.event_count >= 40 || candidate.unique_sessions >= 20) {
    return "medium";
  }

  return "low";
}

function getFunnelDropoffConfidence(
  candidate: FunnelDropoffCandidate
): AnalyticsOpportunityRecord["confidence"] {
  const sampleWeight = Math.min(0.15, candidate.sessions_entered / 1000);
  const rateWeight = Math.min(0.3, candidate.dropoff_rate * 0.3);
  return roundRatio(0.5 + sampleWeight + rateWeight);
}

function getJourneyFrictionConfidence(
  candidate: JourneyFrictionCandidate
): AnalyticsOpportunityRecord["confidence"] {
  const sessionWeight = Math.min(0.2, candidate.unique_sessions / 100);
  const loopWeight = Math.min(0.25, candidate.total_loop_transitions / 200);
  return roundRatio(0.5 + sessionWeight + loopWeight);
}

function getMarkerFrictionConfidence(
  candidate: MarkerFrictionCandidate
): AnalyticsOpportunityRecord["confidence"] {
  const sessionWeight = Math.min(0.2, candidate.unique_sessions / 100);
  const eventWeight = Math.min(0.25, candidate.event_count / 200);
  return roundRatio(0.5 + sessionWeight + eventWeight);
}

function stableUuidFromFingerprint(fingerprint: string): string {
  const bytes = Buffer.from(createHash("sha256").update(fingerprint).digest().subarray(0, 16));
  const versionByte = bytes.at(6);
  const variantByte = bytes.at(8);
  if (versionByte === undefined || variantByte === undefined) {
    throw new Error("analytics_opportunity_fingerprint_hash_invalid");
  }
  bytes[6] = (versionByte & 0x0f) | 0x40;
  bytes[8] = (variantByte & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function toNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function toNonNegativeInteger(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  }

  return 0;
}

function roundRatio(value: number): number {
  return Math.round(value * 10000) / 10000;
}
