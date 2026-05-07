import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import { setupCommand } from "../../../apps/cli/src/setup-command.js";
import { verifyCloudCommand, verifyLocalCommand } from "../../../apps/cli/src/verify-command.js";

const verifyLocalGolden = await readFile(new URL("../../fixtures/cli-verify-local.golden.txt", import.meta.url), "utf8");
const verifyCloudGolden = await readFile(new URL("../../fixtures/cli-verify-cloud.golden.txt", import.meta.url), "utf8");

async function createVerifyFixtureRepository(): Promise<string> {
  const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-verify-local-"));

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

describe("cli verify local command", () => {
  it("proves local end-to-end verification in human mode", async () => {
    const rootDirectory = await createVerifyFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    const result = await verifyLocalCommand({}, {
      cwd: () => rootDirectory,
      now: () => new Date("2026-03-14T00:00:00.000Z")
    });

    expect(result).toEqual({
      exitCode: 0,
      output: verifyLocalGolden
    });
  });

  it("fails local verification when the profile is invalid before local processing starts", async () => {
    const rootDirectory = await createVerifyFixtureRepository();

    const result = await verifyLocalCommand(
      {
        json: true
      },
      {
        cwd: () => rootDirectory
      }
    );

    expect(result.exitCode).toBe(4);
    expect(JSON.parse(result.output)).toEqual({
      status: "error",
      checks: [
        {
          name: "profile-schema",
          status: "error",
          message: "Profile validation failed with 1 errors."
        }
      ],
      warnings: [],
      errors: [".debugbundle/profile.json: Missing .debugbundle/profile.json"],
      suggested_actions: [
        "Run debugbundle setup if the local scaffold is missing or invalid.",
        "Re-run debugbundle verify local after the local event pipeline is healthy."
      ],
      auto_fix_available: false
    });
  });

  it("returns json errors when local processing fails", async () => {
    const rootDirectory = await createVerifyFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    const result = await verifyLocalCommand(
      {
        json: true
      },
      {
        cwd: () => rootDirectory,
        processCommand: vi.fn().mockResolvedValue({
          exitCode: 1,
          output: "process_failed"
        })
      }
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.output)).toEqual({
      status: "error",
      checks: [
        {
          name: "profile-schema",
          status: "ok",
          message: "Validated .debugbundle/profile.json"
        },
        {
          name: "local-event-batch",
          status: "ok",
          message: "Wrote synthetic local event batch."
        },
        {
          name: "local-processing",
          status: "error",
          message: "process_failed"
        }
      ],
      warnings: [],
      errors: ["process_failed"],
      suggested_actions: [
        "Run debugbundle setup if the local scaffold is missing or invalid.",
        "Re-run debugbundle verify local after the local event pipeline is healthy."
      ],
      auto_fix_available: false
    });
  });

  it("returns json errors when local processing produces no incident or the local bundle read fails", async () => {
    const rootDirectory = await createVerifyFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    const incidentMissing = await verifyLocalCommand(
      {
        json: true
      },
      {
        cwd: () => rootDirectory,
        processCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          output: JSON.stringify({
            status: "ok",
            processed: true,
            files_processed: 1,
            events_processed: 1,
            incidents_processed: 1,
            services: [{ service: "debugbundle-verify-local-20260314000000", incidents: 1 }],
            last_processed_event_file: "verify-local.events.json"
          })
        }),
        readLocalState: vi.fn().mockResolvedValue({
          version: 1,
          last_processed_event_file: "verify-local.events.json",
          incidents: {}
        })
      }
    );

    const bundleFailure = await verifyLocalCommand(
      {
        json: true
      },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z"),
        getLocalBundle: vi.fn().mockRejectedValue(new Error("bundle_read_failed"))
      }
    );

    expect(JSON.parse(incidentMissing.output)).toEqual({
      status: "error",
      checks: [
        {
          name: "profile-schema",
          status: "ok",
          message: "Validated .debugbundle/profile.json"
        },
        {
          name: "local-event-batch",
          status: "ok",
          message: "Wrote synthetic local event batch."
        },
        {
          name: "local-processing",
          status: "ok",
          message: "Processed synthetic local event batch into local artifacts."
        },
        {
          name: "incident-retrieval",
          status: "error",
          message: "Local incident verification did not produce an incident."
        }
      ],
      warnings: [],
      errors: ["Local incident verification did not produce an incident."],
      suggested_actions: [
        "Run debugbundle setup if the local scaffold is missing or invalid.",
        "Re-run debugbundle verify local after the local event pipeline is healthy."
      ],
      auto_fix_available: false
    });
    const parsedBundleFailure = JSON.parse(bundleFailure.output) as {
      status: string;
      checks: Array<{ name: string; status: string; message: string }>;
      warnings: string[];
      errors: string[];
    };

    expect(parsedBundleFailure.status).toBe("error");
    expect(parsedBundleFailure.checks).toEqual(
      expect.arrayContaining([
        {
          name: "bundle-retrieval",
          status: "error",
          message: "bundle_read_failed"
        }
      ])
    );
    expect(parsedBundleFailure.warnings).toEqual([]);
    expect(parsedBundleFailure.errors).toEqual(["bundle_read_failed"]);
  });
});

