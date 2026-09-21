import { vi } from "vitest";
import { gzipSync } from "node:zlib";

import { createApiServer } from "../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "./vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type AuthRateLimiterDependency = MockedMethods<
  NonNullable<ApiServerDependencies["authRateLimiter"]>
>;
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

function createServer(
  overrides: { authRateLimiter?: Partial<AuthRateLimiterDependency> } = {}
): ReturnType<typeof createApiServer> {
  const projectId = "550e8400-e29b-41d4-a716-446655440000";
  const incidentRecord = {
    incident_id: "550e8400-e29b-41d4-a716-446655440123",
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
  const getObject = vi
    .fn()
    .mockResolvedValue(gzipSync(Buffer.from(JSON.stringify({ bundle_version: 1 }), "utf8")));

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
            claimRequest:
              overrides.authRateLimiter.claimRequest ??
              vi.fn().mockResolvedValue({
                allowed: true,
                limit: 100,
                remaining: 99,
                retry_after_ms: 0
              })
          }
        }),
    memberAuth: {
      resolveMemberByTokenHash: vi
        .fn()
        .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
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

export {
  gzipSync,
  createApiServer,
  mockedObject,
  type MockedMethods,
  type ApiServerDependencies,
  type AuthRateLimiterDependency,
  type TokenManagementDependency,
  createTokenManagementDependency,
  createServer
};
