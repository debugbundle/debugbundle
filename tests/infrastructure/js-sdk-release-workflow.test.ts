import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("shared js package release workflow", () => {
  it.each(["shared-types", "redaction"])("identifies the trusted publishing repository for %s", (name) => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, "packages", name, "package.json"), "utf8"));
    expect(manifest.repository).toEqual({
      type: "git",
      url: "git+https://github.com/debugbundle/debugbundle.git",
      directory: `packages/${name}`
    });
    const prepare = readFileSync(join(repoRoot, "scripts/prepare-shared-js-release.mjs"), "utf8");
    expect(prepare).toContain("repository: sourcePackageJson.repository");
  });

  it.each(["shared-js-packages", "cli-package", "mcp-package"])("uses token-free publishing for %s", (name) => {
    const workflow = readFileSync(join(repoRoot, ".github/workflows", `release-${name}.yml`), "utf8");
    const publishJob = workflow.split("\n  release:\n")[1];
    expect(publishJob).toMatch(/permissions:\n      contents: read\n      id-token: write/);
    expect(publishJob).toContain("npm install --global npm@11.5.2");
    expect(workflow).not.toContain("secrets.NPM_TOKEN");
    expect(workflow).not.toContain("NODE_AUTH_TOKEN");
  });

  it("ships the core-owned shared package workflow aligned with the dedicated sdk repo split", () => {
    const workflowPath = join(repoRoot, ".github", "workflows", "release-shared-js-packages.yml");

    expect(existsSync(workflowPath)).toBe(true);

    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("name: Release Shared JS Packages");
    expect(workflow).toContain("shared-js-v*");
    expect(workflow).toContain("steps.published_state.outputs.state == 'all'");
    expect(workflow).toContain("npm publish ./.tmp/shared-js-publish/shared-types --tag latest --access public");
    expect(workflow).toContain("npm publish ./.tmp/shared-js-publish/redaction --tag latest --access public");
    expect(workflow).toContain("Smoke test published shared JS packages");
    expect(workflow).toContain("debugbundle-shared-js-registry-smoke");
    expect(workflow).toContain("for attempt in $(seq 1 30)");
    expect(workflow).toContain("sleep 10");
    expect(workflow).toContain("unexpected_prerelease_version");
    expect(workflow).not.toContain("sdk-node");
    expect(workflow).not.toContain("sdk-browser");
    expect(workflow).not.toContain("cache: pnpm");
  });
});
