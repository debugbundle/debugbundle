import { describe, expect, it, vi } from "vitest";

import { createTokenManagementApi, TokenManagementApiError, type HttpClient } from "../../../packages/token-management/src/index.js";

describe("token-management api client", () => {
  it("calls project token list route with query", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        tokens: [
          {
            token_id: "tok_1",
            project_id: "proj_1",
            label: "default",
            created_at: "2024-01-01T00:00:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null
          }
        ]
      }
    });

    const api = createTokenManagementApi({ request });
    const tokens = await api.listProjectTokens({ bearerToken: "dbundle_mem_x", projectId: "proj_1", limit: 5 });

    expect(tokens).toHaveLength(1);
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/projects/proj_1/tokens?limit=5",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("throws structured api errors", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 401,
      body: {
        error: "invalid_member_token"
      }
    });

    const api = createTokenManagementApi({ request });

    await expect(api.listMemberTokens({ bearerToken: "dbundle_mem_x" })).rejects.toEqual(
      new TokenManagementApiError(401, "invalid_member_token")
    );
  });

  it("calls member list route without optional query limit", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        tokens: [
          {
            token_id: "tok_2",
            user_id: "usr_1",
            organization_id: "org_1",
            label: "member",
            created_at: "2024-01-01T00:00:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null
          }
        ]
      }
    });

    const api = createTokenManagementApi({ request });
    const tokens = await api.listMemberTokens({ bearerToken: "dbundle_mem_x" });

    expect(tokens).toHaveLength(1);
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/member/tokens",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("calls create and revoke project token routes", async () => {
    const request = vi
      .fn<HttpClient["request"]>()
      .mockResolvedValueOnce({
        status: 201,
        body: {
          token: {
            token_id: "ptok_1",
            project_id: "proj_1",
            label: "ci",
            allowed_origins: ["https://static.example.com"],
            created_at: "2024-01-01T00:00:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null,
            plaintext: "dbundle_proj_secret"
          }
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          token: {
            token_id: "ptok_1",
            project_id: "proj_1",
            label: "ci",
            created_at: "2024-01-01T00:00:00.000Z",
            last_used_at: null,
            revoked_at: "2024-01-01T01:00:00.000Z",
            expires_at: null
          }
        }
      });

    const api = createTokenManagementApi({ request });
    const created = await api.createProjectToken({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      label: "ci",
      allowedOrigins: ["https://static.example.com"]
    });
    const revoked = await api.revokeProjectToken({ bearerToken: "dbundle_mem_x", projectId: "proj_1", tokenId: "ptok_1" });

    expect(created.token_id).toBe("ptok_1");
    expect(revoked.revoked_at).toBe("2024-01-01T01:00:00.000Z");
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "POST",
      path: "/v1/projects/proj_1/tokens",
      bearerToken: "dbundle_mem_x",
      body: {
        label: "ci",
        allowed_origins: ["https://static.example.com"]
      }
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "POST",
      path: "/v1/projects/proj_1/tokens/ptok_1/revoke",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("calls create and revoke member token routes", async () => {
    const request = vi
      .fn<HttpClient["request"]>()
      .mockResolvedValueOnce({
        status: 201,
        body: {
          token: {
            token_id: "mtok_1",
            user_id: "usr_1",
            organization_id: "org_1",
            label: "cli",
            created_at: "2024-01-01T00:00:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null,
            plaintext: "dbundle_mem_secret"
          }
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          token: {
            token_id: "mtok_1",
            user_id: "usr_1",
            organization_id: "org_1",
            label: "cli",
            created_at: "2024-01-01T00:00:00.000Z",
            last_used_at: null,
            revoked_at: "2024-01-01T01:00:00.000Z",
            expires_at: null
          }
        }
      });

    const api = createTokenManagementApi({ request });
    const created = await api.createMemberToken({ bearerToken: "dbundle_mem_x", label: "cli" });
    const revoked = await api.revokeMemberToken({ bearerToken: "dbundle_mem_x", tokenId: "mtok_1" });

    expect(created.token_id).toBe("mtok_1");
    expect(revoked.revoked_at).toBe("2024-01-01T01:00:00.000Z");
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "POST",
      path: "/v1/member/tokens",
      bearerToken: "dbundle_mem_x",
      body: {
        label: "cli"
      }
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "POST",
      path: "/v1/member/tokens/mtok_1/revoke",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("throws unknown_error when api error body is malformed", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 500,
      body: {
        unexpected: true
      }
    });

    const api = createTokenManagementApi({ request });
    await expect(api.createMemberToken({ bearerToken: "dbundle_mem_x", label: "ci" })).rejects.toEqual(
      new TokenManagementApiError(500, "unknown_error")
    );
  });

  it("throws invalid_response_shape for malformed success payloads", async () => {
    const requestList = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        tokens: [{ not_a_token: true }]
      }
    });
    const requestCreate = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 201,
      body: {
        token: { not_a_token: true }
      }
    });

    const apiList = createTokenManagementApi({ request: requestList });
    const apiCreate = createTokenManagementApi({ request: requestCreate });

    await expect(apiList.listProjectTokens({ bearerToken: "dbundle_mem_x", projectId: "proj_1" })).rejects.toEqual(
      new TokenManagementApiError(200, "invalid_response_shape")
    );
    await expect(apiCreate.createProjectToken({ bearerToken: "dbundle_mem_x", projectId: "proj_1", label: "ci" })).rejects.toEqual(
      new TokenManagementApiError(201, "invalid_response_shape")
    );
  });
});
