import { describe, expect, it, vi } from "vitest";

import { createPostgresWeeklyReportChannelStore } from "../../../packages/storage/src/index.js";

describe("weekly report channel store", () => {
  it("lists weekly report channels scoped to organization and project", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          channel_id: "wr_1",
          project_id: "proj_123",
          channel: "email",
          config: { to: ["team@example.com"] },
          schedule_day_of_week: "monday",
          schedule_hour_of_day: 9,
          schedule_timezone: "UTC",
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z"
        }
      ]
    });

    const store = createPostgresWeeklyReportChannelStore({ query });
    const channels = await store.listWeeklyReportChannelsForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 20
    });

    expect(channels).toEqual([
      {
        channel_id: "wr_1",
        project_id: "proj_123",
        channel: "email",
        config: { to: ["team@example.com"] },
        schedule: {
          day_of_week: "monday",
          hour_of_day: 9,
          timezone: "UTC"
        },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }
    ]);
  });

  it("creates, updates, deletes, and loads scheduler-visible weekly report channels", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            channel_id: "wr_1",
            project_id: "proj_123",
            channel: "slack",
            config: { webhook_url: "https://hooks.slack.com/services/T000/B000/xyz" },
            schedule_day_of_week: "monday",
            schedule_hour_of_day: 10,
            schedule_timezone: "America/Los_Angeles",
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            channel_id: "wr_1",
            project_id: "proj_123",
            channel: "slack",
            config: { webhook_url: "https://hooks.slack.com/services/T000/B000/xyz" },
            schedule_day_of_week: "tuesday",
            schedule_hour_of_day: 11,
            schedule_timezone: "UTC",
            is_enabled: false,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T01:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ channel_id: "wr_1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            channel_id: "wr_2",
            project_id: "proj_123",
            channel: "email",
            config: { to: ["team@example.com"] },
            schedule_day_of_week: "monday",
            schedule_hour_of_day: 9,
            schedule_timezone: "UTC",
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            channel_id: "wr_2",
            project_id: "proj_123",
            channel: "email",
            config: { to: ["team@example.com"] },
            schedule_day_of_week: "monday",
            schedule_hour_of_day: 9,
            schedule_timezone: "UTC",
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]
      });

    const store = createPostgresWeeklyReportChannelStore({ query });

    const created = await store.createWeeklyReportChannelForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      channel: "slack",
      config: { webhook_url: "https://hooks.slack.com/services/T000/B000/xyz" },
      schedule: {
        day_of_week: "monday",
        hour_of_day: 10,
        timezone: "America/Los_Angeles"
      },
      is_enabled: true
    });
    const updated = await store.updateWeeklyReportChannelForOrganization({
      organization_id: "org_123",
      channel_id: "wr_1",
      schedule: {
        day_of_week: "tuesday",
        hour_of_day: 11,
        timezone: "UTC"
      },
      is_enabled: false
    });
    const deleted = await store.deleteWeeklyReportChannelForOrganization({
      organization_id: "org_123",
      channel_id: "wr_1"
    });
    const schedulerChannels = await store.listEnabledWeeklyReportChannels({ limit: 50 });
    const loaded = await store.getWeeklyReportChannelById({ channel_id: "wr_2" });

    expect(created?.channel_id).toBe("wr_1");
    expect(updated?.schedule).toEqual({ day_of_week: "tuesday", hour_of_day: 11, timezone: "UTC" });
    expect(deleted).toEqual({ channel_id: "wr_1" });
    expect(schedulerChannels).toHaveLength(1);
    expect(loaded?.channel).toBe("email");
  });

  it("returns null branches for missing project, empty updates, deletes, and missing channel loads", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const store = createPostgresWeeklyReportChannelStore({ query });

    const missingList = await store.listWeeklyReportChannelsForOrganization({
      organization_id: "org_123",
      project_id: "proj_missing",
      limit: 20
    });
    const missingCreate = await store.createWeeklyReportChannelForOrganization({
      organization_id: "org_123",
      project_id: "proj_missing",
      channel: "email",
      config: { to: ["team@example.com"] },
      schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
      is_enabled: true
    });
    const emptyUpdate = await store.updateWeeklyReportChannelForOrganization({
      organization_id: "org_123",
      channel_id: "wr_missing"
    });
    const missingDelete = await store.deleteWeeklyReportChannelForOrganization({
      organization_id: "org_123",
      channel_id: "wr_missing"
    });
    const missingLoad = await store.getWeeklyReportChannelById({ channel_id: "wr_missing" });

    expect(missingList).toBeNull();
    expect(missingCreate).toBeNull();
    expect(emptyUpdate).toBeNull();
    expect(missingDelete).toBeNull();
    expect(missingLoad).toBeNull();
  });

  it("updates config-only changes", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          channel_id: "wr_3",
          project_id: "proj_123",
          channel: "email",
          config: { to: ["ops@example.com"] },
          schedule_day_of_week: "monday",
          schedule_hour_of_day: 9,
          schedule_timezone: "UTC",
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T02:00:00.000Z"
        }
      ]
    });
    const store = createPostgresWeeklyReportChannelStore({ query });

    const updated = await store.updateWeeklyReportChannelForOrganization({
      organization_id: "org_123",
      channel_id: "wr_3",
      config: { to: ["ops@example.com"] }
    });

    expect(updated?.config).toEqual({ to: ["ops@example.com"] });
  });
});