import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type AuthRateLimiterDependency = MockedMethods<NonNullable<ApiServerDependencies["authRateLimiter"]>>;
type AuditLoggingDependency = MockedMethods<NonNullable<ApiServerDependencies["auditLogging"]>>;
type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;
type WebAuthDependency = MockedMethods<NonNullable<ApiServerDependencies["webAuth"]>>;
type TokenManagementDependency = MockedMethods<ApiServerDependencies["tokenManagement"]>;
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
  auditLogging?: Partial<AuditLoggingDependency>;
  memberAuth?: MemberAuthDependency;
  webAuth?: Partial<WebAuthDependency>;
  projectManagement?: ProjectManagementDependency;
  tokenManagement?: TokenManagementDependency;
} = {}): ReturnType<typeof createApiServer> {
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
    webAuth:
      mockedObject<NonNullable<ApiServerDependencies["webAuth"]>>({
        requestEmailCode: vi.fn(),
        verifyEmailCode: vi.fn(),
        beginGithubAuth: vi.fn(),
        completeGithubAuth: vi.fn(),
        acceptInviteForSession: vi.fn(),
        resolveSessionByToken: vi.fn().mockResolvedValue(null),
        revokeSessionByToken: vi.fn().mockResolvedValue(false),
        ...overrides.webAuth
      }),
    tokenManagement:
      overrides.tokenManagement ??
      mockedObject<ApiServerDependencies["tokenManagement"]>({
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
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
      retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
    },
    ...(overrides.auditLogging === undefined
      ? {}
      : {
          auditLogging: {
            createAuditLog: overrides.auditLogging.createAuditLog ?? vi.fn().mockResolvedValue(undefined)
          }
        })
  });
}

