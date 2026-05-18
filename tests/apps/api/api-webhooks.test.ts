import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type AuthRateLimiterDependency = MockedMethods<NonNullable<ApiServerDependencies["authRateLimiter"]>>;
type AuditLoggingDependency = MockedMethods<NonNullable<ApiServerDependencies["auditLogging"]>>;
type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;
type WebhookManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["webhookManagement"]>>;
type WebhookTestingDependency = MockedMethods<NonNullable<ApiServerDependencies["webhookTesting"]>>;
type ProjectManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["projectManagement"]>>;
type BillingManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["billingManagement"]>>;

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
  webhookManagement?: WebhookManagementDependency | undefined;
  webhookTesting?: WebhookTestingDependency | undefined;
  billingManagement?: BillingManagementDependency | undefined;
  operationalEmailDelivery?: ApiServerDependencies["operationalEmailDelivery"];
} = {}): ReturnType<typeof createApiServer> {
  const hasWebhookManagementOverride = Object.prototype.hasOwnProperty.call(overrides, "webhookManagement");

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
              limit: 30,
              remaining: 29,
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
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: {
      getObject: vi.fn()
    },
    ...(overrides.billingManagement === undefined ? {} : { billingManagement: overrides.billingManagement }),
    ...(overrides.operationalEmailDelivery === undefined
      ? {}
      : { operationalEmailDelivery: overrides.operationalEmailDelivery }),
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
      retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
    },
    ...(overrides.auditLogging === undefined ? {} : { auditLogging: overrides.auditLogging }),
    webhookTesting:
      overrides.webhookTesting ??
      mockedObject<NonNullable<ApiServerDependencies["webhookTesting"]>>({
        triggerTestDelivery: vi.fn().mockResolvedValue(null)
      }),
    webhookManagement:
      hasWebhookManagementOverride
        ? overrides.webhookManagement
        :
      mockedObject<NonNullable<ApiServerDependencies["webhookManagement"]>>({
        listWebhooksForOrganization: vi.fn().mockResolvedValue([]),
        createWebhookForOrganization: vi.fn().mockResolvedValue(null),
        getWebhookForOrganization: vi.fn().mockResolvedValue(null),
        updateWebhookForOrganization: vi.fn().mockResolvedValue(null),
        deleteWebhookForOrganization: vi.fn().mockResolvedValue(null)
      })
  });
}

