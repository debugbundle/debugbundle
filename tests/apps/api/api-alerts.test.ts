import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type AuthRateLimiterDependency = MockedMethods<NonNullable<ApiServerDependencies["authRateLimiter"]>>;
type AuditLoggingDependency = MockedMethods<NonNullable<ApiServerDependencies["auditLogging"]>>;
type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;
type AlertManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["alertManagement"]>>;
type BillingManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["billingManagement"]>>;
type SlackManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["slackManagement"]>>;
type ProjectManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["projectManagement"]>>;

const defaultProjectAccess = {
  project_id: "00000000-0000-4000-8000-000000000001",
  organization_id: "org_123",
  owner_user_id: "usr_owner",
  owner_email: "owner@example.com",
  relationship: "owned",
  effective_role: "owner",
  organization_plan: "team"
} as const;

function createServer(overrides: {
  authRateLimiter?: Partial<AuthRateLimiterDependency>;
  auditLogging?: AuditLoggingDependency | undefined;
  memberAuth?: MemberAuthDependency | undefined;
  projectManagement?: ProjectManagementDependency | undefined;
  alertManagement?: AlertManagementDependency | undefined;
  billingManagement?: BillingManagementDependency | undefined;
  slackManagement?: SlackManagementDependency | undefined;
} = {}): ReturnType<typeof createApiServer> {
  const hasAlertManagementOverride = Object.prototype.hasOwnProperty.call(overrides, "alertManagement");
  const hasSlackManagementOverride = Object.prototype.hasOwnProperty.call(overrides, "slackManagement");

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
    projectManagement:
      overrides.projectManagement ??
      mockedObject<NonNullable<ApiServerDependencies["projectManagement"]>>({
        resolveProjectAccessForUser: vi.fn().mockResolvedValue(defaultProjectAccess),
        listProjectsForUser: vi.fn().mockResolvedValue([]),
        createProjectForUser: vi.fn().mockResolvedValue(null),
        updateProjectForUser: vi.fn().mockResolvedValue(null),
        deleteProjectForUser: vi.fn().mockResolvedValue(null)
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
    ...(overrides.billingManagement === undefined ? {} : { billingManagement: overrides.billingManagement }),
    alertManagement:
      hasAlertManagementOverride
        ? overrides.alertManagement
        :
      mockedObject<NonNullable<ApiServerDependencies["alertManagement"]>>({
        listAlertsForOrganization: vi.fn().mockResolvedValue([]),
        createAlertForOrganization: vi.fn().mockResolvedValue(null),
        updateAlertForOrganization: vi.fn().mockResolvedValue(null),
        deleteAlertForOrganization: vi.fn().mockResolvedValue(null)
      }),
    slackManagement:
      hasSlackManagementOverride
        ? overrides.slackManagement
        : mockedObject<NonNullable<ApiServerDependencies["slackManagement"]>>({
            listSlackDestinationsForProjectInOrganization: vi.fn().mockResolvedValue([]),
            getSlackDestinationForOrganization: vi.fn().mockResolvedValue(null),
            upsertSlackDestinationForOrganization: vi.fn().mockResolvedValue({
              slack_destination_id: "sd_123"
            }),
            deleteSlackDestinationForProjectInOrganization: vi.fn().mockResolvedValue(null)
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
          created_by_user_id: "usr_123",
          service_id: null,
          channel: "email",
          condition_type: "new_incident",
          severity_min: null,
          severity_lifecycle_scope: null,
          cooldown_seconds: 0,
          config: { to: "owner@example.com" },
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
          created_by_user_id: "usr_123",
          service_id: null,
          channel: "email",
          condition_type: "new_incident",
          severity_min: null,
          severity_lifecycle_scope: null,
          cooldown_seconds: 0,
          config: { to: "owner@example.com" },
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

  it("should list alerts for collaborators using the shared project's organization", async (): Promise<void> => {
    const projectManagement = mockedObject<NonNullable<ApiServerDependencies["projectManagement"]>>({
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({
        ...defaultProjectAccess,
        organization_id: "org_shared",
        relationship: "shared",
        effective_role: "member"
      }),
      listProjectsForUser: vi.fn().mockResolvedValue([]),
      createProjectForUser: vi.fn().mockResolvedValue(null),
      updateProjectForUser: vi.fn().mockResolvedValue(null),
      deleteProjectForUser: vi.fn().mockResolvedValue(null)
    });
    const alertManagement = {
      listAlertsForOrganization: vi.fn().mockResolvedValue([]),
      createAlertForOrganization: vi.fn().mockResolvedValue(null),
      updateAlertForOrganization: vi.fn().mockResolvedValue(null),
      deleteAlertForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ projectManagement, alertManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/alerts?project_id=00000000-0000-4000-8000-000000000001&limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(alertManagement.listAlertsForOrganization).toHaveBeenCalledWith({
      organization_id: "org_shared",
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
        created_by_user_id: "usr_123",
        service_id: null,
        channel: "email",
        condition_type: "new_incident",
        severity_min: null,
        severity_lifecycle_scope: null,
        cooldown_seconds: 0,
        config: { to: "owner@example.com" },
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
        condition_type: "new_incident",
        config: { to: "owner@example.com" }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      alert: {
        alert_id: "22222222-2222-4222-8222-222222222222",
        project_id: "00000000-0000-4000-8000-000000000001",
        created_by_user_id: "usr_123",
        service_id: null,
        channel: "email",
        condition_type: "new_incident",
        severity_min: null,
        severity_lifecycle_scope: null,
        cooldown_seconds: 0,
        config: { to: "owner@example.com" },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }
    });
  });

  it("defaults severity-threshold alert lifecycle scope to both on create", async (): Promise<void> => {
    const alertManagement = {
      listAlertsForOrganization: vi.fn().mockResolvedValue([]),
      createAlertForOrganization: vi.fn().mockResolvedValue({
        alert_id: "22222222-2222-4222-8222-222222222222",
        project_id: "00000000-0000-4000-8000-000000000001",
        created_by_user_id: "usr_123",
        service_id: null,
        channel: "email",
        condition_type: "severity_threshold",
        severity_min: "high",
        severity_lifecycle_scope: "both",
        cooldown_seconds: 86400,
        config: { to: "owner@example.com" },
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
        condition_type: "severity_threshold",
        severity_min: "high",
        cooldown_seconds: 86400,
        config: { to: "owner@example.com" }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      alert: {
        alert_id: "22222222-2222-4222-8222-222222222222",
        project_id: "00000000-0000-4000-8000-000000000001",
        created_by_user_id: "usr_123",
        service_id: null,
        channel: "email",
        condition_type: "severity_threshold",
        severity_min: "high",
        severity_lifecycle_scope: "both",
        cooldown_seconds: 86400,
        config: { to: "owner@example.com" },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }
    });
    expect(alertManagement.createAlertForOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        condition_type: "severity_threshold",
        severity_min: "high",
        severity_lifecycle_scope: "both"
      })
    );
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
        condition_type: "new_incident",
        config: { to: "owner@example.com" }
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
        condition_type: "new_incident",
        config: { to: "owner@example.com" }
      }
    });
    const missingRecipient = await app.inject({
      method: "POST",
      url: "/v1/alerts",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        project_id: "00000000-0000-4000-8000-000000000001",
        channel: "email",
        condition_type: "new_incident",
        config: {}
      }
    });

    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.json()).toEqual({ error: "invalid_payload" });
    expect(missingRecipient.statusCode).toBe(400);
    expect(missingRecipient.json()).toEqual({ error: "invalid_payload" });
    expect(missingProject.statusCode).toBe(404);
    expect(missingProject.json()).toEqual({ error: "project_not_found" });
  });

  it("accepts connected slack destination ids for team organizations", async (): Promise<void> => {
    const alertManagement = {
      listAlertsForOrganization: vi.fn().mockResolvedValue([]),
      createAlertForOrganization: vi.fn().mockResolvedValue({
        alert_id: "22222222-2222-4222-8222-222222222222",
        project_id: "00000000-0000-4000-8000-000000000001",
        created_by_user_id: "usr_123",
        service_id: null,
        channel: "slack",
        condition_type: "error_spike",
        severity_min: "critical",
        severity_lifecycle_scope: null,
        cooldown_seconds: 0,
        config: { slack_destination_id: "11111111-1111-4111-8111-111111111111" },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }),
      updateAlertForOrganization: vi.fn().mockResolvedValue(null),
      deleteAlertForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      alertManagement,
      billingManagement: mockedObject<NonNullable<ApiServerDependencies["billingManagement"]>>({
        getBillingSummaryForOrganization: vi.fn().mockResolvedValue({ plan: "team" })
      }),
      slackManagement: mockedObject<NonNullable<ApiServerDependencies["slackManagement"]>>({
        listSlackDestinationsForProjectInOrganization: vi.fn().mockResolvedValue([]),
        getSlackDestinationForOrganization: vi.fn().mockResolvedValue({
          slack_destination_id: "11111111-1111-4111-8111-111111111111",
          organization_id: "org_123",
          slack_team_id: "T123",
          slack_team_name: "Acme",
          slack_channel_id: "C123",
          slack_channel_name: "#alerts",
          installed_by_member_id: "usr_123",
          is_active: true,
          created_at: "2026-05-13T10:00:00.000Z",
          updated_at: "2026-05-13T10:00:00.000Z"
        }),
        upsertSlackDestinationForOrganization: vi.fn().mockResolvedValue({ slack_destination_id: "sd_123" }),
        deleteSlackDestinationForProjectInOrganization: vi.fn().mockResolvedValue(null)
      })
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/alerts",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        project_id: "00000000-0000-4000-8000-000000000001",
        channel: "slack",
        condition_type: "error_spike",
        severity_min: "critical",
        config: {
          slack_destination_id: "11111111-1111-4111-8111-111111111111"
        }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(alertManagement.createAlertForOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "slack",
        config: {
          slack_destination_id: "11111111-1111-4111-8111-111111111111"
        }
      })
    );
  });

  it("should update alert fields scoped to member organization", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const alertManagement = {
      listAlertsForOrganization: vi.fn().mockResolvedValue([]),
      createAlertForOrganization: vi.fn().mockResolvedValue(null),
      updateAlertForOrganization: vi.fn().mockResolvedValue({
        alert_id: "22222222-2222-4222-8222-222222222222",
        project_id: "00000000-0000-4000-8000-000000000001",
        created_by_user_id: "usr_123",
        service_id: "33333333-3333-4333-8333-333333333333",
        channel: "webhook",
        condition_type: "severity_threshold",
        severity_min: "high",
        severity_lifecycle_scope: "incident_regressed",
        cooldown_seconds: 0,
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
      url: "/v1/alerts/22222222-2222-4222-8222-222222222222?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        channel: "webhook",
        condition_type: "severity_threshold",
        service_id: "33333333-3333-4333-8333-333333333333",
        severity_min: "high",
        severity_lifecycle_scope: "incident_regressed",
        config: { target_url: "https://hooks.example.test/alerts" },
        is_enabled: false
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      alert: {
        alert_id: "22222222-2222-4222-8222-222222222222",
        project_id: "00000000-0000-4000-8000-000000000001",
        created_by_user_id: "usr_123",
        service_id: "33333333-3333-4333-8333-333333333333",
        channel: "webhook",
        condition_type: "severity_threshold",
        severity_min: "high",
        severity_lifecycle_scope: "incident_regressed",
        cooldown_seconds: 0,
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
        metadata: expect.objectContaining({
          update_keys: [
            "service_id",
            "condition_type",
            "severity_min",
            "severity_lifecycle_scope",
            "is_enabled",
            "channel",
            "config"
          ],
          channel: "webhook",
          condition_type: "severity_threshold",
          is_enabled: false
        })
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
      url: "/v1/alerts/22222222-2222-4222-8222-222222222222?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {}
    });
    const notFound = await app.inject({
      method: "PATCH",
      url: "/v1/alerts/22222222-2222-4222-8222-222222222222?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        is_enabled: false
      }
    });
    const configWithoutChannel = await app.inject({
      method: "PATCH",
      url: "/v1/alerts/22222222-2222-4222-8222-222222222222?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        config: { to: "owner@example.com" }
      }
    });

    expect(invalidPayload.statusCode).toBe(400);
    expect(invalidPayload.json()).toEqual({ error: "invalid_payload" });
    expect(configWithoutChannel.statusCode).toBe(400);
    expect(configWithoutChannel.json()).toEqual({ error: "invalid_payload" });
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
        created_by_user_id: "usr_123",
        service_id: null,
        channel: "email",
        condition_type: "new_incident",
        severity_min: null,
        severity_lifecycle_scope: null,
        cooldown_seconds: 0,
        config: { to: "owner@example.com" },
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
      url: "/v1/alerts/22222222-2222-4222-8222-222222222222?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        service_id: null,
        severity_min: null,
        channel: "email",
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
      project_id: "00000000-0000-4000-8000-000000000001",
      actor_user_id: "usr_123",
      actor_role: "owner",
      service_id: null,
      channel: "email",
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
      url: "/v1/alerts/11111111-1111-4111-8111-111111111111?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        is_enabled: false
      }
    });
    const deleted = await app.inject({
      method: "DELETE",
      url: "/v1/alerts/11111111-1111-4111-8111-111111111111?project_id=00000000-0000-4000-8000-000000000001",
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
      url: "/v1/alerts/22222222-2222-4222-8222-222222222222?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(alertManagement.deleteAlertForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "00000000-0000-4000-8000-000000000001",
      alert_id: "22222222-2222-4222-8222-222222222222",
      actor_user_id: "usr_123",
      actor_role: "owner"
    });
  });

  it("should audit create and delete failures when targets are missing", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const alertManagement = {
      listAlertsForOrganization: vi.fn().mockResolvedValue([]),
      createAlertForOrganization: vi.fn().mockResolvedValue(null),
      updateAlertForOrganization: vi.fn().mockResolvedValue(null),
      deleteAlertForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ alertManagement, auditLogging: { createAuditLog } });

    const created = await app.inject({
      method: "POST",
      url: "/v1/alerts",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        project_id: "00000000-0000-4000-8000-000000000001",
        channel: "email",
        condition_type: "new_incident",
        config: { to: "owner@example.com" }
      }
    });
    const deleted = await app.inject({
      method: "DELETE",
      url: "/v1/alerts/22222222-2222-4222-8222-222222222222?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(created.statusCode).toBe(404);
    expect(deleted.statusCode).toBe(404);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "alert.create",
        status: "failure",
        metadata: expect.objectContaining({ reason: "project_not_found" })
      })
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "alert.delete",
        status: "failure",
        metadata: { reason: "alert_not_found" }
      })
    );
  });
});
