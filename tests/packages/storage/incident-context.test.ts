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
});
