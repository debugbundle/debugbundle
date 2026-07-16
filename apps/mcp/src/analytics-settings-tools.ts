import { AnalyticsSettingsApiError } from "../../cli/src/analytics-settings-commands.js";

export const ANALYTICS_SETTINGS_MCP_TOOL_NAMES = [
  "get_analytics_settings",
  "update_analytics_settings"
] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof AnalyticsSettingsApiError) {
    throw new Error(`mcp_tool_error:${error.message}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

export function createAnalyticsSettingsMcpTools(api: {
  getAnalyticsSettings(input: { bearerToken: string; projectId: string }): Promise<unknown>;
  updateAnalyticsSettings(input: {
    bearerToken: string;
    projectId: string;
    update: Record<string, unknown>;
  }): Promise<unknown>;
}): Record<(typeof ANALYTICS_SETTINGS_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async get_analytics_settings(input) {
      try {
        return await api.getAnalyticsSettings({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async update_analytics_settings(input) {
      try {
        const update =
          typeof input["update"] === "object" && input["update"] !== null
            ? (input["update"] as Record<string, unknown>)
            : {};

        return await api.updateAnalyticsSettings({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          update
        });
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}
