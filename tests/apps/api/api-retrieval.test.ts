import { describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type AuthRateLimiterDependency = MockedMethods<NonNullable<ApiServerDependencies["authRateLimiter"]>>;
type TokenManagementDependency = MockedMethods<ApiServerDependencies["tokenManagement"]>;

function createTokenManagementDependency(): TokenManagementDependency {
  return mockedObject<ApiServerDependencies["tokenManagement"]>({
    listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
    createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
    revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
    listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
    createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
    revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
  });
}

function createServer(overrides: { authRateLimiter?: Partial<AuthRateLimiterDependency> } = {}): ReturnType<typeof createApiServer> {
  const projectId = "550e8400-e29b-41d4-a716-446655440000";
  const incidentRecord = {
    incident_id: "inc_123",
    project_id: projectId,
    project_name: "Main App",
    service_id: "svc_123",
    service_name: "checkout-api",
    environment: "production",
    fingerprint: "fp_123",
    fingerprint_version: "v1",
    title: "TypeError",
    severity: "high" as const,
    status: "open" as const,
    first_seen_at: "2026-03-11T00:00:00.000Z",
    last_seen_at: "2026-03-11T00:10:00.000Z",
    occurrence_count: 3,
    spike_detected_at: null,
    resolved_at: null,
    regressed_at: null,
    matched_fields: ["fingerprint"]
  };

  const listIncidentsForOrganization = vi.fn().mockResolvedValue([incidentRecord]);
  const getIncidentForOrganization = vi.fn().mockResolvedValue(incidentRecord);
  const listServicesForOrganization = vi.fn().mockResolvedValue([
    {
      service_id: "svc_123",
      project_id: projectId,
      name: "checkout-api",
      runtime: "node",
      framework: "fastify",
      environment: "production"
    }
  ]);
  const listIncidentLogsForOrganization = vi.fn().mockResolvedValue([
    {
      event_id: "evt_123",
      event_type: "backend_exception",
      occurred_at: "2026-03-11T00:10:00.000Z",
      is_sampled: true,
      level: null
    }
  ]);
  const getObject = vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify({ bundle_version: 1 }), "utf8")));

  return createApiServer({
    ingestionPersistence: {
      persistAndEnqueue: vi.fn()
    },
    ingestionMetadata: {
      resolveProjectByTokenHash: vi.fn()
    },
    ...(overrides.authRateLimiter === undefined
      ? {}
      : {
          authRateLimiter: {
            claimRequest: overrides.authRateLimiter.claimRequest ?? vi.fn().mockResolvedValue({
              allowed: true,
              limit: 100,
              remaining: 99,
              retry_after_ms: 0
            })
          }
        }),
    memberAuth: {
      resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
    },
    tokenManagement: createTokenManagementDependency(),
    incidentRetrieval: {
      listIncidentsForOrganization,
      getIncidentForOrganization,
      listServicesForOrganization,
      listIncidentLogsForOrganization
    },
    objectStoreReader: {
      getObject
    },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
      retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
    }
  });
}

