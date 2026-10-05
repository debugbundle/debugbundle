import { z } from "zod";
import {
  AnalyticsFlowDefinitionInputSchema,
  AnalyticsFlowKeySchema
} from "../../../packages/shared-types/src/index.js";
import {
  AnalyticsFlowApiError,
  type AnalyticsFlowApi
} from "../../cli/src/analytics-flow-commands.js";
const scope = z.object({ bearerToken: z.string(), projectId: z.string().uuid() });
const item = scope.extend({ flowKey: AnalyticsFlowKeySchema });
export const ANALYTICS_FLOW_MCP_TOOL_NAMES = [
  "list_analytics_flows",
  "save_analytics_flow",
  "archive_analytics_flow",
  "get_analytics_flow_report"
] as const;
export const ANALYTICS_FLOW_MCP_TOOL_CATALOG = [
  {
    name: "list_analytics_flows",
    group: "analytics_flows",
    description:
      "List this project's named acquisition and activation flows, including archived definitions.",
    inputSchema: scope
  },
  {
    name: "save_analytics_flow",
    group: "analytics_flows",
    description:
      "Create or replace a project flow with two to eight ordered steps and exact origins. Owner/admin only. Edits start a new report version.",
    inputSchema: scope.extend({ definition: AnalyticsFlowDefinitionInputSchema })
  },
  {
    name: "archive_analytics_flow",
    group: "analytics_flows",
    description:
      "Archive a project flow, stopping new capture while retaining aggregate reports. Owner/admin only.",
    inputSchema: item
  },
  {
    name: "get_analytics_flow_report",
    group: "analytics_flows",
    description:
      "Read aggregate reached steps, drop-off, elapsed time, sources and unlinked coverage for full UTC days. Observations do not prove backend business outcomes.",
    inputSchema: item.extend({ window: z.enum(["7d", "30d", "90d"]).optional() })
  }
] as const;
export function createAnalyticsFlowMcpTools(
  api: AnalyticsFlowApi
): Record<
  (typeof ANALYTICS_FLOW_MCP_TOOL_NAMES)[number],
  (input: Record<string, unknown>) => Promise<unknown>
> {
  async function call(operation: () => Promise<unknown>): Promise<unknown> {
    try {
      return await operation();
    } catch (error) {
      throw new Error(
        `mcp_tool_error:${error instanceof AnalyticsFlowApiError ? error.message : error instanceof z.ZodError ? "invalid_flow_input" : "unknown_error"}`
      );
    }
  }
  return {
    list_analytics_flows: (input) => call(() => api.list(scope.parse(input))),
    save_analytics_flow: (input) =>
      call(() => api.save(ANALYTICS_FLOW_MCP_TOOL_CATALOG[1].inputSchema.parse(input))),
    archive_analytics_flow: (input) => call(() => api.archive(item.parse(input))),
    get_analytics_flow_report: (input) =>
      call(() => {
        const parsed = ANALYTICS_FLOW_MCP_TOOL_CATALOG[3].inputSchema.parse(input);
        return api.report({
          ...item.parse(parsed),
          ...(parsed.window === undefined ? {} : { window: parsed.window })
        });
      })
  };
}
