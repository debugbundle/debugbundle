import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { createEventEnvelope, type EventEnvelope } from "../../../packages/shared-types/src/index.js";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type CapturePolicyManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["capturePolicyManagement"]>>;

function createBaseDependencies(overrides: {
  persistAndEnqueue?: ApiServerDependencies["ingestionPersistence"]["persistAndEnqueue"];
  resolveProjectByTokenHash?: ApiServerDependencies["ingestionMetadata"]["resolveProjectByTokenHash"];
  capturePolicyManagement?: CapturePolicyManagementDependency;
} = {}): Parameters<typeof createApiServer>[0] {
  return {
    ingestionPersistence: {
      persistAndEnqueue: overrides.persistAndEnqueue ?? vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" })
    },
    ingestionMetadata: {
      resolveProjectByTokenHash:
        overrides.resolveProjectByTokenHash ??
        vi.fn().mockResolvedValue({ project_id: "proj_123", organization_plan: "free" })
    },
    memberAuth: {
      resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
    } as ApiServerDependencies["memberAuth"],
    tokenManagement: mockedObject<ApiServerDependencies["tokenManagement"]>({
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    }),
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: { getObject: vi.fn() },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
    },
    ...(overrides.capturePolicyManagement !== undefined
      ? { capturePolicyManagement: overrides.capturePolicyManagement }
      : {})
  };
}

function makeLogEvent(level: string): EventEnvelope {
  return createEventEnvelope({
    event_type: "log_event",
    project_token: "dbundle_proj_test",
    service: { name: "api", environment: "production", runtime: "node", framework: "fastify" },
    payload: { level, message: "test log", attributes: {} }
  });
}

function makeRequestEvent(responseStatus: number): EventEnvelope {
  return createEventEnvelope({
    event_type: "request_event",
    project_token: "dbundle_proj_test",
    service: { name: "api", environment: "production", runtime: "node", framework: "fastify" },
    payload: {
      method: "GET",
      path: "/users",
      query: {},
      headers: {},
      response_status: responseStatus,
      duration_ms: 42,
      route_template: "/users"
    }
  });
}

function makeBreadcrumb(): EventEnvelope {
  return createEventEnvelope({
    event_type: "frontend_breadcrumb",
    project_token: "dbundle_proj_test",
    service: { name: "web", environment: "production", runtime: "browser", framework: "react" },
    payload: { breadcrumb_type: "click", data: {} }
  });
}

function makeBackendException(): EventEnvelope {
  return createEventEnvelope({
    event_type: "backend_exception",
    project_token: "dbundle_proj_test",
    service: { name: "api", environment: "production", runtime: "node", framework: "fastify" },
    payload: {
      name: "TypeError",
      message: "boom",
      stack: "TypeError: boom",
      handled: false,
      request: { method: "GET", path: "/x", query: {}, headers: {} },
      response: { status_code: 500 },
      runtime: { version: "22.0.0" }
    }
  });
}

