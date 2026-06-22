import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("mcp ecosystem release pipeline", () => {
  it("ships a repo-owned ecosystem release manifest and planning script", () => {
    const manifestPath = join(repoRoot, "apps", "mcp", "ecosystem-release-manifest.json");
    const scriptPath = join(repoRoot, "scripts", "release-mcp-ecosystem.mjs");

    expect(existsSync(manifestPath)).toBe(true);
    expect(existsSync(scriptPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      package?: { name?: string; sourceDirectory?: string; packageJsonPath?: string; serverJsonPath?: string };
      mcpb?: { bundleFileName?: string; cliPackage?: string; cliVersion?: string };
      publishTargets?: Record<string, { type?: string }>;
    };
    const script = readFileSync(scriptPath, "utf8");

    expect(manifest.package).toEqual({
      name: "@debugbundle/mcp",
      sourceDirectory: "apps/mcp",
      packageJsonPath: "apps/mcp/package.json",
      serverJsonPath: "apps/mcp/server.json"
    });
    expect(manifest.mcpb).toEqual({
      bundleFileName: "debugbundle-mcp.mcpb",
      cliPackage: "@anthropic-ai/mcpb",
      cliVersion: "2.1.2"
    });
    expect(manifest.publishTargets).toMatchObject({
      officialRegistry: { type: "push" },
      smithery: { type: "push" },
      smitherySkill: { type: "push" },
      clawhub: { type: "push" },
      glama: { type: "discovery" },
      lobehub: { type: "discovery" }
    });

    expect(script).toContain('["pack", context.packageIdentifier, "--pack-destination", context.tarballDirectory]');
    expect(script).toContain('process.env.MCP_PUBLISHER_BIN ?? target.publisherBinary');
    expect(script).toContain('"mcp", "publish", context.bundlePath, "-n", qualifiedName');
    expect(script).toContain('https://api.smithery.ai/skills/');
    expect(script).toContain('resources: "skills"');
    expect(script).toContain('`${target.cliPackage}@${target.cliVersion}`');
    expect(script).toContain("manual_check_required");
  });

  it("renders a machine-readable ecosystem release plan", () => {
    const output = execFileSync("node", ["scripts/release-mcp-ecosystem.mjs", "plan", "--json"], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    const plan = JSON.parse(output) as {
      version?: string;
      packageName?: string;
      mcpb?: { bundlePath?: string };
      publishTargets?: Array<{ key?: string; type?: string }>;
      discoveryTargets?: Array<{ key?: string; type?: string }>;
    };

    expect(plan.version).toBe("1.6.0");
    expect(plan.packageName).toBe("@debugbundle/mcp");
    expect(plan.mcpb?.bundlePath).toContain(".tmp/mcp-ecosystem/1.6.0/debugbundle-mcp.mcpb");
    expect(plan.publishTargets).toEqual([
      expect.objectContaining({ key: "officialRegistry", type: "push" }),
      expect.objectContaining({ key: "smithery", type: "push" }),
      expect.objectContaining({ key: "smitherySkill", type: "push" }),
      expect.objectContaining({ key: "clawhub", type: "push" })
    ]);
    expect(plan.discoveryTargets).toEqual([
      expect.objectContaining({ key: "glama", type: "discovery" }),
      expect.objectContaining({ key: "lobehub", type: "discovery" })
    ]);
  });

  it("wires the root workspace and makefile to the ecosystem release entrypoints", () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const makefile = readFileSync(join(repoRoot, "Makefile"), "utf8");

    expect(packageJson.scripts).toMatchObject({
      "mcp:ecosystem:plan": "node scripts/release-mcp-ecosystem.mjs plan",
      "mcp:ecosystem:prepare": "node scripts/release-mcp-ecosystem.mjs prepare",
      "mcp:ecosystem:publish": "node scripts/release-mcp-ecosystem.mjs publish",
      "mcp:ecosystem:verify": "node scripts/release-mcp-ecosystem.mjs verify",
      "mcp:ecosystem:run": "node scripts/release-mcp-ecosystem.mjs run"
    });
    expect(makefile).toContain("release-mcp-ecosystem-plan");
    expect(makefile).toContain("release-mcp-ecosystem-prepare");
    expect(makefile).toContain("release-mcp-ecosystem-publish");
    expect(makefile).toContain("release-mcp-ecosystem-verify");
    expect(makefile).toContain("release-mcp-ecosystem");
  });
});
