import type { EventEnvelope } from "./event-envelope.js";
import { describeBrowserResourceInterruption } from "./browser-resource.js";

/** Evidence confidence sets the default severity; dependency role never suppresses a failure. */
export function inferFrontendExceptionSeverity(
  event: Extract<EventEnvelope, { event_type: "frontend_exception" }>
): "low" | "medium" | "high" {
  const browserEvent = event.payload.browser_event;
  if (describeBrowserResourceInterruption(browserEvent) !== null) return "low";
  if (browserEvent?.opaque === true)
    return browserEvent.kind === "resource_error" ? "medium" : "low";
  return "high";
}
