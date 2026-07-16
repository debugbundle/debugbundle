import { createHash } from "node:crypto";

import type {
  AnalyticsBundleAnalysisKind,
  AnalyticsBundleSeverity,
  AnalyticsOpportunityRecord
} from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";

const ANALYTICS_OPPORTUNITY_LOOKBACK_DAYS = 7;

export interface AnalyticsOpportunityEvaluationInput {
  project_id: string;
  occurred_at: string;
  service?: string | undefined;
  environment?: string | undefined;
}

export interface AnalyticsOpportunityEvaluationResult {
  opportunities_created_or_updated: number;
}

export async function upsertAnalyticsOpportunity(
  db: Queryable,
  input: {
    projectId: string;
    service: string;
    environment: string;
    kind: AnalyticsBundleAnalysisKind;
    severity: AnalyticsBundleSeverity;
    confidence: AnalyticsOpportunityRecord["confidence"];
    fingerprint: string;
    title: string;
    summary: string;
    evidence: Record<string, unknown>;
    detectedAt: string;
    relatedIncidentIds?: string[] | undefined;
    relatedDeployIds?: string[] | undefined;
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
        $13::uuid[],
        $14::text[],
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
        related_incident_ids = EXCLUDED.related_incident_ids,
        related_deploy_ids = EXCLUDED.related_deploy_ids,
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
      input.detectedAt,
      input.relatedIncidentIds ?? [],
      input.relatedDeployIds ?? []
    ]
  );
}

export function buildAnalyticsOpportunityEvaluationWindow(
  occurredAt: string
): { from: string; to: string } | null {
  const parsed = Date.parse(occurredAt);
  if (Number.isNaN(parsed)) {
    return null;
  }

  const anchor = new Date(parsed);
  const dayStart = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate());
  const from = new Date(dayStart - (ANALYTICS_OPPORTUNITY_LOOKBACK_DAYS - 1) * 24 * 60 * 60 * 1000);
  const to = new Date(dayStart + 24 * 60 * 60 * 1000);

  return { from: from.toISOString(), to: to.toISOString() };
}

export function toOpportunityString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

export function toOpportunityInteger(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  }
  return 0;
}

export function roundOpportunityRatio(value: number): number {
  return Math.round(value * 10000) / 10000;
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
