import { sanitizeBrowserStackUrls } from "../../redaction/src/browser-stack.js";
import { sanitizeTelemetry } from "../../redaction/src/index.js";
import type { EventEnvelope } from "../../shared-types/src/index.js";
import { validateEvent } from "./index.js";
import { sanitizeExceptionEvidenceUrls, withoutAddedEvidence } from "./evidence-privacy.js";

/** Preserve protocol identities only when their scalar values pass the mandatory policy. */
export function sanitizeEvent(event: EventEnvelope): EventEnvelope {
  const fallback = (): EventEnvelope => {
    const reduced = withoutAddedEvidence(event, true);
    if (reduced === null) throw new Error("unsafe_event");
    try {
      return sanitizeEvent(reduced);
    } catch {
      // Even the small limitation marker must yield to an admissible original.
      return sanitizeEvent(withoutAddedEvidence(event, false)!);
    }
  };
  for (const value of [
    event.schema_version,
    event.sdk_name,
    event.sdk_version,
    ...Object.values(event.correlation ?? {})
  ]) {
    if (typeof value !== "string") continue;
    const checked = sanitizeTelemetry(value);
    if (!checked.ok || checked.value !== value) throw new Error("unsafe_event");
  }
  const candidate =
    event.event_type === "frontend_exception" || event.event_type === "backend_exception"
      ? {
          ...event,
          payload: {
            ...event.payload,
            stack:
              event.event_type === "frontend_exception"
                ? sanitizeBrowserStackUrls(event.payload.stack)
                : event.payload.stack,
            ...(event.payload.exception_evidence === undefined
              ? {}
              : {
                  exception_evidence: sanitizeExceptionEvidenceUrls(
                    event.payload.exception_evidence
                  )
                })
          }
        }
      : event;
  const sanitized = sanitizeTelemetry({
    payload: candidate.payload,
    context: candidate.context ?? {},
    service: candidate.service
  });
  if (
    !sanitized.ok ||
    sanitized.value === null ||
    Array.isArray(sanitized.value) ||
    typeof sanitized.value !== "object"
  ) {
    return fallback();
  }
  const reparsed = validateEvent({
    ...candidate,
    payload: sanitized.value["payload"],
    service: sanitized.value["service"],
    ...(candidate.context === undefined ? {} : { context: sanitized.value["context"] })
  });
  if (!reparsed.success) return fallback();
  const safeEvent = { ...reparsed.data };
  delete safeEvent.project_token;
  return safeEvent;
}
