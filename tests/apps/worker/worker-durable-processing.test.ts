import { gzipSync } from "node:zlib";
import { beforeEach, expect, it, vi } from "vitest";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import type { Queryable } from "../../../packages/storage/src/index.js";
import type { DurableWorkerQueue } from "../../../apps/worker/src/durable-queue.js";
import type {
  NormalizeWorkerDependencies,
  GroupIncidentWorkerDependencies
} from "../../../apps/worker/src/processor.js";
import { createDurableIncidentProcessing } from "../../../apps/worker/src/durable-incident-processing.js";

const mocks = vi.hoisted(() => ({
  normalize: vi.fn(),
  group: vi.fn(),
  evaluateEvent: vi.fn(),
  evaluateIncident: vi.fn(),
  enqueue: vi.fn(),
  upsertIncident: vi.fn(),
  frequency: vi.fn(),
  getObject: vi.fn(),
  deleteObject: vi.fn(),
  webhook: vi.fn(),
  github: vi.fn(),
  opportunityStore: {},
  analyticsStore: {}
}));
vi.mock("../../../apps/worker/src/processor.js", () => ({
  processNextNormalizeEventsJob: mocks.normalize,
  processNextGroupIncidentJob: mocks.group
}));
vi.mock("../../../apps/worker/src/improvement-bundles.js", () => ({
  maybeGenerateHostedImprovementBundle: mocks.evaluateEvent,
  maybeGenerateHostedIncidentImprovementBundle: mocks.evaluateIncident
}));
vi.mock("../../../packages/storage/src/worker-job-store.js", () => ({
  createWorkerJobStore: () => ({ enqueue: mocks.enqueue })
}));
vi.mock("../../../packages/storage/src/index.js", () => ({
  createPostgresMetadataStore: () => ({ upsertIncident: mocks.upsertIncident }),
  createPostgresAccountAnalyticsStore: () => mocks.analyticsStore,
  createPostgresAnalyticsCorrelationStore: () => ({}),
  createPostgresImprovementOpportunityStore: () => mocks.opportunityStore
}));
const projectId = "142f36fd-4e11-4817-9530-5c1f6b3b3aa1";
const incidentId = "322e4fdf-5433-40f1-bd61-16669aac83fa";
const eventId = "84ae4bb4-cd8e-47c5-9e41-906513d58f46";
const occurredAt = "2026-09-13T00:00:00.000Z";
const db: Queryable = { query: vi.fn().mockResolvedValue({ rows: [] }) };
const queue = {
  enqueueInternal: vi.fn(),
  dequeueInternal: vi.fn(),
  transaction: (
    _name: string,
    callback: (db: Queryable, queue: DurableWorkerQueue) => Promise<unknown>
  ) => callback(db, queue as unknown as DurableWorkerQueue)
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enqueue.mockResolvedValue("a".repeat(64));
  mocks.upsertIncident.mockResolvedValue({ incident_id: incidentId });
  mocks.frequency.mockResolvedValue({});
  mocks.evaluateEvent.mockResolvedValue(undefined);
  mocks.evaluateIncident.mockResolvedValue(undefined);
  queue.dequeueInternal.mockResolvedValue(null);
});
function processing(deleteObject = mocks.deleteObject) {
  return createDurableIncidentProcessing({
    queue: queue as unknown as DurableWorkerQueue,
    objectStore: { getObject: mocks.getObject, putObject: vi.fn(), deleteObject },
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as never,
    analyticsHashSecret: "test-only",
    frequencyCounter: { recordOccurrence: mocks.frequency },
    requestAnomalyCounter: { recordObservation: vi.fn() },
    improvementWorker: { objectStore: { getObject: vi.fn(), putObject: vi.fn() } },
    lifecycleWebhookPublisher: { publish: mocks.webhook },
    githubDispatchPublisher: { publish: mocks.github }
  });
}
const lifecycle = {
  project_id: projectId,
  incident_id: incidentId,
  event_type: "bundle.created" as const,
  occurred_at: occurredAt,
  service_name: "checkout",
  environment: "production",
  severity: "high" as const
};

