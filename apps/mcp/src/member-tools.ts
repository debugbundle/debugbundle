import { MemberApiError, createMemberApi } from "../../cli/src/member-commands.js";

export const MEMBER_MCP_TOOL_NAMES = [
  "list_members",
  "list_member_invites",
  "invite_member",
  "cancel_member_invite",
  "update_member_role",
  "remove_member"
] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof MemberApiError) {
    throw new Error(`mcp_tool_error:${error.code}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

type MemberApi = ReturnType<typeof createMemberApi>;

export function createMemberMcpTools(api: MemberApi): Record<(typeof MEMBER_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async list_members(input) {
      try {
        return await api.listMembers({
          bearerToken: String(input["bearerToken"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async list_member_invites(input) {
      try {
        return await api.listInvites({
          bearerToken: String(input["bearerToken"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async invite_member(input) {
      try {
        return await api.inviteMember({
          bearerToken: String(input["bearerToken"]),
          email: String(input["email"]),
          role: String(input["role"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async cancel_member_invite(input) {
      try {
        return await api.cancelInvite({
          bearerToken: String(input["bearerToken"]),
          inviteId: String(input["inviteId"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async update_member_role(input) {
      try {
        return await api.updateMemberRole({
          bearerToken: String(input["bearerToken"]),
          userId: String(input["userId"]),
          role: String(input["role"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async remove_member(input) {
      try {
        return await api.removeMember({
          bearerToken: String(input["bearerToken"]),
          userId: String(input["userId"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}
