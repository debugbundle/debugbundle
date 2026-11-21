import { isJavaRedirectedStderrLogger } from "../../../packages/event-normalizer/src/java-stderr.js";
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
    event.event_type === "request_event" &&
    classifyRequestStatus({
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
    if (
      event.payload.name === "OpenAiOperationalSignal" &&
      /^openai_reviewer_credential_expiring rotation=[g-v]{16}$/.test(event.payload.message) &&
      event.payload.runtime.framework_extras?.["reviewer_milestone"] === "expired"
    ) {
      return "critical";
    }
    return "high";
  }

  if (
    event.event_type === "log_event" &&
    event.service.runtime === "java" &&
    ["error", "critical", "fatal"].includes(event.payload.level.toLowerCase()) &&
    isJavaRedirectedStderrLogger(event.payload.attributes["logger"]) &&
    /^(?:Exception in thread "[^"]{1,128}"\s+)?[\w.$/]+(?:Exception|Error|Throwable)(?::|$)/.test(
      event.payload.message
    )
  ) {
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
