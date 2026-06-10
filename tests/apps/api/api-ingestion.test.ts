import { describe, expect, it, vi, afterEach } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { hashToken } from "../../../packages/auth/src/index.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type WebhookDeliveryDependency = MockedMethods<ApiServerDependencies["webhookDelivery"]>;
type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;
type IncidentRetrievalDependency = MockedMethods<ApiServerDependencies["incidentRetrieval"]>;
type ObjectStoreReaderDependency = MockedMethods<ApiServerDependencies["objectStoreReader"]>;
type TokenManagementDependency = MockedMethods<ApiServerDependencies["tokenManagement"]>;
type ProbeManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["probeManagement"]>>;
type IngestionRateLimiterDependency = MockedMethods<NonNullable<ApiServerDependencies["ingestionRateLimiter"]>>;
type BillingManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["billingManagement"]>>;
type ProjectManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["projectManagement"]>>;

function createWebhookDeliveryDependency(): WebhookDeliveryDependency {
  return mockedObject<ApiServerDependencies["webhookDelivery"]>({
    listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
  });
}

function createMemberAuthDependency(): MemberAuthDependency {
  return mockedObject<ApiServerDependencies["memberAuth"]>({
    resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
  });
}

function createIncidentRetrievalDependency(): IncidentRetrievalDependency {
  return mockedObject<ApiServerDependencies["incidentRetrieval"]>({
    listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
    getIncidentForOrganization: vi.fn().mockResolvedValue(null),
    listServicesForOrganization: vi.fn().mockResolvedValue([]),
    listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
  });
}

function createObjectStoreReaderDependency(): ObjectStoreReaderDependency {
  return mockedObject<ApiServerDependencies["objectStoreReader"]>({
    getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
  });
}

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

function createProjectManagementDependency(): ProjectManagementDependency {
  return mockedObject<NonNullable<ApiServerDependencies["projectManagement"]>>({
    resolveProjectAccessForUser: vi.fn().mockResolvedValue({
      project_id: "00000000-0000-4000-8000-000000000001",
      organization_id: "org_123",
      owner_user_id: "usr_owner",
      owner_email: "owner@example.com",
      relationship: "owned",
      effective_role: "owner",
      organization_plan: "team"
    }),
    listProjectsForUser: vi.fn().mockResolvedValue([]),
    createProjectForUser: vi.fn().mockResolvedValue(null),
    updateProjectForUser: vi.fn().mockResolvedValue(null),
    deleteProjectForUser: vi.fn().mockResolvedValue(null)
  });
}

function createProbeManagementDependency(overrides: {
  listActiveProbesForProject?: ProbeManagementDependency["listActiveProbesForProject"];
} = {}): ProbeManagementDependency {
  return mockedObject<NonNullable<ApiServerDependencies["probeManagement"]>>({
    listActiveProbesForProject: overrides.listActiveProbesForProject ?? vi.fn().mockResolvedValue([]),
    listActiveProbesForProjectInOrganization: vi.fn().mockResolvedValue({ organization_plan: "solo", activations: [] }),
    createProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue(null),
    deactivateProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue(null)
  });
}

function createIngestionRateLimiterDependency(overrides: {
  claimEvents?: IngestionRateLimiterDependency["claimEvents"];
} = {}): IngestionRateLimiterDependency {
  return mockedObject<NonNullable<ApiServerDependencies["ingestionRateLimiter"]>>({
    claimEvents:
      overrides.claimEvents ??
      vi.fn().mockResolvedValue({
        allowed: true,
        limit: 1_000,
        remaining: 999,
        retry_after_ms: 0
      })
  });
}

