import type { EventEnvelope } from "../../shared-types/src/event-envelope.js";
import {
  EvidenceReferenceSchema,
  type EvidenceReference,
  type RecoveryObservation
} from "../../shared-types/src/diagnostic-context.js";
import type {
  BundleEvidence,
  BundleRecovery,
  BundleResourceObservations
} from "../../shared-types/src/bundle-evidence.js";

export interface RetainedDiagnosticContext {
  event: EventEnvelope;
  received_at: string;
}
const WINDOW_MS = 5 * 60 * 1000;
const RESOURCE_WINDOW_MS = 30 * 1000;
function compare(left: EventEnvelope, right: EventEnvelope): number {
  return (
    Date.parse(left.occurred_at) - Date.parse(right.occurred_at) ||
    left.event_id.localeCompare(right.event_id)
  );
}
function reference(event: EventEnvelope): EvidenceReference | null {
  const parsed = EvidenceReferenceSchema.safeParse(event.context?.["evidence_reference"]);
  return parsed.success ? parsed.data : null;
}
function sameScope(left: EvidenceReference["scope"], right: EvidenceReference["scope"]): boolean {
  return (
    left.kind === right.kind &&
    (left.kind === "page"
      ? right.kind === "page" && left.page_id === right.page_id
      : right.kind === "operation" && left.operation_id === right.operation_id)
  );
}
function sameDomain(left: EventEnvelope, right: EventEnvelope): boolean {
  return (
    (left.project_id ?? null) === (right.project_id ?? null) &&
    left.service.name === right.service.name &&
    left.service.environment === right.service.environment
  );
}
function outcome(states: readonly string[]): BundleRecovery["outcome"] {
  const recovered = states.includes("recovery_observed"),
    persisted = states.includes("failure_persisted");
  return recovered && persisted
    ? "conflicting"
    : recovered
      ? "recovered"
      : persisted
        ? "persisted"
        : "unknown";
}

/** Inputs are already project-scoped by the storage/local reader. This pure join
 * independently verifies every remaining scope and capture-time boundary. */
