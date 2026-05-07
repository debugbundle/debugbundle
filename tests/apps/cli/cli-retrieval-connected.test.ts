import { mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";
import {
  getBundleWithAuthCommand,
  getIncidentCommand,
  getIncidentWithAuthCommand,
  getLogsCommand,
  getLogsWithAuthCommand,
  getReproductionCommand,
  getReproductionWithAuthCommand,
  reopenIncidentWithAuthCommand,
  resolveIncidentWithAuthCommand,
  listIncidentsCommand,
  listIncidentsWithAuthCommand
} from "../../../apps/cli/src/retrieval-commands.js";
import { createLocalRetrievalFixture } from "../../helpers/local-retrieval-fixture.js";

describe("cli retrieval commands connected", () => {
  it("looks up local and cloud incident details by default in connected mode", async () => {
    const { rootDirectory, openIncident } = await createLocalRetrievalFixture({ mode: "connected" });
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const getIncident = vi.fn().mockResolvedValue({
      incident_id: "inc_cloud_prod",
      project_id: "proj_cloud",
      project_name: "DebugBundle Cloud",
      service_id: "svc_cloud_checkout",
      service_name: "checkout-api",
      latest_deployment_id: null,
      environment: "production",
      fingerprint: "fp_cloud",
      fingerprint_version: "1",
      title: "Cloud checkout failure",
      severity: "critical",
      status: "open",
      first_seen_at: "2026-03-20T00:02:00.000Z",
      last_seen_at: "2026-03-20T00:02:00.000Z",
      occurrence_count: 5,
      spike_detected_at: null,
      resolved_at: null,
      regressed_at: null,
      matched_fields: ["message"]
    });
    const createApi = vi.fn().mockReturnValue({
      listIncidents: vi.fn(),
      getIncident,
      resolveIncident: vi.fn(),
      getBundle: vi.fn(),
      listLogs: vi.fn(),
      getReproduction: vi.fn(),
      listServices: vi.fn()
    });

    const connectedDependencies = {
      cwd: () => rootDirectory,
      readAuthState,
      createHttpClient,
      createApi
    };

    const localResult = await getIncidentWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        incidentId: openIncident.incidentId,
        json: true
      },
      connectedDependencies
    );

    const cloudResult = await getIncidentWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        incidentId: "inc_cloud_prod",
        json: true
      },
      connectedDependencies
    );

    expect(JSON.parse(localResult.output)).toEqual({
      incident: expect.objectContaining({
        incident_id: openIncident.incidentId,
        source: "local"
      })
    });
    expect(JSON.parse(cloudResult.output)).toEqual({
      incident: expect.objectContaining({
        incident_id: "inc_cloud_prod",
        source: "cloud"
      })
    });
    expect(getIncident).toHaveBeenCalledTimes(1);
    expect(getIncident).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      incidentId: "inc_cloud_prod",
      json: true
    });
  });

  it("persists and refreshes cloud bundle and reproduction artifacts in connected mode", async () => {
    const { rootDirectory } = await createLocalRetrievalFixture({ mode: "connected" });
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const getBundle = vi
      .fn()
      .mockResolvedValueOnce({ bundle_version: 1, incident_id: "inc_cloud_prod", status: "ready" })
      .mockResolvedValueOnce({ bundle_version: 2, incident_id: "inc_cloud_prod", status: "updated" });
    const getReproduction = vi
      .fn()
      .mockResolvedValueOnce({ possible: true, confidence: 0.8, reason: "request_context_available" })
      .mockResolvedValueOnce({ possible: false, confidence: 0.2, reason: "request_context_missing" });
    const createApi = vi.fn().mockReturnValue({
      listIncidents: vi.fn(),
      getIncident: vi.fn(),
      resolveIncident: vi.fn(),
      getBundle,
      listLogs: vi.fn(),
      getReproduction,
      listServices: vi.fn()
    });

    const connectedDependencies = {
      cwd: () => rootDirectory,
      readAuthState,
      createHttpClient,
      createApi
    };

    const firstBundleResult = await getBundleWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        incidentId: "inc_cloud_prod",
        json: true
      },
      connectedDependencies
    );
    const firstReproductionResult = await getReproductionWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        incidentId: "inc_cloud_prod",
        json: true
      },
      connectedDependencies
    );
    const secondBundleResult = await getBundleWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        incidentId: "inc_cloud_prod",
        json: true
      },
      connectedDependencies
    );
    const secondReproductionResult = await getReproductionWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        incidentId: "inc_cloud_prod",
        json: true
      },
      connectedDependencies
    );

    expect(JSON.parse(firstBundleResult.output)).toEqual({
      bundle_version: 1,
      incident_id: "inc_cloud_prod",
      status: "ready",
      source: "cloud"
    });
    expect(JSON.parse(firstReproductionResult.output)).toEqual({
      possible: true,
      confidence: 0.8,
      reason: "request_context_available",
      source: "cloud"
    });
    expect(JSON.parse(secondBundleResult.output)).toEqual({
      bundle_version: 2,
      incident_id: "inc_cloud_prod",
      status: "updated",
      source: "cloud"
    });
    expect(JSON.parse(secondReproductionResult.output)).toEqual({
      possible: false,
      confidence: 0.2,
      reason: "request_context_missing",
      source: "cloud"
    });

    expect(
      JSON.parse(readFileSync(join(rootDirectory, ".debugbundle", "bundles", "cloud", "inc_cloud_prod.bundle.json"), "utf8"))
    ).toEqual({
      bundle_version: 2,
      incident_id: "inc_cloud_prod",
      status: "updated",
      source: "cloud"
    });
    expect(
      JSON.parse(
        readFileSync(
          join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions", "inc_cloud_prod.reproduction.json"),
          "utf8"
        )
      )
    ).toEqual({
      possible: false,
      confidence: 0.2,
      reason: "request_context_missing",
      source: "cloud"
    });
  });

  it("renders empty states and generic failures for retrieval commands", async () => {
    const emptyIncidents = await listIncidentsCommand(
      {
        bearerToken: "dbundle_mem_x"
      },
      {
        listIncidents: vi.fn().mockResolvedValue({
          incidents: [],
          next_cursor: null
        })
      }
    );

    const emptyLogs = await getLogsCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123"
      },
      {
        getLogs: vi.fn().mockResolvedValue({
          logs: [],
          next_cursor: null
        })
      }
    );

    const genericError = await getIncidentCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123"
      },
      {
        getIncident: vi.fn().mockRejectedValue(new Error("backend_down"))
      }
    );

    expect(emptyIncidents.output).toBe("No incidents found.");
    expect(emptyLogs.output).toBe("No logs found.");
    expect(genericError.exitCode).toBe(1);
    expect(genericError.output).toBe("backend_down");
  });

  it("supports json output and mapped bad-request errors for incident retrieval", async () => {
    const incidentJson = await getIncidentCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123",
        json: true
      },
      {
        getIncident: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
          title: "TypeError",
          severity: "high",
          status: "open"
        })
      }
    );

    const listBadRequest = await listIncidentsCommand(
      {
        bearerToken: "dbundle_mem_x"
      },
      {
        listIncidents: vi.fn().mockRejectedValue(new RetrievalApiError(400, "invalid_filter"))
      }
    );

    expect(JSON.parse(incidentJson.output)).toEqual({
      incident: {
        incident_id: "inc_123",
        title: "TypeError",
        severity: "high",
        status: "open"
      }
    });
    expect(listBadRequest.exitCode).toBe(4);
    expect(listBadRequest.output).toContain("invalid_filter");
  });

  it("forwards auth context into incident, bundle, logs, and reproduction commands", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const getIncident = vi.fn().mockResolvedValue({
      incident_id: "inc_123",
      title: "TypeError",
      severity: "high",
      status: "open"
    });
    const getBundle = vi.fn().mockResolvedValue({ bundle_version: 1, status: "ready" });
    const listLogs = vi.fn().mockResolvedValue({
      logs: [
        {
          event_id: "evt_123",
          event_type: "backend_exception",
          occurred_at: "2026-03-11T00:10:00.000Z",
          is_sampled: true,
          level: "error"
        }
      ],
      next_cursor: null
    });
    const getReproduction = vi.fn().mockResolvedValue({
      possible: true,
      confidence: 0.8,
      reason: "request_context_available",
      artifacts: null,
      feasibility_reference: null
    });
    const createApi = vi.fn().mockReturnValue({
      listIncidents: vi.fn(),
      getIncident,
      getBundle,
      listLogs,
      getReproduction,
      listServices: vi.fn()
    });

    const incidentResult = await getIncidentWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        incidentId: "inc_123",
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    const bundleResult = await getBundleWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        incidentId: "inc_123"
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    const logsResult = await getLogsWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        incidentId: "inc_123",
        level: "error",
        cursor: "cur_123",
        limit: 5,
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    const reproductionResult = await getReproductionWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        incidentId: "inc_123",
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(createHttpClient).toHaveBeenCalledWith({
      baseUrl: "https://selfhost.debugbundle.test"
    });
    expect(getIncident).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      incidentId: "inc_123",
      json: true
    });
    expect(getBundle).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      incidentId: "inc_123"
    });
    expect(listLogs).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      incidentId: "inc_123",
      level: "error",
      cursor: "cur_123",
      limit: 5
    });
    expect(getReproduction).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      incidentId: "inc_123",
      json: true
    });
    expect(JSON.parse(incidentResult.output)).toEqual({
      incident: {
        incident_id: "inc_123",
        title: "TypeError",
        severity: "high",
        status: "open",
        source: "cloud"
      }
    });
    expect(JSON.parse(bundleResult.output)).toEqual({
      bundle_version: 1,
      status: "ready",
      source: "cloud"
    });
    expect(JSON.parse(logsResult.output)).toEqual({
      logs: [
        {
          event_id: "evt_123",
          event_type: "backend_exception",
          occurred_at: "2026-03-11T00:10:00.000Z",
          is_sampled: true,
          level: "error"
        }
      ],
      next_cursor: null
    });
    expect(JSON.parse(reproductionResult.output)).toEqual({
      possible: true,
      confidence: 0.8,
      reason: "request_context_available",
      artifacts: null,
      feasibility_reference: null,
      source: "cloud"
    });
  });

  it("updates cached cloud artifacts when resolving a cloud incident in connected mode", async () => {
    const { rootDirectory } = await createLocalRetrievalFixture({ mode: "connected" });
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const resolveIncident = vi.fn().mockResolvedValue({
      incident_id: "inc_cloud_prod",
      status: "resolved",
      resolved_at: "2026-03-20T00:05:00.000Z"
    });
    const createApi = vi.fn().mockReturnValue({
      listIncidents: vi.fn(),
      getIncident: vi.fn(),
      resolveIncident,
      getBundle: vi.fn(),
      listLogs: vi.fn(),
      getReproduction: vi.fn(),
      listServices: vi.fn()
    });

    mkdirSync(join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions"), { recursive: true });
    writeFileSync(
      join(rootDirectory, ".debugbundle", "bundles", "cloud", "inc_cloud_prod.bundle.json"),
      `${JSON.stringify({ incident_id: "inc_cloud_prod", status: "open", resolved_at: null, source: "cloud" }, null, 2)}\n`,
      "utf8"
    );
    writeFileSync(
      join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions", "inc_cloud_prod.reproduction.json"),
      `${JSON.stringify({ incident_id: "inc_cloud_prod", status: "open", resolved_at: null, source: "cloud" }, null, 2)}\n`,
      "utf8"
    );

    const result = await resolveIncidentWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        incidentId: "inc_cloud_prod",
        json: true
      },
      {
        cwd: () => rootDirectory,
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      incident: {
        incident_id: "inc_cloud_prod",
        status: "resolved",
        resolved_at: "2026-03-20T00:05:00.000Z",
        source: "cloud"
      }
    });
    expect(JSON.parse(readFileSync(join(rootDirectory, ".debugbundle", "bundles", "cloud", "inc_cloud_prod.bundle.json"), "utf8"))).toEqual({
      incident_id: "inc_cloud_prod",
      status: "resolved",
      resolved_at: "2026-03-20T00:05:00.000Z",
      source: "cloud"
    });
    expect(
      JSON.parse(
        readFileSync(
          join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions", "inc_cloud_prod.reproduction.json"),
          "utf8"
        )
      )
    ).toEqual({
      incident_id: "inc_cloud_prod",
      status: "resolved",
      resolved_at: "2026-03-20T00:05:00.000Z",
      source: "cloud"
    });
  });

  it("prunes expired cloud cache artifacts when a fresh cloud artifact is fetched", async () => {
    const { rootDirectory } = await createLocalRetrievalFixture({ mode: "connected" });
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const getBundle = vi.fn().mockResolvedValue({ bundle_version: 1, incident_id: "inc_cloud_prod", status: "ready" });
    const createApi = vi.fn().mockReturnValue({
      listIncidents: vi.fn(),
      getIncident: vi.fn(),
      resolveIncident: vi.fn(),
      getBundle,
      listLogs: vi.fn(),
      getReproduction: vi.fn(),
      listServices: vi.fn()
    });
    const staleDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

    mkdirSync(join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions"), { recursive: true });
    const staleBundlePath = join(rootDirectory, ".debugbundle", "bundles", "cloud", "inc_stale.bundle.json");
    const staleReproductionPath = join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions", "inc_stale.reproduction.json");
    writeFileSync(staleBundlePath, `${JSON.stringify({ incident_id: "inc_stale", source: "cloud" }, null, 2)}\n`, "utf8");
    writeFileSync(staleReproductionPath, `${JSON.stringify({ incident_id: "inc_stale", source: "cloud" }, null, 2)}\n`, "utf8");
    utimesSync(staleBundlePath, staleDate, staleDate);
    utimesSync(staleReproductionPath, staleDate, staleDate);

    const result = await getBundleWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        incidentId: "inc_cloud_prod",
        json: true
      },
      {
        cwd: () => rootDirectory,
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      bundle_version: 1,
      incident_id: "inc_cloud_prod",
      status: "ready",
      source: "cloud"
    });
    expect(() => readFileSync(staleBundlePath, "utf8")).toThrow();
    expect(() => readFileSync(staleReproductionPath, "utf8")).toThrow();
    expect(JSON.parse(readFileSync(join(rootDirectory, ".debugbundle", "bundles", "cloud", "inc_cloud_prod.bundle.json"), "utf8"))).toEqual({
      bundle_version: 1,
      incident_id: "inc_cloud_prod",
      status: "ready",
      source: "cloud"
    });
  });

  it("maps unexpected authenticated retrieval wrapper failures to exit code 1", async () => {
    const result = await getBundleWithAuthCommand(
      {
        incidentId: "inc_123"
      },
      {
        readAuthState: vi.fn().mockRejectedValue(new Error("config_missing"))
      }
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toBe("config_missing");
  });

  it("maps generic and api-specific failures for logs and reproduction commands", async () => {
    const logsFailure = await getLogsCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123"
      },
      {
        getLogs: vi.fn().mockRejectedValue("logs_failed")
      }
    );

    const reproductionFailure = await getReproductionCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123"
      },
      {
        getReproduction: vi.fn().mockRejectedValue(new RetrievalApiError(401, "invalid_member_token"))
      }
    );

    expect(logsFailure).toEqual({
      exitCode: 1,
      output: "logs_failed"
    });
    expect(reproductionFailure.exitCode).toBe(2);
    expect(reproductionFailure.output).toContain("invalid_member_token");
  });

  it("paginates merged connected incidents with explicit cloud filters", async () => {
    const { rootDirectory } = await createLocalRetrievalFixture({ mode: "connected" });
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const listIncidents = vi
      .fn()
      .mockResolvedValueOnce({
        incidents: [
          {
            incident_id: "inc_cloud_2",
            title: "Second cloud incident",
            severity: "high",
            status: "open",
            last_seen_at: "2026-03-20T00:03:00.000Z"
          }
        ],
        next_cursor: "2026-03-20T00:03:00.000Z|inc_cloud_2"
      })
      .mockResolvedValueOnce({
        incidents: [
          {
            incident_id: "inc_cloud_1",
            title: "First cloud incident",
            severity: "critical",
            status: "open",
            last_seen_at: "2026-03-20T00:01:00.000Z"
          }
        ],
        next_cursor: null
      });
    const createApi = vi.fn().mockReturnValue({
      listIncidents,
      getIncident: vi.fn(),
      resolveIncident: vi.fn(),
      getBundle: vi.fn(),
      listLogs: vi.fn(),
      getReproduction: vi.fn(),
      listServices: vi.fn()
    });

    const result = await listIncidentsWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        environment: "production",
        service: "checkout-api",
        status: "open",
        severity: "high",
        cursor: "2026-03-20T00:03:00.000Z|inc_cloud_2",
        limit: 2,
        json: true
      },
      {
        cwd: () => rootDirectory,
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(listIncidents).toHaveBeenNthCalledWith(1, {
      bearerToken: "dbundle_mem_saved",
      environment: "production",
      service: "checkout-api",
      status: "open",
      severity: "high"
    });
    expect(listIncidents).toHaveBeenNthCalledWith(2, {
      bearerToken: "dbundle_mem_saved",
      environment: "production",
      service: "checkout-api",
      status: "open",
      severity: "high",
      cursor: "2026-03-20T00:03:00.000Z|inc_cloud_2"
    });
    expect(JSON.parse(result.output)).toEqual({
      incidents: [
        expect.objectContaining({ incident_id: "inc_cloud_1", source: "cloud" })
      ],
      next_cursor: null
    });
  });

  it("returns invalid local state errors instead of falling through to cloud retrieval", async () => {
    const { rootDirectory } = await createLocalRetrievalFixture({ mode: "connected" });
    const readFile = vi.fn(async (filePath: string): Promise<string> => {
      if (filePath.endsWith("connection.json")) {
        return JSON.stringify({ mode: "connected" });
      }

      if (filePath.endsWith("state.json")) {
        return "{";
      }

      throw new Error(`unexpected_read:${filePath}`);
    });
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createHttpClient = vi.fn().mockReturnValue({ request: vi.fn() });
    const createApi = vi.fn().mockReturnValue({
      listIncidents: vi.fn(),
      getIncident: vi.fn(),
      resolveIncident: vi.fn(),
      getBundle: vi.fn(),
      listLogs: vi.fn(),
      getReproduction: vi.fn(),
      listServices: vi.fn()
    });
    const dependencies = {
      cwd: () => rootDirectory,
      readFile,
      readAuthState,
      createHttpClient,
      createApi
    };

    const results = await Promise.all([
      getIncidentWithAuthCommand({ authFilePath: "/tmp/auth.json", incidentId: "inc_invalid" }, dependencies),
      resolveIncidentWithAuthCommand({ authFilePath: "/tmp/auth.json", incidentId: "inc_invalid" }, dependencies),
      reopenIncidentWithAuthCommand({ authFilePath: "/tmp/auth.json", incidentId: "inc_invalid" }, dependencies),
      getBundleWithAuthCommand({ authFilePath: "/tmp/auth.json", incidentId: "inc_invalid" }, dependencies),
      getReproductionWithAuthCommand({ authFilePath: "/tmp/auth.json", incidentId: "inc_invalid" }, dependencies)
    ]);

    expect(results).toEqual([
      { exitCode: 4, output: "retrieval_api_error: 400:invalid_local_state" },
      { exitCode: 4, output: "retrieval_api_error: 400:invalid_local_state" },
      { exitCode: 4, output: "retrieval_api_error: 400:invalid_local_state" },
      { exitCode: 4, output: "retrieval_api_error: 400:invalid_local_state" },
      { exitCode: 4, output: "retrieval_api_error: 400:invalid_local_state" }
    ]);
    expect(createApi).not.toHaveBeenCalled();
  });

  it("reopens a cloud incident when the caller explicitly selects cloud", async () => {
    const { rootDirectory } = await createLocalRetrievalFixture({ mode: "connected" });
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      api_base_url: "https://api.debugbundle.test"
    });
    const createHttpClient = vi.fn().mockReturnValue({ request: vi.fn() });
    const reopenIncident = vi.fn().mockResolvedValue({
      incident_id: "inc_cloud_prod",
      status: "open",
      resolved_at: null
    });
    const createApi = vi.fn().mockReturnValue({
      listIncidents: vi.fn(),
      getIncident: vi.fn(),
      resolveIncident: vi.fn(),
      reopenIncident,
      getBundle: vi.fn(),
      listLogs: vi.fn(),
      getReproduction: vi.fn(),
      listServices: vi.fn()
    });

    const result = await reopenIncidentWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        incidentId: "inc_cloud_prod",
        source: "cloud",
        json: true
      },
      {
        cwd: () => rootDirectory,
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      incident: {
        incident_id: "inc_cloud_prod",
        status: "open",
        resolved_at: null,
        source: "cloud"
      }
    });
    expect(reopenIncident).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      incidentId: "inc_cloud_prod"
    });
  });
});
