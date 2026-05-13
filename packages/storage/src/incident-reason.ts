export type IncidentReasonKind =
  | "backend_exception"
  | "frontend_exception"
  | "request_failure"
  | "error_log";

export interface IncidentReason extends Record<string, unknown> {
  kind: IncidentReasonKind;
  description: string;
  event_type: "backend_exception" | "frontend_exception" | "request_event" | "log_event";
  event_class: "incident_signal";
  matched_policy: string;
}

type IncidentSignalEventType = IncidentReason["event_type"];

const LOCAL_INCIDENT_REASON_PRIORITY: IncidentSignalEventType[] = [
  "request_event",
  "backend_exception",
  "frontend_exception",
  "log_event"
];

export function deriveIncidentReasonFromSignal(input: {
  event_type: string;
  event_class?: string | null;
  level?: string | null;
  response_status?: number | null;
  request_anomaly?: boolean;
}): IncidentReason | null {
  if (input.event_class !== undefined && input.event_class !== null && input.event_class !== "incident_signal") {
    return null;
  }

  switch (input.event_type) {
    case "backend_exception":
      return {
        kind: "backend_exception",
        description: "backend_exception matched the backend exception incident rule",
        event_type: "backend_exception",
        event_class: "incident_signal",
        matched_policy: "backend exceptions always create incidents"
      };

    case "frontend_exception":
      return {
        kind: "frontend_exception",
        description: "frontend_exception matched the frontend exception incident rule",
        event_type: "frontend_exception",
        event_class: "incident_signal",
        matched_policy: "frontend exceptions always create incidents"
      };

    case "request_event": {
      const responseStatus =
        typeof input.response_status === "number" && Number.isFinite(input.response_status) ? input.response_status : null;
      const isRequestAnomaly = input.request_anomaly === true;

      return {
        kind: "request_failure",
        description:
          isRequestAnomaly
            ? responseStatus !== null
              ? `request_event response_status=${responseStatus} crossed the repeated request anomaly threshold`
              : "request_event crossed the repeated request anomaly threshold"
            : responseStatus !== null
              ? `request_event response_status=${responseStatus} matched the immediate request failure incident rule`
              : "request_event matched the immediate request failure incident rule",
        event_type: "request_event",
        event_class: "incident_signal",
        matched_policy: isRequestAnomaly
          ? "Repeated contextual request failures crossed the request anomaly threshold"
          : "Immediate request failure statuses bypass capture_request_events suppression"
      };
    }

    case "log_event": {
      const level = typeof input.level === "string" && input.level.length > 0 ? input.level : "error";

      return {
        kind: "error_log",
        description: `log_event level=${level} matched the incident log-level rule`,
        event_type: "log_event",
        event_class: "incident_signal",
        matched_policy: "error, fatal, and critical log events create incidents"
      };
    }

    default:
      return null;
  }
}

export function deriveIncidentReasonFromSourceEventTypes(
  eventTypes: string[]
): IncidentReason | null {
  for (const prioritizedEventType of LOCAL_INCIDENT_REASON_PRIORITY) {
    if (eventTypes.includes(prioritizedEventType)) {
      return deriveIncidentReasonFromSignal({
        event_type: prioritizedEventType,
        event_class: "incident_signal"
      });
    }
  }

  return null;
}