describe("api webhook routes", () => {
  it("should reject unauthenticated webhook requests and missing webhook management dependencies", async (): Promise<void> => {
    const unauthenticatedApp = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
      }
    });
    const missingDepsApp = createServer({ webhookManagement: undefined });

    const unauthenticated = await unauthenticatedApp.inject({
      method: "GET",
      url: "/v1/webhooks?project_id=00000000-0000-4000-8000-000000000001"
    });
    const missingDeps = await missingDepsApp.inject({
      method: "GET",
      url: "/v1/webhooks?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json()).toEqual({ error: "invalid_member_token" });
    expect(missingDeps.statusCode).toBe(404);
    expect(missingDeps.json()).toEqual({ error: "project_not_found" });
  });

  it("should validate list webhook query", async (): Promise<void> => {
    const app = createServer();

    const missingProject = await app.inject({
      method: "GET",
      url: "/v1/webhooks",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const badProject = await app.inject({
      method: "GET",
      url: "/v1/webhooks?project_id=not-a-uuid",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(missingProject.statusCode).toBe(400);
    expect(missingProject.json()).toEqual({ error: "invalid_query" });
    expect(badProject.statusCode).toBe(400);
    expect(badProject.json()).toEqual({ error: "invalid_query" });
  });

  it("should list project webhooks scoped to member organization", async (): Promise<void> => {
    const webhookManagement = {
      listWebhooksForOrganization: vi.fn().mockResolvedValue([
        {
          webhook_id: "11111111-1111-4111-8111-111111111111",
          project_id: "00000000-0000-4000-8000-000000000001",
          url: "https://hooks.example.test/debugbundle",
          events: ["bundle.created", "bundle.updated"],
          filters: {
            environment: ["production"],
            severity_min: "high",
            bundle_type: ["failure"]
          },
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z"
        }
      ]),
      createWebhookForOrganization: vi.fn().mockResolvedValue(null),
      getWebhookForOrganization: vi.fn().mockResolvedValue(null),
      updateWebhookForOrganization: vi.fn().mockResolvedValue(null),
      deleteWebhookForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ webhookManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/webhooks?project_id=00000000-0000-4000-8000-000000000001&limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      webhooks: [
        {
          webhook_id: "11111111-1111-4111-8111-111111111111",
          project_id: "00000000-0000-4000-8000-000000000001",
          url: "https://hooks.example.test/debugbundle",
          events: ["bundle.created", "bundle.updated"],
          filters: {
            environment: ["production"],
            severity_min: "high",
            bundle_type: ["failure"]
          },
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z"
        }
      ]
    });
    expect(webhookManagement.listWebhooksForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "00000000-0000-4000-8000-000000000001",
      limit: 10
    });
  });

  it("should list webhooks for collaborators using the shared project's organization", async (): Promise<void> => {
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
    const webhookManagement = {
      listWebhooksForOrganization: vi.fn().mockResolvedValue([]),
      createWebhookForOrganization: vi.fn().mockResolvedValue(null),
      getWebhookForOrganization: vi.fn().mockResolvedValue(null),
      updateWebhookForOrganization: vi.fn().mockResolvedValue(null),
      deleteWebhookForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ projectManagement, webhookManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/webhooks?project_id=00000000-0000-4000-8000-000000000001&limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(webhookManagement.listWebhooksForOrganization).toHaveBeenCalledWith({
      organization_id: "org_shared",
      project_id: "00000000-0000-4000-8000-000000000001",
      limit: 10
    });
  });

  it("should return project_not_found when listing out-of-scope project webhooks", async (): Promise<void> => {
    const webhookManagement = {
      listWebhooksForOrganization: vi.fn().mockResolvedValue(null),
      createWebhookForOrganization: vi.fn().mockResolvedValue(null),
      getWebhookForOrganization: vi.fn().mockResolvedValue(null),
      updateWebhookForOrganization: vi.fn().mockResolvedValue(null),
      deleteWebhookForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ webhookManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/webhooks?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "project_not_found" });
  });

  it("should create webhook and return signing secret once", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const webhookManagement = {
      listWebhooksForOrganization: vi.fn().mockResolvedValue([]),
      createWebhookForOrganization: vi.fn().mockResolvedValue({
        webhook_id: "11111111-1111-4111-8111-111111111111",
        project_id: "00000000-0000-4000-8000-000000000001",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created", "bundle.updated"],
        filters: {
          environment: ["production"],
          severity_min: "high",
          bundle_type: ["failure"],
          verification: false
        },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }),
      getWebhookForOrganization: vi.fn().mockResolvedValue(null),
      updateWebhookForOrganization: vi.fn().mockResolvedValue(null),
      deleteWebhookForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ webhookManagement, auditLogging: { createAuditLog } });

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        project_id: "00000000-0000-4000-8000-000000000001",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created", "bundle.updated"],
        filters: {
          environment: ["production"],
          severity_min: "high",
          bundle_type: ["failure"],
          verification: false
        },
        is_enabled: true
      }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{
      webhook: {
        webhook_id: string;
        signing_secret: string;
      };
    }>();
    expect(body.webhook.webhook_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(body.webhook.signing_secret.startsWith("dbundle_whsec_")).toBe(true);
    expect(webhookManagement.createWebhookForOrganization).toHaveBeenCalledOnce();
    expect(webhookManagement.createWebhookForOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: {
          environment: ["production"],
          severity_min: "high",
          bundle_type: ["failure"],
          verification: false
        }
      })
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        actor_user_id: "usr_123",
        actor_type: "member_token",
        action: "webhook.create",
        target_type: "webhook",
        target_id: "11111111-1111-4111-8111-111111111111",
        status: "success",
        occurred_at: expect.any(String),
        metadata: {
          project_id: "00000000-0000-4000-8000-000000000001",
          event_count: 2,
          has_filters: true,
          is_enabled: true
        }
      })
    );
  });

  it("should rate limit webhook mutations per member", async (): Promise<void> => {
    const claimRequest = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 30,
      remaining: 0,
      retry_after_ms: 12_000
    });
    const app = createServer({ authRateLimiter: { claimRequest } });

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        project_id: "00000000-0000-4000-8000-000000000001",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created"],
        filters: {},
        is_enabled: true
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: "rate_limited" });
    expect(response.headers["retry-after"]).toBe("12");
    expect(claimRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "management-write",
        subject: "member:usr_123",
        limit: 30
      })
    );
  });

  it("should reject oversized webhook payloads with 413", async (): Promise<void> => {
    const createWebhookForOrganization = vi.fn();
    const app = createServer({
      webhookManagement: {
        listWebhooksForOrganization: vi.fn().mockResolvedValue([]),
        createWebhookForOrganization,
        getWebhookForOrganization: vi.fn().mockResolvedValue(null),
        updateWebhookForOrganization: vi.fn().mockResolvedValue(null),
        deleteWebhookForOrganization: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks",
      headers: {
        authorization: "Bearer dbundle_mem_test",
        "content-type": "application/json"
      },
      payload: JSON.stringify({
        project_id: "00000000-0000-4000-8000-000000000001",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created"],
        filters: {
          service: Array.from({ length: 4000 }, (_, index) => `checkout-service-${index.toString().padStart(4, "0")}-${"x".repeat(80)}`)
        },
        is_enabled: true
      })
    });

    expect(response.statusCode).toBe(413);
    expect(createWebhookForOrganization).not.toHaveBeenCalled();
  });

  it("should forward service filters and validate get/delete/test params", async (): Promise<void> => {
    const webhookManagement = {
      listWebhooksForOrganization: vi.fn().mockResolvedValue([]),
      createWebhookForOrganization: vi.fn().mockResolvedValue({
        webhook_id: "11111111-1111-4111-8111-111111111111",
        project_id: "00000000-0000-4000-8000-000000000001",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created"],
        filters: {
          service: ["checkout-api"]
        },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }),
      getWebhookForOrganization: vi.fn().mockResolvedValue(null),
      updateWebhookForOrganization: vi.fn().mockResolvedValue(null),
      deleteWebhookForOrganization: vi.fn().mockResolvedValue(null)
    };
    const webhookTesting = {
      triggerTestDelivery: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ webhookManagement, webhookTesting });

    const created = await app.inject({
      method: "POST",
      url: "/v1/webhooks",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        project_id: "00000000-0000-4000-8000-000000000001",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created"],
        filters: {
          service: ["checkout-api"]
        }
      }
    });
    const invalidGet = await app.inject({
      method: "GET",
      url: "/v1/webhooks/not-a-uuid",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const invalidDelete = await app.inject({
      method: "DELETE",
      url: "/v1/webhooks/not-a-uuid",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const invalidTest = await app.inject({
      method: "POST",
      url: "/v1/webhooks/not-a-uuid/test",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {}
    });

    expect(created.statusCode).toBe(201);
    expect(webhookManagement.createWebhookForOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: {
          service: ["checkout-api"]
        }
      })
    );
    expect(invalidGet.statusCode).toBe(400);
    expect(invalidGet.json()).toEqual({ error: "invalid_webhook_id" });
    expect(invalidDelete.statusCode).toBe(400);
    expect(invalidDelete.json()).toEqual({ error: "invalid_webhook_id" });
    expect(invalidTest.statusCode).toBe(400);
    expect(invalidTest.json()).toEqual({ error: "invalid_webhook_id" });
  });

  it("should validate webhook test payload and delivery query, and return not found branches", async (): Promise<void> => {
    const webhookTesting = {
      triggerTestDelivery: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ webhookTesting });

    const invalidTestPayload = await app.inject({
      method: "POST",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111/test?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        event_type: "not-a-real-event"
      }
    });
    const missingTestTarget = await app.inject({
      method: "POST",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111/test?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        event_type: "verification.failed"
      }
    });
    const invalidDeliveriesQuery = await app.inject({
      method: "GET",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111/deliveries?project_id=00000000-0000-4000-8000-000000000001&limit=0",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const invalidRetryParams = await app.inject({
      method: "POST",
      url: "/v1/webhooks/not-a-uuid/deliveries/not-a-uuid/retry",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(invalidTestPayload.statusCode).toBe(400);
    expect(invalidTestPayload.json()).toEqual({ error: "invalid_payload" });
    expect(missingTestTarget.statusCode).toBe(404);
    expect(missingTestTarget.json()).toEqual({ error: "webhook_not_found" });
    expect(invalidDeliveriesQuery.statusCode).toBe(400);
    expect(invalidDeliveriesQuery.json()).toEqual({ error: "invalid_query" });
    expect(invalidRetryParams.statusCode).toBe(400);
    expect(invalidRetryParams.json()).toEqual({ error: "invalid_params" });
  });

  it("should return webhook_not_found when test routes are mounted without webhook testing", async (): Promise<void> => {
    const app = createServer({ webhookTesting: undefined });

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111/test?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {}
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "webhook_not_found" });
  });

  it("should return webhook_not_found when detail routes are mounted without webhook management", async (): Promise<void> => {
    const app = createServer({ webhookManagement: undefined });

    const getResponse = await app.inject({
      method: "GET",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111?project_id=00000000-0000-4000-8000-000000000001",
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    const patchResponse = await app.inject({
      method: "PATCH",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111?project_id=00000000-0000-4000-8000-000000000001",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: { is_enabled: false }
    });

    expect(getResponse.statusCode).toBe(404);
    expect(getResponse.json()).toEqual({ error: "webhook_not_found" });
    expect(patchResponse.statusCode).toBe(404);
    expect(patchResponse.json()).toEqual({ error: "webhook_not_found" });
  });

  it("should validate webhook creation payload and return project_not_found", async (): Promise<void> => {
    const webhookManagement = {
      listWebhooksForOrganization: vi.fn().mockResolvedValue([]),
      createWebhookForOrganization: vi.fn().mockResolvedValue(null),
      getWebhookForOrganization: vi.fn().mockResolvedValue(null),
      updateWebhookForOrganization: vi.fn().mockResolvedValue(null),
      deleteWebhookForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ webhookManagement });

    const invalidBody = await app.inject({
      method: "POST",
      url: "/v1/webhooks",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        project_id: "00000000-0000-4000-8000-000000000001",
        url: "not-a-url",
        events: ["bundle.created"]
      }
    });
    const missingProject = await app.inject({
      method: "POST",
      url: "/v1/webhooks",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        project_id: "00000000-0000-4000-8000-000000000001",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created"]
      }
    });

    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.json()).toEqual({ error: "invalid_payload" });
    expect(missingProject.statusCode).toBe(404);
    expect(missingProject.json()).toEqual({ error: "project_not_found" });
  });

  it("should get webhook details scoped to member organization", async (): Promise<void> => {
    const webhookManagement = {
      listWebhooksForOrganization: vi.fn().mockResolvedValue([]),
      createWebhookForOrganization: vi.fn().mockResolvedValue(null),
      getWebhookForOrganization: vi.fn().mockResolvedValue({
        webhook_id: "11111111-1111-4111-8111-111111111111",
        project_id: "00000000-0000-4000-8000-000000000001",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created"],
        filters: {},
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }),
      updateWebhookForOrganization: vi.fn().mockResolvedValue(null),
      deleteWebhookForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ webhookManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      webhook: {
        webhook_id: "11111111-1111-4111-8111-111111111111",
        project_id: "00000000-0000-4000-8000-000000000001",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created"],
        filters: {},
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }
    });
  });

  it("should update webhook fields scoped to member organization", async (): Promise<void> => {
    const webhookManagement = {
      listWebhooksForOrganization: vi.fn().mockResolvedValue([]),
      createWebhookForOrganization: vi.fn().mockResolvedValue(null),
      getWebhookForOrganization: vi.fn().mockResolvedValue(null),
      updateWebhookForOrganization: vi.fn().mockResolvedValue({
        webhook_id: "11111111-1111-4111-8111-111111111111",
        project_id: "00000000-0000-4000-8000-000000000001",
        url: "https://hooks.example.test/updated",
        events: ["bundle.updated"],
        filters: {
          environment: ["staging"]
        },
        is_enabled: false,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:05:00.000Z"
      }),
      deleteWebhookForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ webhookManagement });

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        url: "https://hooks.example.test/updated",
        events: ["bundle.updated"],
        filters: {
          environment: ["staging"]
        },
        is_enabled: false
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      webhook: {
        webhook_id: "11111111-1111-4111-8111-111111111111",
        project_id: "00000000-0000-4000-8000-000000000001",
        url: "https://hooks.example.test/updated",
        events: ["bundle.updated"],
        filters: {
          environment: ["staging"]
        },
        is_enabled: false,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:05:00.000Z"
      }
    });
    expect(webhookManagement.updateWebhookForOrganization).toHaveBeenCalledOnce();
  });

  it("should validate webhook update payload and not found cases", async (): Promise<void> => {
    const webhookManagement = {
      listWebhooksForOrganization: vi.fn().mockResolvedValue([]),
      createWebhookForOrganization: vi.fn().mockResolvedValue(null),
      getWebhookForOrganization: vi.fn().mockResolvedValue(null),
      updateWebhookForOrganization: vi.fn().mockResolvedValue(null),
      deleteWebhookForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ webhookManagement });

    const invalidPayload = await app.inject({
      method: "PATCH",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {}
    });
    const notFound = await app.inject({
      method: "PATCH",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111?project_id=00000000-0000-4000-8000-000000000001",
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
    expect(notFound.json()).toEqual({ error: "webhook_not_found" });
  });

  it("should delete webhook scoped to member organization", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const webhookManagement = {
      listWebhooksForOrganization: vi.fn().mockResolvedValue([]),
      createWebhookForOrganization: vi.fn().mockResolvedValue(null),
      getWebhookForOrganization: vi.fn().mockResolvedValue(null),
      updateWebhookForOrganization: vi.fn().mockResolvedValue(null),
      deleteWebhookForOrganization: vi.fn().mockResolvedValue({
        webhook_id: "11111111-1111-4111-8111-111111111111"
      })
    };
    const app = createServer({ webhookManagement, auditLogging: { createAuditLog } });

    const response = await app.inject({
      method: "DELETE",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(webhookManagement.deleteWebhookForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "00000000-0000-4000-8000-000000000001",
      webhook_id: "11111111-1111-4111-8111-111111111111",
      actor_user_id: "usr_123",
      actor_role: "owner"
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        actor_user_id: "usr_123",
        actor_type: "member_token",
        action: "webhook.delete",
        target_type: "webhook",
        target_id: "11111111-1111-4111-8111-111111111111",
        status: "success",
        occurred_at: expect.any(String),
        metadata: {}
      })
    );
  });

  it("should return not found or validation errors for get and delete", async (): Promise<void> => {
    const app = createServer();

    const invalidGet = await app.inject({
      method: "GET",
      url: "/v1/webhooks/not-a-uuid",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const missingGet = await app.inject({
      method: "GET",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const missingDelete = await app.inject({
      method: "DELETE",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(invalidGet.statusCode).toBe(400);
    expect(invalidGet.json()).toEqual({ error: "invalid_webhook_id" });
    expect(missingGet.statusCode).toBe(404);
    expect(missingGet.json()).toEqual({ error: "webhook_not_found" });
    expect(missingDelete.statusCode).toBe(404);
    expect(missingDelete.json()).toEqual({ error: "webhook_not_found" });
  });

  it("should validate webhook test-delivery payload", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111/test?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        event_type: "not-a-webhook-event"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_payload" });
  });

  it("should return webhook_not_found for out-of-scope webhook test delivery", async (): Promise<void> => {
    const webhookTesting = {
      triggerTestDelivery: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ webhookTesting });

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111/test?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "webhook_not_found" });
  });

  it("should reject webhook test delivery when the monthly webhook quota is exhausted", async (): Promise<void> => {
    const webhookTesting = {
      triggerTestDelivery: vi.fn().mockResolvedValue({
        delivery_id: "del_123",
        event_type: "verification.passed"
      })
    };
    const queueProjectOperationalEmailDelivery = vi.fn().mockResolvedValue({ delivery_id: "op_123", created: true });
    const billingManagement = mockedObject<NonNullable<ApiServerDependencies["billingManagement"]>>({
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "free",
        stripe_customer_id: null,
        active_projects: 1,
        capacity_units: {
          total: 1,
          included: 1,
          additional_purchased: 0,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-05-01T00:00:00.000Z",
          ends_at: "2099-01-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 0, limit: 25 },
          monthly_raw_ingested_events: { used: 0, limit: 750 },
          retained_bundle_cap: { used: 0, limit: 5 },
          monthly_remote_activations: { used: 0, limit: 0 },
          monthly_alert_deliveries: { used: 0, limit: 25 },
          monthly_webhook_deliveries: { used: 100, limit: 100 }
        }
      }),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null)
    });
    const app = createServer({
      webhookTesting,
      billingManagement,
      operationalEmailDelivery: { queueProjectOperationalEmailDelivery }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111/test?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBeDefined();
    expect(response.json()).toEqual({
      error: "monthly_quota_exceeded",
      retry_after_ms: expect.any(Number)
    });
    expect(billingManagement.getBillingSummaryForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      now: expect.any(String)
    });
    expect(webhookTesting.triggerTestDelivery).not.toHaveBeenCalled();
    expect(queueProjectOperationalEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "00000000-0000-4000-8000-000000000001",
        kind: "allowance_limit_reached"
      })
    );
  });

  it("queues an 80 percent webhook allowance warning after a successful test delivery", async (): Promise<void> => {
    const webhookTesting = {
      triggerTestDelivery: vi.fn().mockResolvedValue({
        delivery_id: "del_123",
        event_type: "verification.passed"
      })
    };
    const queueProjectOperationalEmailDelivery = vi.fn().mockResolvedValue({ delivery_id: "op_123", created: true });
    const billingManagement = mockedObject<NonNullable<ApiServerDependencies["billingManagement"]>>({
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "solo",
        stripe_customer_id: null,
        active_projects: 1,
        capacity_units: {
          total: 3,
          included: 3,
          additional_purchased: 0,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-05-01T00:00:00.000Z",
          ends_at: "2099-01-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 0, limit: 750 },
          monthly_raw_ingested_events: { used: 0, limit: 10500 },
          retained_bundle_cap: { used: 0, limit: 450 },
          monthly_remote_activations: { used: 0, limit: 75 },
          monthly_alert_deliveries: { used: 0, limit: 225 },
          monthly_webhook_deliveries: { used: 599, limit: 750 }
        }
      }),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null)
    });
    const app = createServer({
      webhookTesting,
      billingManagement,
      operationalEmailDelivery: { queueProjectOperationalEmailDelivery }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111/test?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(202);
    expect(queueProjectOperationalEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "00000000-0000-4000-8000-000000000001",
        kind: "allowance_warning_80"
      })
    );
  });

  it("should enqueue webhook test delivery with verification.passed default", async (): Promise<void> => {
    const webhookTesting = {
      triggerTestDelivery: vi.fn().mockResolvedValue({
        delivery_id: "del_123",
        event_type: "verification.passed"
      })
    };
    const app = createServer({ webhookTesting });

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/11111111-1111-4111-8111-111111111111/test?project_id=00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      delivery: {
        delivery_id: "del_123",
        event_type: "verification.passed"
      }
    });
    expect(webhookTesting.triggerTestDelivery).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "00000000-0000-4000-8000-000000000001",
      webhook_id: "11111111-1111-4111-8111-111111111111",
      event_type: "verification.passed",
      actor_user_id: "usr_123",
      actor_role: "owner"
    });
  });
});
