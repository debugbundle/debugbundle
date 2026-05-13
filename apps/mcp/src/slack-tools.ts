import { SlackApiError } from "../../../packages/slack-client/src/index.js";

export const SLACK_MCP_TOOL_NAMES = [
  "list_slack_destinations",
  "get_slack_connect_url",
  "test_slack_destination",
  "delete_slack_destination"
] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof SlackApiError) {
    throw new Error(`mcp_tool_error:${error.code}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

export function createSlackMcpTools(api: {
  listSlackDestinations(input: { bearerToken: string; projectId: string }): Promise<unknown[]>;
  getSlackInstallUrl(input: { bearerToken: string; projectId: string; returnTo?: string }): Promise<string>;
  testSlackDestination(input: { bearerToken: string; projectId: string; destinationId: string }): Promise<{ delivered: true }>;
  deleteSlackDestination(input: { bearerToken: string; projectId: string; destinationId: string }): Promise<{ slack_destination_id: string }>;
}): Record<(typeof SLACK_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async list_slack_destinations(input) {
      try {
        return {
          destinations: await api.listSlackDestinations({
            bearerToken: String(input["bearerToken"]),
            projectId: String(input["projectId"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_slack_connect_url(input) {
      try {
        return {
          install_url: await api.getSlackInstallUrl({
            bearerToken: String(input["bearerToken"]),
            projectId: String(input["projectId"]),
            ...(typeof input["returnTo"] === "string" ? { returnTo: input["returnTo"] } : {})
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async test_slack_destination(input) {
      try {
        return {
          delivery: await api.testSlackDestination({
            bearerToken: String(input["bearerToken"]),
            projectId: String(input["projectId"]),
            destinationId: String(input["destinationId"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async delete_slack_destination(input) {
      try {
        return {
          destination: await api.deleteSlackDestination({
            bearerToken: String(input["bearerToken"]),
            projectId: String(input["projectId"]),
            destinationId: String(input["destinationId"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}
