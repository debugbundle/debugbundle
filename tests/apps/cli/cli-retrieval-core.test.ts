import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";
import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import {
  getBundleCommand,
  getBundleWithAuthCommand,
  getIncidentCommand,
  getIncidentWithAuthCommand,
  getLogsCommand,
  getReproductionCommand,
  getReproductionWithAuthCommand,
  reopenIncidentWithAuthCommand,
  resolveIncidentCommand,
  resolveIncidentWithAuthCommand,
  listIncidentsCommand,
  listIncidentsWithAuthCommand
} from "../../../apps/cli/src/retrieval-commands.js";
import { createLocalRetrievalFixture } from "../../helpers/local-retrieval-fixture.js";

const incidentsListGolden = readFileSync(new URL("../../fixtures/cli-incidents.golden.txt", import.meta.url), "utf8");
const incidentDetailGolden = readFileSync(new URL("../../fixtures/cli-inspect.golden.txt", import.meta.url), "utf8");
const logsGolden = readFileSync(new URL("../../fixtures/cli-logs.golden.txt", import.meta.url), "utf8");
const bundleGolden = readFileSync(new URL("../../fixtures/cli-bundle.golden.txt", import.meta.url), "utf8");
const reproductionGolden = readFileSync(new URL("../../fixtures/cli-reproduce.golden.txt", import.meta.url), "utf8");

