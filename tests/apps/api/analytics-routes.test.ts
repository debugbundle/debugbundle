import { describe, expect, it, vi } from "vitest";

import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { createApiServer } from "../../../apps/api/src/server.js";
import type { AnalyticsUsageSummaryResponse } from "../../../packages/shared-types/src/index.js";

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";
const FROM = "2026-03-01T00:00:00.000Z";
const TO = "2026-03-08T00:00:00.000Z";

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

function createSummary(): AnalyticsUsageSummaryResponse {
  return {
    summary: {
      project_id: PROJECT_ID,
      from: FROM,
      to: TO,
      granularity: "day",
      service: null,
      environment: "production",
      sessions: 12,
      pageviews: 30,
      active_visitors: 0,
      new_visitors: 0,
      returning_visitors: 0,
      exits: 2,
      conversions: 5
    },
    breakdowns: {
      device_types: [{ value: "desktop", sessions: 9, pageviews: 20 }],
      browsers: [],
      os: [],
      languages: [],
      referrers: [],
      auth_states: []
    }
  };
}

function createDependencies(overrides: {
  analyticsMetrics?: ApiDependencies["analyticsMetrics"];
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
    projectManagement: {
      resolveProjectAccessForUser: vi.fn().mockResolvedValue(overrides.projectAccess ?? createProjectAccess()),
      listProjectsForOrganization: vi.fn().mockResolvedValue([]),
      createProjectForOrganization: vi.fn(),
      updateProjectForOrganization: vi.fn(),
      deleteProjectForOrganization: vi.fn()
    },
    analyticsMetrics: overrides.analyticsMetrics
  });
}

describe("analytics metrics routes", () => {
  it("returns project analytics summary through member-token project access", async () => {
    const getUsageSummaryForProject = vi.fn().mockResolvedValue(createSummary());
    const app = createDependencies({
      analyticsMetrics: { getUsageSummaryForProject }
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/summary?project_id=${PROJECT_ID}&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}&granularity=day&environment=production&limit=5`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(createSummary());
    expect(getUsageSummaryForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID,
      from: FROM,
      to: TO,
      granularity: "day",
      service: undefined,
      environment: "production",
      limit: 5
    });
  });

  it("rejects invalid queries, Free projects, and unavailable metrics storage", async () => {
    const invalidQuery = await createDependencies({
      analyticsMetrics: { getUsageSummaryForProject: vi.fn() }
    }).inject({
      method: "GET",
      url: "/v1/analytics/summary?project_id=not-a-uuid",
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const freeProject = await createDependencies({
      projectAccess: createProjectAccess({ organization_plan: "free" }),
      analyticsMetrics: { getUsageSummaryForProject: vi.fn() }
    }).inject({
      method: "GET",
      url: `/v1/analytics/summary?project_id=${PROJECT_ID}&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const unavailable = await createDependencies().inject({
      method: "GET",
      url: `/v1/analytics/summary?project_id=${PROJECT_ID}&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(invalidQuery.statusCode).toBe(400);
    expect(invalidQuery.json()).toEqual({ error: "invalid_query" });
    expect(freeProject.statusCode).toBe(403);
    expect(freeProject.json()).toEqual({ error: "upgrade_required" });
    expect(unavailable.statusCode).toBe(404);
    expect(unavailable.json()).toEqual({ error: "analytics_metrics_not_available" });
  });
});
