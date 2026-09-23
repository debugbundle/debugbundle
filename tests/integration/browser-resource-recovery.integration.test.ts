import { createPostgresRetentionStore } from "../../packages/storage/src/retention-store.js";
import { randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createEventEnvelope, type EventEnvelope } from "../../packages/shared-types/src/index.js";
import {
  buildRawEventObjectKey,
  buildBundleObjectKey,
  createPostgresMetadataStore,
  createRedisQueueClient
} from "../../packages/storage/src/index.js";
import { createWorkerJobStore } from "../../packages/storage/src/worker-job-store.js";
import { createDurableWorkerQueue } from "../../apps/worker/src/durable-queue.js";
import { createDurableIncidentProcessing } from "../../apps/worker/src/durable-incident-processing.js";
import { processNextBuildBundleJob } from "../../apps/worker/src/processor.js";
import { browserResourceEvent } from "../helpers/browser-resource-fixtures.js";
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  createTestObjectStore,
  redisUrl,
  runIntegration,
  seedOwnedProject,
  createNonSpikingFrequencyCounter
} from "../helpers/integration-setup.js";

runIntegration("browser recovery correlation through durable processing", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const s3 = createS3AdminClient();
  const objectStore = createTestObjectStore();
  const redis = createRedisQueueClient({ redisUrl });
  beforeAll(async () => {
    await bootstrapStorageAndCreateBucket(pool, s3);
  });
  afterAll(async () => {
    await redis.close();
    await pool.end();
    s3.destroy();
  });

  it.each([
    [false, "request"],
    [true, "request"],
    [false, "breadcrumb"],
    [true, "breadcrumb"]
  ] as const)(
    "finds context-only recovery, first=%s, type=%s",
    async (recoveryFirst, eventKind) => {
      const projectId = randomUUID();
      await seedOwnedProject({
        pool,
        projectId,
        organizationId: randomUUID(),
        organizationName: "Recovery",
        organizationSlug: `recovery-${projectId}`,
        projectName: "Recovery",
        projectSlug: "recovery"
      });
      const queue = createDurableWorkerQueue(db, redis, false);
      const processing = createDurableIncidentProcessing({
        queue,
        objectStore,
        logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as never,
        analyticsHashSecret: "test",
        frequencyCounter: createNonSpikingFrequencyCounter(),
        requestAnomalyCounter: { recordObservation: vi.fn() },
        improvementWorker: { objectStore },
        lifecycleWebhookPublisher: { publish: vi.fn() },
        githubDispatchPublisher: { publish: vi.fn() }
      });
      const time = Date.now();
      const resource = browserResourceEvent({
        url: "https://app.example.com/assets/app.js",
        page: "https://app.example.com/gallery"
      });
      resource.event_id = randomUUID();
      resource.occurred_at = new Date(time).toISOString();
      resource.correlation = {
        session_id: "browser-session",
        trace_id: null,
        request_id: null,
        user_id_hash: null
      };
      const requestRecovery = createEventEnvelope({
        event_id: randomUUID(),
        event_type: "request_event",
        occurred_at: new Date(time + 1000).toISOString(),
        service: resource.service,
        correlation: { session_id: "browser-session" },
        payload: {
          method: "POST",
          path: "/api/signed-url/refresh",
          query: {},
          headers: {},
          response_status: 404,
          duration_ms: 10
        }
      });
      const recovery =
        eventKind === "request"
          ? requestRecovery
          : createEventEnvelope({
              event_id: randomUUID(),
              event_type: "frontend_breadcrumb",
              occurred_at: requestRecovery.occurred_at,
              service: resource.service,
              correlation: { session_id: "browser-session" },
              payload: {
                breadcrumb_type: "network_request",
                route: "/gallery",
                data: { method: "POST", url: "/api/signed-url/refresh", status_code: 404 }
              }
            });
      const ingest = async (event: EventEnvelope) => {
        const key = buildRawEventObjectKey({
          projectId,
          eventId: event.event_id,
          occurredAt: new Date(event.occurred_at)
        });
        await objectStore.putObject({
          key,
          body: gzipSync(JSON.stringify(event)),
          contentType: "application/json",
          contentEncoding: "gzip"
        });
        await createWorkerJobStore(db).enqueue("normalize-events", {
          project_id: projectId,
          event_id: event.event_id,
          object_key: key
        });
        await processing.normalize();
        await processing.group();
      };
      const build = async () => {
        const result = await processNextBuildBundleJob({
          queue,
          objectStore,
          incidentStore: createPostgresMetadataStore(db)
        });
        await queue.ackClaimedJobs(result);
        return result;
      };
      try {
        if (recoveryFirst) await ingest(recovery);
        await ingest(resource);
        await build();
        if (!recoveryFirst) {
          for (const wrong of [
            {
              ...requestRecovery,
              event_id: randomUUID(),
              service: { ...requestRecovery.service, name: "other" }
            },
            {
              ...requestRecovery,
              event_id: randomUUID(),
              service: { ...requestRecovery.service, environment: "staging" }
            },
            {
              ...requestRecovery,
              event_id: randomUUID(),
              correlation: { ...requestRecovery.correlation!, session_id: "other-session" }
            },
            {
              ...requestRecovery,
              event_id: randomUUID(),
              occurred_at: new Date(time + 31000).toISOString()
            }
          ]) {
            await ingest(wrong);
            expect((await build()).processed).toBe(false);
          }
          await ingest(recovery);
          expect((await build()).processed).toBe(true);
        }
        const incidents = (
          await pool.query<{ id: string; occurrence_count: number }>("SELECT id, occurrence_count FROM incidents WHERE project_id = $1", [
            projectId
          ])
        ).rows;
        expect(incidents).toHaveLength(1);
        const incident = incidents[0];
        if (incident === undefined) throw new Error("Expected the resource incident");
        expect(incident.occurrence_count).toBe(1);
        const bundle = JSON.parse(
          gunzipSync(
            await objectStore.getObject({ key: buildBundleObjectKey(projectId, incident.id) })
          ).toString()
        );
        expect(bundle.context.resource_failure.recovery_failures).toEqual([
          expect.objectContaining({
            path: "/api/signed-url/refresh",
            status_code: 404,
            delay_ms: 1000
          })
        ]);
        expect(bundle.summary.likely_cause).toContain("HTTP 404");
        await ingest(recovery);
        expect((await build()).processed).toBe(false);
        const repeated = JSON.parse(
          gunzipSync(
            await objectStore.getObject({ key: buildBundleObjectKey(projectId, incident.id) })
          ).toString()
        );
        expect(repeated).toEqual(bundle);
        const index = (
          await pool.query(
            "SELECT session_hash, trace_hash FROM browser_recovery_events WHERE project_id = $1",
            [projectId]
          )
        ).rows;
        expect(index.length).toBeGreaterThanOrEqual(2);
        expect(JSON.stringify(index)).not.toContain("browser-session");
        await pool.query(
          "UPDATE browser_recovery_events SET expires_at = now() - interval '1 second' WHERE project_id = $1",
          [projectId]
        );
        expect(
          await createPostgresRetentionStore(db).pruneExpiredBrowserRecoveryEvents!({
            now: new Date().toISOString(),
            limit: 100
          })
        ).toBe(index.length);
      } finally {
        await queue.close();
        await pool.query("DELETE FROM projects WHERE id = $1", [projectId]);
      }
    }
  );
});
