import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";
import {
  getLocalBundle,
  getLocalReproduction,
  listLocalIncidents,
  readLocalConnectionConfig,
  readLocalState,
  reopenLocalIncident,
  resolveLocalIncident,
  writeLocalState,
  type LocalState
} from "../../../apps/cli/src/local-retrieval-store.js";

async function createLocalStoreRoot(): Promise<string> {
  const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-local-retrieval-"));
  await mkdir(join(rootDirectory, ".debugbundle", "local"), { recursive: true });
  await mkdir(join(rootDirectory, ".debugbundle", "bundles", "local", "reproductions"), { recursive: true });
  return rootDirectory;
}

function createState(): LocalState {
  return {
    version: 1,
    last_processed_event_file: "1700000000000-1-checkout-api.events.json",
    incidents: {
      inc_recent: {
        incident_id: "inc_recent",
        source: "local",
        project_id: "proj_123",
        service_id: "svc_checkout",
        service_name: "checkout-api",
        service_runtime: "node",
        service_framework: "fastify",
        environment: "production",
        fingerprint: "fp_recent",
        fingerprint_version: "1",
        title: "Recent checkout failure",
        severity: "high",
        status: "open",
        first_seen_at: "2026-03-20T00:00:00.000Z",
        last_seen_at: "2026-03-20T00:05:00.000Z",
        occurrence_count: 3,
        source_event_id: "evt_recent",
        source_occurred_at: "2026-03-20T00:05:00.000Z",
        source_event_types: ["backend_exception"],
        matched_fields: ["message"],
        bundle_path: ".debugbundle/bundles/local/inc_recent.bundle.json",
        reproduction_path: ".debugbundle/bundles/local/reproductions/inc_recent.reproduction.json",
        generation_number: 3
      },
      inc_older: {
        incident_id: "inc_older",
        source: "local",
        project_id: "proj_123",
        service_id: "svc_worker",
        service_name: "worker-api",
        service_runtime: null,
        service_framework: null,
        environment: "staging",
        fingerprint: "fp_older",
        fingerprint_version: "1",
        title: "Older worker failure",
        severity: "medium",
        status: "resolved",
        resolved_at: "2026-03-19T00:04:00.000Z",
        first_seen_at: "2026-03-19T00:00:00.000Z",
        last_seen_at: "2026-03-19T00:03:00.000Z",
        occurrence_count: 1,
        source_event_id: "evt_older",
        source_occurred_at: "2026-03-19T00:03:00.000Z",
        source_event_types: ["request_event"],
        matched_fields: ["request_anomaly", "http_status", "http_method", "route_template"],
        bundle_path: ".debugbundle/bundles/local/inc_older.bundle.json",
        reproduction_path: ".debugbundle/bundles/local/reproductions/inc_older.reproduction.json",
        generation_number: 1
      }
    }
  };
}

describe("local retrieval store", () => {
  it("returns null when the connection config is missing and parses connected mode when present", async () => {
    const rootDirectory = await createLocalStoreRoot();

    await expect(readLocalConnectionConfig({ cwd: () => rootDirectory })).resolves.toBeNull();

    await writeFile(
      join(rootDirectory, ".debugbundle", "local", "connection.json"),
      `${JSON.stringify({ mode: "connected" }, null, 2)}\n`,
      "utf8"
    );

    await expect(readLocalConnectionConfig({ cwd: () => rootDirectory })).resolves.toEqual({ mode: "connected" });
  });

  it("lists incidents with filters, pagination, and local incident lifecycle updates", async () => {
    const rootDirectory = await createLocalStoreRoot();
    await writeLocalState(createState(), { cwd: () => rootDirectory });

    const firstPage = await listLocalIncidents(
      {
        projectId: "proj_123",
        limit: 1
      },
      { cwd: () => rootDirectory }
    );

    expect(firstPage.incidents.map((incident) => incident.incident_id)).toEqual(["inc_recent"]);
    expect(firstPage.next_cursor).toBe("2026-03-20T00:05:00.000Z|inc_recent");

    const secondPage = await listLocalIncidents(
      {
        projectId: "proj_123",
        status: "all",
        limit: 1,
        ...(firstPage.next_cursor === null ? {} : { cursor: firstPage.next_cursor })
      },
      { cwd: () => rootDirectory }
    );

    expect(secondPage.incidents.map((incident) => incident.incident_id)).toEqual(["inc_older"]);

    const filtered = await listLocalIncidents(
      {
        environment: "staging",
        service: "worker-api",
        severity: "medium",
        status: "resolved"
      },
      { cwd: () => rootDirectory }
    );

    expect(filtered.incidents).toHaveLength(1);
    expect(filtered.incidents[0]).toEqual(
      expect.objectContaining({
        incident_id: "inc_older",
        incident_reason: expect.objectContaining({
          kind: "request_failure",
          description: "request_event crossed the repeated request anomaly threshold"
        })
      })
    );

    const resolvedIncident = await resolveLocalIncident({ incidentId: "inc_recent" }, { cwd: () => rootDirectory });
    expect(resolvedIncident.status).toBe("resolved");
    expect(typeof resolvedIncident.resolved_at).toBe("string");

    const reopenedIncident = await reopenLocalIncident({ incidentId: "inc_recent" }, { cwd: () => rootDirectory });
    expect(reopenedIncident.status).toBe("open");
    expect(reopenedIncident.resolved_at).toBeNull();
  });

  it("maps invalid local state and artifact payloads to retrieval errors", async () => {
    const rootDirectory = await createLocalStoreRoot();
    await writeLocalState(createState(), { cwd: () => rootDirectory });

    await writeFile(join(rootDirectory, ".debugbundle", "local", "state.json"), "{not-json}\n", "utf8");

    await expect(readLocalState({ cwd: () => rootDirectory })).rejects.toEqual(
      expect.objectContaining<Partial<RetrievalApiError>>({ status: 400, code: "invalid_local_state" })
    );

    await writeLocalState(createState(), { cwd: () => rootDirectory });
    await writeFile(join(rootDirectory, ".debugbundle", "bundles", "local", "inc_recent.bundle.json"), "{bad", "utf8");
    await writeFile(
      join(rootDirectory, ".debugbundle", "bundles", "local", "reproductions", "inc_recent.reproduction.json"),
      "{bad",
      "utf8"
    );

    await expect(getLocalBundle({ incidentId: "inc_recent" }, { cwd: () => rootDirectory })).rejects.toEqual(
      expect.objectContaining<Partial<RetrievalApiError>>({ status: 400, code: "invalid_local_bundle_artifact" })
    );
    await expect(getLocalReproduction({ incidentId: "inc_recent" }, { cwd: () => rootDirectory })).rejects.toEqual(
      expect.objectContaining<Partial<RetrievalApiError>>({ status: 400, code: "invalid_local_reproduction_artifact" })
    );
  });
});