function createBillingManagementDependency(overrides: {
  getBillingSummaryForOrganization?: BillingManagementDependency["getBillingSummaryForOrganization"];
  incrementOrgUsageCounter?: BillingManagementDependency["incrementOrgUsageCounter"];
  incrementProjectUsageCounter?: BillingManagementDependency["incrementProjectUsageCounter"];
} = {}): BillingManagementDependency {
  return mockedObject<NonNullable<ApiServerDependencies["billingManagement"]>>({
    getBillingSummaryForOrganization:
      overrides.getBillingSummaryForOrganization ??
      vi.fn().mockResolvedValue({
        usage_window: {
          starts_at: "2026-03-01T00:00:00.000Z",
          ends_at: "2026-04-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 0, limit: 25 },
          monthly_raw_ingested_events: {
            used: 0,
            limit: 750
          },
          retained_bundle_cap: { used: 0, limit: 5 },
          monthly_remote_activations: { used: 0, limit: 0 },
          monthly_alert_deliveries: { used: 0, limit: 25 },
          monthly_webhook_deliveries: { used: 0, limit: 100 }
        }
      }),
    incrementOrgUsageCounter: overrides.incrementOrgUsageCounter ?? vi.fn().mockResolvedValue(undefined),
    incrementProjectUsageCounter: overrides.incrementProjectUsageCounter ?? vi.fn().mockResolvedValue(undefined),
    createCheckoutLink: vi.fn().mockResolvedValue(null),
    createPortalLink: vi.fn().mockResolvedValue(null)
  });
}

