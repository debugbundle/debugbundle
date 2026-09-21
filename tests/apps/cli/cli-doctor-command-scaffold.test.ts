import { describe, expect, it, vi } from "vitest";
import {
  mkdir,
  readFile,
  writeFile,
  join,
  CliAuthStateError,
  doctorCommand,
  setupCommand,
  doctorGolden,
  createDoctorFixtureRepository,
  markProfileAgentValidated
} from "../../helpers/cli-doctor.js";

describe("cli-doctor scaffold", () => {
  it("reports a healthy local scaffold in human mode", async () => {
    const rootDirectory = await createDoctorFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    await markProfileAgentValidated(rootDirectory);

    const generatedProfile = JSON.parse(
      await readFile(join(rootDirectory, ".debugbundle", "profile.json"), "utf8")
    ) as {
      debugbundle: Record<string, unknown>;
    } & Record<string, unknown>;
    generatedProfile.debugbundle = {
      ...generatedProfile.debugbundle,
      validation_status: "agent-validated"
    };
    await writeFile(
      join(rootDirectory, ".debugbundle", "profile.json"),
      `${JSON.stringify(generatedProfile, null, 2)}\n`,
      "utf8"
    );

    const result = await doctorCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z"),
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        })
      }
    );

    expect(result).toEqual({
      exitCode: 0,
      output: doctorGolden
    });
  });

  it("returns warning json output when auth is missing and the profile is stale", async () => {
    const rootDirectory = await createDoctorFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-01-01T00:00:00.000Z")
      }
    );

    const result = await doctorCommand(
      {
        json: true
      },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z"),
        readAuthState: vi
          .fn()
          .mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      status: "warning",
      checks: [
        {
          name: "profile",
          status: "ok",
          message: "Found .debugbundle/profile.json"
        },
        {
          name: "connection-config",
          status: "ok",
          message: "Found .debugbundle/local/connection.json"
        },
        {
          name: "agent-skill",
          status: "ok",
          message: "Found .agents/skills/debugbundle/SKILL.md"
        },
        {
          name: "auth-state",
          status: "missing",
          message: "Not logged in."
        },
        {
          name: "project-mode",
          status: "ok",
          message: "Project mode is local-only."
        },
        {
          name: "profile-validation",
          status: "warning",
          message: "Profile validation status is static-analysis-only."
        },
        {
          name: "profile-freshness",
          status: "warning",
          message: "Profile review is stale; last reviewed 72 days ago."
        }
      ],
      warnings: [
        "Not logged in.",
        "Profile validation status is static-analysis-only.",
        "Profile review is stale; last reviewed 72 days ago."
      ],
      errors: [],
      suggested_actions: [
        "Run debugbundle setup if local scaffold files are missing.",
        "Run debugbundle login to choose an auth flow, or use debugbundle login --github, debugbundle login --github-device, or debugbundle login <dbundle_mem_...> to create ~/.debugbundle/auth.json.",
        "Review .debugbundle/profile.json when architecture changes or the profile becomes stale."
      ],
      auto_fix_available: false
    });
  });

  it("fails doctor validation when the full profile schema is invalid despite agent validation status", async () => {
    const rootDirectory = await createDoctorFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    const profilePath = join(rootDirectory, ".debugbundle", "profile.json");
    const generatedProfile = JSON.parse(await readFile(profilePath, "utf8")) as {
      debugbundle: Record<string, unknown>;
    } & Record<string, unknown>;
    generatedProfile.debugbundle = {
      ...generatedProfile.debugbundle,
      validation_status: "agent-validated"
    };
    generatedProfile["critical_paths"] = ["checkout"];
    await writeFile(profilePath, `${JSON.stringify(generatedProfile, null, 2)}\n`, "utf8");

    const result = await doctorCommand(
      {
        json: true
      },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z"),
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        })
      }
    );

    const parsed = JSON.parse(result.output) as {
      status: string;
      checks: Array<{ name: string; status: string; message: string }>;
      errors: string[];
    };

    expect(result.exitCode).toBe(1);
    expect(parsed.status).toBe("error");
    expect(parsed.checks).toEqual(
      expect.arrayContaining([
        {
          name: "profile",
          status: "ok",
          message: "Found .debugbundle/profile.json"
        },
        {
          name: "profile-validation",
          status: "error",
          message:
            "Profile schema validation failed at critical_paths.0: Expected object, received string."
        }
      ])
    );
    expect(parsed.errors).toContain(
      "Profile schema validation failed at critical_paths.0: Expected object, received string."
    );
  });

  it("reports malformed setup files as errors", async () => {
    const rootDirectory = await createDoctorFixtureRepository();

    await mkdir(join(rootDirectory, ".debugbundle", "local"), { recursive: true });
    await writeFile(join(rootDirectory, ".debugbundle", "profile.json"), "not json", "utf8");
    await writeFile(
      join(rootDirectory, ".debugbundle", "local", "connection.json"),
      "not json",
      "utf8"
    );

    const result = await doctorCommand(
      {
        json: true
      },
      {
        cwd: () => rootDirectory,
        readAuthState: vi.fn().mockRejectedValue(new Error("auth_reader_failed"))
      }
    );

    const parsed = JSON.parse(result.output) as {
      status: string;
      checks: Array<{ name: string; status: string; message: string }>;
      warnings: string[];
      errors: string[];
    };

    expect(result.exitCode).toBe(1);
    expect(parsed.status).toBe("error");
    expect(parsed.checks).toEqual([
      {
        name: "profile",
        status: "error",
        message: "Invalid .debugbundle/profile.json"
      },
      {
        name: "connection-config",
        status: "error",
        message: "Invalid .debugbundle/local/connection.json"
      },
      {
        name: "agent-skill",
        status: "missing",
        message: "Missing .agents/skills/debugbundle/SKILL.md"
      },
      {
        name: "auth-state",
        status: "error",
        message: "auth_reader_failed"
      },
      {
        name: "project-mode",
        status: "missing",
        message: "Cannot determine project mode without .debugbundle/local/connection.json"
      },
      {
        name: "profile-validation",
        status: "missing",
        message: "Cannot determine profile validation status without .debugbundle/profile.json"
      },
      {
        name: "profile-freshness",
        status: "missing",
        message: "Cannot evaluate profile freshness without .debugbundle/profile.json"
      }
    ]);
    expect(parsed.warnings).toContain("Missing .agents/skills/debugbundle/SKILL.md");
    expect(parsed.errors).toEqual([
      "Invalid .debugbundle/profile.json",
      "Invalid .debugbundle/local/connection.json",
      "auth_reader_failed"
    ]);
  });

  it("reports invalid profile freshness metadata as an error", async () => {
    const rootDirectory = await createDoctorFixtureRepository();

    await mkdir(join(rootDirectory, ".debugbundle", "local"), { recursive: true });
    await mkdir(join(rootDirectory, ".agents", "skills", "debugbundle"), { recursive: true });
    await writeFile(
      join(rootDirectory, ".debugbundle", "profile.json"),
      JSON.stringify({
        debugbundle: {
          last_reviewed_at: "not-a-date",
          validation_status: "agent-validated"
        }
      }),
      "utf8"
    );
    await writeFile(
      join(rootDirectory, ".debugbundle", "local", "connection.json"),
      JSON.stringify({
        mode: "local-only",
        cloud_project_id: null,
        cloud_base_url: null,
        environments: {
          local: { delivery: "local-only" },
          development: { delivery: "local-only" },
          staging: { delivery: "local-only" },
          production: { delivery: "local-only" }
        }
      }),
      "utf8"
    );
    await writeFile(
      join(rootDirectory, ".agents", "skills", "debugbundle", "SKILL.md"),
      "skill",
      "utf8"
    );

    const result = await doctorCommand(
      {
        json: true
      },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z"),
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        })
      }
    );

    const parsed = JSON.parse(result.output) as {
      status: string;
      checks: Array<{ name: string; status: string; message: string }>;
      errors: string[];
    };

    expect(parsed.status).toBe("error");
    expect(parsed.checks).toEqual(
      expect.arrayContaining([
        {
          name: "profile-validation",
          status: "error",
          message: expect.stringContaining("Profile schema validation failed at profile_version:")
        },
        {
          name: "profile-freshness",
          status: "error",
          message: "Profile has an invalid debugbundle.last_reviewed_at value."
        }
      ])
    );
    expect(parsed.errors).toEqual([
      expect.stringContaining("Profile schema validation failed at profile_version:"),
      "Profile has an invalid debugbundle.last_reviewed_at value."
    ]);
  });
});
