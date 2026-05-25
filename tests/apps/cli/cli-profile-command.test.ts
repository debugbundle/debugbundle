import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { doctorCommand } from "../../../apps/cli/src/doctor-command.js";
import { setupCommand } from "../../../apps/cli/src/setup-command.js";
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
          message: "Required",
          suggestion: "Add service entries with name, kind, runtime, framework, paths, owns_routes, and depends_on.",
          example: '[{"name":"api","kind":"backend","runtime":"Node.js","framework":"Fastify","paths":["apps/api"],"owns_routes":["POST /checkout"],"depends_on":["worker"]}]'
        },
        {
          path: "infrastructure",
          message: "Required"
        },
        {
          path: "critical_paths",
          message: "Required",
          suggestion: "Use object entries so each critical path records its owner_service and review notes.",
          example: '[{"name":"checkout","owner_service":"api","notes":"Creates the order, charges the card, and enqueues fulfillment."}]'
        },
        {
          path: "repo",
          message: "Required"
        },
        {
          path: "developer_workflows",
          message: "Required",
          suggestion: "Provide install, build, test, and lint as command strings so agents can run the standard repo workflows.",
          example: '{"install":"pnpm install","build":"pnpm build","test":"pnpm test","lint":"pnpm lint"}'
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

  it("renders actionable examples for common profile-shape mistakes", async () => {
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
          services: ["api"],
          infrastructure: {
            databases: [],
            queues: [],
            object_storage: [],
            external_services: []
          },
          critical_paths: ["checkout"],
          repo: {
            root_paths: ["apps"],
            generated_paths: [".debugbundle"],
            do_not_edit_paths: [".debugbundle/bundles"]
          },
          developer_workflows: {
            install: "pnpm install"
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

    expect(result.exitCode).toBe(4);
    expect(result.output).toContain("- services.0: Expected object, received string");
    expect(result.output).toContain("Suggestion: Add service entries with name, kind, runtime, framework, paths, owns_routes, and depends_on.");
    expect(result.output).toContain('Example: [{"name":"checkout","owner_service":"api","notes":"Creates the order, charges the card, and enqueues fulfillment."}]');
    expect(result.output).toContain('Example: {"install":"pnpm install","build":"pnpm build","test":"pnpm test","lint":"pnpm lint"}');
  });

  it("agrees with doctor on invalid profile schema state", async () => {
    const rootDirectory = await createProfileFixtureRepository();

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
          critical_paths: ["checkout"],
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

    const profileResult = await profileValidateCommand(
      { json: true },
      {
        cwd: () => rootDirectory
      }
    );
    const doctorResult = await doctorCommand(
      { json: true },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z"),
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        })
      }
    );

    const parsedProfile = JSON.parse(profileResult.output) as {
      valid: boolean;
      errors: Array<{ path: string; message: string }>;
    };
    const parsedDoctor = JSON.parse(doctorResult.output) as {
      checks: Array<{ name: string; status: string; message: string }>;
      errors: string[];
    };

    expect(profileResult.exitCode).toBe(4);
    expect(doctorResult.exitCode).toBe(0);
    expect(parsedProfile.valid).toBe(false);
    expect(parsedProfile.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "critical_paths.0",
          message: "Expected object, received string"
        })
      ])
    );
    expect(parsedDoctor.checks).toContainEqual({
      name: "profile-validation",
      status: "error",
      message: "Profile schema validation failed at critical_paths.0: Expected object, received string."
    });
    expect(parsedDoctor.errors).toContain("Profile schema validation failed at critical_paths.0: Expected object, received string.");
  });
});