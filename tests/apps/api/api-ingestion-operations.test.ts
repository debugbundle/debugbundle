import { afterEach, describe, expect, it, vi } from "vitest";

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
  createProjectManagementDependency,
  createTokenManagementDependency,
  createWebhookDeliveryDependency
} from "../../helpers/api-ingestion-dependencies.ts";

describe("webhook delivery history", () => {
  it("should return webhook delivery history for member token", async (): Promise<void> => {
    const listDeliveriesForWebhookInOrganization = vi.fn().mockResolvedValue({
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
    const resolveMemberByTokenHash = vi
      .fn()
      .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" });

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
    const incrementOrgUsageCounter = vi.fn().mockResolvedValue(undefined);
    const incrementProjectUsageCounter = vi.fn().mockResolvedValue(undefined);

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: { resolveProjectByTokenHash },
      accountAnalytics: createAccountAnalyticsDependency({ recordMetricDeltas }),
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
    expect(recordMetricDeltas).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        source: "ingestion_batch",
        deltas: expect.objectContaining({
          raw_events_accepted: 1,
          billable_events_counted: 1,
          incident_signal_events_counted: 1
        })
      })
    );
  });

  it("should not reject accepted ingestion when account analytics recording fails after persistence", async (): Promise<void> => {
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
    const recordMetricDeltas = vi.fn().mockRejectedValue(new Error("analytics_unavailable"));

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: { resolveProjectByTokenHash },
      accountAnalytics: createAccountAnalyticsDependency({ recordMetricDeltas }),
      billingManagement: createBillingManagementDependency(),
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
    expect(response.json()).toMatchObject({
      accepted: 1,
      rejected: 0,
      errors: []
    });
    expect(persistAndEnqueue).toHaveBeenCalledOnce();
    expect(recordMetricDeltas).toHaveBeenCalledOnce();
  });

  it("counts accepted probe events in account analytics", async (): Promise<void> => {
    const persistAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "raw-events/proj_123/probe.json.gz" });
    const resolveProjectByTokenHash = vi
      .fn()
      .mockResolvedValue({
        project_id: "proj_123",
        organization_id: "org_123",
        organization_plan: "solo"
      });
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");

    const app = createApiServer({
      ingestionPersistence: { persistAndEnqueue },
      ingestionMetadata: { resolveProjectByTokenHash },
      accountAnalytics: createAccountAnalyticsDependency({ recordMetricDeltas }),
      billingManagement: createBillingManagementDependency(),
      capturePolicyManagement: {
        getCapturePolicyForProject: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          preset: "investigative",
          capture_logs: null,
          capture_request_events: null,
          capture_breadcrumbs: null,
          capture_probe_events: "standalone_when_activated",
          immediate_client_error_statuses: null,
          immediate_client_error_path_rules: null
        }),
        upsertCapturePolicyForProject: vi.fn()
      },
      memberAuth: createMemberAuthDependency(),
      tokenManagement: createTokenManagementDependency(),
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
        label: "checkout.tax",
        data: { rate: 0.2 },
        activation_id: "00000000-0000-4000-8000-000000000123",
        probe_label_pattern: "checkout.*"
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [event] }
    });

    expect(response.statusCode).toBe(202);
    expect(recordMetricDeltas).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        source: "ingestion_batch",
        deltas: expect.objectContaining({
          raw_events_accepted: 1,
          operational_signal_events_counted: 1,
          probe_events_accepted: 1
        })
      })
    );
  });

  it("should not reject ingestion when the project dashboard usage counter fails after persistence", async (): Promise<void> => {
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
    const incrementOrgUsageCounter = vi.fn().mockResolvedValue(undefined);
    const incrementProjectUsageCounter = vi
      .fn()
      .mockRejectedValue(new Error("project_counter_failed"));

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
