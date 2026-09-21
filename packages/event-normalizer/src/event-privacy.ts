import { sanitizeBrowserStackUrls } from "../../redaction/src/browser-stack.js";
import { sanitizeTelemetry } from "../../redaction/src/index.js";
import type { EventEnvelope } from "../../shared-types/src/index.js";
import { validateEvent } from "./index.js";

/** Preserve protocol identities only when their scalar values pass the mandatory policy. */
export function sanitizeEvent(event: EventEnvelope): EventEnvelope {
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
    event.event_type === "frontend_exception"
      ? {
          ...event,
          payload: { ...event.payload, stack: sanitizeBrowserStackUrls(event.payload.stack) }
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
    throw new Error("unsafe_event");
  }
  const reparsed = validateEvent({
    ...candidate,
    payload: sanitized.value["payload"],
    service: sanitized.value["service"],
    ...(candidate.context === undefined ? {} : { context: sanitized.value["context"] })
  });
  if (!reparsed.success) throw new Error("unsafe_event");
  const safeEvent = { ...reparsed.data };
  delete safeEvent.project_token;
  return safeEvent;
}