describe("ingestion capture policy enforcement", () => {
  it("should reject request_event on a minimal policy project (capture_request_events=off)", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const capturePolicyManagement = {
      getCapturePolicyForProject: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        preset: "minimal",
        capture_logs: null,
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        updated_at: "2026-03-01T00:00:00.000Z"
      }),
      upsertCapturePolicyForProject: vi.fn()
    };

    const app = createApiServer(createBaseDependencies({ persistAndEnqueue, capturePolicyManagement }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [makeRequestEvent(200)] }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 0,
      rejected: 1,
      errors: [{ index: 0, reason: "capture_policy_rejected" }]
    });
    expect(persistAndEnqueue).not.toHaveBeenCalled();
  });

  it("should accept backend_exception even on minimal policy", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const capturePolicyManagement = {
      getCapturePolicyForProject: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        preset: "minimal",
        capture_logs: null,
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        updated_at: "2026-03-01T00:00:00.000Z"
      }),
      upsertCapturePolicyForProject: vi.fn()
    };

    const app = createApiServer(createBaseDependencies({ persistAndEnqueue, capturePolicyManagement }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [makeBackendException()] }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 1,
      rejected: 0,
      errors: []
    });
    expect(persistAndEnqueue).toHaveBeenCalledTimes(1);
  });

  it("should reject info log on minimal policy (capture_logs=error) but accept error log", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const capturePolicyManagement = {
      getCapturePolicyForProject: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        preset: "minimal",
        capture_logs: null,
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        updated_at: "2026-03-01T00:00:00.000Z"
      }),
      upsertCapturePolicyForProject: vi.fn()
    };

    const app = createApiServer(createBaseDependencies({ persistAndEnqueue, capturePolicyManagement }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [makeLogEvent("info"), makeLogEvent("error")] }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 1,
      rejected: 1,
      errors: [{ index: 0, reason: "capture_policy_rejected" }]
    });
    expect(persistAndEnqueue).toHaveBeenCalledTimes(1);
  });

  it("should accept failed request_event on balanced policy (capture_request_events=failures_only)", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const capturePolicyManagement = {
      getCapturePolicyForProject: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        preset: "balanced",
        capture_logs: null,
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        updated_at: "2026-03-01T00:00:00.000Z"
      }),
      upsertCapturePolicyForProject: vi.fn()
    };

    const app = createApiServer(createBaseDependencies({
      persistAndEnqueue,
      capturePolicyManagement,
      resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123", organization_plan: "solo" })
    }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [makeRequestEvent(500), makeRequestEvent(200)] }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 1,
      rejected: 1,
      errors: [{ index: 1, reason: "capture_policy_rejected" }]
    });
    expect(persistAndEnqueue).toHaveBeenCalledTimes(1);
  });

  it("should reject standalone breadcrumb on minimal policy (capture_breadcrumbs=local_only)", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const capturePolicyManagement = {
      getCapturePolicyForProject: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        preset: "minimal",
        capture_logs: null,
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        updated_at: "2026-03-01T00:00:00.000Z"
      }),
      upsertCapturePolicyForProject: vi.fn()
    };

    const app = createApiServer(createBaseDependencies({ persistAndEnqueue, capturePolicyManagement }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [makeBreadcrumb()] }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 0,
      rejected: 1,
      errors: [{ index: 0, reason: "capture_policy_rejected" }]
    });
    expect(persistAndEnqueue).not.toHaveBeenCalled();
  });

  it("should fall back to minimal defaults when capturePolicyManagement is not configured", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });

    const app = createApiServer(createBaseDependencies({ persistAndEnqueue }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [makeRequestEvent(200), makeBackendException()] }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 1,
      rejected: 1,
      errors: [{ index: 0, reason: "capture_policy_rejected" }]
    });
    expect(persistAndEnqueue).toHaveBeenCalledTimes(1);
  });

  it("should use balanced defaults for solo projects when no policy row exists", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const capturePolicyManagement = {
      getCapturePolicyForProject: vi.fn().mockResolvedValue(null),
      upsertCapturePolicyForProject: vi.fn()
    };

    const app = createApiServer(createBaseDependencies({
      persistAndEnqueue,
      capturePolicyManagement,
      resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123", organization_plan: "solo" })
    }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [makeRequestEvent(500), makeRequestEvent(200)] }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 1,
      rejected: 1,
      errors: [{ index: 1, reason: "capture_policy_rejected" }]
    });
    expect(persistAndEnqueue).toHaveBeenCalledTimes(1);
  });

  it("should accept all event types on investigative policy", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const capturePolicyManagement = {
      getCapturePolicyForProject: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        preset: "investigative",
        capture_logs: null,
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        updated_at: "2026-03-01T00:00:00.000Z"
      }),
      upsertCapturePolicyForProject: vi.fn()
    };

    const app = createApiServer(createBaseDependencies({
      persistAndEnqueue,
      capturePolicyManagement,
      resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123", organization_plan: "team" })
    }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [
          makeBackendException(),
          makeLogEvent("info"),
          makeRequestEvent(200),
          makeBreadcrumb()
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 4,
      rejected: 0,
      errors: []
    });
    expect(persistAndEnqueue).toHaveBeenCalledTimes(4);
  });
});
