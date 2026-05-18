import { ImprovementSettingsApiError } from "../../cli/src/improvement-settings-commands.js";

export const IMPROVEMENT_SETTINGS_MCP_TOOL_NAMES = [
  "get_improvement_settings",
  "update_improvement_settings"
] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof ImprovementSettingsApiError) {
    throw new Error(`mcp_tool_error:${error.message}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

export function createImprovementSettingsMcpTools(api: {
  getImprovementSettings(input: { bearerToken: string; projectId: string }): Promise<unknown>;
  updateImprovementSettings(input: {
    bearerToken: string;
    projectId: string;
    update: Record<string, unknown>;
  }): Promise<unknown>;
}): Record<(typeof IMPROVEMENT_SETTINGS_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async get_improvement_settings(input) {
      try {
        return await api.getImprovementSettings({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async update_improvement_settings(input) {
      try {
        const update =
          typeof input["update"] === "object" && input["update"] !== null
            ? (input["update"] as Record<string, unknown>)
            : {};

        return await api.updateImprovementSettings({
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
