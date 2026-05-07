import { describe, expect, it, vi } from "vitest";

import { TokenManagementApiError } from "../../../packages/token-management/src/index.js";
import { createTokenMcpTools, TOKEN_MCP_TOOL_NAMES } from "../../../apps/mcp/src/token-tools.js";

describe("mcp token tools", () => {
  it("declares full token tool parity", () => {
    expect(TOKEN_MCP_TOOL_NAMES).toEqual([
      "list_project_tokens",
      "create_project_token",
      "revoke_project_token",
      "list_member_tokens",
      "create_member_token",
      "revoke_member_token"
    ]);
  });

  it("returns token payload for list_project_tokens", async () => {
    const tools = createTokenMcpTools({
      listProjectTokens: vi.fn().mockResolvedValue([{ token_id: "ptok_1" }]),
      createProjectToken: vi.fn(),
      revokeProjectToken: vi.fn(),
      listMemberTokens: vi.fn(),
      createMemberToken: vi.fn(),
      revokeMemberToken: vi.fn()
    });

    await expect(
      tools.list_project_tokens({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).resolves.toEqual({
      tokens: [{ token_id: "ptok_1" }]
    });
  });

  it("maps auth failures to mcp tool errors", async () => {
    const tools = createTokenMcpTools({
      listProjectTokens: vi.fn().mockRejectedValue(new TokenManagementApiError(401, "invalid_member_token")),
      createProjectToken: vi.fn(),
      revokeProjectToken: vi.fn(),
      listMemberTokens: vi.fn(),
      createMemberToken: vi.fn(),
      revokeMemberToken: vi.fn()
    });

    await expect(
      tools.list_project_tokens({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).rejects.toThrow("mcp_tool_error:invalid_member_token");
  });

  it("invokes all remaining token tool handlers", async () => {
    const tools = createTokenMcpTools({
      listProjectTokens: vi.fn().mockResolvedValue([{ token_id: "ptok_1" }]),
      createProjectToken: vi.fn().mockResolvedValue({ token_id: "ptok_2" }),
      revokeProjectToken: vi.fn().mockResolvedValue({ token_id: "ptok_2", revoked_at: "2026-03-11T00:00:00.000Z" }),
      listMemberTokens: vi.fn().mockResolvedValue([{ token_id: "mtok_1" }]),
      createMemberToken: vi.fn().mockResolvedValue({ token_id: "mtok_2" }),
      revokeMemberToken: vi.fn().mockResolvedValue({ token_id: "mtok_2", revoked_at: "2026-03-11T00:00:00.000Z" })
    });

    await expect(
      tools.create_project_token({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        label: "ci"
      })
    ).resolves.toEqual({ token: { token_id: "ptok_2" } });

    await expect(
      tools.revoke_project_token({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        tokenId: "ptok_2"
      })
    ).resolves.toEqual({ token: { token_id: "ptok_2", revoked_at: "2026-03-11T00:00:00.000Z" } });

    await expect(
      tools.list_member_tokens({
        bearerToken: "dbundle_mem_x",
        limit: 10
      })
    ).resolves.toEqual({ tokens: [{ token_id: "mtok_1" }] });

    await expect(
      tools.create_member_token({
        bearerToken: "dbundle_mem_x",
        label: "agent"
      })
    ).resolves.toEqual({ token: { token_id: "mtok_2" } });

    await expect(
      tools.revoke_member_token({
        bearerToken: "dbundle_mem_x",
        tokenId: "mtok_2"
      })
    ).resolves.toEqual({ token: { token_id: "mtok_2", revoked_at: "2026-03-11T00:00:00.000Z" } });
  });

  it("maps unknown errors to mcp_tool_error:unknown_error", async () => {
    const tools = createTokenMcpTools({
      listProjectTokens: vi.fn().mockRejectedValue(new Error("network")),
      createProjectToken: vi.fn(),
      revokeProjectToken: vi.fn(),
      listMemberTokens: vi.fn(),
      createMemberToken: vi.fn(),
      revokeMemberToken: vi.fn()
    });

    await expect(
      tools.list_project_tokens({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).rejects.toThrow("mcp_tool_error:unknown_error");
  });

  it("covers optional limit branches and non-list handler error mapping", async () => {
    const api = {
      listProjectTokens: vi.fn().mockResolvedValue([]),
      createProjectToken: vi.fn().mockRejectedValue(new Error("boom")),
      revokeProjectToken: vi.fn().mockResolvedValue({ token_id: "ptok_1" }),
      listMemberTokens: vi.fn().mockResolvedValue([]),
      createMemberToken: vi.fn().mockResolvedValue({ token_id: "mtok_1" }),
      revokeMemberToken: vi.fn().mockResolvedValue({ token_id: "mtok_1" })
    };
    const tools = createTokenMcpTools(api);

    await expect(
      tools.list_project_tokens({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        limit: 5
      })
    ).resolves.toEqual({ tokens: [] });
    expect(api.listProjectTokens).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      limit: 5
    });

    await expect(
      tools.list_member_tokens({
        bearerToken: "dbundle_mem_x"
      })
    ).resolves.toEqual({ tokens: [] });
    expect(api.listMemberTokens).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x"
    });

    await expect(
      tools.create_project_token({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        label: "ci"
      })
    ).rejects.toThrow("mcp_tool_error:unknown_error");
  });

  it("maps token api errors for create_member and revoke_member handlers", async () => {
    const tools = createTokenMcpTools({
      listProjectTokens: vi.fn().mockResolvedValue([]),
      createProjectToken: vi.fn().mockResolvedValue({ token_id: "ptok_1" }),
      revokeProjectToken: vi.fn().mockResolvedValue({ token_id: "ptok_1" }),
      listMemberTokens: vi.fn().mockResolvedValue([]),
      createMemberToken: vi.fn().mockRejectedValue(new TokenManagementApiError(400, "invalid_payload")),
      revokeMemberToken: vi.fn().mockRejectedValue(new TokenManagementApiError(404, "token_not_found"))
    });

    await expect(
      tools.create_member_token({
        bearerToken: "dbundle_mem_x",
        label: "bad"
      })
    ).rejects.toThrow("mcp_tool_error:invalid_payload");

    await expect(
      tools.revoke_member_token({
        bearerToken: "dbundle_mem_x",
        tokenId: "missing"
      })
    ).rejects.toThrow("mcp_tool_error:token_not_found");
  });
});
