import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type LocalIncidentFixture = {
  incidentId: string;
  bundleFileName: string;
  reproductionFileName: string;
};

export async function createLocalRetrievalFixture(): Promise<{
  rootDirectory: string;
  openIncident: LocalIncidentFixture;
  resolvedIncident: LocalIncidentFixture;
}>;
export async function createLocalRetrievalFixture(input: {
  mode?: "local-only" | "connected";
}): Promise<{
  rootDirectory: string;
  openIncident: LocalIncidentFixture;
  resolvedIncident: LocalIncidentFixture;
}>;
export async function createLocalRetrievalFixture(input?: {
  mode?: "local-only" | "connected";
}): Promise<{
  rootDirectory: string;
  openIncident: LocalIncidentFixture;
  resolvedIncident: LocalIncidentFixture;
}> {
  const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-local-retrieval-"));

  await mkdir(join(rootDirectory, ".debugbundle", "local"), { recursive: true });
  await mkdir(join(rootDirectory, ".debugbundle", "bundles", "local", "reproductions"), { recursive: true });

  const openIncident = {
    incidentId: "inc_local_checkout",
    bundleFileName: "inc_local_checkout.bundle.json",
    reproductionFileName: "inc_local_checkout.reproduction.json"
  };
  const resolvedIncident = {
    incidentId: "inc_local_worker",
    bundleFileName: "inc_local_worker.bundle.json",
    reproductionFileName: "inc_local_worker.reproduction.json"
  };

  await writeFile(
    join(rootDirectory, ".debugbundle", "local", "connection.json"),
    JSON.stringify({ mode: input?.mode ?? "local-only" }),
    "utf8"
  );

  await writeFile(
    join(rootDirectory, ".debugbundle", "local", "state.json"),
    JSON.stringify(
      {
        version: 1,
        last_processed_event_file: "1700000000000-1-checkout-api.events.json",
        incidents: {
          [openIncident.incidentId]: {
            incident_id: openIncident.incidentId,
            source: "local",
            project_id: "proj_local",
            service_id: "svc_local_checkout",
            service_name: "checkout-api",
            service_runtime: null,
            service_framework: null,
            environment: "local",
            fingerprint: "fp_checkout",
            fingerprint_version: "1",
            title: "TypeError: checkout exploded",
            severity: "high",
            status: "open",
            first_seen_at: "2026-03-20T00:00:00.000Z",
            last_seen_at: "2026-03-20T00:01:00.000Z",
            occurrence_count: 2,
            source_event_id: "evt_checkout_1",
            source_occurred_at: "2026-03-20T00:01:00.000Z",
            source_event_types: ["backend_exception"],
            matched_fields: ["message"],
            bundle_path: `.debugbundle/bundles/local/${openIncident.bundleFileName}`,
            reproduction_path: `.debugbundle/bundles/local/reproductions/${openIncident.reproductionFileName}`,
            generation_number: 2,
            source_events: []
          },
          [resolvedIncident.incidentId]: {
            incident_id: resolvedIncident.incidentId,
            source: "local",
            project_id: "proj_local",
            service_id: "svc_local_worker",
            service_name: "worker",
            service_runtime: null,
            service_framework: null,
            environment: "local",
            fingerprint: "fp_worker",
            fingerprint_version: "1",
            title: "WorkerError: queue stalled",
            severity: "medium",
            status: "resolved",
            first_seen_at: "2026-03-19T23:58:00.000Z",
            last_seen_at: "2026-03-19T23:59:00.000Z",
            occurrence_count: 1,
            source_event_id: "evt_worker_1",
            source_occurred_at: "2026-03-19T23:59:00.000Z",
            source_event_types: ["backend_exception"],
            matched_fields: ["message"],
            bundle_path: `.debugbundle/bundles/local/${resolvedIncident.bundleFileName}`,
            reproduction_path: `.debugbundle/bundles/local/reproductions/${resolvedIncident.reproductionFileName}`,
            generation_number: 1,
            source_events: []
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    join(rootDirectory, ".debugbundle", "bundles", "local", openIncident.bundleFileName),
    JSON.stringify({ bundle_version: 1, incident_id: openIncident.incidentId, source: "local" }, null, 2),
    "utf8"
  );
  await writeFile(
    join(rootDirectory, ".debugbundle", "bundles", "local", "reproductions", openIncident.reproductionFileName),
    JSON.stringify({ possible: true, confidence: 0.8, reason: "request_context_available" }, null, 2),
    "utf8"
  );
  await writeFile(
    join(rootDirectory, ".debugbundle", "bundles", "local", resolvedIncident.bundleFileName),
    JSON.stringify({ bundle_version: 1, incident_id: resolvedIncident.incidentId, source: "local" }, null, 2),
    "utf8"
  );
  await writeFile(
    join(rootDirectory, ".debugbundle", "bundles", "local", "reproductions", resolvedIncident.reproductionFileName),
    JSON.stringify({ possible: false, confidence: 0.2, reason: "request_context_missing" }, null, 2),
    "utf8"
  );

  return {
    rootDirectory,
    openIncident,
    resolvedIncident
  };
}