describe("api token management routes", () => {
  it("should validate project token list request params and query", async (): Promise<void> => {
    const app = createServer();

    const badProjectId = await app.inject({
      method: "GET",
      url: "/v1/projects/not-a-uuid/tokens",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const badQuery = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/tokens?limit=1000",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(badProjectId.statusCode).toBe(400);
    expect(badProjectId.json()).toEqual({ error: "invalid_project_id" });
    expect(badQuery.statusCode).toBe(400);
    expect(badQuery.json()).toEqual({ error: "invalid_query" });
  });

  it("should list project tokens scoped to member organization", async (): Promise<void> => {
    const tokenManagement = {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([
        {
          token_id: "11111111-1111-4111-8111-111111111111",
          project_id: "00000000-0000-4000-8000-000000000001",
          label: "ci",
          allowed_origins: ["https://static.example.com"],
          created_at: "2026-03-11T00:00:00.000Z",
          last_used_at: null,
          revoked_at: null,
          expires_at: null
        }
      ]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ tokenManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/tokens?limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      tokens: [
        {
          token_id: "11111111-1111-4111-8111-111111111111",
          project_id: "00000000-0000-4000-8000-000000000001",
          label: "ci",
          allowed_origins: ["https://static.example.com"],
          created_at: "2026-03-11T00:00:00.000Z",
          last_used_at: null,
          revoked_at: null,
          expires_at: null
        }
      ]
    });
    expect(tokenManagement.listProjectTokensForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "00000000-0000-4000-8000-000000000001",
      limit: 10
    });
  });

  it("should list project tokens for collaborators using the shared project's organization", async (): Promise<void> => {
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
    const tokenManagement = {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ projectManagement, tokenManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/tokens?limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(tokenManagement.listProjectTokensForOrganization).toHaveBeenCalledWith({
      organization_id: "org_shared",
      project_id: "00000000-0000-4000-8000-000000000001",
      limit: 10
    });
  });

  it("should rate limit token management reads per member", async (): Promise<void> => {
    const claimRequest = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 100,
      remaining: 0,
      retry_after_ms: 12_000
    });
    const app = createServer({ authRateLimiter: { claimRequest } });

    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/tokens?limit=10",
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

  it("should return project_not_found for out-of-scope project token list", async (): Promise<void> => {
    const tokenManagement = {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue(null),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ tokenManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/tokens",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "project_not_found" });
  });

  it("should create project token and return plaintext once", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const tokenManagement = {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue({
        token_id: "11111111-1111-4111-8111-111111111111",
        project_id: "00000000-0000-4000-8000-000000000001",
        label: "ci",
        allowed_origins: ["https://static.example.com"],
        created_at: "2026-03-11T00:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
        expires_at: null
      }),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ tokenManagement, auditLogging: { createAuditLog } });

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/tokens",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        label: "ci",
        allowed_origins: ["https://static.example.com/app", "https://STATIC.example.com"]
      }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{
      token: {
        token_id: string;
        plaintext: string;
      };
    }>();

    expect(body.token.token_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(body.token.plaintext.startsWith("dbundle_proj_")).toBe(true);
    expect(tokenManagement.createProjectTokenForOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed_origins: ["https://static.example.com"]
      })
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        actor_user_id: "usr_123",
        actor_type: "member_token",
        action: "token.project.create",
        target_type: "project_token",
        target_id: "11111111-1111-4111-8111-111111111111",
        status: "success",
        ip_address: expect.any(String),
        occurred_at: expect.any(String),
        metadata: {
          project_id: "00000000-0000-4000-8000-000000000001",
          label: "ci"
        }
      })
    );
  });

  it("should create project tokens for shared-project admins using the shared project's scope", async (): Promise<void> => {
    const projectManagement = mockedObject<NonNullable<ApiServerDependencies["projectManagement"]>>({
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({
        ...defaultProjectAccess,
        organization_id: "org_shared",
        relationship: "shared",
        effective_role: "admin"
      }),
      listProjectsForUser: vi.fn().mockResolvedValue([]),
      createProjectForUser: vi.fn().mockResolvedValue(null),
      updateProjectForUser: vi.fn().mockResolvedValue(null),
      deleteProjectForUser: vi.fn().mockResolvedValue(null)
    });
    const tokenManagement = {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue({
        token_id: "11111111-1111-4111-8111-111111111111",
        project_id: "00000000-0000-4000-8000-000000000001",
        label: "ci",
        allowed_origins: [],
        created_at: "2026-03-11T00:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
        expires_at: null
      }),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ projectManagement, tokenManagement });

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/tokens",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        label: "ci"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(tokenManagement.createProjectTokenForOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_shared",
        project_id: "00000000-0000-4000-8000-000000000001",
        label: "ci",
        allowed_origins: []
      })
    );
  });

  it("should block plain shared-project members from project token credential management", async (): Promise<void> => {
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
    const tokenManagement = {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ projectManagement, tokenManagement });

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/tokens",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        label: "ci"
      }
    });
    const revokeResponse = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/tokens/11111111-1111-4111-8111-111111111111/revoke",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(createResponse.statusCode).toBe(403);
    expect(createResponse.json()).toEqual({ error: "forbidden" });
    expect(revokeResponse.statusCode).toBe(403);
    expect(revokeResponse.json()).toEqual({ error: "forbidden" });
    expect(tokenManagement.createProjectTokenForOrganization).not.toHaveBeenCalled();
    expect(tokenManagement.revokeProjectTokenForOrganization).not.toHaveBeenCalled();
  });

  it("should return project_not_found and invalid_payload for project token creation", async (): Promise<void> => {
    const tokenManagement = {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ tokenManagement });

    const invalidBody = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/tokens",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        label: ""
      }
    });
    const missingProject = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/tokens",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        label: "ci"
      }
    });
    const invalidOrigins = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/tokens",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        label: "static browser",
        allowed_origins: ["not-an-origin"]
      }
    });

    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.json()).toEqual({ error: "invalid_payload" });
    expect(invalidOrigins.statusCode).toBe(400);
    expect(invalidOrigins.json()).toEqual({ error: "invalid_allowed_origins" });
    expect(missingProject.statusCode).toBe(404);
    expect(missingProject.json()).toEqual({ error: "project_not_found" });
  });

  it("should revoke project token in scoped organization", async (): Promise<void> => {
    const tokenManagement = {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue({
        token_id: "11111111-1111-4111-8111-111111111111",
        project_id: "00000000-0000-4000-8000-000000000001",
        label: "ci",
        allowed_origins: [],
        created_at: "2026-03-11T00:00:00.000Z",
        last_used_at: null,
        revoked_at: "2026-03-11T01:00:00.000Z",
        expires_at: null
      }),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ tokenManagement });

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/tokens/11111111-1111-4111-8111-111111111111/revoke",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ token: { revoked_at: string } }>().token.revoked_at).toBe("2026-03-11T01:00:00.000Z");
  });

  it("should return not found and validation errors for project token revoke", async (): Promise<void> => {
    const tokenManagement = {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ tokenManagement });

    const invalidParams = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/tokens/not-a-uuid/revoke",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const notFound = await app.inject({
      method: "POST",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001/tokens/11111111-1111-4111-8111-111111111111/revoke",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(invalidParams.statusCode).toBe(400);
    expect(invalidParams.json()).toEqual({ error: "invalid_token_id" });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toEqual({ error: "token_not_found" });
  });

  it("should list and manage member tokens", async (): Promise<void> => {
    const tokenManagement = {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([
        {
          token_id: "22222222-2222-4222-8222-222222222222",
          user_id: "usr_123",
          organization_id: "org_123",
          label: "local-cli",
          created_at: "2026-03-11T00:00:00.000Z",
          last_used_at: null,
          revoked_at: null,
          expires_at: null
        }
      ]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue({
        token_id: "33333333-3333-4333-8333-333333333333",
        user_id: "usr_123",
        organization_id: "org_123",
        label: "agent",
        created_at: "2026-03-11T00:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
        expires_at: null
      }),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue({
        token_id: "22222222-2222-4222-8222-222222222222",
        user_id: "usr_123",
        organization_id: "org_123",
        label: "local-cli",
        created_at: "2026-03-11T00:00:00.000Z",
        last_used_at: null,
        revoked_at: "2026-03-11T01:00:00.000Z",
        expires_at: null
      })
    };
    const app = createServer({ tokenManagement });

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/member/tokens?limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json<{ tokens: Array<{ token_id: string }> }>().tokens[0]?.token_id).toBe(
      "22222222-2222-4222-8222-222222222222"
    );

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/member/tokens",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        label: "agent"
      }
    });
    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json<{ token: { plaintext: string } }>().token.plaintext.startsWith("dbundle_mem_")).toBe(true);

    const revokeResponse = await app.inject({
      method: "POST",
      url: "/v1/member/tokens/22222222-2222-4222-8222-222222222222/revoke",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    expect(revokeResponse.statusCode).toBe(200);
    expect(revokeResponse.json<{ token: { revoked_at: string } }>().token.revoked_at).toBe("2026-03-11T01:00:00.000Z");
  });

  it("should validate member token lifecycle request shapes", async (): Promise<void> => {
    const tokenManagement = {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue({
        token_id: "33333333-3333-4333-8333-333333333333",
        user_id: "usr_123",
        organization_id: "org_123",
        label: "agent",
        created_at: "2026-03-11T00:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
        expires_at: null
      }),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ tokenManagement });

    const invalidQuery = await app.inject({
      method: "GET",
      url: "/v1/member/tokens?limit=1000",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const invalidPayload = await app.inject({
      method: "POST",
      url: "/v1/member/tokens",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        label: ""
      }
    });
    const invalidTokenId = await app.inject({
      method: "POST",
      url: "/v1/member/tokens/not-a-uuid/revoke",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const tokenNotFound = await app.inject({
      method: "POST",
      url: "/v1/member/tokens/22222222-2222-4222-8222-222222222222/revoke",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(invalidQuery.statusCode).toBe(400);
    expect(invalidQuery.json()).toEqual({ error: "invalid_query" });
    expect(invalidPayload.statusCode).toBe(400);
    expect(invalidPayload.json()).toEqual({ error: "invalid_payload" });
    expect(invalidTokenId.statusCode).toBe(400);
    expect(invalidTokenId.json()).toEqual({ error: "invalid_token_id" });
    expect(tokenNotFound.statusCode).toBe(404);
    expect(tokenNotFound.json()).toEqual({ error: "token_not_found" });
  });

  it("should reject token management routes without member token", async (): Promise<void> => {
    const app = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/member/tokens",
      headers: {
        authorization: "Bearer dbundle_mem_invalid"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "invalid_member_token"
    });
  });

  it("should accept browser sessions for member-authorized token routes", async (): Promise<void> => {
    const tokenManagement = {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    };
    const webAuth = {
      requestEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      resolveSessionByToken: vi.fn().mockResolvedValue({
        session_id: "ses_123",
        user_id: "usr_123",
        email: "owen@example.com",
        email_verified_at: null,
        organization_id: "org_123",
        role: "owner",
        created_at: "2026-03-16T00:00:00.000Z",
        expires_at: "2026-03-16T12:00:00.000Z",
        revoked_at: null
      }),
      revokeSessionByToken: vi.fn().mockResolvedValue(false)
    };
    const app = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
      },
      webAuth,
      tokenManagement
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/member/tokens",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(tokenManagement.listMemberTokensForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      user_id: "usr_123",
      limit: 20
    });
  });

  it("should require verified email before first member token creation from browser session", async (): Promise<void> => {
    const csrfToken = buildCsrfToken("session-secret");
    const tokenManagement = {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
      },
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: "ses_123",
          user_id: "usr_123",
          email: "owen@example.com",
          email_verified_at: null,
          organization_id: "org_123",
          role: "owner",
          created_at: "2026-03-16T00:00:00.000Z",
          expires_at: "2026-03-16T12:00:00.000Z",
          revoked_at: null
        })
      },
      tokenManagement
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/member/tokens",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`,
        "x-csrf-token": csrfToken
      },
      payload: {
        label: "agent"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "email_verification_required"
    });
    expect(tokenManagement.listMemberTokensForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      user_id: "usr_123",
      limit: 1
    });
    expect(tokenManagement.createMemberTokenForOrganization).not.toHaveBeenCalled();
  });

  it("should allow verified browser sessions to create their first member token", async (): Promise<void> => {
    const csrfToken = buildCsrfToken("session-secret");
    const tokenManagement = {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue({
        token_id: "33333333-3333-4333-8333-333333333333",
        user_id: "usr_123",
        organization_id: "org_123",
        label: "agent",
        created_at: "2026-03-11T00:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
        expires_at: null
      }),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
      },
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: "ses_123",
          user_id: "usr_123",
          email: "owen@example.com",
          email_verified_at: "2026-03-16T00:00:00.000Z",
          organization_id: "org_123",
          role: "owner",
          created_at: "2026-03-16T00:00:00.000Z",
          expires_at: "2026-03-16T12:00:00.000Z",
          revoked_at: null
        })
      },
      tokenManagement
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/member/tokens",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`,
        "x-csrf-token": csrfToken
      },
      payload: {
        label: "agent"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<{ token: { plaintext: string } }>().token.plaintext.startsWith("dbundle_mem_")).toBe(true);
    expect(tokenManagement.listMemberTokensForOrganization).not.toHaveBeenCalled();
    expect(tokenManagement.createMemberTokenForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      user_id: "usr_123",
      label: "agent",
      token_hash: expect.any(String)
    });
  });

  it("should allow unverified browser sessions to create additional member tokens after the first one", async (): Promise<void> => {
    const csrfToken = buildCsrfToken("session-secret");
    const tokenManagement = {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([
        {
          token_id: "22222222-2222-4222-8222-222222222222",
          user_id: "usr_123",
          organization_id: "org_123",
          label: "local-cli",
          created_at: "2026-03-11T00:00:00.000Z",
          last_used_at: null,
          revoked_at: "2026-03-11T01:00:00.000Z",
          expires_at: null
        }
      ]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue({
        token_id: "33333333-3333-4333-8333-333333333333",
        user_id: "usr_123",
        organization_id: "org_123",
        label: "agent",
        created_at: "2026-03-11T00:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
        expires_at: null
      }),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
      },
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: "ses_123",
          user_id: "usr_123",
          email: "owen@example.com",
          email_verified_at: null,
          organization_id: "org_123",
          role: "owner",
          created_at: "2026-03-16T00:00:00.000Z",
          expires_at: "2026-03-16T12:00:00.000Z",
          revoked_at: null
        })
      },
      tokenManagement
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/member/tokens",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`,
        "x-csrf-token": csrfToken
      },
      payload: {
        label: "agent"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(tokenManagement.listMemberTokensForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      user_id: "usr_123",
      limit: 1
    });
    expect(tokenManagement.createMemberTokenForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      user_id: "usr_123",
      label: "agent",
      token_hash: expect.any(String)
    });
  });
});
