import { browserRecoveryFailureFromEvent, readBrowserRecoveryFailure } from "../../shared-types/src/browser-recovery.js";
import {
  browserResourceDiagnosis,
  describeBrowserResource,
  describeBrowserResourceInterruption,
  summarizeResourceRoutes,
  type BundleV1,
  type EventEnvelope
} from "../../shared-types/src/index.js";
import type { BundleBuildContext } from "../../storage/src/index.js";

export function buildBrowserResourceContext(
  browserEvent: unknown,
  incident: BundleBuildContext,
  events: EventEnvelope[],
  correlatedRecoveryEnvelopes: EventEnvelope[] = []
): BundleV1["context"]["resource_failure"] {
  const resource = describeBrowserResource(browserEvent);
  if (resource === null) return undefined;
  const routes: Array<string | null> = [];
  const resourceOccurrences: ResourceOccurrence[] = [];
  for (const event of events) {
    if (
      event.event_type !== "frontend_exception" ||
      event.service.name !== incident.service_name ||
      event.service.environment !== incident.environment
    )
      continue;
    const candidate = describeBrowserResource(event.payload.browser_event);
    if (
      candidate !== null &&
      candidate.host === resource.host &&
      candidate.path === resource.path &&
      candidate.type === resource.type
    ) {
      routes.push(event.payload.route ?? null);
      const occurredAt = Date.parse(event.occurred_at);
      if (Number.isFinite(occurredAt)) resourceOccurrences.push({ envelope: event, occurredAt });
    }
  }
  const interruption = describeBrowserResourceInterruption(browserEvent);
  const recoveryFailures = collectRecoveryFailures({
    resourceOccurrences,
    correlatedRecoveryEnvelopes
  });
  return {
    version: 1,
    ...resource,
    diagnosis:
      interruption === null
        ? browserResourceDiagnosis(resource)
        : "The resource failed while the page was hidden and incomplete and the target was a speculative link. This is consistent with a browser-aborted preload, but the captured lifecycle state does not prove the cause.",
    routes: incident.resource_routes ?? summarizeResourceRoutes(routes, incident.occurrence_count),
    ...(interruption === null ? {} : { interruption }),
    ...(recoveryFailures.length === 0 ? {} : { recovery_failures: recoveryFailures })
  };
}

type RecoveryFailure = NonNullable<
  NonNullable<BundleV1["context"]["resource_failure"]>["recovery_failures"]
>[number];

interface ResourceOccurrence {
  envelope: Extract<EventEnvelope, { event_type: "frontend_exception" }>;
  occurredAt: number;
}

function recoveryDelay(resourceTimes: number[], occurredAt: string): number | null {
  const recoveryTime = Date.parse(occurredAt);
  if (!Number.isFinite(recoveryTime)) return null;
  let nearest: number | null = null;
  for (const resourceTime of resourceTimes) {
    const delay = recoveryTime - resourceTime;
    if (delay >= 0 && delay <= 30_000 && (nearest === null || delay < nearest)) nearest = delay;
  }
  return nearest;
}

function nonEmptyCorrelationValue(value: string | null | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function correlatedResourceTimes(
  occurrences: ResourceOccurrence[],
  recoveryEnvelope: EventEnvelope
): number[] {
  const recoverySessionId = nonEmptyCorrelationValue(recoveryEnvelope.correlation?.session_id);
  const recoveryTraceId = nonEmptyCorrelationValue(recoveryEnvelope.correlation?.trace_id);
  if (recoverySessionId === null && recoveryTraceId === null) return [];
  return occurrences
    .filter((occurrence) => {
      const resourceSessionId = nonEmptyCorrelationValue(
        occurrence.envelope.correlation?.session_id
      );
      const resourceTraceId = nonEmptyCorrelationValue(occurrence.envelope.correlation?.trace_id);
      return (
        (recoverySessionId !== null && recoverySessionId === resourceSessionId) ||
        (recoveryTraceId !== null && recoveryTraceId === resourceTraceId)
      );
    })
    .map((occurrence) => occurrence.occurredAt);
}

function collectRecoveryFailures(input: {
  resourceOccurrences: ResourceOccurrence[];
  correlatedRecoveryEnvelopes: EventEnvelope[];
}): RecoveryFailure[] {
  if (input.resourceOccurrences.length === 0) return [];
  const failures: RecoveryFailure[] = [];

  for (const envelope of input.correlatedRecoveryEnvelopes) {
    const failure = browserRecoveryFailureFromEvent(envelope);
    if (failure === null) continue;
    if (!input.resourceOccurrences.some(({ envelope: resource }) => resource.service.name === envelope.service.name && resource.service.environment === envelope.service.environment)) continue;
    const delay = recoveryDelay(
      correlatedResourceTimes(input.resourceOccurrences, envelope),
      envelope.occurred_at
    );
    if (delay === null) continue;
    failures.push({
      source: envelope.event_type === "request_event" ? "request_event" : "frontend_breadcrumb",
      ...failure,
      occurred_at: new Date(envelope.occurred_at).toISOString(),
      delay_ms: delay
    });
  }

  for (const occurrence of input.resourceOccurrences) {
    const envelope = occurrence.envelope;
    for (const breadcrumb of envelope.payload.breadcrumbs ?? []) {
      if (breadcrumb.breadcrumb_type !== "network_request") continue;
      const failure = readBrowserRecoveryFailure({ path: breadcrumb.data["url"], method: breadcrumb.data["method"], status: breadcrumb.data["status_code"] ?? breadcrumb.data["status"] });
      const delay = recoveryDelay([occurrence.occurredAt], breadcrumb.ts);
      if (failure === null || delay === null) continue;
      failures.push({
        source: "frontend_breadcrumb",
        ...failure,
        occurred_at: new Date(breadcrumb.ts).toISOString(),
        delay_ms: delay
      });
    }
  }

  const deduped = new Map<string, RecoveryFailure>();
  for (const failure of failures) {
    const key = `${failure.method}|${failure.path}|${failure.status_code}|${failure.occurred_at}`;
    const existing = deduped.get(key);
    if (existing === undefined || failure.source.localeCompare(existing.source) > 0 || (failure.source === existing.source && failure.delay_ms < existing.delay_ms)) deduped.set(key, failure);
  }
  return [...deduped.values()]
    .sort((left, right) => {
      const timeComparison = left.occurred_at.localeCompare(right.occurred_at);
      return timeComparison || left.path.localeCompare(right.path) || left.method.localeCompare(right.method) || left.status_code - right.status_code || left.source.localeCompare(right.source);
    })
    .slice(0, 10);
}
