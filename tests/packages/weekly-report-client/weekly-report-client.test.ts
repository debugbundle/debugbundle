import { describe, expect, it, vi } from "vitest";

import { WeeklyReportApiError, createWeeklyReportApi } from "../../../packages/weekly-report-client/src/index.js";

describe("weekly report client", () => {
  it("builds list/create/update/delete requests", async (): Promise<void> => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          channels: [
            {
              channel_id: "wr_1",
              project_id: "proj_1",
              channel: "email",
              config: { to: ["team@example.com"] },
              schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
              is_enabled: true,
              created_at: "2026-03-15T00:00:00.000Z",
              updated_at: "2026-03-15T00:00:00.000Z"
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        status: 201,
        body: {
          channel: {
            channel_id: "wr_1",
            project_id: "proj_1",
            channel: "slack",
            config: { webhook_url: "https://hooks.slack.com/services/T/B/x" },
            schedule: { day_of_week: "monday", hour_of_day: 10, timezone: "UTC" },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          channel: {
            channel_id: "wr_1",
            project_id: "proj_1",
            channel: "slack",
            config: { webhook_url: "https://hooks.slack.com/services/T/B/x" },
            schedule: { day_of_week: "tuesday", hour_of_day: 11, timezone: "UTC" },
            is_enabled: false,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T01:00:00.000Z"
          }
        }
      })
      .mockResolvedValueOnce({ status: 204, body: null });

    const api = createWeeklyReportApi({ request });

    await api.listWeeklyReportChannels({ bearerToken: "dbundle_mem_x", projectId: "proj_1", limit: 5 });
    await api.createWeeklyReportChannel({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      channel: "slack",
      config: { webhookUrl: "https://hooks.slack.com/services/T/B/x" },
      schedule: { dayOfWeek: "monday", hourOfDay: 10, timezone: "UTC" }
    });
    await api.updateWeeklyReportChannel({
      bearerToken: "dbundle_mem_x",
      channelId: "wr_1",
      schedule: { dayOfWeek: "tuesday", hourOfDay: 11, timezone: "UTC" },
      isEnabled: false
    });
    await api.deleteWeeklyReportChannel({ bearerToken: "dbundle_mem_x", channelId: "wr_1" });

    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ method: "GET", path: "/v1/weekly-report-channels?project_id=proj_1&limit=5" })
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ method: "POST", path: "/v1/weekly-report-channels" })
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ method: "PATCH", path: "/v1/weekly-report-channels/wr_1" })
    );
    expect(request).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ method: "DELETE", path: "/v1/weekly-report-channels/wr_1" })
    );
  });

  it("maps api errors", async (): Promise<void> => {
    const api = createWeeklyReportApi({
      request: vi.fn().mockResolvedValue({ status: 401, body: { error: "invalid_member_token" } })
    });

    await expect(api.listWeeklyReportChannels({ bearerToken: "dbundle_mem_x", projectId: "proj_1" })).rejects.toBeInstanceOf(
      WeeklyReportApiError
    );
  });

  it("covers empty query, email create body, invalid shapes, and delete failures", async (): Promise<void> => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          channels: []
        }
      })
      .mockResolvedValueOnce({
        status: 201,
        body: {
          channel: {
            channel_id: "wr_email",
            project_id: "proj_1",
            channel: "email",
            config: { to: ["team@example.com"] },
            schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
            is_enabled: false,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        }
      })
      .mockResolvedValueOnce({ status: 200, body: { channel: { invalid: true } } })
      .mockResolvedValueOnce({ status: 500, body: { unexpected: true } });

    const api = createWeeklyReportApi({ request });

    await expect(api.listWeeklyReportChannels({ bearerToken: "dbundle_mem_x", projectId: "proj_1" })).resolves.toEqual([]);
    await expect(
      api.createWeeklyReportChannel({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        channel: "email",
        config: { to: ["team@example.com"] },
        schedule: { dayOfWeek: "monday", hourOfDay: 9, timezone: "UTC" },
        isEnabled: false
      })
    ).resolves.toMatchObject({ channel_id: "wr_email", is_enabled: false });
    await expect(
      api.updateWeeklyReportChannel({
        bearerToken: "dbundle_mem_x",
        channelId: "wr_email"
      })
    ).rejects.toEqual(new WeeklyReportApiError(200, "invalid_response_shape"));
    await expect(
      api.deleteWeeklyReportChannel({ bearerToken: "dbundle_mem_x", channelId: "wr_email" })
    ).rejects.toEqual(new WeeklyReportApiError(500, "unknown_error"));

    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: "/v1/weekly-report-channels?project_id=proj_1",
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "POST",
        body: {
          project_id: "proj_1",
          channel: "email",
          config: { to: ["team@example.com"] },
          schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
          is_enabled: false
        }
      })
    );
    expect(request).toHaveBeenNthCalledWith(3, {
      method: "PATCH",
      path: "/v1/weekly-report-channels/wr_email",
      bearerToken: "dbundle_mem_x",
      body: {}
    });
  });
});