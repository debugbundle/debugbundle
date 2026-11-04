import { EventEnvelopeSchema } from "../../shared-types/src/index.js";

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
