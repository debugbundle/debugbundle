import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { createEventEnvelope, type EventEnvelope } from "../../../packages/shared-types/src/index.js";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type CapturePolicyManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["capturePolicyManagement"]>>;
type CaptureRuleManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["captureRuleManagement"]>>;
type AccountAnalyticsDependency = MockedMethods<NonNullable<ApiServerDependencies["accountAnalytics"]>>;

function createBaseDependencies(overrides: {
  persistAndEnqueue?: ApiServerDependencies["ingestionPersistence"]["persistAndEnqueue"];
  resolveProjectByTokenHash?: ApiServerDependencies["ingestionMetadata"]["resolveProjectByTokenHash"];
  capturePolicyManagement?: CapturePolicyManagementDependency;
  captureRuleManagement?: CaptureRuleManagementDependency;
  accountAnalytics?: AccountAnalyticsDependency;
  billingManagement?: ApiServerDependencies["billingManagement"];
} = {}): Parameters<typeof createApiServer>[0] {
  return {
    ingestionPersistence: {
      persistAndEnqueue: overrides.persistAndEnqueue ?? vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" })
    },
    ingestionMetadata: {
      resolveProjectByTokenHash:
        overrides.resolveProjectByTokenHash ??
        vi.fn().mockResolvedValue({ project_id: "proj_123", organization_id: "org_123", organization_plan: "free" })
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
      : {}),
    ...(overrides.captureRuleManagement !== undefined
      ? { captureRuleManagement: overrides.captureRuleManagement }
      : {}),
    ...(overrides.accountAnalytics !== undefined
      ? { accountAnalytics: overrides.accountAnalytics }
      : {}),
    ...(overrides.billingManagement !== undefined
      ? { billingManagement: overrides.billingManagement }
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

function makeRequestEvent(responseStatus: number, path = "/users", method = "GET"): EventEnvelope {
  return createEventEnvelope({
    event_type: "request_event",
    project_token: "dbundle_proj_test",
    service: { name: "api", environment: "production", runtime: "node", framework: "fastify" },
    payload: {
      method,
      path,
      query: {},
      headers: {},
      response_status: responseStatus,
      duration_ms: 42,
      route_template: path
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

function makeFrontendResourceException(sourceUrl: string): EventEnvelope {
  return createEventEnvelope({
    event_type: "frontend_exception",
    project_token: "dbundle_proj_test",
    service: { name: "web", environment: "production", runtime: "browser", framework: "react" },
    payload: {
      name: "ResourceLoadError",
      message: "Failed to load resource",
      stack: "ResourceLoadError: Failed to load resource",
      route: "/checkout",
      browser: {
        name: "Chrome",
        version: "125.0.0.0"
      },
      browser_event: {
        kind: "resource_error",
        message: "Failed to load resource",
        file_name: sourceUrl,
        line_number: null,
        column_number: null,
        target: {
          tag_name: "SCRIPT",
          source_url: sourceUrl
        },
        opaque: true
      }
    }
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
  it("should reject non-critical request_event on a minimal policy project", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");
    const capturePolicyManagement = {
      getCapturePolicyForProject: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        preset: "minimal",
        capture_logs: null,
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: null,
        updated_at: "2026-03-01T00:00:00.000Z"
      }),
      upsertCapturePolicyForProject: vi.fn()
    };

    const app = createApiServer(createBaseDependencies({
      persistAndEnqueue,
      capturePolicyManagement,
      accountAnalytics: { recordMetricDeltas }
    }));

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
    expect(recordMetricDeltas).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "ingestion_batch",
        deltas: expect.objectContaining({
          raw_events_rejected: 1,
          events_rejected_capture_policy: 1
        })
      })
    );
    expect(persistAndEnqueue).not.toHaveBeenCalled();
  });

  it("should accept 5xx request_event on a minimal policy project", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const capturePolicyManagement = {
      getCapturePolicyForProject: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        preset: "minimal",
        capture_logs: null,
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: null,
        updated_at: "2026-03-01T00:00:00.000Z"
      }),
      upsertCapturePolicyForProject: vi.fn()
    };

    const app = createApiServer(createBaseDependencies({ persistAndEnqueue, capturePolicyManagement }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [makeRequestEvent(503)] }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 1,
      rejected: 0,
      errors: []
    });
    expect(persistAndEnqueue).toHaveBeenCalledTimes(1);
  });

  it("should reject 429 request_event on a minimal policy project", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const capturePolicyManagement = {
      getCapturePolicyForProject: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        preset: "minimal",
        capture_logs: null,
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: null,
        updated_at: "2026-03-01T00:00:00.000Z"
      }),
      upsertCapturePolicyForProject: vi.fn()
    };

    const app = createApiServer(createBaseDependencies({ persistAndEnqueue, capturePolicyManagement }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [makeRequestEvent(429)] }
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
        immediate_client_error_statuses: null,
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
        immediate_client_error_statuses: null,
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
        immediate_client_error_statuses: null,
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

  it("should accept configured client error incidents even when generic request capture is off", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const capturePolicyManagement = {
      getCapturePolicyForProject: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        preset: "minimal",
        capture_logs: null,
        capture_request_events: "off",
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: [403],
        updated_at: "2026-03-01T00:00:00.000Z"
      }),
      upsertCapturePolicyForProject: vi.fn()
    };

    const app = createApiServer(createBaseDependencies({ persistAndEnqueue, capturePolicyManagement }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [makeRequestEvent(403)] }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 1,
      rejected: 0,
      errors: []
    });
    expect(persistAndEnqueue).toHaveBeenCalledTimes(1);
    expect(persistAndEnqueue).toHaveBeenCalledWith(
      expect.any(Object),
      "proj_123",
      expect.objectContaining({
        capturePreset: "minimal",
        immediateClientErrorStatuses: [403]
      })
    );
  });

  it("should accept path-scoped client error incidents even when generic request capture is off", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const pathRules = [{ status_code: 404, path_pattern: "/checkout/*", methods: ["GET"] }];
    const capturePolicyManagement = {
      getCapturePolicyForProject: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        preset: "minimal",
        capture_logs: null,
        capture_request_events: "off",
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: null,
        immediate_client_error_path_rules: pathRules,
        updated_at: "2026-03-01T00:00:00.000Z"
      }),
      upsertCapturePolicyForProject: vi.fn()
    };

    const app = createApiServer(createBaseDependencies({ persistAndEnqueue, capturePolicyManagement }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [makeRequestEvent(404, "/checkout/123"), makeRequestEvent(404, "/robots.txt")] }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 1,
      rejected: 1,
      errors: [{ index: 1, reason: "capture_policy_rejected" }]
    });
    expect(persistAndEnqueue).toHaveBeenCalledTimes(1);
    expect(persistAndEnqueue).toHaveBeenCalledWith(
      expect.any(Object),
      "proj_123",
      expect.objectContaining({
        capturePreset: "minimal",
        immediateClientErrorPathRules: pathRules
      })
    );
  });

  it("should accept immediate request_event payloads on balanced policy but reject unpromoted 4xx", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const capturePolicyManagement = {
      getCapturePolicyForProject: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        preset: "balanced",
        capture_logs: null,
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: null,
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
      payload: { events: [makeRequestEvent(429), makeRequestEvent(409)] }
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
        immediate_client_error_statuses: null,
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
      payload: { events: [makeRequestEvent(200), makeRequestEvent(500), makeBackendException()] }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 2,
      rejected: 1,
      errors: [{ index: 0, reason: "capture_policy_rejected" }]
    });
    expect(persistAndEnqueue).toHaveBeenCalledTimes(2);
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
        immediate_client_error_statuses: null,
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

  it("should accept investigative 409 request_event as an immediate request incident status", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const capturePolicyManagement = {
      getCapturePolicyForProject: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        preset: "investigative",
        capture_logs: null,
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: null,
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
      payload: { events: [makeRequestEvent(409)] }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 1,
      rejected: 0,
      errors: []
    });
    expect(persistAndEnqueue).toHaveBeenCalledTimes(1);
  });

  it("should reject capture-rule dropped events before persistence", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");

    const app = createApiServer(createBaseDependencies({
      persistAndEnqueue,
      accountAnalytics: { recordMetricDeltas },
      captureRuleManagement: {
        listCaptureRulesForProject: vi.fn(),
        listActiveCaptureRulesForProject: vi.fn().mockResolvedValue([
          {
            id: "00000000-0000-4000-8000-000000000101",
            project_id: "proj_123",
            name: "Drop analytics resource noise",
            description: null,
            enabled: true,
            action: "drop",
            matcher: {
              event_types: ["frontend_exception"],
              browser_event_kind: "resource_error",
              resource_url: { host: "analytics.example.com" }
            },
            sample_rate: null,
            sample_event_class: null,
            created_by_user_id: null,
            created_from_incident_id: null,
            created_from_event_id: null,
            expires_at: null,
            hit_count: 0,
            last_matched_at: null,
            created_at: "2026-05-26T10:00:00.000Z",
            updated_at: "2026-05-26T10:00:00.000Z"
          }
        ]),
        createCaptureRuleForProject: vi.fn(),
        updateCaptureRuleForProject: vi.fn(),
        deleteCaptureRuleForProject: vi.fn(),
        recordCaptureRuleMatch: vi.fn().mockResolvedValue(undefined)
      }
    }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [makeFrontendResourceException("https://analytics.example.com/tag.js")] }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 0,
      rejected: 1,
      errors: [{ index: 0, reason: "capture_rule_dropped" }]
    });
    expect(recordMetricDeltas).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "ingestion_batch",
        deltas: expect.objectContaining({
          raw_events_rejected: 1,
          events_rejected_capture_rule: 1
        })
      })
    );
    expect(persistAndEnqueue).not.toHaveBeenCalled();
  });

  it("should stamp accepted demotion rules onto normalization jobs", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });

    const app = createApiServer(createBaseDependencies({
      persistAndEnqueue,
      captureRuleManagement: {
        listCaptureRulesForProject: vi.fn(),
        listActiveCaptureRulesForProject: vi.fn().mockResolvedValue([
          {
            id: "00000000-0000-4000-8000-000000000102",
            project_id: "proj_123",
            name: "Demote analytics resource noise",
            description: null,
            enabled: true,
            action: "demote",
            matcher: {
              event_types: ["frontend_exception"],
              browser_event_kind: "resource_error",
              resource_url: { host: "analytics.example.com" }
            },
            sample_rate: null,
            sample_event_class: null,
            created_by_user_id: null,
            created_from_incident_id: null,
            created_from_event_id: null,
            expires_at: null,
            hit_count: 0,
            last_matched_at: null,
            created_at: "2026-05-26T10:00:00.000Z",
            updated_at: "2026-05-26T10:00:00.000Z"
          }
        ]),
        createCaptureRuleForProject: vi.fn(),
        updateCaptureRuleForProject: vi.fn(),
        deleteCaptureRuleForProject: vi.fn(),
        recordCaptureRuleMatch: vi.fn().mockResolvedValue(undefined)
      }
    }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [makeFrontendResourceException("https://analytics.example.com/tag.js")] }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 1,
      rejected: 0,
      errors: []
    });
    expect(persistAndEnqueue).toHaveBeenCalledWith(
      expect.any(Object),
      "proj_123",
      expect.objectContaining({
        captureRule: {
          rule_id: "00000000-0000-4000-8000-000000000102",
          action: "demote",
          outcome: "demote",
          sample_rate: null,
          sample_event_class: null
        }
      })
    );
  });

  it("should not bill dropped, sampled-out, or free-tier demoted context events", async (): Promise<void> => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const getBillingSummaryForOrganization = vi.fn().mockResolvedValue({
      allowances: {
        monthly_raw_ingested_events: {
          used: 0,
          limit: 10
        }
      },
      usage_window: {
        starts_at: "2026-05-01T00:00:00.000Z",
        ends_at: "2026-06-01T00:00:00.000Z"
      }
    });
    const incrementOrgUsageCounter = vi.fn().mockResolvedValue(undefined);

    const app = createApiServer(createBaseDependencies({
      persistAndEnqueue,
      resolveProjectByTokenHash: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        organization_id: "org_123",
        organization_plan: "free"
      }),
      billingManagement: {
        getBillingSummaryForOrganization,
        incrementOrgUsageCounter
      } as unknown as ApiServerDependencies["billingManagement"],
      captureRuleManagement: {
        listCaptureRulesForProject: vi.fn(),
        listActiveCaptureRulesForProject: vi.fn().mockResolvedValue([
          {
            id: "00000000-0000-4000-8000-000000000103",
            project_id: "proj_123",
            name: "Drop analytics resource noise",
            description: null,
            enabled: true,
            action: "drop",
            matcher: {
              event_types: ["frontend_exception"],
              browser_event_kind: "resource_error",
              resource_url: { host: "analytics.example.com" }
            },
            sample_rate: null,
            sample_event_class: null,
            created_by_user_id: null,
            created_from_incident_id: null,
            created_from_event_id: null,
            expires_at: null,
            hit_count: 0,
            last_matched_at: null,
            created_at: "2026-05-26T10:00:00.000Z",
            updated_at: "2026-05-26T10:00:00.000Z"
          },
          {
            id: "00000000-0000-4000-8000-000000000104",
            project_id: "proj_123",
            name: "Sample out known noisy logs",
            description: null,
            enabled: true,
            action: "sample",
            matcher: {
              event_types: ["log_event"],
              message_contains: "test log"
            },
            sample_rate: 0,
            sample_event_class: "preserve",
            created_by_user_id: null,
            created_from_incident_id: null,
            created_from_event_id: null,
            expires_at: null,
            hit_count: 0,
            last_matched_at: null,
            created_at: "2026-05-26T10:00:00.000Z",
            updated_at: "2026-05-26T10:00:00.000Z"
          },
          {
            id: "00000000-0000-4000-8000-000000000105",
            project_id: "proj_123",
            name: "Demote known 500 route",
            description: null,
            enabled: true,
            action: "demote",
            matcher: {
              event_types: ["request_event"],
              request_url: { path_equals: "/users" },
              status_codes: [500]
            },
            sample_rate: null,
            sample_event_class: null,
            created_by_user_id: null,
            created_from_incident_id: null,
            created_from_event_id: null,
            expires_at: null,
            hit_count: 0,
            last_matched_at: null,
            created_at: "2026-05-26T10:00:00.000Z",
            updated_at: "2026-05-26T10:00:00.000Z"
          }
        ]),
        createCaptureRuleForProject: vi.fn(),
        updateCaptureRuleForProject: vi.fn(),
        deleteCaptureRuleForProject: vi.fn(),
        recordCaptureRuleMatch: vi.fn().mockResolvedValue(undefined)
      }
    }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [
          makeFrontendResourceException("https://analytics.example.com/tag.js"),
          makeLogEvent("error"),
          makeRequestEvent(500)
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: 1,
      rejected: 2,
      errors: [
        { index: 0, reason: "capture_rule_dropped" },
        { index: 1, reason: "capture_rule_sampled_out" }
      ]
    });
    expect(persistAndEnqueue).toHaveBeenCalledTimes(1);
    expect(getBillingSummaryForOrganization).not.toHaveBeenCalled();
    expect(incrementOrgUsageCounter).not.toHaveBeenCalled();
  });
});
