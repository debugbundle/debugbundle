import { describe, expect, it, vi } from "vitest";

import { createRetrievalMcpTools } from "../../../apps/mcp/src/retrieval-tools.js";

describe("mcp retrieval tools incidents", () => {
  it("returns incident list and detail payloads", async () => {
    const listIncidents = vi.fn().mockResolvedValue({
      incidents: [{ incident_id: "inc_123" }],
      next_cursor: "2026-03-11T00:09:00.000Z|inc_122"
    });

    const tools = createRetrievalMcpTools({
      listIncidents,
      getIncident: vi.fn().mockResolvedValue({
        incident_id: "inc_123",
        incident_reason: {
          kind: "request_failure",
          description: "request_event matched the 5xx request incident rule",
          event_type: "request_event",
          event_class: "incident_signal",
          matched_policy: "Immediate request failure statuses bypass capture_request_events suppression"
        }
      }),
      getIncidentContext: vi.fn().mockResolvedValue({
        incident: {
          incident_id: "inc_123",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          matched_fields: ["route_template"]
        },
        incident_reason: {
          kind: "request_failure",
          description: "request_event matched the 5xx request incident rule",
          event_type: "request_event",
          event_class: "incident_signal",
          matched_policy: "Immediate request failure statuses bypass capture_request_events suppression"
        },
        primary_signal: {
          kind: "request_failure",
          event_type: "request_event",
          event_class: "incident_signal",
          description: "request_event matched the 5xx request incident rule",
          severity: "high",
          service_name: "checkout-api",
          environment: "production",
          error_type: null,
          error_message: null,
          request_method: "POST",
          request_path: "/checkout",
          route_template: "/checkout",
          response_status: 503,
          first_application_frame: null
        },
        bundle: {
          status: "ready"
        },
        reproduction: {
          status: "pending"
        },
        logs: {
          source: "retrieval",
          items: [],
          next_cursor: null
        },
        deploy: {
          latest_deployment_id: null,
          commit_sha: null,
          deploy_version: null,
          branch: null,
          deployed_at: null,
          regression_window: null
        },
        grouping: {
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          matched_fields: ["route_template"]
        },
        redaction: null,
        suggested_next_checks: []
      }),
      resolveIncident: vi.fn().mockResolvedValue({ incident_id: "inc_123", status: "resolved" }),
      reopenIncident: vi.fn(),
      getBundle: vi.fn().mockResolvedValue({ bundle_version: 1 }),
      getLogs: vi.fn().mockResolvedValue({ logs: [], next_cursor: null }),
      getReproduction: vi.fn().mockResolvedValue({ status: "pending" })
    });

    await expect(
      tools.list_incidents({
        bearerToken: "dbundle_mem_x",
        source: "cloud",
        projectId: "proj_123",
        environment: "production",
        service: "checkout-api",
        status: "open",
        severity: "high",
        firstSeenAfter: "2026-03-11T00:00:00.000Z",
        cursor: "2026-03-11T00:08:00.000Z|inc_121",
        limit: 10
      })
    ).resolves.toEqual({
      incidents: [{ incident_id: "inc_123", source: "cloud" }],
      next_cursor: "2026-03-11T00:09:00.000Z|inc_122"
    });
    expect(listIncidents).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_123",
      environment: "production",
      service: "checkout-api",
      status: "open",
      severity: "high",
      firstSeenAfter: "2026-03-11T00:00:00.000Z",
      cursor: "2026-03-11T00:08:00.000Z|inc_121",
      limit: 10
    });
    await expect(
      tools.get_incident({ bearerToken: "dbundle_mem_x", source: "cloud", incidentId: "inc_123" })
    ).resolves.toEqual({
      incident: {
        incident_id: "inc_123",
        incident_reason: {
          kind: "request_failure",
          description: "request_event matched the 5xx request incident rule",
          event_type: "request_event",
          event_class: "incident_signal",
          matched_policy: "Immediate request failure statuses bypass capture_request_events suppression"
        },
        source: "cloud"
      }
    });
    await expect(
      tools.get_incident_context({ bearerToken: "dbundle_mem_x", source: "cloud", incidentId: "inc_123" })
    ).resolves.toEqual(
      expect.objectContaining({
        incident: expect.objectContaining({
          incident_id: "inc_123",
          source: "cloud"
        }),
        primary_signal: expect.objectContaining({
          response_status: 503
        })
      })
    );
  });

  it("returns incident payload for resolve_incident", async () => {
    const resolveIncident = vi.fn().mockResolvedValue({
      incident_id: "inc_123",
      status: "resolved",
      resolved_at: "2026-03-11T00:12:00.000Z"
    });

    const tools = createRetrievalMcpTools({
      listIncidents: vi.fn().mockResolvedValue({ incidents: [], next_cursor: null }),
      getIncident: vi.fn().mockResolvedValue({ incident_id: "inc_123" }),
      getIncidentContext: vi.fn().mockResolvedValue({
        incident: {
          incident_id: "inc_123",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          matched_fields: []
        },
        incident_reason: null,
        primary_signal: {
          kind: null,
          event_type: "backend_exception",
          event_class: "incident_signal",
          description: "Primary signal for incident inc_123",
          severity: "high",
          service_name: null,
          environment: "production",
          error_type: null,
          error_message: null,
          request_method: null,
          request_path: null,
          route_template: null,
          response_status: null,
          first_application_frame: null
        },
        bundle: { status: "pending" },
        reproduction: { status: "pending" },
        logs: { source: "none", items: [], next_cursor: null },
        deploy: {
          latest_deployment_id: null,
          commit_sha: null,
          deploy_version: null,
          branch: null,
          deployed_at: null,
          regression_window: null
        },
        grouping: {
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          matched_fields: []
        },
        redaction: null,
        suggested_next_checks: []
      }),
      resolveIncident,
      reopenIncident: vi.fn(),
      getBundle: vi.fn().mockResolvedValue({ bundle_version: 1 }),
      getLogs: vi.fn().mockResolvedValue({ logs: [], next_cursor: null }),
      getReproduction: vi.fn().mockResolvedValue({ status: "pending" })
    });

    await expect(
      tools.resolve_incident({ bearerToken: "dbundle_mem_x", source: "cloud", incidentId: "inc_123" })
    ).resolves.toEqual({
      incident: {
        incident_id: "inc_123",
        status: "resolved",
        resolved_at: "2026-03-11T00:12:00.000Z",
        source: "cloud"
      }
    });
    expect(resolveIncident).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      incidentId: "inc_123"
    });
  });

  it("returns incidents payload for resolve_incidents", async () => {
    const resolveIncidents = vi.fn().mockResolvedValue([
      {
        incident_id: "inc_123",
        status: "resolved",
        resolved_at: "2026-03-11T00:12:00.000Z"
      },
      {
        incident_id: "inc_456",
        status: "resolved",
        resolved_at: "2026-03-11T00:13:00.000Z"
      }
    ]);

    const tools = createRetrievalMcpTools({
      listIncidents: vi.fn().mockResolvedValue({ incidents: [], next_cursor: null }),
      getIncident: vi.fn().mockResolvedValue({ incident_id: "inc_123" }),
      getIncidentContext: vi.fn().mockResolvedValue({
        incident: {
          incident_id: "inc_123",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          matched_fields: []
        },
        incident_reason: null,
        primary_signal: {
          kind: null,
          event_type: "backend_exception",
          event_class: "incident_signal",
          description: "Primary signal for incident inc_123",
          severity: "high",
          service_name: null,
          environment: "production",
          error_type: null,
          error_message: null,
          request_method: null,
          request_path: null,
          route_template: null,
          response_status: null,
          first_application_frame: null
        },
        bundle: { status: "pending" },
        reproduction: { status: "pending" },
        logs: { source: "none", items: [], next_cursor: null },
        deploy: {
          latest_deployment_id: null,
          commit_sha: null,
          deploy_version: null,
          branch: null,
          deployed_at: null,
          regression_window: null
        },
        grouping: {
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          matched_fields: []
        },
        redaction: null,
        suggested_next_checks: []
      }),
      resolveIncident: vi.fn(),
      resolveIncidents,
      reopenIncident: vi.fn(),
      getBundle: vi.fn().mockResolvedValue({ bundle_version: 1 }),
      getLogs: vi.fn().mockResolvedValue({ logs: [], next_cursor: null }),
      getReproduction: vi.fn().mockResolvedValue({ status: "pending" })
    });

    await expect(
      tools.resolve_incidents({
        bearerToken: "dbundle_mem_x",
        source: "cloud",
        incidentIds: ["inc_123", "inc_456", "inc_123"]
      })
    ).resolves.toEqual({
      incidents: [
        {
          incident_id: "inc_123",
          status: "resolved",
          resolved_at: "2026-03-11T00:12:00.000Z",
          source: "cloud"
        },
        {
          incident_id: "inc_456",
          status: "resolved",
          resolved_at: "2026-03-11T00:13:00.000Z",
          source: "cloud"
        }
      ]
    });
    expect(resolveIncidents).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      incidentIds: ["inc_123", "inc_456"]
    });
  });

  it("returns incidents payload for reopen_incidents", async () => {
    const reopenIncidents = vi.fn().mockResolvedValue([
      {
        incident_id: "inc_123",
        status: "open",
        resolved_at: null
      },
      {
        incident_id: "inc_456",
        status: "open",
        resolved_at: null
      }
    ]);

    const tools = createRetrievalMcpTools({
      listIncidents: vi.fn().mockResolvedValue({ incidents: [], next_cursor: null }),
      getIncident: vi.fn().mockResolvedValue({ incident_id: "inc_123" }),
      getIncidentContext: vi.fn().mockResolvedValue({
        incident: {
          incident_id: "inc_123",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          matched_fields: []
        },
        incident_reason: null,
        primary_signal: {
          kind: null,
          event_type: "backend_exception",
          event_class: "incident_signal",
          description: "Primary signal for incident inc_123",
          severity: "high",
          service_name: null,
          environment: "production",
          error_type: null,
          error_message: null,
          request_method: null,
          request_path: null,
          route_template: null,
          response_status: null,
          first_application_frame: null
        },
        bundle: { status: "pending" },
        reproduction: { status: "pending" },
        logs: { source: "none", items: [], next_cursor: null },
        deploy: {
          latest_deployment_id: null,
          commit_sha: null,
          deploy_version: null,
          branch: null,
          deployed_at: null,
          regression_window: null
        },
        grouping: {
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          matched_fields: []
        },
        redaction: null,
        suggested_next_checks: []
      }),
      resolveIncident: vi.fn(),
      reopenIncident: vi.fn(),
      reopenIncidents,
      getBundle: vi.fn().mockResolvedValue({ bundle_version: 1 }),
      getLogs: vi.fn().mockResolvedValue({ logs: [], next_cursor: null }),
      getReproduction: vi.fn().mockResolvedValue({ status: "pending" })
    });

    await expect(
      tools.reopen_incidents({
        bearerToken: "dbundle_mem_x",
        source: "cloud",
        incidentIds: ["inc_123", "inc_456"]
      })
    ).resolves.toEqual({
      incidents: [
        {
          incident_id: "inc_123",
          status: "open",
          resolved_at: null,
          source: "cloud"
        },
        {
          incident_id: "inc_456",
          status: "open",
          resolved_at: null,
          source: "cloud"
        }
      ]
    });
    expect(reopenIncidents).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      incidentIds: ["inc_123", "inc_456"]
    });
  });
});
