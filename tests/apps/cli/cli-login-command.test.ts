import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { loginCommand, persistCliAuthState } from "../../../apps/cli/src/login-command.js";

const loginGolden = readFileSync(new URL("../../fixtures/cli-login.golden.txt", import.meta.url), "utf8");

describe("cli login command", () => {
  it("persists auth state and renders human output", async () => {
    const writeAuthState = vi.fn().mockResolvedValue(undefined);

    const result = await loginCommand(
      {
        authFilePath: "/tmp/auth.json",
        bearerToken: "dbundle_mem_secret_token"
      },
      {
        writeAuthState
      }
    );

    expect(writeAuthState).toHaveBeenCalledWith({
      authFilePath: "/tmp/auth.json",
      authState: {
        base_url: "https://api.debugbundle.com",
        bearer_token: "dbundle_mem_secret_token"
      }
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(loginGolden);
  });

  it("returns parseable json output", async () => {
    const result = await loginCommand(
      {
        authFilePath: "/tmp/auth.json",
        bearerToken: "dbundle_mem_secret_token",
        json: true
      },
      {
        writeAuthState: vi.fn().mockResolvedValue(undefined)
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      authenticated: true,
      auth: {
        base_url: "https://api.debugbundle.com",
        token_preview: "dbundle_mem_secr..."
      },
      auth_file_path: "/tmp/auth.json"
    });
  });

  it("maps invalid member token input to validation exit code", async () => {
    const result = await loginCommand(
      {
        authFilePath: "/tmp/auth.json",
        bearerToken: "not_a_member_token"
      },
      {
        writeAuthState: vi.fn()
      }
    );

    expect(result.exitCode).toBe(4);
    expect(result.output).toBe("Invalid member token.");
  });

  it("prompts for an auth flow when login is run without an explicit mode", async () => {
    const writeAuthState = vi.fn().mockResolvedValue("/tmp/auth.json");

    const result = await loginCommand(
      {
        authFilePath: "/tmp/auth.json"
      },
      {
        isInteractiveTerminal: vi.fn().mockReturnValue(true),
        promptForInteractiveLogin: vi.fn().mockResolvedValue({ kind: "github" }),
        readGitHubAccessToken: vi.fn().mockResolvedValue("gho_123"),
        fetchImpl: vi.fn().mockResolvedValue({
          status: 200,
          text: async () => JSON.stringify({
            token: {
              token_id: "tok_123",
              user_id: "usr_123",
              organization_id: "org_123",
              label: "GitHub bootstrap",
              created_at: "2026-03-16T00:00:00.000Z",
              last_used_at: null,
              revoked_at: null,
              expires_at: null,
              plaintext: "dbundle_mem_secret_token"
            }
          })
        } as Response),
        writeAuthState
      }
    );

    expect(result.exitCode).toBe(0);
    expect(writeAuthState).toHaveBeenCalledWith({
      authFilePath: "/tmp/auth.json",
      authState: {
        bearer_token: "dbundle_mem_secret_token",
        base_url: "https://api.debugbundle.com"
      }
    });
  });

  it("accepts a prompted member token when login is run interactively", async () => {
    const result = await loginCommand(
      {},
      {
        isInteractiveTerminal: vi.fn().mockReturnValue(true),
        promptForInteractiveLogin: vi.fn().mockResolvedValue({
          kind: "member-token",
          bearerToken: "dbundle_mem_prompted_token"
        }),
        writeAuthState: vi.fn().mockResolvedValue("/tmp/auth.json")
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Token: dbundle_mem_prom...");
  });

  it("returns a cancellation result when the interactive login prompt is aborted", async () => {
    const result = await loginCommand(
      {},
      {
        isInteractiveTerminal: vi.fn().mockReturnValue(true),
        promptForInteractiveLogin: vi.fn().mockResolvedValue({ kind: "cancel" })
      }
    );

    expect(result).toEqual({
      exitCode: 4,
      output: "Authentication cancelled."
    });
  });

  it("keeps plain login non-interactive for json output", async () => {
    const result = await loginCommand(
      {
        json: true
      },
      {
        isInteractiveTerminal: vi.fn().mockReturnValue(true),
        promptForInteractiveLogin: vi.fn()
      }
    );

    expect(result).toEqual({
      exitCode: 4,
      output: "Provide either a member token or one of --github, --github-cli, or --github-device."
    });
  });

  it("supports GitHub CLI bootstrap when gh is already authenticated", async () => {
    const writeAuthState = vi.fn().mockResolvedValue("/tmp/auth.json");
    const reportProgress = vi.fn();

    const result = await loginCommand(
      {
        github: true,
        authFilePath: "/tmp/auth.json"
      },
      {
        writeAuthState,
        reportProgress,
        readGitHubAccessToken: vi.fn().mockResolvedValue("gho_123"),
        fetchImpl: vi.fn().mockResolvedValue({
          status: 200,
          text: async () => JSON.stringify({
            token: {
              token_id: "tok_123",
              user_id: "usr_123",
              organization_id: "org_123",
              label: "GitHub bootstrap",
              created_at: "2026-03-16T00:00:00.000Z",
              last_used_at: null,
              revoked_at: null,
              expires_at: null,
              plaintext: "dbundle_mem_secret_token"
            }
          })
        } as Response)
      }
    );

    expect(result.exitCode).toBe(0);
    expect(writeAuthState).toHaveBeenCalledWith({
      authFilePath: "/tmp/auth.json",
      authState: {
        bearer_token: "dbundle_mem_secret_token",
        base_url: "https://api.debugbundle.com"
      }
    });
    expect(reportProgress).toHaveBeenCalledWith("Using existing GitHub CLI authentication.");
  });

  it("falls back to device flow when GitHub CLI auth is unavailable", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({
          request_id: "11111111-1111-1111-1111-111111111111",
          user_code: "ABCD-EFGH",
          verification_uri: "https://github.com/login/device",
          interval_seconds: 7,
          expires_at: "2026-03-16T00:15:00.000Z"
        })
      } as Response)
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({
          status: "approved",
          expires_at: "2026-03-16T00:15:00.000Z"
        })
      } as Response)
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({
          token: {
            token_id: "tok_123",
            user_id: "usr_123",
            organization_id: "org_123",
            label: "GitHub bootstrap",
            created_at: "2026-03-16T00:00:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null,
            plaintext: "dbundle_mem_secret_token"
          }
        })
      } as Response);
    const reportProgress = vi.fn();

    const result = await loginCommand(
      {
        github: true,
        json: true
      },
      {
        fetchImpl,
        reportProgress,
        readGitHubAccessToken: vi.fn().mockResolvedValue(null),
        sleep: vi.fn().mockResolvedValue(undefined),
        writeAuthState: vi.fn().mockResolvedValue("/tmp/auth.json")
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      authenticated: true,
      auth: {
        base_url: "https://api.debugbundle.com",
        token_preview: "dbundle_mem_secr..."
      },
      auth_file_path: "/tmp/auth.json"
    });
    expect(reportProgress).toHaveBeenCalledWith("GitHub CLI is not authenticated. Falling back to device flow.");
    expect(reportProgress).toHaveBeenCalledWith("Open https://github.com/login/device and enter code ABCD-EFGH.");
  });

  it("supports explicit GitHub device mode", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({
          request_id: "11111111-1111-1111-1111-111111111111",
          user_code: "ABCD-EFGH",
          verification_uri: "https://github.com/login/device",
          interval_seconds: 7,
          expires_at: "2026-03-16T00:15:00.000Z"
        })
      } as Response)
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({
          status: "approved",
          expires_at: "2026-03-16T00:15:00.000Z"
        })
      } as Response)
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({
          token: {
            token_id: "tok_123",
            user_id: "usr_123",
            organization_id: "org_123",
            label: "Custom bootstrap",
            created_at: "2026-03-16T00:00:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null,
            plaintext: "dbundle_mem_secret_token"
          }
        })
      } as Response);

    const result = await loginCommand(
      {
        githubDevice: true,
        label: "Custom bootstrap"
      },
      {
        fetchImpl,
        sleep: vi.fn().mockResolvedValue(undefined),
        writeAuthState: vi.fn().mockResolvedValue("/tmp/auth.json"),
        reportProgress: vi.fn()
      }
    );

    expect(result.exitCode).toBe(0);
  });

  it("requires gh authentication for explicit GitHub CLI mode", async () => {
    const result = await loginCommand(
      {
        githubCli: true
      },
      {
        readGitHubAccessToken: vi.fn().mockResolvedValue(null)
      }
    );

    expect(result).toEqual({
      exitCode: 4,
      output: "GitHub CLI is not authenticated on this machine."
    });
  });

  it("validates mutually exclusive GitHub login modes", async () => {
    const result = await loginCommand({
      github: true,
      githubCli: true
    });

    expect(result).toEqual({
      exitCode: 4,
      output: "Choose only one of --github, --github-cli, or --github-device."
    });
  });

  it("rejects mixing a member token with GitHub login", async () => {
    const result = await loginCommand({
      bearerToken: "dbundle_mem_secret_token",
      github: true
    });

    expect(result).toEqual({
      exitCode: 4,
      output: "Use either a member token or a GitHub login mode, not both."
    });
  });

  it("requires either a member token or a GitHub login mode", async () => {
    const result = await loginCommand({});

    expect(result).toEqual({
      exitCode: 4,
      output: "Provide either a member token or one of --github, --github-cli, or --github-device."
    });
  });

  it("maps explicit GitHub CLI exchange failures without falling back", async () => {
    const result = await loginCommand(
      {
        githubCli: true
      },
      {
        readGitHubAccessToken: vi.fn().mockResolvedValue("gho_invalid"),
        fetchImpl: vi.fn().mockResolvedValue({
          status: 401,
          text: async () => JSON.stringify({ error: "invalid_github_token" })
        } as Response)
      }
    );

    expect(result).toEqual({
      exitCode: 4,
      output: "The local GitHub CLI token was rejected by DebugBundle."
    });
  });

  it.each([
    [
      { status: "claimed", expires_at: "2026-03-16T00:15:00.000Z" },
      "GitHub device authorization was already claimed."
    ],
    [
      { status: "denied", reason: "access_denied", expires_at: "2026-03-16T00:15:00.000Z" },
      "GitHub device authorization was denied."
    ],
    [
      { status: "expired", reason: "expired_token", expires_at: "2026-03-16T00:15:00.000Z" },
      "GitHub device authorization expired."
    ],
    [
      { status: "rejected", reason: "provider_error", expires_at: "2026-03-16T00:15:00.000Z" },
      "GitHub device authorization was rejected: provider_error"
    ]
  ])("handles device flow terminal status %j", async (pollBody, expectedOutput) => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({
          request_id: "11111111-1111-1111-1111-111111111111",
          user_code: "ABCD-EFGH",
          verification_uri: "https://github.com/login/device",
          interval_seconds: 7,
          expires_at: "2026-03-16T00:15:00.000Z"
        })
      } as Response)
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify(pollBody)
      } as Response);

    const result = await loginCommand(
      {
        githubDevice: true
      },
      {
        fetchImpl,
        sleep: vi.fn().mockResolvedValue(undefined),
        writeAuthState: vi.fn().mockResolvedValue("/tmp/auth.json"),
        reportProgress: vi.fn()
      }
    );

    expect(result.exitCode).toBe(4);
    expect(result.output).toBe(expectedOutput);
  });

  it.each([
    [503, "auth_not_configured", "GitHub login is not configured on this DebugBundle API.", "githubCli", 1],
    [400, "github_email_unavailable", "GitHub did not provide a verified primary email address.", "githubCli", 1],
    [403, "account_suspended", "This DebugBundle account is suspended.", "githubCli", 4],
    [429, "rate_limited", "GitHub login was rate limited. Please wait and try again.", "githubCli", 1],
    [404, "github_device_request_not_found", "GitHub device authorization request was not found.", "githubDevice", 1],
    [409, "github_device_auth_pending", "GitHub device authorization has not completed yet.", "githubDevice", 4],
    [409, "github_device_auth_expired", "GitHub device authorization expired before it could be claimed.", "githubDevice", 4],
    [409, "github_device_auth_claimed", "GitHub device authorization was already claimed.", "githubDevice", 4],
    [409, "github_device_auth_rejected", "GitHub device authorization was rejected.", "githubDevice", 4]
  ])(
    "maps API error %s/%s to the expected login message",
    async (status, error, expectedOutput, mode, expectedExitCode) => {
      const fetchImpl =
        mode === "githubCli"
          ? vi.fn().mockResolvedValue({
              status,
              text: async () => JSON.stringify({ error })
            } as Response)
          : vi
              .fn()
              .mockResolvedValueOnce({
                status: 200,
                text: async () => JSON.stringify({
                  request_id: "11111111-1111-1111-1111-111111111111",
                  user_code: "ABCD-EFGH",
                  verification_uri: "https://github.com/login/device",
                  interval_seconds: 7,
                  expires_at: "2026-03-16T00:15:00.000Z"
                })
              } as Response)
              .mockResolvedValueOnce({
                status: 200,
                text: async () => JSON.stringify({
                  status: "approved",
                  expires_at: "2026-03-16T00:15:00.000Z"
                })
              } as Response)
              .mockResolvedValueOnce({
                status,
                text: async () => JSON.stringify({ error })
              } as Response);

      const result = await loginCommand(
        mode === "githubCli" ? { githubCli: true } : { githubDevice: true },
        {
          fetchImpl,
          readGitHubAccessToken: vi.fn().mockResolvedValue("gho_123"),
          sleep: vi.fn().mockResolvedValue(undefined),
          writeAuthState: vi.fn().mockResolvedValue("/tmp/auth.json"),
          reportProgress: vi.fn()
        }
      );

      expect(result.exitCode).toBe(expectedExitCode);
      expect(result.output).toBe(expectedOutput);
    }
  );

  it("trims pasted token input before persisting", async () => {
    const writeAuthState = vi.fn().mockResolvedValue(undefined);

    const result = await loginCommand(
      {
        authFilePath: "/tmp/auth.json",
        bearerToken: "  dbundle_mem_secret_token\n",
        json: true
      },
      {
        writeAuthState
      }
    );

    expect(writeAuthState).toHaveBeenCalledWith({
      authFilePath: "/tmp/auth.json",
      authState: {
        base_url: "https://api.debugbundle.com",
        bearer_token: "dbundle_mem_secret_token"
      }
    });
    expect(result.exitCode).toBe(0);
  });

  it("persists auth state to disk with parent directory creation", async () => {
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);

    await persistCliAuthState(
      {
        authFilePath: "/tmp/.debugbundle/auth.json",
        authState: {
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        }
      },
      {
        mkdir,
        writeFile
      }
    );

    expect(mkdir).toHaveBeenCalledWith("/tmp/.debugbundle", { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/.debugbundle/auth.json",
      `${JSON.stringify(
        {
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  });

  it("uses persisted path fallback and maps write failures", async () => {
    const jsonResult = await loginCommand(
      {
        bearerToken: "dbundle_mem_secret_token",
        baseUrl: "https://selfhost.debugbundle.test",
        json: true
      },
      {
        writeAuthState: vi.fn().mockResolvedValue("/tmp/saved-auth.json")
      }
    );

    const errorResult = await loginCommand(
      {
        bearerToken: "dbundle_mem_secret_token"
      },
      {
        writeAuthState: vi.fn().mockRejectedValue("disk_full")
      }
    );

    expect(JSON.parse(jsonResult.output)).toEqual({
      authenticated: true,
      auth: {
        base_url: "https://selfhost.debugbundle.test",
        token_preview: "dbundle_mem_secr..."
      },
      auth_file_path: "/tmp/saved-auth.json"
    });
    expect(errorResult).toEqual({
      exitCode: 1,
      output: "disk_full"
    });
  });
});
