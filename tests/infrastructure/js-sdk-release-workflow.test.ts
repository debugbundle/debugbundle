import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("shared js package release workflow", () => {
  it("validates independent stable shared package versions before registry checks", () => {
    const workflow = readFileSync(
      join(repoRoot, ".github/workflows/release-shared-js-packages.yml"),
      "utf8"
    );
    const validation = workflow
      .split("- name: Validate shared package versions")[1]!
      .split("\n      - name:")[0]!;
    const script = validation
      .split("<<'EOF'\n")[1]!
      .split("\n          EOF")[0]!
      .split("\n")
      .map((line) => line.slice(10))
      .join("\n");
    const directory = mkdtempSync(join(tmpdir(), "debugbundle-shared-versions-"));
    try {
      for (const [name, version] of [
        ["shared-types", "3.0.0"],
        ["redaction", "2.7.0"]
      ]) {
        mkdirSync(join(directory, "packages", name!), { recursive: true });
        writeFileSync(
          join(directory, "packages", name!, "package.json"),
          JSON.stringify({ name: `@debugbundle/${name}`, version })
        );
      }
      const output = join(directory, "output");
      const run = (version: string) =>
        execFileSync(process.execPath, ["--input-type=module"], {
          cwd: directory,
          input: script,
          env: { ...process.env, RELEASE_VERSION: version, GITHUB_OUTPUT: output },
          stdio: ["pipe", "pipe", "pipe"]
        });
      expect(() => run("3.0.0")).not.toThrow();
      expect(readFileSync(output, "utf8")).toContain("redaction=2.7.0");
      expect(() => run("2.7.0")).toThrow();
      writeFileSync(
        join(directory, "packages/redaction/package.json"),
        JSON.stringify({ name: "@debugbundle/redaction", version: "2.7.0-rc.1" })
      );
      expect(() => run("3.0.0")).toThrow();
      expect(workflow.indexOf("- name: Validate shared package versions")).toBeLessThan(
        workflow.indexOf("- name: Check published shared package state")
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it.each(["shared-types", "redaction"])(
    "identifies the trusted publishing repository for %s",
    (name) => {
      const manifest = JSON.parse(
        readFileSync(join(repoRoot, "packages", name, "package.json"), "utf8")
      );
      expect(manifest.repository).toEqual({
        type: "git",
        url: "git+https://github.com/debugbundle/debugbundle.git",
        directory: `packages/${name}`
      });
      const prepare = readFileSync(join(repoRoot, "scripts/prepare-shared-js-release.mjs"), "utf8");
      expect(prepare).toContain("repository: sourcePackageJson.repository");
    }
  );

  it.each(["shared-js-packages", "cli-package", "mcp-package"])(
    "uses token-free publishing for %s",
    (name) => {
      const workflow = readFileSync(
        join(repoRoot, ".github/workflows", `release-${name}.yml`),
        "utf8"
      );
      const publishJob = workflow.split("\n  release:\n")[1];
      expect(publishJob).toMatch(/permissions:\n      contents: read\n      id-token: write/);
      expect(publishJob).toContain("npm install --global npm@11.5.2");
      expect(workflow).not.toContain("secrets.NPM_TOKEN");
      expect(workflow).not.toContain("NODE_AUTH_TOKEN");
    }
  );

  it("ships the core-owned shared package workflow aligned with the dedicated sdk repo split", () => {
    const workflowPath = join(repoRoot, ".github", "workflows", "release-shared-js-packages.yml");

    expect(existsSync(workflowPath)).toBe(true);

    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("name: Release Shared JS Packages");
    expect(workflow).toContain("shared-js-v*");
    expect(workflow).toContain("steps.published_state.outputs.state == 'all'");
    expect(workflow).toContain(
      "npm publish ./.tmp/shared-js-publish/shared-types --tag latest --access public"
    );
    expect(workflow).toContain(
      "npm publish ./.tmp/shared-js-publish/redaction --tag latest --access public"
    );
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
