import { expect, it, vi } from "vitest";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import type { BundleBuildContext, ObjectStoreReader } from "../../../packages/storage/src/index.js";
import type { BuildBundleWorkerDependencies } from "../../../apps/worker/src/processor-shared.js";
import {
  loadIncidentEnvelopes,
  collectProbeDataItems,
  collectCorrelatedLogEnvelopes
} from "../../../apps/worker/src/processor-bundle-context.js";
import {
  loadImprovementBundleSdk,
  loadSampleLogItems,
  loadRepresentativeRequestContext
} from "../../../apps/worker/src/improvement-bundle-context.js";

const projectId = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const occurredAt = "2026-09-14T00:00:00.000Z";
const references = [
  { event_id: eventId, event_type: "log_event" as const, occurred_at: occurredAt }
];
const incident = {
  incident_id: "incident",
  project_id: projectId,
  service_name: "web",
  environment: "production",
  first_seen_at: occurredAt,
  last_seen_at: occurredAt
} as BundleBuildContext;
const incidentEnvelopes = [
  {
    eventId: "primary-event",
    eventType: "backend_exception" as const,
    occurredAt,
    envelope: createEventEnvelope({
      event_type: "backend_exception",
      occurred_at: occurredAt,
      service: { name: "web", environment: "production" },
      correlation: { trace_id: "trace" },
      payload: {
        name: "Error",
        message: "failure",
        stack: "Error: failure",
        handled: false,
        request: { method: "GET", path: "/", query: {}, headers: {} },
        response: { status_code: 500 },
        runtime: { version: "24" }
      }
    })
  }
];

function dependencies(objectStore: ObjectStoreReader): BuildBundleWorkerDependencies {
  return {
    objectStore,
    incidentStore: {
      listIncidentEventReferences: vi.fn().mockResolvedValue(references),
      listProbeEventCandidatesForServiceWindow: vi.fn().mockResolvedValue(references),
      listLogEventCandidatesForServiceWindow: vi.fn().mockResolvedValue(references)
    }
  } as unknown as BuildBundleWorkerDependencies;
}

const loaders: Array<[string, (objectStore: ObjectStoreReader) => Promise<unknown>, unknown]> = [
  [
    "incident events",
    (objectStore) =>
      loadIncidentEnvelopes({
        dependencies: dependencies(objectStore),
        projectId,
        incidentId: incident.incident_id
      }),
    []
  ],
  [
    "probe context",
    (objectStore) =>
      collectProbeDataItems({
        dependencies: dependencies(objectStore),
        incident,
        incidentEnvelopes
      }),
    []
  ],
  [
    "correlated logs",
    (objectStore) =>
      collectCorrelatedLogEnvelopes({
        dependencies: dependencies(objectStore),
        incident,
        incidentEnvelopes
      }),
    []
  ],
  [
    "improvement SDK",
    (objectStore) =>
      loadImprovementBundleSdk({ objectStore, projectId, sourceEventId: eventId, references }),
    { name: "unknown", version: "unknown" }
  ],
  [
    "improvement logs",
    (objectStore) => loadSampleLogItems({ objectStore, projectId, references }),
    []
  ],
  [
    "improvement request",
    (objectStore) => loadRepresentativeRequestContext({ objectStore, projectId, references }),
    { request: null, response: null }
  ]
];

it.each(loaders)("does not mistake a storage outage for absent %s", async (_name, load) => {
  const outage = new Error("temporary_storage_outage");
  const getObject = vi.fn().mockRejectedValue(outage);
  await expect(load({ getObject })).rejects.toBe(outage);
  expect(getObject).toHaveBeenCalledTimes(1);
});

it.each(loaders)("still permits expired retained %s to be absent", async (_name, load, empty) => {
  const getObject = vi.fn().mockRejectedValue(new Error("s3_object_not_found"));
  await expect(load({ getObject })).resolves.toEqual(empty);
  expect(getObject).toHaveBeenCalledTimes(1);
});
