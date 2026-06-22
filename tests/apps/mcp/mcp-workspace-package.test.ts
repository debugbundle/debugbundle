import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

type PackageJsonLike = {
  name?: string;
  mcpName?: string;
  version?: string;
  private?: boolean;
  description?: string;
  license?: string;
  repository?: { type?: string; url?: string; directory?: string };
  homepage?: string;
  bugs?: string | { url?: string };
  keywords?: string[];
  engines?: Record<string, string>;
  type?: string;
  scripts?: Record<string, string>;
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  files?: string[];
};

type McpServerJsonLike = {
  name?: string;
  description?: string;
  version?: string;
  packages?: Array<{
    registryType?: string;
    registryBaseUrl?: string;
    identifier?: string;
    version?: string;
    transport?: { type?: string };
    environmentVariables?: Array<{ name?: string; isRequired?: boolean; isSecret?: boolean }>;
  }>;
};

function readPackageJson(relativePath: string): PackageJsonLike {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8")) as PackageJsonLike;
}

const repoRoot = process.cwd();

describe("mcp workspace package", () => {
  it("defines apps/mcp as a publishable package with its own stdio bin", () => {
    const packageJson = readPackageJson("../../../apps/mcp/package.json");

    expect(packageJson.name).toBe("@debugbundle/mcp");
    expect(packageJson.mcpName).toBe("com.debugbundle/mcp");
    expect(packageJson.private).toBe(false);
    expect(packageJson.description).toBe("Model Context Protocol server for DebugBundle");
    expect(packageJson.license).toBe("AGPL-3.0-only");
    expect(packageJson.repository).toEqual({
      type: "git",
      url: "https://github.com/debugbundle/debugbundle",
      directory: "apps/mcp"
    });
    expect(packageJson.homepage).toBe("https://debugbundle.com/docs/mcp");
    expect(packageJson.bugs).toEqual({ url: "https://github.com/debugbundle/debugbundle/issues" });
    expect(packageJson.keywords).toEqual(["debugbundle", "debugging", "ai-agent", "mcp", "model-context-protocol"]);
    expect(packageJson.engines).toEqual({ node: ">=22 <27" });
    expect(packageJson.type).toBe("module");
    expect(packageJson.scripts).toMatchObject({
      start: "tsx src/entrypoint.ts",
      build: "esbuild src/entrypoint.ts --bundle --platform=node --format=cjs --target=node22 --external:@node-rs/argon2 --outfile=dist/main.cjs",
      prepack: "npm run build"
    });
    expect(packageJson.bin).toEqual({
      "debugbundle-mcp": "bin/debugbundle-mcp.js"
    });
    expect(packageJson.dependencies).toMatchObject({
      "@node-rs/argon2": "^2.0.2"
    });
    expect(packageJson.devDependencies).toMatchObject({
      esbuild: "^0.27.3",
      tsx: "^4.20.5"
    });
    expect(packageJson.files).toEqual(["bin", "dist", "README.md", "LICENSE", "server.json"]);
  });

  it("ships MCP registry metadata aligned with package ownership", () => {
    const packageJson = readPackageJson("../../../apps/mcp/package.json");
    const serverJson = JSON.parse(readFileSync(new URL("../../../apps/mcp/server.json", import.meta.url), "utf8")) as McpServerJsonLike;

    expect(serverJson.name).toBe(packageJson.mcpName);
    expect(serverJson.version).toBe(packageJson.version);
    expect(serverJson.description).toBe(
      "DebugBundle MCP server for incidents, bundles, reproductions, health checks, probes, and ops."
    );
    expect(serverJson.description?.length).toBeLessThanOrEqual(100);
    expect(serverJson.packages).toEqual([
      expect.objectContaining({
        registryType: "npm",
        registryBaseUrl: "https://registry.npmjs.org",
        identifier: packageJson.name,
        version: packageJson.version,
        transport: {
          type: "stdio"
        },
        environmentVariables: expect.arrayContaining([
          expect.objectContaining({
            name: "DEBUGBUNDLE_MEMBER_TOKEN",
            isRequired: false,
            isSecret: true
          }),
          expect.objectContaining({
            name: "DEBUGBUNDLE_API_URL",
            isRequired: false,
            isSecret: false
          })
        ])
      })
    ]);
  });

  it("keeps the published mcp bin wrapper portable outside the monorepo", () => {
    const binWrapper = readFileSync(new URL("../../../apps/mcp/bin/debugbundle-mcp.js", import.meta.url), "utf8");

    expect(binWrapper).toContain('resolve(packageRoot, "dist/main.cjs")');
    expect(binWrapper).toContain("createRequire");
    expect(binWrapper).toContain("require(mainPath)");
    expect(binWrapper).not.toContain("tsx");
    expect(binWrapper).not.toContain("node_modules/tsx");
    expect(binWrapper).not.toContain("../../..");
  });

  it("ships package-level README and license files", () => {
    const readme = readFileSync(new URL("../../../apps/mcp/README.md", import.meta.url), "utf8");
    const license = readFileSync(new URL("../../../apps/mcp/LICENSE", import.meta.url), "utf8");

    expect(readme).toContain("# @debugbundle/mcp");
    expect(readme).toContain("npx @debugbundle/mcp");
    expect(readme).toContain("DEBUGBUNDLE_MEMBER_TOKEN");
    expect(readme).toContain("https://debugbundle.com/docs/mcp");
    expect(license).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
    expect(license).toContain("Version 3, 19 November 2007");
  });

  it("ships release metadata and workflow automation for npm publication", () => {
    const manifestPath = join(repoRoot, "apps", "mcp", "release-manifest.json");
    const workflowPath = join(repoRoot, ".github", "workflows", "release-mcp-package.yml");
    const smokeScriptPath = join(repoRoot, "scripts", "smoke-mcp-stdio.mjs");

    expect(existsSync(manifestPath)).toBe(true);
    expect(existsSync(workflowPath)).toBe(true);
    expect(existsSync(smokeScriptPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      package: string;
      publicRegistry: string;
      sourceDirectory: string;
      tagPrefix: string;
      npmTag: string;
      distributionCommand: string;
      bin: string;
      requiredReleaseFiles: string[];
    };
    const workflow = readFileSync(workflowPath, "utf8");
    const smokeScript = readFileSync(smokeScriptPath, "utf8");

    expect(manifest).toEqual({
      package: "@debugbundle/mcp",
      publicRegistry: "https://registry.npmjs.org",
      sourceDirectory: "apps/mcp",
      tagPrefix: "mcp-v",
      npmTag: "latest",
      distributionCommand: "npx @debugbundle/mcp",
      bin: "debugbundle-mcp",
      requiredReleaseFiles: ["package.json", "README.md", "LICENSE", "server.json", "bin/debugbundle-mcp.js"]
    });

    expect(workflow).toContain("apps/mcp/release-manifest.json");
    expect(workflow).toContain('mcp-v*');
    expect(workflow).toContain('0.1.0');
    expect(workflow).toContain('node-version: [22, 24, 26]');
    expect(workflow).toContain('needs: validate');
    expect(workflow).toContain('steps.published_state.outputs.state == \'all\'');
    expect(workflow).toContain('unexpected_prerelease_version');
    expect(workflow).toContain('tests/apps/mcp/mcp-workspace-package.test.ts');
    expect(workflow).toContain('tests/apps/mcp/mcp-stdio-server.test.ts');
    expect(workflow).toContain('tests/apps/mcp/mcp-default-tools.test.ts');
    expect(workflow).toContain('tests/apps/mcp/mcp-clawhub-skill.test.ts');
    expect(workflow).toContain("npm pack ./apps/mcp");
    expect(workflow).toContain("npm publish ./apps/mcp --tag latest --access public");
    expect(workflow).toContain('npm view "@debugbundle/mcp@${RELEASE_VERSION}" version');
    expect(workflow).toContain("node scripts/smoke-mcp-stdio.mjs");
    expect(workflow).toContain('for attempt in $(seq 1 30)');
    expect(workflow).toContain('sleep 10');
    expect(workflow).not.toContain('Prerelease');
    expect(workflow).not.toContain('--tag next');
    expect(workflow).not.toContain("cache: pnpm");
    expect(workflow).not.toContain("gh release create");
    expect(smokeScript).toContain('method: "tools/list"');
    expect(smokeScript).toContain('tool.name === "doctor"');
  });

  it("wires the root workspace to consume the mcp package through workspace linking", () => {
    const packageJson = readPackageJson("../../../package.json");

    expect(packageJson.engines).toEqual({ node: ">=22 <27" });
    expect(packageJson.devDependencies).toMatchObject({
      "@debugbundle/mcp": "workspace:*"
    });
    expect(packageJson.scripts).toMatchObject({
      "mcp:start": "pnpm --filter @debugbundle/mcp start"
    });
  });
});
