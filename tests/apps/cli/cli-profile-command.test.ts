import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { profileValidateCommand } from "../../../apps/cli/src/profile-command.js";

async function createProfileFixtureRepository(): Promise<string> {
  const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-profile-"));
  await mkdir(join(rootDirectory, ".debugbundle"), { recursive: true });

  return rootDirectory;
}

describe("cli profile validate command", () => {
  it("returns field-path validation errors in json mode", async () => {
    const rootDirectory = await createProfileFixtureRepository();

    await writeFile(
      join(rootDirectory, ".debugbundle", "profile.json"),
      `${JSON.stringify(
        {
          profile_version: "v1",
          project: {
            repo_url: "",
            primary_languages: [],
            package_managers: [],
            deployment_targets: []
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = await profileValidateCommand(
      {
        json: true
      },
      {
        cwd: () => rootDirectory
      }
    );

    expect(result.exitCode).toBe(4);
    expect(JSON.parse(result.output)).toEqual({
      valid: false,
      errors: [
        {
          path: "project.name",
          message: "Required"
        },
        {
          path: "services",
          message: "Required"
        },
        {
          path: "infrastructure",
          message: "Required"
        },
        {
          path: "critical_paths",
          message: "Required"
        },
        {
          path: "repo",
          message: "Required"
        },
        {
          path: "developer_workflows",
          message: "Required"
        },
        {
          path: "debugbundle",
          message: "Required"
        }
      ]
    });
  });

  it("renders a human-readable success summary for a valid profile", async () => {
    const rootDirectory = await createProfileFixtureRepository();

    await writeFile(
      join(rootDirectory, ".debugbundle", "profile.json"),
      `${JSON.stringify(
        {
          profile_version: "v1",
          project: {
            name: "checkout-app",
            repo_url: "",
            primary_languages: ["TypeScript"],
            package_managers: ["pnpm"],
            deployment_targets: ["docker-compose"]
          },
          services: [],
          infrastructure: {
            databases: [],
            queues: [],
            object_storage: [],
            external_services: []
          },
          critical_paths: [],
          repo: {
            root_paths: ["apps"],
            generated_paths: [".debugbundle"],
            do_not_edit_paths: [".debugbundle/bundles"]
          },
          developer_workflows: {
            install: "pnpm install",
            build: "pnpm build",
            test: "pnpm test",
            lint: "pnpm lint"
          },
          debugbundle: {
            profile_owner: "unassigned",
            last_reviewed_at: "2026-03-14T00:00:00.000Z",
            validation_status: "static-analysis-only",
            skill_path: ".agents/skills/debugbundle",
            notes: "ok"
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = await profileValidateCommand(
      {},
      {
        cwd: () => rootDirectory
      }
    );

    expect(result).toEqual({
      exitCode: 0,
      output: "DebugBundle profile validation passed."
    });
  });

  it("returns json success output and supports the default cwd dependency", async () => {
    const rootDirectory = await createProfileFixtureRepository();

    await writeFile(
      join(rootDirectory, ".debugbundle", "profile.json"),
      `${JSON.stringify(
        {
          profile_version: "v1",
          project: {
            name: "checkout-app",
            repo_url: "",
            primary_languages: ["TypeScript"],
            package_managers: ["pnpm"],
            deployment_targets: ["docker-compose"]
          },
          services: [],
          infrastructure: {
            databases: [],
            queues: [],
            object_storage: [],
            external_services: []
          },
          critical_paths: [],
          repo: {
            root_paths: ["apps"],
            generated_paths: [".debugbundle"],
            do_not_edit_paths: [".debugbundle/bundles"]
          },
          developer_workflows: {
            install: "pnpm install",
            build: "pnpm build",
            test: "pnpm test",
            lint: "pnpm lint"
          },
          debugbundle: {
            profile_owner: "unassigned",
            last_reviewed_at: "2026-03-14T00:00:00.000Z",
            validation_status: "static-analysis-only",
            skill_path: ".agents/skills/debugbundle",
            notes: "ok"
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(rootDirectory);

    try {
      const result = await profileValidateCommand({ json: true });

      expect(JSON.parse(result.output)).toEqual({
        valid: true,
        errors: []
      });
    } finally {
      cwdSpy.mockRestore();
      await rm(rootDirectory, { recursive: true, force: true });
    }
  });

  it("renders human-readable validation errors when profile validation fails", async () => {
    const rootDirectory = await createProfileFixtureRepository();

    const result = await profileValidateCommand(
      {},
      {
        cwd: () => rootDirectory
      }
    );

    expect(result).toEqual({
      exitCode: 4,
      output: [
        "DebugBundle profile validation failed.",
        "Errors:",
        "- .debugbundle/profile.json: Missing .debugbundle/profile.json"
      ].join("\n")
    });
  });
});