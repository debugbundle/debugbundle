import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import {
  getBundleWithAuthCommand,
  getIncidentContextWithAuthCommand,
  getIncidentWithAuthCommand,
  getReproductionWithAuthCommand,
  reopenIncidentWithAuthCommand,
  resolveIncidentWithAuthCommand,
  listIncidentsWithAuthCommand
} from "../../../apps/cli/src/retrieval-commands.js";
import { createLocalRetrievalFixture } from "../../helpers/local-retrieval-fixture.js";

describe("cli retrieval authentication and sources", () => {
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
      getIncidentContext: vi.fn(),
      getBundle: vi.fn(),
      listLogs: vi.fn(),
      getReproduction: vi.fn(),
      listServices: vi.fn()
    });

    const result = await listIncidentsWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_123",
        firstSeenAfter: "2026-03-17T00:00:00.000Z"
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
      projectId: "proj_123",
      status: "active",
      firstSeenAfter: "2026-03-17T00:00:00.000Z"
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("cloud | inc_123 | high | open | TypeError");
  });

  it("uses the explicit cloud source path for incidents retrieval and forwards first-seen filters", async () => {
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
      getIncidentContext: vi.fn(),
      getBundle: vi.fn(),
      listLogs: vi.fn(),
      getReproduction: vi.fn(),
      listServices: vi.fn()
    });

    const result = await listIncidentsWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        source: "cloud",
        firstSeenAfter: "2026-03-17T00:00:00.000Z",
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(listIncidents).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      status: "active",
      firstSeenAfter: "2026-03-17T00:00:00.000Z"
    });
    expect(JSON.parse(result.output)).toEqual({
      incidents: [
        expect.objectContaining({
          incident_id: "inc_123",
          source: "cloud"
        })
      ],
      next_cursor: null
    });
  });

  it("omits the incident status filter when all statuses are requested", async () => {
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
    const createApi = vi.fn().mockReturnValue({
      listIncidents,
      getIncident: vi.fn(),
      getIncidentContext: vi.fn(),
      getBundle: vi.fn(),
      listLogs: vi.fn(),
      getReproduction: vi.fn(),
      listServices: vi.fn()
    });

    const result = await listIncidentsWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        source: "cloud",
        status: "all",
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(result.exitCode).toBe(0);
    expect(listIncidents).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved"
    });
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
      getIncidentContext: vi.fn(),
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
      getIncidentContext: vi.fn(),
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
      bearerToken: "dbundle_mem_saved",
      status: "active"
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
        readAuthState: vi
          .fn()
          .mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
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
      getIncidentWithAuthCommand(
        { incidentId: openIncident.incidentId, json: true },
        localDependencies
      ),
      getBundleWithAuthCommand(
        { incidentId: openIncident.incidentId, json: true },
        localDependencies
      ),
      getReproductionWithAuthCommand(
        { incidentId: openIncident.incidentId, json: true },
        localDependencies
      )
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

  it("reads local incident context without auth when the project is local-only", async () => {
    const { rootDirectory, openIncident } = await createLocalRetrievalFixture();

    const result = await getIncidentContextWithAuthCommand(
      {
        incidentId: openIncident.incidentId,
        json: true
      },
      {
        cwd: () => rootDirectory
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual(
      expect.objectContaining({
        incident: expect.objectContaining({
          incident_id: openIncident.incidentId,
          source: "local"
        }),
        bundle: expect.objectContaining({
          status: "ready"
        }),
        reproduction: expect.objectContaining({
          status: "ready"
        }),
        grouping: expect.objectContaining({
          fingerprint: "fp_checkout"
        })
      })
    );
  });

  it("derives local incident_reason from request anomaly matched fields when no primary incident signal exists", async () => {
    const { rootDirectory, openIncident } = await createLocalRetrievalFixture();
    const statePath = join(rootDirectory, ".debugbundle", "local", "state.json");
    const rawState = JSON.parse(readFileSync(statePath, "utf8")) as {
      version: number;
      last_processed_event_file: string;
      incidents: Record<string, Record<string, unknown>>;
    };

    rawState.incidents[openIncident.incidentId] = {
      ...rawState.incidents[openIncident.incidentId],
      title: "Request anomaly: GET /checkout/:orderId returned 404 repeatedly",
      source_event_types: ["request_event"],
      matched_fields: ["request_anomaly", "route_template", "http_method", "http_status"]
    };

    await writeFile(statePath, `${JSON.stringify(rawState, null, 2)}\n`, "utf8");

    const result = await getIncidentWithAuthCommand(
      {
        incidentId: openIncident.incidentId,
        json: true
      },
      {
        cwd: () => rootDirectory
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      incident: expect.objectContaining({
        incident_id: openIncident.incidentId,
        incident_reason: {
          kind: "request_failure",
          description: "request_event crossed the repeated request anomaly threshold",
          event_type: "request_event",
          event_class: "incident_signal",
          matched_policy:
            "Repeated contextual request failures crossed the request anomaly threshold"
        }
      })
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
    const { rootDirectory, openIncident } = await createLocalRetrievalFixture({
      mode: "connected"
    });

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
    const { rootDirectory, openIncident } = await createLocalRetrievalFixture({
      mode: "connected"
    });
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const listIncidents = vi.fn().mockResolvedValueOnce({
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
      getIncidentContext: vi.fn(),
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
      bearerToken: "dbundle_mem_saved",
      status: "active"
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

  it("annotates cloud incident context with source in authenticated mode", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const getIncidentContext = vi.fn().mockResolvedValue({
      incident: {
        incident_id: "inc_cloud_prod",
        title: "Cloud checkout failure",
        severity: "critical",
        status: "open",
        fingerprint: "fp_cloud",
        fingerprint_version: "1",
        matched_fields: ["message"]
      },
      incident_reason: null,
      primary_signal: {
        kind: null,
        event_type: "backend_exception",
        event_class: "incident_signal",
        description: "Primary signal for incident inc_cloud_prod",
        severity: "critical",
        service_name: "checkout-api",
        environment: "production",
        error_type: "TypeError",
        error_message: "boom",
        request_method: null,
        request_path: null,
        route_template: null,
        response_status: null,
        first_application_frame: null
      },
      bundle: {
        status: "pending"
      },
      reproduction: {
        status: "pending"
      },
      logs: {
        source: "none",
        items: [],
        next_cursor: null
      },
      deploy: {
        latest_deployment_id: null,
        commit_sha: null,
        deploy_version: null,
        branch: null,
        deployed_at: null,
        regression_window: null
      },
      grouping: {
        fingerprint: "fp_cloud",
        fingerprint_version: "1",
        matched_fields: ["message"]
      },
      redaction: null,
      suggested_next_checks: []
    });
    const createApi = vi.fn().mockReturnValue({
      listIncidents: vi.fn(),
      getIncident: vi.fn(),
      getIncidentContext,
      resolveIncident: vi.fn(),
      getBundle: vi.fn(),
      listLogs: vi.fn(),
      getReproduction: vi.fn(),
      listServices: vi.fn()
    });

    const result = await getIncidentContextWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        incidentId: "inc_cloud_prod",
        source: "cloud",
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(getIncidentContext).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      incidentId: "inc_cloud_prod"
    });
    expect(JSON.parse(result.output)).toEqual(
      expect.objectContaining({
        incident: expect.objectContaining({
          incident_id: "inc_cloud_prod",
          source: "cloud"
        })
      })
    );
  });
});
