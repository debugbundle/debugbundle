import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type AuthRateLimiterDependency = MockedMethods<NonNullable<ApiServerDependencies["authRateLimiter"]>>;
type AuditLoggingDependency = MockedMethods<NonNullable<ApiServerDependencies["auditLogging"]>>;
type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;
type AlertManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["alertManagement"]>>;

function createServer(overrides: {
  authRateLimiter?: Partial<AuthRateLimiterDependency>;
  auditLogging?: AuditLoggingDependency | undefined;
  memberAuth?: MemberAuthDependency | undefined;
  alertManagement?: AlertManagementDependency | undefined;
} = {}): ReturnType<typeof createApiServer> {
  const hasAlertManagementOverride = Object.prototype.hasOwnProperty.call(overrides, "alertManagement");

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
    memberAuth:
      overrides.memberAuth ??
      mockedObject<ApiServerDependencies["memberAuth"]>({
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "usr_123", organization_id: "org_123" })
      }),
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
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
      listServicesForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: {
      getObject: vi.fn()
    },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
    },
    ...(overrides.auditLogging === undefined ? {} : { auditLogging: overrides.auditLogging }),
    alertManagement:
      hasAlertManagementOverride
        ? overrides.alertManagement
        :
      mockedObject<NonNullable<ApiServerDependencies["alertManagement"]>>({
        listAlertsForOrganization: vi.fn().mockResolvedValue([]),
        createAlertForOrganization: vi.fn().mockResolvedValue(null),
        updateAlertForOrganization: vi.fn().mockResolvedValue(null),
        deleteAlertForOrganization: vi.fn().mockResolvedValue(null)
      })
  });
}

