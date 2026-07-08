import { createHash } from "node:crypto";

import type {
  AnalyticsBundleSeverity,
  AnalyticsOpportunityRecord
} from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";

const FUNNEL_DROPOFF_LOOKBACK_DAYS = 7;
const FUNNEL_DROPOFF_MIN_SESSIONS = 20;
const FUNNEL_DROPOFF_MIN_DROPOFFS = 10;
const FUNNEL_DROPOFF_MIN_RATE = 0.4;
const FUNNEL_DROPOFF_LIMIT = 5;

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
  evaluateProjectOpportunities(input: AnalyticsOpportunityEvaluationInput): Promise<AnalyticsOpportunityEvaluationResult>;
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

export function createPostgresAnalyticsOpportunityEvaluator(db: Queryable): AnalyticsOpportunityEvaluator {
  return {
    async evaluateProjectOpportunities(input) {
      return evaluateAnalyticsFunnelDropoffOpportunities(db, input);
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
        'funnel_dropoff',
        'open',
        $5,
        $6,
        $7,
        $8,
        $9,
        $10::jsonb,
        '{}'::uuid[],
        '{}'::text[],
        $11::timestamptz,
        $11::timestamptz,
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
      stableUuidFromFingerprint(fingerprint),
      projectId,
      candidate.service,
      candidate.environment,
      severity,
      getFunnelDropoffConfidence(candidate),
      fingerprint,
      title,
      summary,
      JSON.stringify(evidence),
      window.to
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
  const from = new Date(dayStart - (FUNNEL_DROPOFF_LOOKBACK_DAYS - 1) * 24 * 60 * 60 * 1000);
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

function buildFunnelDropoffFingerprint(projectId: string, candidate: FunnelDropoffCandidate): string {
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

function getFunnelDropoffSeverity(candidate: FunnelDropoffCandidate): AnalyticsBundleSeverity {
  if (candidate.dropoff_rate >= 0.65 && candidate.dropoffs >= 30) {
    return "high";
  }

  if (candidate.dropoff_rate >= 0.5 || candidate.dropoffs >= 20) {
    return "medium";
  }

  return "low";
}

function getFunnelDropoffConfidence(candidate: FunnelDropoffCandidate): AnalyticsOpportunityRecord["confidence"] {
  const sampleWeight = Math.min(0.15, candidate.sessions_entered / 1000);
  const rateWeight = Math.min(0.3, candidate.dropoff_rate * 0.3);
  return roundRatio(0.5 + sampleWeight + rateWeight);
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
