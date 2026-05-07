import { WeeklyReportApiError } from "../../../packages/weekly-report-client/src/index.js";

export const WEEKLY_REPORT_MCP_TOOL_NAMES = [
  "list_weekly_report_channels",
  "create_weekly_report_channel",
  "update_weekly_report_channel",
  "delete_weekly_report_channel"
] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof WeeklyReportApiError) {
    throw new Error(`mcp_tool_error:${error.code}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

export function createWeeklyReportMcpTools(api: {
  listWeeklyReportChannels(input: { bearerToken: string; projectId: string; limit?: number }): Promise<unknown[]>;
  createWeeklyReportChannel(input: {
    bearerToken: string;
    projectId: string;
    channel: string;
    config: Record<string, unknown>;
    schedule: { dayOfWeek: string; hourOfDay: number; timezone: string };
    isEnabled?: boolean;
  }): Promise<unknown>;
  updateWeeklyReportChannel(input: {
    bearerToken: string;
    channelId: string;
    config?: Record<string, unknown>;
    schedule?: { dayOfWeek: string; hourOfDay: number; timezone: string };
    isEnabled?: boolean;
  }): Promise<unknown>;
  deleteWeeklyReportChannel(input: { bearerToken: string; channelId: string }): Promise<unknown>;
}): Record<(typeof WEEKLY_REPORT_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async list_weekly_report_channels(input) {
      try {
        return {
          channels: await api.listWeeklyReportChannels({
            bearerToken: String(input["bearerToken"]),
            projectId: String(input["projectId"]),
            ...(typeof input["limit"] === "number" ? { limit: input["limit"] } : {})
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async create_weekly_report_channel(input) {
      try {
        return {
          channel: await api.createWeeklyReportChannel({
            bearerToken: String(input["bearerToken"]),
            projectId: String(input["projectId"]),
            channel: String(input["channel"]),
            config: input["config"] as Record<string, unknown>,
            schedule: input["schedule"] as { dayOfWeek: string; hourOfDay: number; timezone: string },
            ...(typeof input["isEnabled"] === "boolean" ? { isEnabled: input["isEnabled"] } : {})
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async update_weekly_report_channel(input) {
      try {
        return {
          channel: await api.updateWeeklyReportChannel({
            bearerToken: String(input["bearerToken"]),
            channelId: String(input["channelId"]),
            ...(typeof input["config"] === "object" && input["config"] !== null
              ? { config: input["config"] as Record<string, unknown> }
              : {}),
            ...(typeof input["schedule"] === "object" && input["schedule"] !== null
              ? { schedule: input["schedule"] as { dayOfWeek: string; hourOfDay: number; timezone: string } }
              : {}),
            ...(typeof input["isEnabled"] === "boolean" ? { isEnabled: input["isEnabled"] } : {})
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async delete_weekly_report_channel(input) {
      try {
        return {
          channel: await api.deleteWeeklyReportChannel({
            bearerToken: String(input["bearerToken"]),
            channelId: String(input["channelId"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}