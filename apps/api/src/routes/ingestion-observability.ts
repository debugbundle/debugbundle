import type { FastifyBaseLogger } from "fastify";
import type { ZodIssue } from "zod";

import { buildIngestionMetricBatch } from "../../../../packages/storage/src/index.js";
import type { EventClass } from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { redactEvent } from "../api-helpers.js";

export type IngestionRejectedMetricEvent = {
  event_id: string;
  reason:
    | "capture_policy_rejected"
    | "capture_rule_dropped"
    | "capture_rule_sampled_out"
    | "invalid_event"
    | "monthly_quota_exceeded"
    | "rate_limited"
    | "remote_probes_disabled";
};

export type IngestionAcceptedMetricEvent = {
  event_id: string;
  event_class: EventClass;
  event_type: string;
};

export type IngestionRejectedDiagnosticEvent = {
  rejection_reason: IngestionRejectedMetricEvent["reason"];
  project_id: string;
  sdk_name: string | null;
  sdk_version: string | null;
  event_type: string | null;
  service_name: string | null;
  service_environment: string | null;
  service_runtime: string | null;
  validation_code: string | null;
  validation_path: string | null;
};

export function toIngestionRetryAfterSeconds(retryAfterMs: number): string {
  return String(Math.max(1, Math.ceil(retryAfterMs / 1_000)));
}

export function getQuotaRetryAfterMs(resetAt: string, now: Date): number {
  return Math.max(1_000, new Date(resetAt).getTime() - now.getTime());
}

export function readRejectedMetricEventId(candidate: unknown, index: number): string {
  if (typeof candidate === "object" && candidate !== null) {
    const eventId = (candidate as Record<string, unknown>)["event_id"];
    if (typeof eventId === "string" && eventId.length > 0) return eventId;
  }
  return `invalid_event_index_${index}`;
}

export async function recordIngestionMetricBatchBestEffort(input: {
  dependencies: ApiDependencies;
  log: FastifyBaseLogger;
  organization_id: string | undefined;
  project_id: string;
  organization_plan: string | undefined;
  occurred_at: string;
  accepted_events: IngestionAcceptedMetricEvent[];
  rejected_events: IngestionRejectedMetricEvent[];
}): Promise<"recorded" | "skipped"> {
  if (input.dependencies.accountAnalytics === undefined || input.organization_id === undefined) {
    return "skipped";
  }

  const metricBatch = buildIngestionMetricBatch({
    project_id: input.project_id,
    organization_plan: input.organization_plan,
    accepted_events: input.accepted_events,
    rejected_events: input.rejected_events
  });
  if (metricBatch === null) return "skipped";

  try {
    const result = await input.dependencies.accountAnalytics.recordMetricDeltas({
      organization_id: input.organization_id,
      occurred_at: input.occurred_at,
      source: "ingestion_batch",
      dedupe_key: metricBatch.dedupe_key,
      deltas: metricBatch.deltas
    });
    return result === "recorded" ? "recorded" : "skipped";
  } catch (error) {
    input.log.warn(
      { err: error, project_id: input.project_id, organization_id: input.organization_id },
      "ingestion_account_analytics_record_failed"
    );
    return "skipped";
  }
}

export function buildRejectedDiagnosticFromCandidate(input: {
  project_id: string;
  rejection_reason: IngestionRejectedMetricEvent["reason"];
  candidate: unknown;
  validation_issue?: ZodIssue;
}): IngestionRejectedDiagnosticEvent {
  const service = readObjectField(input.candidate, "service");
  return {
    rejection_reason: input.rejection_reason,
    project_id: input.project_id,
    sdk_name: readStringField(input.candidate, "sdk_name", 120),
    sdk_version: readStringField(input.candidate, "sdk_version", 64),
    event_type: readStringField(input.candidate, "event_type", 80),
    service_name: readStringField(service, "name", 120),
    service_environment: readStringField(service, "environment", 80),
    service_runtime: readStringField(service, "runtime", 80),
    validation_code: sanitizeDiagnosticText(input.validation_issue?.code ?? null, 80),
    validation_path: readValidationPath(input.validation_issue)
  };
}

export function buildRejectedDiagnosticFromEvent(input: {
  project_id: string;
  rejection_reason: IngestionRejectedMetricEvent["reason"];
  event: ReturnType<typeof redactEvent>;
}): IngestionRejectedDiagnosticEvent {
  return {
    rejection_reason: input.rejection_reason,
    project_id: input.project_id,
    sdk_name: sanitizeDiagnosticText(input.event.sdk_name, 120),
    sdk_version: sanitizeDiagnosticText(input.event.sdk_version, 64),
    event_type: sanitizeDiagnosticText(input.event.event_type, 80),
    service_name: sanitizeDiagnosticText(input.event.service.name, 120),
    service_environment: sanitizeDiagnosticText(input.event.service.environment, 80),
    service_runtime: sanitizeDiagnosticText(input.event.service.runtime ?? null, 80),
    validation_code: null,
    validation_path: null
  };
}

export async function recordRejectedDiagnosticsBestEffort(input: {
  dependencies: ApiDependencies;
  log: FastifyBaseLogger;
  organization_id: string | undefined;
  occurred_at: string;
  rejected_events: IngestionRejectedDiagnosticEvent[];
}): Promise<void> {
  if (
    input.organization_id === undefined ||
    input.dependencies.ingestionRejectionDiagnostics === undefined ||
    input.rejected_events.length === 0
  ) return;

  try {
    await input.dependencies.ingestionRejectionDiagnostics.recordRejectedDiagnostics({
      organization_id: input.organization_id,
      occurred_at: input.occurred_at,
      events: input.rejected_events
    });
  } catch (error) {
    input.log.warn(
      { err: error, organization_id: input.organization_id },
      "ingestion_rejection_diagnostics_record_failed"
    );
  }
}

function sanitizeDiagnosticText(
  candidate: string | null | undefined,
  maxLength = 160
): string | null {
  if (typeof candidate !== "string") return null;
  const normalized = candidate.replace(/\s+/g, " ").trim();
  return normalized.length === 0 ? null : normalized.slice(0, maxLength);
}

function readObjectField(candidate: unknown, key: string): Record<string, unknown> | null {
  if (typeof candidate !== "object" || candidate === null) return null;
  const value = (candidate as Record<string, unknown>)[key];
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readStringField(candidate: unknown, key: string, maxLength = 160): string | null {
  if (typeof candidate !== "object" || candidate === null) return null;
  return sanitizeDiagnosticText(
    (candidate as Record<string, unknown>)[key] as string | null | undefined,
    maxLength
  );
}

function readValidationPath(issue: ZodIssue | undefined): string | null {
  return issue === undefined || issue.path.length === 0
    ? null
    : sanitizeDiagnosticText(issue.path.map((segment) => String(segment)).join("."), 160);
}
