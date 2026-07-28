import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { hashToken } from "../../../packages/auth/src/index.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import {
  createAccountAnalyticsDependency,
  createBillingManagementDependency,
  createIncidentRetrievalDependency,
  createIngestionRateLimiterDependency,
  createMemberAuthDependency,
  createObjectStoreReaderDependency,
  createProbeManagementDependency,
  createTokenManagementDependency,
  createWebhookDeliveryDependency
} from "../../helpers/api-ingestion-dependencies.ts";

describe("api ingestion route", () => {
  it("should reject oversized ingestion payloads with 413", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn();
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue({
      project_id: "proj_123",
      organization_id: "org_123",
      organization_plan: "free"
    });
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
    expect(response.json()).toEqual({
      accepted: 0,
      rejected: 0,
      errors: [
        {
          index: -1,
          reason: "payload_too_large"
        }
      ]
    });
    expect(resolveProjectByTokenHash).not.toHaveBeenCalled();
    expect(persistAndEnqueue).not.toHaveBeenCalled();
  });

  it("should reject captured incident-signal events when the monthly ingestion allowance is exhausted", async (): Promise<void> => {
    const persistAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi
      .fn()
      .mockResolvedValue({
        project_id: "proj_123",
        organization_id: "org_123",
        organization_plan: "free"
      });
    const queueProjectOperationalEmailDelivery = vi
      .fn()
      .mockResolvedValue({ delivery_id: "op_123", created: true });
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");
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
      accountAnalytics: createAccountAnalyticsDependency({ recordMetricDeltas }),
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
    expect(recordMetricDeltas).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        source: "ingestion_batch",
        deltas: expect.objectContaining({
          raw_events_rejected: 1,
          events_rejected_quota: 1
        })
      })
    );
    expect(persistAndEnqueue).not.toHaveBeenCalled();
    expect(queueProjectOperationalEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "proj_123",
        kind: "allowance_limit_reached"
      })
    );
  });

  it("queues an 80 percent raw-ingestion allowance warning after accepting counted events", async (): Promise<void> => {
    const persistAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const queueProjectOperationalEmailDelivery = vi
      .fn()
      .mockResolvedValue({ delivery_id: "op_123", created: true });

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
    const persistAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi
      .fn()
      .mockResolvedValue({
        project_id: "proj_123",
        organization_id: "org_123",
        organization_plan: "free"
      });
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");
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
      accountAnalytics: createAccountAnalyticsDependency({ recordMetricDeltas }),
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
    expect(recordMetricDeltas).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        source: "ingestion_batch",
        deltas: expect.objectContaining({
          raw_events_rejected: 1,
          events_rejected_rate_limited: 1
        })
      })
    );
    expect(persistAndEnqueue).not.toHaveBeenCalled();
  });

  it("should accept valid events, persist raw payloads, and enqueue processing", async (): Promise<void> => {
    const persistAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi
      .fn()
      .mockResolvedValue({ project_id: "proj_123", organization_id: "org_123" });

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
    const persistAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi
      .fn()
      .mockResolvedValue({
        project_id: "proj_123",
        organization_id: "org_123",
        organization_plan: "solo"
      });
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
    const persistAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi
      .fn()
      .mockResolvedValue({
        project_id: "proj_123",
        organization_id: "org_123",
        organization_plan: "solo"
      });
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
    const persistAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi
      .fn()
      .mockResolvedValue({
        project_id: "proj_123",
        organization_id: "org_123",
        organization_plan: "free"
      });
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
    const persistAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const resolveProjectByTokenHash = vi
      .fn()
      .mockResolvedValue({
        project_id: "proj_123",
        organization_id: "org_123",
        organization_plan: "free"
      });

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
    const resolveMemberByTokenHash = vi
      .fn()
      .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" });
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

});
