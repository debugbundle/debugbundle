import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type AuthRateLimiterDependency = MockedMethods<NonNullable<ApiServerDependencies["authRateLimiter"]>>;
type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;
type WebAuthDependency = MockedMethods<NonNullable<ApiServerDependencies["webAuth"]>>;
type ProjectManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["projectManagement"]>>;

function createServer(overrides: {
  authRateLimiter?: Partial<AuthRateLimiterDependency>;
  memberAuth?: MemberAuthDependency | undefined;
  webAuth?: Partial<WebAuthDependency> | undefined;
  projectManagement?: Partial<ProjectManagementDependency> | undefined;
} = {}): ReturnType<typeof createApiServer> {
  const hasProjectManagementOverride = Object.prototype.hasOwnProperty.call(overrides, "projectManagement");
  const defaultProjectManagement = mockedObject<NonNullable<ApiServerDependencies["projectManagement"]>>({
    listProjectsForUser: vi.fn().mockResolvedValue([]),
    createProjectForUser: vi.fn().mockResolvedValue(null),
    resolveProjectAccessForUser: vi.fn().mockResolvedValue({
      effective_role: "owner"
    }),
    updateProjectForUser: vi.fn().mockResolvedValue(null),
    deleteProjectForUser: vi.fn().mockResolvedValue(null)
  });

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
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: "usr_123",
          organization_id: "org_123",
          role: "owner"
        })
      }),
    webAuth:
      overrides.webAuth === undefined
        ? undefined
        : mockedObject<NonNullable<ApiServerDependencies["webAuth"]>>({
            requestEmailCode: vi.fn(),
            verifyEmailCode: vi.fn(),
            beginGithubAuth: vi.fn(),
            completeGithubAuth: vi.fn(),
            acceptInviteForSession: vi.fn(),
            revokeSessionByToken: vi.fn(),
            ...overrides.webAuth
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
    projectManagement:
      hasProjectManagementOverride
        ? overrides.projectManagement === undefined
          ? undefined
          : mockedObject<NonNullable<ApiServerDependencies["projectManagement"]>>({
              ...defaultProjectManagement,
              ...overrides.projectManagement
            })
        : defaultProjectManagement
  });
}

