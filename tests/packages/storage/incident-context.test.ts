import { describe, expect, it } from "vitest";

import { buildIncidentContextRecord } from "../../../packages/storage/src/incident-context.js";

describe("incident context", () => {
  it("uses a generic grouping explanation for non-5xx incident reasons even when request metadata exists", () => {
    const context = buildIncidentContextRecord({
      incident: {
        incident_id: "inc_backend",
        title: "Unhandled backend exception",
        severity: "high",
        status: "open",
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_backend",
        fingerprint_version: "v1",
        matched_fields: ["error_type", "route_template"],
        incident_reason: {
          kind: "backend_exception",
          description: "backend_exception created the incident",
          event_type: "backend_exception",
          event_class: "incident_signal",
          matched_policy: "Unhandled backend exceptions always create incidents"
        }
      },
      bundle: {
        status: "ready",
        body: {
          context: {
            request: {
              method: "GET",
              path: "/checkout/123",
              route_template: "/checkout/:orderId"
            },
            response: {
              status_code: 500
            }
          }
        }
      },
      reproduction: {
        status: "pending"
      }
    });

    expect(context.visibility.grouping).toBe(
      "This incident groups repeated failures by fingerprint version v1 inside the service and environment boundary, with matched fields error_type, route_template."
    );
    expect(context.visibility.grouping).not.toContain("5xx request failures");
  });

  it("uses request-anomaly wording when the incident matched repeated contextual request failures", () => {
    const context = buildIncidentContextRecord({
      incident: {
        incident_id: "inc_request_anomaly",
        title: "Request anomaly: GET /checkout/:orderId returned 404 repeatedly",
        severity: "medium",
        status: "open",
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_request_anomaly",
        fingerprint_version: "v1",
        matched_fields: ["request_anomaly", "route_template", "http_method", "http_status"],
        incident_reason: {
          kind: "request_failure",
          description: "request_event crossed the repeated request anomaly threshold",
          event_type: "request_event",
          event_class: "incident_signal",
          matched_policy: "Repeated contextual request failures crossed the request anomaly threshold"
        }
      },
      bundle: {
        status: "ready",
        body: {
          context: {
            request: {
              method: "GET",
              path: "/checkout/123",
              route_template: "/checkout/:orderId"
            },
            response: {
              status_code: 404
            }
          }
        }
      },
      reproduction: {
        status: "pending"
      }
    });

    expect(context.visibility.grouping).toContain("request-anomaly incidents");
    expect(context.suggested_next_checks).toContain(
      "Inspect the GET /checkout/:orderId handler behind this repeated request-anomaly path."
    );
  });

  it("surfaces opaque browser and bot context from ready bundles", () => {
    const context = buildIncidentContextRecord({
      incident: {
        incident_id: "inc_browser",
        title: "Unhandled promise rejection",
        severity: "low",
        status: "open",
        service_name: "saycheese-frontend",
        environment: "production",
        fingerprint: "fp_browser",
        fingerprint_version: "v1",
        matched_fields: ["normalized_message"]
      },
      bundle: {
        status: "ready",
        body: {
          context: {
            device: {
              user_agent:
                "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/148.0.0.0 Mobile Safari/537.36 Googlebot/2.1"
            },
            frontend: {
              exceptions: [
                {
                  browser_event: {
                    kind: "window_error",
                    message: "Window error",
                    opaque: true
                  }
                }
              ]
            }
          }
        }
      },
      reproduction: {
        status: "pending"
      }
    });

    expect(context.browser_signal).toEqual({
      browser_event_kind: "window_error",
      browser_event_opaque: true,
      browser_event_message: "Window error",
      client_kind: "bot",
      bot_family: "Googlebot"
    });
    expect(context.suggested_next_checks).toContain(
      "Treat the browser event as opaque; inspect CSP, cross-origin scripts, resource loading, and framework error boundaries before changing application code."
    );
    expect(context.suggested_next_checks).toContain(
      "Review whether Googlebot traffic is operational noise before applying a bot-scoped capture rule."
    );
  });
});
