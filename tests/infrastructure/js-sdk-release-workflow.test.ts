import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("shared js package release workflow", () => {
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