describe("api project routes", () => {
  it("should reject unauthenticated project requests and missing project management dependencies", async (): Promise<void> => {
    const unauthenticatedApp = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
      }
    });
    const missingDepsApp = createServer({
      projectManagement: undefined
    });

    const unauthenticated = await unauthenticatedApp.inject({
      method: "GET",
      url: "/v1/projects"
    });
    const missingDeps = await missingDepsApp.inject({
      method: "GET",
      url: "/v1/projects",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json()).toEqual({ error: "invalid_member_token" });
    expect(missingDeps.statusCode).toBe(404);
    expect(missingDeps.json()).toEqual({ error: "projects_not_available" });
  });

  it("should list projects scoped to the caller organization", async (): Promise<void> => {
    const projectManagement = {
      listProjectsForUser: vi.fn().mockResolvedValue([
        {
          project_id: "00000000-0000-4000-8000-000000000001",
          organization_id: "org_123",
          name: "Main App",
          slug: "main-app",
          environment_default: "production",
          organization_plan: "free",
          metrics: {
            open_incidents: 5,
            regressed_incidents: 1,
            opened_incidents_today: 2,
            opened_incidents_month: 7,
            monthly_bundle_requests: 12,
            monthly_raw_ingested_events: 120,
            retained_bundles: 6,
            monthly_alert_deliveries: 4
          },
          created_at: "2026-03-16T00:00:00.000Z",
          updated_at: "2026-03-16T00:00:00.000Z"
        }
      ]),
      createProjectForUser: vi.fn().mockResolvedValue(null),
      updateProjectForUser: vi.fn().mockResolvedValue(null),
      deleteProjectForUser: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ projectManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/projects?limit=10",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      projects: [
        {
          project_id: "00000000-0000-4000-8000-000000000001",
          organization_id: "org_123",
          name: "Main App",
          slug: "main-app",
          environment_default: "production",
          organization_plan: "free",
          metrics: {
            open_incidents: 5,
            regressed_incidents: 1,
            opened_incidents_today: 2,
            opened_incidents_month: 7,
            monthly_bundle_requests: 12,
            monthly_raw_ingested_events: 120,
            retained_bundles: 6,
            monthly_alert_deliveries: 4
          },
          created_at: "2026-03-16T00:00:00.000Z",
          updated_at: "2026-03-16T00:00:00.000Z"
        }
      ]
    });
    expect(projectManagement.listProjectsForUser).toHaveBeenCalledWith({
      user_id: "usr_123",
      limit: 10,
      now: expect.any(String)
    });
  });

  it("should validate project list query", async (): Promise<void> => {
    const app = createServer();

    const badQuery = await app.inject({
      method: "GET",
      url: "/v1/projects?limit=1000",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(badQuery.statusCode).toBe(400);
    expect(badQuery.json()).toEqual({ error: "invalid_query" });
  });

  it("should keep suspended shared projects in the list response", async (): Promise<void> => {
    const projectManagement = {
      listProjectsForUser: vi.fn().mockResolvedValue([
        {
          project_id: "00000000-0000-4000-8000-000000000002",
          organization_id: "org_owner",
          owner_user_id: "usr_owner",
          owner_email: "owner@example.com",
          relationship: "shared",
          sharing_state: "shared_with_you",
          effective_role: "member",
          shared_access_suspended: true,
          name: "Paused Shared App",
          slug: "paused-shared-app",
          environment_default: "production",
          organization_plan: "free",
          metrics: {
            open_incidents: 1,
            regressed_incidents: 0,
            opened_incidents_today: 0,
            opened_incidents_month: 1,
            monthly_bundle_requests: 1,
            monthly_raw_ingested_events: 8,
            retained_bundles: 1,
            monthly_alert_deliveries: 0
          },
          created_at: "2026-03-16T00:00:00.000Z",
          updated_at: "2026-03-16T00:00:00.000Z"
        }
      ]),
      createProjectForUser: vi.fn().mockResolvedValue(null),
      updateProjectForUser: vi.fn().mockResolvedValue(null),
      deleteProjectForUser: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ projectManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/projects",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      projects: [
        {
          project_id: "00000000-0000-4000-8000-000000000002",
          organization_id: "org_owner",
          owner_user_id: "usr_owner",
          owner_email: "owner@example.com",
          relationship: "shared",
          sharing_state: "shared_with_you",
          effective_role: "member",
          shared_access_suspended: true,
          name: "Paused Shared App",
          slug: "paused-shared-app",
          environment_default: "production",
          organization_plan: "free",
          metrics: {
            open_incidents: 1,
            regressed_incidents: 0,
            opened_incidents_today: 0,
            opened_incidents_month: 1,
            monthly_bundle_requests: 1,
            monthly_raw_ingested_events: 8,
            retained_bundles: 1,
            monthly_alert_deliveries: 0
          },
          created_at: "2026-03-16T00:00:00.000Z",
          updated_at: "2026-03-16T00:00:00.000Z"
        }
      ]
    });
  });

  it("should create a project for owner-role callers", async (): Promise<void> => {
    const projectManagement = {
      listProjectsForUser: vi.fn().mockResolvedValue([]),
      createProjectForUser: vi.fn().mockResolvedValue({
        project_id: "00000000-0000-4000-8000-000000000001",
        organization_id: "org_123",
        name: "Main App",
        slug: "main-app",
        environment_default: "production",
        organization_plan: "free",
        metrics: {
          open_incidents: 0,
          regressed_incidents: 0,
          opened_incidents_today: 0,
          opened_incidents_month: 0,
          monthly_bundle_requests: 0,
          monthly_raw_ingested_events: 0,
          retained_bundles: 0,
          monthly_alert_deliveries: 0
        },
        created_at: "2026-03-16T00:00:00.000Z",
        updated_at: "2026-03-16T00:00:00.000Z"
      }),
      updateProjectForUser: vi.fn().mockResolvedValue(null),
      deleteProjectForUser: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ projectManagement });

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        name: "Main App",
        slug: "main-app"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(projectManagement.createProjectForUser).toHaveBeenCalledWith({
      user_id: "usr_123",
      organization_id: "org_123",
      name: "Main App",
      slug: "main-app",
      environment_default: "production",
      weekly_report_timezone: "UTC"
    });
  });

  it("should rate limit project mutations per member", async (): Promise<void> => {
    const claimRequest = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 30,
      remaining: 0,
      retry_after_ms: 12_000
    });
    const app = createServer({ authRateLimiter: { claimRequest } });

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        name: "Main App",
        slug: "main-app"
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

  it("should reject project creation for member-role callers", async (): Promise<void> => {
    const projectManagement = {
      listProjectsForUser: vi.fn().mockResolvedValue([]),
      createProjectForUser: vi.fn().mockResolvedValue(null),
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({ effective_role: "member" }),
      updateProjectForUser: vi.fn().mockResolvedValue(null),
      deleteProjectForUser: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: "usr_123",
          organization_id: "org_123",
          role: "member"
        })
      },
      projectManagement
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        name: "Main App",
        slug: "main-app"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "forbidden" });
    expect(projectManagement.createProjectForUser).not.toHaveBeenCalled();
  });

  it("should accept browser sessions for project creation when the session user is an owner", async (): Promise<void> => {
    const csrfToken = buildCsrfToken("session-secret");
    const projectManagement = {
      listProjectsForUser: vi.fn().mockResolvedValue([]),
      createProjectForUser: vi.fn().mockResolvedValue({
        project_id: "00000000-0000-4000-8000-000000000001",
        organization_id: "org_123",
        name: "Main App",
        slug: "main-app",
        environment_default: "staging",
        organization_plan: "free",
        metrics: {
          open_incidents: 5,
          regressed_incidents: 1,
          opened_incidents_today: 2,
          opened_incidents_month: 7,
          monthly_bundle_requests: 12,
          monthly_raw_ingested_events: 120,
          retained_bundles: 6,
          monthly_alert_deliveries: 4
        },
        created_at: "2026-03-16T00:00:00.000Z",
        updated_at: "2026-03-16T00:00:00.000Z"
      }),
      updateProjectForUser: vi.fn().mockResolvedValue(null),
      deleteProjectForUser: vi.fn().mockResolvedValue(null)
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
      projectManagement
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`,
        "x-csrf-token": csrfToken
      },
      payload: {
        name: "Main App",
        slug: "main-app",
        environment_default: "staging",
        weekly_report_timezone: "Europe/Ljubljana"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(projectManagement.createProjectForUser).toHaveBeenCalledWith({
      user_id: "usr_123",
      organization_id: "org_123",
      name: "Main App",
      slug: "main-app",
      environment_default: "staging",
      weekly_report_timezone: "Europe/Ljubljana"
    });
  });

  it("should reject browser-session project creation without a valid csrf token", async (): Promise<void> => {
    const projectManagement = {
      listProjectsForUser: vi.fn().mockResolvedValue([]),
      createProjectForUser: vi.fn().mockResolvedValue(null),
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({ effective_role: "member" }),
      updateProjectForUser: vi.fn().mockResolvedValue(null),
      deleteProjectForUser: vi.fn().mockResolvedValue(null)
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
      projectManagement
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`
      },
      payload: {
        name: "Main App",
        slug: "main-app",
        environment_default: "staging"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "invalid_csrf_token" });
    expect(projectManagement.createProjectForUser).not.toHaveBeenCalled();
  });

  it("should validate project creation payload and map slug conflicts", async (): Promise<void> => {
    const projectManagement = {
      listProjectsForUser: vi.fn().mockResolvedValue([]),
      createProjectForUser: vi.fn().mockResolvedValue(null),
      updateProjectForUser: vi.fn().mockResolvedValue(null),
      deleteProjectForUser: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ projectManagement });

    const invalidPayload = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        name: "",
        slug: "Not Valid"
      }
    });
    const slugTaken = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        name: "Main App",
        slug: "main-app"
      }
    });
    const invalidTimezone = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        name: "Main App",
        slug: "main-app",
        weekly_report_timezone: "Not/AZone"
      }
    });

    expect(invalidPayload.statusCode).toBe(400);
    expect(invalidPayload.json()).toEqual({ error: "invalid_payload" });
    expect(invalidTimezone.statusCode).toBe(400);
    expect(invalidTimezone.json()).toEqual({ error: "invalid_payload" });
    expect(slugTaken.statusCode).toBe(409);
    expect(slugTaken.json()).toEqual({ error: "project_slug_taken" });
  });

  it("should update a project for owner-role callers and map not-found and slug conflicts", async (): Promise<void> => {
    const projectManagement = {
      listProjectsForUser: vi.fn().mockResolvedValue([]),
      createProjectForUser: vi.fn().mockResolvedValue(null),
      updateProjectForUser: vi
        .fn()
        .mockResolvedValueOnce({
          project_id: "00000000-0000-4000-8000-000000000001",
          organization_id: "org_123",
          name: "Main App API",
          slug: "main-app-api",
          environment_default: "staging",
          organization_plan: "free",
          created_at: "2026-03-16T00:00:00.000Z",
          updated_at: "2026-03-18T00:00:00.000Z"
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("slug_taken")
        ,
      deleteProjectForUser: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ projectManagement });

    const updated = await app.inject({
      method: "PATCH",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        name: "Main App API",
        slug: "main-app-api",
        environment_default: "staging"
      }
    });
    const missing = await app.inject({
      method: "PATCH",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        name: "Missing"
      }
    });
    const duplicate = await app.inject({
      method: "PATCH",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        slug: "main-app-api"
      }
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({
      project: {
        project_id: "00000000-0000-4000-8000-000000000001",
        organization_id: "org_123",
        name: "Main App API",
        slug: "main-app-api",
        environment_default: "staging",
        organization_plan: "free",
        created_at: "2026-03-16T00:00:00.000Z",
        updated_at: "2026-03-18T00:00:00.000Z"
      }
    });
    expect(projectManagement.updateProjectForUser).toHaveBeenNthCalledWith(1, {
      user_id: "usr_123",
      project_id: "00000000-0000-4000-8000-000000000001",
      name: "Main App API",
      slug: "main-app-api",
      environment_default: "staging"
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "project_not_found" });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: "project_slug_taken" });
  });

  it("should validate project update path and payload", async (): Promise<void> => {
    const app = createServer();

    const invalidProjectId = await app.inject({
      method: "PATCH",
      url: "/v1/projects/not-a-uuid",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        name: "Main App API"
      }
    });
    const invalidPayload = await app.inject({
      method: "PATCH",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {}
    });

    expect(invalidProjectId.statusCode).toBe(400);
    expect(invalidProjectId.json()).toEqual({ error: "invalid_project_id" });
    expect(invalidPayload.statusCode).toBe(400);
    expect(invalidPayload.json()).toEqual({ error: "invalid_payload" });
  });

  it("should return shared_access_suspended for shared collaborators attempting to mutate a paused project", async (): Promise<void> => {
    const projectManagement = {
      listProjectsForUser: vi.fn().mockResolvedValue([]),
      createProjectForUser: vi.fn().mockResolvedValue(null),
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({
        project_id: "00000000-0000-4000-8000-000000000003",
        organization_id: "org_owner",
        owner_user_id: "usr_owner",
        owner_email: "owner@example.com",
        relationship: "shared",
        sharing_state: "shared_with_you",
        effective_role: "admin",
        shared_access_suspended: true,
        organization_plan: "free"
      }),
      updateProjectForUser: vi.fn().mockResolvedValue(null),
      deleteProjectForUser: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      memberAuth: mockedObject<ApiServerDependencies["memberAuth"]>({
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: "usr_collaborator",
          organization_id: "org_collaborator",
          role: "member"
        })
      }),
      projectManagement
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/projects/00000000-0000-4000-8000-000000000003",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        name: "Renamed"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "shared_access_suspended" });
    expect(projectManagement.updateProjectForUser).not.toHaveBeenCalled();
  });

  it("should delete a project for owner-role callers and map missing projects", async (): Promise<void> => {
    const projectManagement = {
      listProjectsForUser: vi.fn().mockResolvedValue([]),
      createProjectForUser: vi.fn().mockResolvedValue(null),
      updateProjectForUser: vi.fn().mockResolvedValue(null),
      deleteProjectForUser: vi
        .fn()
        .mockResolvedValueOnce({
          project_id: "00000000-0000-4000-8000-000000000001",
          organization_id: "org_123",
          name: "Main App",
          slug: "main-app",
          environment_default: "production",
          organization_plan: "free",
          created_at: "2026-03-16T00:00:00.000Z",
          updated_at: "2026-03-16T00:00:00.000Z"
        })
        .mockResolvedValueOnce(null)
    };
    const app = createServer({ projectManagement });

    const deleted = await app.inject({
      method: "DELETE",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const missing = await app.inject({
      method: "DELETE",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({
      project: {
        project_id: "00000000-0000-4000-8000-000000000001",
        organization_id: "org_123",
        name: "Main App",
        slug: "main-app",
        environment_default: "production",
        organization_plan: "free",
        created_at: "2026-03-16T00:00:00.000Z",
        updated_at: "2026-03-16T00:00:00.000Z"
      }
    });
    expect(projectManagement.deleteProjectForUser).toHaveBeenNthCalledWith(1, {
      user_id: "usr_123",
      project_id: "00000000-0000-4000-8000-000000000001"
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "project_not_found" });
  });

  it("should reject project deletion for member-role callers and validate the project id", async (): Promise<void> => {
    const projectManagement = {
      listProjectsForUser: vi.fn().mockResolvedValue([]),
      createProjectForUser: vi.fn().mockResolvedValue(null),
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({ effective_role: "member" }),
      updateProjectForUser: vi.fn().mockResolvedValue(null),
      deleteProjectForUser: vi.fn().mockResolvedValue(null)
    };
    const memberApp = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: "usr_123",
          organization_id: "org_123",
          role: "member"
        })
      },
      projectManagement
    });
    const ownerApp = createServer({ projectManagement });

    const forbidden = await memberApp.inject({
      method: "DELETE",
      url: "/v1/projects/00000000-0000-4000-8000-000000000001",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const invalidProjectId = await ownerApp.inject({
      method: "DELETE",
      url: "/v1/projects/not-a-uuid",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toEqual({ error: "forbidden" });
    expect(invalidProjectId.statusCode).toBe(400);
    expect(invalidProjectId.json()).toEqual({ error: "invalid_project_id" });
    expect(projectManagement.deleteProjectForUser).not.toHaveBeenCalled();
  });
});
