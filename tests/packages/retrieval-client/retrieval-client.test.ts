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
            matched_fields: ["fingerprint"],
            api_added_field: "future-safe"
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
          project_color_tag: null,
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
      attentionAfter: "2026-03-11T00:00:00.000Z",
      limit: 10,
      cursor: "2026-03-11T00:09:00.000Z|inc_122"
      })
    ).resolves.toEqual({ incidents: [], next_cursor: "2026-03-11T00:09:00.000Z|inc_122" });

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/incidents?project_id=proj_123&environment=production&service=checkout-api&status=open&severity=high&attention_after=2026-03-11T00%3A00%3A00.000Z&cursor=2026-03-11T00%3A09%3A00.000Z%7Cinc_122&limit=10",
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
            kind: "request_failure",
            description: "request_event matched the 5xx request incident rule",
            event_type: "request_event",
            event_class: "incident_signal",
            matched_policy: "Immediate request failure statuses bypass capture_request_events suppression"
          }
        }
      }
    });

    const api = createRetrievalApi({ request });
    const incident = await api.getIncident({ bearerToken: "dbundle_mem_x", incidentId: "inc_123" });

    expect(incident.incident_id).toBe("inc_123");
    expect(incident.incident_reason?.kind).toBe("request_failure");
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/incidents/inc_123",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("defaults missing project color tags to null for older incident responses", async () => {
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
          matched_fields: ["fingerprint"]
        }
      }
    });

    const api = createRetrievalApi({ request });

    await expect(api.getIncident({ bearerToken: "dbundle_mem_x", incidentId: "inc_123" })).resolves.toMatchObject({
      project_color_tag: null
    });
  });

  it("calls incident context route", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        incident: {
          incident_id: "inc_123",
          project_id: "proj_123",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: "dep_123",
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "Checkout 5xx",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: null,
          regressed_at: null,
          matched_fields: ["route_template"],
          incident_reason: {
            kind: "request_failure",
            description: "request_event matched the 5xx request incident rule",
            event_type: "request_event",
            event_class: "incident_signal",
            matched_policy: "Immediate request failure statuses bypass capture_request_events suppression"
          }
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
          first_application_frame: {
            file: "src/routes/checkout.ts",
            line: 41,
            function: "handleCheckout"
          }
        },
        bundle: {
          status: "ready",
          body: {
            bundle_version: 1
          }
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
          grouping: "Repeated request-failure incidents with the same normalized route template, request method, response status, service, and environment reuse this incident fingerprint. This incident currently groups POST /checkout with matched fields route_template.",
          bundle_regeneration: "Bundle status is ready. New incidents create a bundle immediately, while regeneration currently prioritizes regression reopen, then deploy metadata, reproduction-confidence changes, and finally new context updates.",
          spike_detection: "This incident is not currently marked as spiking. Spike detection is evaluated after grouping and only marks an existing incident when short-term frequency has sufficient baseline and exceeds the spike threshold.",
          notification_cooldown: "Webhook and GitHub lifecycle notifications use per-rule cooldown windows to suppress repeated bundle.reopened or incident.spike_detected deliveries for the same incident/event fingerprint."
        },
        redaction: {
          redacted: true,
          fields: ["request.headers.authorization"],
          notes: "sensitive headers removed"
        },
        browser_signal: {
          browser_event_kind: "error",
          browser_event_opaque: false,
          browser_event_message: "Window error",
          client_kind: "human",
          bot_family: null,
          api_added_field: "future-safe"
        },
        api_added_field: "future-safe",
        suggested_next_checks: ["Inspect the POST /checkout handler behind this 5xx path."]
      }
    });

    const api = createRetrievalApi({ request });
    const context = await api.getIncidentContext({ bearerToken: "dbundle_mem_x", incidentId: "inc_123" });

    expect(context.primary_signal.response_status).toBe(503);
    expect(context.browser_signal?.browser_event_kind).toBe("error");
    expect(context.grouping.matched_fields).toEqual(["route_template"]);
    expect(context.visibility.bundle_regeneration).toContain("regression reopen");
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/incidents/inc_123/context",
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

  it("calls bulk incident resolve and reopen routes", async () => {
    const resolvedIncident = {
      incident_id: "00000000-0000-0000-0000-000000000101",
      project_id: "proj_123",
      project_name: "Main App",
      project_color_tag: null,
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
    };
    const reopenedIncident = {
      ...resolvedIncident,
      status: "open",
      resolved_at: null
    };
    const request = vi
      .fn<HttpClient["request"]>()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          incidents: [resolvedIncident]
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          incidents: [reopenedIncident]
        }
      });

    const api = createRetrievalApi({ request });
    await expect(
      api.resolveIncidents({
        bearerToken: "dbundle_mem_x",
        incidentIds: ["00000000-0000-0000-0000-000000000101"]
      })
    ).resolves.toEqual([resolvedIncident]);
    await expect(
      api.reopenIncidents({
        bearerToken: "dbundle_mem_x",
        incidentIds: ["00000000-0000-0000-0000-000000000101"]
      })
    ).resolves.toEqual([reopenedIncident]);

    expect(request).toHaveBeenNthCalledWith(1, {
      method: "POST",
      path: "/v1/incidents/resolve",
      bearerToken: "dbundle_mem_x",
      body: {
        incident_ids: ["00000000-0000-0000-0000-000000000101"]
      }
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "POST",
      path: "/v1/incidents/reopen",
      bearerToken: "dbundle_mem_x",
      body: {
        incident_ids: ["00000000-0000-0000-0000-000000000101"]
      }
    });
  });

  it("defaults missing project color tags to null for older improvement responses", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        improvement: {
          improvement_id: "imp_123",
          project_id: "proj_123",
          project_name: "Main App",
          project_slug: "main-app",
          service_id: null,
          service_name: "checkout-api",
          service_runtime: "node",
          service_framework: "fastify",
          environment: "production",
          kind: "warning_hotspot",
          status: "open",
          severity: "medium",
          confidence: 0.75,
          fingerprint: "fp_123",
          title: "Warning hotspot",
          summary: "Repeated warning log pattern.",
          occurrence_count: 5,
          evidence: {},
          related_incident_ids: [],
          first_detected_at: "2026-03-11T00:00:00.000Z",
          last_detected_at: "2026-03-11T00:10:00.000Z",
          resolved_at: null,
          snoozed_until: null,
          bundle_generation_number: 1,
          bundle_created_at: null,
          bundle_updated_at: null,
          bundle_failure_reason: null
        }
      }
    });

    const api = createRetrievalApi({ request });

    await expect(api.getImprovement({ bearerToken: "dbundle_mem_x", improvementId: "imp_123" })).resolves.toMatchObject({
      project_color_tag: null
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

  it("accepts incident-covered improvement bundle failure payloads", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        status: "failed",
        reason: "covered_by_incident_bundle",
        related_incident_ids: ["inc_123"]
      }
    });

    const api = createRetrievalApi({ request });
    const result = await api.getImprovementBundle({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_123",
      improvementId: "imp_123"
    });

    expect(result).toEqual({
      status: "failed",
      reason: "covered_by_incident_bundle",
      related_incident_ids: ["inc_123"]
    });
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
