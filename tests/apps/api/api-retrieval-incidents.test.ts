import { describe, expect, it, vi } from "vitest";
import {
  createApiServer,
  createTokenManagementDependency,
  createServer
} from "../../helpers/api-retrieval.js";

describe("api-retrieval incidents", () => {
  it("should reject incidents listing when member authorization header is missing", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents?limit=10"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "invalid_member_token"
    });
  });

  it("should list incidents for authenticated member token", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents?limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      incidents: [
        {
          incident_id: "550e8400-e29b-41d4-a716-446655440123",
          project_id: "550e8400-e29b-41d4-a716-446655440000",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
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
  });

  it("should rate limit retrieval reads per member", async (): Promise<void> => {
    const claimRequest = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 100,
      remaining: 0,
      retry_after_ms: 12_000
    });
    const app = createServer({ authRateLimiter: { claimRequest } });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents?limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: "rate_limited" });
    expect(response.headers["retry-after"]).toBe("12");
    expect(claimRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "retrieval-read",
        subject: "member:mem_123",
        limit: 300
      })
    );
  });

  it("should apply incident filters and return cursor-based pagination metadata", async (): Promise<void> => {
    const listIncidentsForOrganization = vi.fn().mockResolvedValue([
      {
        incident_id: "550e8400-e29b-41d4-a716-446655440123",
        project_id: "550e8400-e29b-41d4-a716-446655440000",
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
        regressed_at: null,
        matched_fields: ["fingerprint"]
      }
    ]);

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
        listIncidentsForOrganization,
        getIncidentForOrganization: vi.fn().mockResolvedValue(null),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
        listServicesForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn()
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents?project_id=550e8400-e29b-41d4-a716-446655440000&environment=production&service=checkout-api&status=open&severity=high&first_seen_after=2026-03-11T00:00:00.000Z&attention_after=2026-03-11T01:00:00.000Z&limit=1&cursor=2026-03-11T00:09:00.000Z|550e8400-e29b-41d4-a716-446655440122",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(listIncidentsForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      user_id: "mem_123",
      project_id: "550e8400-e29b-41d4-a716-446655440000",
      environment: "production",
      service: "checkout-api",
      status: "open",
      severity: "high",
      first_seen_after: "2026-03-11T00:00:00.000Z",
      attention_after: "2026-03-11T01:00:00.000Z",
      limit: 1,
      cursor: {
        last_seen_at: "2026-03-11T00:09:00.000Z",
        incident_id: "550e8400-e29b-41d4-a716-446655440122"
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      incidents: [
        {
          incident_id: "550e8400-e29b-41d4-a716-446655440123",
          project_id: "550e8400-e29b-41d4-a716-446655440000",
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
          regressed_at: null,
          matched_fields: ["fingerprint"]
        }
      ],
      next_cursor: "2026-03-11T00:10:00.000Z|550e8400-e29b-41d4-a716-446655440123"
    });
  });

  it("accepts active as an incident status list filter", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents?status=active&limit=20",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
  });

  it("should reject invalid incidents cursor values", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents?cursor=not-a-valid-cursor",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "invalid_query"
    });
  });

  it("should reject invalid incident first_seen_after filters", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents?first_seen_after=not-a-timestamp",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "invalid_query"
    });
  });

  it("should reject invalid incident attention_after filters", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents?attention_after=not-a-timestamp",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "invalid_query"
    });
  });

  it("should reject malformed incident route ids before incident storage lookup", async (): Promise<void> => {
    const getIncidentForOrganization = vi.fn();
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
        getIncidentForOrganization,
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
        listServicesForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn()
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/8cc5e97f-800b-4cfc-8a7ebbb58484/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "invalid_incident_id"
    });
    expect(getIncidentForOrganization).not.toHaveBeenCalled();
  });

  it("should return incident details for authenticated member token", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440123",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      incident: {
        incident_id: "550e8400-e29b-41d4-a716-446655440123",
        project_id: "550e8400-e29b-41d4-a716-446655440000",
        project_name: "Main App",
        service_id: "svc_123",
        service_name: "checkout-api",
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
    });
  });

  it("should return incident_reason in incident retrieval payloads when available", async (): Promise<void> => {
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
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "550e8400-e29b-41d4-a716-4466554405aa",
          project_id: "550e8400-e29b-41d4-a716-446655440000",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_5xx",
          fingerprint_version: "v1",
          title: "request GET /checkout",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: null,
          regressed_at: null,
          matched_fields: ["route_template", "http_method", "http_status"],
          incident_reason: {
            kind: "request_failure",
            description: "request_event matched the immediate request failure incident rule",
            event_type: "request_event",
            event_class: "incident_signal",
            matched_policy:
              "Immediate request failure statuses bypass capture_request_events suppression"
          }
        }),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
        listServicesForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn()
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-4466554405aa",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      incident: expect.objectContaining({
        incident_id: "550e8400-e29b-41d4-a716-4466554405aa",
        incident_reason: {
          kind: "request_failure",
          description: "request_event matched the immediate request failure incident rule",
          event_type: "request_event",
          event_class: "incident_signal",
          matched_policy:
            "Immediate request failure statuses bypass capture_request_events suppression"
        }
      })
    });
  });

  it("should reject incidents list with invalid query", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents?limit=999",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_query" });
  });

  it("should return incident not found for out-of-scope incident", async (): Promise<void> => {
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
        getIncidentForOrganization: vi.fn().mockResolvedValue(null),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockResolvedValue(Buffer.from("{}", "utf8"))
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/550e8400-e29b-41d4-a716-446655440404",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "incident_not_found" });
  });
});
