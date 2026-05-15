import { describe, expect, it, vi } from "vitest";

import { MemberApiError } from "../../../apps/cli/src/member-commands.js";
import { MEMBER_MCP_TOOL_NAMES, createMemberMcpTools } from "../../../apps/mcp/src/member-tools.js";

const memberFixture = {
  user_id: "usr_abc",
  email: "alice@example.com",
  role: "owner",
  membership_type: "owner",
  created_at: "2026-01-01T00:00:00.000Z"
};

const inviteFixture = {
  invite_id: "inv_xyz",
  project_id: "550e8400-e29b-41d4-a716-446655440000",
  email: "bob@example.com",
  role: "member",
  canceled_at: null,
  expires_at: "2026-01-08T00:00:00.000Z"
};

describe("mcp member tools", () => {
  it("declares member tool parity", () => {
    expect(MEMBER_MCP_TOOL_NAMES).toEqual([
      "list_project_members",
      "list_project_member_invites",
      "invite_project_member",
      "cancel_project_member_invite",
      "update_project_member_role",
      "remove_project_member"
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
      tools.list_project_members({ bearerToken: "dbundle_mem_x", projectId: "550e8400-e29b-41d4-a716-446655440000" })
    ).resolves.toEqual({ members: [memberFixture] });

    await expect(
      tools.list_project_member_invites({
        bearerToken: "dbundle_mem_x",
        projectId: "550e8400-e29b-41d4-a716-446655440000"
      })
    ).resolves.toEqual({ invites: [inviteFixture] });

    await expect(
      tools.invite_project_member({
        bearerToken: "dbundle_mem_x",
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        email: "bob@example.com",
        role: "member"
      })
    ).resolves.toEqual({ invite: inviteFixture });

    await expect(
      tools.cancel_project_member_invite({
        bearerToken: "dbundle_mem_x",
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        inviteId: "inv_xyz"
      })
    ).resolves.toEqual({ invite: inviteFixture });

    await expect(
      tools.update_project_member_role({
        bearerToken: "dbundle_mem_x",
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "usr_abc",
        role: "member"
      })
    ).resolves.toEqual({ member: { ...memberFixture, role: "member" } });

    await expect(
      tools.remove_project_member({
        bearerToken: "dbundle_mem_x",
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "usr_abc"
      })
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
      tools.list_project_members({ bearerToken: "bad", projectId: "550e8400-e29b-41d4-a716-446655440000" })
    ).rejects.toThrow("mcp_tool_error:invalid_member_token");

    await expect(
      tools.list_project_member_invites({
        bearerToken: "dbundle_mem_x",
        projectId: "550e8400-e29b-41d4-a716-446655440000"
      })
    ).rejects.toThrow("mcp_tool_error:forbidden");

    await expect(
      tools.invite_project_member({
        bearerToken: "dbundle_mem_x",
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        email: "dup@example.com",
        role: "member"
      })
    ).rejects.toThrow("mcp_tool_error:member_already_exists");

    await expect(
      tools.cancel_project_member_invite({
        bearerToken: "dbundle_mem_x",
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        inviteId: "inv_123"
      })
    ).rejects.toThrow("mcp_tool_error:unknown_error");
  });
});
