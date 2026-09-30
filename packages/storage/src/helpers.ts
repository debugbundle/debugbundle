import { z } from "zod";
import { hashToken as hashTokenFromAuth } from "../../auth/src/index.js";
import type { EventEnvelope } from "../../shared-types/src/index.js";
import type { BuildRawEventObjectKeyInput } from "./types.js";

function toTwoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}

export function buildRawEventObjectKey(input: BuildRawEventObjectKeyInput): string {
  const year = input.occurredAt.getUTCFullYear().toString();
  const month = toTwoDigits(input.occurredAt.getUTCMonth() + 1);
  const day = toTwoDigits(input.occurredAt.getUTCDate());
  const hour = toTwoDigits(input.occurredAt.getUTCHours());

  return `raw-events/${input.projectId}/${year}/${month}/${day}/${hour}/${input.eventId}.json.gz`;
}

export function buildAnalyticsRawEventObjectKey(input: BuildRawEventObjectKeyInput): string {
  const year = input.occurredAt.getUTCFullYear().toString();
  const month = toTwoDigits(input.occurredAt.getUTCMonth() + 1);
  const day = toTwoDigits(input.occurredAt.getUTCDate());
  const hour = toTwoDigits(input.occurredAt.getUTCHours());

  return `analytics-events/${input.projectId}/${year}/${month}/${day}/${hour}/${input.eventId}.json.gz`;
}

/** V2 content addressing prevents a conflicting event ID from overwriting protected evidence. */
export function buildSemanticAnalyticsRawEventObjectKey(
  input: BuildRawEventObjectKeyInput & { contentHash: string }
): string {
  const project = z.string().uuid().safeParse(input.projectId);
  const event = z.string().uuid().safeParse(input.eventId);
  const digest = /^sha256:([a-f0-9]{64})$/.exec(input.contentHash);
  if (
    !project.success ||
    !event.success ||
    digest === null ||
    !(input.occurredAt instanceof Date) ||
    !Number.isFinite(input.occurredAt.getTime())
  )
    throw new Error("semantic_analytics_object_key_invalid");
  const year = input.occurredAt.getUTCFullYear().toString();
  const month = toTwoDigits(input.occurredAt.getUTCMonth() + 1);
  const day = toTwoDigits(input.occurredAt.getUTCDate());
  const hour = toTwoDigits(input.occurredAt.getUTCHours());
  return `semantic-events/${project.data.toLowerCase()}/${year}/${month}/${day}/${hour}/${event.data.toLowerCase()}/${digest[1]}.json.gz`;
}

export function buildBundleObjectKey(projectId: string, incidentId: string): string {
  return `bundles/${projectId}/${incidentId}/bundle.json.gz`;
}

export function buildImprovementBundleObjectKey(projectId: string, opportunityId: string): string {
  return `improvement-bundles/${projectId}/${opportunityId}/bundle.json.gz`;
}

export function buildAnalyticsJourneyObjectKey(projectId: string, sampleId: string): string {
  return `analytics-journeys/${projectId}/${sampleId}.json.gz`;
}

export function buildAnalyticsBundleObjectKey(projectId: string, generationId: string): string {
  return `analytics-bundles/${projectId}/${generationId}/analytics-bundle.json.gz`;
}

export function buildReproductionObjectKey(projectId: string, incidentId: string): string {
  return `reproductions/${projectId}/${incidentId}/reproduction.json.gz`;
}

export function buildUserAvatarObjectKey(userId: string): string {
  return `avatars/users/${userId}/profile`;
}

export function buildBundleRegenerationLeaseKey(incidentId: string): string {
  return `leases:bundle-regeneration:${incidentId}`;
}

export function buildImprovementBundleRegenerationLeaseKey(opportunityId: string): string {
  return `leases:improvement-bundle-regeneration:${opportunityId}`;
}

export const PROJECT_OBJECT_PREFIXES = [
  "raw-events",
  "bundles",
  "improvement-bundles",
  "reproductions",
  "analytics-events",
  "semantic-events",
  "analytics-journeys",
  "analytics-bundles"
] as const;

export async function deleteProjectObjects(
  objectStore: { deleteObjectsByPrefix(prefix: string): Promise<void> },
  projectId: string
): Promise<void> {
  for (const prefix of PROJECT_OBJECT_PREFIXES) {
    await objectStore.deleteObjectsByPrefix(`${prefix}/${projectId}/`);
  }
}

export function inferSeverity(
  eventType: EventEnvelope["event_type"]
): "low" | "medium" | "high" | "critical" {
  if (eventType === "backend_exception" || eventType === "frontend_exception") {
    return "high";
  }

  if (eventType === "error_suppressed") {
    return "medium";
  }

  return "low";
}

export function inferEventLogLevel(event: EventEnvelope): string | null {
  if (event.event_type !== "log_event") {
    return null;
  }

  return event.payload.level;
}

export function buildBillableIncidentEventsPredicateSql(input: {
  planSql: string;
  eventClassSql: string;
}): string {
  return `
    CASE
      WHEN ${input.planSql} IN ('solo', 'team') THEN ${input.eventClassSql} <> 'operational_signal'
      ELSE ${input.eventClassSql} = 'incident_signal'
    END
  `;
}

export function getRequiredStringField(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string") {
    throw new Error(`invalid_${field}`);
  }

  return value;
}

export const hashToken = hashTokenFromAuth;
