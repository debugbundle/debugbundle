import { gunzipSync } from "node:zlib";
import { isObjectMissing } from "../../../packages/storage/src/object-store-errors.js";
import { validateEvent } from "../../../packages/event-normalizer/src/index.js";
import type { BundleBuildContext } from "../../../packages/storage/src/index.js";
import { buildRawEventObjectKey } from "../../../packages/storage/src/index.js";
import { type EventEnvelope } from "../../../packages/shared-types/src/index.js";
import { type BuildBundleWorkerDependencies } from "./processor-shared.js";

export function parseEventEnvelopeFromRaw(rawBody: Buffer): EventEnvelope | null {
  try {
    const parsed = JSON.parse(gunzipSync(rawBody).toString("utf8")) as unknown;
    const validated = validateEvent(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

export function toIsoTimestamp(value: string): string {
  return new Date(value).toISOString();
}

export type LoadedIncidentEnvelope = {
  eventId: string;
  eventType: EventEnvelope["event_type"];
  occurredAt: string;
  envelope: EventEnvelope;
};

export type BundleProbeItem = {
  label: string;
  data: Record<string, unknown>;
  timestamp: string;
  activation_id: string | null;
};

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

export function toProbeDedupKey(item: BundleProbeItem): string {
  return `${item.label}|${item.timestamp}|${item.activation_id ?? "null"}|${stableStringify(item.data)}`;
}

export function collectInlineProbeItems(envelope: EventEnvelope): BundleProbeItem[] {
  if (envelope.event_type !== "backend_exception" && envelope.event_type !== "frontend_exception") {
    return [];
  }

  const probeDataBlock = envelope.payload.probe_data;
  if (probeDataBlock === undefined) {
    return [];
  }

  return probeDataBlock.items.map((item) => ({
    label: item.label,
    data: item.data,
    timestamp: toIsoTimestamp(item.timestamp),
    activation_id: item.activation_id
  }));
}

export async function loadIncidentEnvelopes(input: {
  dependencies: BuildBundleWorkerDependencies;
  incidentId: string;
  projectId: string;
}): Promise<LoadedIncidentEnvelope[]> {
  if (
    input.dependencies.incidentStore.listIncidentEventReferences === undefined ||
    input.dependencies.objectStore.getObject === undefined
  ) {
    return [];
  }

  const incidentEventRefs = await input.dependencies.incidentStore.listIncidentEventReferences({
    incident_id: input.incidentId
  });

  const envelopes: LoadedIncidentEnvelope[] = [];
  for (const eventRef of incidentEventRefs) {
    const key = buildRawEventObjectKey({
      projectId: input.projectId,
      occurredAt: new Date(eventRef.occurred_at),
      eventId: eventRef.event_id
    });

    try {
      const rawBody = await input.dependencies.objectStore.getObject({ key });
      const envelope = parseEventEnvelopeFromRaw(rawBody);
      if (envelope === null) {
        continue;
      }

      envelopes.push({
        eventId: eventRef.event_id,
        eventType: eventRef.event_type,
        occurredAt: eventRef.occurred_at,
        envelope
      });
    } catch (error) {
      // Retention may remove source objects; storage outages must retry the build.
      if (!isObjectMissing(error)) throw error;
    }
  }

  return envelopes;
}

export async function collectProbeDataItems(input: {
  dependencies: BuildBundleWorkerDependencies;
  incident: BundleBuildContext;
  incidentEnvelopes: LoadedIncidentEnvelope[];
}): Promise<BundleProbeItem[]> {
  if (
    input.dependencies.incidentStore.listProbeEventCandidatesForServiceWindow === undefined ||
    input.dependencies.objectStore.getObject === undefined
  ) {
    return [];
  }

  const incidentTraceIds = new Set<string>();
  const items: BundleProbeItem[] = [];
  for (const incidentEnvelope of input.incidentEnvelopes) {
    items.push(...collectInlineProbeItems(incidentEnvelope.envelope));

    if (incidentEnvelope.eventType === "probe_event") {
      continue;
    }

    const traceId = incidentEnvelope.envelope.correlation?.trace_id;
    if (typeof traceId === "string" && traceId.length > 0) {
      incidentTraceIds.add(traceId);
    }
  }

  const windowStart = new Date(
    new Date(input.incident.first_seen_at).getTime() - 5 * 60 * 1000
  ).toISOString();
  const windowEnd = new Date(
    new Date(input.incident.last_seen_at).getTime() + 5 * 60 * 1000
  ).toISOString();

  const probeCandidates =
    await input.dependencies.incidentStore.listProbeEventCandidatesForServiceWindow({
      project_id: input.incident.project_id,
      service_name: input.incident.service_name,
      environment: input.incident.environment,
      window_start: windowStart,
      window_end: windowEnd
    });

  for (const candidate of probeCandidates) {
    const key = buildRawEventObjectKey({
      projectId: input.incident.project_id,
      occurredAt: new Date(candidate.occurred_at),
      eventId: candidate.event_id
    });

    try {
      const rawBody = await input.dependencies.objectStore.getObject({ key });
      const envelope = parseEventEnvelopeFromRaw(rawBody);
      if (envelope === null || envelope.event_type !== "probe_event") {
        continue;
      }

      const traceId = envelope.correlation?.trace_id;
      const shouldInclude =
        (typeof traceId === "string" && traceId.length > 0 && incidentTraceIds.has(traceId)) ||
        traceId === null ||
        traceId === undefined ||
        traceId.length === 0;

      if (!shouldInclude) {
        continue;
      }

      items.push({
        label: envelope.payload.label,
        data: envelope.payload.data,
        timestamp: toIsoTimestamp(envelope.occurred_at),
        activation_id: envelope.payload.activation_id
      });
    } catch (error) {
      // Missing retained context is optional; unreadable storage is not absence.
      if (!isObjectMissing(error)) throw error;
    }
  }

  const deduped = new Map<string, BundleProbeItem>();
  for (const item of items) {
    const dedupKey = toProbeDedupKey(item);
    if (!deduped.has(dedupKey)) {
      deduped.set(dedupKey, item);
    }
  }

  return [...deduped.values()].sort((a, b) => {
    if (a.timestamp === b.timestamp) {
      return a.label.localeCompare(b.label);
    }
    return a.timestamp.localeCompare(b.timestamp);
  });
}

export function addNonEmptyCorrelationValue(
  target: Set<string>,
  value: string | null | undefined
): void {
  if (typeof value === "string" && value.length > 0) {
    target.add(value);
  }
}

export async function collectCorrelatedLogEnvelopes(input: {
  dependencies: BuildBundleWorkerDependencies;
  incident: BundleBuildContext;
  incidentEnvelopes: LoadedIncidentEnvelope[];
}): Promise<LoadedIncidentEnvelope[]> {
  if (
    input.dependencies.incidentStore.listLogEventCandidatesForServiceWindow === undefined ||
    input.dependencies.objectStore.getObject === undefined
  ) {
    return [];
  }

  const existingEventIds = new Set(
    input.incidentEnvelopes.map((incidentEnvelope) => incidentEnvelope.eventId)
  );
  const requestIds = new Set<string>();
  const traceIds = new Set<string>();
  for (const incidentEnvelope of input.incidentEnvelopes) {
    if (incidentEnvelope.envelope.event_type === "log_event") {
      continue;
    }

    addNonEmptyCorrelationValue(requestIds, incidentEnvelope.envelope.correlation?.request_id);
    addNonEmptyCorrelationValue(traceIds, incidentEnvelope.envelope.correlation?.trace_id);
  }

  if (requestIds.size === 0 && traceIds.size === 0) {
    return [];
  }

  const windowStart = new Date(
    new Date(input.incident.first_seen_at).getTime() - 5 * 60 * 1000
  ).toISOString();
  const windowEnd = new Date(
    new Date(input.incident.last_seen_at).getTime() + 5 * 60 * 1000
  ).toISOString();
  const candidates = await input.dependencies.incidentStore.listLogEventCandidatesForServiceWindow({
    project_id: input.incident.project_id,
    service_name: input.incident.service_name,
    environment: input.incident.environment,
    window_start: windowStart,
    window_end: windowEnd
  });

  const envelopes: LoadedIncidentEnvelope[] = [];
  for (const candidate of candidates) {
    if (existingEventIds.has(candidate.event_id)) {
      continue;
    }

    const key = buildRawEventObjectKey({
      projectId: input.incident.project_id,
      occurredAt: new Date(candidate.occurred_at),
      eventId: candidate.event_id
    });

    try {
      const rawBody = await input.dependencies.objectStore.getObject({ key });
      const envelope = parseEventEnvelopeFromRaw(rawBody);
      if (envelope === null || envelope.event_type !== "log_event") {
        continue;
      }

      const requestId = envelope.correlation?.request_id;
      const traceId = envelope.correlation?.trace_id;
      const matchesRequest = typeof requestId === "string" && requestIds.has(requestId);
      const matchesTrace = typeof traceId === "string" && traceIds.has(traceId);
      if (!matchesRequest && !matchesTrace) {
        continue;
      }

      envelopes.push({
        eventId: candidate.event_id,
        eventType: "log_event",
        occurredAt: candidate.occurred_at,
        envelope
      });
    } catch (error) {
      // Missing retained context is optional; unreadable storage is not absence.
      if (!isObjectMissing(error)) throw error;
    }
  }

  return envelopes.sort((left, right) => {
    if (left.occurredAt === right.occurredAt) {
      return left.eventId.localeCompare(right.eventId);
    }
    return left.occurredAt.localeCompare(right.occurredAt);
  });
}
