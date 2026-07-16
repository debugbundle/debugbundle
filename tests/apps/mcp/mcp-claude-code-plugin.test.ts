import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const marketplacePath = join(repoRoot, ".claude-plugin", "marketplace.json");
const pluginRoot = join(repoRoot, "apps", "mcp", "claude-code", "debugbundle");
const pluginManifestPath = join(pluginRoot, ".claude-plugin", "plugin.json");
const pluginMcpPath = join(pluginRoot, ".mcp.json");
const pluginReadmePath = join(pluginRoot, "README.md");
const pluginSkillPath = join(pluginRoot, "skills", "debugbundle", "SKILL.md");
const mcpPackagePath = join(repoRoot, "apps", "mcp", "package.json");

const expectedClaudeKeywords = [
  "debugbundle",
  "mcp",
  "mcp-server",
  "model-context-protocol",
  "claude-code",
  "ai-agent",
  "ai-agent-debugging",
  "debugging",
  "production-debugging",
  "runtime-errors",
  "error-monitoring",
  "incident-response",
  "incident-management",
  "observability",
  "debug-bundles",
  "reproductions",
  "alerts",
  "webhooks",
  "verification",
  "developer-tools",
  "health-checks"
];

const expectedClaudeTags = [
  "debugging",
  "production-debugging",
  "incident-response",
  "observability",
  "debug-bundles",
  "runtime-errors",
  "ai-agent",
  "developer-tools",
  "health-checks"
];

describe("mcp Claude Code plugin marketplace package", () => {
  it("ships a first-party Claude Code marketplace catalog", () => {
    expect(existsSync(marketplacePath)).toBe(true);
    expect(existsSync(pluginManifestPath)).toBe(true);
    expect(existsSync(pluginMcpPath)).toBe(true);
    expect(existsSync(pluginReadmePath)).toBe(true);
    expect(existsSync(pluginSkillPath)).toBe(true);

    const marketplace = JSON.parse(readFileSync(marketplacePath, "utf8")) as {
      $schema?: string;
      name?: string;
      description?: string;
      owner?: { name?: string; url?: string };
      plugins?: Array<{
        name?: string;
        displayName?: string;
        description?: string;
        version?: string;
        source?: string;
        category?: string;
        keywords?: string[];
        tags?: string[];
      }>;
    };
    const mcpPackage = JSON.parse(readFileSync(mcpPackagePath, "utf8")) as { version?: string };

    expect(marketplace.$schema).toBe("https://json.schemastore.org/claude-code-marketplace.json");
    expect(marketplace.name).toBe("debugbundle");
    expect(marketplace.description).toBe(
      "Claude Code marketplace for DebugBundle production debugging, incident response, and MCP workflows."
    );
    expect(marketplace.owner).toEqual({
      name: "DebugBundle",
      url: "https://debugbundle.com"
    });
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({
        name: "debugbundle",
        displayName: "DebugBundle",
        description:
          "Production debugging bundles for AI agents. Connect Claude Code to DebugBundle incidents, deterministic bundles, reproductions, health checks, probes, alerts, webhooks, projects, and verification workflows.",
        version: mcpPackage.version,
        source: "./apps/mcp/claude-code/debugbundle",
        category: "monitoring",
        keywords: expectedClaudeKeywords,
        tags: expectedClaudeTags
      })
    ]);
  });

  it("pins the bundled Claude Code plugin to the current MCP package", () => {
    const pluginManifest = JSON.parse(readFileSync(pluginManifestPath, "utf8")) as {
      name?: string;
      displayName?: string;
      description?: string;
      version?: string;
      keywords?: string[];
      userConfig?: Record<string, { type?: string; title?: string; sensitive?: boolean; default?: string }>;
    };
    const pluginMcp = JSON.parse(readFileSync(pluginMcpPath, "utf8")) as {
      mcpServers?: Record<string, { type?: string; command?: string; args?: string[]; env?: Record<string, string> }>;
    };
    const mcpPackage = JSON.parse(readFileSync(mcpPackagePath, "utf8")) as { version?: string };

    expect(pluginManifest).toMatchObject({
      name: "debugbundle",
      displayName: "DebugBundle",
      description:
        "Production debugging bundles for AI agents. Connect Claude Code to DebugBundle incidents, deterministic bundles, reproductions, health checks, probes, alerts, webhooks, projects, and verification workflows.",
      version: mcpPackage.version,
      license: "AGPL-3.0-only",
      keywords: expectedClaudeKeywords
    });
    expect(pluginManifest.userConfig?.["member_token"]).toMatchObject({
      type: "string",
      sensitive: true,
      default: ""
    });
    expect(pluginManifest.userConfig?.["api_url"]).toMatchObject({
      type: "string",
      default: ""
    });

    expect(pluginMcp.mcpServers?.["debugbundle"]).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", `@debugbundle/mcp@${mcpPackage.version}`],
      env: {
        DEBUGBUNDLE_MEMBER_TOKEN: "${user_config.member_token}",
        DEBUGBUNDLE_API_URL: "${user_config.api_url}"
      }
    });
  });

  it("documents Claude Code usage without exposing secrets or project-token auth", () => {
    const readme = readFileSync(pluginReadmePath, "utf8");
    const skill = readFileSync(pluginSkillPath, "utf8");

    expect(readme).toContain("/plugin marketplace add debugbundle/debugbundle");
    expect(readme).toContain("/plugin install debugbundle@debugbundle");
    expect(readme).toContain("Production debugging bundles for AI agents");
    expect(readme).toContain("deterministic bundles");
    expect(readme).toContain("webhooks");
    expect(readme).toContain("verification workflows");
    expect(readme).toContain("debugbundle login");
    expect(readme).toContain("Project tokens are SDK write-only ingestion credentials");
    expect(readme).toContain("community marketplace review");
    expect(readme).not.toContain("dbundle_mem_");
    expect(readme).not.toContain("dbundle_proj_");

    expect(skill).toContain("name: debugbundle");
    expect(skill).toContain("description: Use DebugBundle MCP tools in Claude Code");
    expect(skill).toContain("deterministic debug bundles");
    expect(skill).toContain("verification evidence");
    expect(skill).toContain("list_incidents");
    expect(skill).toContain("get_bundle");
    expect(skill).toContain("verify_cloud");
    expect(skill).toContain("Project tokens are SDK write-only ingestion credentials");
    expect(skill).toContain("Do not print credential values");
    expect(skill).not.toContain("dbundle_mem_");
    expect(skill).not.toContain("dbundle_proj_");
  });
});
