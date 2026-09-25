import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string): string => readFileSync(join(root, path), "utf8");
const json = (path: string): Record<string, unknown> =>
  JSON.parse(read(path)) as Record<string, unknown>;

function ledgerRow(host: string): string[] {
  const line = read("spec/agent-distribution-ledger.md")
    .split("\n")
    .find((candidate) => candidate.startsWith("|") && candidate.split("|")[1]?.trim() === host);
  expect(line, `missing ${host} distribution`).toBeDefined();
  return line!
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function mcpPin(path: string): string {
  const config = json(path) as {
    mcpServers: { debugbundle: { args: string[] } };
  };
  const pin = config.mcpServers.debugbundle.args.find((arg) => arg.startsWith("@debugbundle/mcp@"));
  expect(pin, `missing MCP pin in ${path}`).toBeDefined();
  return pin!.slice("@debugbundle/mcp@".length);
}

describe("agent distribution ledger", () => {
  it("records the current independently versioned Codex, Claude Code, and Gemini packages", () => {
    const entries = [
      {
        host: "Codex",
        manifest: "plugins/debugbundle-codex/.codex-plugin/plugin.json",
        mcp: "plugins/debugbundle-codex/.mcp.json",
        source: "plugins/debugbundle-codex/",
        channel: "core Git marketplace"
      },
      {
        host: "Claude Code",
        manifest: "apps/mcp/claude-code/debugbundle/.claude-plugin/plugin.json",
        mcp: "apps/mcp/claude-code/debugbundle/.mcp.json",
        source: "apps/mcp/claude-code/debugbundle/",
        channel: "core Git marketplace"
      },
      {
        host: "Gemini CLI",
        manifest: "plugins/debugbundle-gemini/gemini-extension.json",
        mcp: "plugins/debugbundle-gemini/gemini-extension.json",
        source: "plugins/debugbundle-gemini/",
        channel: "standalone Git repository"
      }
    ];

    for (const entry of entries) {
      const row = ledgerRow(entry.host);
      expect(row[1]).toBe(`\`${String(json(entry.manifest)["version"])}\``);
      expect(row[2]).toBe(`\`${mcpPin(entry.mcp)}\``);
      expect(row[3]).toContain(entry.source);
      expect(row[4]).toContain(entry.channel);
    }
  });
});
