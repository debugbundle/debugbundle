import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import {
  createWeeklyReportChannelCommand,
  createWeeklyReportChannelWithAuthCommand,
  deleteWeeklyReportChannelCommand,
  deleteWeeklyReportChannelWithAuthCommand,
  listWeeklyReportChannelsCommand,
  listWeeklyReportChannelsWithAuthCommand,
  updateWeeklyReportChannelCommand,
  updateWeeklyReportChannelWithAuthCommand
} from "../../../apps/cli/src/weekly-report-commands.js";
import { WeeklyReportApiError } from "../../../packages/weekly-report-client/src/index.js";

const WeeklyReportCreateOutputSchema = z
  .object({
    channel: z.object({ channel_id: z.string() }).passthrough()
  })
  .strict();

const WeeklyReportUpdateOutputSchema = z
  .object({
    channel: z
      .object({
        channel_id: z.string().optional(),
        is_enabled: z.boolean().optional()
      })
      .passthrough()
  })
  .strict();

describe("cli weekly report commands", () => {
  it("renders list output in human mode", async (): Promise<void> => {
    const result = await listWeeklyReportChannelsCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1" },
      {
        listWeeklyReportChannels: vi.fn().mockResolvedValue([
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
        ])
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("wr_1 | enabled | email | monday@9 UTC | project=proj_1");
  });

  it("loads stored auth state for create and maps auth/config errors", async (): Promise<void> => {
    const createResult = await createWeeklyReportChannelWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_1",
        channel: "email",
        config: { to: ["team@example.com"] },
        schedule: { dayOfWeek: "monday", hourOfDay: 9, timezone: "UTC" },
        json: true
      },
      {
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_saved",
          base_url: "https://selfhost.debugbundle.test"
        }),
        createHttpClient: vi.fn().mockReturnValue({ request: vi.fn() }),
        createApi: vi.fn().mockReturnValue({
          listWeeklyReportChannels: vi.fn(),
          createWeeklyReportChannel: vi.fn().mockResolvedValue({
            channel_id: "wr_1",
            project_id: "proj_1",
            channel: "email",
            config: { to: ["team@example.com"] },
            schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }),
          updateWeeklyReportChannel: vi.fn(),
          deleteWeeklyReportChannel: vi.fn()
        })
      }
    );
    const authError = await listWeeklyReportChannelsWithAuthCommand(
      { projectId: "proj_1" },
      {
        readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );

    expect(createResult.exitCode).toBe(0);
    expect(WeeklyReportCreateOutputSchema.parse(JSON.parse(createResult.output)).channel.channel_id).toBe("wr_1");
    expect(authError.exitCode).toBe(2);
  });

  it("formats update/delete output and maps api errors", async (): Promise<void> => {
    const updateResult = await updateWeeklyReportChannelCommand(
      {
        bearerToken: "dbundle_mem_x",
        channelId: "wr_1",
        isEnabled: false,
        json: true
      },
      {
        updateWeeklyReportChannel: vi.fn().mockResolvedValue({
          channel_id: "wr_1",
          project_id: "proj_1",
          channel: "email",
          config: { to: ["team@example.com"] },
          schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
          is_enabled: false,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T01:00:00.000Z"
        })
      }
    );
    const deleteResult = await deleteWeeklyReportChannelCommand(
      { bearerToken: "dbundle_mem_x", channelId: "wr_1" },
      {
        deleteWeeklyReportChannel: vi.fn().mockResolvedValue({ channel_id: "wr_1" })
      }
    );
    const errorResult = await createWeeklyReportChannelCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        channel: "email",
        config: { to: ["team@example.com"] },
        schedule: { dayOfWeek: "monday", hourOfDay: 9, timezone: "UTC" }
      },
      {
        createWeeklyReportChannel: vi.fn().mockRejectedValue(new WeeklyReportApiError(400, "invalid_payload"))
      }
    );

    expect(WeeklyReportUpdateOutputSchema.parse(JSON.parse(updateResult.output)).channel.is_enabled).toBe(false);
    expect(deleteResult.output).toContain("Weekly report channel deleted: wr_1");
    expect(errorResult.exitCode).toBe(4);
  });

  it("covers empty list, human create/update, json delete, and remaining error mappings", async (): Promise<void> => {
    const emptyList = await listWeeklyReportChannelsCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1" },
      {
        listWeeklyReportChannels: vi.fn().mockResolvedValue([])
      }
    );
    const createResult = await createWeeklyReportChannelCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        channel: "slack",
        config: { webhookUrl: "https://hooks.slack.com/services/T/B/x" },
        schedule: { dayOfWeek: "monday", hourOfDay: 9, timezone: "UTC" },
        isEnabled: false
      },
      {
        createWeeklyReportChannel: vi.fn().mockResolvedValue({
          channel_id: "wr_2",
          project_id: "proj_1",
          channel: "slack",
          config: { webhook_url: "https://hooks.slack.com/services/T/B/x" },
          schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
          is_enabled: false,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z"
        })
      }
    );
    const updateResult = await updateWeeklyReportChannelCommand(
      {
        bearerToken: "dbundle_mem_x",
        channelId: "wr_2",
        schedule: { dayOfWeek: "tuesday", hourOfDay: 11, timezone: "UTC" }
      },
      {
        updateWeeklyReportChannel: vi.fn().mockResolvedValue({
          channel_id: "wr_2",
          project_id: "proj_1",
          channel: "slack",
          config: { webhook_url: "https://hooks.slack.com/services/T/B/x" },
          schedule: { day_of_week: "tuesday", hour_of_day: 11, timezone: "UTC" },
          is_enabled: false,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T01:00:00.000Z"
        })
      }
    );
    const deleteJson = await deleteWeeklyReportChannelCommand(
      { bearerToken: "dbundle_mem_x", channelId: "wr_2", json: true },
      {
        deleteWeeklyReportChannel: vi.fn().mockResolvedValue({ channel_id: "wr_2" })
      }
    );
    const notFound = await deleteWeeklyReportChannelCommand(
      { bearerToken: "dbundle_mem_x", channelId: "wr_missing" },
      {
        deleteWeeklyReportChannel: vi.fn().mockRejectedValue(new WeeklyReportApiError(404, "weekly_report_channel_not_found"))
      }
    );
    const unknown = await updateWeeklyReportChannelCommand(
      { bearerToken: "dbundle_mem_x", channelId: "wr_2", isEnabled: true },
      {
        updateWeeklyReportChannel: vi.fn().mockRejectedValue("boom")
      }
    );

    expect(emptyList.output).toBe("No weekly report channels found.");
    expect(createResult.output).toContain("Weekly report channel created: wr_2");
    expect(updateResult.output).toContain("Weekly report channel updated: wr_2");
    expect(JSON.parse(deleteJson.output)).toEqual({ channel: { channel_id: "wr_2" } });
    expect(notFound.exitCode).toBe(3);
    expect(unknown).toEqual({ exitCode: 1, output: "boom" });
  });

  it("loads stored auth state for update/delete wrappers", async (): Promise<void> => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createApi = vi.fn().mockReturnValue({
      listWeeklyReportChannels: vi.fn(),
      createWeeklyReportChannel: vi.fn(),
      updateWeeklyReportChannel: vi.fn().mockResolvedValue({
        channel_id: "wr_1",
        project_id: "proj_1",
        channel: "email",
        config: { to: ["team@example.com"] },
        schedule: { day_of_week: "wednesday", hour_of_day: 12, timezone: "UTC" },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T01:00:00.000Z"
      }),
      deleteWeeklyReportChannel: vi.fn().mockResolvedValue({ channel_id: "wr_1" })
    });

    const updateResult = await updateWeeklyReportChannelWithAuthCommand(
      {
        channelId: "wr_1",
        config: { to: ["team@example.com"] },
        json: true
      },
      {
        readAuthState,
        createApi
      }
    );
    const deleteResult = await deleteWeeklyReportChannelWithAuthCommand(
      {
        channelId: "wr_1"
      },
      {
        readAuthState,
        createApi
      }
    );

    expect(WeeklyReportUpdateOutputSchema.parse(JSON.parse(updateResult.output)).channel.channel_id).toBe("wr_1");
    expect(deleteResult.output).toContain("Weekly report channel deleted: wr_1");
  });

  it("covers list wrapper flow and auth/not-found error branches", async (): Promise<void> => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createApi = vi.fn().mockReturnValue({
      listWeeklyReportChannels: vi.fn().mockResolvedValue([]),
      createWeeklyReportChannel: vi.fn(),
      updateWeeklyReportChannel: vi.fn(),
      deleteWeeklyReportChannel: vi.fn()
    });

    const listResult = await listWeeklyReportChannelsWithAuthCommand(
      {
        projectId: "proj_1",
        json: true
      },
      {
        readAuthState,
        createApi
      }
    );
    const authError = await updateWeeklyReportChannelCommand(
      {
        bearerToken: "dbundle_mem_x",
        channelId: "wr_1",
        isEnabled: false
      },
      {
        updateWeeklyReportChannel: vi.fn().mockRejectedValue(new WeeklyReportApiError(401, "invalid_member_token"))
      }
    );
    const notFound = await createWeeklyReportChannelCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        channel: "email",
        config: { to: ["team@example.com"] },
        schedule: { dayOfWeek: "monday", hourOfDay: 9, timezone: "UTC" }
      },
      {
        createWeeklyReportChannel: vi.fn().mockRejectedValue(new WeeklyReportApiError(404, "project_not_found"))
      }
    );

    expect(JSON.parse(listResult.output)).toEqual({ channels: [] });
    expect(authError.exitCode).toBe(2);
    expect(notFound.exitCode).toBe(3);
  });

  it("maps validation errors and exercises create/list wrapper option forwarding", async (): Promise<void> => {
    const validation = await deleteWeeklyReportChannelCommand(
      {
        bearerToken: "dbundle_mem_x",
        channelId: "wr_10"
      },
      {
        deleteWeeklyReportChannel: vi.fn().mockRejectedValue(new WeeklyReportApiError(400, "invalid_payload"))
      }
    );
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createApi = vi.fn().mockReturnValue({
      listWeeklyReportChannels: vi.fn().mockResolvedValue([]),
      createWeeklyReportChannel: vi.fn().mockResolvedValue({
        channel_id: "wr_10",
        project_id: "proj_1",
        channel: "slack",
        config: { webhook_url: "https://hooks.slack.com/services/T/B/x" },
        schedule: { day_of_week: "friday", hour_of_day: 17, timezone: "UTC" },
        is_enabled: false,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }),
      updateWeeklyReportChannel: vi.fn(),
      deleteWeeklyReportChannel: vi.fn()
    });

    const createWrapper = await createWeeklyReportChannelWithAuthCommand(
      {
        projectId: "proj_1",
        channel: "slack",
        config: { webhookUrl: "https://hooks.slack.com/services/T/B/x" },
        schedule: { dayOfWeek: "friday", hourOfDay: 17, timezone: "UTC" },
        isEnabled: false
      },
      {
        readAuthState,
        createApi
      }
    );
    const listWrapper = await listWeeklyReportChannelsWithAuthCommand(
      {
        projectId: "proj_1",
        limit: 2
      },
      {
        readAuthState,
        createApi
      }
    );

    expect(validation.exitCode).toBe(4);
    expect(createWrapper.output).toContain("Weekly report channel created: wr_10");
    expect(listWrapper.output).toBe("No weekly report channels found.");
  });
});