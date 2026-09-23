import { expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import type { BundleBuildContext, ObjectStoreReader } from "../../../packages/storage/src/index.js";
import type { BuildBundleWorkerDependencies } from "../../../apps/worker/src/processor-shared.js";
import {
  loadIncidentEnvelopes,
  collectProbeDataItems,
  collectCorrelatedLogEnvelopes,
  collectCorrelatedRecoveryEnvelopes
} from "../../../apps/worker/src/processor-bundle-context.js";
import {
  loadImprovementBundleSdk,
  loadSampleLogItems,
  loadRepresentativeRequestContext
} from "../../../apps/worker/src/improvement-bundle-context.js";
import { browserResourceEvent } from "../../helpers/browser-resource-fixtures.js";

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
const resourceEnvelope = browserResourceEvent({
  url: "https://app.example.com/assets/app.js",
  page: "https://app.example.com/gallery",
  tag: "link",
  readyState: "interactive",
  visibilityState: "hidden",
  attributes: { rel: "modulepreload" }
});
resourceEnvelope.occurred_at = occurredAt;
resourceEnvelope.correlation = {
  request_id: null,
  session_id: "session-1",
  trace_id: "trace",
  user_id_hash: null
};
const resourceIncidentEnvelopes = [
  {
    eventId: resourceEnvelope.event_id,
    eventType: "frontend_exception" as const,
    occurredAt,
    envelope: resourceEnvelope
  }
];

function dependencies(objectStore: ObjectStoreReader): BuildBundleWorkerDependencies {
  return {
    objectStore,
    incidentStore: {
      listIncidentEventReferences: vi.fn().mockResolvedValue(references),
      listProbeEventCandidatesForServiceWindow: vi.fn().mockResolvedValue(references),
      listLogEventCandidatesForServiceWindow: vi.fn().mockResolvedValue(references),
      listRequestEventCandidatesForServiceWindow: vi.fn().mockResolvedValue(references)
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
    "correlated recovery requests",
    (objectStore) =>
      collectCorrelatedRecoveryEnvelopes({
        dependencies: dependencies(objectStore),
        incident,
        incidentEnvelopes: resourceIncidentEnvelopes
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

it("loads only session-correlated recovery request candidates", async () => {
  const recovery = createEventEnvelope({
    event_type: "request_event",
    occurred_at: "2026-09-14T00:00:02.000Z",
    service: { name: "web", environment: "production", runtime: "browser" },
    correlation: { session_id: "session-1" },
    payload: {
      method: "POST",
      path: "/api/signed-url/refresh",
      query: {},
      headers: {},
      response_status: 404,
      duration_ms: 10
    }
  });
  const getObject = vi.fn().mockResolvedValue(
    gzipSync(Buffer.from(JSON.stringify(recovery), "utf8"))
  );
  const deps = dependencies({ getObject });
  deps.incidentStore.listRequestEventCandidatesForServiceWindow = vi.fn().mockResolvedValue([
    {
      event_id: recovery.event_id,
      event_type: "request_event",
      occurred_at: recovery.occurred_at
    }
  ]);

  await expect(
    collectCorrelatedRecoveryEnvelopes({
      dependencies: deps,
      incident,
      incidentEnvelopes: resourceIncidentEnvelopes
    })
  ).resolves.toEqual([recovery]);

  const wrongService = { ...recovery, service: { ...recovery.service, name: "api" } };
  getObject.mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify(wrongService), "utf8")));
  await expect(
    collectCorrelatedRecoveryEnvelopes({
      dependencies: deps,
      incident,
      incidentEnvelopes: resourceIncidentEnvelopes
    })
  ).resolves.toEqual([]);
});
