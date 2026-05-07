import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError, readCliAuthState, whoamiCommand } from "../../../apps/cli/src/whoami-command.js";

const whoamiGolden = readFileSync(new URL("../../fixtures/cli-whoami.golden.txt", import.meta.url), "utf8");

describe("cli whoami command", () => {
  it("renders current auth state in human mode", async () => {
    const result = await whoamiCommand(
      {
        authFilePath: "/tmp/auth.json"
      },
      {
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(whoamiGolden);
  });

  it("returns parseable json output", async () => {
    const result = await whoamiCommand(
      {
        authFilePath: "/tmp/auth.json",
        json: true
      },
      {
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      authenticated: true,
      auth: {
        base_url: "https://api.debugbundle.com",
        token_preview: "dbundle_mem_secr..."
      }
    });
  });

  it("maps missing auth state to auth/config exit code", async () => {
    const result = await whoamiCommand(
      {
        authFilePath: "/tmp/missing-auth.json"
      },
      {
        readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toBe("Not logged in.");
  });

  it("maps invalid auth state to auth/config exit code", async () => {
    const result = await whoamiCommand(
      {
        authFilePath: "/tmp/invalid-auth.json"
      },
      {
        readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("invalid_auth_state", "Invalid auth state."))
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toBe("Invalid auth state.");
  });

  it("reads and validates auth state from disk", async () => {
    const authState = await readCliAuthState(
      {
        authFilePath: "/tmp/auth.json"
      },
      {
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            bearer_token: "dbundle_mem_secret_token",
            base_url: "https://api.debugbundle.com"
          })
        )
      }
    );

    expect(authState).toEqual({
      bearer_token: "dbundle_mem_secret_token",
      base_url: "https://api.debugbundle.com"
    });
  });

  it("maps unexpected whoami failures to exit code 1 and supports default auth path input", async () => {
    const genericFailure = await whoamiCommand(
      {},
      {
        readAuthState: vi.fn().mockRejectedValue("permission_denied")
      }
    );

    const defaultPathResult = await whoamiCommand(
      {
        json: true
      },
      {
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        })
      }
    );

    expect(genericFailure).toEqual({
      exitCode: 1,
      output: "permission_denied"
    });
    expect(JSON.parse(defaultPathResult.output)).toEqual({
      authenticated: true,
      auth: {
        base_url: "https://api.debugbundle.com",
        token_preview: "dbundle_mem_secr..."
      }
    });
  });

  it("uses the default auth reader and maps Error instances to exit code 1", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-whoami-"));
    const authFilePath = join(rootDirectory, "auth.json");

    try {
      await mkdir(rootDirectory, { recursive: true });
      await writeFile(
        authFilePath,
        JSON.stringify({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        }),
        "utf8"
      );

      const result = await whoamiCommand({ authFilePath });
      const errorResult = await whoamiCommand(
        {},
        {
          readAuthState: vi.fn().mockRejectedValue(new Error("reader_failed"))
        }
      );

      expect(result.output).toBe(whoamiGolden);
      expect(errorResult).toEqual({
        exitCode: 1,
        output: "reader_failed"
      });
    } finally {
      // Temp directory is left to the OS cleanup path for this short-lived test.
    }
  });
});