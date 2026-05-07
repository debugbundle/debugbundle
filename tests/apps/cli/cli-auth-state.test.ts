import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CliAuthStateError,
  buildTokenPreview,
  getDefaultAuthFilePath,
  persistCliAuthState,
  readCliAuthState
} from "../../../apps/cli/src/auth-state.js";

describe("cli auth state", () => {
  it("builds token previews and default auth file path", () => {
    expect(buildTokenPreview("short-token")).toBe("short-token");
    expect(buildTokenPreview("dbundle_mem_secret_token")).toBe("dbundle_mem_secr...");
    expect(getDefaultAuthFilePath()).toContain(".debugbundle/auth.json");
  });

  it("reads valid auth state from JSON", async () => {
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

  it("maps missing auth state files to a dedicated auth error", async () => {
    await expect(
      readCliAuthState(
        {
          authFilePath: "/tmp/missing-auth.json"
        },
        {
          readFile: vi.fn().mockRejectedValue({ code: "ENOENT" })
        }
      )
    ).rejects.toEqual(new CliAuthStateError("auth_state_missing", "Not logged in."));
  });

  it("rejects malformed JSON and schema-invalid auth state", async () => {
    await expect(
      readCliAuthState(
        {
          authFilePath: "/tmp/invalid-json.json"
        },
        {
          readFile: vi.fn().mockResolvedValue("not json")
        }
      )
    ).rejects.toEqual(new CliAuthStateError("invalid_auth_state", "Invalid auth state."));

    await expect(
      readCliAuthState(
        {
          authFilePath: "/tmp/invalid-schema.json"
        },
        {
          readFile: vi.fn().mockResolvedValue(
            JSON.stringify({
              bearer_token: "",
              base_url: "not-a-url"
            })
          )
        }
      )
    ).rejects.toEqual(new CliAuthStateError("invalid_auth_state", "Invalid auth state."));
  });

  it("rethrows unexpected read errors and persists auth state with newline formatting", async () => {
    const readFailure = new Error("permission_denied");
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);

    await expect(
      readCliAuthState(
        {
          authFilePath: "/tmp/auth.json"
        },
        {
          readFile: vi.fn().mockRejectedValue(readFailure)
        }
      )
    ).rejects.toBe(readFailure);

    const savedPath = await persistCliAuthState(
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

    expect(savedPath).toBe("/tmp/.debugbundle/auth.json");
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

  it("supports default auth path selection and real filesystem dependencies", async () => {
    const authStateFromDefaultPath = await readCliAuthState(
      {},
      {
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            bearer_token: "dbundle_mem_secret_token",
            base_url: "https://api.debugbundle.com"
          })
        )
      }
    );

    const tempDir = await mkdtemp(join(tmpdir(), "debugbundle-auth-state-"));
    const authFilePath = join(tempDir, "auth.json");

    try {
      const persistedPath = await persistCliAuthState({
        authFilePath,
        authState: {
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        }
      });
      const persistedContents = await readFile(authFilePath, "utf8");

      expect(authStateFromDefaultPath).toEqual({
        bearer_token: "dbundle_mem_secret_token",
        base_url: "https://api.debugbundle.com"
      });
      expect(persistedPath).toBe(authFilePath);
      expect(JSON.parse(persistedContents)).toEqual({
        bearer_token: "dbundle_mem_secret_token",
        base_url: "https://api.debugbundle.com"
      });
      expect(persistedContents.endsWith("\n")).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});