import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

const requiredRootFiles = [
  "README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  "CHANGELOG.md"
] as const;

const requiredExamples = ["express-basic", "fastify-basic", "nextjs-basic"] as const;

describe("release governance baseline", () => {
  it("ships a repo CI workflow that runs on pull requests and main pushes", () => {
    const ciWorkflowPath = join(repoRoot, ".github", "workflows", "ci.yml");

    expect(existsSync(ciWorkflowPath)).toBe(true);

    const ciWorkflow = readFileSync(ciWorkflowPath, "utf8");

    expect(ciWorkflow).toContain("name: CI");
    expect(ciWorkflow).toContain("push:");
    expect(ciWorkflow).toContain("branches:");
    expect(ciWorkflow).toContain("- main");
    expect(ciWorkflow).toContain("pull_request:");
    expect(ciWorkflow).toContain("pnpm lint");
    expect(ciWorkflow).toContain("pnpm typecheck");
    expect(ciWorkflow).toContain("pnpm test");
    expect(ciWorkflow).toContain("pnpm coverage:changed");
    expect(ciWorkflow).toContain("pnpm build");
    expect(ciWorkflow).not.toContain("configure-aws-credentials");
    expect(ciWorkflow).not.toContain("HOSTED_DEPLOY_ROLE_ARN");
  });

  it("ships the required public repository files and templates", () => {
    for (const fileName of requiredRootFiles) {
      expect(existsSync(join(repoRoot, fileName))).toBe(true);
    }

    const bugTemplatePath = join(repoRoot, ".github", "ISSUE_TEMPLATE", "bug_report.yml");
    const featureTemplatePath = join(repoRoot, ".github", "ISSUE_TEMPLATE", "feature_request.yml");
    const pullRequestTemplatePath = join(repoRoot, ".github", "PULL_REQUEST_TEMPLATE.md");

    expect(existsSync(bugTemplatePath)).toBe(true);
    expect(existsSync(featureTemplatePath)).toBe(true);
    expect(existsSync(pullRequestTemplatePath)).toBe(true);

    const bugTemplate = readFileSync(bugTemplatePath, "utf8");
    const featureTemplate = readFileSync(featureTemplatePath, "utf8");
    const pullRequestTemplate = readFileSync(pullRequestTemplatePath, "utf8");

    expect(bugTemplate).toContain("name: Bug Report");
    expect(bugTemplate).toContain("type: textarea");
    expect(featureTemplate).toContain("name: Feature Request");
    expect(featureTemplate).toContain("type: textarea");
    expect(pullRequestTemplate).toContain("Tests");
    expect(pullRequestTemplate).toContain("Docs");
    expect(pullRequestTemplate).toContain("Breaking changes");
  });

  it("documents the required README and security policy structure", () => {
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    const security = readFileSync(join(repoRoot, "SECURITY.md"), "utf8");
    const license = readFileSync(join(repoRoot, "LICENSE"), "utf8");
    const changelog = readFileSync(join(repoRoot, "CHANGELOG.md"), "utf8");

    expect(readme).toContain("DebugBundle");
    expect(readme).toContain("Production debugging bundles for AI agents");
    expect(readme).toContain("## Why DebugBundle?");
    expect(readme).toContain("Key properties:");
    expect(readme).toContain("## Quick Start");
    expect(readme).toContain("## Install an SDK");
    expect(readme).toContain("## CLI, API, and MCP");
    expect(readme).toContain("## Documentation");
    expect(readme).toContain("## Self-Hosting");
    expect(readme).toContain("## Contributing");
    expect(readme).toContain("## License");

    expect(security).toContain("Reporting a Vulnerability");
    expect(security).toContain("public issues");
    expect(security).toContain("Initial triage");
    expect(security).toContain("Supported Versions");

    expect(license).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
    expect(license).toContain("Version 3, 19 November 2007");

    expect(changelog).toContain("## [Unreleased]");
    expect(changelog).toMatch(/## \[0\.1\.0\] - \d{4}-\d{2}-\d{2}/);
  });

  it("ships the required example app scaffolds", () => {
    for (const exampleName of requiredExamples) {
      const exampleRoot = join(repoRoot, "examples", exampleName);
      const readmePath = join(exampleRoot, "README.md");
      const packageJsonPath = join(exampleRoot, "package.json");
      const envExamplePath = join(exampleRoot, ".env.example");

      expect(existsSync(readmePath)).toBe(true);
      expect(existsSync(packageJsonPath)).toBe(true);
      expect(existsSync(envExamplePath)).toBe(true);

      const readme = readFileSync(readmePath, "utf8");
      const packageJson = readFileSync(packageJsonPath, "utf8");
      const envExample = readFileSync(envExamplePath, "utf8");

      expect(readme).toContain("DebugBundle");
      expect(readme).toContain("debugbundle setup");
      expect(readme).toContain("debugbundle inspect");
      expect(packageJson).toContain("@debugbundle/sdk-node");
      expect(envExample).toContain("DEBUGBUNDLE_PROJECT_TOKEN=");
    }
  });
});
