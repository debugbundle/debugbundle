import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import { TokenManagementApiError } from "../../../packages/token-management/src/index.js";
import {
  createMemberTokenCommand,
  createMemberTokenWithAuthCommand,
  createProjectTokenCommand,
  createProjectTokenWithAuthCommand,
  listMemberTokensCommand,
  listMemberTokensWithAuthCommand,
  listProjectTokensCommand,
  listProjectTokensWithAuthCommand,
  revokeMemberTokenWithAuthCommand,
  revokeProjectTokenCommand,
  revokeProjectTokenWithAuthCommand,
  revokeMemberTokenCommand
} from "../../../apps/cli/src/token-commands.js";

describe("cli token commands", () => {
  it("renders list output in human mode", async () => {
    const result = await listProjectTokensCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      },
      {
        listProjectTokens: vi.fn().mockResolvedValue([
          {
            token_id: "ptok_1",
            label: "default",
            revoked_at: null
          }
        ])
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("ptok_1 | default | active");
  });

  it("loads stored auth state and forwards it into project token listing", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const listProjectTokens = vi.fn().mockResolvedValue([
      {
        token_id: "ptok_1",
        label: "default",
        revoked_at: null
      }
    ]);
    const createApi = vi.fn().mockReturnValue({
      listProjectTokens,
      createProjectToken: vi.fn(),
      revokeProjectToken: vi.fn(),
      listMemberTokens: vi.fn(),
      createMemberToken: vi.fn(),
      revokeMemberToken: vi.fn()
    });

    const result = await listProjectTokensWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_1"
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(createHttpClient).toHaveBeenCalledWith({
      baseUrl: "https://selfhost.debugbundle.test"
    });
    expect(listProjectTokens).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1"
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("ptok_1 | default | active");
  });

  it("loads stored auth state and forwards it into member token creation", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const createMemberToken = vi.fn().mockResolvedValue({
      token_id: "mtok_1",
      label: "cli",
      revoked_at: null,
      plaintext: "dbundle_mem_secret"
    });
    const createApi = vi.fn().mockReturnValue({
      listProjectTokens: vi.fn(),
      createProjectToken: vi.fn(),
      revokeProjectToken: vi.fn(),
      listMemberTokens: vi.fn(),
      createMemberToken,
      revokeMemberToken: vi.fn()
    });

    const result = await createMemberTokenWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        label: "cli",
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(createMemberToken).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      label: "cli"
    });
    expect(JSON.parse(result.output)).toEqual({
      token: {
        token_id: "mtok_1",
        label: "cli",
        revoked_at: null,
        plaintext: "dbundle_mem_secret"
      }
    });
  });

  it("maps missing stored auth state to auth/config exit code for token commands", async () => {
    const result = await listProjectTokensWithAuthCommand(
      {
        projectId: "proj_1"
      },
      {
        readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toBe("Not logged in.");
  });

  it("returns JSON output in json mode", async () => {
    const result = await createMemberTokenCommand(
      {
        bearerToken: "dbundle_mem_x",
        label: "ci",
        json: true
      },
      {
        createMemberToken: vi.fn().mockResolvedValue({
          token_id: "mtok_1",
          label: "ci",
          revoked_at: null,
          plaintext: "dbundle_mem_secret"
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      token: {
        token_id: "mtok_1",
        label: "ci",
        revoked_at: null,
        plaintext: "dbundle_mem_secret"
      }
    });
  });

  it("maps auth errors to deterministic exit code", async () => {
    const result = await revokeMemberTokenCommand(
      {
        bearerToken: "dbundle_mem_x",
        tokenId: "mtok_1"
      },
      {
        revokeMemberToken: vi.fn().mockRejectedValue(new TokenManagementApiError(401, "invalid_member_token"))
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("invalid_member_token");
  });

  it("handles no-token list output and project create/revoke human output", async () => {
    const emptyList = await listMemberTokensCommand(
      {
        bearerToken: "dbundle_mem_x"
      },
      {
        listMemberTokens: vi.fn().mockResolvedValue([])
      }
    );

    const created = await createProjectTokenCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        label: "ci"
      },
      {
        createProjectToken: vi.fn().mockResolvedValue({
          token_id: "ptok_1",
          label: "ci",
          revoked_at: null,
          plaintext: "dbundle_proj_secret"
        })
      }
    );

    const revoked = await revokeProjectTokenCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        tokenId: "ptok_1"
      },
      {
        revokeProjectToken: vi.fn().mockResolvedValue({
          token_id: "ptok_1",
          label: "ci",
          revoked_at: "2026-03-11T00:00:00.000Z"
        })
      }
    );

    expect(emptyList.exitCode).toBe(0);
    expect(emptyList.output).toBe("No tokens found.");
    expect(created.output).toContain("Project token created: ptok_1");
    expect(created.output).toContain("Plaintext: dbundle_proj_secret");
    expect(revoked.output).toContain("Project token revoked: ptok_1");
  });

  it("supports json output for project revoke and member list", async () => {
    const listJson = await listMemberTokensCommand(
      {
        bearerToken: "dbundle_mem_x",
        json: true
      },
      {
        listMemberTokens: vi.fn().mockResolvedValue([
          {
            token_id: "mtok_1",
            label: "local",
            revoked_at: null
          }
        ])
      }
    );

    const revokeJson = await revokeProjectTokenCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        tokenId: "ptok_1",
        json: true
      },
      {
        revokeProjectToken: vi.fn().mockResolvedValue({
          token_id: "ptok_1",
          label: "ci",
          revoked_at: "2026-03-11T00:00:00.000Z"
        })
      }
    );

    expect(JSON.parse(listJson.output)).toEqual({
      tokens: [
        {
          token_id: "mtok_1",
          label: "local",
          revoked_at: null
        }
      ]
    });
    expect(JSON.parse(revokeJson.output)).toEqual({
      token: {
        token_id: "ptok_1",
        label: "ci",
        revoked_at: "2026-03-11T00:00:00.000Z"
      }
    });
  });

  it("maps not-found, bad-request and unknown errors", async () => {
    const notFound = await listProjectTokensCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      },
      {
        listProjectTokens: vi.fn().mockRejectedValue(new TokenManagementApiError(404, "project_not_found"))
      }
    );

    const badRequest = await createMemberTokenCommand(
      {
        bearerToken: "dbundle_mem_x",
        label: "ci"
      },
      {
        createMemberToken: vi.fn().mockRejectedValue(new TokenManagementApiError(400, "invalid_payload"))
      }
    );

    const unknown = await revokeProjectTokenCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        tokenId: "ptok_1"
      },
      {
        revokeProjectToken: vi.fn().mockRejectedValue("boom")
      }
    );

    expect(notFound.exitCode).toBe(3);
    expect(badRequest.exitCode).toBe(4);
    expect(unknown.exitCode).toBe(1);
    expect(unknown.output).toBe("boom");
  });

  it("covers remaining json and human formatting branches", async () => {
    const listProjectJson = await listProjectTokensCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        json: true
      },
      {
        listProjectTokens: vi.fn().mockResolvedValue([
          {
            token_id: "ptok_9",
            label: "ci",
            revoked_at: null
          }
        ])
      }
    );

    const createProjectJson = await createProjectTokenCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        label: "ci",
        json: true
      },
      {
        createProjectToken: vi.fn().mockResolvedValue({
          token_id: "ptok_10",
          label: "ci",
          revoked_at: null,
          plaintext: "dbundle_proj_secret"
        })
      }
    );

    const createMemberHuman = await createMemberTokenCommand(
      {
        bearerToken: "dbundle_mem_x",
        label: "agent"
      },
      {
        createMemberToken: vi.fn().mockResolvedValue({
          token_id: "mtok_10",
          label: "agent",
          revoked_at: null,
          plaintext: "dbundle_mem_secret"
        })
      }
    );

    const revokeMemberJson = await revokeMemberTokenCommand(
      {
        bearerToken: "dbundle_mem_x",
        tokenId: "mtok_10",
        json: true
      },
      {
        revokeMemberToken: vi.fn().mockResolvedValue({
          token_id: "mtok_10",
          label: "agent",
          revoked_at: "2026-03-11T00:00:00.000Z"
        })
      }
    );

    expect(JSON.parse(listProjectJson.output)).toEqual({
      tokens: [
        {
          token_id: "ptok_9",
          label: "ci",
          revoked_at: null
        }
      ]
    });
    expect(JSON.parse(createProjectJson.output)).toEqual({
      token: {
        token_id: "ptok_10",
        label: "ci",
        revoked_at: null,
        plaintext: "dbundle_proj_secret"
      }
    });
    expect(createMemberHuman.output).toContain("Member token created: mtok_10");
    expect(JSON.parse(revokeMemberJson.output)).toEqual({
      token: {
        token_id: "mtok_10",
        label: "agent",
        revoked_at: "2026-03-11T00:00:00.000Z"
      }
    });
  });

  it("covers list member error and revoke member human output branches", async () => {
    const listMemberError = await listMemberTokensCommand(
      {
        bearerToken: "dbundle_mem_x"
      },
      {
        listMemberTokens: vi.fn().mockRejectedValue(new Error("network_down"))
      }
    );

    const revokeMemberHuman = await revokeMemberTokenCommand(
      {
        bearerToken: "dbundle_mem_x",
        tokenId: "mtok_11"
      },
      {
        revokeMemberToken: vi.fn().mockResolvedValue({
          token_id: "mtok_11",
          label: "agent",
          revoked_at: null
        })
      }
    );

    expect(listMemberError.exitCode).toBe(1);
    expect(listMemberError.output).toContain("network_down");
    expect(revokeMemberHuman.output).toBe("Member token revoked: mtok_11");
  });

  it("covers create project error catch and unmapped API status fallback", async () => {
    const createProjectError = await createProjectTokenCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        label: "ci"
      },
      {
        createProjectToken: vi.fn().mockRejectedValue(new Error("write_failed"))
      }
    );

    const unmappedApiStatus = await listProjectTokensCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      },
      {
        listProjectTokens: vi.fn().mockRejectedValue(new TokenManagementApiError(500, "internal"))
      }
    );

    expect(createProjectError.exitCode).toBe(1);
    expect(createProjectError.output).toContain("write_failed");
    expect(unmappedApiStatus.exitCode).toBe(1);
    expect(unmappedApiStatus.output).toContain("internal");
  });

  it("covers member command non-Error catches and plaintext fallback", async () => {
    const createMemberNoPlaintext = await createMemberTokenCommand(
      {
        bearerToken: "dbundle_mem_x",
        label: "agent"
      },
      {
        createMemberToken: vi.fn().mockResolvedValue({
          token_id: "mtok_12",
          label: "agent",
          revoked_at: null
        })
      }
    );

    const listMemberStringError = await listMemberTokensCommand(
      {
        bearerToken: "dbundle_mem_x"
      },
      {
        listMemberTokens: vi.fn().mockRejectedValue("member_list_failed")
      }
    );

    const createMemberStringError = await createMemberTokenCommand(
      {
        bearerToken: "dbundle_mem_x",
        label: "agent"
      },
      {
        createMemberToken: vi.fn().mockRejectedValue("member_create_failed")
      }
    );

    const revokeMemberStringError = await revokeMemberTokenCommand(
      {
        bearerToken: "dbundle_mem_x",
        tokenId: "mtok_12"
      },
      {
        revokeMemberToken: vi.fn().mockRejectedValue("member_revoke_failed")
      }
    );

    expect(createMemberNoPlaintext.output).toContain("Plaintext: <none>");
    expect(listMemberStringError.output).toBe("member_list_failed");
    expect(createMemberStringError.output).toBe("member_create_failed");
    expect(revokeMemberStringError.output).toBe("member_revoke_failed");
  });

  it("forwards optional fields in direct token commands", async () => {
    const listProjectTokens = vi.fn().mockResolvedValue([]);
    const listMemberTokens = vi.fn().mockResolvedValue([]);

    await listProjectTokensCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        limit: 20
      },
      {
        listProjectTokens
      }
    );

    await listMemberTokensCommand(
      {
        bearerToken: "dbundle_mem_x",
        limit: 15
      },
      {
        listMemberTokens
      }
    );

    expect(listProjectTokens).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      limit: 20
    });
    expect(listMemberTokens).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      limit: 15
    });
  });

  it("forwards auth state into project token create and revoke wrappers", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const createProjectToken = vi.fn().mockResolvedValue({
      token_id: "ptok_21",
      label: "ci",
      revoked_at: null,
      plaintext: "dbundle_proj_secret"
    });
    const revokeProjectToken = vi.fn().mockResolvedValue({
      token_id: "ptok_21",
      label: "ci",
      revoked_at: "2026-03-11T00:00:00.000Z"
    });
    const createApi = vi.fn().mockReturnValue({
      listProjectTokens: vi.fn(),
      createProjectToken,
      revokeProjectToken,
      listMemberTokens: vi.fn(),
      createMemberToken: vi.fn(),
      revokeMemberToken: vi.fn()
    });

    const created = await createProjectTokenWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_1",
        label: "ci",
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    const revoked = await revokeProjectTokenWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_1",
        tokenId: "ptok_21"
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(createHttpClient).toHaveBeenCalledWith({
      baseUrl: "https://selfhost.debugbundle.test"
    });
    expect(createProjectToken).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1",
      label: "ci"
    });
    expect(revokeProjectToken).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1",
      tokenId: "ptok_21"
    });
    expect(JSON.parse(created.output)).toEqual({
      token: {
        token_id: "ptok_21",
        label: "ci",
        revoked_at: null,
        plaintext: "dbundle_proj_secret"
      }
    });
    expect(revoked.output).toBe("Project token revoked: ptok_21");
  });

  it("forwards auth state into member token list and revoke wrappers", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const listMemberTokens = vi.fn().mockResolvedValue([
      {
        token_id: "mtok_21",
        label: "ops",
        revoked_at: null
      }
    ]);
    const revokeMemberToken = vi.fn().mockResolvedValue({
      token_id: "mtok_21",
      label: "ops",
      revoked_at: "2026-03-11T00:00:00.000Z"
    });
    const createApi = vi.fn().mockReturnValue({
      listProjectTokens: vi.fn(),
      createProjectToken: vi.fn(),
      revokeProjectToken: vi.fn(),
      listMemberTokens,
      createMemberToken: vi.fn(),
      revokeMemberToken
    });

    const listed = await listMemberTokensWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        limit: 10,
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    const revoked = await revokeMemberTokenWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        tokenId: "mtok_21",
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(listMemberTokens).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      limit: 10
    });
    expect(revokeMemberToken).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      tokenId: "mtok_21"
    });
    expect(JSON.parse(listed.output)).toEqual({
      tokens: [
        {
          token_id: "mtok_21",
          label: "ops",
          revoked_at: null
        }
      ]
    });
    expect(JSON.parse(revoked.output)).toEqual({
      token: {
        token_id: "mtok_21",
        label: "ops",
        revoked_at: "2026-03-11T00:00:00.000Z"
      }
    });
  });

  it("maps unexpected authenticated token wrapper failures to exit code 1", async () => {
    const result = await listMemberTokensWithAuthCommand(
      {},
      {
        readAuthState: vi.fn().mockRejectedValue(new Error("token_config_missing"))
      }
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toBe("token_config_missing");
  });
});
