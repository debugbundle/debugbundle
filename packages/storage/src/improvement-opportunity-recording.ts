import { createHash, randomUUID } from "node:crypto";

import type { EventEnvelope } from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";

type ImprovementOpportunityKind =
  | "warning_hotspot"
  | "slow_request"
  | "request_failure_pattern"
  | "recurring_incident"
  | "post_deploy_regression";
type ImprovementOpportunitySeverity = "low" | "medium" | "high" | "critical";

interface RecordImprovementOpportunityOccurrenceInput {
  project_id: string;
  service_name: string;
  environment: string;
  kind: ImprovementOpportunityKind;
  severity: ImprovementOpportunitySeverity;
  confidence: number;
  fingerprint: string;
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
  occurred_at: string;
  source_event_id: string;
  source_event_type: EventEnvelope["event_type"];
  threshold: number;
  related_incident_id?: string;
}

export interface RecordedImprovementOpportunityOccurrence {
  opportunity_id: string;
  occurrence_count: number;
  bundle_generation_number: number;
  should_generate_bundle: boolean;
  lifecycle_transition: "opened" | "reopened" | "none";
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

export function buildWarningHotspotFingerprint(input: {
  service_name: string;
  environment: string;
  normalized_message: string;
}): string {
  return createHash("sha256")
    .update(
      stableJson({
        kind: "warning_hotspot",
        service_name: input.service_name,
        environment: input.environment,
        normalized_message: input.normalized_message
      })
    )
    .digest("hex");
}

export function buildRequestPatternFingerprint(input: {
  kind: "slow_request" | "request_failure_pattern";
  service_name: string;
  environment: string;
  http_method: string;
  route_template: string;
  response_status: number | null;
}): string {
  return createHash("sha256")
    .update(
      stableJson({
        kind: input.kind,
        service_name: input.service_name,
        environment: input.environment,
        http_method: input.http_method,
        route_template: input.route_template,
        ...(input.kind === "request_failure_pattern" ? { response_status: input.response_status } : {})
      })
    )
    .digest("hex");
}

export function buildIncidentPatternFingerprint(input: {
  kind: "recurring_incident" | "post_deploy_regression";
  incident_id: string;
  deploy_key?: string | null;
}): string {
  return createHash("sha256")
    .update(
      stableJson({
        kind: input.kind,
        incident_id: input.incident_id,
        ...(input.kind === "post_deploy_regression" ? { deploy_key: input.deploy_key ?? null } : {})
      })
    )
    .digest("hex");
}

export async function recordImprovementOpportunityOccurrence(
  db: Queryable,
  input: RecordImprovementOpportunityOccurrenceInput
): Promise<RecordedImprovementOpportunityOccurrence | null> {
  const result = await db.query<{
    opportunity_id: string;
    occurrence_count: number;
    bundle_generation_number: number;
    event_recorded: boolean;
    opportunity_created: boolean;
    prior_status: "open" | "resolved" | "snoozed" | null;
  } & Record<string, unknown>>(
    `
      WITH existing_opportunity AS (
        SELECT status
        FROM improvement_opportunities
        WHERE project_id = $2::uuid
          AND fingerprint = $8
        LIMIT 1
      ),
      existing_event AS (
        SELECT 1
        FROM improvement_opportunity_events ioe
        JOIN improvement_opportunities existing ON existing.id = ioe.improvement_opportunity_id
        WHERE existing.project_id = $2::uuid
          AND existing.fingerprint = $8
          AND ioe.event_id = $13::uuid
        LIMIT 1
      ),
      upserted AS (
        INSERT INTO improvement_opportunities (
          id,
          project_id,
          service_id,
          service_name,
          environment,
          kind,
          status,
          severity,
          confidence,
          fingerprint,
          title,
          summary,
          occurrence_count,
          evidence,
          first_detected_at,
          last_detected_at,
          last_source_event_id,
          related_incident_ids,
          created_at,
          updated_at
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          (
            SELECT s.id
            FROM services s
            WHERE s.project_id = $2::uuid
              AND s.name = $3
              AND s.environment = $4
            ORDER BY s.created_at DESC, s.id DESC
            LIMIT 1
          ),
          $3,
          $4,
          $5,
          'open',
          $6,
          $7::numeric,
          $8,
          $9,
          $10,
          1,
          $11::jsonb,
          $12::timestamptz,
          $12::timestamptz,
          $13::uuid,
          CASE WHEN $15::uuid IS NULL THEN '{}'::uuid[] ELSE ARRAY[$15::uuid] END,
          now(),
          now()
        )
        ON CONFLICT (project_id, fingerprint)
        DO UPDATE SET
          service_id = CASE
            WHEN EXISTS (SELECT 1 FROM existing_event) THEN improvement_opportunities.service_id
            ELSE COALESCE(
              improvement_opportunities.service_id,
              (
                SELECT s.id
                FROM services s
                WHERE s.project_id = EXCLUDED.project_id
                  AND s.name = EXCLUDED.service_name
                  AND s.environment = EXCLUDED.environment
                ORDER BY s.created_at DESC, s.id DESC
                LIMIT 1
              )
            )
          END,
          service_name = CASE
            WHEN EXISTS (SELECT 1 FROM existing_event) THEN improvement_opportunities.service_name
            ELSE EXCLUDED.service_name
          END,
          environment = CASE
            WHEN EXISTS (SELECT 1 FROM existing_event) THEN improvement_opportunities.environment
            ELSE EXCLUDED.environment
          END,
          status = CASE
            WHEN EXISTS (SELECT 1 FROM existing_event) THEN improvement_opportunities.status
            ELSE 'open'
          END,
          severity = CASE
            WHEN EXISTS (SELECT 1 FROM existing_event) THEN improvement_opportunities.severity
            WHEN EXCLUDED.kind = 'warning_hotspot'
              THEN CASE WHEN improvement_opportunities.occurrence_count + 1 >= 10 THEN 'high' ELSE 'medium' END
            WHEN EXCLUDED.kind = 'slow_request'
              THEN CASE WHEN ($19::int IS NOT NULL AND COALESCE($18::int, 0) >= $19::int * 2) OR improvement_opportunities.occurrence_count + 1 >= 10 THEN 'high' ELSE 'medium' END
            WHEN EXCLUDED.kind = 'request_failure_pattern'
              THEN CASE WHEN COALESCE($17::int, 0) >= 500 OR improvement_opportunities.occurrence_count + 1 >= 10 THEN 'high' ELSE 'medium' END
            ELSE EXCLUDED.severity
          END,
          confidence = CASE
            WHEN EXISTS (SELECT 1 FROM existing_event) THEN improvement_opportunities.confidence
            WHEN EXCLUDED.kind IN ('warning_hotspot', 'slow_request', 'request_failure_pattern')
              THEN ROUND((0.55 + LEAST(1, (improvement_opportunities.occurrence_count + 1)::numeric / GREATEST(($16::numeric * 2), 1)) * 0.35) * 100) / 100
            ELSE GREATEST(improvement_opportunities.confidence, EXCLUDED.confidence)
          END,
          title = CASE
            WHEN EXISTS (SELECT 1 FROM existing_event) THEN improvement_opportunities.title
            ELSE EXCLUDED.title
          END,
          summary = CASE
            WHEN EXISTS (SELECT 1 FROM existing_event) THEN improvement_opportunities.summary
            ELSE EXCLUDED.summary
          END,
          occurrence_count = improvement_opportunities.occurrence_count + CASE
            WHEN EXISTS (SELECT 1 FROM existing_event) THEN 0
            ELSE 1
          END,
          evidence = CASE
            WHEN EXISTS (SELECT 1 FROM existing_event) THEN improvement_opportunities.evidence
            ELSE EXCLUDED.evidence
          END,
          last_detected_at = CASE
            WHEN EXISTS (SELECT 1 FROM existing_event) THEN improvement_opportunities.last_detected_at
            ELSE EXCLUDED.last_detected_at
          END,
          last_source_event_id = CASE
            WHEN EXISTS (SELECT 1 FROM existing_event) THEN improvement_opportunities.last_source_event_id
            ELSE EXCLUDED.last_source_event_id
          END,
          related_incident_ids = CASE
            WHEN EXISTS (SELECT 1 FROM existing_event) THEN improvement_opportunities.related_incident_ids
            ELSE COALESCE((
              SELECT array_agg(DISTINCT related_incident_id)
              FROM unnest(improvement_opportunities.related_incident_ids || EXCLUDED.related_incident_ids) AS related_incident_id
            ), '{}'::uuid[])
          END,
          resolved_at = CASE
            WHEN EXISTS (SELECT 1 FROM existing_event) THEN improvement_opportunities.resolved_at
            ELSE NULL
          END,
          resolved_by_user_id = CASE
            WHEN EXISTS (SELECT 1 FROM existing_event) THEN improvement_opportunities.resolved_by_user_id
            ELSE NULL
          END,
          snoozed_until = CASE
            WHEN EXISTS (SELECT 1 FROM existing_event) THEN improvement_opportunities.snoozed_until
            ELSE NULL
          END,
          updated_at = CASE
            WHEN EXISTS (SELECT 1 FROM existing_event) THEN improvement_opportunities.updated_at
            ELSE now()
          END
        RETURNING
          id AS opportunity_uuid,
          id::text AS opportunity_id,
          kind,
          occurrence_count,
          bundle_generation_number,
          NOT EXISTS (SELECT 1 FROM existing_event) AS event_recorded,
          NOT EXISTS (SELECT 1 FROM existing_opportunity) AS opportunity_created,
          (SELECT status FROM existing_opportunity) AS prior_status
      ),
      inserted_event AS (
        INSERT INTO improvement_opportunity_events (
          improvement_opportunity_id,
          event_id,
          event_type,
          occurred_at
        )
        SELECT
          upserted.opportunity_id::uuid,
          $13::uuid,
          $14,
          $12::timestamptz
        FROM upserted
        WHERE upserted.event_recorded
        ON CONFLICT (improvement_opportunity_id, event_id)
        DO NOTHING
        RETURNING 1
      )
      SELECT
        upserted.opportunity_id,
        upserted.occurrence_count,
        upserted.bundle_generation_number,
        upserted.event_recorded AND EXISTS (SELECT 1 FROM inserted_event) AS event_recorded,
        upserted.opportunity_created,
        upserted.prior_status
      FROM upserted
    `,
    [
      randomUUID(),
      input.project_id,
      input.service_name,
      input.environment,
      input.kind,
      input.severity,
      input.confidence,
      input.fingerprint,
      input.title,
      input.summary,
      JSON.stringify(input.evidence),
      input.occurred_at,
      input.source_event_id,
      input.source_event_type,
      input.related_incident_id ?? null,
      input.threshold,
      typeof input.evidence["response_status"] === "number" ? input.evidence["response_status"] : null,
      typeof input.evidence["duration_ms"] === "number" ? input.evidence["duration_ms"] : null,
      typeof input.evidence["slow_request_duration_threshold_ms"] === "number" ? input.evidence["slow_request_duration_threshold_ms"] : null
    ]
  );

  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }

  return {
    opportunity_id: row.opportunity_id,
    occurrence_count: row.occurrence_count,
    bundle_generation_number: row.bundle_generation_number,
    should_generate_bundle: row.event_recorded && row.bundle_generation_number === 0 && row.occurrence_count >= input.threshold,
    lifecycle_transition:
      row.event_recorded !== true
        ? "none"
        : row.opportunity_created === true
          ? "opened"
          : row.prior_status === "resolved" || row.prior_status === "snoozed"
            ? "reopened"
            : "none"
  };
}
