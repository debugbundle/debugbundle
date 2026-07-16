import { afterEach, describe, expect, it, vi } from "vitest";

import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { createApiServer } from "../../../apps/api/src/server.js";
import type { AnalyticsSettings } from "../../../packages/shared-types/src/index.js";

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";

afterEach(() => {
  vi.unstubAllEnvs();
});

function createProjectAccess(
  overrides: Partial<{
    effective_role: "owner" | "admin" | "member";
    organization_plan: "free" | "solo" | "team";
    relationship: "owned" | "shared";
  }> = {}
) {
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
    hourly_retention_days: 30,
    aggregate_retention_months: 12,
    max_saved_funnels: 10,
    max_custom_dimensions: 3,
    approved_custom_dimensions: [],
    ...overrides
  };
}

function createDependencies(
  overrides: {
    auditLogging?: ApiDependencies["auditLogging"];
    analyticsSettingsManagement?: ApiDependencies["analyticsSettingsManagement"];
    projectAccess?: ReturnType<typeof createProjectAccess> | null;
  } = {}
): ReturnType<typeof createApiServer> {
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
      resolveProjectAccessForUser: vi
        .fn()
        .mockResolvedValue(overrides.projectAccess ?? createProjectAccess()),
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

    it("derives unavailable-storage analytics limits from the current tier", async () => {
      const teamApp = createDependencies({
        projectAccess: createProjectAccess({ organization_plan: "team" })
      });
      const freeApp = createDependencies({
        projectAccess: createProjectAccess({ organization_plan: "free" })
      });
      const request = {
        method: "GET" as const,
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      };

      const teamResponse = await teamApp.inject(request);
      const freeResponse = await freeApp.inject(request);

      expect(teamResponse.json().settings.max_saved_funnels).toBe(50);
      expect(teamResponse.json().settings.max_custom_dimensions).toBe(8);
      expect(teamResponse.json().settings.hourly_retention_days).toBe(90);
      expect(freeResponse.json().settings.max_saved_funnels).toBe(1);
      expect(freeResponse.json().settings.max_custom_dimensions).toBe(1);
      expect(freeResponse.json().settings.hourly_retention_days).toBe(7);
    });

    it("returns stored settings and preview access for members", async () => {
      const app = createDependencies({
        projectAccess: createProjectAccess({
          relationship: "shared",
          effective_role: "member",
          organization_plan: "team"
        }),
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn().mockResolvedValue(
            createSettings({
              enabled: true,
              privacy_mode: "standard",
              journey_sample_rate: 0.25
            })
          ),
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

    it("reports analytics as available for Free projects", async () => {
      const app = createDependencies({
        projectAccess: createProjectAccess({ organization_plan: "free" }),
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn().mockResolvedValue(
            createSettings({
              enabled: false,
              max_saved_funnels: 1,
              max_custom_dimensions: 1
            })
          ),
          updateAnalyticsSettingsForProject: vi.fn()
        }
      });

      const response = await app.inject({
        method: "GET",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().analytics_available).toBe(true);
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
          updateAnalyticsSettingsForProject: vi.fn().mockResolvedValue(
            createSettings({
              enabled: true,
              privacy_mode: "standard",
              journey_sample_rate: 0.2
            })
          )
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

    it("rejects project members, unavailable storage, and invalid payloads", async () => {
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

      await expect(
        memberApp.inject({ ...request, payload: { enabled: true } })
      ).resolves.toMatchObject({
        statusCode: 403
      });
      await expect(
        unavailableApp.inject({ ...request, payload: { enabled: true } })
      ).resolves.toMatchObject({
        statusCode: 404
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

    it("allows Free owners to enable analytics within the preview limits", async () => {
      const updateAnalyticsSettingsForProject = vi
        .fn()
        .mockResolvedValue(createSettings({ enabled: true, max_saved_funnels: 1 }));
      const app = createDependencies({
        projectAccess: createProjectAccess({ organization_plan: "free" }),
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn(),
          updateAnalyticsSettingsForProject
        }
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: { enabled: true, max_saved_funnels: 1 }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        analytics_available: true,
        settings: { enabled: true, max_saved_funnels: 1 }
      });
      expect(updateAnalyticsSettingsForProject).toHaveBeenCalledOnce();
    });

    it("allows controlled custom dimensions within each hosted tier limit", async () => {
      const freeApp = createDependencies({
        projectAccess: createProjectAccess({ organization_plan: "free" }),
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn(),
          updateAnalyticsSettingsForProject: vi.fn().mockResolvedValue(
            createSettings({
              max_saved_funnels: 1,
              max_custom_dimensions: 1,
              approved_custom_dimensions: ["account_tier"]
            })
          )
        }
      });
      const soloApp = createDependencies({
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn(),
          updateAnalyticsSettingsForProject: vi.fn().mockResolvedValue(
            createSettings({
              max_custom_dimensions: 2,
              approved_custom_dimensions: ["account_type", "plan"]
            })
          )
        }
      });
      const teamApp = createDependencies({
        projectAccess: createProjectAccess({ organization_plan: "team" }),
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn(),
          updateAnalyticsSettingsForProject: vi.fn().mockResolvedValue(
            createSettings({
              max_custom_dimensions: 2,
              approved_custom_dimensions: ["account_type", "plan"]
            })
          )
        }
      });

      const freeResponse = await freeApp.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          max_custom_dimensions: 1,
          approved_custom_dimensions: ["account_tier"]
        }
      });
      const soloResponse = await soloApp.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          max_custom_dimensions: 2,
          approved_custom_dimensions: ["account_type", "plan"]
        }
      });
      const teamResponse = await teamApp.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          max_custom_dimensions: 2,
          approved_custom_dimensions: ["account_type", "plan"]
        }
      });

      expect(freeResponse.statusCode).toBe(200);
      expect(soloResponse.statusCode).toBe(200);
      expect(teamResponse.statusCode).toBe(200);
    });

    it("uses self-host capabilities for custom dimensions", async () => {
      vi.stubEnv("SELFHOST_MODE", "true");
      const updateAnalyticsSettingsForProject = vi.fn().mockResolvedValue(
        createSettings({
          hourly_retention_days: 365,
          max_saved_funnels: 100,
          max_custom_dimensions: 20,
          approved_custom_dimensions: ["deployment_ring"]
        })
      );
      const app = createDependencies({
        projectAccess: createProjectAccess({ organization_plan: "free" }),
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn(),
          updateAnalyticsSettingsForProject
        }
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          hourly_retention_days: 365,
          max_custom_dimensions: 20,
          approved_custom_dimensions: ["deployment_ring"]
        }
      });

      expect(response.statusCode).toBe(200);
      expect(updateAnalyticsSettingsForProject).toHaveBeenCalledOnce();
    });

    it("enforces saved-funnel, custom-dimension, and hourly-retention tier limits", async () => {
      const freeUpdate = vi.fn();
      const freeApp = createDependencies({
        projectAccess: createProjectAccess({ organization_plan: "free" }),
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn(),
          updateAnalyticsSettingsForProject: freeUpdate
        }
      });
      const soloUpdate = vi.fn();
      const soloApp = createDependencies({
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn(),
          updateAnalyticsSettingsForProject: soloUpdate
        }
      });
      const teamUpdate = vi.fn();
      const teamApp = createDependencies({
        projectAccess: createProjectAccess({ organization_plan: "team" }),
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn(),
          updateAnalyticsSettingsForProject: teamUpdate
        }
      });

      const freeResponse = await freeApp.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          max_saved_funnels: 2
        }
      });
      const soloResponse = await soloApp.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          max_saved_funnels: 11
        }
      });
      const freeCustomDimensionResponse = await freeApp.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          max_custom_dimensions: 2
        }
      });
      const soloCustomDimensionResponse = await soloApp.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          max_custom_dimensions: 4
        }
      });
      const teamCustomDimensionResponse = await teamApp.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          max_custom_dimensions: 9
        }
      });
      const teamApprovedDimensionsResponse = await teamApp.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          approved_custom_dimensions: [
            "dimension_1",
            "dimension_2",
            "dimension_3",
            "dimension_4",
            "dimension_5",
            "dimension_6",
            "dimension_7",
            "dimension_8",
            "dimension_9"
          ]
        }
      });
      const freeHourlyRetentionResponse = await freeApp.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: { hourly_retention_days: 8 }
      });
      const soloHourlyRetentionResponse = await soloApp.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: { hourly_retention_days: 31 }
      });
      const teamHourlyRetentionResponse = await teamApp.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: { hourly_retention_days: 91 }
      });

      expect(freeResponse.statusCode).toBe(403);
      expect(freeResponse.json()).toEqual({ error: "upgrade_required" });
      expect(freeCustomDimensionResponse.statusCode).toBe(403);
      expect(freeCustomDimensionResponse.json()).toEqual({ error: "upgrade_required" });
      expect(soloResponse.statusCode).toBe(403);
      expect(soloResponse.json()).toEqual({ error: "upgrade_required" });
      expect(soloCustomDimensionResponse.statusCode).toBe(403);
      expect(soloCustomDimensionResponse.json()).toEqual({ error: "upgrade_required" });
      expect(teamCustomDimensionResponse.statusCode).toBe(403);
      expect(teamCustomDimensionResponse.json()).toEqual({ error: "upgrade_required" });
      expect(teamApprovedDimensionsResponse.statusCode).toBe(403);
      expect(teamApprovedDimensionsResponse.json()).toEqual({ error: "upgrade_required" });
      expect(freeHourlyRetentionResponse.statusCode).toBe(403);
      expect(soloHourlyRetentionResponse.statusCode).toBe(403);
      expect(teamHourlyRetentionResponse.statusCode).toBe(403);
      expect(freeUpdate).not.toHaveBeenCalled();
      expect(soloUpdate).not.toHaveBeenCalled();
      expect(teamUpdate).not.toHaveBeenCalled();
    });

    it("rejects partial custom-dimension updates that would violate the existing limit", async () => {
      const updateAnalyticsSettingsForProject = vi.fn();
      const app = createDependencies({
        projectAccess: createProjectAccess({ organization_plan: "team" }),
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn().mockResolvedValue(
            createSettings({
              max_custom_dimensions: 2,
              approved_custom_dimensions: ["account_tier", "workspace_size"]
            })
          ),
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

    it("rejects partial custom-dimension updates when stored settings exceed the current tier", async () => {
      const updateAnalyticsSettingsForProject = vi.fn();
      const app = createDependencies({
        projectAccess: createProjectAccess({ organization_plan: "free" }),
        analyticsSettingsManagement: {
          getAnalyticsSettingsForProject: vi.fn().mockResolvedValue(
            createSettings({
              max_saved_funnels: 1,
              max_custom_dimensions: 8,
              approved_custom_dimensions: ["account_tier"]
            })
          ),
          updateAnalyticsSettingsForProject
        }
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/v1/projects/${PROJECT_ID}/analytics-settings`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: {
          approved_custom_dimensions: ["account_tier"]
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "upgrade_required" });
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
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "analytics_settings.update",
          status: "failure"
        })
      );
    });
  });
});
