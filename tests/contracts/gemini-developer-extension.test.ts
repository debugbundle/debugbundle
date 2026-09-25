import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const extensionRoot = join(root, "plugins/debugbundle-gemini");
const read = (path: string): string => readFileSync(join(root, path), "utf8");

describe("Gemini CLI developer extension", () => {
  it("ships a native, standalone Gemini extension with the published local-auth MCP server", () => {
    const manifest = JSON.parse(read("plugins/debugbundle-gemini/gemini-extension.json"));
    const codex = JSON.parse(read("plugins/debugbundle-codex/.mcp.json"));

    expect(manifest.name).toBe("debugbundle-gemini");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(manifest.mcpServers.debugbundle).toEqual({
      ...codex.mcpServers.debugbundle,
      cwd: "${workspacePath}"
    });
    expect(manifest.mcpServers.debugbundle.args[2]).toBe("--local-auth");
    expect(manifest.hooks).toBeUndefined();
    expect(manifest.commands).toBeUndefined();
    expect(manifest.excludeTools).toBeUndefined();
    expect(existsSync(join(extensionRoot, "skills/debugbundle/SKILL.md"))).toBe(true);
    expect(read("plugins/debugbundle-gemini/LICENSE")).toBe(read("LICENSE"));
  });

  it("keeps project setup separate from extension installation and documents both paths", () => {
    const skill = read("plugins/debugbundle-gemini/skills/debugbundle/SKILL.md");
    const readme = read("plugins/debugbundle-gemini/README.md");
    for (const value of [
      "debugbundle setup --agent gemini-cli",
      "debugbundle login",
      'source: "local"',
      'source: "cloud"',
      "get_bundle",
      "get_reproduction"
    ]) {
      expect(`${skill}\n${readme}`).toContain(value);
    }
    expect(skill).toContain("untrusted data");
    expect(skill).toContain("Project tokens are SDK write-only");
    expect(readme).toContain("gemini extensions install");
    expect(readme).toContain("gemini extensions update debugbundle-gemini");
    expect(readme).toContain("gemini extensions uninstall debugbundle-gemini");
    expect(readme).toContain("gemini mcp list");
    expect(readme).toContain("not published");
  });

  it("makes the standalone release layout and core documentation explicit", () => {
    expect(existsSync(join(root, "scripts/package-gemini-extension.mjs"))).toBe(true);
    expect(existsSync(join(root, "scripts/smoke-gemini-extension.mjs"))).toBe(true);
    const readme = read("README.md");
    expect(readme).toMatch(/Codex, Claude Code, and Gemini CLI/u);
    expect(readme).toContain("https://debugbundle.com/docs/mcp/gemini/");
    const release = read("rules/release-governance.md");
    expect(release).toContain("Gemini CLI Developer Extension");
    expect(release).toContain("gemini-cli-extension");
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toContain("make gemini-extension-package");
    expect(ci).toContain("make gemini-extension-smoke");
  });
});
