import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCliReference, buildSkill } from "../../apps/cli/src/local-scaffold.js";

function skillPaths(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", "dist", ".git"].includes(entry.name)) return [];
    const path = join(root, entry.name);
    return entry.isDirectory() ? skillPaths(path) : entry.name === "SKILL.md" ? [path] : [];
  });
}
const distributions = [...skillPaths("plugins"), ...skillPaths("apps/mcp")];
function routing(text: string): string {
  const block = text
    .match(/^## CLI-first capability routing\n[\s\S]*?(?=^## |$(?![\s\S]))/mu)?.[0]
    ?.trim();
  expect(
    block,
    "Every generated or distributed skill needs the shared routing contract"
  ).toBeDefined();
  return block!;
}

describe("agent-independent interface routing", () => {
  it("keeps generated cleanup examples scoped and explicitly authorized", () => {
    const reference = buildCliReference();
    const cleanup = reference.slice(reference.indexOf("### Smoke-Test Cleanup Recipe"));
    expect(cleanup).toContain("explicitly authorized");
    expect(cleanup).toContain("--source cloud --project-id <project-id> --status all");
    expect(cleanup).toContain("--source cloud --json");
    expect(cleanup).not.toContain("xargs");
    expect(cleanup).not.toContain("title-based batch cleanup");
  });

  it("makes the generated skill CLI-first for reads and authorized writes while preserving host and user scope", () => {
    const text = routing(buildSkill());
    for (const invariant of [
      "CLI is the primary interface",
      "command -v debugbundle",
      "user explicitly selects MCP",
      "connection.json",
      "Never dump",
      "separate",
      "--source cloud",
      "--project-id",
      "explicit authorization",
      "already given",
      "read-only request",
      "--status all",
      "before retrying",
      "Do not install",
      "untrusted",
      "access denial"
    ])
      expect(text, invariant).toContain(invariant);
  });

  it.each(distributions)("keeps %s aligned with the generated project skill", (path) => {
    const text = readFileSync(path, "utf8");
    expect(routing(text)).toBe(routing(buildSkill()));
    expect(text).not.toContain("Prefer the MCP server when the client exposes it.");
    expect(text).not.toContain(
      "1. Confirm the MCP server is connected in `/mcp` if DebugBundle tools are unavailable."
    );
  });

  it("requires the same policy for future Gemini, Muse, and other plugin distributions", () => {
    const contract = readFileSync("contracts/agent-interface-routing.md", "utf8");
    for (const phrase of [
      "Gemini",
      "Muse",
      "Claude Code",
      "Codex",
      "new plugin",
      "parity",
      "MCP-only"
    ]) {
      expect(contract).toContain(phrase);
    }
    expect(distributions.length).toBeGreaterThanOrEqual(4);
  });
});
