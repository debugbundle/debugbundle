import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";

function createDependencies(overrides: {
  auditLogging?: ApiDependencies["auditLogging"];
  memberAuth?: ApiDependencies["memberAuth"];
  capturePolicyManagement?: ApiDependencies["capturePolicyManagement"];
  projectManagement?: ApiDependencies["projectManagement"];
  authRateLimiter?: ApiDependencies["authRateLimiter"];
} = {}): ReturnType<typeof createApiServer> {
  return createApiServer({
    ingestionPersistence: { persistAndEnqueue: vi.fn() },
    ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
    ...(overrides.authRateLimiter === undefined
      ? {}
      : { authRateLimiter: overrides.authRateLimiter }),
    memberAuth: overrides.memberAuth ?? {
      resolveMemberByTokenHash: vi.fn().mockResolvedValue({
        member_id: "usr_owner",
        organization_id: "org_123",
        role: "owner",
        revoked_at: null,
        expires_at: null
      })
    },
    tokenManagement: {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    },
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: { getObject: vi.fn() },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue(null)
    },
    ...(overrides.auditLogging === undefined ? {} : { auditLogging: overrides.auditLogging }),
    projectManagement: overrides.projectManagement ?? {
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({
        project_id: "00000000-0000-0000-0000-000000000001",
        organization_id: "org_123",
        owner_user_id: "usr_owner",
        owner_email: "owner@example.com",
        relationship: "owned",
        effective_role: "owner",
        organization_plan: "free"
      }),
      listProjectsForOrganization: vi.fn().mockResolvedValue([]),
      createProjectForOrganization: vi.fn(),
      updateProjectForOrganization: vi.fn(),
      deleteProjectForOrganization: vi.fn()
    },
    capturePolicyManagement: overrides.capturePolicyManagement
  });
}

