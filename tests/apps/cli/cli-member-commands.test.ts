import { describe, expect, it, vi } from "vitest";

import {
  createMemberApi,
  listMembersCommand,
  listInvitesCommand,
  inviteMemberCommand,
  cancelInviteCommand,
  updateMemberRoleCommand,
  removeMemberCommand,
  MemberApiError
} from "../../../apps/cli/src/member-commands.js";

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

function stubApi(): ReturnType<typeof createMemberApi> {
  return {
    listMembers: vi.fn().mockResolvedValue({ members: [memberFixture] }),
    listInvites: vi.fn().mockResolvedValue({ invites: [inviteFixture] }),
    inviteMember: vi.fn().mockResolvedValue({ invite: inviteFixture }),
    cancelInvite: vi.fn().mockResolvedValue({ invite: inviteFixture }),
    updateMemberRole: vi.fn().mockResolvedValue({ member: { ...memberFixture, role: "member" } }),
    removeMember: vi.fn().mockResolvedValue({ member: memberFixture })
  };
}

describe("member CLI commands", () => {
  it("list members returns formatted output", async () => {
    const api = stubApi();
    const result = await listMembersCommand({ bearerToken: "dbundle_mem_x", json: false }, api);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("usr_abc");
    expect(result.output).toContain("alice@example.com");
  });

  it("list members returns json", async () => {
    const api = stubApi();
    const result = await listMembersCommand({ bearerToken: "dbundle_mem_x", json: true }, api);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({ members: [memberFixture] });
  });

  it("list invites returns formatted output", async () => {
    const api = stubApi();
    const result = await listInvitesCommand({ bearerToken: "dbundle_mem_x", json: false }, api);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("inv_xyz");
    expect(result.output).toContain("bob@example.com");
  });

  it("invite member returns created invite", async () => {
    const api = stubApi();
    const result = await inviteMemberCommand({ bearerToken: "dbundle_mem_x", email: "bob@example.com", role: "member", json: true }, api);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({ invite: inviteFixture });
    expect(api.inviteMember).toHaveBeenCalledWith({ bearerToken: "dbundle_mem_x", email: "bob@example.com", role: "member" });
  });

  it("cancel invite returns cancelled invite", async () => {
    const api = stubApi();
    const result = await cancelInviteCommand({ bearerToken: "dbundle_mem_x", inviteId: "inv_xyz", json: true }, api);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({ invite: inviteFixture });
  });

  it("update member role returns updated member", async () => {
    const api = stubApi();
    const result = await updateMemberRoleCommand({ bearerToken: "dbundle_mem_x", userId: "usr_abc", role: "member", json: true }, api);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({ member: { ...memberFixture, role: "member" } });
  });

  it("remove member returns removed member", async () => {
    const api = stubApi();
    const result = await removeMemberCommand({ bearerToken: "dbundle_mem_x", userId: "usr_abc", json: true }, api);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({ member: memberFixture });
  });

  it("maps auth errors correctly", async () => {
    const api = stubApi();
    vi.mocked(api.listMembers).mockRejectedValue(new MemberApiError(401, "invalid_member_token"));

    const result = await listMembersCommand({ bearerToken: "bad" }, api);

    expect(result.exitCode).toBe(2);
    expect(result.output).toBe("invalid_member_token");
  });

  it("maps forbidden errors correctly", async () => {
    const api = stubApi();
    vi.mocked(api.listMembers).mockRejectedValue(new MemberApiError(403, "forbidden"));

    const result = await listMembersCommand({ bearerToken: "dbundle_mem_x" }, api);

    expect(result.exitCode).toBe(3);
    expect(result.output).toBe("forbidden");
  });

  it("maps conflict errors correctly", async () => {
    const api = stubApi();
    vi.mocked(api.inviteMember).mockRejectedValue(new MemberApiError(409, "member_already_exists"));

    const result = await inviteMemberCommand({ bearerToken: "dbundle_mem_x", email: "dup@example.com", role: "member" }, api);

    expect(result.exitCode).toBe(5);
    expect(result.output).toBe("member_already_exists");
  });
});

describe("member inline API client", () => {
  it("sends correct requests for all operations", async () => {
    const mockRequest = vi.fn()
      .mockResolvedValueOnce({ status: 200, body: { members: [memberFixture] } })
      .mockResolvedValueOnce({ status: 200, body: { invites: [inviteFixture] } })
      .mockResolvedValueOnce({ status: 201, body: { invite: inviteFixture } })
      .mockResolvedValueOnce({ status: 200, body: { invite: inviteFixture } })
      .mockResolvedValueOnce({ status: 200, body: { member: memberFixture } })
      .mockResolvedValueOnce({ status: 200, body: { member: memberFixture } });

    const api = createMemberApi({ request: mockRequest });

    await api.listMembers({ bearerToken: "dbundle_mem_x" });
    expect(mockRequest).toHaveBeenCalledWith({ method: "GET", path: "/v1/organization/members", bearerToken: "dbundle_mem_x" });

    await api.listInvites({ bearerToken: "dbundle_mem_x" });
    expect(mockRequest).toHaveBeenCalledWith({ method: "GET", path: "/v1/organization/members/invites", bearerToken: "dbundle_mem_x" });

    await api.inviteMember({ bearerToken: "dbundle_mem_x", email: "bob@test.com", role: "member" });
    expect(mockRequest).toHaveBeenCalledWith({ method: "POST", path: "/v1/organization/members/invite", bearerToken: "dbundle_mem_x", body: { email: "bob@test.com", role: "member" } });

    await api.cancelInvite({ bearerToken: "dbundle_mem_x", inviteId: "inv_123" });
    expect(mockRequest).toHaveBeenCalledWith({ method: "DELETE", path: "/v1/organization/members/invites/inv_123", bearerToken: "dbundle_mem_x" });

    await api.updateMemberRole({ bearerToken: "dbundle_mem_x", userId: "usr_abc", role: "admin" });
    expect(mockRequest).toHaveBeenCalledWith({ method: "PATCH", path: "/v1/organization/members/usr_abc", bearerToken: "dbundle_mem_x", body: { role: "admin" } });

    await api.removeMember({ bearerToken: "dbundle_mem_x", userId: "usr_abc" });
    expect(mockRequest).toHaveBeenCalledWith({ method: "DELETE", path: "/v1/organization/members/usr_abc", bearerToken: "dbundle_mem_x" });
  });

  it("throws MemberApiError on non-success responses", async () => {
    const mockRequest = vi.fn().mockResolvedValue({ status: 403, body: { error: "forbidden" } });
    const api = createMemberApi({ request: mockRequest });

    await expect(api.listMembers({ bearerToken: "dbundle_mem_x" })).rejects.toThrow("member_api_error: 403:forbidden");
  });
});
