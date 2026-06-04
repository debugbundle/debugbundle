import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { setupCommand } from "../../../apps/cli/src/setup-command.js";

const setupGolden = await readFile(new URL("../../fixtures/cli-init.golden.txt", import.meta.url), "utf8");

async function createSetupFixtureRepository(): Promise<string> {
  const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-setup-"));

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
  await writeFile(
    join(rootDirectory, "docker-compose.yml"),
    [
      "services:",
      "  postgres:",
      "    image: postgres:16",
      "  redis:",
      "    image: redis:7",
      "  localstack:",
      "    image: localstack/localstack:latest"
    ].join("\n") + "\n",
    "utf8"
  );
  await writeFile(
    join(rootDirectory, "AGENTS.md"),
    [
      "# Repository Rules",
      "",
      "Existing local guidance."
    ].join("\n") + "\n",
    "utf8"
  );

  return rootDirectory;
}

async function createMetadataFixtureRepository(input: {
  packageJson?: {
    name?: string;
    packageManager?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  files?: Array<[string, string]>;
}): Promise<string> {
  const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-setup-metadata-"));

  if (input.packageJson !== undefined) {
    await writeFile(
      join(rootDirectory, "package.json"),
      `${JSON.stringify(input.packageJson, null, 2)}\n`,
      "utf8"
    );
  }

  for (const [relativePath, contents] of input.files ?? []) {
    await mkdir(join(rootDirectory, ...relativePath.split("/").slice(0, -1)), { recursive: true });
    await writeFile(join(rootDirectory, relativePath), `${contents}`, "utf8");
  }

  return rootDirectory;
}

describe("cli setup command", () => {
  it("creates the local debugbundle setup scaffold, detects a basic profile, and renders human output", async () => {
    const rootDirectory = await createSetupFixtureRepository();

    const result = await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    expect(result).toEqual({
      exitCode: 0,
      output: setupGolden
    });

    const profile = JSON.parse(await readFile(join(rootDirectory, ".debugbundle", "profile.json"), "utf8")) as {
      profile_version: string;
      project: {
        name: string;
        primary_languages: string[];
        package_managers: string[];
        deployment_targets: string[];
      };
      services: Array<{ name: string; kind: string; runtime: string; framework: string }>;
      infrastructure: {
        databases: string[];
        queues: string[];
        object_storage: string[];
      };
      developer_workflows: {
        install: string;
        build: string;
        test: string;
        lint: string;
      };
      debugbundle: {
        profile_owner: string;
        last_reviewed_at: string;
        validation_status: string;
        skill_path: string;
      };
    };

    expect(profile).toMatchObject({
      profile_version: "v1",
      project: {
        name: "checkout-app",
        primary_languages: ["TypeScript"],
        package_managers: ["pnpm"],
        deployment_targets: ["docker-compose"]
      },
      services: [
        {
          name: "api",
          kind: "backend",
          runtime: "Node.js",
          framework: "Fastify"
        },
        {
          name: "worker",
          kind: "worker",
          runtime: "Node.js",
          framework: "Fastify"
        }
      ],
      infrastructure: {
        databases: ["PostgreSQL"],
        queues: ["Redis"],
        object_storage: ["S3-compatible"]
      },
      developer_workflows: {
        install: "pnpm install",
        build: "tsc --noEmit -p tsconfig.json",
        test: "vitest run",
        lint: "eslint ."
      },
      debugbundle: {
        profile_owner: "unassigned",
        last_reviewed_at: "2026-03-14T00:00:00.000Z",
        validation_status: "static-analysis-only",
        skill_path: ".agents/skills/debugbundle"
      }
    });

    expect(JSON.parse(await readFile(join(rootDirectory, ".debugbundle", "local", "connection.json"), "utf8"))).toMatchObject({
      mode: "local-only",
      environments: {
        local: { delivery: "local-only" },
        development: { delivery: "local-only" },
        staging: { delivery: "local-only" },
        production: { delivery: "local-only" }
      }
    });

    const skillContents = await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "SKILL.md"), "utf8");
    expect(skillContents).toContain("name: debugbundle");
    expect(skillContents).toContain("resolve it with `debugbundle resolve <incident-id>` or MCP `resolve_incident`");
    expect(skillContents).toContain("If `debugbundle doctor --json` reports `mode=connected` and the target environment is cloud-enabled, check both");
    expect(skillContents).toContain("For user-reported production incidents, check cloud incidents after local incidents and explicitly report whether each source had matches.");
    expect(skillContents).toContain("## Browser Capture and Relay Setup");
    expect(skillContents).toContain("Add `@debugbundle/sdk-browser` to each browser app");
    expect(skillContents).toContain("For split frontend/backend hosts, configure the browser endpoint to the API host relay URL");

    const cliReferenceContents = await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "references", "cli.md"), "utf8");
    expect(cliReferenceContents).toContain("debugbundle setup");
    expect(cliReferenceContents).toContain("debugbundle resolve <incident-id>");
    expect(cliReferenceContents).toContain("Smoke-Test Cleanup Recipe");
    expect(cliReferenceContents).toContain("smoke test|dogfood|verification|synthetic");

    const mcpReferenceContents = await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "references", "mcp.md"), "utf8");
    expect(mcpReferenceContents).toContain("resolve_incident");
    expect(mcpReferenceContents).toContain("Smoke-Test Cleanup Recipe");

    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "references", "profile-enrichment.md"), "utf8")).toContain("validation_status");
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "assets", "schemas", "improvement-analysis.json"), "utf8")).toContain(
      '"analysis_type": "improvement"'
    );
    expect(await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "assets", "schemas", "performance-analysis.json"), "utf8")).toContain(
      '"analysis_type": "performance"'
    );
    const skillEvalsContents = await readFile(join(rootDirectory, ".agents", "skills", "debugbundle", "evals", "evals.json"), "utf8");
    expect(skillEvalsContents).toContain("incident_first_workflow");
    expect(skillEvalsContents).toContain("incident_resolution_hygiene");
    expect(skillEvalsContents).toContain("Check both local and cloud incident sources when the project is connected and the environment is cloud-enabled.");
    expect(skillEvalsContents).toContain("Explicitly report whether the local source, the cloud source, or both had matches.");
    expect(await readFile(join(rootDirectory, ".gitignore"), "utf8")).toContain("# DebugBundle (managed by debugbundle setup)");
    expect(await readFile(join(rootDirectory, ".gitignore"), "utf8")).toContain(".debugbundle/local/*");
    expect(await readFile(join(rootDirectory, ".gitignore"), "utf8")).toContain("!.debugbundle/local/connection.json");

    const agentsContents = await readFile(join(rootDirectory, "AGENTS.md"), "utf8");
    expect(agentsContents).toContain("<!-- debugbundle:start -->");
    expect(agentsContents).toContain(".agents/skills/debugbundle/SKILL.md");
    expect(agentsContents).toContain("resolve it with `debugbundle resolve <incident-id>` or MCP `resolve_incident`");

    await expect(stat(join(rootDirectory, ".debugbundle", "agent-guide.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(join(rootDirectory, "skills", "debugbundle"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("returns setup-style json output and keeps managed sections idempotent", async () => {
    const rootDirectory = await createSetupFixtureRepository();

    const firstResult = await setupCommand(
      {
        json: true
      },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    expect(firstResult.exitCode).toBe(0);
    expect(JSON.parse(firstResult.output)).toEqual({
      status: "warning",
      detected_services: [
        {
          name: "api",
          kind: "backend",
          runtime: "Node.js",
          framework: "Fastify",
          paths: ["apps/api"],
          owns_routes: [],
          depends_on: []
        },
        {
          name: "worker",
          kind: "worker",
          runtime: "Node.js",
          framework: "Fastify",
          paths: ["apps/worker"],
          owns_routes: [],
          depends_on: []
        }
      ],
      selected_targets: ["api", "worker"],
      relay_action: "none",
      relay_guidance: [],
      checks: [
        {
          name: "profile",
          status: "ok",
          message: "Wrote .debugbundle/profile.json"
        },
        {
          name: "connection-config",
          status: "ok",
          message: "Wrote .debugbundle/local/connection.json"
        },
        {
          name: "agent-skill",
          status: "ok",
          message: "Wrote .agents/skills/debugbundle/SKILL.md"
        },
        {
          name: "skill-references",
          status: "ok",
          message: "Wrote .agents/skills/debugbundle/references/*"
        },
        {
          name: "analysis-recipes",
          status: "ok",
          message: "Wrote .agents/skills/debugbundle/assets/schemas/*"
        },
        {
          name: "skill-evals",
          status: "ok",
          message: "Wrote .agents/skills/debugbundle/evals/evals.json"
        },
        {
          name: "gitignore",
          status: "ok",
          message: "Updated .gitignore"
        },
        {
          name: "agents-integration",
          status: "ok",
          message: "Updated AGENTS.md"
        },
        {
          name: "profile-validation",
          status: "warning",
          message: "Profile generated from static analysis; validate it before relying on framework or ownership details."
        }
      ],
      warnings: [
        "Profile generated from static analysis; validate it before relying on framework or ownership details."
      ],
      errors: [],
      suggested_actions: [
        "Review .debugbundle/profile.json and confirm services, frameworks, and workflows.",
        "Read .agents/skills/debugbundle/SKILL.md and run the Profile Validation task.",
        "Run debugbundle process after local events have been captured."
      ],
      auto_fix_available: false
    });

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    const agentsContents = await readFile(join(rootDirectory, "AGENTS.md"), "utf8");
    const gitignoreContents = await readFile(join(rootDirectory, ".gitignore"), "utf8");
    expect(agentsContents.match(/<!-- debugbundle:start -->/g)).toHaveLength(1);
    expect(agentsContents.match(/<!-- debugbundle:end -->/g)).toHaveLength(1);
    expect(gitignoreContents.match(/# DebugBundle \(managed by debugbundle setup\)/g)).toHaveLength(1);
    expect(gitignoreContents).toContain(".debugbundle/local/*");
    expect(gitignoreContents).toContain("!.debugbundle/local/connection.json");
  });

  it("accepts non-interactive setup mode while keeping scaffold output deterministic", async () => {
    const rootDirectory = await createSetupFixtureRepository();

    const result = await setupCommand(
      {
        nonInteractive: true
      },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    expect(result).toEqual({
      exitCode: 0,
      output: setupGolden
    });

    expect(JSON.parse(await readFile(join(rootDirectory, ".debugbundle", "local", "connection.json"), "utf8"))).toMatchObject({
      mode: "local-only"
    });
  });

  it("infers python, php, and yarn setup metadata from alternate fixture layouts", async () => {
    const pythonRoot = await createMetadataFixtureRepository({
      files: [
        ["pyproject.toml", "[project]\nname = \"python-service\"\n"],
        ["poetry.lock", ""]
      ]
    });

    const pythonResult = await setupCommand(
      {},
      {
        cwd: () => pythonRoot,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    expect(pythonResult.exitCode).toBe(0);

    const pythonProfile = JSON.parse(await readFile(join(pythonRoot, ".debugbundle", "profile.json"), "utf8")) as {
      project: { primary_languages: string[]; package_managers: string[] };
      developer_workflows: { install: string; build: string; test: string; lint: string };
      services: Array<unknown>;
    };

    expect(pythonProfile).toMatchObject({
      project: {
        primary_languages: ["Python"],
        package_managers: ["poetry"]
      },
      developer_workflows: {
        install: "poetry install",
        build: "manual",
        test: "manual",
        lint: "manual"
      },
      services: []
    });

    const phpRoot = await createMetadataFixtureRepository({
      files: [["composer.json", "{}\n"]]
    });

    const phpResult = await setupCommand(
      {},
      {
        cwd: () => phpRoot,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    expect(phpResult.exitCode).toBe(0);

    const phpProfile = JSON.parse(await readFile(join(phpRoot, ".debugbundle", "profile.json"), "utf8")) as {
      project: { primary_languages: string[]; package_managers: string[] };
      developer_workflows: { install: string };
    };

    expect(phpProfile).toMatchObject({
      project: {
        primary_languages: ["PHP"],
        package_managers: ["composer"]
      },
      developer_workflows: {
        install: "composer install"
      }
    });

    const yarnRoot = await createMetadataFixtureRepository({
      packageJson: {
        name: "yarn-app",
        packageManager: "yarn@4.5.0",
        dependencies: {
          next: "^16.0.0"
        }
      }
    });

    const yarnResult = await setupCommand(
      {},
      {
        cwd: () => yarnRoot,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    expect(yarnResult.exitCode).toBe(0);

    const yarnProfile = JSON.parse(await readFile(join(yarnRoot, ".debugbundle", "profile.json"), "utf8")) as {
      project: { primary_languages: string[]; package_managers: string[] };
      developer_workflows: { install: string };
    };

    expect(yarnProfile).toMatchObject({
      project: {
        primary_languages: ["JavaScript"],
        package_managers: ["yarn"]
      },
      developer_workflows: {
        install: "yarn install"
      }
    });
  });

  it("surfaces malformed package.json parsing failures", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-setup-invalid-package-json-"));

    await writeFile(join(rootDirectory, "package.json"), "{not-json}\n", "utf8");

    await expect(
      setupCommand(
        {},
        {
          cwd: () => rootDirectory,
          now: () => new Date("2026-03-14T00:00:00.000Z")
        }
      )
    ).resolves.toEqual({
      exitCode: 1,
      output: expect.stringMatching(/Expected property name|Unexpected|JSON/)
    });
  });

  it("surfaces stat failures while building the setup profile", async () => {
    const rootDirectory = await createSetupFixtureRepository();

    const result = await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z"),
        stat: vi.fn().mockImplementation(async (path: string): Promise<{ isDirectory(): boolean }> => {
          if (path.endsWith("tsconfig.json")) {
            throw new Error("stat_failed");
          }

          return stat(path);
        })
      }
    );

    expect(result).toEqual({
      exitCode: 1,
      output: "stat_failed"
    });
  });

  it("warns when AGENTS.md is absent and infers non-TypeScript project metadata", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-setup-js-"));

    await mkdir(join(rootDirectory, "apps", "frontend-web"), { recursive: true });
    await mkdir(join(rootDirectory, "apps", "queue-worker"), { recursive: true });
    await writeFile(
      join(rootDirectory, "package.json"),
      `${JSON.stringify(
        {
          name: "web-dashboard",
          packageManager: "npm@11.0.0",
          dependencies: {
            next: "^16.0.0"
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await writeFile(join(rootDirectory, "package-lock.json"), "{}\n", "utf8");
    await writeFile(join(rootDirectory, "Makefile"), "install:\n\t@true\n", "utf8");

    const result = await setupCommand(
      {
        json: true
      },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    const parsed = JSON.parse(result.output) as {
      status: string;
      checks: Array<{ name: string; status: string; message: string }>;
      warnings: string[];
    };
    const profile = JSON.parse(await readFile(join(rootDirectory, ".debugbundle", "profile.json"), "utf8")) as {
      project: { primary_languages: string[]; package_managers: string[]; deployment_targets: string[] };
      services: Array<{ name: string; kind: string; runtime: string; framework: string }>;
      developer_workflows: { install: string; build: string; test: string; lint: string };
    };

    expect(parsed.status).toBe("warning");
    expect(parsed.checks).toContainEqual({
      name: "agents-integration",
      status: "warning",
      message: "AGENTS.md not found; skipped managed DebugBundle section."
    });
    expect(parsed.warnings).toContain("Profile generated from static analysis; validate it before relying on framework or ownership details.");
    expect(profile).toMatchObject({
      project: {
        primary_languages: ["JavaScript"],
        package_managers: ["npm"],
        deployment_targets: []
      },
      services: [
        {
          name: "frontend-web",
          kind: "frontend",
          runtime: "Node.js",
          framework: "Next.js"
        },
        {
          name: "queue-worker",
          kind: "worker",
          runtime: "Node.js",
          framework: "Next.js"
        }
      ],
      developer_workflows: {
        install: "npm install",
        build: "make build",
        test: "make test",
        lint: "make lint"
      }
    });
  });

  it("surfaces initialization write failures", async () => {
    const rootDirectory = await createSetupFixtureRepository();

    const result = await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z"),
        writeFile: vi.fn().mockRejectedValue(new Error("disk_full"))
      }
    );

    expect(result).toEqual({
      exitCode: 1,
      output: "disk_full"
    });
  });

  it("surfaces infrastructure and AGENTS read failures", async () => {
    const rootDirectory = await createSetupFixtureRepository();
    const realReadFile = (path: string): Promise<string> => readFile(path, "utf8");

    const infrastructureResult = await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z"),
        readFile: vi.fn().mockImplementation(async (path: string): Promise<string> => {
          if (path.endsWith("docker-compose.yml")) {
            throw new Error("compose_read_failed");
          }

          return realReadFile(path);
        })
      }
    );

    const agentsResult = await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z"),
        readFile: vi.fn().mockImplementation(async (path: string): Promise<string> => {
          if (path.endsWith("AGENTS.md")) {
            throw new Error("agents_read_failed");
          }

          return realReadFile(path);
        })
      }
    );

    expect(infrastructureResult).toEqual({
      exitCode: 1,
      output: "compose_read_failed"
    });
    expect(agentsResult).toEqual({
      exitCode: 1,
      output: "agents_read_failed"
    });
  });
});
