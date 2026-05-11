import { mkdtemp, mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import { doctorCommand } from "../../../apps/cli/src/doctor-command.js";
import { setupCommand } from "../../../apps/cli/src/setup-command.js";

const doctorGolden = await readFile(new URL("../../fixtures/cli-doctor.golden.txt", import.meta.url), "utf8");

async function createDoctorFixtureRepository(): Promise<string> {
  const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-doctor-"));

  await mkdir(join(rootDirectory, "apps", "api"), { recursive: true });
  await mkdir(join(rootDirectory, "apps", "worker"), { recursive: true });

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

  return rootDirectory;
}

async function createRelaySpoolFixture(rootDirectory: string, now: Date): Promise<void> {
  const spoolDirectory = join(rootDirectory, ".debugbundle", "local", "browser-relay-spool");
  await mkdir(spoolDirectory, { recursive: true });

  await writeFile(join(spoolDirectory, "20260314-1-checkout-web.events.json"), "[]\n", "utf8");
  await writeFile(join(spoolDirectory, "20260314-2-checkout-web.events.json"), "[]\n", "utf8");
  await writeFile(join(spoolDirectory, "20260314-3-checkout-web.events.json"), "[]\n", "utf8");
  await writeFile(join(spoolDirectory, "20260314-3-checkout-web.events.json.delivered"), "\n", "utf8");

  const hoursAgo = (hours: number): Date => new Date(now.getTime() - (hours * 60 * 60 * 1000));

  await utimes(join(spoolDirectory, "20260314-1-checkout-web.events.json"), hoursAgo(72), hoursAgo(72));
  await utimes(join(spoolDirectory, "20260314-2-checkout-web.events.json"), hoursAgo(3), hoursAgo(3));
  await utimes(join(spoolDirectory, "20260314-3-checkout-web.events.json"), hoursAgo(48), hoursAgo(48));
  await utimes(join(spoolDirectory, "20260314-3-checkout-web.events.json.delivered"), hoursAgo(1), hoursAgo(1));
}

async function markProfileAgentValidated(rootDirectory: string): Promise<void> {
  const profilePath = join(rootDirectory, ".debugbundle", "profile.json");
  const generatedProfile = JSON.parse(await readFile(profilePath, "utf8")) as {
    debugbundle: Record<string, unknown>;
  } & Record<string, unknown>;

  generatedProfile.debugbundle = {
    ...generatedProfile.debugbundle,
    validation_status: "agent-validated"
  };

  await writeFile(profilePath, `${JSON.stringify(generatedProfile, null, 2)}\n`, "utf8");
}

describe("cli doctor command", () => {
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

    const generatedProfile = JSON.parse(await readFile(join(rootDirectory, ".debugbundle", "profile.json"), "utf8")) as {
      debugbundle: Record<string, unknown>;
    } & Record<string, unknown>;
    generatedProfile.debugbundle = {
      ...generatedProfile.debugbundle,
      validation_status: "agent-validated"
    };
    await writeFile(join(rootDirectory, ".debugbundle", "profile.json"), `${JSON.stringify(generatedProfile, null, 2)}\n`, "utf8");

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
        readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
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
        "Run debugbundle login to create ~/.debugbundle/auth.json.",
        "Review .debugbundle/profile.json when architecture changes or the profile becomes stale."
      ],
      auto_fix_available: false
    });
  });

  it("reports undelivered relay spool counts and ages when --check-relay is enabled", async () => {
    const rootDirectory = await createDoctorFixtureRepository();
    const now = new Date("2026-03-14T12:00:00.000Z");

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => now
      }
    );

    await createRelaySpoolFixture(rootDirectory, now);

    const result = await doctorCommand(
      {
        json: true,
        checkRelay: true
      },
      {
        cwd: () => rootDirectory,
        now: () => now,
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        })
      }
    );

    const parsed = JSON.parse(result.output) as {
      status: string;
      checks: Array<{ name: string; status: string; message: string }>;
      warnings: string[];
      errors: string[];
    };

    expect(result.exitCode).toBe(0);
    expect(parsed.status).toBe("warning");
    expect(parsed.checks[7]).toEqual({
      name: "relay-spool",
      status: "warning",
      message: "Found 2 undelivered relay spool files; oldest is 3 days old."
    });
    expect(parsed.warnings).toContain("Found 2 undelivered relay spool files; oldest is 3 days old.");
    expect(parsed.errors).toEqual([]);
  });

  it("returns a deterministic privacy preview when --privacy is enabled", async () => {
    const rootDirectory = await createDoctorFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    await markProfileAgentValidated(rootDirectory);

    const result = await doctorCommand(
      {
        json: true,
        privacy: true
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

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toMatchObject({
      status: "healthy",
      privacy_preview: {
        sample_event_type: "request_event",
        sample_event_class: "incident_signal",
        sample_can_create_incident: true,
        redacted_fields: [
          "headers.authorization",
          "headers.cookie",
          "body.password",
          "body.card_number",
          "body.otp"
        ],
        omitted_fields: [],
        retained_metadata: {
          service: "checkout-api",
          environment: "production",
          method: "POST",
          route_template: "/checkout/:orderId",
          response_status: 503
        },
        incident_rule: "request_event with response_status >= 500 is classified as an incident_signal",
        redacted_sample: {
          payload: {
            headers: {
              authorization: "[REDACTED]",
              cookie: "[REDACTED]"
            },
            body: {
              password: "[REDACTED]",
              card_number: "[REDACTED]",
              otp: "[REDACTED]"
            }
          }
        }
      }
    });
  });

  it("validates connected API reachability and member-token auth for self-hosted base URLs", async () => {
    const rootDirectory = await createDoctorFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    await markProfileAgentValidated(rootDirectory);

    await writeFile(
      join(rootDirectory, ".debugbundle", "local", "connection.json"),
      `${JSON.stringify(
        {
          mode: "connected",
          cloud_project_id: "proj_selfhost_1",
          cloud_base_url: "https://selfhost.debugbundle.test",
          environments: {
            local: { delivery: "local-only" },
            development: { delivery: "local-only" },
            staging: { delivery: "local-only" },
            production: { delivery: "cloud-enabled" }
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue('{"status":"ok","version":"0.1.0","uptime":12}')
      })
      .mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue('{"incidents":[],"next_cursor":null}')
      });

    const result = await doctorCommand(
      {
        json: true
      },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z"),
        fetchImpl,
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://selfhost.debugbundle.test"
        })
      }
    );

    const parsed = JSON.parse(result.output) as {
      status: string;
      checks: Array<{ name: string; status: string; message: string }>;
      errors: string[];
      warnings: string[];
    };

    expect(result.exitCode).toBe(0);
    expect(parsed.status).toBe("healthy");
    expect(parsed.checks).toEqual(
      expect.arrayContaining([
        {
          name: "project-mode",
          status: "ok",
          message: "Project mode is connected."
        },
        {
          name: "connected-api",
          status: "ok",
          message: "Connected API https://selfhost.debugbundle.test is reachable and member-token auth succeeded."
        }
      ])
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.warnings).toEqual([]);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, "https://selfhost.debugbundle.test/health", {
      method: "GET",
      headers: {
        accept: "application/json"
      }
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "https://selfhost.debugbundle.test/v1/incidents?limit=1", {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: "Bearer dbundle_mem_secret_token"
      }
    });
  });

  it("surfaces connected API validation failures as doctor errors", async () => {
    const rootDirectory = await createDoctorFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    await writeFile(
      join(rootDirectory, ".debugbundle", "local", "connection.json"),
      `${JSON.stringify(
        {
          mode: "connected",
          cloud_project_id: "proj_selfhost_1",
          cloud_base_url: "https://selfhost.debugbundle.test",
          environments: {
            local: { delivery: "local-only" },
            development: { delivery: "local-only" },
            staging: { delivery: "local-only" },
            production: { delivery: "cloud-enabled" }
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = await doctorCommand(
      {
        json: true
      },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z"),
        fetchImpl: vi.fn().mockResolvedValue({
          status: 503,
          text: vi.fn().mockResolvedValue('{"status":"down"}')
        }),
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://selfhost.debugbundle.test"
        })
      }
    );

    const parsed = JSON.parse(result.output) as {
      status: string;
      checks: Array<{ name: string; status: string; message: string }>;
      errors: string[];
    };

    expect(result.exitCode).toBe(0);
    expect(parsed.status).toBe("error");
    expect(parsed.checks).toEqual(
      expect.arrayContaining([
        {
          name: "connected-api",
          status: "error",
          message: "Connected API https://selfhost.debugbundle.test failed health validation (HTTP 503)."
        }
      ])
    );
    expect(parsed.errors).toContain("Connected API https://selfhost.debugbundle.test failed health validation (HTTP 503).");
  });

  it("reports malformed setup files as errors", async () => {
    const rootDirectory = await createDoctorFixtureRepository();

    await mkdir(join(rootDirectory, ".debugbundle", "local"), { recursive: true });
    await writeFile(join(rootDirectory, ".debugbundle", "profile.json"), "not json", "utf8");
    await writeFile(join(rootDirectory, ".debugbundle", "local", "connection.json"), "not json", "utf8");

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

    expect(result.exitCode).toBe(0);
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
    await writeFile(join(rootDirectory, ".agents", "skills", "debugbundle", "SKILL.md"), "skill", "utf8");

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
    expect(parsed.checks[6]).toEqual({
      name: "profile-freshness",
      status: "error",
      message: "Profile has an invalid debugbundle.last_reviewed_at value."
    });
    expect(parsed.errors).toEqual(["Profile has an invalid debugbundle.last_reviewed_at value."]);
  });
});