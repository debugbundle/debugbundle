import { describe, expect, it, vi } from "vitest";
import {
  gzipSync,
  createApiServer,
  createTokenManagementDependency
} from "../../helpers/api-retrieval.js";

describe("api-retrieval core", () => {
  it("should return deterministic one-call incident context", async (): Promise<void> => {
    const projectId = "550e8400-e29b-41d4-a716-446655440000";
    const incidentRecord = {
      incident_id: "550e8400-e29b-41d4-a716-446655440123",
      project_id: projectId,
      project_name: "Main App",
      service_id: "svc_123",
      service_name: "checkout-api",
      latest_deployment_id: "dep_123",
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "Checkout 5xx",
      severity: "high" as const,
      status: "open" as const,
      first_seen_at: "2026-03-11T00:00:00.000Z",
      last_seen_at: "2026-03-11T00:10:00.000Z",
      occurrence_count: 3,
      spike_detected_at: null,
      resolved_at: null,
      regressed_at: null,
      matched_fields: ["route_template"],
      incident_reason: {
        kind: "request_failure" as const,
        description: "request_event matched the immediate request failure incident rule",
        event_type: "request_event" as const,
        event_class: "incident_signal" as const,
        matched_policy:
          "Immediate request failure statuses bypass capture_request_events suppression"
      }
    };

    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue(incidentRecord),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([
          {
            event_id: "evt_123",
            event_type: "log_event",
            occurred_at: "2026-03-11T00:10:00.000Z",
            is_sampled: true,
            level: "error"
          }
        ]),
        listServicesForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi
          .fn()
          .mockResolvedValueOnce(
            gzipSync(
              Buffer.from(
                JSON.stringify({
                  bundle_version: 1,
                  summary: {
                    primary_signal: "request_event",
                    error_type: "UpstreamTimeout",
                    error_message: "checkout upstream timed out",
                    first_application_frame: {
                      file: "src/routes/checkout.ts",
                      line: 41,
                      function: "handleCheckout"
                    }
                  },
                  signal: {
                    severity: "high"
                  },
                  context: {
                    request: {
                      method: "POST",
                      path: "/checkout",
                      route_template: "/checkout"
                    },
                    response: {
                      status_code: 503
                    },
                    deploy: {
                      commit_sha: "abc123",
                      deploy_version: "2026.03.11.1",
                      branch: "main",
                      deployed_at: "2026-03-11T00:00:00.000Z",
                      regression_window: true
                    }
                  },
                  redaction: {
                    redacted: true,
                    fields: ["request.headers.authorization"],
                    notes: "sensitive headers removed"
                  }
                }),
                "utf8"
              )
            )
          )
          .mockResolvedValueOnce(
            gzipSync(
              Buffer.from(
                JSON.stringify({
                  possible: true,
                  confidence: 0.8,
                  reason: "request_context_available"
                }),
                "utf8"
              )
            )
          )
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123/context",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      incident: incidentRecord,
      incident_reason: incidentRecord.incident_reason,
      primary_signal: {
        kind: "request_failure",
        event_type: "request_event",
        event_class: "incident_signal",
        description: "request_event matched the immediate request failure incident rule",
        severity: "high",
        service_name: "checkout-api",
        environment: "production",
        error_type: "UpstreamTimeout",
        error_message: "checkout upstream timed out",
        request_method: "POST",
        request_path: "/checkout",
        route_template: "/checkout",
        response_status: 503,
        first_application_frame: {
          file: "src/routes/checkout.ts",
          line: 41,
          function: "handleCheckout"
        }
      },
      browser_signal: null,
      bundle: {
        status: "ready",
        body: expect.objectContaining({
          bundle_version: 1
        })
      },
      reproduction: {
        status: "ready",
        body: {
          possible: true,
          confidence: 0.8,
          reason: "request_context_available"
        }
      },
      logs: {
        source: "retrieval",
        items: [
          {
            event_id: "evt_123",
            event_type: "log_event",
            occurred_at: "2026-03-11T00:10:00.000Z",
            is_sampled: true,
            level: "error"
          }
        ],
        next_cursor: null
      },
      deploy: {
        latest_deployment_id: "dep_123",
        commit_sha: "abc123",
        deploy_version: "2026.03.11.1",
        branch: "main",
        deployed_at: "2026-03-11T00:00:00.000Z",
        regression_window: true
      },
      grouping: {
        fingerprint: "fp_123",
        fingerprint_version: "v1",
        matched_fields: ["route_template"]
      },
      visibility: {
        grouping:
          "Repeated request-failure incidents with the same normalized route template, request method, response status, service, and environment reuse this incident fingerprint. This incident currently groups POST /checkout with matched fields route_template.",
        bundle_regeneration:
          "Bundle status is ready. New incidents create a bundle immediately, while regeneration currently prioritizes regression reopen, then deploy metadata, reproduction-confidence changes, and finally new context updates.",
        spike_detection:
          "This incident is not currently marked as spiking. Spike detection is evaluated after grouping and only marks an existing incident when short-term frequency has sufficient baseline and exceeds the spike threshold.",
        notification_cooldown:
          "Webhook and GitHub lifecycle notifications use per-rule cooldown windows to suppress repeated bundle.reopened or incident.spike_detected deliveries for the same incident/event fingerprint."
      },
      redaction: {
        redacted: true,
        fields: ["request.headers.authorization"],
        notes: "sensitive headers removed"
      },
      suggested_next_checks: [
        "Inspect the POST /checkout handler behind this request-failure path.",
        "Start with src/routes/checkout.ts:41 from the first application frame.",
        "Compare this incident against the most recent deploy and recent regressions."
      ]
    });
  });
});
