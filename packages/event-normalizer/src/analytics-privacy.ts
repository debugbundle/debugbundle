import { sanitizeTelemetry } from "../../redaction/src/index.js";
import { AnalyticsEventEnvelopeSchema, type AnalyticsEventEnvelope } from "../../shared-types/src/index.js";

/** Preserve validated aggregation identities only when their scalar values need no masking. */
export function protectAnalyticsEvent(event: AnalyticsEventEnvelope): AnalyticsEventEnvelope | null {
  for (const value of Object.values(event.correlation)) {
    if (typeof value !== "string") continue;
    const checked = sanitizeTelemetry(value);
    if (!checked.ok || checked.value !== value) return null;
  }
  const protectedEvent = sanitizeTelemetry(event);
  if (!protectedEvent.ok || protectedEvent.value === null || Array.isArray(protectedEvent.value) ||
      typeof protectedEvent.value !== "object") return null;
  const validated = AnalyticsEventEnvelopeSchema.safeParse({
    ...protectedEvent.value,
    correlation: event.correlation
  });
  return validated.success ? validated.data : null;
}