it("defers optional evaluation with the original validated event and classification", async () => {
  const event = createEventEnvelope({
    event_id: eventId,
    event_type: "log_event",
    occurred_at: occurredAt,
    service: { name: "checkout", environment: "production", runtime: "node" },
    payload: { level: "warning", message: "Slow checkout", attributes: {} }
  });
  mocks.normalize.mockImplementation(async (deps: NormalizeWorkerDependencies) => {
    await deps.deferImprovement!({
      project_id: projectId,
      event,
      normalized: {} as never,
      event_class: "context_signal",
      object_key: `raw-events/${projectId}/day/event.json.gz`
    });
    return { processed: true };
  });
  await processing().normalize();
  expect(queue.enqueueInternal).toHaveBeenCalledWith("evaluate-event-improvement", {
    project_id: projectId,
    event_id: eventId,
    object_key: `raw-events/${projectId}/day/event.json.gz`,
    event_class: "context_signal"
  });
  mocks.getObject.mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event))));
  queue.dequeueInternal.mockResolvedValue({
    project_id: projectId,
    event_id: eventId,
    object_key: `raw-events/${projectId}/day/event.json.gz`,
    event_class: "context_signal"
  });
  await processing().evaluateEventImprovement();
  expect(mocks.evaluateEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      project_id: projectId,
      event,
      dependencies: expect.objectContaining({
        improvementOpportunityStore: mocks.opportunityStore,
        accountAnalyticsStore: mocks.analyticsStore
      })
    })
  );
});

it("preserves bundle dependencies and defers object deletion instead of performing it inside grouping", async () => {
  mocks.group.mockImplementation(async (deps: GroupIncidentWorkerDependencies) => {
    await deps.incidentStore.upsertIncident({
      project_id: projectId,
      service_name: "checkout",
      environment: "production",
      fingerprint: "same"
    } as never);
    await deps.queue.enqueue("build-bundle", {
      project_id: projectId,
      incident_id: incidentId
    } as never);
    await deps.lifecycleWebhookPublisher.publish(lifecycle);
    await deps.githubDispatchPublisher!.publish(lifecycle);
    await deps.objectStore!.deleteObject!({ key: `raw-events/${projectId}/day/event.json.gz` });
    await deps.frequencyCounter.recordOccurrence({
      incident_id: incidentId,
      event_id: eventId,
      occurred_at: occurredAt
    });
    return { processed: true };
  });
  await processing().group();
  expect(mocks.upsertIncident).toHaveBeenCalledOnce();
  expect(queue.enqueueInternal).toHaveBeenCalledWith(
    "publish-incident-lifecycle",
    { project_id: projectId, channel: "webhook", input: lifecycle },
    { dependsOn: "a".repeat(64) }
  );
  expect(queue.enqueueInternal).toHaveBeenCalledWith(
    "publish-incident-lifecycle",
    { project_id: projectId, channel: "github", input: lifecycle },
    { dependsOn: "a".repeat(64) }
  );
  expect(queue.enqueueInternal).toHaveBeenCalledWith("delete-retained-object", {
    project_id: projectId,
    key: `raw-events/${projectId}/day/event.json.gz`
  });
  expect(mocks.deleteObject).not.toHaveBeenCalled();
  expect(mocks.frequency).toHaveBeenCalledWith(
    { incident_id: incidentId, event_id: eventId, occurred_at: occurredAt },
    db
  );
});

it("keeps incident-derived improvement evaluation independently scoped and validates its input", async () => {
  const payload = {
    project_id: projectId,
    incident_id: incidentId,
    event_id: eventId,
    event_type: "backend_exception",
    service_name: "checkout",
    environment: "production",
    incident_title: "Checkout failed",
    incident_severity: "high",
    incident_occurrence_count: 3,
    occurred_at: occurredAt,
    regressed_now: false
  };
  queue.dequeueInternal.mockResolvedValue(payload);
  await processing().evaluateIncidentImprovement();
  expect(mocks.evaluateIncident).toHaveBeenCalledWith(
    expect.objectContaining({ ...payload, regression_deploy: null })
  );
  queue.dequeueInternal.mockResolvedValue({ ...payload, project_id: "invalid" });
  await expect(processing().evaluateIncidentImprovement()).rejects.toThrow();
  expect(mocks.evaluateIncident).toHaveBeenCalledTimes(1);
});