export function associateDiagnosticEvidence(input: {
  failure: EventEnvelope | null;
  sources: readonly EventEnvelope[];
  failureEventIds?: readonly string[];
  contexts: readonly RetainedDiagnosticContext[];
}): { events: EventEnvelope[]; recovery?: BundleRecovery; resources?: BundleResourceObservations } {
  const failure = input.failure;
  if (failure === null) return { events: [] };
  const ref = reference(failure);
  if (ref === null) return { events: [] };
  const matchingFailures = new Set(
    input.sources
      .filter((event) => {
        if (input.failureEventIds !== undefined && !input.failureEventIds.includes(event.event_id))
          return false;
        if (event.event_type === "diagnostic_context" || !sameDomain(event, failure)) return false;
        const other = reference(event);
        return (
          other !== null &&
          other.failure_ref === ref.failure_ref &&
          sameScope(other.scope, ref.scope)
        );
      })
      .map((event) => event.event_id)
  );
  // A reused reference cannot identify an occurrence, even when timestamps differ.
  if (matchingFailures.size !== 1 || !matchingFailures.has(failure.event_id)) return { events: [] };
  const failureAt = Date.parse(failure.occurred_at);
  const candidates = new Map<string, RetainedDiagnosticContext>();
  const conflictingIds = new Set<string>();
  for (const candidate of input.contexts) {
    const previous = candidates.get(candidate.event.event_id);
    if (previous && JSON.stringify(previous.event) !== JSON.stringify(candidate.event))
      conflictingIds.add(candidate.event.event_id);
    if (
      previous === undefined ||
      Date.parse(candidate.received_at) < Date.parse(previous.received_at)
    )
      candidates.set(candidate.event.event_id, candidate);
  }
  const eligible = [...candidates.values()].filter((candidate) => {
    const event = candidate.event;
    if (
      conflictingIds.has(event.event_id) ||
      event.event_type !== "diagnostic_context" ||
      !sameDomain(event, failure)
    )
      return false;
    const payload = event.payload,
      at = Date.parse(event.occurred_at),
      received = Date.parse(candidate.received_at);
    if (
      !Number.isFinite(at) ||
      !Number.isFinite(received) ||
      at > received + 60_000 ||
      at < failureAt ||
      at > failureAt + WINDOW_MS
    )
      return false;
    if (payload.failure_ref !== ref.failure_ref || !sameScope(payload.scope, ref.scope))
      return false;
    if (ref.scope.kind === "page") {
      if (
        !failure.correlation?.session_id ||
        event.correlation?.session_id !== failure.correlation.session_id
      )
        return false;
    } else if ((event.correlation?.trace_id ?? null) !== (failure.correlation?.trace_id ?? null))
      return false;
    return (
      payload.kind !== "resource_observation" ||
      (payload.source_event_id === failure.event_id && at <= failureAt + RESOURCE_WINDOW_MS)
    );
  });
  const events: EventEnvelope[] = [];
  const attempts = new Map<
    string,
    {
      payloads: RecoveryObservation[];
      observations: BundleRecovery["attempts"][number]["observations"];
    }
  >();
  const resources: BundleResourceObservations["items"] = [];
  let count = 0,
    truncated = false,
    lateResourceSeen = false;
  const appendResource = (
    eventId: string,
    items: BundleResourceObservations["items"][number]["observation"][]
  ): void => {
    for (const observation of items) {
      const observedAt = Date.parse(observation.observed_at);
      if (
        observedAt < failureAt - RESOURCE_WINDOW_MS ||
        observedAt > failureAt + RESOURCE_WINDOW_MS
      )
        continue;
      if (resources.length < 10) resources.push({ source_event_id: eventId, observation });
    }
  };
  if (failure.event_type === "frontend_exception" && failure.payload.resource_observations)
    appendResource(failure.event_id, failure.payload.resource_observations.items);
  for (const { event } of eligible.sort((left, right) => compare(left.event, right.event))) {
    if (event.event_type !== "diagnostic_context") continue;
    if (events.length >= 20) {
      truncated = true;
      continue;
    }
    const payload = event.payload;
    if (payload.kind === "resource_observation") {
      if (lateResourceSeen) continue;
      lateResourceSeen = true;
      appendResource(event.event_id, payload.observations.items);
      events.push(event);
      continue;
    }
    if (count >= 20 || (!attempts.has(payload.attempt_id) && attempts.size >= 5)) {
      truncated = true;
      continue;
    }
    const attempt = attempts.get(payload.attempt_id) ?? { payloads: [], observations: [] };
    attempt.payloads.push(payload);
    attempt.observations.push({
      source_event_id: event.event_id,
      occurred_at: event.occurred_at,
      state: payload.state,
      ...(payload.operation === undefined ? {} : { operation: payload.operation }),
      ...(payload.status_code === undefined ? {} : { status_code: payload.status_code }),
      ...(payload.duration_ms === undefined ? {} : { duration_ms: payload.duration_ms })
    });
    attempts.set(payload.attempt_id, attempt);
    count++;
    events.push(event);
  }
  const recovery: BundleRecovery = {
    version: 1,
    truncated,
    outcome: outcome(
      [...attempts.values()].flatMap((attempt) => attempt.payloads.map((p) => p.state))
    ),
    attempts: [...attempts].map(([attempt_id, attempt]) => ({
      attempt_id,
      outcome: outcome(attempt.payloads.map((p) => p.state)),
      observations: attempt.observations
    }))
  };
  return {
    events,
    recovery,
    ...(resources.length ? { resources: { version: 1, items: resources } } : {})
  };
}

export function buildEvidenceProvenance(input: {
  primary: EventEnvelope | null;
  primaryEventId?: string;
  sources: readonly EventEnvelope[];
  contexts: readonly EventEnvelope[];
}): BundleEvidence {
  const retained = [
    ...new Map(
      [...input.sources, ...input.contexts].map((event) => [event.event_id, event])
    ).values()
  ].sort(compare);
  const observations: BundleEvidence["observations"] = [];
  for (const event of retained) {
    if (event.event_type === "backend_exception" || event.event_type === "frontend_exception") {
      const graph = event.payload.exception_evidence;
      observations.push({
        source_event_id: event.event_id,
        occurred_at: event.occurred_at,
        kind: "exception",
        availability: graph?.truncated
          ? "truncated"
          : graph?.unavailable_reason === "unsupported"
            ? "unsupported"
            : graph
              ? "observed"
              : "unknown"
      });
    } else if (event.event_type === "diagnostic_context")
      observations.push({
        source_event_id: event.event_id,
        occurred_at: event.occurred_at,
        kind: event.payload.kind,
        availability: "observed"
      });
    else if (event.event_type === "probe_event")
      observations.push({
        source_event_id: event.event_id,
        occurred_at: event.occurred_at,
        kind: "probe",
        availability: "observed"
      });
  }
  return {
    version: 1,
    primary_event_id: input.primary?.event_id ?? input.primaryEventId ?? "unknown",
    retained_event_count: retained.length,
    retained_first_at: retained[0]?.occurred_at ?? null,
    retained_last_at: retained.at(-1)?.occurred_at ?? null,
    observations: observations.slice(0, 20)
  };
}
