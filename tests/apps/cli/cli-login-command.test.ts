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