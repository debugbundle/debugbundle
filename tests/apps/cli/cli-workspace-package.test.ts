import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

type PackageJsonLike = {
  name?: string;
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

function readPackageJson(relativePath: string): PackageJsonLike {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8")) as PackageJsonLike;
}

const repoRoot = process.cwd();

describe("cli workspace package", () => {
  it("defines apps/cli as a publishable package with its own debugbundle bin", () => {
    const packageJson = readPackageJson("../../../apps/cli/package.json");

    expect(packageJson.name).toBe("@debugbundle/cli");
    expect(packageJson.private).toBe(false);
    expect(packageJson.description).toBe("Command-line interface for DebugBundle");
    expect(packageJson.license).toBe("AGPL-3.0-only");
    expect(packageJson.repository).toEqual({
      type: "git",
      url: "https://github.com/debugbundle/debugbundle",
      directory: "apps/cli"
    });
    expect(packageJson.homepage).toBe("https://debugbundle.com/docs/cli");
    expect(packageJson.bugs).toEqual({ url: "https://github.com/debugbundle/debugbundle/issues" });
    expect(packageJson.keywords).toEqual(["debugbundle", "debugging", "ai-agent", "cli", "incident-response"]);
    expect(packageJson.engines).toEqual({ node: ">=22 <27" });
    expect(packageJson.type).toBe("module");
    expect(packageJson.scripts).toMatchObject({
      start: "tsx src/entrypoint.ts",
      build: "esbuild src/entrypoint.ts --bundle --platform=node --format=cjs --target=node22 --external:@node-rs/argon2 --outfile=dist/main.cjs",
      prepack: "npm run build"
    });
    expect(packageJson.bin).toEqual({
      debugbundle: "bin/debugbundle.js"
    });
    expect(packageJson.dependencies).toMatchObject({
      "@node-rs/argon2": "^2.0.2"
    });
    expect(packageJson.devDependencies).toMatchObject({
      esbuild: "^0.27.3",
      tsx: "^4.20.5"
    });
    expect(packageJson.files).toEqual(["bin", "dist", "README.md", "LICENSE"]);
  });

  it("keeps the published bin wrapper portable outside the monorepo", () => {
    const binWrapper = readFileSync(new URL("../../../apps/cli/bin/debugbundle.js", import.meta.url), "utf8");

    expect(binWrapper).toContain('resolve(packageRoot, "dist/main.cjs")');
    expect(binWrapper).toContain("createRequire");
    expect(binWrapper).toContain("require(mainPath)");
    expect(binWrapper).not.toContain("tsx");
    expect(binWrapper).not.toContain("node_modules/tsx");
    expect(binWrapper).not.toContain("../../..");
  });

  it("ships package-level README and license files", () => {
    const readme = readFileSync(new URL("../../../apps/cli/README.md", import.meta.url), "utf8");
    const license = readFileSync(new URL("../../../apps/cli/LICENSE", import.meta.url), "utf8");

    expect(readme).toContain("# @debugbundle/cli");
    expect(readme).toContain("npm install -g @debugbundle/cli");
    expect(readme).toContain("https://debugbundle.com/docs/cli");
    expect(license).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
    expect(license).toContain("Version 3, 19 November 2007");
  });

  it("ships release metadata and workflow automation for npm publication", () => {
    const manifestPath = join(repoRoot, "apps", "cli", "release-manifest.json");
    const workflowPath = join(repoRoot, ".github", "workflows", "release-cli-package.yml");

    expect(existsSync(manifestPath)).toBe(true);
    expect(existsSync(workflowPath)).toBe(true);

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

    expect(manifest).toEqual({
      package: "@debugbundle/cli",
      publicRegistry: "https://registry.npmjs.org",
      sourceDirectory: "apps/cli",
      tagPrefix: "cli-v",
      npmTag: "latest",
      distributionCommand: "npm install -g @debugbundle/cli",
      bin: "debugbundle",
      requiredReleaseFiles: ["package.json", "README.md", "LICENSE", "bin/debugbundle.js"]
    });

    expect(workflow).toContain("apps/cli/release-manifest.json");
    expect(workflow).toContain('cli-v*');
    expect(workflow).toContain('0.1.0');
    expect(workflow).toContain('node-version: [22, 24, 26]');
    expect(workflow).toContain('needs: validate');
    expect(workflow).toContain('steps.published_state.outputs.state == \'all\'');
    expect(workflow).toContain('unexpected_prerelease_version');
    expect(workflow).toContain('tests/apps/cli/cli-main-core.test.ts');
    expect(workflow).toContain('tests/apps/cli/cli-smoke-command.test.ts');
    expect(workflow).toContain('--version >/dev/null');
    expect(workflow).toContain("npm pack ./apps/cli");
    expect(workflow).toContain("npm publish ./apps/cli --tag latest --access public");
    expect(workflow).toContain('npm view "@debugbundle/cli@${RELEASE_VERSION}" version');
    expect(workflow).toContain('debugbundle-cli-${RELEASE_VERSION}.tgz');
    expect(workflow).toContain('for attempt in $(seq 1 30)');
    expect(workflow).toContain('sleep 10');
    expect(workflow).not.toContain('Prerelease');
    expect(workflow).not.toContain('--tag next');
    expect(workflow).not.toContain("cache: pnpm");
    expect(workflow).not.toContain("gh release create");
  });

  it("wires the root workspace to consume the cli package through workspace linking", () => {
    const packageJson = readPackageJson("../../../package.json");

    expect(packageJson.bin).toBeUndefined();
    expect(packageJson.engines).toEqual({ node: ">=22 <27" });
    expect(packageJson.devDependencies).toMatchObject({
      "@debugbundle/cli": "workspace:*"
    });
    expect(packageJson.scripts).toMatchObject({
      "cli:start": "pnpm --filter @debugbundle/cli start"
    });
  });
});