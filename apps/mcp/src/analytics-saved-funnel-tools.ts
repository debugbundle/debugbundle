import {
  AnalyticsSavedFunnelApiError,
  type AnalyticsSavedFunnelApi
} from "../../cli/src/analytics-saved-funnel-commands.js";
import type {
  AnalyticsSavedFunnelCreate,
  AnalyticsSavedFunnelUpdate
} from "../../../packages/shared-types/src/index.js";

export const ANALYTICS_SAVED_FUNNEL_MCP_TOOL_NAMES = [
  "list_saved_analytics_funnels",
  "create_saved_analytics_funnel",
  "update_saved_analytics_funnel",
  "archive_saved_analytics_funnel"
] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof AnalyticsSavedFunnelApiError) {
    throw new Error(`mcp_tool_error:${error.message}`);
  }
  throw new Error("mcp_tool_error:unknown_error");
}

export function createAnalyticsSavedFunnelMcpTools(
  api: AnalyticsSavedFunnelApi
): Record<
  (typeof ANALYTICS_SAVED_FUNNEL_MCP_TOOL_NAMES)[number],
  (input: Record<string, unknown>) => Promise<unknown>
> {
  return {
    async list_saved_analytics_funnels(input) {
      try {
        return await api.list(readScope(input));
      } catch (error) {
        mapMcpError(error);
      }
    },
    async create_saved_analytics_funnel(input) {
      try {
        const definition: AnalyticsSavedFunnelCreate = {
          funnel_key: readRequiredString(input, "funnelKey"),
          display_name: readRequiredString(input, "displayName"),
          steps: input["steps"] as AnalyticsSavedFunnelCreate["steps"]
        };
        return await api.create({ ...readScope(input), definition });
      } catch (error) {
        mapMcpError(error);
      }
    },
    async update_saved_analytics_funnel(input) {
      try {
        const update: AnalyticsSavedFunnelUpdate = {
          ...(input["displayName"] === undefined
            ? {}
            : { display_name: readRequiredString(input, "displayName") }),
          ...(input["steps"] === undefined
            ? {}
            : { steps: input["steps"] as AnalyticsSavedFunnelUpdate["steps"] })
        };
        return await api.update({
          ...readScope(input),
          funnelKey: readRequiredString(input, "funnelKey"),
          update
        });
      } catch (error) {
        mapMcpError(error);
      }
    },
    async archive_saved_analytics_funnel(input) {
      try {
        return await api.archive({
          ...readScope(input),
          funnelKey: readRequiredString(input, "funnelKey")
        });
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}

function readScope(input: Record<string, unknown>): { bearerToken: string; projectId: string } {
  return {
    bearerToken: readRequiredString(input, "bearerToken"),
    projectId: readRequiredString(input, "projectId")
  };
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string") throw new Error(`invalid_${key}`);
  return value;
}
