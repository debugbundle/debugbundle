import { gzipSync } from "node:zlib";
import { expect, it, vi } from "vitest";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { buildErrorContext } from "../../../packages/bundle-engine/src/error-context.js";
import {
  processNextNormalizeEventsJob,
  processNextGroupIncidentJob
} from "../../../apps/worker/src/processor.js";

it("retains six WildFly failures in two method groups without 108 frame incidents or frame alerts", async () => {
  const service = { name: "synthetic", environment: "test", runtime: "java", framework: "wildfly" };
  const frames = Array.from(
    { length: 18 },
    (_, i) =>
      `\tat deployment.synthetic-app.war/org.jboss.module@35.0.1/example.Service${i}.run(${i === 0 ? "Service.java:42" : "Unknown Source"})`
  );
  const stack = [
    "java.util.concurrent.ExecutionException: synthetic failure",
    "\tat java.base/java.util.concurrent.CompletableFuture.get(CompletableFuture.java:2073)",
    "Caused by: java.lang.NullPointerException: synthetic missing value",
    ...frames
  ].join("\n");
  const failures = Array.from({ length: 6 }, (_, i) =>
    createEventEnvelope({
      event_type: "backend_exception",
      sdk_name: "debugbundle-java",
      sdk_version: "3.1.0",
      service,
      correlation: { request_id: `synthetic-${i}` },
      payload: {
        name: "java.util.concurrent.ExecutionException",
        message: "synthetic failure",
        stack,
        handled: true,
        request: { method: i < 3 ? "GET" : "POST", path: "/synthetic", query: {}, headers: {} },
        response: { status_code: 500 },
        runtime: { version: "21" }
      }
    })
  );
  // Old installations may still send separate lines. Retain them as processed context.
  const legacyFrames = failures.flatMap((failure) =>
    frames.map((message) =>
      createEventEnvelope({
        event_type: "log_event",
        sdk_name: "debugbundle-java",
        sdk_version: "3.0.0",
        service,
        correlation: failure.correlation,
        payload: { level: "error", message, attributes: { logger: "stderr" } }
      })
    )
  );
  const groups = new Map<string, number>();
  const lifecycle = { publish: vi.fn().mockResolvedValue(undefined) };
  const alertQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const processed = { upsertProcessedEvent: vi.fn().mockResolvedValue(undefined) };
  const incidentStore = {
    upsertIncident: vi.fn(async (input: { fingerprint: string }) => {
      const count = (groups.get(input.fingerprint) ?? 0) + 1;
      groups.set(input.fingerprint, count);
      return {
        incident_id: input.fingerprint,
        matched_fields: [],
        occurrence_count: count,
        status: "open" as const,
        regressed_now: false
      };
    }),
    insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
    markIncidentSpiking: vi.fn().mockResolvedValue(false)
  };
  const frequencyCounter = {
    recordOccurrence: vi
      .fn()
      .mockResolvedValue({ has_sufficient_baseline: false, is_spiking: false })
  };
  for (const event of [...failures, ...legacyFrames]) {
    const queue = {
      dequeue: vi.fn().mockResolvedValue({
        project_id: "synthetic",
        event_id: event.event_id,
        object_key: "synthetic.json.gz"
      }),
      enqueue: vi.fn().mockResolvedValue(undefined)
    };
    await processNextNormalizeEventsJob({
      queue,
      processedEventStore: processed,
      objectStore: {
        getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event))))
      }
    });
    for (const [name, job] of queue.enqueue.mock.calls) {
      if (name !== "group-incident") continue;
      await processNextGroupIncidentJob({
        queue: { dequeue: vi.fn().mockResolvedValue(job), enqueue: vi.fn() },
        incidentStore,
        frequencyCounter,
        lifecycleWebhookPublisher: lifecycle,
        alertEvaluationQueue: alertQueue
      });
    }
  }
  expect(legacyFrames).toHaveLength(108);
  expect(processed.upsertProcessedEvent).toHaveBeenCalledTimes(114);
  expect([...groups.values()]).toEqual([3, 3]);
  expect(incidentStore.upsertIncident).toHaveBeenCalledTimes(6);
  expect(
    lifecycle.publish.mock.calls.filter(([event]) => event.event_type === "bundle.created")
  ).toHaveLength(2);
  expect(
    alertQueue.enqueue.mock.calls.filter(([, job]) => job.condition_type === "new_incident")
  ).toHaveLength(2);
  expect(alertQueue.enqueue.mock.calls).toHaveLength(8); // 2 lifecycle + 6 severity evaluations; none from frames.
  const error = buildErrorContext(
    {
      incident_id: "synthetic",
      project_id: "synthetic",
      service_id: null,
      service_name: service.name,
      service_runtime: "java",
      service_framework: "wildfly",
      environment: "test",
      fingerprint: "synthetic",
      title: "synthetic failure",
      severity: "high",
      first_seen_at: failures[0]!.occurred_at,
      last_seen_at: failures[0]!.occurred_at,
      occurrence_count: 3,
      source_event_types: ["backend_exception"]
    },
    failures[0]!
  );
  expect(error?.stack).toContain("Caused by: java.lang.NullPointerException");
  expect(error?.stack).toContain("Service.java:42");
});