describe("capture-policy routes", () => {
  describe("GET /v1/projects/:id/capture-policy", () => {
    it("returns the resolved capture policy for a project", async () => {
      const app = createDependencies({
        capturePolicyManagement: {
          getCapturePolicyForProject: vi.fn().mockResolvedValue({
            project_id: "00000000-0000-0000-0000-000000000001",
            preset: "balanced",
            capture_logs: null,
            capture_request_events: null,
            capture_breadcrumbs: null,
            capture_probe_events: null,
            immediate_client_error_statuses: null,
            updated_at: "2026-03-15T00:00:00.000Z"
          }),
          upsertCapturePolicyForProject: vi.fn()
        }
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-policy",
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ policy: Record<string, unknown>; overrides: Record<string, unknown> }>();
      expect(body).toEqual({
        access_mode: "manage",
        policy: expect.objectContaining({
          preset: "balanced",
          capture_logs: "warning",
          capture_request_events: "failures_only",
          immediate_client_error_statuses: []
        }),
        overrides: {
          capture_logs: null,
          capture_request_events: null,
          capture_breadcrumbs: null,
          capture_probe_events: null,
          immediate_client_error_statuses: null,
          immediate_client_error_path_rules: null
        }
      });
    });

    it("preserves explicit none for client error incidents in raw overrides", async () => {
      const app = createDependencies({
        capturePolicyManagement: {
          getCapturePolicyForProject: vi.fn().mockResolvedValue({
            project_id: "00000000-0000-0000-0000-000000000001",
            preset: "balanced",
            capture_logs: null,
            capture_request_events: null,
            capture_breadcrumbs: null,
            capture_probe_events: null,
            immediate_client_error_statuses: [],
            updated_at: "2026-03-15T00:00:00.000Z"
          }),
          upsertCapturePolicyForProject: vi.fn()
        }
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-policy",
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        access_mode: "manage",
        policy: expect.objectContaining({
          preset: "balanced",
          immediate_client_error_statuses: []
        }),
        overrides: {
          capture_logs: null,
          capture_request_events: null,
          capture_breadcrumbs: null,
          capture_probe_events: null,
          immediate_client_error_statuses: [],
          immediate_client_error_path_rules: null
        }
      });
    });

    it("returns 401 for invalid member token", async () => {
      const app = createDependencies({
        memberAuth: {
          resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
        },
        capturePolicyManagement: {
          getCapturePolicyForProject: vi.fn(),
          upsertCapturePolicyForProject: vi.fn()
        }
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-policy",
        headers: { authorization: "Bearer dbundle_mem_bad" }
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns default policy when no policy row exists", async () => {
      const app = createDependencies({
        projectManagement: {
          resolveProjectAccessForUser: vi.fn().mockResolvedValue({
            project_id: "00000000-0000-0000-0000-000000000001",
            organization_id: "org_123",
            owner_user_id: "usr_owner",
            owner_email: "owner@example.com",
            relationship: "owned",
            effective_role: "owner",
            organization_plan: "free"
          }),
          listProjectsForOrganization: vi.fn().mockResolvedValue([
            {
              project_id: "00000000-0000-0000-0000-000000000001",
              organization_id: "org_123",
              name: "Main app",
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
              created_at: "2026-03-15T00:00:00.000Z",
              updated_at: "2026-03-15T00:00:00.000Z"
            }
          ]),
          createProjectForOrganization: vi.fn(),
          updateProjectForOrganization: vi.fn(),
          deleteProjectForOrganization: vi.fn()
        },
        capturePolicyManagement: {
          getCapturePolicyForProject: vi.fn().mockResolvedValue(null),
          upsertCapturePolicyForProject: vi.fn()
        }
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-policy",
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ policy: Record<string, unknown>; overrides: Record<string, unknown> }>();
      expect(body).toEqual({
        access_mode: "manage",
        policy: expect.objectContaining({
          preset: "balanced",
          immediate_client_error_statuses: []
        }),
        overrides: {
          capture_logs: null,
          capture_request_events: null,
          capture_breadcrumbs: null,
          capture_probe_events: null,
          immediate_client_error_statuses: null,
          immediate_client_error_path_rules: null
        }
      });
    });

    it("returns project_not_found when capture policy defaults cannot resolve the project", async () => {
      const app = createDependencies({
        projectManagement: {
          resolveProjectAccessForUser: vi.fn().mockResolvedValue(null),
          listProjectsForOrganization: vi.fn().mockResolvedValue([]),
          createProjectForOrganization: vi.fn(),
          updateProjectForOrganization: vi.fn(),
          deleteProjectForOrganization: vi.fn()
        }
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-policy",
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "project_not_found" });
    });

    it("returns project_not_found when no policy row exists for an unknown project", async () => {
      const app = createDependencies({
        projectManagement: {
          resolveProjectAccessForUser: vi.fn().mockResolvedValue(null),
          listProjectsForOrganization: vi.fn().mockResolvedValue([]),
          createProjectForOrganization: vi.fn(),
          updateProjectForOrganization: vi.fn(),
          deleteProjectForOrganization: vi.fn()
        },
        capturePolicyManagement: {
          getCapturePolicyForProject: vi.fn().mockResolvedValue(null),
          upsertCapturePolicyForProject: vi.fn()
        }
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-policy",
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "project_not_found" });
    });

    it("returns invalid_project_id for malformed capture-policy params", async () => {
      const app = createDependencies();

      const response = await app.inject({
        method: "GET",
        url: "/v1/projects/not-a-uuid/capture-policy",
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_project_id" });
    });

    it("returns the tier default preset for paid projects when no policy row exists", async () => {
      const app = createDependencies({
        projectManagement: {
          resolveProjectAccessForUser: vi.fn().mockResolvedValue({
            project_id: "00000000-0000-0000-0000-000000000001",
            organization_id: "org_123",
            owner_user_id: "usr_owner",
            owner_email: "owner@example.com",
            relationship: "owned",
            effective_role: "owner",
            organization_plan: "solo"
          }),
          listProjectsForOrganization: vi.fn().mockResolvedValue([
            {
              project_id: "00000000-0000-0000-0000-000000000001",
              organization_id: "org_123",
              name: "Main app",
              slug: "main-app",
              environment_default: "production",
              organization_plan: "solo",
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
              created_at: "2026-03-15T00:00:00.000Z",
              updated_at: "2026-03-15T00:00:00.000Z"
            }
          ]),
          createProjectForOrganization: vi.fn(),
          updateProjectForOrganization: vi.fn(),
          deleteProjectForOrganization: vi.fn()
        },
        capturePolicyManagement: {
          getCapturePolicyForProject: vi.fn().mockResolvedValue(null),
          upsertCapturePolicyForProject: vi.fn()
        }
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-policy",
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ policy: Record<string, unknown>; overrides: Record<string, unknown> }>();
      expect(body).toEqual({
        access_mode: "manage",
        policy: expect.objectContaining({
          preset: "balanced",
          capture_logs: "warning",
          capture_request_events: "failures_only",
          immediate_client_error_statuses: []
        }),
        overrides: {
          capture_logs: null,
          capture_request_events: null,
          capture_breadcrumbs: null,
          capture_probe_events: null,
          immediate_client_error_statuses: null,
          immediate_client_error_path_rules: null
        }
      });
    });
  });

  describe("PATCH /v1/projects/:id/capture-policy", () => {
    it("updates the capture policy and returns the resolved result for project admins", async () => {
      const createAuditLog = vi.fn().mockResolvedValue(undefined);
      const app = createDependencies({
        memberAuth: {
          resolveMemberByTokenHash: vi.fn().mockResolvedValue({
            member_id: "usr_admin",
            organization_id: "org_123",
            role: "member",
            revoked_at: null,
            expires_at: null
          })
        },
        projectManagement: {
          resolveProjectAccessForUser: vi.fn().mockResolvedValue({
            project_id: "00000000-0000-0000-0000-000000000001",
            organization_id: "org_123",
            owner_user_id: "usr_owner",
            owner_email: "owner@example.com",
            relationship: "shared",
            effective_role: "admin",
            organization_plan: "team"
          }),
          listProjectsForOrganization: vi.fn().mockResolvedValue([]),
          createProjectForOrganization: vi.fn(),
          updateProjectForOrganization: vi.fn(),
          deleteProjectForOrganization: vi.fn()
        },
        auditLogging: { createAuditLog },
        capturePolicyManagement: {
          getCapturePolicyForProject: vi.fn(),
          upsertCapturePolicyForProject: vi.fn().mockResolvedValue({
            project_id: "00000000-0000-0000-0000-000000000001",
            preset: "investigative",
            capture_logs: "info",
            capture_request_events: null,
            capture_breadcrumbs: null,
            capture_probe_events: null,
            immediate_client_error_statuses: [422, 403],
            updated_at: "2026-03-15T01:00:00.000Z"
          })
        }
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-policy",
        headers: { authorization: "Bearer dbundle_mem_owner_token" },
        payload: { preset: "investigative", capture_logs: "info" }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ policy: Record<string, unknown>; overrides: Record<string, unknown> }>();
      expect(body).toEqual({
        access_mode: "manage",
        policy: expect.objectContaining({
          preset: "investigative",
          capture_logs: "info",
          immediate_client_error_statuses: [403, 422]
        }),
        overrides: {
          capture_logs: "info",
          capture_request_events: null,
          capture_breadcrumbs: null,
          capture_probe_events: null,
          immediate_client_error_statuses: [403, 422],
          immediate_client_error_path_rules: null
        }
      });
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: "org_123",
          actor_user_id: "usr_admin",
          actor_type: "member_token",
          action: "capture_policy.update",
          target_type: "capture_policy",
          target_id: "00000000-0000-0000-0000-000000000001",
          status: "success",
          occurred_at: expect.any(String),
          metadata: {
            update_keys: ["preset", "capture_logs"],
            preset: "investigative"
          }
        })
      );
    });

    it("returns 403 for non-admin project members", async () => {
      const app = createDependencies({
        memberAuth: {
          resolveMemberByTokenHash: vi.fn().mockResolvedValue({
            member_id: "usr_member",
            organization_id: "org_123",
            role: "member",
            revoked_at: null,
            expires_at: null
          })
        },
        projectManagement: {
          resolveProjectAccessForUser: vi.fn().mockResolvedValue({
            project_id: "00000000-0000-0000-0000-000000000001",
            organization_id: "org_123",
            owner_user_id: "usr_owner",
            owner_email: "owner@example.com",
            relationship: "shared",
            effective_role: "member",
            organization_plan: "team"
          }),
          listProjectsForOrganization: vi.fn().mockResolvedValue([]),
          createProjectForOrganization: vi.fn(),
          updateProjectForOrganization: vi.fn(),
          deleteProjectForOrganization: vi.fn()
        },
        capturePolicyManagement: {
          getCapturePolicyForProject: vi.fn(),
          upsertCapturePolicyForProject: vi.fn()
        }
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-policy",
        headers: { authorization: "Bearer dbundle_mem_member" },
        payload: { preset: "investigative" }
      });

      expect(response.statusCode).toBe(403);
    });

    it("returns 400 for invalid payload", async () => {
      const app = createDependencies({
        capturePolicyManagement: {
          getCapturePolicyForProject: vi.fn(),
          upsertCapturePolicyForProject: vi.fn()
        }
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-policy",
        headers: { authorization: "Bearer dbundle_mem_owner_token" },
        payload: { preset: "nonexistent_preset" }
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns capture_policy_not_available when the route has no backing store", async () => {
      const app = createDependencies({
        capturePolicyManagement: undefined
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-policy",
        headers: { authorization: "Bearer dbundle_mem_owner_token" },
        payload: { preset: "balanced" }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "capture_policy_not_available" });
    });

    it("records a failed audit entry when the project cannot be updated", async () => {
      const createAuditLog = vi.fn().mockResolvedValue(undefined);
      const app = createDependencies({
        auditLogging: { createAuditLog },
        capturePolicyManagement: {
          getCapturePolicyForProject: vi.fn(),
          upsertCapturePolicyForProject: vi.fn().mockResolvedValue(null)
        }
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-policy",
        headers: { authorization: "Bearer dbundle_mem_owner_token" },
        payload: { preset: "balanced", capture_logs: "error" }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "project_not_found" });
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "capture_policy.update",
          status: "failure",
          metadata: {
            update_keys: ["preset", "capture_logs"],
            reason: "project_not_found"
          }
        })
      );
    });
  });

  it("should rate limit capture policy reads per member", async (): Promise<void> => {
    const claimRequest = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 100,
      remaining: 0,
      retry_after_ms: 12_000
    });
    const app = createDependencies({ authRateLimiter: { claimRequest } });

    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/00000000-0000-0000-0000-000000000001/capture-policy",
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
        subject: "member:usr_owner",
        limit: 200
      })
    );
  });
});
