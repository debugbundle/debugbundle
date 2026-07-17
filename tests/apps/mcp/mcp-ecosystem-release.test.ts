import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

const repoRoot = process.cwd();

describe("mcp ecosystem release pipeline", () => {
  it("ships a repo-owned ecosystem release manifest and planning script", () => {
    const manifestPath = join(repoRoot, "apps", "mcp", "ecosystem-release-manifest.json");
    const scriptPath = join(repoRoot, "scripts", "release-mcp-ecosystem.mjs");
    const verificationHelperPath = join(repoRoot, "scripts", "mcp-ecosystem-verification.mjs");

    expect(existsSync(manifestPath)).toBe(true);
    expect(existsSync(scriptPath)).toBe(true);
    expect(existsSync(verificationHelperPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      package?: { name?: string; sourceDirectory?: string; packageJsonPath?: string; serverJsonPath?: string };
      mcpb?: { bundleFileName?: string; cliPackage?: string; cliVersion?: string };
      publishTargets?: Record<string, {
        type?: string;
        discoveryQueries?: Array<{ query?: string; maxRank?: number }>;
        catalog?: { categories?: string[]; topics?: string[] };
      }>;
    };
    const script = readFileSync(scriptPath, "utf8");
    const verificationHelper = readFileSync(verificationHelperPath, "utf8");
    const releaseSources = `${script}\n${verificationHelper}`;

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
      smitherySkill: {
        type: "push",
        catalog: {
          categories: ["Operations", "Development", "Agents"],
          topics: ["debugging", "incident-response", "observability", "developer-tools", "health-checks"]
        }
      },
      clawhub: {
        type: "push",
        catalog: {
          categories: ["Operations", "Development", "Agents"],
          topics: ["debugging", "incident-response", "observability", "developer-tools", "health-checks"]
        }
      },
      clawhubPlugin: { type: "push" },
      glama: { type: "discovery" },
      pulseMcp: { type: "discovery" },
      mcpSo: { type: "discovery" },
      lobehub: { type: "discovery" }
    });
    expect(manifest.publishTargets?.["clawhub"]?.discoveryQueries).toEqual([
      { query: "error reporting incident monitoring live apps", maxRank: 10 },
      { query: "runtime error reporting", maxRank: 10 },
      { query: "crash reporting", maxRank: 10 },
      { query: "incident response", maxRank: 10 },
      { query: "production monitoring", maxRank: 10 },
      { query: "health checks", maxRank: 10 },
      { query: "debug bundles", maxRank: 10 }
    ]);

    expect(script).toContain('["pack", context.packageIdentifier, "--pack-destination", context.tarballDirectory]');
    expect(script).toContain('process.env.MCP_PUBLISHER_BIN ?? target.publisherBinary');
    expect(releaseSources).toContain("metadata?.isLatest === true");
    expect(releaseSources).toContain("server?.version === version");
    expect(script).toContain('"mcp", "publish", context.bundlePath, "-n", qualifiedName');
    expect(releaseSources).toContain('https://api.smithery.ai/servers?namespace=');
    expect(releaseSources).toContain('https://api.smithery.ai/skills/');
    expect(releaseSources).toContain('https://api.smithery.ai/skills?namespace=');
    expect(releaseSources).toContain('https://glama.ai/api/mcp/v1/servers?query=');
    expect(releaseSources).toContain("matchesGlamaServer");
    expect(script).toContain("pulseMcp");
    expect(script).toContain("mcpSo");
    expect(releaseSources).toContain("fetchText");
    expect(script).toContain('resources: "skills"');
    expect(script).toContain("registryIndexed");
    expect(script).toContain("expectedCatalog");
    expect(script).toContain('"inspect"');
    expect(script).toContain("verifyClawHubDiscovery");
    expect(releaseSources).toContain("https://clawhub.ai/api/v1/search?q=");
    expect(script).toContain("discoveryChecks");
    expect(releaseSources).toContain("maxRank");
    expect(script).toContain("/skills/");
    expect(script).toContain("parseJsonFromCommandOutput");
    expect(script).toContain('"package",');
    expect(script).toContain('"plugin:validate"');
    expect(script).toContain('`${target.cliPackage}@${target.cliVersion}`');
    expect(script).toContain("manual_check_required");
    expect(script).toContain("verification_failed:");
  });

  it("ranks ClawHub search results and retries bounded discovery checks", async () => {
    const helperUrl = pathToFileURL(join(repoRoot, "scripts", "mcp-ecosystem-verification.mjs")).href;
    const {
      findClawHubSearchRank,
      verifyClawHubDiscovery
    } = await import(helperUrl) as {
      findClawHubSearchRank: (payload: unknown, slug: string) => number | null;
      verifyClawHubDiscovery: (
        target: Record<string, unknown>,
        dependencies: { fetchJson: (url: string) => Promise<unknown>; wait: (milliseconds: number) => Promise<void> }
      ) => Promise<{ status: string; discoveryChecks: Array<{ query: string; rank: number | null; passed: boolean }> }>;
    };

    expect(findClawHubSearchRank({ results: [{ slug: "other" }, { slug: "debugbundle" }] }, "debugbundle")).toBe(2);
    expect(findClawHubSearchRank({ results: [{ slug: "other" }] }, "debugbundle")).toBeNull();

    let requestCount = 0;
    const fetchJson = vi.fn(async () => {
      requestCount += 1;
      return requestCount === 1
        ? { results: [] }
        : { results: [{ slug: "debugbundle" }] };
    });
    const wait = vi.fn(async () => undefined);

    const result = await verifyClawHubDiscovery(
      {
        slug: "debugbundle",
        discoveryQueries: [{ query: "runtime error reporting", maxRank: 10 }],
        discoveryVerification: { attempts: 2, retryDelayMs: 1, limit: 25 }
      },
      { fetchJson, wait }
    );

    expect(result).toEqual({
      status: "found",
      discoveryChecks: [
        { query: "runtime error reporting", maxRank: 10, rank: 1, passed: true }
      ]
    });
    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledOnce();
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
      publishTargets?: Array<{ key?: string; type?: string; catalog?: { categories?: string[]; topics?: string[] } }>;
      discoveryTargets?: Array<{ key?: string; type?: string }>;
    };

    expect(plan.version).toBe("1.7.0");
    expect(plan.packageName).toBe("@debugbundle/mcp");
    expect(plan.mcpb?.bundlePath).toContain(".tmp/mcp-ecosystem/1.7.0/debugbundle-mcp.mcpb");
    expect(plan.publishTargets).toEqual([
      expect.objectContaining({ key: "officialRegistry", type: "push" }),
      expect.objectContaining({ key: "smithery", type: "push" }),
      expect.objectContaining({
        key: "smitherySkill",
        type: "push",
        catalog: {
          categories: ["Operations", "Development", "Agents"],
          topics: ["debugging", "incident-response", "observability", "developer-tools", "health-checks"]
        }
      }),
      expect.objectContaining({
        key: "clawhub",
        type: "push",
        catalog: {
          categories: ["Operations", "Development", "Agents"],
          topics: ["debugging", "incident-response", "observability", "developer-tools", "health-checks"]
        }
      }),
      expect.objectContaining({ key: "clawhubPlugin", type: "push" })
    ]);
    expect(plan.discoveryTargets).toEqual([
      expect.objectContaining({ key: "glama", type: "discovery" }),
      expect.objectContaining({ key: "pulseMcp", type: "discovery" }),
      expect.objectContaining({ key: "mcpSo", type: "discovery" }),
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
