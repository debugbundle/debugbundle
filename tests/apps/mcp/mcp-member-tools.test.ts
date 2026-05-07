import { describe, expect, it, vi } from "vitest";

import { MemberApiError } from "../../../apps/cli/src/member-commands.js";
import { MEMBER_MCP_TOOL_NAMES, createMemberMcpTools } from "../../../apps/mcp/src/member-tools.js";

const memberFixture = {
  user_id: "usr_abc",
  email: "alice@example.com",
  role: "owner",
  joined_at: "2026-01-01T00:00:00.000Z"
};

const inviteFixture = {
  invite_id: "inv_xyz",
  email: "bob@example.com",
  role: "member",
  expires_at: "2026-01-08T00:00:00.000Z"
};

describe("mcp member tools", () => {
  it("declares member tool parity", () => {
    expect(MEMBER_MCP_TOOL_NAMES).toEqual([
      "list_members",
      "list_member_invites",
      "invite_member",
      "cancel_member_invite",
      "update_member_role",
      "remove_member"
    ]);
  });

  it("returns payloads for all member operations", async () => {
    const tools = createMemberMcpTools({
      listMembers: vi.fn().mockResolvedValue({ members: [memberFixture] }),
      listInvites: vi.fn().mockResolvedValue({ invites: [inviteFixture] }),
      inviteMember: vi.fn().mockResolvedValue({ invite: inviteFixture }),
      cancelInvite: vi.fn().mockResolvedValue({ invite: inviteFixture }),
      updateMemberRole: vi.fn().mockResolvedValue({ member: { ...memberFixture, role: "member" } }),
      removeMember: vi.fn().mockResolvedValue({ member: memberFixture })
    });

    await expect(
      tools.list_members({ bearerToken: "dbundle_mem_x" })
    ).resolves.toEqual({ members: [memberFixture] });

    await expect(
      tools.list_member_invites({ bearerToken: "dbundle_mem_x" })
    ).resolves.toEqual({ invites: [inviteFixture] });

    await expect(
      tools.invite_member({ bearerToken: "dbundle_mem_x", email: "bob@example.com", role: "member" })
    ).resolves.toEqual({ invite: inviteFixture });

    await expect(
      tools.cancel_member_invite({ bearerToken: "dbundle_mem_x", inviteId: "inv_xyz" })
    ).resolves.toEqual({ invite: inviteFixture });

    await expect(
      tools.update_member_role({ bearerToken: "dbundle_mem_x", userId: "usr_abc", role: "member" })
    ).resolves.toEqual({ member: { ...memberFixture, role: "member" } });

    await expect(
      tools.remove_member({ bearerToken: "dbundle_mem_x", userId: "usr_abc" })
    ).resolves.toEqual({ member: memberFixture });
  });

  it("maps member api and unknown errors to mcp tool errors", async () => {
    const tools = createMemberMcpTools({
      listMembers: vi.fn().mockRejectedValue(new MemberApiError(401, "invalid_member_token")),
      listInvites: vi.fn().mockRejectedValue(new MemberApiError(403, "forbidden")),
      inviteMember: vi.fn().mockRejectedValue(new MemberApiError(409, "member_already_exists")),
      cancelInvite: vi.fn().mockRejectedValue(new Error("boom")),
      updateMemberRole: vi.fn(),
      removeMember: vi.fn()
    });

    await expect(
      tools.list_members({ bearerToken: "bad" })
    ).rejects.toThrow("mcp_tool_error:invalid_member_token");

    await expect(
      tools.list_member_invites({ bearerToken: "dbundle_mem_x" })
    ).rejects.toThrow("mcp_tool_error:forbidden");

    await expect(
      tools.invite_member({ bearerToken: "dbundle_mem_x", email: "dup@example.com", role: "member" })
    ).rejects.toThrow("mcp_tool_error:member_already_exists");

    await expect(
      tools.cancel_member_invite({ bearerToken: "dbundle_mem_x", inviteId: "inv_123" })
    ).rejects.toThrow("mcp_tool_error:unknown_error");
  });
});
