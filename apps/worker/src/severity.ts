import { classifyRequestStatus, type EventEnvelope } from "../../../packages/shared-types/src/index.js";

export type InferredSeverity = "low" | "medium" | "high" | "critical";

type CapturePreset = "minimal" | "balanced" | "investigative";

function inferFrontendExceptionSeverity(
  event: Extract<EventEnvelope, { event_type: "frontend_exception" }>
): InferredSeverity {
  const browserEvent = event.payload.browser_event;
  if (browserEvent?.opaque === true) {
    return browserEvent.kind === "resource_error" ? "medium" : "low";
  }

  return "high";
}

export function inferSeverity(
  event: EventEnvelope,
  capturePreset: CapturePreset = "minimal",
  immediateClientErrorStatuses: readonly number[] = []
): InferredSeverity {
  if (
    event.event_type === "request_event"
    && classifyRequestStatus({
      responseStatus: event.payload.response_status,
      capturePreset,
      immediateClientErrorStatuses
    }) === "incident_signal"
  ) {
    return "high";
  }

  if (event.event_type === "backend_exception") {
    return "high";
  }

  if (event.event_type === "frontend_exception") {
    return inferFrontendExceptionSeverity(event);
  }

  if (event.event_type === "error_suppressed") {
    return "medium";
  }

  return "low";
}