describe("cli verify cloud command", () => {
  it("proves recent cloud traffic in human mode", async () => {
    const result = await verifyCloudCommand(
      {
        projectId: "proj_123",
        service: "checkout-api"
      },
      {
        now: () => new Date("2026-03-14T00:10:00.000Z"),
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        }),
        listIncidents: vi.fn().mockResolvedValue({
          incidents: [
            {
              incident_id: "inc_prod_123",
              last_seen_at: "2026-03-14T00:05:00.000Z"
            }
          ],
          next_cursor: null
        })
      }
    );

    expect(result).toEqual({
      exitCode: 0,
      output: verifyCloudGolden
    });
  });

  it("returns setup-style json auth errors when cloud auth is missing", async () => {
    const result = await verifyCloudCommand(
      {
        projectId: "proj_123",
        json: true
      },
      {
        readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.output)).toEqual({
      status: "error",
      checks: [
        {
          name: "auth-state",
          status: "error",
          message: "Not logged in."
        }
      ],
      warnings: [],
      errors: ["Not logged in."],
      suggested_actions: [
        "Run debugbundle login to create ~/.debugbundle/auth.json before verifying cloud traffic.",
        "Generate a live cloud request, then re-run debugbundle verify cloud with the correct project and service filters."
      ],
      auto_fix_available: false
    });
  });

  it("returns setup-style json verification errors when no recent cloud traffic is found", async () => {
    const result = await verifyCloudCommand(
      {
        projectId: "proj_123",
        service: "checkout-api",
        json: true
      },
      {
        now: () => new Date("2026-03-14T00:10:00.000Z"),
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        }),
        listIncidents: vi.fn().mockResolvedValue({
          incidents: [
            {
              incident_id: "inc_prod_123",
              last_seen_at: "2026-03-13T23:30:00.000Z"
            }
          ],
          next_cursor: null
        })
      }
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.output)).toEqual({
      status: "error",
      checks: [
        {
          name: "auth-state",
          status: "ok",
          message: "Found valid auth state."
        },
        {
          name: "passive-traffic-check",
          status: "error",
          message: "Latest production incident inc_prod_123 is older than the 15 minute verification window."
        }
      ],
      warnings: [],
      errors: ["Latest production incident inc_prod_123 is older than the 15 minute verification window."],
      suggested_actions: [
        "Run debugbundle login to create ~/.debugbundle/auth.json before verifying cloud traffic.",
        "Generate a live cloud request, then re-run debugbundle verify cloud with the correct project and service filters."
      ],
      auto_fix_available: false
    });
  });

  it("reports invalid cloud timestamps, empty result sets, and list failures", async () => {
    const invalidTimestamp = await verifyCloudCommand(
      {
        projectId: "proj_123",
        environment: "staging",
        json: true
      },
      {
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        }),
        listIncidents: vi.fn().mockResolvedValue({
          incidents: [
            {
              incident_id: "inc_prod_123",
              last_seen_at: "not-a-date"
            }
          ],
          next_cursor: null
        })
      }
    );

    const noIncidents = await verifyCloudCommand(
      {
        projectId: "proj_123",
        environment: "staging",
        maxAgeMinutes: 5,
        json: true
      },
      {
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        }),
        listIncidents: vi.fn().mockResolvedValue({
          incidents: [],
          next_cursor: null
        })
      }
    );

    const requestFailure = await verifyCloudCommand(
      {
        projectId: "proj_123",
        json: true
      },
      {
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        }),
        listIncidents: vi.fn().mockRejectedValue(new Error("retrieval_down"))
      }
    );

    expect(JSON.parse(invalidTimestamp.output)).toMatchObject({
      status: "error",
      errors: ["Incident inc_prod_123 returned an invalid last_seen_at timestamp."]
    });
    expect(JSON.parse(noIncidents.output)).toMatchObject({
      status: "error",
      errors: ["No incidents found for staging verification in the last 5 minute verification window."]
    });
    expect(JSON.parse(requestFailure.output)).toMatchObject({
      status: "error",
      errors: ["retrieval_down"]
    });
  });

  it("maps generic auth failures in cloud verification to exit code 2", async () => {
    const result = await verifyCloudCommand(
      {
        projectId: "proj_123",
        json: true
      },
      {
        readAuthState: vi.fn().mockRejectedValue("auth_reader_failed")
      }
    );

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.output)).toMatchObject({
      status: "error",
      errors: ["auth_reader_failed"]
    });
  });

  it("omits the service filter when cloud verification runs without a service", async () => {
    const listIncidents = vi.fn().mockResolvedValue({
      incidents: [
        {
          incident_id: "inc_prod_omit_service",
          last_seen_at: "2026-03-14T00:05:00.000Z"
        }
      ],
      next_cursor: null
    });

    const result = await verifyCloudCommand(
      {
        projectId: "proj_123",
        json: true
      },
      {
        now: () => new Date("2026-03-14T00:10:00.000Z"),
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        }),
        listIncidents
      }
    );

    expect(result.exitCode).toBe(0);
    expect(listIncidents).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_secret_token",
      projectId: "proj_123",
      environment: "production",
      limit: 1
    });
    expect(JSON.parse(result.output)).toMatchObject({
      status: "healthy"
    });
  });
});