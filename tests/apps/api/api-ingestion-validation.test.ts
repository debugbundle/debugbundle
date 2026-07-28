import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import {
  createAccountAnalyticsDependency,
  createIncidentRetrievalDependency,
  createIngestionRejectionDiagnosticsDependency,
  createMemberAuthDependency,
  createObjectStoreReaderDependency,
  createTokenManagementDependency,
  createWebhookDeliveryDependency
} from "../../helpers/api-ingestion-dependencies.ts";

describe("api ingestion validation and compatibility", () => {
  it("should enforce project token allowed origins when configured", async (): Promise<void> => {
    const persistAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
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
    const persistAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
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

  it("accepts installed SDK legacy event context shapes after compatibility normalization", async (): Promise<void> => {
    const persistAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
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

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_test"
      },
      payload: {
        events: [
          {
            schema_version: "2026-03-01",
            event_id: "550e8400-e29b-41d4-a716-446655440000",
            event_type: "request_event",
            occurred_at: "2026-03-10T00:00:00.000Z",
            sdk_name: "@debugbundle/sdk-java",
            sdk_version: "1.1.0",
            service: {
              name: "patients-api",
              environment: "production",
              runtime: "java",
              framework: null
            },
            correlation: {},
            context: {
              tenant: "healthbrain"
            },
            payload: {
              method: "GET",
              path: "/patients",
              query: null,
              headers: null,
              response_status: "503",
              duration_ms: "42",
              attributes: {
                route_template: "/patients/{id}",
                controller: "PatientsController"
              }
            }
          }
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 1,
      rejected: 0,
      errors: []
    });
    expect(persistAndEnqueue).toHaveBeenCalledOnce();
    expect(persistAndEnqueue.mock.calls[0]?.[0]).toMatchObject({
      context: {
        tenant: "healthbrain",
        route_template: "/patients/{id}",
        controller: "PatientsController"
      },
      payload: {
        query: {},
        headers: {},
        response_status: 503,
        duration_ms: 42,
        route_template: "/patients/{id}"
      }
    });
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
    expect(response.json<{ errors: Array<{ reason: string }> }>().errors[0]?.reason).toBe(
      "malformed_payload"
    );
  });

  it("records sanitized diagnostics for invalid events without persisting them", async (): Promise<void> => {
    const persistAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");
    const recordRejectedDiagnostics = vi.fn().mockResolvedValue(undefined);

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          organization_id: "org_123",
          organization_plan: "free"
        })
      },
      accountAnalytics: createAccountAnalyticsDependency({ recordMetricDeltas }),
      ingestionRejectionDiagnostics: createIngestionRejectionDiagnosticsDependency({
        recordRejectedDiagnostics
      }),
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
        events: [
          {
            schema_version: "2026-03-01",
            event_id: "33333333-3333-4333-8333-333333333333",
            event_type: "frontend_exception",
            sdk_name: "@debugbundle/sdk-browser",
            sdk_version: "0.1.0",
            service: {
              name: "tasktime-web",
              environment: "production",
              runtime: "browser"
            },
            occurred_at: "2026-06-16T08:24:04.562Z",
            payload: {
              name: "TypeError",
              message: "boom"
            }
          }
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 0,
      rejected: 1,
      errors: [{ index: 0, reason: expect.any(String) }]
    });
    expect(recordMetricDeltas).toHaveBeenCalledWith(
      expect.objectContaining({
        deltas: expect.objectContaining({
          raw_events_rejected: 1,
          events_rejected_malformed: 1
        })
      })
    );
    expect(recordRejectedDiagnostics).toHaveBeenCalledWith({
      organization_id: "org_123",
      occurred_at: expect.any(String),
      events: [
        expect.objectContaining({
          rejection_reason: "invalid_event",
          project_id: "proj_123",
          sdk_name: "@debugbundle/sdk-browser",
          sdk_version: "0.1.0",
          event_type: "frontend_exception",
          service_name: "tasktime-web",
          service_environment: "production",
          service_runtime: "browser",
          validation_path: "payload.stack"
        })
      ]
    });
    expect(persistAndEnqueue).not.toHaveBeenCalled();
  });

  it("does not record rejection diagnostics for duplicate analytics batches", async (): Promise<void> => {
    const persistAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "raw-events/proj_123/path.json.gz" });
    const recordMetricDeltas = vi.fn().mockResolvedValue("duplicate");
    const recordRejectedDiagnostics = vi.fn().mockResolvedValue(undefined);

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          organization_id: "org_123",
          organization_plan: "free"
        })
      },
      accountAnalytics: createAccountAnalyticsDependency({ recordMetricDeltas }),
      ingestionRejectionDiagnostics: createIngestionRejectionDiagnosticsDependency({
        recordRejectedDiagnostics
      }),
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
        events: [
          {
            schema_version: "2026-03-01",
            event_id: "33333333-3333-4333-8333-333333333333",
            event_type: "frontend_exception",
            sdk_name: "@debugbundle/sdk-browser",
            sdk_version: "0.1.0",
            service: {
              name: "tasktime-web",
              environment: "production",
              runtime: "browser"
            },
            occurred_at: "2026-06-16T08:24:04.562Z",
            payload: {
              name: "TypeError",
              message: "boom"
            }
          }
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(recordMetricDeltas).toHaveBeenCalled();
    expect(recordRejectedDiagnostics).not.toHaveBeenCalled();
    expect(persistAndEnqueue).not.toHaveBeenCalled();
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

});
