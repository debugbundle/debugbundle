import { describe, expect, it, vi } from "vitest";

import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { createApiServer } from "../../../apps/api/src/server.js";
import type { AnalyticsSettings } from "../../../packages/shared-types/src/index.js";

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";

function createProjectAccess(overrides: Partial<{
  effective_role: "owner" | "admin" | "member";
  organization_plan: "free" | "solo" | "team";
  relationship: "owned" | "shared";
}> = {}) {
  return {
    project_id: PROJECT_ID,
    organization_id: "org_123",
    owner_user_id: "usr_owner",
    owner_email: "owner@example.com",
    relationship: overrides.relationship ?? "owned",
    effective_role: overrides.effective_role ?? "owner",
    organization_plan: overrides.organization_plan ?? "solo"
  };
}

function createSettings(overrides: Partial<AnalyticsSettings> = {}): AnalyticsSettings {
  return {
    enabled: false,
    privacy_mode: "strict",
    consent_required: false,
    capture_page_views: true,
    capture_route_changes: true,
    capture_actions: false,
    capture_friction_signals: true,
    journey_sample_rate: 0,
    raw_retention_days: 1,
    sample_retention_days: 7,
    aggregate_retention_months: 12,
    max_saved_funnels: 3,
    max_custom_dimensions: 0,
    approved_custom_dimensions: [],
    ...overrides
  };
}

