import { describe, expect, it, vi } from "vitest";
import {
  writeFile,
  join,
  CliAuthStateError,
  doctorCommand,
  setupCommand,
  createDoctorFixtureRepository,
  markProfileAgentValidated
} from "../../helpers/cli-doctor.js";

describe("cli-doctor connection", () => {
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
          message:
            "Connected API https://selfhost.debugbundle.test is reachable and member-token auth succeeded."
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
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://selfhost.debugbundle.test/v1/incidents?limit=1",
      {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: "Bearer dbundle_mem_secret_token"
        }
      }
    );
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

    expect(result.exitCode).toBe(1);
    expect(parsed.status).toBe("error");
    expect(parsed.checks).toEqual(
      expect.arrayContaining([
        {
          name: "connected-api",
          status: "error",
          message:
            "Connected API https://selfhost.debugbundle.test failed health validation (HTTP 503)."
        }
      ])
    );
    expect(parsed.errors).toContain(
      "Connected API https://selfhost.debugbundle.test failed health validation (HTTP 503)."
    );
  });

  it("reports invalid incidents probe responses as doctor errors", async () => {
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
        fetchImpl: vi
          .fn()
          .mockResolvedValueOnce({
            status: 200,
            text: vi.fn().mockResolvedValue('{"status":"ok","version":"0.1.0","uptime":12}')
          })
          .mockResolvedValueOnce({
            status: 200,
            text: vi.fn().mockResolvedValue('{"next_cursor":null}')
          }),
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://selfhost.debugbundle.test"
        })
      }
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.output)).toMatchObject({
      status: "error",
      checks: expect.arrayContaining([
        {
          name: "connected-api",
          status: "error",
          message:
            "Connected API https://selfhost.debugbundle.test returned HTTP success, but this client could not validate the incidents response. Check the CLI and Node.js versions."
        }
      ]),
      errors: [
        "Connected API https://selfhost.debugbundle.test returned HTTP success, but this client could not validate the incidents response. Check the CLI and Node.js versions."
      ]
    });
  });

  it("warns when connected api health succeeds but auth state is unavailable", async () => {
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
        fetchImpl: vi.fn().mockResolvedValue({
          status: 200,
          text: vi.fn().mockResolvedValue('{"status":"ok","version":"0.1.0","uptime":12}')
        }),
        readAuthState: vi
          .fn()
          .mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );

    expect(JSON.parse(result.output)).toMatchObject({
      status: "warning",
      checks: expect.arrayContaining([
        {
          name: "connected-api",
          status: "warning",
          message:
            "Connected API https://selfhost.debugbundle.test is reachable, but member-token auth could not be verified without auth state."
        }
      ])
    });
  });

  it("warns when auth state points at a different connected api base url", async () => {
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
        fetchImpl,
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        })
      }
    );

    expect(JSON.parse(result.output)).toMatchObject({
      status: "warning",
      checks: expect.arrayContaining([
        {
          name: "connected-api",
          status: "warning",
          message:
            "Connected API https://api.debugbundle.com is reachable and member-token auth succeeded, but connection config expects https://selfhost.debugbundle.test."
        }
      ])
    });
  });

  it("reports a missing connected api base url when neither connection nor auth provide one", async () => {
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
          cloud_base_url: null,
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
        readAuthState: vi
          .fn()
          .mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );

    expect(JSON.parse(result.output)).toMatchObject({
      status: "warning",
      checks: expect.arrayContaining([
        {
          name: "connected-api",
          status: "missing",
          message: "Cannot verify connected API without cloud_base_url or auth state."
        }
      ]),
      warnings: expect.arrayContaining([
        "Not logged in.",
        "Cannot verify connected API without cloud_base_url or auth state."
      ])
    });
  });

  it("reports invalid health response payloads as doctor errors", async () => {
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
          status: 200,
          text: vi.fn().mockResolvedValue('{"status":"degraded"}')
        }),
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://selfhost.debugbundle.test"
        })
      }
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.output)).toMatchObject({
      status: "error",
      checks: expect.arrayContaining([
        {
          name: "connected-api",
          status: "error",
          message:
            "Connected API https://selfhost.debugbundle.test returned an invalid health response."
        }
      ]),
      errors: [
        "Connected API https://selfhost.debugbundle.test returned an invalid health response."
      ]
    });
  });
});