describe("api ingestion route", () => {
  it("should reject oversized ingestion payloads with 413", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue: vi.fn() },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          organization_id: "org_123",
          organization_plan: "free"
        })
      },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_test",
        "content-type": "application/json"
      },
      payload: JSON.stringify({
        events: [
          {
            event_id: "evt_oversized",
            occurred_at: "2026-03-15T12:00:00.000Z",
            event_type: "backend_exception",
            project_token: "dbundle_proj_test",
            service: {
              name: "checkout-api",
              environment: "production",
              runtime: "node",
              framework: "fastify"
            },
            payload: {
              name: "TypeError",
              message: "boom",
              stack: "x".repeat(300_000),
              handled: false,
              request: {
                method: "GET",
                path: "/users/123",
                query: {},
                headers: {},
                body: null
              },
              response: {
                status_code: 500
              },
              runtime: {
                version: "22.0.0"
              }
            }
          }
        ]
      })
    });

    expect(response.statusCode).toBe(413);
  });

  it("should reject captured incident-signal events when the monthly ingestion allowance is exhausted", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue({ project_id: "proj_123", organization_id: "org_123", organization_plan: "free" });
    const queueProjectOperationalEmailDelivery = vi.fn().mockResolvedValue({ delivery_id: "op_123", created: true });
    const getBillingSummaryForOrganization = vi.fn().mockResolvedValue({
      usage_window: {
        starts_at: "2026-03-01T00:00:00.000Z",
        ends_at: "2026-04-01T00:00:00.000Z"
      },
      allowances: {
        monthly_bundle_requests: { used: 0, limit: 25 },
        monthly_raw_ingested_events: {
          used: 750,
          limit: 750
        },
        retained_bundle_cap: { used: 0, limit: 5 },
        monthly_remote_activations: { used: 0, limit: 0 },
        monthly_alert_deliveries: { used: 0, limit: 25 },
        monthly_webhook_deliveries: { used: 0, limit: 100 }
      }
    });

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: {
        resolveProjectByTokenHash
      },
      billingManagement: createBillingManagementDependency({ getBillingSummaryForOrganization }),
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency(),
      operationalEmailDelivery: { queueProjectOperationalEmailDelivery }
    });

    const event = createEventEnvelope({
      event_type: "backend_exception",
      project_token: "dbundle_proj_test",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "boom",
        stack: "TypeError: boom",
        handled: false,
        request: {
          method: "GET",
          path: "/users/123",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_test"
      },
      payload: {
        events: [event]
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({
      accepted: 0,
      rejected: 1,
      errors: [
        {
          index: 0,
          reason: "monthly_quota_exceeded"
        }
      ],
      retry_after_ms: expect.any(Number)
    });
    expect(getBillingSummaryForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      now: expect.any(String)
    });
    expect(persistAndEnqueue).not.toHaveBeenCalled();
    expect(queueProjectOperationalEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "proj_123",
        kind: "allowance_limit_reached"
      })
    );
  });

  it("queues an 80 percent raw-ingestion allowance warning after accepting counted events", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const queueProjectOperationalEmailDelivery = vi.fn().mockResolvedValue({ delivery_id: "op_123", created: true });

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          organization_id: "org_123",
          organization_plan: "solo"
        })
      },
      billingManagement: createBillingManagementDependency({
        getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
          usage_window: {
            starts_at: "2026-03-01T00:00:00.000Z",
            ends_at: "2026-04-01T00:00:00.000Z"
          },
          allowances: {
            monthly_bundle_requests: { used: 0, limit: 750 },
            monthly_raw_ingested_events: {
              used: 8399,
              limit: 10500
            },
            retained_bundle_cap: { used: 0, limit: 450 },
            monthly_remote_activations: { used: 0, limit: 75 },
            monthly_alert_deliveries: { used: 0, limit: 225 },
            monthly_webhook_deliveries: { used: 0, limit: 750 }
          }
        })
      }),
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency(),
      operationalEmailDelivery: { queueProjectOperationalEmailDelivery }
    });

    const event = createEventEnvelope({
      event_type: "backend_exception",
      project_token: "dbundle_proj_test",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "boom",
        stack: "TypeError: boom",
        handled: false,
        request: {
          method: "GET",
          path: "/users/123",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_test"
      },
      payload: {
        events: [event]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(queueProjectOperationalEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "proj_123",
        kind: "allowance_warning_80"
      })
    );
  });

  it("should reject valid events with 429 when the ingestion rate limit is exceeded", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue({ project_id: "proj_123", organization_id: "org_123", organization_plan: "free" });
    const claimEvents = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 1_000,
      remaining: 0,
      retry_after_ms: 12_000
    });

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: {
        resolveProjectByTokenHash
      },
      ingestionRateLimiter: createIngestionRateLimiterDependency({ claimEvents }),
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const event = createEventEnvelope({
      event_type: "backend_exception",
      project_token: "dbundle_proj_test",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "boom",
        stack: "TypeError: boom",
        handled: false,
        request: {
          method: "GET",
          path: "/users/123",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_test"
      },
      payload: {
        events: [event]
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("12");
    expect(response.json()).toEqual({
      accepted: 0,
      rejected: 1,
      errors: [
        {
          index: 0,
          reason: "rate_limited"
        }
      ],
      retry_after_ms: 12_000
    });
    expect(claimEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        token_hash: hashToken("dbundle_proj_test"),
        project_id: "proj_123",
        event_count: 1,
        limit: 1_000
      })
    );
    expect(persistAndEnqueue).not.toHaveBeenCalled();
  });

  it("should accept valid events, persist raw payloads, and enqueue processing", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue({ project_id: "proj_123", organization_id: "org_123" });

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: {
        resolveProjectByTokenHash
      },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const event = createEventEnvelope({
      event_type: "backend_exception",
      project_token: "dbundle_proj_test",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "boom",
        stack: "TypeError: boom",
        handled: false,
        request: {
          method: "GET",
          path: "/users/123",
          query: {},
          headers: {
            authorization: "Bearer secret"
          },
          body: {
            password: "secret"
          }
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_test"
      },
      payload: {
        events: [event]
      }
    });

    expect(response.statusCode).toBe(202);

    const body = response.json<{
      accepted: number;
      rejected: number;
      errors: Array<{ index: number; reason: string }>;
    }>();

    expect(body.accepted).toBe(1);
    expect(body.rejected).toBe(0);
    expect(body.errors).toHaveLength(0);
    expect(resolveProjectByTokenHash).toHaveBeenCalledOnce();
    expect(persistAndEnqueue).toHaveBeenCalledOnce();

    const persistedEvent = persistAndEnqueue.mock.calls[0]?.[0] as {
      payload: {
        request: {
          headers: { authorization: string };
          body: { password: string };
        };
      };
    };

    expect(persistedEvent.payload.request.headers.authorization).toBe("[REDACTED]");
    expect(persistedEvent.payload.request.body.password).toBe("[REDACTED]");
  });

  it("should include probe_directives for paid tiers with active remote probes", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue({ project_id: "proj_123", organization_id: "org_123", organization_plan: "solo" });
    const listActiveProbesForProject = vi.fn().mockResolvedValue([
      {
        activation_id: "11111111-1111-4111-8111-111111111111",
        label_pattern: "checkout.*",
        service: "*",
        environment: "*",
        expires_at: "2026-03-12T00:00:00.000Z",
        trigger_expires_at: "2026-03-13T00:00:00.000Z"
      }
    ]);

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: {
        resolveProjectByTokenHash
      },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      probeManagement: createProbeManagementDependency({ listActiveProbesForProject }),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const event = createEventEnvelope({
      event_type: "log_event",
      project_token: "dbundle_proj_test",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        level: "error",
        message: "boom",
        attributes: {}
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_test"
      },
      payload: {
        events: [event]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 1,
      rejected: 0,
      errors: [],
      probe_directives: {
        active_probes: [
          {
            activation_id: "11111111-1111-4111-8111-111111111111",
            label_pattern: "checkout.*",
            service: "*",
            environment: "*",
            expires_at: "2026-03-12T00:00:00.000Z",
            trigger_expires_at: "2026-03-13T00:00:00.000Z"
          }
        ]
      }
    });
    expect(listActiveProbesForProject).toHaveBeenCalledOnce();
  });

  it("should omit probe_directives when no active remote probes exist", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue({ project_id: "proj_123", organization_id: "org_123", organization_plan: "solo" });
    const listActiveProbesForProject = vi.fn().mockResolvedValue([]);

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: {
        resolveProjectByTokenHash
      },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      probeManagement: createProbeManagementDependency({ listActiveProbesForProject }),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const event = createEventEnvelope({
      event_type: "log_event",
      project_token: "dbundle_proj_test",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        level: "error",
        message: "boom",
        attributes: {}
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_test"
      },
      payload: {
        events: [event]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 1,
      rejected: 0,
      errors: []
    });
    expect(listActiveProbesForProject).toHaveBeenCalledOnce();
  });

  it("should omit probe_directives for free tier projects", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue({ project_id: "proj_123", organization_id: "org_123", organization_plan: "free" });
    const listActiveProbesForProject = vi.fn().mockResolvedValue([
      {
        activation_id: "11111111-1111-4111-8111-111111111111",
        label_pattern: "checkout.*",
        service: "*",
        environment: "*",
        expires_at: "2026-03-12T00:00:00.000Z",
        trigger_expires_at: "2026-03-13T00:00:00.000Z"
      }
    ]);

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: {
        resolveProjectByTokenHash
      },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      probeManagement: createProbeManagementDependency({ listActiveProbesForProject }),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const event = createEventEnvelope({
      event_type: "log_event",
      project_token: "dbundle_proj_test",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        level: "error",
        message: "boom",
        attributes: {}
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_test"
      },
      payload: {
        events: [event]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 1,
      rejected: 0,
      errors: []
    });
    expect(listActiveProbesForProject).not.toHaveBeenCalled();
  });

  it("should reject standalone remote probe_event ingestion after downgrade to free", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi
      .fn()
      .mockResolvedValue({ project_id: "proj_123", organization_id: "org_123", organization_plan: "free" });

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: {
        resolveProjectByTokenHash
      },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      probeManagement: createProbeManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const event = createEventEnvelope({
      event_type: "probe_event",
      project_token: "dbundle_proj_test",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        activation_id: "11111111-1111-4111-8111-111111111111",
        label: "checkout.trace",
        probe_label_pattern: "checkout.*",
        data: {
          state: "after-downgrade"
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_test"
      },
      payload: {
        events: [event]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 0,
      rejected: 1,
      errors: [{ index: 0, reason: "remote_probes_disabled" }]
    });
    expect(persistAndEnqueue).not.toHaveBeenCalled();
  });

  it("should reject invalid project token", async (): Promise<void> => {
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue(null);

    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash
      },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer not-valid"
      },
      payload: {
        events: []
      }
    });

    expect(response.statusCode).toBe(401);
    expect(resolveProjectByTokenHash).not.toHaveBeenCalled();
  });

  it("should reject missing project token header", async (): Promise<void> => {
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue({ project_id: "proj_123" });

    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash
      },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      payload: {
        events: []
      }
    });

    expect(response.statusCode).toBe(401);
    expect(resolveProjectByTokenHash).not.toHaveBeenCalled();
  });

  it("should ignore member tokens and browser sessions on the ingestion route", async (): Promise<void> => {
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue({ project_id: "proj_123" });
    const resolveMemberByTokenHash = vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" });
    const resolveSessionByToken = vi.fn().mockResolvedValue({
      session_id: "ses_123",
      user_id: "usr_123",
      email: "owen@example.com",
      email_verified_at: "2026-03-16T00:00:00.000Z",
      organization_id: "org_123",
      role: "owner",
      created_at: "2026-03-16T00:00:00.000Z",
      expires_at: "2026-03-16T12:00:00.000Z",
      revoked_at: null
    });

    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash
      },
      memberAuth: {
        resolveMemberByTokenHash
      },
      webAuth: {
        requestEmailCode: vi.fn(),
        verifyEmailCode: vi.fn(),
        beginGithubAuth: vi.fn(),
        completeGithubAuth: vi.fn(),
        acceptInviteForSession: vi.fn(),
        resolveSessionByToken,
        revokeSessionByToken: vi.fn().mockResolvedValue(false)
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_mem_test",
        cookie: "dbundle_session=session-secret"
      },
      payload: {
        events: []
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      accepted: 0,
      rejected: 0,
      errors: [
        {
          index: -1,
          reason: "invalid_project_token"
        }
      ]
    });
    expect(resolveProjectByTokenHash).not.toHaveBeenCalled();
    expect(resolveMemberByTokenHash).not.toHaveBeenCalled();
    expect(resolveSessionByToken).not.toHaveBeenCalled();
  });

  it("should reject unknown project token from metadata lookup", async (): Promise<void> => {
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue(null);

    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash
      },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_unknown"
      },
      payload: {
        events: []
      }
    });

    expect(response.statusCode).toBe(401);
    expect(resolveProjectByTokenHash).toHaveBeenCalledOnce();
  });

  it("should enforce project token allowed origins when configured", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue({
      project_id: "proj_123",
      organization_id: "org_123",
      organization_plan: "free",
      allowed_origins: ["https://static.example.com"]
    });

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: { resolveProjectByTokenHash },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const event = createEventEnvelope({
      event_type: "log_event",
      project_token: "dbundle_proj_test",
      service: {
        name: "static-site",
        environment: "production",
        runtime: "browser",
        framework: null
      },
      payload: {
        level: "error",
        message: "boom",
        attributes: {}
      }
    });

    const rejected = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_test",
        origin: "https://evil.example.com"
      },
      payload: { events: [event] }
    });
    const missingOrigin = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_test"
      },
      payload: { events: [event] }
    });
    const accepted = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_test",
        origin: "https://static.example.com"
      },
      payload: { events: [event] }
    });

    expect(rejected.statusCode).toBe(403);
    expect(rejected.json()).toEqual({
      accepted: 0,
      rejected: 0,
      errors: [{ index: -1, reason: "origin_not_allowed" }]
    });
    expect(missingOrigin.statusCode).toBe(403);
    expect(missingOrigin.json()).toEqual({
      accepted: 0,
      rejected: 0,
      errors: [{ index: -1, reason: "origin_not_allowed" }]
    });
    expect(accepted.statusCode).toBe(202);
    expect(persistAndEnqueue).toHaveBeenCalledOnce();
  });

  it("should partially reject malformed events with explicit errors", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue({ project_id: "proj_123" });

    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue
      },
      ingestionMetadata: {
        resolveProjectByTokenHash
      },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const validEvent = createEventEnvelope({
      event_type: "log_event",
      project_token: "dbundle_proj_test",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        level: "error",
        message: "boom",
        attributes: {}
      }
    });

    const invalidEvent = {
      event_type: "unknown"
    };

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_test"
      },
      payload: {
        events: [validEvent, invalidEvent]
      }
    });

    expect(response.statusCode).toBe(202);

    const body = response.json<{
      accepted: number;
      rejected: number;
      errors: Array<{ index: number; reason: string }>;
    }>();

    expect(body.accepted).toBe(1);
    expect(body.rejected).toBe(1);
    expect(body.errors[0]?.index).toBe(1);
    expect(typeof body.errors[0]?.reason).toBe("string");
    expect(persistAndEnqueue).toHaveBeenCalledOnce();
  });

  it("should reject malformed request body before event processing", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123" })
      },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_test"
      },
      payload: {
        events: [],
        extra: true
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ errors: Array<{ reason: string }> }>().errors[0]?.reason).toBe("malformed_payload");
  });

  it("should reject malformed bearer authorization header", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const malformedResponse = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer"
      },
      payload: {
        events: []
      }
    });

    expect(malformedResponse.statusCode).toBe(401);

    const missingHeaderResponse = await app.inject({
      method: "POST",
      url: "/v1/events",
      payload: {
        events: []
      }
    });

    expect(missingHeaderResponse.statusCode).toBe(401);
  });

  it("should return webhook delivery history for member token", async (): Promise<void> => {
    const listDeliveriesForWebhookInOrganization = vi.fn().mockResolvedValue({ deliveries: [
      {
        delivery_id: "del_123",
        event_type: "bundle.reopened",
        status: "delivered",
        attempt_count: 1,
        next_attempt_at: null,
        last_response_code: 200,
        last_attempted_at: "2026-03-11T00:00:01.000Z",
        last_error: null
      }
    ] });
    const resolveMemberByTokenHash = vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" });

    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash
      },
      projectManagement: createProjectManagementDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111/deliveries?project_id=00000000-0000-4000-8000-000000000001&limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(resolveMemberByTokenHash).toHaveBeenCalledWith(hashToken("dbundle_mem_test"));
    expect(listDeliveriesForWebhookInOrganization).toHaveBeenCalledWith({
      webhookId: "11111111-1111-4111-8111-111111111111",
      organizationId: "org_123",
      limit: 10
    });
    expect(response.json()).toEqual({
      deliveries: [
        {
          delivery_id: "del_123",
          event_type: "bundle.reopened",
          status: "delivered",
          attempt_count: 1,
          next_attempt_at: null,
          last_response_code: 200,
          last_attempted_at: "2026-03-11T00:00:01.000Z",
          last_error: null
        }
      ]
    });
  });

  it("should reject webhook delivery history for invalid member token", async (): Promise<void> => {
    const resolveMemberByTokenHash = vi.fn().mockResolvedValue(null);
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash
      },
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111/deliveries?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(resolveMemberByTokenHash).toHaveBeenCalledWith(hashToken("dbundle_mem_test"));
  });

  it("should reject invalid deliveries query parameters", async (): Promise<void> => {
    const listDeliveriesForWebhookInOrganization = vi.fn().mockResolvedValue(null);
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111/deliveries?project_id=00000000-0000-4000-8000-000000000001&limit=999",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(listDeliveriesForWebhookInOrganization).not.toHaveBeenCalled();
  });

  it("should return not found when webhook is outside member organization scope", async (): Promise<void> => {
    const app = createApiServer({
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111/deliveries?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("self-host mode ingestion bypass", () => {
  afterEach(() => {
    delete process.env["SELFHOST_MODE"];
  });

  it("should bypass rate limiting and quota checks when SELFHOST_MODE=true", async (): Promise<void> => {
    process.env["SELFHOST_MODE"] = "true";

    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue({ project_id: "proj_123", organization_id: "org_123", organization_plan: "free" });
    const claimEvents = vi.fn();
    const getBillingSummaryForOrganization = vi.fn();

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: { resolveProjectByTokenHash },
      ingestionRateLimiter: createIngestionRateLimiterDependency({ claimEvents }),
      billingManagement: createBillingManagementDependency({ getBillingSummaryForOrganization }),
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const event = createEventEnvelope({
      event_type: "backend_exception",
      project_token: "dbundle_proj_test",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "boom",
        stack: "TypeError: boom",
        handled: false,
        request: { method: "GET", path: "/users/123", query: {}, headers: {}, body: null },
        response: { status_code: 500 },
        runtime: { version: "22.0.0" }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [event] }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().accepted).toBe(1);
    expect(claimEvents).not.toHaveBeenCalled();
    expect(getBillingSummaryForOrganization).not.toHaveBeenCalled();
    expect(persistAndEnqueue).toHaveBeenCalledOnce();
  });

  it("should increment usage counters after successful ingestion of billable events", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue({ project_id: "proj_123", organization_id: "org_123", organization_plan: "free" });
    const incrementOrgUsageCounter = vi.fn().mockResolvedValue(undefined);
    const incrementProjectUsageCounter = vi.fn().mockResolvedValue(undefined);

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: { resolveProjectByTokenHash },
      billingManagement: createBillingManagementDependency({
        incrementOrgUsageCounter,
        incrementProjectUsageCounter
      }),
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const event = createEventEnvelope({
      event_type: "backend_exception",
      project_token: "dbundle_proj_test",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "boom",
        stack: "TypeError: boom",
        handled: false,
        request: { method: "GET", path: "/users/123", query: {}, headers: {}, body: null },
        response: { status_code: 500 },
        runtime: { version: "22.0.0" }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [event] }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().accepted).toBe(1);
    expect(persistAndEnqueue).toHaveBeenCalledOnce();
    expect(incrementOrgUsageCounter).toHaveBeenCalledWith({
      organization_id: "org_123",
      period_starts_at: expect.any(String),
      count: 1
    });
    expect(incrementProjectUsageCounter).toHaveBeenCalledWith({
      project_id: "proj_123",
      period_starts_at: expect.any(String),
      count: 1
    });
  });

  it("should not reject ingestion when the project dashboard usage counter fails after persistence", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue({ project_id: "proj_123", organization_id: "org_123", organization_plan: "free" });
    const incrementOrgUsageCounter = vi.fn().mockResolvedValue(undefined);
    const incrementProjectUsageCounter = vi.fn().mockRejectedValue(new Error("project_counter_failed"));

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: { resolveProjectByTokenHash },
      billingManagement: createBillingManagementDependency({
        incrementOrgUsageCounter,
        incrementProjectUsageCounter
      }),
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    const event = createEventEnvelope({
      event_type: "backend_exception",
      project_token: "dbundle_proj_test",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "boom",
        stack: "TypeError: boom",
        handled: false,
        request: { method: "GET", path: "/users/123", query: {}, headers: {}, body: null },
        response: { status_code: 500 },
        runtime: { version: "22.0.0" }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [event] }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().accepted).toBe(1);
    expect(persistAndEnqueue).toHaveBeenCalledOnce();
    expect(incrementOrgUsageCounter).toHaveBeenCalledOnce();
    expect(incrementProjectUsageCounter).toHaveBeenCalledOnce();
  });

  it("should not increment usage counters for non-billable operational events", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue({ project_id: "proj_123", organization_id: "org_123", organization_plan: "free" });
    const incrementOrgUsageCounter = vi.fn().mockResolvedValue(undefined);
    const incrementProjectUsageCounter = vi.fn().mockResolvedValue(undefined);

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: { resolveProjectByTokenHash },
      billingManagement: createBillingManagementDependency({
        incrementOrgUsageCounter,
        incrementProjectUsageCounter
      }),
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
      incidentRetrieval: createIncidentRetrievalDependency(),
      objectStoreReader: createObjectStoreReaderDependency(),
      webhookDelivery: createWebhookDeliveryDependency()
    });

    // error_suppressed is classified as operational_signal — non-billable on all plans
    const event = createEventEnvelope({
      event_type: "error_suppressed",
      project_token: "dbundle_proj_test",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        fingerprint: "abc123",
        suppressed_count: 5,
        window_seconds: 60,
        first_seen: "2026-03-15T12:00:00.000Z",
        last_seen: "2026-03-15T12:01:00.000Z"
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [event] }
    });

    expect(response.statusCode).toBe(202);
    // Counter should NOT be called since operational signals don't count toward billing
    expect(incrementOrgUsageCounter).not.toHaveBeenCalled();
    expect(incrementProjectUsageCounter).not.toHaveBeenCalled();
  });
});