describe("api retrieval routes", () => {
  it("should return deterministic one-call incident context", async (): Promise<void> => {
    const projectId = "550e8400-e29b-41d4-a716-446655440000";
    const incidentRecord = {
      incident_id: "inc_123",
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
        matched_policy: "Immediate request failure statuses bypass capture_request_events suppression"
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
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
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
      url: "/v1/incidents/inc_123/context",
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
      suggested_next_checks: [
        "Inspect the POST /checkout handler behind this request-failure path.",
        "Start with src/routes/checkout.ts:41 from the first application frame.",
        "Compare this incident against the most recent deploy and recent regressions."
      ]
    });
  });

  it("should reject services listing when member authorization header is missing", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/services?project_id=550e8400-e29b-41d4-a716-446655440000&limit=10"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "invalid_member_token"
    });
  });

  it("should list services for an authenticated member token", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue(null),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
        listServicesForOrganization: vi.fn().mockResolvedValue([
          {
            service_id: "svc_123",
            project_id: "550e8400-e29b-41d4-a716-446655440000",
            name: "checkout-api",
            runtime: "node",
            framework: "fastify",
            environment: "production"
          }
        ])
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
      url: "/v1/services?project_id=550e8400-e29b-41d4-a716-446655440000&limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      services: [
        {
          service_id: "svc_123",
          project_id: "550e8400-e29b-41d4-a716-446655440000",
          name: "checkout-api",
          runtime: "node",
          framework: "fastify",
          environment: "production"
        }
      ]
    });
  });

  it("should return project_not_found when the requested project is outside the member organization", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue(null),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
        listServicesForOrganization: vi.fn().mockResolvedValue(null)
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
      url: "/v1/services?project_id=550e8400-e29b-41d4-a716-446655440001&limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "project_not_found"
    });
  });

  it("should reject services listing when the query is invalid", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/services?project_id=not-a-uuid&limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "invalid_query"
    });
  });

  it("should return services_retrieval_unavailable when service lookup is not configured", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue(null),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
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
      url: "/v1/services?project_id=550e8400-e29b-41d4-a716-446655440000&limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "services_retrieval_unavailable"
    });
  });

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
          incident_id: "inc_123",
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
        incident_id: "inc_123",
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
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
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
      url: "/v1/incidents?project_id=550e8400-e29b-41d4-a716-446655440000&environment=production&service=checkout-api&status=open&severity=high&first_seen_after=2026-03-11T00:00:00.000Z&limit=1&cursor=2026-03-11T00:09:00.000Z|inc_122",
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
      limit: 1,
      cursor: {
        last_seen_at: "2026-03-11T00:09:00.000Z",
        incident_id: "inc_122"
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      incidents: [
        {
          incident_id: "inc_123",
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
      next_cursor: "2026-03-11T00:10:00.000Z|inc_123"
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

  it("should return incident details for authenticated member token", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/inc_123",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      incident: {
        incident_id: "inc_123",
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
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "inc_5xx",
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
            matched_policy: "Immediate request failure statuses bypass capture_request_events suppression"
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
      url: "/v1/incidents/inc_5xx",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      incident: expect.objectContaining({
        incident_id: "inc_5xx",
        incident_reason: {
          kind: "request_failure",
          description: "request_event matched the immediate request failure incident rule",
          event_type: "request_event",
          event_class: "incident_signal",
          matched_policy: "Immediate request failure statuses bypass capture_request_events suppression"
        }
      })
    });
  });

  it("should resolve an incident for an authenticated member token", async (): Promise<void> => {
    const resolveIncidentForOrganization = vi.fn().mockResolvedValue({
      incident_id: "inc_123",
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
      status: "resolved",
      first_seen_at: "2026-03-11T00:00:00.000Z",
      last_seen_at: "2026-03-11T00:10:00.000Z",
      occurrence_count: 3,
      spike_detected_at: null,
      resolved_at: "2026-03-11T00:12:00.000Z",
      regressed_at: null,
      matched_fields: ["fingerprint"]
    });

    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "usr_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
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
          resolved_at: null,
          regressed_at: null,
          matched_fields: ["fingerprint"]
        }),
        resolveIncidentForOrganization,
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
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
      method: "POST",
      url: "/v1/incidents/inc_123/resolve",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(resolveIncidentForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      incident_id: "inc_123",
      user_id: "usr_123",
      resolved_by_member_id: "usr_123",
      resolved_at: expect.any(String)
    });
    expect(response.json()).toEqual({
      incident: {
        incident_id: "inc_123",
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
        status: "resolved",
        first_seen_at: "2026-03-11T00:00:00.000Z",
        last_seen_at: "2026-03-11T00:10:00.000Z",
        occurrence_count: 3,
        spike_detected_at: null,
        resolved_at: "2026-03-11T00:12:00.000Z",
        regressed_at: null,
        matched_fields: ["fingerprint"]
      }
    });
  });

  it("should reopen an incident for an authenticated member token", async (): Promise<void> => {
    const reopenIncidentForOrganization = vi.fn().mockResolvedValue({
      incident_id: "inc_123",
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
      resolved_at: null,
      regressed_at: null,
      matched_fields: ["fingerprint"]
    });

    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "usr_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
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
          status: "resolved",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: "2026-03-11T00:12:00.000Z",
          regressed_at: null,
          matched_fields: ["fingerprint"]
        }),
        resolveIncidentForOrganization: vi.fn(),
        reopenIncidentForOrganization,
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
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
      method: "POST",
      url: "/v1/incidents/inc_123/reopen",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(reopenIncidentForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      incident_id: "inc_123",
      user_id: "usr_123"
    });
    expect(response.json()).toEqual({
      incident: {
        incident_id: "inc_123",
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
        resolved_at: null,
        regressed_at: null,
        matched_fields: ["fingerprint"]
      }
    });
  });

  it("should bulk resolve incidents for an authenticated member token", async (): Promise<void> => {
    const sharedIncidentId = "550e8400-e29b-41d4-a716-446655440101";
    const ownedIncidentId = "550e8400-e29b-41d4-a716-446655440102";
    const resolveIncidentsForOrganization = vi
      .fn()
      .mockImplementationOnce(async (input: { organization_id: string; incident_ids: string[] }) => [
        {
          incident_id: input.incident_ids[0]!,
          project_id: "550e8400-e29b-41d4-a716-446655440001",
          project_name: "Shared App",
          service_id: "svc_456",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_shared",
          fingerprint_version: "v1",
          title: "Shared incident",
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
      ])
      .mockImplementationOnce(async (input: { organization_id: string; incident_ids: string[] }) => [
        {
          incident_id: input.incident_ids[0]!,
          project_id: "550e8400-e29b-41d4-a716-446655440002",
          project_name: "Owned App",
          service_id: "svc_789",
          service_name: "payments-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_owned",
          fingerprint_version: "v1",
          title: "Owned incident",
          severity: "medium",
          status: "resolved",
          first_seen_at: "2026-03-11T00:05:00.000Z",
          last_seen_at: "2026-03-11T00:15:00.000Z",
          occurrence_count: 2,
          spike_detected_at: null,
          resolved_at: "2026-03-11T00:12:00.000Z",
          regressed_at: null,
          matched_fields: ["fingerprint"]
        }
      ]);

    const resolveProjectAccessForUser = vi
      .fn()
      .mockResolvedValueOnce({ project_id: "550e8400-e29b-41d4-a716-446655440001", organization_id: "org_shared" })
      .mockResolvedValueOnce(null);

    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "usr_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      projectManagement: {
        listProjectsForOrganization: vi.fn().mockResolvedValue([]),
        createProjectForOrganization: vi.fn().mockResolvedValue(null),
        updateProjectForOrganization: vi.fn().mockResolvedValue(null),
        deleteProjectForOrganization: vi.fn().mockResolvedValue(null),
        resolveProjectAccessForUser
      },
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi
          .fn()
          .mockResolvedValueOnce({
            incident_id: sharedIncidentId,
            project_id: "550e8400-e29b-41d4-a716-446655440001",
            project_name: "Shared App",
            service_id: "svc_456",
            service_name: "checkout-api",
            latest_deployment_id: null,
            environment: "production",
            fingerprint: "fp_shared",
            fingerprint_version: "v1",
            title: "Shared incident",
            severity: "high",
            status: "open",
            first_seen_at: "2026-03-11T00:00:00.000Z",
            last_seen_at: "2026-03-11T00:10:00.000Z",
            occurrence_count: 3,
            spike_detected_at: null,
            resolved_at: null,
            regressed_at: null,
            matched_fields: ["fingerprint"]
          })
          .mockResolvedValueOnce({
            incident_id: ownedIncidentId,
            project_id: "550e8400-e29b-41d4-a716-446655440002",
            project_name: "Owned App",
            service_id: "svc_789",
            service_name: "payments-api",
            latest_deployment_id: null,
            environment: "production",
            fingerprint: "fp_owned",
            fingerprint_version: "v1",
            title: "Owned incident",
            severity: "medium",
            status: "regressed",
            first_seen_at: "2026-03-11T00:05:00.000Z",
            last_seen_at: "2026-03-11T00:15:00.000Z",
            occurrence_count: 2,
            spike_detected_at: null,
            resolved_at: null,
            regressed_at: "2026-03-11T00:11:00.000Z",
            matched_fields: ["fingerprint"]
          }),
        resolveIncidentForOrganization: vi.fn(),
        resolveIncidentsForOrganization,
        reopenIncidentForOrganization: vi.fn(),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
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
      method: "POST",
      url: "/v1/incidents/resolve",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        incident_ids: [sharedIncidentId, ownedIncidentId, sharedIncidentId]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(resolveProjectAccessForUser).toHaveBeenNthCalledWith(1, {
      user_id: "usr_123",
      project_id: "550e8400-e29b-41d4-a716-446655440001"
    });
    expect(resolveProjectAccessForUser).toHaveBeenNthCalledWith(2, {
      user_id: "usr_123",
      project_id: "550e8400-e29b-41d4-a716-446655440002"
    });
    expect(resolveIncidentsForOrganization).toHaveBeenNthCalledWith(1, {
      organization_id: "org_shared",
      incident_ids: [sharedIncidentId],
      user_id: "usr_123",
      resolved_by_member_id: "usr_123",
      resolved_at: expect.any(String)
    });
    expect(resolveIncidentsForOrganization).toHaveBeenNthCalledWith(2, {
      organization_id: "org_123",
      incident_ids: [ownedIncidentId],
      user_id: "usr_123",
      resolved_by_member_id: "usr_123",
      resolved_at: expect.any(String)
    });
    expect(response.json()).toEqual({
      incidents: [
        expect.objectContaining({ incident_id: sharedIncidentId, status: "resolved" }),
        expect.objectContaining({ incident_id: ownedIncidentId, status: "resolved" })
      ]
    });
  });

  it("should bulk reopen incidents for an authenticated member token", async (): Promise<void> => {
    const firstIncidentId = "550e8400-e29b-41d4-a716-446655440201";
    const secondIncidentId = "550e8400-e29b-41d4-a716-446655440202";
    const reopenIncidentsForOrganization = vi.fn().mockResolvedValue([
      {
        incident_id: firstIncidentId,
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
        resolved_at: null,
        regressed_at: null,
        matched_fields: ["fingerprint"]
      },
      {
        incident_id: secondIncidentId,
        project_id: "550e8400-e29b-41d4-a716-446655440000",
        project_name: "Main App",
        service_id: "svc_456",
        service_name: "payments-api",
        latest_deployment_id: null,
        environment: "production",
        fingerprint: "fp_456",
        fingerprint_version: "v1",
        title: "Payment timeout",
        severity: "medium",
        status: "open",
        first_seen_at: "2026-03-11T00:05:00.000Z",
        last_seen_at: "2026-03-11T00:15:00.000Z",
        occurrence_count: 2,
        spike_detected_at: null,
        resolved_at: null,
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
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "usr_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi
          .fn()
          .mockResolvedValueOnce({
            incident_id: firstIncidentId,
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
            status: "resolved",
            first_seen_at: "2026-03-11T00:00:00.000Z",
            last_seen_at: "2026-03-11T00:10:00.000Z",
            occurrence_count: 3,
            spike_detected_at: null,
            resolved_at: "2026-03-11T00:12:00.000Z",
            regressed_at: null,
            matched_fields: ["fingerprint"]
          })
          .mockResolvedValueOnce({
            incident_id: secondIncidentId,
            project_id: "550e8400-e29b-41d4-a716-446655440000",
            project_name: "Main App",
            service_id: "svc_456",
            service_name: "payments-api",
            latest_deployment_id: null,
            environment: "production",
            fingerprint: "fp_456",
            fingerprint_version: "v1",
            title: "Payment timeout",
            severity: "medium",
            status: "resolved",
            first_seen_at: "2026-03-11T00:05:00.000Z",
            last_seen_at: "2026-03-11T00:15:00.000Z",
            occurrence_count: 2,
            spike_detected_at: null,
            resolved_at: "2026-03-11T00:16:00.000Z",
            regressed_at: null,
            matched_fields: ["fingerprint"]
          }),
        resolveIncidentForOrganization: vi.fn(),
        reopenIncidentForOrganization: vi.fn(),
        reopenIncidentsForOrganization,
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
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
      method: "POST",
      url: "/v1/incidents/reopen",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        incident_ids: [firstIncidentId, secondIncidentId]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(reopenIncidentsForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      incident_ids: [firstIncidentId, secondIncidentId],
      user_id: "usr_123"
    });
    expect(response.json()).toEqual({
      incidents: [
        expect.objectContaining({ incident_id: firstIncidentId, status: "open" }),
        expect.objectContaining({ incident_id: secondIncidentId, status: "open" })
      ]
    });
  });

  it("should return bundle payload when available for authenticated member token", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/inc_123/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ bundle_version: 1 });
  });

  it("should return pending bundle status and trigger regeneration when artifact is unavailable", async (): Promise<void> => {
    const requestRegeneration = vi.fn().mockResolvedValue(true);
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
          project_id: "proj_123",
          service_id: null,
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
          matched_fields: []
        }),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
      },
      bundleRegeneration: {
        requestRegeneration: requestRegeneration
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/inc_123/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "pending" });
    expect(requestRegeneration).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "proj_123",
      incident_id: "inc_123"
    });
  });

  it("uses the owning project organization when a collaborator fetches a shared incident bundle", async (): Promise<void> => {
    const requestRegeneration = vi.fn().mockResolvedValue(true);
    const getBundleFailureReasonForOrganization = vi.fn().mockResolvedValue(null);
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: "usr_collaborator",
          organization_id: "org_collaborator"
        })
      },
      tokenManagement: createTokenManagementDependency(),
      projectManagement: {
        resolveProjectAccessForUser: vi.fn().mockResolvedValue({
          project_id: "proj_shared",
          organization_id: "org_owner",
          owner_user_id: "usr_owner",
          owner_email: "owner@example.com",
          relationship: "shared",
          sharing_state: "shared_with_you",
          effective_role: "member",
          organization_plan: "team"
        }),
        listProjectsForOrganization: vi.fn().mockResolvedValue([]),
        createProjectForOrganization: vi.fn(),
        updateProjectForOrganization: vi.fn(),
        deleteProjectForOrganization: vi.fn()
      },
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "inc_shared",
          project_id: "proj_shared",
          project_name: "Shared App",
          service_id: null,
          service_name: null,
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_shared",
          fingerprint_version: "v1",
          title: "Shared incident",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-11T00:00:00.000Z",
          last_seen_at: "2026-03-11T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: null,
          regressed_at: null,
          matched_fields: []
        }),
        getBundleFailureReasonForOrganization,
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
      },
      bundleRegeneration: {
        requestRegeneration
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/inc_shared/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "pending" });
    expect(getBundleFailureReasonForOrganization).toHaveBeenCalledWith({
      organization_id: "org_owner",
      incident_id: "inc_shared"
    });
    expect(requestRegeneration).toHaveBeenCalledWith({
      organization_id: "org_owner",
      project_id: "proj_shared",
      incident_id: "inc_shared"
    });
  });

  it("should return reproduction payload when available", async (): Promise<void> => {
    const reproduction = {
      possible: true,
      confidence: 0.8,
      reason: "request_context_available",
      artifacts: {
        curl: "curl -X POST 'https://example.invalid/checkout'",
        httpie: "http POST 'https://example.invalid/checkout'",
        json_spec: {
          method: "POST",
          url: "https://example.invalid/checkout",
          headers: {
            "content-type": "application/json"
          },
          body: {
            amount: 42
          }
        }
      },
      feasibility_reference: null
    };

    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
          project_id: "proj_123",
          service_id: null,
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
          matched_fields: []
        }),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(reproduction), "utf8")))
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/inc_123/reproduction",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(reproduction);
  });

  it("should return incident logs for authenticated member token", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/logs?incident_id=inc_123&limit=5",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      logs: [
        {
          event_id: "evt_123",
          event_type: "backend_exception",
          occurred_at: "2026-03-11T00:10:00.000Z",
          is_sampled: true,
          level: null
        }
      ],
      next_cursor: null
    });
  });

  it("should return failed bundle status when bundle artifact is unreadable", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
          project_id: "proj_123",
          service_id: null,
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
          matched_fields: []
        }),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockResolvedValue(Buffer.from("not-a-gzip", "utf8"))
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/inc_123/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "failed",
      reason: "bundle_artifact_invalid"
    });
  });

  it("should return failed bundle status when generation is blocked by monthly quota", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
          project_id: "proj_123",
          service_id: null,
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
          matched_fields: []
        }),
        getBundleFailureReasonForOrganization: vi.fn().mockResolvedValue("monthly_quota_exceeded"),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/inc_123/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "failed",
      reason: "monthly_quota_exceeded"
    });
  });

  it("should trigger regeneration and return pending when bundle has build_error failure", async (): Promise<void> => {
    const requestRegeneration = vi.fn().mockResolvedValue(true);
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
          project_id: "proj_123",
          service_id: null,
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
          matched_fields: []
        }),
        getBundleFailureReasonForOrganization: vi.fn().mockResolvedValue("build_error"),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
      },
      bundleRegeneration: {
        requestRegeneration: requestRegeneration
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/inc_123/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "pending" });
    expect(requestRegeneration).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "proj_123",
      incident_id: "inc_123"
    });
  });

  it("should return failed when missing bundle cannot be regenerated", async (): Promise<void> => {
    const requestRegeneration = vi.fn().mockResolvedValue(false);
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
          project_id: "proj_123",
          service_id: null,
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
          matched_fields: []
        }),
        getBundleFailureReasonForOrganization: vi.fn().mockResolvedValue(null),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
      },
      bundleRegeneration: {
        requestRegeneration
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/inc_123/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "failed",
      reason: "bundle_source_unavailable"
    });
    expect(requestRegeneration).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "proj_123",
      incident_id: "inc_123"
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
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
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
      url: "/v1/incidents/inc_missing",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "incident_not_found" });
  });

  it("should reject bundle retrieval for invalid member token", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/inc_123/bundle"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "invalid_member_token" });
  });

  it("should return incident not found for bundle retrieval when incident is out of scope", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
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
      url: "/v1/incidents/inc_missing/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "incident_not_found" });
  });

  it("should return pending reproduction status when artifact is missing after bundle generation", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
          project_id: "proj_123",
          service_id: null,
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
          matched_fields: []
        }),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi
          .fn()
          .mockRejectedValueOnce(new Error("s3_object_not_found"))
          .mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify({ bundle_version: 1 }), "utf8")))
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/inc_123/reproduction",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "pending" });
  });

  it("should return pending reproduction status when reproduction artifact is missing and bundle is pending", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
          project_id: "proj_123",
          service_id: null,
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
          matched_fields: []
        }),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/inc_123/reproduction",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "pending" });
  });

  it("should support logs level and cursor query params", async (): Promise<void> => {
    const listIncidentLogsForOrganization = vi.fn().mockResolvedValue([
      {
        event_id: "evt_124",
        event_type: "log_event",
        occurred_at: "2026-03-11T00:09:00.000Z",
        is_sampled: true,
        level: "error"
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
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue(null),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/logs?incident_id=inc_123&level=error&cursor=2026-03-11T00:10:00.000Z|550e8400-e29b-41d4-a716-446655440001&limit=1",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(listIncidentLogsForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      user_id: "mem_123",
      incident_id: "inc_123",
      level: "error",
      cursor: {
        occurred_at: "2026-03-11T00:10:00.000Z",
        event_id: "550e8400-e29b-41d4-a716-446655440001"
      },
      limit: 1
    });
    expect(response.json()).toEqual({
      logs: [
        {
          event_id: "evt_124",
          event_type: "log_event",
          occurred_at: "2026-03-11T00:09:00.000Z",
          is_sampled: true,
          level: "error"
        }
      ],
      next_cursor: "2026-03-11T00:09:00.000Z|evt_124"
    });
  });

  it("should reject logs query when incident id is missing", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/logs?limit=5",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_query" });
  });

  it("should reject logs retrieval for invalid member token", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/logs?incident_id=inc_123"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "invalid_member_token" });
  });

  it("should return failed bundle status when object store errors unexpectedly", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
          project_id: "proj_123",
          service_id: null,
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
          matched_fields: []
        }),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject: vi.fn().mockRejectedValue(new Error("s3_temporary_unavailable"))
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/inc_123/bundle",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "failed",
      reason: "bundle_artifact_unavailable"
    });
  });

  it("should return reproduction not found for non-notfound reproduction lookup errors", async (): Promise<void> => {
    const getObject = vi.fn().mockRejectedValue(new Error("read_timeout"));
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
          project_id: "proj_123",
          service_id: null,
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
          matched_fields: []
        }),
        listServicesForOrganization: vi.fn().mockResolvedValue([]),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: {
        getObject
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/inc_123/reproduction",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "reproduction_not_found" });
    expect(getObject).toHaveBeenCalledTimes(1);
  });

  it("should reject logs query when cursor format is invalid", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/logs?incident_id=inc_123&cursor=invalid-cursor&limit=5",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_query" });
  });
});
