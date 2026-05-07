import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;
type WeeklyReportManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["weeklyReportManagement"]>>;

function createServer(overrides: {
  memberAuth?: MemberAuthDependency | undefined;
  weeklyReportManagement?: WeeklyReportManagementDependency | undefined;
  authRateLimiter?: ApiServerDependencies["authRateLimiter"];
} = {}): ReturnType<typeof createApiServer> {
  const hasWeeklyReportManagementOverride = Object.prototype.hasOwnProperty.call(overrides, "weeklyReportManagement");

  return createApiServer({
    ingestionPersistence: {
      persistAndEnqueue: vi.fn()
    },
    ...(overrides.authRateLimiter === undefined
      ? {}
      : { authRateLimiter: overrides.authRateLimiter }),
    ingestionMetadata: {
      resolveProjectByTokenHash: vi.fn()
    },
    memberAuth:
      overrides.memberAuth ?? mockedObject<ApiServerDependencies["memberAuth"]>({
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
    weeklyReportManagement:
      hasWeeklyReportManagementOverride
        ? overrides.weeklyReportManagement
        :
      mockedObject<NonNullable<ApiServerDependencies["weeklyReportManagement"]>>({
        listWeeklyReportChannelsForOrganization: vi.fn().mockResolvedValue([]),
        createWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null),
        updateWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null),
        deleteWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null)
      })
  });
}

