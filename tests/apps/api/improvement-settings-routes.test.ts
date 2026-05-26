import { describe, expect, it, vi } from "vitest";

import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { createApiServer } from "../../../apps/api/src/server.js";

function createDependencies(overrides: {
  auditLogging?: ApiDependencies["auditLogging"];
  memberAuth?: ApiDependencies["memberAuth"];
  improvementSettingsManagement?: ApiDependencies["improvementSettingsManagement"];
  projectManagement?: ApiDependencies["projectManagement"];
  authRateLimiter?: ApiDependencies["authRateLimiter"];
} = {}): ReturnType<typeof createApiServer> {
  return createApiServer({
    ingestionPersistence: { persistAndEnqueue: vi.fn() },
    ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
    ...(overrides.authRateLimiter === undefined ? {} : { authRateLimiter: overrides.authRateLimiter }),
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
        organization_plan: "solo"
      }),
      listProjectsForOrganization: vi.fn().mockResolvedValue([]),
      createProjectForOrganization: vi.fn(),
      updateProjectForOrganization: vi.fn(),
      deleteProjectForOrganization: vi.fn()
    },
    improvementSettingsManagement: overrides.improvementSettingsManagement
  });
}

describe("improvement settings routes", () => {
  describe("GET /v1/projects/:id/improvement-settings", () => {
    it("returns default settings when project settings storage is unavailable", async () => {
      const app = createDependencies();

      const response = await app.inject({
        method: "GET",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvement-settings",
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        access_mode: "manage",
        cloud_automation_available: true,
        settings: {
          automated_improvement_bundles_enabled: true,
          improvement_bundle_sensitivity: "high_confidence"
        }
      });
    });

    it("returns project improvement settings for Solo projects", async () => {
      const app = createDependencies({
        improvementSettingsManagement: {
          getImprovementSettingsForProject: vi.fn().mockResolvedValue({
            automated_improvement_bundles_enabled: true,
            improvement_bundle_sensitivity: "balanced"
          }),
          updateImprovementSettingsForProject: vi.fn()
        }
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvement-settings",
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        access_mode: "manage",
        cloud_automation_available: true,
        settings: {
          automated_improvement_bundles_enabled: true,
          improvement_bundle_sensitivity: "balanced"
        }
      });
    });

    it("returns preview mode for project members", async () => {
      const app = createDependencies({
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
        improvementSettingsManagement: {
          getImprovementSettingsForProject: vi.fn().mockResolvedValue({
            automated_improvement_bundles_enabled: false,
            improvement_bundle_sensitivity: "high_confidence"
          }),
          updateImprovementSettingsForProject: vi.fn()
        }
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvement-settings",
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        access_mode: "preview",
        cloud_automation_available: true,
        settings: {
          automated_improvement_bundles_enabled: false,
          improvement_bundle_sensitivity: "high_confidence"
        }
      });
    });

    it("reports cloud automation as unavailable for Free projects", async () => {
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
          listProjectsForOrganization: vi.fn().mockResolvedValue([]),
          createProjectForOrganization: vi.fn(),
          updateProjectForOrganization: vi.fn(),
          deleteProjectForOrganization: vi.fn()
        },
        improvementSettingsManagement: {
          getImprovementSettingsForProject: vi.fn().mockResolvedValue({
            automated_improvement_bundles_enabled: true,
            improvement_bundle_sensitivity: "balanced"
          }),
          updateImprovementSettingsForProject: vi.fn()
        }
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvement-settings",
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        access_mode: "manage",
        cloud_automation_available: false,
        settings: {
          automated_improvement_bundles_enabled: true,
          improvement_bundle_sensitivity: "balanced"
        }
      });
    });

    it("rejects invalid project ids", async () => {
      const app = createDependencies();

      const response = await app.inject({
        method: "GET",
        url: "/v1/projects/not-a-uuid/improvement-settings",
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_project_id" });
    });
  });

  describe("PATCH /v1/projects/:id/improvement-settings", () => {
    it("updates improvement settings for owners and admins", async () => {
      const app = createDependencies({
        auditLogging: {
          createAuditLog: vi.fn().mockResolvedValue(undefined)
        },
        improvementSettingsManagement: {
          getImprovementSettingsForProject: vi.fn(),
          updateImprovementSettingsForProject: vi.fn().mockResolvedValue({
            automated_improvement_bundles_enabled: false,
            improvement_bundle_sensitivity: "verbose"
          })
        }
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvement-settings",
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          automated_improvement_bundles_enabled: false,
          improvement_bundle_sensitivity: "verbose"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        access_mode: "manage",
        cloud_automation_available: true,
        settings: {
          automated_improvement_bundles_enabled: false,
          improvement_bundle_sensitivity: "verbose"
        }
      });
    });

    it("rejects project members from updating improvement settings", async () => {
      const app = createDependencies({
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
        improvementSettingsManagement: {
          getImprovementSettingsForProject: vi.fn(),
          updateImprovementSettingsForProject: vi.fn()
        }
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvement-settings",
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          automated_improvement_bundles_enabled: false
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "forbidden" });
    });

    it("returns improvement_settings_not_available when the settings surface is disabled", async () => {
      const app = createDependencies();

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvement-settings",
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          automated_improvement_bundles_enabled: false
        }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "improvement_settings_not_available" });
    });

    it("returns upgrade_required for Free-tier projects", async () => {
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
          listProjectsForOrganization: vi.fn().mockResolvedValue([]),
          createProjectForOrganization: vi.fn(),
          updateProjectForOrganization: vi.fn(),
          deleteProjectForOrganization: vi.fn()
        },
        improvementSettingsManagement: {
          getImprovementSettingsForProject: vi.fn(),
          updateImprovementSettingsForProject: vi.fn()
        }
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvement-settings",
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          automated_improvement_bundles_enabled: false
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "upgrade_required" });
    });

    it("rejects empty update payloads", async () => {
      const app = createDependencies({
        improvementSettingsManagement: {
          getImprovementSettingsForProject: vi.fn(),
          updateImprovementSettingsForProject: vi.fn()
        }
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvement-settings",
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {}
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_payload" });
    });

    it("returns project_not_found when the backing store cannot update the project", async () => {
      const createAuditLog = vi.fn().mockResolvedValue(undefined);
      const app = createDependencies({
        auditLogging: {
          createAuditLog
        },
        improvementSettingsManagement: {
          getImprovementSettingsForProject: vi.fn(),
          updateImprovementSettingsForProject: vi.fn().mockResolvedValue(null)
        }
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/projects/00000000-0000-0000-0000-000000000001/improvement-settings",
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          automated_improvement_bundles_enabled: false
        }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "project_not_found" });
      expect(createAuditLog).toHaveBeenCalledOnce();
    });
  });
});