describe("cli retrieval commands core", () => {
  it("renders incidents list in human mode", async () => {
    const listIncidents = vi.fn().mockResolvedValue({
      incidents: [
        {
          incident_id: "inc_123",
          title: "TypeError",
          severity: "high",
          status: "open"
        }
      ],
      next_cursor: null
    });

    const result = await listIncidentsCommand(
      {
        bearerToken: "dbundle_mem_x"
      },
      {
        listIncidents
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(incidentsListGolden);
    expect(listIncidents).toHaveBeenCalledWith({ bearerToken: "dbundle_mem_x" });
  });

  it("renders mixed-source incident rows with explicit and unknown source labels", async () => {
    const result = await listIncidentsCommand(
      {
        bearerToken: "dbundle_mem_x"
      },
      {
        listIncidents: vi.fn().mockResolvedValue({
          incidents: [
            {
              incident_id: "inc_cloud",
              title: "Cloud TypeError",
              severity: "high",
              status: "open",
              source: "cloud"
            },
            {
              incident_id: "inc_unknown",
              title: "Unknown source incident",
              severity: "medium",
              status: "resolved"
            }
          ],
          next_cursor: null
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe([
      "cloud | inc_cloud | high | open | Cloud TypeError",
      "unknown | inc_unknown | medium | resolved | Unknown source incident"
    ].join("\n"));
  });

  it("forwards incident filters and returns next_cursor in json mode", async () => {
    const listIncidents = vi.fn().mockResolvedValue({
      incidents: [{ incident_id: "inc_123", title: "TypeError", severity: "high", status: "open" }],
      next_cursor: "2026-03-11T00:09:00.000Z|inc_122"
    });

    const result = await listIncidentsCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_123",
        environment: "production",
        service: "checkout-api",
        status: "open",
        severity: "high",
        cursor: "2026-03-11T00:08:00.000Z|inc_121",
        limit: 10,
        json: true
      },
      {
        listIncidents
      }
    );

    expect(listIncidents).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_123",
      environment: "production",
      service: "checkout-api",
      status: "open",
      severity: "high",
      cursor: "2026-03-11T00:08:00.000Z|inc_121",
      limit: 10
    });
    expect(JSON.parse(result.output)).toEqual({
      incidents: [{ incident_id: "inc_123", title: "TypeError", severity: "high", status: "open" }],
      next_cursor: "2026-03-11T00:09:00.000Z|inc_122"
    });
  });

  it("renders incident detail in human mode", async () => {
    const result = await getIncidentCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123"
      },
      {
        getIncident: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
          title: "TypeError",
          severity: "high",
          status: "open",
          occurrence_count: 3,
          environment: "production"
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(incidentDetailGolden);
  });

  it("renders fallback incident detail fields when optional values are absent", async () => {
    const result = await getIncidentCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_minimal"
      },
      {
        getIncident: vi.fn().mockResolvedValue({
          incident_id: "inc_minimal",
          title: "Minimal incident",
          severity: "low",
          status: "open"
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe([
      "Incident: inc_minimal",
      "Title: Minimal incident",
      "Severity: low",
      "Status: open",
      "Environment: unknown",
      "Occurrences: 0"
    ].join("\n"));
  });

  it("resolves an incident in human mode", async () => {
    const resolveIncident = vi.fn().mockResolvedValue({
      incident_id: "inc_123",
      title: "TypeError",
      severity: "high",
      status: "resolved",
      occurrence_count: 3,
      environment: "production",
      resolved_at: "2026-03-11T00:12:00.000Z"
    });

    const result = await resolveIncidentCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123"
      },
      {
        resolveIncident
      }
    );

    expect(resolveIncident).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      incidentId: "inc_123"
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Status: resolved");
  });

  it("renders human output for bundle and reproduction commands using stable golden formatting", async () => {
    const bundleResult = await getBundleCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123"
      },
      {
        getBundle: vi.fn().mockResolvedValue({ bundle_version: 1, status: "ready" })
      }
    );

    const reproductionResult = await getReproductionCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123"
      },
      {
        getReproduction: vi.fn().mockResolvedValue({
          possible: true,
          confidence: 0.8,
          reason: "request_context_available",
          artifacts: null,
          feasibility_reference: null
        })
      }
    );

    expect(bundleResult.exitCode).toBe(0);
    expect(bundleResult.output).toBe(bundleGolden);
    expect(reproductionResult.exitCode).toBe(0);
    expect(reproductionResult.output).toBe(reproductionGolden);
  });

  it("returns json output for bundle and reproduction commands", async () => {
    const bundleResult = await getBundleCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123",
        json: true
      },
      {
        getBundle: vi.fn().mockResolvedValue({ bundle_version: 1 })
      }
    );

    const reproductionResult = await getReproductionCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123",
        json: true
      },
      {
        getReproduction: vi.fn().mockResolvedValue({
          possible: true,
          confidence: 0.8,
          reason: "request_context_available",
          artifacts: null,
          feasibility_reference: null
        })
      }
    );

    expect(JSON.parse(bundleResult.output)).toEqual({ bundle_version: 1 });
    expect(JSON.parse(reproductionResult.output)).toEqual({
      possible: true,
      confidence: 0.8,
      reason: "request_context_available",
      artifacts: null,
      feasibility_reference: null
    });
  });

  it("maps retrieval api errors to deterministic exit codes", async () => {
    const result = await getBundleCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_missing"
      },
      {
        getBundle: vi.fn().mockRejectedValue(new RetrievalApiError(404, "incident_not_found"))
      }
    );

    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("incident_not_found");
  });

  it("forwards log filters and preserves next_cursor in json mode", async () => {
    const getLogs = vi.fn().mockResolvedValue({
      logs: [
        {
          event_id: "evt_123",
          event_type: "backend_exception",
          occurred_at: "2026-03-11T00:10:00.000Z",
          is_sampled: true,
          level: "error"
        }
      ],
      next_cursor: "2026-03-11T00:10:00.000Z|evt_123"
    });

    const result = await getLogsCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123",
        level: "error",
        cursor: "2026-03-11T00:09:00.000Z|evt_122",
        limit: 10,
        json: true
      },
      {
        getLogs
      }
    );

    expect(getLogs).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      incidentId: "inc_123",
      level: "error",
      cursor: "2026-03-11T00:09:00.000Z|evt_122",
      limit: 10
    });
    expect(JSON.parse(result.output)).toEqual({
      logs: [
        {
          event_id: "evt_123",
          event_type: "backend_exception",
          occurred_at: "2026-03-11T00:10:00.000Z",
          is_sampled: true,
          level: "error"
        }
      ],
      next_cursor: "2026-03-11T00:10:00.000Z|evt_123"
    });
  });

  it("renders logs in human mode", async () => {
    const result = await getLogsCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123"
      },
      {
        getLogs: vi.fn().mockResolvedValue({
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
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(logsGolden);
  });

  it("renders unknown log levels in human mode", async () => {
    const result = await getLogsCommand(
      {
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_123"
      },
      {
        getLogs: vi.fn().mockResolvedValue({
          logs: [
            {
              event_id: "evt_unknown",
              event_type: "backend_exception",
              occurred_at: "2026-03-11T00:15:00.000Z",
              is_sampled: true,
              level: null
            }
          ],
          next_cursor: null
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("2026-03-11T00:15:00.000Z | unknown | backend_exception | evt_unknown");
  });

  it("loads stored auth state and forwards it into incidents retrieval", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const listIncidents = vi.fn().mockResolvedValue({
      incidents: [
        {
          incident_id: "inc_123",
          title: "TypeError",
          severity: "high",
          status: "open"
        }
      ],
      next_cursor: null
    });
    const createApi = vi.fn().mockReturnValue({
      listIncidents,
      getIncident: vi.fn(),
      getBundle: vi.fn(),
      listLogs: vi.fn(),
      getReproduction: vi.fn(),
      listServices: vi.fn()
    });

    const result = await listIncidentsWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_123"
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
    expect(listIncidents).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_123"
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("cloud | inc_123 | high | open | TypeError");
  });

  it("loads stored auth state and forwards it into incident resolution", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const resolveIncident = vi.fn().mockResolvedValue({
      incident_id: "inc_123",
      title: "TypeError",
      severity: "high",
      status: "resolved",
      occurrence_count: 3,
      environment: "production",
      resolved_at: "2026-03-11T00:12:00.000Z"
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

    const result = await resolveIncidentWithAuthCommand(
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

    expect(resolveIncident).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      incidentId: "inc_123"
    });
    expect(JSON.parse(result.output)).toEqual({
      incident: {
        incident_id: "inc_123",
        title: "TypeError",
        severity: "high",
        status: "resolved",
        occurrence_count: 3,
        environment: "production",
        resolved_at: "2026-03-11T00:12:00.000Z",
        source: "cloud"
      }
    });
  });

  it("forwards json flags in authenticated incidents and bundle commands", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const listIncidents = vi.fn().mockResolvedValue({
      incidents: [],
      next_cursor: null
    });
    const getBundle = vi.fn().mockResolvedValue({ bundle_version: 1 });
    const createApi = vi.fn().mockReturnValue({
      listIncidents,
      getIncident: vi.fn(),
      getBundle,
      listLogs: vi.fn(),
      getReproduction: vi.fn(),
      listServices: vi.fn()
    });

    const incidentsResult = await listIncidentsWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
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
        incidentId: "inc_123",
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(listIncidents).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved"
    });
    expect(getBundle).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      incidentId: "inc_123",
      json: true
    });
    expect(JSON.parse(incidentsResult.output)).toEqual({
      incidents: [],
      next_cursor: null
    });
    expect(JSON.parse(bundleResult.output)).toEqual({ bundle_version: 1, source: "cloud" });
  });

  it("maps missing stored auth state to auth/config exit code", async () => {
    const result = await listIncidentsWithAuthCommand(
      {},
      {
        readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toBe("Not logged in.");
  });

  it("reads local incidents without auth when the project is local-only", async () => {
    const { rootDirectory, openIncident } = await createLocalRetrievalFixture();

    const result = await listIncidentsWithAuthCommand(
      {
        environment: "local",
        status: "open",
        json: true
      },
      {
        cwd: () => rootDirectory
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      incidents: [
        expect.objectContaining({
          incident_id: openIncident.incidentId,
          status: "open",
          environment: "local",
          source: "local"
        })
      ],
      next_cursor: null
    });
  });

  it("reads local incident detail, bundle, and reproduction without auth when the project is local-only", async () => {
    const { rootDirectory, openIncident } = await createLocalRetrievalFixture();

    const localDependencies = {
      cwd: () => rootDirectory
    };
    const [incidentResult, bundleResult, reproductionResult] = await Promise.all([
      getIncidentWithAuthCommand({ incidentId: openIncident.incidentId, json: true }, localDependencies),
      getBundleWithAuthCommand({ incidentId: openIncident.incidentId, json: true }, localDependencies),
      getReproductionWithAuthCommand({ incidentId: openIncident.incidentId, json: true }, localDependencies)
    ]);

    expect(incidentResult.exitCode).toBe(0);
    expect(JSON.parse(incidentResult.output)).toEqual({
      incident: expect.objectContaining({
        incident_id: openIncident.incidentId,
        service_name: "checkout-api",
        source: "local"
      })
    });
    expect(bundleResult.exitCode).toBe(0);
    expect(JSON.parse(bundleResult.output)).toEqual({
      bundle_version: 1,
      incident_id: openIncident.incidentId,
      source: "local"
    });
    expect(reproductionResult.exitCode).toBe(0);
    expect(JSON.parse(reproductionResult.output)).toEqual({
      possible: true,
      confidence: 0.8,
      reason: "request_context_available"
    });
  });

  it("resolves and reopens local incidents without auth when the project is local-only", async () => {
    const { rootDirectory, openIncident, resolvedIncident } = await createLocalRetrievalFixture();

    const localDependencies = {
      cwd: () => rootDirectory
    };
    const resolveResult = await resolveIncidentWithAuthCommand(
      {
        incidentId: openIncident.incidentId,
        json: true
      },
      localDependencies
    );
    const reopenedResult = await reopenIncidentWithAuthCommand(
      {
        incidentId: resolvedIncident.incidentId,
        json: true
      },
      localDependencies
    );

    expect(resolveResult.exitCode).toBe(0);
    expect(JSON.parse(resolveResult.output)).toEqual({
      incident: expect.objectContaining({
        incident_id: openIncident.incidentId,
        status: "resolved"
      })
    });
    expect(reopenedResult.exitCode).toBe(0);
    expect(JSON.parse(reopenedResult.output)).toEqual({
      incident: expect.objectContaining({
        incident_id: resolvedIncident.incidentId,
        status: "open"
      })
    });
  });

  it("reads local incidents explicitly with source=local in connected mode without auth", async () => {
    const { rootDirectory, openIncident } = await createLocalRetrievalFixture({ mode: "connected" });

    const result = await listIncidentsWithAuthCommand(
      {
        source: "local",
        json: true
      },
      {
        cwd: () => rootDirectory
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      incidents: expect.arrayContaining([
        expect.objectContaining({
          incident_id: openIncident.incidentId,
          source: "local"
        })
      ]),
      next_cursor: null
    });
  });

  it("merges local and cloud incidents by default in connected mode and annotates cloud results with source", async () => {
    const { rootDirectory, openIncident } = await createLocalRetrievalFixture({ mode: "connected" });
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
    expect(listIncidents).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved"
    });
    expect(JSON.parse(result.output)).toEqual({
      incidents: expect.arrayContaining([
        expect.objectContaining({
          incident_id: "inc_cloud_prod",
          source: "cloud"
        }),
        expect.objectContaining({
          incident_id: openIncident.incidentId,
          source: "local"
        })
      ]),
      next_cursor: null
    });
  });

});