it("publishes only matching project scope and routes each deferred lifecycle channel correctly", async () => {
  for (const channel of ["webhook", "github"]) {
    queue.dequeueInternal.mockResolvedValue({ project_id: projectId, channel, input: lifecycle });
    await processing().publishLifecycle();
  }
  expect(mocks.webhook).toHaveBeenCalledWith({ ...lifecycle, regression_deploy: null });
  expect(mocks.github).toHaveBeenCalledWith({ ...lifecycle, regression_deploy: null });
  queue.dequeueInternal.mockResolvedValue({
    project_id: eventId,
    channel: "webhook",
    input: lifecycle
  });
  await expect(processing().publishLifecycle()).rejects.toThrow();
  expect(mocks.webhook).toHaveBeenCalledTimes(1);
});

it("permits only the owning project's raw-event objects through deferred retention", async () => {
  const key = `raw-events/${projectId}/day/event.json.gz`;
  queue.dequeueInternal.mockResolvedValue({ project_id: projectId, key });
  await processing().deleteRetainedObject();
  expect(mocks.deleteObject).toHaveBeenCalledWith({ key });
  queue.dequeueInternal.mockResolvedValue({ project_id: eventId, key });
  await expect(processing().deleteRetainedObject()).rejects.toThrow(
    "worker_retention_scope_invalid"
  );
  queue.dequeueInternal.mockResolvedValue({
    project_id: projectId,
    key: `bundles/${projectId}/incident.json.gz`
  });
  await expect(processing().deleteRetainedObject()).rejects.toThrow(
    "worker_retention_scope_invalid"
  );
  expect(mocks.deleteObject).toHaveBeenCalledTimes(1);
});

it("rejects a mismatched optional source before evaluation and preserves source-read failures", async () => {
  const worker = processing();
  const payload = {
    project_id: projectId,
    event_id: eventId,
    object_key: `raw-events/${eventId}/day/event.json.gz`,
    event_class: "context_signal"
  };
  queue.dequeueInternal.mockResolvedValue(payload);
  await expect(worker.evaluateEventImprovement()).rejects.toThrow(
    "worker_improvement_scope_invalid"
  );
  expect(mocks.getObject).not.toHaveBeenCalled();
  queue.dequeueInternal.mockResolvedValue({
    ...payload,
    object_key: `raw-events/${projectId}/day/event.json.gz`
  });
  mocks.getObject.mockRejectedValueOnce(new Error("object_store_unavailable"));
  await expect(worker.evaluateEventImprovement()).rejects.toThrow("object_store_unavailable");
  const event = createEventEnvelope({
    event_id: incidentId,
    event_type: "log_event",
    occurred_at: occurredAt,
    service: { name: "checkout", environment: "production", runtime: "node" },
    payload: { level: "warning", message: "Slow checkout", attributes: {} }
  });
  mocks.getObject.mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event))));
  await expect(worker.evaluateEventImprovement()).rejects.toThrow(
    "worker_improvement_event_invalid"
  );
  expect(mocks.evaluateEvent).not.toHaveBeenCalled();
});

it("treats empty internal stages as idle without calling domain services", async () => {
  const worker = processing();
  for (const run of [
    worker.evaluateEventImprovement,
    worker.evaluateIncidentImprovement,
    worker.publishLifecycle,
    worker.deleteRetainedObject
  ])
    expect(await run()).toEqual({ processed: false, reason: "no_jobs" });
  expect(mocks.evaluateEvent).not.toHaveBeenCalled();
  expect(mocks.webhook).not.toHaveBeenCalled();
});
