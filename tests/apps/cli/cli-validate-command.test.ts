import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { setupCommand } from "../../../apps/cli/src/setup-command.js";
import { validateCommand } from "../../../apps/cli/src/validate-command.js";

const validateGolden = await readFile(new URL("../../fixtures/cli-validate.golden.txt", import.meta.url), "utf8");

async function createValidateFixtureRepository(): Promise<string> {
  const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-validate-"));

  await mkdir(join(rootDirectory, "apps", "api"), { recursive: true });
  await mkdir(join(rootDirectory, "apps", "worker"), { recursive: true });

  await writeFile(
    join(rootDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "checkout-app",
        packageManager: "pnpm@11.3.0",
        scripts: {
          build: "tsc --noEmit -p tsconfig.json",
          test: "vitest run",
          lint: "eslint ."
        },
        dependencies: {
          fastify: "^5.0.0"
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(join(rootDirectory, "pnpm-workspace.yaml"), 'packages:\n  - "apps/*"\n', "utf8");
  await writeFile(join(rootDirectory, "tsconfig.json"), '{"compilerOptions":{"strict":true}}\n', "utf8");
  await writeFile(join(rootDirectory, "AGENTS.md"), "# Repository Rules\n", "utf8");

  return rootDirectory;
}

describe("cli validate command", () => {
  it("reports healthy local validation output for the generated scaffold", async () => {
    const rootDirectory = await createValidateFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    const result = await validateCommand(
      {},
      {
        cwd: () => rootDirectory
      }
    );

    expect(result).toEqual({
      exitCode: 0,
      output: validateGolden
    });
  });

  it("returns setup-style json errors for invalid profile content and missing generated files", async () => {
    const rootDirectory = await createValidateFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    await writeFile(
      join(rootDirectory, ".debugbundle", "profile.json"),
      `${JSON.stringify(
        {
          profile_version: "v1",
          project: {
            repo_url: "",
            primary_languages: ["TypeScript"],
            package_managers: ["pnpm"],
            deployment_targets: ["docker-compose"]
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await rm(join(rootDirectory, ".debugbundle", "local", "connection.json"));
    await rm(join(rootDirectory, ".agents", "skills", "debugbundle", "SKILL.md"));

    const result = await validateCommand(
      {
        json: true
      },
      {
        cwd: () => rootDirectory
      }
    );

    const parsed = JSON.parse(result.output) as {
      status: string;
      checks: Array<{ name: string; status: string; message: string }>;
      errors: string[];
      auto_fix_available: boolean;
    };

    expect(result.exitCode).toBe(4);
    expect(parsed.status).toBe("error");
    expect(parsed.checks).toContainEqual({
      name: "profile-schema",
      status: "error",
      message: "Profile validation failed with 7 errors."
    });
    expect(parsed.checks).toContainEqual({
      name: "connection-config",
      status: "missing",
      message: "Missing .debugbundle/local/connection.json"
    });
    expect(parsed.checks).toContainEqual({
      name: "agent-skill",
      status: "missing",
      message: "Missing .agents/skills/debugbundle/SKILL.md"
    });
    expect(parsed.errors).toContain("Missing .debugbundle/local/connection.json");
    expect(parsed.errors).toContain("Missing .agents/skills/debugbundle/SKILL.md");
    expect(parsed.auto_fix_available).toBe(true);
  });

  it("recreates missing generated files in fix mode without overwriting the profile", async () => {
    const rootDirectory = await createValidateFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    const originalProfile = await readFile(join(rootDirectory, ".debugbundle", "profile.json"), "utf8");

    await rm(join(rootDirectory, ".debugbundle", "local", "connection.json"));
    await rm(join(rootDirectory, ".agents", "skills", "debugbundle", "SKILL.md"));
    await rm(join(rootDirectory, ".agents", "skills", "debugbundle", "references", "cli.md"));
    await rm(join(rootDirectory, ".agents", "skills", "debugbundle", "references", "mcp.md"));
    await rm(join(rootDirectory, ".agents", "skills", "debugbundle", "references", "bundle-schema.md"));
    await rm(join(rootDirectory, ".agents", "skills", "debugbundle", "references", "profile-enrichment.md"));
    await rm(join(rootDirectory, ".agents", "skills", "debugbundle", "assets", "schemas", "improvement-analysis.json"));
    await rm(join(rootDirectory, ".agents", "skills", "debugbundle", "assets", "schemas", "performance-analysis.json"));
    await rm(join(rootDirectory, ".agents", "skills", "debugbundle", "evals", "evals.json"));
    await writeFile(join(rootDirectory, ".gitignore"), "node_modules/\n", "utf8");

    const result = await validateCommand(
      {
        fix: true,
        json: true
      },
      {
        cwd: () => rootDirectory
      }
    );

    const parsed = JSON.parse(result.output) as {
      status: string;
      checks: Array<{ name: string; status: string; message: string }>;
      errors: string[];
      auto_fix_available: boolean;
    };

    expect(result.exitCode).toBe(0);
    expect(parsed.status).toBe("healthy");
    expect(parsed.errors).toEqual([]);
    expect(parsed.auto_fix_available).toBe(false);
    expect(parsed.checks).toContainEqual({
      name: "connection-config",
      status: "ok",
      message: "Wrote missing .debugbundle/local/connection.json"
    });
    expect(parsed.checks).toContainEqual({
      name: "gitignore",
      status: "ok",
      message: "Updated .gitignore"
    });

    expect(await readFile(join(rootDirectory, ".debugbundle", "profile.json"), "utf8")).toBe(originalProfile);
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "SKILL.md"), "utf8")).toContain("name: debugbundle");
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "references", "cli.md"), "utf8")).toContain("debugbundle setup");
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "assets", "schemas", "improvement-analysis.json"), "utf8")).toContain(
      '"analysis_type": "improvement"'
    );
    expect(await readFile(join(rootDirectory, ".gitignore"), "utf8")).toContain("# DebugBundle (managed by debugbundle setup)");
    expect(await readFile(join(rootDirectory, ".gitignore"), "utf8")).toContain(".debugbundle/local/*");
    expect(await readFile(join(rootDirectory, ".gitignore"), "utf8")).toContain("!.debugbundle/local/connection.json");
  });

  it("reports and refreshes stale generated skill guidance", async () => {
    const rootDirectory = await createValidateFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    await writeFile(join(rootDirectory, ".agents", "skills", "debugbundle", "SKILL.md"), "---\nname: debugbundle\ndescription: stale\n---\n", "utf8");

    const staleResult = await validateCommand(
      {
        json: true
      },
      {
        cwd: () => rootDirectory
      }
    );

    const staleParsed = JSON.parse(staleResult.output) as {
      status: string;
      checks: Array<{ name: string; status: string; message: string }>;
      warnings: string[];
      auto_fix_available: boolean;
    };

    expect(staleResult.exitCode).toBe(0);
    expect(staleParsed.status).toBe("warning");
    expect(staleParsed.auto_fix_available).toBe(true);
    expect(staleParsed.checks).toContainEqual({
      name: "agent-skill",
      status: "warning",
      message: "Stale .agents/skills/debugbundle/SKILL.md; run debugbundle validate --fix to refresh it."
    });
    expect(staleParsed.warnings).toContain("Stale .agents/skills/debugbundle/SKILL.md; run debugbundle validate --fix to refresh it.");

    const fixedResult = await validateCommand(
      {
        fix: true,
        json: true
      },
      {
        cwd: () => rootDirectory
      }
    );

    const fixedParsed = JSON.parse(fixedResult.output) as {
      status: string;
      checks: Array<{ name: string; status: string; message: string }>;
      auto_fix_available: boolean;
    };

    expect(fixedResult.exitCode).toBe(0);
    expect(fixedParsed.status).toBe("healthy");
    expect(fixedParsed.auto_fix_available).toBe(false);
    expect(fixedParsed.checks).toContainEqual({
      name: "agent-skill",
      status: "ok",
      message: "Updated stale .agents/skills/debugbundle/SKILL.md"
    });
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "SKILL.md"), "utf8")).toContain("Investigation Quickstart");
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "SKILL.md"), "utf8")).toContain(
      "For deterministic local source-code, UI, layout, copy, calculation, refactor, or test-only issues, inspect source and tests first."
    );
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "SKILL.md"), "utf8")).toContain(
      "For user-reported production incidents, check cloud incidents after local incidents and explicitly report whether each source had matches."
    );
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "SKILL.md"), "utf8")).toContain(
      "## Investigation Controls"
    );
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "SKILL.md"), "utf8")).toContain(
      "## Availability Checks"
    );
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "SKILL.md"), "utf8")).toContain(
      "## Notification Delivery"
    );
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "references", "cli.md"), "utf8")).toContain(
      "debugbundle health checks list --project-id <id>"
    );
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "references", "cli.md"), "utf8")).toContain(
      "debugbundle webhook deliveries <webhook-id> --project-id <id>"
    );
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "references", "mcp.md"), "utf8")).toContain(
      "## Availability Check Tools"
    );
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "references", "mcp.md"), "utf8")).toContain(
      "## Probe Tools"
    );
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "references", "mcp.md"), "utf8")).toContain(
      "Use the same runtime-evidence-gated workflow through MCP"
    );
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "references", "mcp.md"), "utf8")).toContain(
      "https://debugbundle.com/docs/api/ingestion"
    );
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "SKILL.md"), "utf8")).toContain(
      "## Noise Management"
    );
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "SKILL.md"), "utf8")).toContain(
      "debugbundle capture-rule suggest <incident-id> --json"
    );
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "SKILL.md"), "utf8")).toContain(
      "https://debugbundle.com/docs/managing-noise"
    );
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "references", "cli.md"), "utf8")).toContain(
      "https://debugbundle.com/docs/managing-noise"
    );
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "references", "mcp.md"), "utf8")).toContain(
      "https://debugbundle.com/docs/managing-noise"
    );
  });
});
