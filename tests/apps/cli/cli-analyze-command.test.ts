import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BundleV1Schema } from "../../../packages/shared-types/src/index.js";
import { analyzeCommand } from "../../../apps/cli/src/analyze-command.js";
import { setupCommand } from "../../../apps/cli/src/setup-command.js";

const sourceBundleFixture = await readFile(new URL("../../fixtures/build-bundle.deploy-metadata.golden.json", import.meta.url), "utf8");

async function createAnalyzeFixtureRepository(): Promise<string> {
  const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-analyze-"));

  await mkdir(join(rootDirectory, "apps", "api", "src"), { recursive: true });
  await mkdir(join(rootDirectory, "apps", "worker", "src"), { recursive: true });

  await writeFile(
    join(rootDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "checkout-app",
        packageManager: "pnpm@10.32.1",
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
  await writeFile(
    join(rootDirectory, "apps", "api", "src", "checkout.ts"),
    [
      "export function handleCheckout(): string {",
      '  return "ok";',
      "}"
    ].join("\n") + "\n",
    "utf8"
  );

  return rootDirectory;
}

describe("cli analyze command", () => {
  it("builds a deterministic local improvement analysis bundle in json mode", async () => {
    const rootDirectory = await createAnalyzeFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    await writeFile(
      join(rootDirectory, ".debugbundle", "bundles", "local", "inc_fixture.bundle.json"),
      sourceBundleFixture,
      "utf8"
    );

    const result = await analyzeCommand(
      {
        type: "improvement",
        local: true,
        json: true
      },
      {
        cwd: () => rootDirectory
      }
    );

    expect(result.exitCode).toBe(0);

    const parsed = BundleV1Schema.parse(JSON.parse(result.output));
    expect(parsed.bundle_type).toBe("improvement");
    expect(parsed.sdk).toEqual({
      name: "debugbundle-cli",
      version: "0.1.0"
    });
    expect(parsed.project.id).toBe("proj_fixture");
    expect(parsed.service.name).toBe("checkout-api");
    expect(parsed.summary.title).toBe("Improvement analysis for TypeError at checkout");
    expect(parsed.summary.description).toContain("1 local bundle");
    expect(parsed.summary.description).toContain("apps/api/src/checkout.ts");
    expect(parsed.links.docs).toBe(".agents/skills/debugbundle/assets/schemas/improvement-analysis.json");
    expect(parsed.metadata.generator_version).toBe("cli-analyze-v1");
  });

  it("returns a validation error when no local source bundles are available", async () => {
    const rootDirectory = await createAnalyzeFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    const result = await analyzeCommand(
      {
        type: "improvement",
        local: true,
        json: true
      },
      {
        cwd: () => rootDirectory
      }
    );

    expect(result.exitCode).toBe(3);
    expect(JSON.parse(result.output)).toEqual({
      error: "local_bundle_not_found",
      message: "No local bundle artifacts were found under .debugbundle/bundles/local.",
      suggested_actions: [
        "Fetch or generate a local DebugBundle bundle before running debugbundle analyze.",
        "Run debugbundle setup if the local .debugbundle scaffold is missing."
      ]
    });
  });

  it("rejects unsupported analysis types", async () => {
    const result = await analyzeCommand({ type: "failure", json: true });

    expect(result.exitCode).toBe(4);
    expect(JSON.parse(result.output)).toEqual({
      error: "unsupported_analysis_type",
      message: 'Unsupported analysis type "failure". Local analysis currently supports improvement only.',
      suggested_actions: [
        "Run debugbundle analyze --type improvement --local for deterministic local analysis.",
        "Use the generated scaffold recipes under .agents/skills/debugbundle/assets/schemas/ as the current local analysis contract."
      ]
    });
  });

  it("returns an invalid profile error before loading recipes or bundles", async () => {
    const rootDirectory = await createAnalyzeFixtureRepository();

    const result = await analyzeCommand(
      {
        type: "improvement",
        local: true,
        json: true
      },
      {
        cwd: () => rootDirectory
      }
    );

    expect(result.exitCode).toBe(4);
    expect(JSON.parse(result.output)).toEqual({
      error: "invalid_profile",
      message: "Invalid .debugbundle/profile.json.",
      suggested_actions: [
        "Run debugbundle profile validate to inspect field-level profile errors.",
        "Run debugbundle validate --fix to restore any missing local DebugBundle stubs."
      ]
    });
  });

  it("builds human-readable analysis output from the newest bundle and handles empty relevant source files", async () => {
    const rootDirectory = await createAnalyzeFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    const generatedProfile = JSON.parse(await readFile(join(rootDirectory, ".debugbundle", "profile.json"), "utf8")) as {
      services: Array<{ paths?: string[] }>;
    } & Record<string, unknown>;
    generatedProfile.services = generatedProfile.services.map((service, index) =>
      index === 0
        ? {
            ...service,
            paths: ["missing-service-path"]
          }
        : service
    );

    await writeFile(join(rootDirectory, ".debugbundle", "profile.json"), `${JSON.stringify(generatedProfile, null, 2)}\n`, "utf8");

    const olderBundle = JSON.parse(sourceBundleFixture) as Record<string, unknown>;
    olderBundle["bundle_id"] = "bundle_older";
    olderBundle["captured_at"] = "2026-03-14T00:00:00.000Z";

    const newerBundle = JSON.parse(sourceBundleFixture) as Record<string, unknown>;
    newerBundle["bundle_id"] = "bundle_newer";
    newerBundle["captured_at"] = "2026-03-14T00:01:00.000Z";

    await writeFile(
      join(rootDirectory, ".debugbundle", "bundles", "local", "older.bundle.json"),
      JSON.stringify(olderBundle),
      "utf8"
    );
    await writeFile(
      join(rootDirectory, ".debugbundle", "bundles", "local", "newer.bundle.json"),
      JSON.stringify(newerBundle),
      "utf8"
    );

    const result = await analyzeCommand(
      {
        type: "improvement",
        local: true,
        json: false
      },
      {
        cwd: () => rootDirectory
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output.endsWith("\n")).toBe(true);
    const parsed = BundleV1Schema.parse(JSON.parse(result.output));
    expect(parsed.bundle_id).toBe("analysis_improvement_bundle_newer");
    expect(parsed.summary.description).toContain("2 local bundles");
    expect(parsed.summary.description).toContain("no relevant repository source files were detected");
    expect(parsed.summary.recommended_action).toContain("vitest run");
  });

  it("rethrows unexpected filesystem errors while walking source paths", async () => {
    const rootDirectory = await createAnalyzeFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    await writeFile(
      join(rootDirectory, ".debugbundle", "bundles", "local", "inc_fixture.bundle.json"),
      sourceBundleFixture,
      "utf8"
    );

    const readFileFromDisk = async (filePath: string): Promise<string> => readFile(filePath, "utf8");
    const readdirFromDisk = async (directoryPath: string): Promise<string[]> => {
      const { readdir } = await import("node:fs/promises");
      return readdir(directoryPath);
    };
    const statError = Object.assign(new Error("permission denied"), { code: "EACCES" });

    await expect(
      analyzeCommand(
        {
          type: "improvement",
          local: true,
          json: true
        },
        {
          cwd: () => rootDirectory,
          readFile: readFileFromDisk,
          readdir: readdirFromDisk,
          stat: async (filePath: string) => {
            if (filePath.endsWith("apps/api/src")) {
              throw statError;
            }

            const { stat } = await import("node:fs/promises");
            return stat(filePath);
          }
        }
      )
    ).rejects.toBe(statError);
  });
});