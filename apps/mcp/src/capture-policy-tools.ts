import { CapturePolicyApiError } from "../../cli/src/capture-policy-commands.js";

export const CAPTURE_POLICY_MCP_TOOL_NAMES = ["get_capture_policy", "update_capture_policy"] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof CapturePolicyApiError) {
    throw new Error(`mcp_tool_error:${error.message}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

export function createCapturePolicyMcpTools(api: {
  getCapturePolicy(input: { bearerToken: string; projectId: string }): Promise<unknown>;
  updateCapturePolicy(input: { bearerToken: string; projectId: string; update: Record<string, unknown> }): Promise<unknown>;
}): Record<(typeof CAPTURE_POLICY_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async get_capture_policy(input) {
      try {
        return await api.getCapturePolicy({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async update_capture_policy(input) {
      try {
        const update = typeof input["update"] === "object" && input["update"] !== null
          ? (input["update"] as Record<string, unknown>)
          : {};

        return await api.updateCapturePolicy({
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
