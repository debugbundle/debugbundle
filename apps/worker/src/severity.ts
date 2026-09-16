import {
  classifyRequestStatus,
  inferFrontendExceptionSeverity,
  type EventEnvelope,
  type ImmediateClientErrorPathRule
} from "../../../packages/shared-types/src/index.js";

export type InferredSeverity = "low" | "medium" | "high" | "critical";

type CapturePreset = "minimal" | "balanced" | "investigative";

export function inferSeverity(
  event: EventEnvelope,
  capturePreset: CapturePreset = "minimal",
  immediateClientErrorStatuses: readonly number[] = [],
  immediateClientErrorPathRules: readonly ImmediateClientErrorPathRule[] = []
): InferredSeverity {
  if (
    event.event_type === "request_event"
    && classifyRequestStatus({
      responseStatus: event.payload.response_status,
      capturePreset,
      requestPath: event.payload.path,
      httpMethod: event.payload.method,
      immediateClientErrorStatuses,
      immediateClientErrorPathRules
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
