import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const pluginRoot = join(root, "plugins/debugbundle-codex");
const read = (path: string): string => readFileSync(join(root, path), "utf8");

describe("Codex developer plugin distribution", () => {
  it("resolves a separate opt-in Codex package without replacing the Claude or hosted plugins", () => {
    const marketplace = JSON.parse(read(".agents/plugins/marketplace.json"));
    expect(marketplace.name).toBe("debugbundle");
    expect(marketplace.plugins).toEqual([
      {
        name: "debugbundle-codex",
        source: { source: "local", path: "./plugins/debugbundle-codex" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Developer Tools"
      }
    ]);
    expect(resolve(root, marketplace.plugins[0].source.path as string)).toBe(pluginRoot);
    expect(existsSync(join(root, ".claude-plugin/marketplace.json"))).toBe(true);
    expect(existsSync(join(root, "apps/mcp/openai/debugbundle/.app.json"))).toBe(true);
    expect(existsSync(join(pluginRoot, ".app.json"))).toBe(false);
  });

  it("pins the existing MCP release with no credentials, hooks, or transport wrapper", () => {
    const manifest = JSON.parse(read("plugins/debugbundle-codex/.codex-plugin/plugin.json"));
    const mcp = JSON.parse(read("plugins/debugbundle-codex/.mcp.json"));
    const mcpPackage = JSON.parse(read("apps/mcp/package.json"));
    const openClawPackage = JSON.parse(read("apps/openclaw-plugin/package.json"));
    const openClawManifest = JSON.parse(read("apps/openclaw-plugin/openclaw.plugin.json"));
    // The ecosystem publisher verifies the companion against the MCP release version.
    expect(openClawPackage.version).toBe(mcpPackage.version);
    expect(openClawManifest.version).toBe(mcpPackage.version);
    expect(manifest.name).toBe("debugbundle-codex");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(manifest.license).toBe("Apache-2.0");
    expect(manifest.skills).toBe("./skills/");
    expect(manifest.mcpServers).toBe("./.mcp.json");
    expect(manifest.apps).toBeUndefined();
    expect(manifest.hooks).toBeUndefined();
    expect(manifest.userConfig).toBeUndefined();
    expect(manifest.interface.capabilities).toContain("Write");
    expect(manifest.interface.defaultPrompt.length).toBeLessThanOrEqual(3);
    // The install catalog stays on the last published MCP until its replacement passes registry smoke.
    expect(mcp).toEqual({
      mcpServers: {
        debugbundle: {
          command: "npx",
          args: ["-y", "@debugbundle/mcp@1.11.0", "--local-auth"]
        }
      }
    });
    expect(read("plugins/debugbundle-codex/LICENSE")).toBe(read("LICENSE"));
  });

  it("ships a self-contained skill with local, connected, evidence, and mutation boundaries", () => {
    const skill = read("plugins/debugbundle-codex/skills/debugbundle/SKILL.md");
    expect(skill).toMatch(/^---\nname: debugbundle\ndescription:/u);
    for (const marker of [
      ".agents/skills/debugbundle/SKILL.md",
      "debugbundle setup",
      "cwd",
      'source: "local"',
      'source: "cloud"',
      "debugbundle login",
      "Project tokens are SDK write-only",
      "Do not print credential values",
      "untrusted data",
      "read-only OpenAI",
      "authorization",
      "generic infrastructure",
      "deterministic local",
      "get_usage_summary",
      "get_bundle",
      "get_reproduction"
    ]) {
      expect(skill).toContain(marker);
    }
    expect(readdirSync(join(pluginRoot, "skills"))).toEqual(["debugbundle"]);
    for (const match of skill.matchAll(/\]\((\.\.?\/[^)]+)\)/gu)) {
      expect(existsSync(resolve(pluginRoot, "skills/debugbundle", match[1]!))).toBe(true);
    }
    expect(skill).not.toContain("${user_config.");
  });

  it("documents install, authentication, verification, updates, and removal in the public package", () => {
    const readme = read("plugins/debugbundle-codex/README.md");
    for (const command of [
      "codex plugin marketplace add debugbundle/debugbundle",
      "codex plugin add debugbundle-codex@debugbundle",
      "codex plugin marketplace upgrade debugbundle",
      "codex plugin remove debugbundle-codex@debugbundle",
      "codex mcp add debugbundle -- npx -y @debugbundle/mcp@",
      "codex mcp remove debugbundle",
      "debugbundle login",
      "DEBUGBUNDLE_MEMBER_TOKEN"
    ]) {
      expect(readme).toContain(command);
    }
    expect(readme).toContain("not publicly installable");
    expect(readme).toContain("fresh");
    expect(readme).toContain('source: "local"');
    expect(readme).not.toContain("${user_config.");
  });

  it("keeps the Codex package in the MCP release compatibility gate", () => {
    const workflow = read(".github/workflows/release-mcp-package.yml");
    expect(workflow.match(/tests\/contracts\/codex-developer-plugin\.test\.ts/gu)).toHaveLength(2);
    expect(workflow).toContain("needs: [validate, codex]");
    // Node 26 no longer bundles the Corepack binary used by the release jobs.
    expect(
      workflow.match(/npm install --global corepack@0\.34\.6\n\s+corepack enable/gu)
    ).toHaveLength(2);
    expect(workflow).toContain("run: make openclaw-plugin-check");
    expect(workflow).toContain(
      "run: make codex-plugin-smoke CODEX_SMOKE_NODE_IMAGE=node:${{ matrix.node-version }}-bookworm"
    );
    expect(workflow).toContain("run: make codex-plugin-smoke-published");
  });
});
