import { describe, expect, it } from "vitest";

import {
  deriveIncidentReasonFromSignal,
  deriveIncidentReasonFromSourceEventTypes
} from "../../../packages/storage/src/incident-reason.js";

describe("incident reason helpers", () => {
  it("returns null for non-incident-signal event classes", () => {
    expect(
      deriveIncidentReasonFromSignal({
        event_type: "request_event",
        event_class: "context_signal"
      })
    ).toBeNull();
  });

  it("describes immediate request failures with the response status when available", () => {
    expect(
      deriveIncidentReasonFromSignal({
        event_type: "request_event",
        event_class: "incident_signal",
        response_status: 503
      })
    ).toEqual({
      kind: "request_failure",
      description: "request_event response_status=503 matched the immediate request failure incident rule",
      event_type: "request_event",
      event_class: "incident_signal",
      matched_policy: "Immediate request failure statuses bypass capture_request_events suppression"
    });
  });

  it("describes repeated request anomalies when the anomaly marker is present", () => {
    expect(
      deriveIncidentReasonFromSignal({
        event_type: "request_event",
        event_class: "incident_signal",
        request_anomaly: true,
        response_status: 404
      })
    ).toEqual({
      kind: "request_failure",
      description: "request_event response_status=404 crossed the repeated request anomaly threshold",
      event_type: "request_event",
      event_class: "incident_signal",
      matched_policy: "Repeated contextual request failures crossed the request anomaly threshold"
    });
  });

  it("defaults log-event level text when no explicit level is present", () => {
    expect(
      deriveIncidentReasonFromSignal({
        event_type: "log_event",
        event_class: "incident_signal"
      })
    ).toEqual({
      kind: "error_log",
      description: "log_event level=error matched the incident log-level rule",
      event_type: "log_event",
      event_class: "incident_signal",
      matched_policy: "error, fatal, and critical log events create incidents"
    });
  });

  it("prioritizes request events over exception types for local source-event fallback", () => {
    expect(deriveIncidentReasonFromSourceEventTypes(["backend_exception", "request_event"])?.event_type).toBe("request_event");
  });

  it("returns null when there is no incident-signal source event type", () => {
    expect(deriveIncidentReasonFromSourceEventTypes(["probe_event", "frontend_breadcrumb"])) .toBeNull();
  });
});