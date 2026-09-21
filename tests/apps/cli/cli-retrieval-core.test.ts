import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";

import {
  getBundleCommand,
  getIncidentCommand,
  getIncidentContextCommand,
  getLogsCommand,
  getReproductionCommand,
  reopenIncidentCommand,
  resolveIncidentCommand,
  listIncidentsCommand
} from "../../../apps/cli/src/retrieval-commands.js";

const incidentsListGolden = readFileSync(
  new URL("../../fixtures/cli-incidents.golden.txt", import.meta.url),
  "utf8"
);
const incidentDetailGolden = readFileSync(
  new URL("../../fixtures/cli-inspect.golden.txt", import.meta.url),
  "utf8"
);
const logsGolden = readFileSync(
  new URL("../../fixtures/cli-logs.golden.txt", import.meta.url),
  "utf8"
);
const bundleGolden = readFileSync(
  new URL("../../fixtures/cli-bundle.golden.txt", import.meta.url),
  "utf8"
);
const reproductionGolden = readFileSync(
  new URL("../../fixtures/cli-reproduce.golden.txt", import.meta.url),
  "utf8"
);

describe("cli retrieval command rendering", () => {
  it("renders incidents list in human mode", async () => {
    const listIncidents = vi.fn().mockResolvedValue({
      incidents: [
        {
          incident_id: "inc_123",
          title: "TypeError",
          severity: "high",
          status: "open"
        }
      ],
      next_cursor: null
    });

    const result = await listIncidentsCommand(
      {
        bearerToken: "dbundle_mem_x"
      },
      {
        listIncidents
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(incidentsListGolden);
    expect(listIncidents).toHaveBeenCalledWith({ bearerToken: "dbundle_mem_x", status: "active" });
  });

  it("renders mixed-source incident rows with explicit and unknown source labels", async () => {
    const result = await listIncidentsCommand(
      {
        bearerToken: "dbundle_mem_x"
      },
      {
        listIncidents: vi.fn().mockResolvedValue({
          incidents: [
            {
              incident_id: "inc_cloud",
              title: "Cloud TypeError",
              severity: "high",
              status: "open",
              source: "cloud"
            },
            {
              incident_id: "inc_unknown",
              title: "Unknown source incident",
              severity: "medium",
              status: "resolved"
            }
          ],
          next_cursor: null
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(
      [
        "cloud | inc_cloud | high | open | Cloud TypeError",
        "unknown | inc_unknown | medium | resolved | Unknown source incident"
      ].join("\n")
    );
  });

  it("forwards incident filters and returns next_cursor in json mode", async () => {
    const listIncidents = vi.fn().mockResolvedValue({
      incidents: [{ incident_id: "inc_123", title: "TypeError", severity: "high", status: "open" }],
      next_cursor: "2026-03-11T00:09:00.000Z|inc_122"
    });

    const result = await listIncidentsCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_123",
        environment: "production",
        service: "checkout-api",
        status: "open",
        severity: "high",
        cursor: "2026-03-11T00:08:00.000Z|inc_121",
        limit: 10,
        json: true
      },
      {
        listIncidents
      }
    );

    expect(listIncidents).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_123",
      environment: "production",
      service: "checkout-api",
      status: "open",
      severity: "high",
      cursor: "2026-03-11T00:08:00.000Z|inc_121",
      limit: 10
    });
    expect(JSON.parse(result.output)).toEqual({
      incidents: [{ incident_id: "inc_123", title: "TypeError", severity: "high", status: "open" }],
      next_cursor: "2026-03-11T00:09:00.000Z|inc_122"
    });
  });

  it("renders incident detail in human mode", async () => {
    const result = await getIncidentCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123"
      },
      {
        getIncident: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
          title: "TypeError",
          severity: "high",
          status: "open",
          occurrence_count: 3,
          environment: "production"
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(incidentDetailGolden);
  });

  it("renders incident reason details in inspect output when available", async () => {
    const result = await getIncidentCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_5xx"
      },
      {
        getIncident: vi.fn().mockResolvedValue({
          incident_id: "inc_5xx",
          title: "Checkout 5xx",
          severity: "high",
          status: "open",
          occurrence_count: 2,
          environment: "production",
          incident_reason: {
            kind: "request_failure",
            description: "request_event matched the 5xx request incident rule",
            event_type: "request_event",
            event_class: "incident_signal",
            matched_policy:
              "Immediate request failure statuses bypass capture_request_events suppression"
          }
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(
      [
        "Incident: inc_5xx",
        "Title: Checkout 5xx",
        "Severity: high",
        "Status: open",
        "Environment: production",
        "Occurrences: 2",
        "Reason: request_failure",
        "Why: request_event matched the 5xx request incident rule"
      ].join("\n")
    );
  });

  it("renders incident context detail in human mode", async () => {
    const result = await getIncidentContextCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_5xx"
      },
      {
        getIncidentContext: vi.fn().mockResolvedValue({
          incident: {
            incident_id: "inc_5xx",
            title: "Checkout 5xx",
            severity: "high",
            status: "open",
            source: "cloud",
            fingerprint: "fp_checkout",
            fingerprint_version: "v1",
            matched_fields: ["route_template"]
          },
          incident_reason: {
            kind: "request_failure",
            description: "request_event matched the 5xx request incident rule",
            event_type: "request_event",
            event_class: "incident_signal",
            matched_policy:
              "Immediate request failure statuses bypass capture_request_events suppression"
          },
          primary_signal: {
            kind: "request_failure",
            event_type: "request_event",
            event_class: "incident_signal",
            description: "request_event matched the 5xx request incident rule",
            severity: "high",
            service_name: "checkout-api",
            environment: "production",
            error_type: "TypeError",
            error_message: "boom",
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
          bundle: {
            status: "ready"
          },
          reproduction: {
            status: "pending"
          },
          logs: {
            source: "retrieval",
            items: [{ event_id: "evt_123" }],
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
            fingerprint: "fp_checkout",
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
            notes: null
          },
          suggested_next_checks: [
            "Inspect the POST /checkout handler behind this 5xx path.",
            "Start with src/routes/checkout.ts:41 from the first application frame."
          ]
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(
      [
        "Incident: inc_5xx",
        "Source: cloud",
        "Title: Checkout 5xx",
        "Severity: high",
        "Status: open",
        "Reason: request_failure",
        "Why: request_event matched the 5xx request incident rule",
        "Primary signal: request_event",
        "Bundle: ready",
        "Reproduction: pending",
        "Logs: retrieval (1)",
        "Fingerprint: fp_checkout",
        "Matched fields: route_template",
        "Request: POST /checkout",
        "Response status: 503",
        "Error type: TypeError",
        "Error message: boom",
        "Deploy: 2026.03.11.1 (abc123)",
        "Grouping visibility: Repeated request-failure incidents with the same normalized route template, request method, response status, service, and environment reuse this incident fingerprint. This incident currently groups POST /checkout with matched fields route_template.",
        "Bundle regeneration: Bundle status is ready. New incidents create a bundle immediately, while regeneration currently prioritizes regression reopen, then deploy metadata, reproduction-confidence changes, and finally new context updates.",
        "Spike detection: This incident is not currently marked as spiking. Spike detection is evaluated after grouping and only marks an existing incident when short-term frequency has sufficient baseline and exceeds the spike threshold.",
        "Notification cooldown: Webhook and GitHub lifecycle notifications use per-rule cooldown windows to suppress repeated bundle.reopened or incident.spike_detected deliveries for the same incident/event fingerprint.",
        "Redaction: redacted",
        "Redacted fields: request.headers.authorization",
        "Suggested next checks:",
        "- Inspect the POST /checkout handler behind this 5xx path.",
        "- Start with src/routes/checkout.ts:41 from the first application frame."
      ].join("\n")
    );
  });

  it("renders fallback incident detail fields when optional values are absent", async () => {
    const result = await getIncidentCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_minimal"
      },
      {
        getIncident: vi.fn().mockResolvedValue({
          incident_id: "inc_minimal",
          title: "Minimal incident",
          severity: "low",
          status: "open"
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(
      [
        "Incident: inc_minimal",
        "Title: Minimal incident",
        "Severity: low",
        "Status: open",
        "Environment: unknown",
        "Occurrences: 0"
      ].join("\n")
    );
  });

  it("resolves an incident in human mode", async () => {
    const resolveIncident = vi.fn().mockResolvedValue({
      incident_id: "inc_123",
      title: "TypeError",
      severity: "high",
      status: "resolved",
      occurrence_count: 3,
      environment: "production",
      resolved_at: "2026-03-11T00:12:00.000Z"
    });

    const result = await resolveIncidentCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123"
      },
      {
        resolveIncident
      }
    );

    expect(resolveIncident).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      incidentId: "inc_123"
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Status: resolved");
  });

  it("resolves incidents in bulk when multiple ids are provided", async () => {
    const resolveIncidents = vi.fn().mockResolvedValue([
      {
        incident_id: "inc_123",
        title: "TypeError",
        severity: "high",
        status: "resolved"
      },
      {
        incident_id: "inc_456",
        title: "TimeoutError",
        severity: "medium",
        status: "resolved"
      }
    ]);

    const result = await resolveIncidentCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentIds: ["inc_123", "inc_456"],
        json: true
      },
      {
        resolveIncident: vi.fn(),
        resolveIncidents
      }
    );

    expect(resolveIncidents).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      incidentIds: ["inc_123", "inc_456"]
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      incidents: [
        {
          incident_id: "inc_123",
          title: "TypeError",
          severity: "high",
          status: "resolved"
        },
        {
          incident_id: "inc_456",
          title: "TimeoutError",
          severity: "medium",
          status: "resolved"
        }
      ]
    });
  });

  it("reopens incidents in bulk when multiple ids are provided", async () => {
    const reopenIncidents = vi.fn().mockResolvedValue([
      {
        incident_id: "inc_123",
        title: "TypeError",
        severity: "high",
        status: "open"
      },
      {
        incident_id: "inc_456",
        title: "TimeoutError",
        severity: "medium",
        status: "open"
      }
    ]);

    const result = await reopenIncidentCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentIds: ["inc_123", "inc_456"],
        json: true
      },
      {
        reopenIncident: vi.fn(),
        reopenIncidents
      }
    );

    expect(reopenIncidents).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      incidentIds: ["inc_123", "inc_456"]
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      incidents: [
        {
          incident_id: "inc_123",
          title: "TypeError",
          severity: "high",
          status: "open"
        },
        {
          incident_id: "inc_456",
          title: "TimeoutError",
          severity: "medium",
          status: "open"
        }
      ]
    });
  });

  it("renders human output for bundle and reproduction commands using stable golden formatting", async () => {
    const bundleResult = await getBundleCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123"
      },
      {
        getBundle: vi.fn().mockResolvedValue({ bundle_version: 1, status: "ready" })
      }
    );

    const reproductionResult = await getReproductionCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123"
      },
      {
        getReproduction: vi.fn().mockResolvedValue({
          possible: true,
          confidence: 0.8,
          reason: "request_context_available",
          artifacts: null,
          feasibility_reference: null
        })
      }
    );

    expect(bundleResult.exitCode).toBe(0);
    expect(bundleResult.output).toBe(bundleGolden);
    expect(reproductionResult.exitCode).toBe(0);
    expect(reproductionResult.output).toBe(reproductionGolden);
  });

  it("returns json output for bundle and reproduction commands", async () => {
    const bundleResult = await getBundleCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123",
        json: true
      },
      {
        getBundle: vi.fn().mockResolvedValue({ bundle_version: 1 })
      }
    );

    const reproductionResult = await getReproductionCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123",
        json: true
      },
      {
        getReproduction: vi.fn().mockResolvedValue({
          possible: true,
          confidence: 0.8,
          reason: "request_context_available",
          artifacts: null,
          feasibility_reference: null
        })
      }
    );

    expect(JSON.parse(bundleResult.output)).toEqual({ bundle_version: 1 });
    expect(JSON.parse(reproductionResult.output)).toEqual({
      possible: true,
      confidence: 0.8,
      reason: "request_context_available",
      artifacts: null,
      feasibility_reference: null
    });
  });

  it("maps retrieval api errors to deterministic exit codes", async () => {
    const result = await getBundleCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_missing"
      },
      {
        getBundle: vi.fn().mockRejectedValue(new RetrievalApiError(404, "incident_not_found"))
      }
    );

    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("incident_not_found");
  });

  it("reports client validation failure without attributing a cloud outage or prescribing a retry", async () => {
    const result = await getIncidentContextCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123"
      },
      {
        getIncidentContext: vi
          .fn()
          .mockRejectedValue(new RetrievalApiError(200, "invalid_response_shape"))
      }
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("retrieval_api_error: 200:invalid_response_shape");
    expect(result.output).toContain("Check the CLI and Node.js versions");
  });

  it("forwards log filters and preserves next_cursor in json mode", async () => {
    const getLogs = vi.fn().mockResolvedValue({
      logs: [
        {
          event_id: "evt_123",
          event_type: "backend_exception",
          occurred_at: "2026-03-11T00:10:00.000Z",
          is_sampled: true,
          level: "error"
        }
      ],
      next_cursor: "2026-03-11T00:10:00.000Z|evt_123"
    });

    const result = await getLogsCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123",
        level: "error",
        cursor: "2026-03-11T00:09:00.000Z|evt_122",
        limit: 10,
        json: true
      },
      {
        getLogs
      }
    );

    expect(getLogs).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      incidentId: "inc_123",
      level: "error",
      cursor: "2026-03-11T00:09:00.000Z|evt_122",
      limit: 10
    });
    expect(JSON.parse(result.output)).toEqual({
      logs: [
        {
          event_id: "evt_123",
          event_type: "backend_exception",
          occurred_at: "2026-03-11T00:10:00.000Z",
          is_sampled: true,
          level: "error"
        }
      ],
      next_cursor: "2026-03-11T00:10:00.000Z|evt_123"
    });
  });

  it("renders logs in human mode", async () => {
    const result = await getLogsCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123"
      },
      {
        getLogs: vi.fn().mockResolvedValue({
          logs: [
            {
              event_id: "evt_123",
              event_type: "backend_exception",
              occurred_at: "2026-03-11T00:10:00.000Z",
              is_sampled: true,
              level: "error"
            }
          ],
          next_cursor: null
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(logsGolden);
  });

  it("renders unknown log levels in human mode", async () => {
    const result = await getLogsCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123"
      },
      {
        getLogs: vi.fn().mockResolvedValue({
          logs: [
            {
              event_id: "evt_unknown",
              event_type: "backend_exception",
              occurred_at: "2026-03-11T00:15:00.000Z",
              is_sampled: true,
              level: null
            }
          ],
          next_cursor: null
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(
      "2026-03-11T00:15:00.000Z | unknown | backend_exception | evt_unknown"
    );
  });
});
