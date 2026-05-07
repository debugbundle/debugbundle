import { describe, expect, it, vi } from "vitest";

import { WeeklyReportApiError } from "../../../packages/weekly-report-client/src/index.js";
import { WEEKLY_REPORT_MCP_TOOL_NAMES, createWeeklyReportMcpTools } from "../../../apps/mcp/src/weekly-report-tools.js";

describe("mcp weekly report tools", () => {
  it("declares weekly report tool parity", (): void => {
    expect(WEEKLY_REPORT_MCP_TOOL_NAMES).toEqual([
      "list_weekly_report_channels",
      "create_weekly_report_channel",
      "update_weekly_report_channel",
      "delete_weekly_report_channel"
    ]);
  });

  it("returns weekly report payloads and maps errors", async (): Promise<void> => {
    const tools = createWeeklyReportMcpTools({
      listWeeklyReportChannels: vi.fn().mockResolvedValue([{ channel_id: "wr_1" }]),
      createWeeklyReportChannel: vi.fn().mockResolvedValue({ channel_id: "wr_2" }),
      updateWeeklyReportChannel: vi.fn().mockResolvedValue({ channel_id: "wr_2", is_enabled: false }),
      deleteWeeklyReportChannel: vi.fn().mockResolvedValue({ channel_id: "wr_2" })
    });

    await expect(
      tools.list_weekly_report_channels({ bearerToken: "dbundle_mem_x", projectId: "proj_1" })
    ).resolves.toEqual({ channels: [{ channel_id: "wr_1" }] });
    await expect(
      tools.create_weekly_report_channel({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        channel: "email",
        config: { to: ["team@example.com"] },
        schedule: { dayOfWeek: "monday", hourOfDay: 9, timezone: "UTC" }
      })
    ).resolves.toEqual({ channel: { channel_id: "wr_2" } });

    const errorTools = createWeeklyReportMcpTools({
      listWeeklyReportChannels: vi.fn().mockRejectedValue(new WeeklyReportApiError(401, "invalid_member_token")),
      createWeeklyReportChannel: vi.fn().mockRejectedValue(new Error("boom")),
      updateWeeklyReportChannel: vi.fn(),
      deleteWeeklyReportChannel: vi.fn()
    });

    await expect(
      errorTools.list_weekly_report_channels({ bearerToken: "dbundle_mem_x", projectId: "proj_1" })
    ).rejects.toThrow("mcp_tool_error:invalid_member_token");
    await expect(
      errorTools.create_weekly_report_channel({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        channel: "email",
        config: { to: ["team@example.com"] },
        schedule: { dayOfWeek: "monday", hourOfDay: 9, timezone: "UTC" }
      })
    ).rejects.toThrow("mcp_tool_error:unknown_error");
  });

  it("covers update/delete tools and optional input forwarding", async (): Promise<void> => {
    const tools = createWeeklyReportMcpTools({
      listWeeklyReportChannels: vi.fn().mockResolvedValue([{ channel_id: "wr_1" }]),
      createWeeklyReportChannel: vi.fn().mockResolvedValue({ channel_id: "wr_2" }),
      updateWeeklyReportChannel: vi.fn().mockResolvedValue({ channel_id: "wr_2", is_enabled: true }),
      deleteWeeklyReportChannel: vi.fn().mockResolvedValue({ channel_id: "wr_2" })
    });

    await expect(
      tools.list_weekly_report_channels({ bearerToken: "dbundle_mem_x", projectId: "proj_1", limit: 10 })
    ).resolves.toEqual({ channels: [{ channel_id: "wr_1" }] });
    await expect(
      tools.update_weekly_report_channel({
        bearerToken: "dbundle_mem_x",
        channelId: "wr_2",
        config: { to: ["team@example.com"] },
        schedule: { dayOfWeek: "friday", hourOfDay: 17, timezone: "UTC" },
        isEnabled: true
      })
    ).resolves.toEqual({ channel: { channel_id: "wr_2", is_enabled: true } });
    await expect(
      tools.delete_weekly_report_channel({ bearerToken: "dbundle_mem_x", channelId: "wr_2" })
    ).resolves.toEqual({ channel: { channel_id: "wr_2" } });
  });

  it("forwards create inputs and maps delete api errors", async (): Promise<void> => {
    const api = {
      listWeeklyReportChannels: vi.fn().mockResolvedValue([]),
      createWeeklyReportChannel: vi.fn().mockResolvedValue({ channel_id: "wr_9" }),
      updateWeeklyReportChannel: vi.fn().mockResolvedValue({ channel_id: "wr_9" }),
      deleteWeeklyReportChannel: vi.fn().mockRejectedValue(new WeeklyReportApiError(404, "weekly_report_channel_not_found"))
    };
    const tools = createWeeklyReportMcpTools(api);

    await expect(
      tools.create_weekly_report_channel({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        channel: "slack",
        config: { webhookUrl: "https://hooks.slack.com/services/T/B/x" },
        schedule: { dayOfWeek: "friday", hourOfDay: 17, timezone: "UTC" },
        isEnabled: false
      })
    ).resolves.toEqual({ channel: { channel_id: "wr_9" } });
    await expect(
      tools.delete_weekly_report_channel({ bearerToken: "dbundle_mem_x", channelId: "wr_missing" })
    ).rejects.toThrow("mcp_tool_error:weekly_report_channel_not_found");

    expect(api.createWeeklyReportChannel).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      channel: "slack",
      config: { webhookUrl: "https://hooks.slack.com/services/T/B/x" },
      schedule: { dayOfWeek: "friday", hourOfDay: 17, timezone: "UTC" },
      isEnabled: false
    });
  });
});