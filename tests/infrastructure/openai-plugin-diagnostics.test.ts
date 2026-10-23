import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

type Entry = { path: string; base64: string };
type PluginManifest = {
  $schema?: string;
  name: string;
  version: string;
  apps?: string;
  mcpServers?: string;
  interface?: { displayName: string };
  extensions: {
    "com.openai": { interface?: unknown; review?: unknown; publication?: unknown };
  };
  [key: string]: unknown;
};
const repoRoot = process.cwd();

function entriesFor(variant: string): Map<string, Buffer> {
  const program = [
    'import { diagnosticPluginArchiveEntries } from "./scripts/openai-plugin-diagnostics.mjs";',
    'import { portalPluginArchiveEntries } from "./scripts/openai-plugin-release-lib.mjs";',
    'const entries = process.argv[1] === "canonical" ? portalPluginArchiveEntries() : diagnosticPluginArchiveEntries(process.argv[1]);',
    'process.stdout.write(JSON.stringify(entries.map(e => ({path:e.path,base64:e.bytes.toString("base64")}))));'
  ].join("");
  const entries = JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "--eval", program, variant], {
      cwd: repoRoot,
      encoding: "utf8"
    })
  ) as Entry[];
  return new Map(entries.map((entry) => [entry.path, Buffer.from(entry.base64, "base64")]));
}

function readJson<T>(files: Map<string, Buffer>, path: string): T {
  return JSON.parse(files.get(path)!.toString("utf8")) as T;
}

describe("OpenAI plugin registration diagnostics", () => {
  it("isolates package identity without changing the compatibility MCP configuration", () => {
    const files = entriesFor("isolated-compatibility");
    const manifest = readJson<PluginManifest>(files, "debugbundle/.codex-plugin/plugin.json");
    expect(manifest.name).toBe("debugbundle-cimd-isolated");
    expect(manifest.version).toBe("1.0.2");
    expect(manifest.interface?.displayName).toBe("DebugBundle");
    expect(manifest.mcpServers).toBe("./.mcp.json");
    expect(manifest.apps).toBeUndefined();
    expect(files.has("debugbundle/.app.json")).toBe(false);
    const canonical = entriesFor("canonical");
    expect([...files.keys()]).toEqual([...canonical.keys()]);
    expect({ ...manifest, name: "debugbundle" }).toEqual(
      readJson<PluginManifest>(canonical, "debugbundle/.codex-plugin/plugin.json")
    );
    for (const [path, bytes] of canonical) {
      if (path.endsWith("/.codex-plugin/plugin.json")) continue;
      expect(files.get(path), path).toEqual(bytes);
    }
    expect(readJson(files, "debugbundle/.mcp.json")).toEqual({
      mcpServers: {
        debugbundle: {
          url: "https://mcp.debugbundle.com/mcp",
          extensions: { "com.openai": { auth: { type: "oauth", client: { mode: "cimd" } } } }
        }
      }
    });
  });

  it("does not emit the portable format while its published schema conflicts with OAuth extensions", () => {
    expect(() => entriesFor("isolated-portable")).toThrow(
      "unknown_diagnostic_variant:isolated-portable"
    );
  });

  it("builds repeatable diagnostic archives without modifying canonical release evidence", () => {
    const output = mkdtempSync(join(tmpdir(), "debugbundle-openai-diagnostics-"));
    const manifestPath = join(repoRoot, "apps/mcp/openai/release-manifest.json");
    const before = readFileSync(manifestPath);
    try {
      const prepare = () =>
        JSON.parse(
          execFileSync(
            process.execPath,
            ["scripts/openai-plugin-diagnostics.mjs", "--output", output],
            { cwd: repoRoot, encoding: "utf8" }
          )
        ) as {
          diagnostic_only: boolean;
          variants: Array<{ archive_file: string; archive_sha256: string }>;
        };
      const first = prepare();
      expect(first.diagnostic_only).toBe(true);
      expect(first.variants).toHaveLength(1);
      for (const variant of first.variants) {
        expect(
          createHash("sha256")
            .update(readFileSync(join(output, variant.archive_file)))
            .digest("hex")
        ).toBe(variant.archive_sha256);
      }
      expect(prepare()).toEqual(first);
      expect(readFileSync(manifestPath)).toEqual(before);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });

  it("rejects unsupported options before producing diagnostic artifacts", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/openai-plugin-diagnostics.mjs", "--publish"],
      {
        cwd: repoRoot,
        encoding: "utf8"
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown_option:--publish");
  });
});
