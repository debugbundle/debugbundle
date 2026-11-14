import { EventEnvelopeSchema } from "../../shared-types/src/index.js";
import type { EventEnvelope } from "../../shared-types/src/index.js";

/** SDKs cannot resolve a cloud project ID from a write-only token. Unconfigured
 * local arrays share this local-only namespace inside their repository store;
 * explicit project IDs remain authoritative and never join this namespace. */
export const UNASSIGNED_LOCAL_PROJECT_ID = "00000000-0000-0000-0000-000000000000";
export function bindLocalProjectScope(event: EventEnvelope): EventEnvelope {
  return event.project_id == null ? { ...event, project_id: UNASSIGNED_LOCAL_PROJECT_ID } : event;
}

export function buildTraceCorrelationKey(
  projectId: string,
  environment: string,
  traceId: string
): string {
  // A trace may cross services, but never project or environment boundaries.
  return JSON.stringify([projectId, environment, traceId]);
}

export function sourceEventsMatchScope(input: {
  projectId: string;
  environment: string;
  sourceEvents: unknown;
}): boolean {
  // Older read-only records can omit retained source events entirely.
  if (input.sourceEvents === undefined) return true;
  const events = EventEnvelopeSchema.array().safeParse(input.sourceEvents);
  return (
    events.success &&
    events.data.every(
      (event) =>
        event.project_id === input.projectId && event.service.environment === input.environment
    )
  );
}
