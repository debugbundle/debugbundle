import { describe, expect, it, vi } from "vitest";
import {
  createApiServer,
  createTokenManagementDependency,
  createServer
} from "../../helpers/api-retrieval.js";

describe("api-retrieval logs", () => {
  it("should return incident logs for authenticated member token", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/logs?incident_id=550e8400-e29b-41d4-a716-446655440123&limit=5",
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
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
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
      url: "/v1/logs?incident_id=550e8400-e29b-41d4-a716-446655440123&level=error&cursor=2026-03-11T00:10:00.000Z|550e8400-e29b-41d4-a716-446655440001&limit=1",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(listIncidentLogsForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      user_id: "mem_123",
      incident_id: "550e8400-e29b-41d4-a716-446655440123",
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

  it("should reject logs query when incident id is malformed", async (): Promise<void> => {
    const listIncidentLogsForOrganization = vi.fn();
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
        listIncidentLogsForOrganization
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
      url: "/v1/logs?incident_id=8cc5e97f-800b-4cfc-8a7ebbb58484",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_query" });
    expect(listIncidentLogsForOrganization).not.toHaveBeenCalled();
  });

  it("should reject logs retrieval for invalid member token", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/logs?incident_id=550e8400-e29b-41d4-a716-446655440123"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "invalid_member_token" });
  });

  it("should reject logs query when cursor format is invalid", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/logs?incident_id=550e8400-e29b-41d4-a716-446655440123&cursor=invalid-cursor&limit=5",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_query" });
  });
});
