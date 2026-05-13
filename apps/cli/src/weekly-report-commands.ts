import { WeeklyReportApiError } from "../../../packages/weekly-report-client/src/index.js";
import type {
  WeeklyReportChannel,
  WeeklyReportChannelRecord,
  WeeklyReportDayOfWeek
} from "../../../packages/weekly-report-client/src/index.js";
import { createAuthenticatedWeeklyReportApi, runAuthenticatedCliCommand } from "./auth-context.js";
import type { CliCommandResult } from "./token-commands.js";

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof WeeklyReportApiError)) {
    return 1;
  }
  if (error.status === 401) {
    return 2;
  }
  if (error.status === 404) {
    return 3;
  }
  if (error.status === 400) {
    return 4;
  }
  return 1;
}

function formatWeeklyReportChannelTable(channels: WeeklyReportChannelRecord[]): string {
  if (channels.length === 0) {
    return "No weekly report channels found.";
  }

  return channels
    .map(
      (channel) =>
        `${channel.channel_id} | ${channel.is_enabled ? "enabled" : "disabled"} | ${channel.channel} | ${channel.schedule.day_of_week}@${channel.schedule.hour_of_day} ${channel.schedule.timezone} | project=${channel.project_id}`
    )
    .join("\n");
}

export async function listWeeklyReportChannelsCommand(
  input: { bearerToken: string; projectId: string; limit?: number; json?: boolean },
  api: { listWeeklyReportChannels(input: { bearerToken: string; projectId: string; limit?: number }): Promise<WeeklyReportChannelRecord[]> }
): Promise<CliCommandResult> {
  try {
    const channels = await api.listWeeklyReportChannels({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      ...(input.limit !== undefined ? { limit: input.limit } : {})
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ channels }) : formatWeeklyReportChannelTable(channels)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function listWeeklyReportChannelsWithAuthCommand(
  input: { authFilePath?: string; projectId: string; limit?: number; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedWeeklyReportApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedWeeklyReportApi,
    dependencies,
    runCommand: (authState, api) =>
      listWeeklyReportChannelsCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
          ...(input.json !== undefined ? { json: input.json } : {})
        },
        api
      )
  });
}

export async function createWeeklyReportChannelCommand(
  input: {
    bearerToken: string;
    projectId: string;
    channel: WeeklyReportChannel;
    config: { to: string[] } | { webhookUrl: string } | { slackDestinationId: string };
    schedule: { dayOfWeek: WeeklyReportDayOfWeek; hourOfDay: number; timezone: string };
    isEnabled?: boolean;
    json?: boolean;
  },
  api: {
    createWeeklyReportChannel(input: {
      bearerToken: string;
      projectId: string;
      channel: WeeklyReportChannel;
      config: { to: string[] } | { webhookUrl: string } | { slackDestinationId: string };
      schedule: { dayOfWeek: WeeklyReportDayOfWeek; hourOfDay: number; timezone: string };
      isEnabled?: boolean;
    }): Promise<WeeklyReportChannelRecord>;
  }
): Promise<CliCommandResult> {
  try {
    const channel = await api.createWeeklyReportChannel({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      channel: input.channel,
      config: input.config,
      schedule: input.schedule,
      ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {})
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ channel }) : `Weekly report channel created: ${channel.channel_id}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function createWeeklyReportChannelWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    channel: WeeklyReportChannel;
    config: { to: string[] } | { webhookUrl: string } | { slackDestinationId: string };
    schedule: { dayOfWeek: WeeklyReportDayOfWeek; hourOfDay: number; timezone: string };
    isEnabled?: boolean;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedWeeklyReportApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedWeeklyReportApi,
    dependencies,
    runCommand: (authState, api) =>
      createWeeklyReportChannelCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          channel: input.channel,
          config: input.config,
          schedule: input.schedule,
          ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
          ...(input.json !== undefined ? { json: input.json } : {})
        },
        api
      )
  });
}

export async function updateWeeklyReportChannelCommand(
  input: {
    bearerToken: string;
    channelId: string;
    config?: { to: string[] } | { webhookUrl: string } | { slackDestinationId: string };
    schedule?: { dayOfWeek: WeeklyReportDayOfWeek; hourOfDay: number; timezone: string };
    isEnabled?: boolean;
    json?: boolean;
  },
  api: {
    updateWeeklyReportChannel(input: {
      bearerToken: string;
      channelId: string;
      config?: { to: string[] } | { webhookUrl: string } | { slackDestinationId: string };
      schedule?: { dayOfWeek: WeeklyReportDayOfWeek; hourOfDay: number; timezone: string };
      isEnabled?: boolean;
    }): Promise<WeeklyReportChannelRecord>;
  }
): Promise<CliCommandResult> {
  try {
    const channel = await api.updateWeeklyReportChannel({
      bearerToken: input.bearerToken,
      channelId: input.channelId,
      ...(input.config !== undefined ? { config: input.config } : {}),
      ...(input.schedule !== undefined ? { schedule: input.schedule } : {}),
      ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {})
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ channel }) : `Weekly report channel updated: ${channel.channel_id}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateWeeklyReportChannelWithAuthCommand(
  input: {
    authFilePath?: string;
    channelId: string;
    config?: { to: string[] } | { webhookUrl: string } | { slackDestinationId: string };
    schedule?: { dayOfWeek: WeeklyReportDayOfWeek; hourOfDay: number; timezone: string };
    isEnabled?: boolean;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedWeeklyReportApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedWeeklyReportApi,
    dependencies,
    runCommand: (authState, api) =>
      updateWeeklyReportChannelCommand(
        {
          bearerToken: authState.bearer_token,
          channelId: input.channelId,
          ...(input.config !== undefined ? { config: input.config } : {}),
          ...(input.schedule !== undefined ? { schedule: input.schedule } : {}),
          ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
          ...(input.json !== undefined ? { json: input.json } : {})
        },
        api
      )
  });
}

export async function deleteWeeklyReportChannelCommand(
  input: { bearerToken: string; channelId: string; json?: boolean },
  api: { deleteWeeklyReportChannel(input: { bearerToken: string; channelId: string }): Promise<{ channel_id: string }> }
): Promise<CliCommandResult> {
  try {
    const deleted = await api.deleteWeeklyReportChannel({
      bearerToken: input.bearerToken,
      channelId: input.channelId
    });
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ channel: deleted }) : `Weekly report channel deleted: ${deleted.channel_id}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteWeeklyReportChannelWithAuthCommand(
  input: { authFilePath?: string; channelId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedWeeklyReportApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedWeeklyReportApi,
    dependencies,
    runCommand: (authState, api) =>
      deleteWeeklyReportChannelCommand(
        {
          bearerToken: authState.bearer_token,
          channelId: input.channelId,
          ...(input.json !== undefined ? { json: input.json } : {})
        },
        api
      )
  });
}