describe("api alert routes", () => {
  it("should reject unauthenticated alert requests and missing alert management dependencies", async (): Promise<void> => {
    const unauthenticatedApp = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
      }
    });
    const missingDepsApp = createServer({
      alertManagement: undefined
    });

    const unauthenticated = await unauthenticatedApp.inject({
      method: "GET",
      url: "/v1/alerts?project_id=00000000-0000-4000-8000-000000000001"
    });
    const missingDeps = await missingDepsApp.inject({
      method: "GET",
      url: "/v1/alerts?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json()).toEqual({ error: "invalid_member_token" });
    expect(missingDeps.statusCode).toBe(404);
    expect(missingDeps.json()).toEqual({ error: "project_not_found" });
  });

  it("should validate alert list query", async (): Promise<void> => {
    const app = createServer();

    const missingProject = await app.inject({
      method: "GET",
      url: "/v1/alerts",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const badProject = await app.inject({
      method: "GET",
      url: "/v1/alerts?project_id=not-a-uuid",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(missingProject.statusCode).toBe(400);
    expect(missingProject.json()).toEqual({ error: "invalid_query" });
    expect(badProject.statusCode).toBe(400);
    expect(badProject.json()).toEqual({ error: "invalid_query" });
  });

  it("should list alerts scoped to member organization", async (): Promise<void> => {
    const alertManagement = {
      listAlertsForOrganization: vi.fn().mockResolvedValue([
        {
          alert_id: "22222222-2222-4222-8222-222222222222",
          project_id: "00000000-0000-4000-8000-000000000001",
          service_id: null,
          channel: "email",
          condition_type: "new_incident",
          severity_min: null,
          config: {},
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z"
        }
      ]),
      createAlertForOrganization: vi.fn().mockResolvedValue(null),
      updateAlertForOrganization: vi.fn().mockResolvedValue(null),
      deleteAlertForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ alertManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/alerts?project_id=00000000-0000-4000-8000-000000000001&limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      alerts: [
        {
          alert_id: "22222222-2222-4222-8222-222222222222",
          project_id: "00000000-0000-4000-8000-000000000001",
          service_id: null,
          channel: "email",
          condition_type: "new_incident",
          severity_min: null,
          config: {},
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z"
        }
      ]
    });
    expect(alertManagement.listAlertsForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "00000000-0000-4000-8000-000000000001",
      limit: 10
    });
  });

  it("should rate limit alert reads per member", async (): Promise<void> => {
    const claimRequest = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 100,
      remaining: 0,
      retry_after_ms: 12_000
    });
    const app = createServer({ authRateLimiter: { claimRequest } });

    const response = await app.inject({
      method: "GET",
      url: "/v1/alerts?project_id=00000000-0000-4000-8000-000000000001&limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: "rate_limited" });
    expect(response.headers["retry-after"]).toBe("12");
    expect(claimRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "management-read",
        subject: "member:usr_123",
        limit: 200
      })
    );
  });

  it("should create alert scoped to member organization", async (): Promise<void> => {
    const alertManagement = {
      listAlertsForOrganization: vi.fn().mockResolvedValue([]),
      createAlertForOrganization: vi.fn().mockResolvedValue({
        alert_id: "22222222-2222-4222-8222-222222222222",
        project_id: "00000000-0000-4000-8000-000000000001",
        service_id: null,
        channel: "email",
        condition_type: "new_incident",
        severity_min: null,
        config: {},
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }),
      updateAlertForOrganization: vi.fn().mockResolvedValue(null),
      deleteAlertForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ alertManagement });

    const response = await app.inject({
      method: "POST",
      url: "/v1/alerts",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        project_id: "00000000-0000-4000-8000-000000000001",
        channel: "email",
        condition_type: "new_incident"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      alert: {
        alert_id: "22222222-2222-4222-8222-222222222222",
        project_id: "00000000-0000-4000-8000-000000000001",
        service_id: null,
        channel: "email",
        condition_type: "new_incident",
        severity_min: null,
        config: {},
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }
    });
  });

  it("should validate alert creation payload and return project_not_found", async (): Promise<void> => {
    const alertManagement = {
      listAlertsForOrganization: vi.fn().mockResolvedValue([]),
      createAlertForOrganization: vi.fn().mockResolvedValue(null),
      updateAlertForOrganization: vi.fn().mockResolvedValue(null),
      deleteAlertForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ alertManagement });

    const invalidBody = await app.inject({
      method: "POST",
      url: "/v1/alerts",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        project_id: "00000000-0000-4000-8000-000000000001",
        channel: "sms",
        condition_type: "new_incident"
      }
    });
    const missingProject = await app.inject({
      method: "POST",
      url: "/v1/alerts",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        project_id: "00000000-0000-4000-8000-000000000001",
        channel: "email",
        condition_type: "new_incident"
      }
    });

    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.json()).toEqual({ error: "invalid_payload" });
    expect(missingProject.statusCode).toBe(404);
    expect(missingProject.json()).toEqual({ error: "project_not_found" });
  });

  it("should update alert fields scoped to member organization", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const alertManagement = {
      listAlertsForOrganization: vi.fn().mockResolvedValue([]),
      createAlertForOrganization: vi.fn().mockResolvedValue(null),
      updateAlertForOrganization: vi.fn().mockResolvedValue({
        alert_id: "22222222-2222-4222-8222-222222222222",
        project_id: "00000000-0000-4000-8000-000000000001",
        service_id: "33333333-3333-4333-8333-333333333333",
        channel: "webhook",
        condition_type: "severity_threshold",
        severity_min: "high",
        config: { target_url: "https://hooks.example.test/alerts" },
        is_enabled: false,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:05:00.000Z"
      }),
      deleteAlertForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ alertManagement, auditLogging: { createAuditLog } });

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/alerts/22222222-2222-4222-8222-222222222222",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        channel: "webhook",
        condition_type: "severity_threshold",
        service_id: "33333333-3333-4333-8333-333333333333",
        severity_min: "high",
        config: { target_url: "https://hooks.example.test/alerts" },
        is_enabled: false
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      alert: {
        alert_id: "22222222-2222-4222-8222-222222222222",
        project_id: "00000000-0000-4000-8000-000000000001",
        service_id: "33333333-3333-4333-8333-333333333333",
        channel: "webhook",
        condition_type: "severity_threshold",
        severity_min: "high",
        config: { target_url: "https://hooks.example.test/alerts" },
        is_enabled: false,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:05:00.000Z"
      }
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        actor_user_id: "usr_123",
        actor_type: "member_token",
        action: "alert.update",
        target_type: "alert",
        target_id: "22222222-2222-4222-8222-222222222222",
        status: "success",
        occurred_at: expect.any(String),
        metadata: {
          update_keys: ["service_id", "channel", "condition_type", "severity_min", "config", "is_enabled"],
          channel: "webhook",
          condition_type: "severity_threshold",
          is_enabled: false
        }
      })
    );
  });

  it("should validate alert update payload and not found cases", async (): Promise<void> => {
    const alertManagement = {
      listAlertsForOrganization: vi.fn().mockResolvedValue([]),
      createAlertForOrganization: vi.fn().mockResolvedValue(null),
      updateAlertForOrganization: vi.fn().mockResolvedValue(null),
      deleteAlertForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ alertManagement });

    const invalidPayload = await app.inject({
      method: "PATCH",
      url: "/v1/alerts/22222222-2222-4222-8222-222222222222",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {}
    });
    const notFound = await app.inject({
      method: "PATCH",
      url: "/v1/alerts/22222222-2222-4222-8222-222222222222",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        is_enabled: false
      }
    });

    expect(invalidPayload.statusCode).toBe(400);
    expect(invalidPayload.json()).toEqual({ error: "invalid_payload" });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toEqual({ error: "alert_not_found" });
  });

  it("should validate alert update/delete params and forward nullable update clears", async (): Promise<void> => {
    const alertManagement = {
      listAlertsForOrganization: vi.fn().mockResolvedValue([]),
      createAlertForOrganization: vi.fn().mockResolvedValue(null),
      updateAlertForOrganization: vi.fn().mockResolvedValue({
        alert_id: "22222222-2222-4222-8222-222222222222",
        project_id: "00000000-0000-4000-8000-000000000001",
        service_id: null,
        channel: "email",
        condition_type: "new_incident",
        severity_min: null,
        config: null,
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:05:00.000Z"
      }),
      deleteAlertForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ alertManagement });

    const invalidUpdateParams = await app.inject({
      method: "PATCH",
      url: "/v1/alerts/not-a-uuid",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        is_enabled: false
      }
    });
    const clearedUpdate = await app.inject({
      method: "PATCH",
      url: "/v1/alerts/22222222-2222-4222-8222-222222222222",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        service_id: null,
        severity_min: null,
        config: null,
        is_enabled: true
      }
    });
    const invalidDeleteParams = await app.inject({
      method: "DELETE",
      url: "/v1/alerts/not-a-uuid",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(invalidUpdateParams.statusCode).toBe(400);
    expect(invalidUpdateParams.json()).toEqual({ error: "invalid_alert_id" });
    expect(clearedUpdate.statusCode).toBe(200);
    expect(alertManagement.updateAlertForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      alert_id: "22222222-2222-4222-8222-222222222222",
      service_id: null,
      severity_min: null,
      config: null,
      is_enabled: true
    });
    expect(invalidDeleteParams.statusCode).toBe(400);
    expect(invalidDeleteParams.json()).toEqual({ error: "invalid_alert_id" });
  });

  it("should return alert_not_found when patch/delete routes are mounted without alert management", async (): Promise<void> => {
    const app = createServer({ alertManagement: undefined });

    const updated = await app.inject({
      method: "PATCH",
      url: "/v1/alerts/11111111-1111-4111-8111-111111111111",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        is_enabled: false
      }
    });
    const deleted = await app.inject({
      method: "DELETE",
      url: "/v1/alerts/11111111-1111-4111-8111-111111111111",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(updated.statusCode).toBe(404);
    expect(updated.json()).toEqual({ error: "alert_not_found" });
    expect(deleted.statusCode).toBe(404);
    expect(deleted.json()).toEqual({ error: "alert_not_found" });
  });

  it("should delete alert scoped to member organization", async (): Promise<void> => {
    const alertManagement = {
      listAlertsForOrganization: vi.fn().mockResolvedValue([]),
      createAlertForOrganization: vi.fn().mockResolvedValue(null),
      updateAlertForOrganization: vi.fn().mockResolvedValue(null),
      deleteAlertForOrganization: vi.fn().mockResolvedValue({
        alert_id: "22222222-2222-4222-8222-222222222222"
      })
    };
    const app = createServer({ alertManagement });

    const response = await app.inject({
      method: "DELETE",
      url: "/v1/alerts/22222222-2222-4222-8222-222222222222",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(alertManagement.deleteAlertForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      alert_id: "22222222-2222-4222-8222-222222222222"
    });
  });
});