describe("api weekly report channel routes", () => {
  it("rejects unauthenticated requests and missing weekly report dependencies", async (): Promise<void> => {
    const unauthenticatedApp = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
      }
    });
    const missingDepsApp = createServer({ weeklyReportManagement: undefined });

    const unauthenticated = await unauthenticatedApp.inject({
      method: "GET",
      url: "/v1/weekly-report-channels?project_id=00000000-0000-4000-8000-000000000001"
    });
    const missingDeps = await missingDepsApp.inject({
      method: "GET",
      url: "/v1/weekly-report-channels?project_id=00000000-0000-4000-8000-000000000001",
      headers: { authorization: "Bearer dbundle_mem_test" }
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json()).toEqual({ error: "invalid_member_token" });
    expect(missingDeps.statusCode).toBe(404);
    expect(missingDeps.json()).toEqual({ error: "project_not_found" });
  });

  it("lists weekly report channels scoped to member organization", async (): Promise<void> => {
    const weeklyReportManagement = {
      listWeeklyReportChannelsForOrganization: vi.fn().mockResolvedValue([
        {
          channel_id: "wr_1",
          project_id: "00000000-0000-4000-8000-000000000001",
          channel: "email",
          config: { to: ["team@example.com"] },
          schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z"
        }
      ]),
      createWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null),
      updateWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null),
      deleteWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ weeklyReportManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/weekly-report-channels?project_id=00000000-0000-4000-8000-000000000001&limit=10",
      headers: { authorization: "Bearer dbundle_mem_test" }
    });

    expect(response.statusCode).toBe(200);
    expect(weeklyReportManagement.listWeeklyReportChannelsForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "00000000-0000-4000-8000-000000000001",
      limit: 10
    });
  });

  it("validates list query and returns project_not_found when the project is out of scope", async (): Promise<void> => {
    const weeklyReportManagement = {
      listWeeklyReportChannelsForOrganization: vi.fn().mockResolvedValue(null),
      createWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null),
      updateWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null),
      deleteWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ weeklyReportManagement });

    const invalid = await app.inject({
      method: "GET",
      url: "/v1/weekly-report-channels?project_id=not-a-uuid",
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    const notFound = await app.inject({
      method: "GET",
      url: "/v1/weekly-report-channels?project_id=00000000-0000-4000-8000-000000000001",
      headers: { authorization: "Bearer dbundle_mem_test" }
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: "invalid_query" });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toEqual({ error: "project_not_found" });
  });

  it("creates, validates, updates, and deletes weekly report channels", async (): Promise<void> => {
    const weeklyReportManagement = {
      listWeeklyReportChannelsForOrganization: vi.fn().mockResolvedValue([]),
      createWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue({
        channel_id: "wr_1",
        project_id: "00000000-0000-4000-8000-000000000001",
        channel: "slack",
        config: { webhook_url: "https://hooks.slack.com/services/T000/B000/xyz" },
        schedule: { day_of_week: "monday", hour_of_day: 10, timezone: "UTC" },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }),
      updateWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue({
        channel_id: "wr_1",
        project_id: "00000000-0000-4000-8000-000000000001",
        channel: "slack",
        config: { webhook_url: "https://hooks.slack.com/services/T000/B000/xyz" },
        schedule: { day_of_week: "tuesday", hour_of_day: 11, timezone: "UTC" },
        is_enabled: false,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T01:00:00.000Z"
      }),
      deleteWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue({ channel_id: "wr_1" })
    };
    const app = createServer({ weeklyReportManagement });

    const invalid = await app.inject({
      method: "POST",
      url: "/v1/weekly-report-channels",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        project_id: "00000000-0000-4000-8000-000000000001",
        channel: "email",
        config: { webhook_url: "https://hooks.slack.com/services/T000/B000/xyz" },
        schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" }
      }
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/weekly-report-channels",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        project_id: "00000000-0000-4000-8000-000000000001",
        channel: "slack",
        config: { webhook_url: "https://hooks.slack.com/services/T000/B000/xyz" },
        schedule: { day_of_week: "monday", hour_of_day: 10, timezone: "UTC" }
      }
    });
    const updated = await app.inject({
      method: "PATCH",
      url: "/v1/weekly-report-channels/wr_1",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        schedule: { day_of_week: "tuesday", hour_of_day: 11, timezone: "UTC" },
        is_enabled: false
      }
    });
    const deleted = await app.inject({
      method: "DELETE",
      url: "/v1/weekly-report-channels/wr_1",
      headers: { authorization: "Bearer dbundle_mem_test" }
    });

    expect(invalid.statusCode).toBe(400);
    expect(created.statusCode).toBe(201);
    expect(updated.statusCode).toBe(200);
    expect(deleted.statusCode).toBe(204);
  });

  it("validates params, payloads, and not-found branches for update/delete", async (): Promise<void> => {
    const weeklyReportManagement = {
      listWeeklyReportChannelsForOrganization: vi.fn().mockResolvedValue([]),
      createWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null),
      updateWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null),
      deleteWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ weeklyReportManagement });

    const invalidUpdatePayload = await app.inject({
      method: "PATCH",
      url: "/v1/weekly-report-channels/11111111-1111-4111-8111-111111111111",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {}
    });
    const missingUpdateTarget = await app.inject({
      method: "PATCH",
      url: "/v1/weekly-report-channels/11111111-1111-4111-8111-111111111111",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        is_enabled: false
      }
    });
    const missingDeleteTarget = await app.inject({
      method: "DELETE",
      url: "/v1/weekly-report-channels/11111111-1111-4111-8111-111111111111",
      headers: { authorization: "Bearer dbundle_mem_test" }
    });

    expect(invalidUpdatePayload.statusCode).toBe(400);
    expect(invalidUpdatePayload.json()).toEqual({ error: "invalid_payload" });
    expect(missingUpdateTarget.statusCode).toBe(404);
    expect(missingUpdateTarget.json()).toEqual({ error: "weekly_report_channel_not_found" });
    expect(missingDeleteTarget.statusCode).toBe(404);
    expect(missingDeleteTarget.json()).toEqual({ error: "weekly_report_channel_not_found" });
  });

  it("forwards optional update fields when provided", async (): Promise<void> => {
    const weeklyReportManagement = {
      listWeeklyReportChannelsForOrganization: vi.fn().mockResolvedValue([]),
      createWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null),
      updateWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue({
        channel_id: "11111111-1111-4111-8111-111111111111",
        project_id: "00000000-0000-4000-8000-000000000001",
        channel: "email",
        config: { to: ["team@example.com"] },
        schedule: { day_of_week: "friday", hour_of_day: 15, timezone: "UTC" },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T01:00:00.000Z"
      }),
      deleteWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ weeklyReportManagement });

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/weekly-report-channels/11111111-1111-4111-8111-111111111111",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        config: { to: ["team@example.com"] },
        schedule: { day_of_week: "friday", hour_of_day: 15, timezone: "UTC" },
        is_enabled: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(weeklyReportManagement.updateWeeklyReportChannelForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      channel_id: "11111111-1111-4111-8111-111111111111",
      config: { to: ["team@example.com"] },
      schedule: { day_of_week: "friday", hour_of_day: 15, timezone: "UTC" },
      is_enabled: true
    });
  });

  it("returns weekly_report_channel_not_found when patch/delete routes are mounted without weekly report management", async (): Promise<void> => {
    const app = createServer({ weeklyReportManagement: undefined });

    const updated = await app.inject({
      method: "PATCH",
      url: "/v1/weekly-report-channels/channel_123",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: { is_enabled: false }
    });
    const deleted = await app.inject({
      method: "DELETE",
      url: "/v1/weekly-report-channels/channel_123",
      headers: { authorization: "Bearer dbundle_mem_test" }
    });

    expect(updated.statusCode).toBe(404);
    expect(updated.json()).toEqual({ error: "weekly_report_channel_not_found" });
    expect(deleted.statusCode).toBe(404);
    expect(deleted.json()).toEqual({ error: "weekly_report_channel_not_found" });
  });

  it("returns project_not_found when create route is mounted without weekly report management", async (): Promise<void> => {
    const app = createServer({ weeklyReportManagement: undefined });

    const created = await app.inject({
      method: "POST",
      url: "/v1/weekly-report-channels",
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: {
        project_id: "00000000-0000-4000-8000-000000000001",
        channel: "email",
        config: { to: ["team@example.com"] },
        schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" }
      }
    });

    expect(created.statusCode).toBe(404);
    expect(created.json()).toEqual({ error: "project_not_found" });
  });

  it("should rate limit weekly report channel reads per member", async (): Promise<void> => {
    const claimRequest = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 100,
      remaining: 0,
      retry_after_ms: 12_000
    });
    const app = createServer({ authRateLimiter: { claimRequest } });

    const response = await app.inject({
      method: "GET",
      url: "/v1/weekly-report-channels",
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
});