function createDependencies(overrides: {
  auditLogging?: ApiDependencies["auditLogging"];
  analyticsSettingsManagement?: ApiDependencies["analyticsSettingsManagement"];
  projectAccess?: ReturnType<typeof createProjectAccess> | null;
} = {}): ReturnType<typeof createApiServer> {
  return createApiServer({
    ingestionPersistence: { persistAndEnqueue: vi.fn() },
    ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
    memberAuth: {
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
    projectManagement: {
      resolveProjectAccessForUser: vi.fn().mockResolvedValue(overrides.projectAccess ?? createProjectAccess()),
      listProjectsForOrganization: vi.fn().mockResolvedValue([]),
      createProjectForOrganization: vi.fn(),
      updateProjectForOrganization: vi.fn(),
      deleteProjectForOrganization: vi.fn()
    },
    analyticsSettingsManagement: overrides.analyticsSettingsManagement
  });
}

describe("analytics settings routes", () => {
  describe("GET /v1/projects/:id/analytics-settings", () => {
    it("returns disabled defaults when analytics settings storage is unavailable", async () => {
      const app = createDependencies();

      const response = await app.inject({
        method: "GET",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        access_mode: "manage",
        analytics_available: true,
        settings: createSettings()
      });
    });

    it("returns stored settings and preview access for members", async () => {
      const app = createDependencies({
        projectAccess: createProjectAccess({
          relationship: "shared",
          effective_role: "member",
          organization_plan: "team"
        }),
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn().mockResolvedValue(createSettings({
            enabled: true,
            privacy_mode: "standard",
            journey_sample_rate: 0.25
          })),
          updateAnalyticsSettingsForProject: vi.fn()
        }
      });

      const response = await app.inject({
        method: "GET",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        access_mode: "preview",
        analytics_available: true,
        settings: createSettings({
          enabled: true,
          privacy_mode: "standard",
          journey_sample_rate: 0.25
        })
      });
    });

    it("reports analytics as unavailable for Free projects", async () => {
      const app = createDependencies({
        projectAccess: createProjectAccess({ organization_plan: "free" }),
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn().mockResolvedValue(createSettings({ enabled: false })),
          updateAnalyticsSettingsForProject: vi.fn()
        }
      });

      const response = await app.inject({
        method: "GET",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().analytics_available).toBe(false);
    });

    it("rejects invalid project ids", async () => {
      const app = createDependencies();

      const response = await app.inject({
        method: "GET",
        url: "/v1/projects/not-a-uuid/analytics-settings",
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_project_id" });
    });
  });

  describe("PATCH /v1/projects/:id/analytics-settings", () => {
    it("updates analytics settings for owners and admins", async () => {
      const app = createDependencies({
        auditLogging: {
          createAuditLog: vi.fn().mockResolvedValue(undefined)
        },
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn(),
          updateAnalyticsSettingsForProject: vi.fn().mockResolvedValue(createSettings({
            enabled: true,
            privacy_mode: "standard",
            journey_sample_rate: 0.2
          }))
        }
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          enabled: true,
          privacy_mode: "standard",
          journey_sample_rate: 0.2
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        access_mode: "manage",
        analytics_available: true,
        settings: createSettings({
          enabled: true,
          privacy_mode: "standard",
          journey_sample_rate: 0.2
        })
      });
    });

    it("rejects project members, unavailable storage, Free plans, and invalid payloads", async () => {
      const memberApp = createDependencies({
        projectAccess: createProjectAccess({
          relationship: "shared",
          effective_role: "member",
          organization_plan: "team"
        }),
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn(),
          updateAnalyticsSettingsForProject: vi.fn()
        }
      });
      const unavailableApp = createDependencies();
      const freeApp = createDependencies({
        projectAccess: createProjectAccess({ organization_plan: "free" }),
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn(),
          updateAnalyticsSettingsForProject: vi.fn()
        }
      });
      const invalidApp = createDependencies({
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn(),
          updateAnalyticsSettingsForProject: vi.fn()
        }
      });

      const request = {
        method: "PATCH" as const,
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      };

      await expect(memberApp.inject({ ...request, payload: { enabled: true } })).resolves.toMatchObject({
        statusCode: 403
      });
      await expect(unavailableApp.inject({ ...request, payload: { enabled: true } })).resolves.toMatchObject({
        statusCode: 404
      });
      await expect(freeApp.inject({ ...request, payload: { enabled: true } })).resolves.toMatchObject({
        statusCode: 403
      });
      await expect(invalidApp.inject({ ...request, payload: {} })).resolves.toMatchObject({
        statusCode: 400
      });
      await expect(
        invalidApp.inject({
          ...request,
          payload: { max_custom_dimensions: 1, approved_custom_dimensions: ["role", "plan"] }
        })
      ).resolves.toMatchObject({ statusCode: 400 });
    });

    it("requires Team tier for custom dimensions", async () => {
      const soloApp = createDependencies({
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn(),
          updateAnalyticsSettingsForProject: vi.fn()
        }
      });
      const teamApp = createDependencies({
        projectAccess: createProjectAccess({ organization_plan: "team" }),
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn(),
          updateAnalyticsSettingsForProject: vi.fn().mockResolvedValue(createSettings({
            max_custom_dimensions: 2,
            approved_custom_dimensions: ["auth_state", "plan"]
          }))
        }
      });

      const soloResponse = await soloApp.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          max_custom_dimensions: 2,
          approved_custom_dimensions: ["auth_state", "plan"]
        }
      });
      const teamResponse = await teamApp.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          max_custom_dimensions: 2,
          approved_custom_dimensions: ["auth_state", "plan"]
        }
      });

      expect(soloResponse.statusCode).toBe(403);
      expect(teamResponse.statusCode).toBe(200);
    });

    it("rejects partial custom-dimension updates that would violate the existing limit", async () => {
      const updateAnalyticsSettingsForProject = vi.fn();
      const app = createDependencies({
        projectAccess: createProjectAccess({ organization_plan: "team" }),
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn().mockResolvedValue(createSettings({
            max_custom_dimensions: 2,
            approved_custom_dimensions: ["account_tier", "workspace_size"]
          })),
          updateAnalyticsSettingsForProject
        }
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          max_custom_dimensions: 1
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_payload" });
      expect(updateAnalyticsSettingsForProject).not.toHaveBeenCalled();
    });

    it("audits project-not-found update failures", async () => {
      const createAuditLog = vi.fn().mockResolvedValue(undefined);
      const app = createDependencies({
        auditLogging: { createAuditLog },
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn(),
          updateAnalyticsSettingsForProject: vi.fn().mockResolvedValue(null)
        }
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          enabled: true
        }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "project_not_found" });
      expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        action: "analytics_settings.update",
        status: "failure"
      }));
    });
  });
});
