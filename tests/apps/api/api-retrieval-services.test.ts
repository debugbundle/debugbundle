import { describe, expect, it, vi } from "vitest";
import {
  createApiServer,
  createTokenManagementDependency,
  createServer
} from "../../helpers/api-retrieval.js";

describe("api-retrieval services", () => {
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
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
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
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
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
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
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
});
