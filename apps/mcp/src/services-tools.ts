import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";

export const SERVICE_MCP_TOOL_NAMES = ["list_services"] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof RetrievalApiError) {
    throw new Error(`mcp_tool_error:${error.code}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

export function createServicesMcpTools(api: {
  listServices(input: { bearerToken: string; projectId: string; limit?: number }): Promise<unknown[]>;
}): Record<(typeof SERVICE_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async list_services(input) {
      try {
        const requestInput: { bearerToken: string; projectId: string; limit?: number } = {
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"])
        };
        if (typeof input["limit"] === "number") {
          requestInput.limit = input["limit"];
        }

        return {
          services: await api.listServices(requestInput)
        };
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}