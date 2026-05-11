import { describe, expect, it, vi } from "vitest";

import { RetrievalApiError, createRetrievalApi, type HttpClient } from "../../../packages/retrieval-client/src/index.js";

describe("retrieval api client", () => {
  it("calls incidents list route with optional limit", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        incidents: [
          {
            incident_id: "inc_123",
            project_id: "proj_123",
            project_name: "Main App",
            service_id: "svc_123",
            service_name: "checkout-api",
            latest_deployment_id: null,
            environment: "production",
            fingerprint: "fp_123",
            fingerprint_version: "v1",
            title: "TypeError",
            severity: "high",
            status: "open",
            first_seen_at: "2026-03-11T00:00:00.000Z",
            last_seen_at: "2026-03-11T00:10:00.000Z",
            occurrence_count: 3,
            spike_detected_at: null,
            resolved_at: null,
            regressed_at: null,
            matched_fields: ["fingerprint"]
          }
        ]
      }
    });

    const api = createRetrievalApi({ request });
    const response = await api.listIncidents({ bearerToken: "dbundle_mem_x", limit: 10 });

    expect(response).toEqual({
      incidents: [
        {
          incident_id: "inc_123",
          project_id: "proj_123",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: null,
          regressed_at: null,
          matched_fields: ["fingerprint"]
        }
      ],
      next_cursor: null
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/incidents?limit=10",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("calls incidents list route with filters and cursor", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        incidents: [],
        next_cursor: "2026-03-11T00:09:00.000Z|inc_122"
      }
    });

    const api = createRetrievalApi({ request });

    await expect(
      api.listIncidents({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_123",
      environment: "production",
      service: "checkout-api",
      status: "open",
      severity: "high",
      limit: 10,
      cursor: "2026-03-11T00:09:00.000Z|inc_122"
      })
    ).resolves.toEqual({ incidents: [], next_cursor: "2026-03-11T00:09:00.000Z|inc_122" });

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/incidents?project_id=proj_123&environment=production&service=checkout-api&status=open&severity=high&cursor=2026-03-11T00%3A09%3A00.000Z%7Cinc_122&limit=10",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("calls incident detail route", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        incident: {
          incident_id: "inc_123",
          project_id: "proj_123",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: null,
          regressed_at: null,
          matched_fields: ["fingerprint"],
          incident_reason: {
            kind: "request_failure_5xx",
            description: "request_event matched the 5xx request incident rule",
            event_type: "request_event",
            event_class: "incident_signal",
            matched_policy: "5xx request failures bypass capture_request_events suppression"
          }
        }
      }
    });

    const api = createRetrievalApi({ request });
    const incident = await api.getIncident({ bearerToken: "dbundle_mem_x", incidentId: "inc_123" });

    expect(incident.incident_id).toBe("inc_123");
    expect(incident.incident_reason?.kind).toBe("request_failure_5xx");
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/incidents/inc_123",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("calls incident resolve route", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        incident: {
          incident_id: "inc_123",
          project_id: "proj_123",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "resolved",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: "2026-03-11T00:12:00.000Z",
          regressed_at: null,
          matched_fields: ["fingerprint"]
        }
      }
    });

    const api = createRetrievalApi({ request });
    const incident = await api.resolveIncident({ bearerToken: "dbundle_mem_x", incidentId: "inc_123" });

    expect(incident.status).toBe("resolved");
    expect(incident.resolved_at).toBe("2026-03-11T00:12:00.000Z");
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/incidents/inc_123/resolve",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("calls bundle route and accepts pending payload", async () => {
    const request = vi
      .fn<HttpClient["request"]>()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          bundle_version: 1,
          summary: {
            title: "TypeError"
          }
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          status: "pending"
        }
      });

    const api = createRetrievalApi({ request });
    const bundle = await api.getBundle({ bearerToken: "dbundle_mem_x", incidentId: "inc_123" });
    const pending = await api.getBundle({ bearerToken: "dbundle_mem_x", incidentId: "inc_124" });

    expect(bundle).toEqual({
      bundle_version: 1,
      summary: {
        title: "TypeError"
      }
    });
    expect(pending).toEqual({ status: "pending" });
  });

  it("calls reproduction route and accepts reproduction payload", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        possible: true,
        confidence: 0.8,
        reason: "request_context_available",
        artifacts: {
          curl: "curl -X POST 'https://example.invalid/checkout'",
          httpie: "http POST 'https://example.invalid/checkout'",
          json_spec: {
            method: "POST",
            url: "https://example.invalid/checkout"
          }
        },
        feasibility_reference: null
      }
    });

    const api = createRetrievalApi({ request });
    const reproduction = await api.getReproduction({ bearerToken: "dbundle_mem_x", incidentId: "inc_123" });

    expect(reproduction).toEqual({
      possible: true,
      confidence: 0.8,
      reason: "request_context_available",
      artifacts: {
        curl: "curl -X POST 'https://example.invalid/checkout'",
        httpie: "http POST 'https://example.invalid/checkout'",
        json_spec: {
          method: "POST",
          url: "https://example.invalid/checkout"
        }
      },
      feasibility_reference: null
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/incidents/inc_123/reproduction",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("calls services route with project query and limit", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        services: [
          {
            service_id: "svc_123",
            project_id: "proj_123",
            name: "checkout-api",
            runtime: "node",
            framework: "fastify",
            environment: "production"
          }
        ]
      }
    });

    const api = createRetrievalApi({ request });
    const services = await api.listServices({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_123",
      limit: 10
    });

    expect(services).toEqual([
      {
        service_id: "svc_123",
        project_id: "proj_123",
        name: "checkout-api",
        runtime: "node",
        framework: "fastify",
        environment: "production"
      }
    ]);
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/services?project_id=proj_123&limit=10",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("calls logs route with incident filter, level, cursor, and limit", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
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
      }
    });

    const api = createRetrievalApi({ request });
    const logs = await api.listLogs({
      bearerToken: "dbundle_mem_x",
      incidentId: "inc_123",
      level: "error",
      cursor: "2026-03-11T00:09:00.000Z|evt_122",
      limit: 10
    });

    expect(logs).toEqual({
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
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/logs?incident_id=inc_123&level=error&cursor=2026-03-11T00%3A09%3A00.000Z%7Cevt_122&limit=10",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("throws structured api errors for services retrieval", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 404,
      body: {
        error: "project_not_found"
      }
    });

    const api = createRetrievalApi({ request });

    await expect(api.listServices({ bearerToken: "dbundle_mem_x", projectId: "proj_missing" })).rejects.toEqual(
      new RetrievalApiError(404, "project_not_found")
    );
  });

  it("throws invalid_response_shape for malformed success payloads", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        services: [{ unexpected: true }]
      }
    });

    const api = createRetrievalApi({ request });

    await expect(api.listServices({ bearerToken: "dbundle_mem_x", projectId: "proj_123" })).rejects.toEqual(
      new RetrievalApiError(200, "invalid_response_shape")
    );
  });

  it("throws structured api errors for incident retrieval", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 404,
      body: {
        error: "incident_not_found"
      }
    });

    const api = createRetrievalApi({ request });

    await expect(api.getIncident({ bearerToken: "dbundle_mem_x", incidentId: "inc_missing" })).rejects.toEqual(
      new RetrievalApiError(404, "incident_not_found")
    );
  });
});
