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
  } & Record<string, unknown>>(
    `
      WITH upserted AS (
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
          service_id = COALESCE(
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
          ),
          service_name = EXCLUDED.service_name,
          environment = EXCLUDED.environment,
          status = 'open',
          severity = EXCLUDED.severity,
          confidence = GREATEST(improvement_opportunities.confidence, EXCLUDED.confidence),
          title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          occurrence_count = improvement_opportunities.occurrence_count + 1,
          evidence = EXCLUDED.evidence,
          last_detected_at = EXCLUDED.last_detected_at,
          last_source_event_id = EXCLUDED.last_source_event_id,
          related_incident_ids = COALESCE((
            SELECT array_agg(DISTINCT related_incident_id)
            FROM unnest(improvement_opportunities.related_incident_ids || EXCLUDED.related_incident_ids) AS related_incident_id
          ), '{}'::uuid[]),
          resolved_at = NULL,
          resolved_by_user_id = NULL,
          snoozed_until = NULL,
          updated_at = now()
        RETURNING
          id::text AS opportunity_id,
          occurrence_count,
          bundle_generation_number
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
        ON CONFLICT (improvement_opportunity_id, event_id)
        DO NOTHING
        RETURNING 1
      )
      SELECT
        opportunity_id,
        occurrence_count,
        bundle_generation_number
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
      input.related_incident_id ?? null
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
    should_generate_bundle: row.bundle_generation_number === 0 && row.occurrence_count >= input.threshold
  };
}
