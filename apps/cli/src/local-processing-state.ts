import { validateEvent } from "../../../packages/event-normalizer/src/index.js";
import { EventTypeValues, type EventEnvelope } from "../../../packages/shared-types/src/index.js";
import { isRecord } from "./cli-fs-helpers.js";
type Severity = "low" | "medium" | "high" | "critical";
const EVENT_TYPE_SET = new Set<string>(EventTypeValues);
function isEventType(value: unknown): value is EventEnvelope["event_type"] {
  return typeof value === "string" && EVENT_TYPE_SET.has(value);
}
export type LocalIncidentState = {
  incident_id: string;
  source: "local";
  project_id: string;
  service_id: string;
  service_name: string;
  service_runtime: string | null;
  service_framework: string | null;
  environment: string;
  fingerprint: string;
  fingerprint_version: string;
  title: string;
  severity: Severity;
  status: "open" | "resolved";
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  source_event_id: string;
  source_occurred_at: string;
  source_event_types: EventEnvelope["event_type"][];
  matched_fields: string[];
  bundle_path: string;
  reproduction_path: string;
  generation_number: number;
  source_events: EventEnvelope[];
};

export type LocalProcessingState = {
  version: 1;
  last_processed_event_file: string | null;
  incidents: Record<string, LocalIncidentState>;
};

function parseIncidentState(candidate: unknown): LocalIncidentState | null {
  if (!isRecord(candidate)) {
    return null;
  }

  if (
    candidate["source"] !== "local" ||
    (candidate["status"] !== "open" && candidate["status"] !== "resolved")
  ) {
    return null;
  }

  const sourceEvents = candidate["source_events"];
  if (!Array.isArray(sourceEvents)) {
    return null;
  }

  const validatedSourceEvents: EventEnvelope[] = [];
  for (const sourceEvent of sourceEvents) {
    const validated = validateEvent(sourceEvent);
    if (!validated.success) {
      return null;
    }
    validatedSourceEvents.push(validated.data);
  }

  const matchedFields = candidate["matched_fields"];
  const sourceEventTypes = candidate["source_event_types"];

  if (!Array.isArray(matchedFields) || !matchedFields.every((value) => typeof value === "string")) {
    return null;
  }

  if (!Array.isArray(sourceEventTypes) || !sourceEventTypes.every(isEventType)) {
    return null;
  }

  const severity = candidate["severity"];
  if (
    severity !== "low" &&
    severity !== "medium" &&
    severity !== "high" &&
    severity !== "critical"
  ) {
    return null;
  }

  const status = candidate["status"];
  if (status !== "open" && status !== "resolved") {
    return null;
  }

  const requiredStringKeys = [
    "incident_id",
    "project_id",
    "service_id",
    "service_name",
    "environment",
    "fingerprint",
    "fingerprint_version",
    "title",
    "first_seen_at",
    "last_seen_at",
    "source_event_id",
    "source_occurred_at",
    "bundle_path",
    "reproduction_path"
  ] as const;

  for (const key of requiredStringKeys) {
    if (typeof candidate[key] !== "string") {
      return null;
    }
  }

  if (
    typeof candidate["occurrence_count"] !== "number" ||
    typeof candidate["generation_number"] !== "number"
  ) {
    return null;
  }

  const serviceRuntime = candidate["service_runtime"];
  const serviceFramework = candidate["service_framework"];
  if (serviceRuntime !== null && typeof serviceRuntime !== "string") {
    return null;
  }
  if (serviceFramework !== null && typeof serviceFramework !== "string") {
    return null;
  }

  const incidentId = candidate["incident_id"] as string;
  const projectId = candidate["project_id"] as string;
  const serviceId = candidate["service_id"] as string;
  const serviceName = candidate["service_name"] as string;
  const environment = candidate["environment"] as string;
  const incidentFingerprint = candidate["fingerprint"] as string;
  const fingerprintVersion = candidate["fingerprint_version"] as string;
  const title = candidate["title"] as string;
  const firstSeenAt = candidate["first_seen_at"] as string;
  const lastSeenAt = candidate["last_seen_at"] as string;
  const occurrenceCount = candidate["occurrence_count"];
  const sourceEventId = candidate["source_event_id"] as string;
  const sourceOccurredAt = candidate["source_occurred_at"] as string;
  const bundlePath = candidate["bundle_path"] as string;
  const reproductionPath = candidate["reproduction_path"] as string;
  const generationNumber = candidate["generation_number"];
  const normalizedSourceEventTypes = [...sourceEventTypes].sort();

  return {
    incident_id: incidentId,
    source: "local",
    project_id: projectId,
    service_id: serviceId,
    service_name: serviceName,
    service_runtime: serviceRuntime,
    service_framework: serviceFramework,
    environment,
    fingerprint: incidentFingerprint,
    fingerprint_version: fingerprintVersion,
    title,
    severity,
    status,
    first_seen_at: firstSeenAt,
    last_seen_at: lastSeenAt,
    occurrence_count: occurrenceCount,
    source_event_id: sourceEventId,
    source_occurred_at: sourceOccurredAt,
    source_event_types: normalizedSourceEventTypes,
    matched_fields: [...matchedFields].sort(),
    bundle_path: bundlePath,
    reproduction_path: reproductionPath,
    generation_number: generationNumber,
    source_events: validatedSourceEvents.sort(compareEventEnvelopes)
  };
}

export function parseState(rawState: string): LocalProcessingState | null {
  const parsed = JSON.parse(rawState) as unknown;
  if (!isRecord(parsed) || parsed["version"] !== 1) {
    return null;
  }

  const lastProcessedEventFile = parsed["last_processed_event_file"];
  if (lastProcessedEventFile !== null && typeof lastProcessedEventFile !== "string") {
    return null;
  }

  const incidents = parsed["incidents"];
  if (!isRecord(incidents)) {
    return null;
  }

  const parsedIncidents: Record<string, LocalIncidentState> = {};
  for (const [incidentId, incidentValue] of Object.entries(incidents).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const incident = parseIncidentState(incidentValue);
    if (incident === null || incident.incident_id !== incidentId) {
      return null;
    }

    parsedIncidents[incidentId] = incident;
  }

  return {
    version: 1,
    last_processed_event_file: lastProcessedEventFile,
    incidents: parsedIncidents
  };
}

export function compareEventEnvelopes(left: EventEnvelope, right: EventEnvelope): number {
  const occurredAtComparison = left.occurred_at.localeCompare(right.occurred_at);
  if (occurredAtComparison !== 0) {
    return occurredAtComparison;
  }

  return left.event_id.localeCompare(right.event_id);
}
