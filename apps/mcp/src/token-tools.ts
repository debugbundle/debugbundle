import { TokenManagementApiError } from "../../../packages/token-management/src/index.js";

export const TOKEN_MCP_TOOL_NAMES = [
  "list_project_tokens",
  "create_project_token",
  "revoke_project_token",
  "list_member_tokens",
  "create_member_token",
  "revoke_member_token"
] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof TokenManagementApiError) {
    throw new Error(`mcp_tool_error:${error.code}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

export function createTokenMcpTools(api: {
  listProjectTokens(input: { bearerToken: string; projectId: string; limit?: number }): Promise<unknown[]>;
  createProjectToken(input: { bearerToken: string; projectId: string; label: string }): Promise<unknown>;
  revokeProjectToken(input: { bearerToken: string; projectId: string; tokenId: string }): Promise<unknown>;
  listMemberTokens(input: { bearerToken: string; limit?: number }): Promise<unknown[]>;
  createMemberToken(input: { bearerToken: string; label: string }): Promise<unknown>;
  revokeMemberToken(input: { bearerToken: string; tokenId: string }): Promise<unknown>;
}): Record<(typeof TOKEN_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async list_project_tokens(input) {
      try {
        const requestInput: { bearerToken: string; projectId: string; limit?: number } = {
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"])
        };
        if (typeof input["limit"] === "number") {
          requestInput.limit = input["limit"];
        }

        return {
          tokens: await api.listProjectTokens(requestInput)
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async create_project_token(input) {
      try {
        return {
          token: await api.createProjectToken({
            bearerToken: String(input["bearerToken"]),
            projectId: String(input["projectId"]),
            label: String(input["label"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async revoke_project_token(input) {
      try {
        return {
          token: await api.revokeProjectToken({
            bearerToken: String(input["bearerToken"]),
            projectId: String(input["projectId"]),
            tokenId: String(input["tokenId"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async list_member_tokens(input) {
      try {
        const requestInput: { bearerToken: string; limit?: number } = {
          bearerToken: String(input["bearerToken"])
        };
        if (typeof input["limit"] === "number") {
          requestInput.limit = input["limit"];
        }

        return {
          tokens: await api.listMemberTokens(requestInput)
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async create_member_token(input) {
      try {
        return {
          token: await api.createMemberToken({
            bearerToken: String(input["bearerToken"]),
            label: String(input["label"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async revoke_member_token(input) {
      try {
        return {
          token: await api.revokeMemberToken({
            bearerToken: String(input["bearerToken"]),
            tokenId: String(input["tokenId"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}
