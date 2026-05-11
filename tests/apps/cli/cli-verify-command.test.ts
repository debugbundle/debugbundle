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

  it("returns the default local processing message when processing reports no work", async () => {
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
          exitCode: 0,
          output: JSON.stringify({
            status: "ok",
            processed: false,
            files_processed: 0,
            events_processed: 0,
            incidents_processed: 0,
            services: []
          })
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
          message: "Synthetic local event batch was not processed."
        }
      ],
      warnings: [],
      errors: ["Synthetic local event batch was not processed."],
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

  it("actively verifies cloud 5xx request incidents through real ingestion", async () => {
    const createProjectToken = vi.fn().mockResolvedValue({
      token_id: "tok_verify_123",
      project_id: "proj_123",
      label: "debugbundle verify cloud 20260314001000",
      created_at: "2026-03-14T00:10:00.000Z",
      last_used_at: null,
      revoked_at: null,
      expires_at: null,
      plaintext: "dbundle_proj_verify"
    });
    const revokeProjectToken = vi.fn().mockResolvedValue({
      token_id: "tok_verify_123",
      project_id: "proj_123",
      label: "debugbundle verify cloud 20260314001000",
      created_at: "2026-03-14T00:10:00.000Z",
      last_used_at: null,
      revoked_at: "2026-03-14T00:10:01.000Z",
      expires_at: null
    });
    const sendEvents = vi.fn().mockResolvedValue({ accepted: 1, rejected: 0, errors: [] });
    const listIncidents = vi.fn().mockResolvedValue({
      incidents: [
        {
          incident_id: "inc_verify_5xx",
          last_seen_at: "2026-03-14T00:10:03.000Z",
          incident_reason: {
            kind: "request_failure_5xx",
            description: "request_event matched the 5xx request incident rule",
            event_type: "request_event",
            event_class: "incident_signal",
            matched_policy: "5xx request failures bypass capture_request_events suppression"
          }
        }
      ],
      next_cursor: null
    });
    const getBundle = vi.fn().mockResolvedValue({ bundle_version: 1 });

    const result = await verifyCloudCommand(
      {
        projectId: "proj_123",
        service: "checkout-api",
        environment: "production",
        trigger5xx: true,
        json: true
      },
      {
        now: () => new Date("2026-03-14T00:10:00.000Z"),
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        }),
        createProjectToken,
        revokeProjectToken,
        sendEvents,
        listIncidents,
        getBundle,
        sleep: vi.fn().mockResolvedValue(undefined),
        pollAttempts: 1
      }
    );

    expect(result.exitCode).toBe(0);
    expect(createProjectToken).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_secret_token",
      projectId: "proj_123",
      label: "debugbundle verify cloud 20260314001000"
    });
    expect(sendEvents).toHaveBeenCalledWith({
      baseUrl: "https://api.debugbundle.com",
      projectToken: "dbundle_proj_verify",
      events: [
        expect.objectContaining({
          event_type: "request_event",
          sdk_name: "debugbundle-cli",
          service: expect.objectContaining({
            name: "checkout-api",
            environment: "production"
          }),
          payload: expect.objectContaining({
            method: "GET",
            path: "/debugbundle/verify/cloud",
            route_template: "/debugbundle/verify/cloud",
            response_status: 503,
            response_headers: expect.objectContaining({
              "x-debugbundle-verification": "true"
            })
          })
        })
      ]
    });
    expect(revokeProjectToken).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_secret_token",
      projectId: "proj_123",
      tokenId: "tok_verify_123"
    });
    expect(listIncidents).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_secret_token",
      projectId: "proj_123",
      environment: "production",
      service: "checkout-api",
      limit: 5
    });
    expect(getBundle).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_secret_token",
      incidentId: "inc_verify_5xx"
    });
    expect(JSON.parse(result.output)).toEqual({
      status: "healthy",
      checks: [
        {
          name: "auth-state",
          status: "ok",
          message: "Found valid auth state."
        },
        {
          name: "active-5xx-event",
          status: "ok",
          message: "Sent synthetic 5xx request_event through cloud ingestion."
        },
        {
          name: "incident-retrieval",
          status: "ok",
          message: "Retrieved cloud incident inc_verify_5xx for the synthetic 5xx request."
        },
        {
          name: "bundle-status",
          status: "ok",
          message: "Bundle for incident inc_verify_5xx is ready."
        },
        {
          name: "verification-token-cleanup",
          status: "ok",
          message: "Revoked temporary verification project token."
        }
      ],
      warnings: [],
      errors: [],
      suggested_actions: [
        "Run debugbundle inspect inc_verify_5xx --source cloud to inspect why the incident fired.",
        "Run debugbundle bundle inc_verify_5xx --source cloud to fetch the generated debug bundle."
      ],
      auto_fix_available: false,
      verification: {
        mode: "active_5xx",
        accepted_event_count: 1,
        incident_id: "inc_verify_5xx",
        bundle_status: "ready",
        classification_reason: {
          kind: "request_failure_5xx",
          description: "request_event matched the 5xx request incident rule",
          event_type: "request_event",
          event_class: "incident_signal",
          matched_policy: "5xx request failures bypass capture_request_events suppression"
        },
        suggested_next_command: "debugbundle inspect inc_verify_5xx --source cloud"
      }
    });
  });

  it("can run active cloud verification through the default HTTP clients", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        status: 201,
        text: async () => JSON.stringify({
          token: {
            token_id: "tok_verify_default",
            project_id: "proj_123",
            label: "debugbundle verify cloud default",
            created_at: "2026-03-14T00:10:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null,
            plaintext: "dbundle_proj_default"
          }
        })
      })
      .mockResolvedValueOnce({
        status: 202,
        text: async () => JSON.stringify({ accepted: 1, rejected: 0, errors: [] })
      })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ incidents: [], next_cursor: null })
      })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({
          incidents: [
            {
              incident_id: "inc_verify_default",
              project_id: "proj_123",
              project_name: "Checkout",
              service_id: null,
              service_name: "debugbundle-verify-cloud-default",
              latest_deployment_id: null,
              environment: "production",
              fingerprint: "fp_verify",
              fingerprint_version: "v1",
              title: "GET /debugbundle/verify/cloud failed with 503",
              severity: "high",
              status: "open",
              first_seen_at: "2099-03-14T00:10:00.000Z",
              last_seen_at: "2099-03-14T00:10:01.000Z",
              occurrence_count: 1,
              spike_detected_at: null,
              resolved_at: null,
              regressed_at: null,
              matched_fields: ["route_template", "http_method", "http_status"]
            }
          ],
          next_cursor: null
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ status: "pending" })
      })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({
          token: {
            token_id: "tok_verify_default",
            project_id: "proj_123",
            label: "debugbundle verify cloud default",
            created_at: "2026-03-14T00:10:00.000Z",
            last_used_at: null,
            revoked_at: "2099-03-14T00:10:02.000Z",
            expires_at: null
          }
        })
      });

    const result = await verifyCloudCommand(
      {
        projectId: "proj_123",
        trigger5xx: true,
        json: true
      },
      {
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com/"
        }),
        fetchImpl,
        pollAttempts: 2,
        pollIntervalMs: 0
      }
    );

    expect(result.exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.debugbundle.com/v1/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer dbundle_proj_default"
        })
      })
    );
    expect(JSON.parse(result.output)).toMatchObject({
      status: "warning",
      warnings: ["Bundle for incident inc_verify_default is still pending."],
      verification: {
        mode: "active_5xx",
        accepted_event_count: 1,
        incident_id: "inc_verify_default",
        bundle_status: "pending"
      }
    });
  });
});
