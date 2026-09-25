import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { gzipSync, gunzipSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createEventEnvelope } from "../../packages/shared-types/src/index.js";
import {
  createPostgresMetadataStore,
  createPostgresAlertDeliveryStore,
  createRedisQueueClient,
  createRedisIncidentFrequencyCounter,
  buildRawEventObjectKey,
  buildBundleObjectKey,
  buildReproductionObjectKey,
  type Queryable
} from "../../packages/storage/src/index.js";
import { createWorkerJobStore } from "../../packages/storage/src/worker-job-store.js";
import { createDurableWorkerQueue } from "../../apps/worker/src/durable-queue.js";
import { runWorkerProcessStep } from "../../apps/worker/src/worker-steps.js";
import { createDurableIncidentProcessing } from "../../apps/worker/src/durable-incident-processing.js";
import { processNextEvaluateAlertsJob } from "../../apps/worker/src/processor-alerts.js";
import type { EvaluateAlertsWorkerDependencies } from "../../apps/worker/src/processor-shared.js";
import {
  processNextBuildBundleJob,
  processNextBuildReproductionJob
} from "../../apps/worker/src/processor.js";
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  createTestObjectStore,
  redisUrl,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

runIntegration("worker pipeline crash recovery", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const s3 = createS3AdminClient();
  const redis = createRedisQueueClient({ redisUrl });
  const objectStore = createTestObjectStore();
  const frequencyCounter = createRedisIncidentFrequencyCounter({ redisUrl, snapshotStore: db });
  const projectId = randomUUID();
  let ownerUserId = "";
  const store = createWorkerJobStore(db);
  const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as never;
  beforeAll(async () => {
    await bootstrapStorageAndCreateBucket(pool, s3);
    const owner = await seedOwnedProject({
      pool,
      projectId,
      organizationId: randomUUID(),
      organizationName: "Recovery",
      organizationSlug: `recovery-${projectId}`,
      organizationPlan: "team",
      projectName: "Recovery",
      projectSlug: "recovery"
    });
    ownerUserId = owner.ownerUserId;
  });
  beforeEach(async () => {
    await pool.query("DELETE FROM worker_jobs WHERE project_id = $1", [projectId]);
    await pool.query("DELETE FROM incidents WHERE project_id = $1", [projectId]);
    await redis.clearJobQueue("normalize-events");
    await redis.clearJobQueue("group-incident");
  });
  afterAll(async () => {
    await redis.close();
    await frequencyCounter.close();
    await pool.query("DELETE FROM worker_jobs WHERE project_id = $1", [projectId]);
    await pool.end();
    s3.destroy();
  });

  function worker(connection = db, ingress = redis) {
    const queue = createDurableWorkerQueue(connection, ingress, false);
    const processing = createDurableIncidentProcessing({
      queue,
      objectStore,
      logger,
      analyticsHashSecret: "integration-secret",
      frequencyCounter,
      requestAnomalyCounter: { recordObservation: vi.fn() },
      improvementWorker: { objectStore },
      lifecycleWebhookPublisher: { publish: vi.fn() },
      githubDispatchPublisher: { publish: vi.fn() }
    });
    return { queue, processing };
  }

  async function ingest(occurredAt = new Date().toISOString(), warning = false) {
    const event = warning
      ? createEventEnvelope({
          event_id: randomUUID(),
          occurred_at: occurredAt,
          event_type: "log_event",
          service: { name: "checkout", environment: "production", runtime: "node" },
          payload: { level: "warning", message: "Checkout slow", attributes: {} }
        })
      : createEventEnvelope({
          event_id: randomUUID(),
          occurred_at: occurredAt,
          event_type: "backend_exception",
          service: { name: "checkout", environment: "production", runtime: "node" },
          payload: {
            name: "TypeError",
            message: "Checkout failed",
            stack: "TypeError: Checkout failed\n at checkout (/app/checkout.ts:12:1)",
            handled: false,
            request: { method: "POST", path: "/checkout", query: {}, headers: {} },
            response: { status_code: 500 },
            runtime: { version: "24.0.0" }
          }
        });
    const key = buildRawEventObjectKey({
      projectId,
      eventId: event.event_id,
      occurredAt: new Date(event.occurred_at)
    });
    await objectStore.putObject({
      key,
      body: gzipSync(Buffer.from(JSON.stringify(event))),
      contentType: "application/json",
      contentEncoding: "gzip"
    });
    await redis.enqueue("normalize-events", {
      project_id: projectId,
      event_id: event.event_id,
      object_key: key
    });
    return event;
  }

  it("keeps a delayed 100-line redirected Java trace to one incident while retaining a separate failure", async () => {
    const base = Date.parse("2026-09-22T14:59:52.754Z");
    const lines = [
      "java.util.concurrent.ExecutionException: java.util.ConcurrentModificationException",
      ...Array.from({ length: 48 }, (_, index) => `    at example.ChartService.render(ChartService.java:${index + 10})`),
      "Caused by: java.util.ConcurrentModificationException",
      ...Array.from({ length: 49 }, (_, index) => `\tat example.ChartModel.read(ChartModel.java:${index + 20})`),
      "    ... 12 more"
    ];
    expect(lines).toHaveLength(100);

    for (const [index, message] of [...lines, "java.lang.IllegalArgumentException: separate failure"].entries()) {
      const event = createEventEnvelope({
        event_id: randomUUID(),
        occurred_at: new Date(base + (index < lines.length ? index * 190 : 30_000)).toISOString(),
        event_type: "log_event",
        service: { name: "hcp", environment: "staging", runtime: "java" },
        payload: { level: "error", message, attributes: { logger: "org.jboss.stdio" } }
      });
      const key = buildRawEventObjectKey({ projectId, eventId: event.event_id, occurredAt: new Date(event.occurred_at) });
      await objectStore.putObject({
        key,
        body: gzipSync(Buffer.from(JSON.stringify(event))),
        contentType: "application/json",
        contentEncoding: "gzip"
      });
      await redis.enqueue("normalize-events", { project_id: projectId, event_id: event.event_id, object_key: key });
    }

    const active = worker();
    for (let index = 0; index < lines.length + 1; index += 1) {
      expect(await active.processing.normalize()).toMatchObject({ processed: true });
    }
    for (let index = 0; index < lines.length + 1; index += 1) {
      expect(await active.processing.group()).toMatchObject({ processed: true });
    }

    const incidents = await pool.query<{ id: string; title: string }>(
      "SELECT id::text, title FROM incidents WHERE project_id = $1 ORDER BY title", [projectId]
    );
    expect(incidents.rows).toHaveLength(2);
    expect(incidents.rows.map((row) => row.title)).toEqual(expect.arrayContaining([
      expect.stringContaining("ExecutionException"),
      expect.stringContaining("IllegalArgumentException")
    ]));
    const lifecycleIncidentIds = (await pool.query<{ incident_id: string }>(
      `SELECT payload->'input'->>'incident_id' AS incident_id FROM worker_jobs
       WHERE project_id = $1 AND job_name = 'publish-incident-lifecycle'
         AND payload->>'channel' = 'webhook'`, [projectId]
    )).rows.map((row) => row.incident_id).sort();
    expect(lifecycleIncidentIds).toEqual(incidents.rows.map((incident) => incident.id).sort());
    const evaluations = await pool.query<{ condition_type: string; count: string }>(
      `SELECT payload->>'condition_type' AS condition_type, count(*)::text AS count
       FROM worker_jobs WHERE project_id = $1 AND job_name = 'evaluate-alerts'
       GROUP BY payload->>'condition_type' ORDER BY condition_type`,
      [projectId]
    );
    expect(evaluations.rows).toEqual([
      { condition_type: "new_incident", count: "2" },
      { condition_type: "severity_threshold", count: "2" }
    ]);

    const alertIds: string[] = [];
    try {
      for (const channel of ["slack", "discord", "webhook", "email"] as const) {
        const alertId = randomUUID();
        alertIds.push(alertId);
        const config = channel === "email" ? { to: "synthetic-alerts@example.test" }
          : channel === "webhook" ? { target_url: "https://example.test/alerts" }
            : { webhook_url: "https://example.test/alerts" };
        await pool.query(
          `INSERT INTO alert_rules (
            id, project_id, created_by_user_id, channel, condition_type, severity_min,
            severity_lifecycle_scope, cooldown_seconds, config, is_enabled
          ) VALUES ($1, $2, $3, $4, 'new_incident', NULL, NULL, 0, $5::jsonb, true)`,
          [alertId, projectId, ownerUserId, channel, JSON.stringify(config)]
        );
      }

      const newIncidentJobs = await pool.query<{ payload: Record<string, unknown> }>(
        `SELECT payload FROM worker_jobs
         WHERE project_id = $1 AND job_name = 'evaluate-alerts'
           AND payload->>'condition_type' = 'new_incident' ORDER BY created_at`,
        [projectId]
      );
      const delivered = vi.fn().mockResolvedValue(undefined);
      const alertStore = createPostgresAlertDeliveryStore(db);
      for (const { payload } of newIncidentJobs.rows) {
        await processNextEvaluateAlertsJob({
          queue: { dequeue: async () => payload },
          alertStore,
          alertTransport: { deliver: delivered }
        } as unknown as EvaluateAlertsWorkerDependencies);
      }

      const incidentIds = (await pool.query<{ id: string }>(
        "SELECT id::text FROM incidents WHERE project_id = $1 ORDER BY id", [projectId]
      )).rows.map((row) => row.id);
      expect(delivered).toHaveBeenCalledTimes(6);
      for (const channel of ["slack", "discord", "webhook"] as const) {
        const channelIncidentIds = delivered.mock.calls
          .map((call) => call[0] as { channel: string; incident_id: string })
          .filter((delivery) => delivery.channel === channel)
          .map((delivery) => delivery.incident_id)
          .sort();
        expect(channelIncidentIds).toEqual(incidentIds);
      }
      const digest = await pool.query<{ digest_count: string; member_count: string }>(
        `SELECT count(DISTINCT digests.id)::text AS digest_count,
                count(DISTINCT items.incident_id)::text AS member_count
         FROM alert_email_digests digests
         JOIN alert_email_digest_items items ON items.digest_id = digests.id
         WHERE digests.project_id = $1`, [projectId]
      );
      expect(digest.rows[0]).toEqual({ digest_count: "1", member_count: "2" });
    } finally {
      await pool.query("DELETE FROM alert_email_digests WHERE project_id = $1 AND recipient = $2", [
        projectId, "synthetic-alerts@example.test"
      ]);
      await pool.query("DELETE FROM alert_rules WHERE id = ANY($1::uuid[])", [alertIds]);
    }
  }, 30_000);

  function crashAfterEnqueue(jobName: string): Queryable {
    return {
      ...db,
      transaction: (callback) =>
        db.transaction!((tx) =>
          callback({
            ...tx,
            query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => {
              const result = await tx.query<Row>(sql, params);
              if (sql.includes("INSERT INTO worker_jobs") && params[1] === jobName)
                throw new Error("simulated_process_exit");
              return result;
            }
          })
        )
    };
  }

  it.each(["group-incident", "build-bundle"])(
    "recovers an interruption after persisting %s without losing work or inflating occurrences",
    async (crashJob) => {
      const event = await ingest();
      const first = worker(crashAfterEnqueue(crashJob));
      if (crashJob === "build-bundle") await first.processing.normalize();
      await expect(
        crashJob === "group-incident" ? first.processing.normalize() : first.processing.group()
      ).rejects.toThrow("simulated_process_exit");
      await first.queue.failClaimedJobs();
      if (crashJob === "group-incident") {
        expect(
          (
            await pool.query("SELECT event_id FROM processed_events WHERE event_id = $1", [
              event.event_id
            ])
          ).rows
        ).toHaveLength(0);
      } else {
        expect(
          (await pool.query("SELECT id FROM incidents WHERE project_id = $1", [projectId])).rows
        ).toHaveLength(0);
      }
      await pool.query(
        "UPDATE worker_jobs SET available_at = now() WHERE project_id = $1 AND status = 'pending'",
        [projectId]
      );
      const noLegacyScan = {
        ...redis,
        readJobQueue: vi.fn().mockRejectedValue(new Error("unbounded_legacy_queue_scan"))
      };
      const restarted = worker(db, noLegacyScan);
      if (crashJob === "group-incident") await restarted.processing.normalize();
      await restarted.processing.group();
      const incident = (
        await pool.query<{ id: string; occurrence_count: number }>(
          "SELECT id, occurrence_count FROM incidents WHERE project_id = $1",
          [projectId]
        )
      ).rows[0]!;
      expect(incident.occurrence_count).toBe(1);
      await processNextBuildBundleJob({
        queue: restarted.queue,
        objectStore,
        incidentStore: createPostgresMetadataStore(db)
      });
      await restarted.queue.ackClaimedJobs();
      const rawBundle = await objectStore.getObject({
        key: buildBundleObjectKey(projectId, incident.id)
      });
      expect(JSON.parse(gunzipSync(rawBundle).toString()).bundle_id).toBe(`bnd_${incident.id}`);
      await processNextBuildReproductionJob({ queue: restarted.queue, objectStore });
      await restarted.queue.ackClaimedJobs();
      expect(
        (
          await pool.query<{ job_name: string }>(
            "SELECT job_name FROM worker_jobs WHERE project_id = $1 AND status = 'completed'",
            [projectId]
          )
        ).rows.map((row) => row.job_name)
      ).toEqual(
        expect.arrayContaining([
          "normalize-events",
          "group-incident",
          "build-bundle",
          "build-reproduction"
        ])
      );
    }
  );

  it("retries unavailable raw evidence without publishing an empty incident bundle", async () => {
    await ingest();
    const active = worker();
    try {
      await active.processing.normalize();
      await active.processing.group();
      const putObject = vi.fn(objectStore.putObject);
      const run = (storage: typeof objectStore) =>
        runWorkerProcessStep(
          logger,
          "build-bundle",
          () =>
            processNextBuildBundleJob({
              queue: active.queue,
              objectStore: storage,
              incidentStore: createPostgresMetadataStore(db)
            }),
          active.queue
        );
      expect(
        await run({
          ...objectStore,
          putObject,
          getObject: vi.fn().mockRejectedValue(new Error("temporary_storage_outage"))
        })
      ).toMatchObject({ reason: "step_error" });
      expect(putObject).not.toHaveBeenCalled();
      expect(
        (
          await pool.query(
            "SELECT status, attempts FROM worker_jobs WHERE project_id = $1 AND job_name = 'build-bundle'",
            [projectId]
          )
        ).rows[0]
      ).toEqual({ status: "pending", attempts: 1 });
      await pool.query(
        "UPDATE worker_jobs SET available_at = now() WHERE project_id = $1 AND job_name = 'build-bundle'",
        [projectId]
      );
      expect(await run(objectStore)).toEqual({ processed: true });
      const incident = (
        await pool.query<{
          id: string;
          occurrence_count: number;
          bundle_generation_number: number;
          bundle_failure_reason: string | null;
        }>(
          "SELECT id, occurrence_count, bundle_generation_number, bundle_failure_reason FROM incidents WHERE project_id = $1",
          [projectId]
        )
      ).rows[0]!;
      expect(incident).toMatchObject({
        occurrence_count: 1,
        bundle_generation_number: 1,
        bundle_failure_reason: null
      });
      const stored = await objectStore.getObject({
        key: buildBundleObjectKey(projectId, incident.id)
      });
      expect(JSON.parse(gunzipSync(stored).toString()).context.error.message).toBe(
        "Checkout failed"
      );
    } finally {
      await active.queue.close();
    }
  });

  it.each(["read", "invalid", "write"])(
    "retains reproduction work after a temporary %s failure and recovers the artifact",
    async (failure) => {
      await ingest();
      const active = worker();
      try {
        await active.processing.normalize();
        await active.processing.group();
        const { id: incidentId } = (
          await pool.query<{ id: string }>("SELECT id FROM incidents WHERE project_id = $1", [
            projectId
          ])
        ).rows[0]!;
        await processNextBuildBundleJob({
          queue: active.queue,
          objectStore,
          incidentStore: createPostgresMetadataStore(db)
        });
        await active.queue.ackClaimedJobs();
        const unavailable = {
          ...objectStore,
          getObject:
            failure === "write"
              ? objectStore.getObject
              : vi.fn().mockImplementation(async () => {
                  if (failure === "read") throw new Error("temporary_storage_outage");
                  return gzipSync(Buffer.from("{}"));
                }),
          putObject:
            failure === "write"
              ? vi.fn().mockRejectedValue(new Error("temporary_storage_outage"))
              : objectStore.putObject
        };
        const run = (storage: typeof objectStore) =>
          runWorkerProcessStep(
            logger,
            "build-reproduction",
            () => processNextBuildReproductionJob({ queue: active.queue, objectStore: storage }),
            active.queue
          );
        expect(await run(unavailable)).toMatchObject({ reason: "step_error" });
        const failed = (
          await pool.query<{ id: string; status: string; attempts: number; payload: unknown }>(
            "SELECT id, status, attempts, payload FROM worker_jobs WHERE project_id = $1 AND job_name = 'build-reproduction'",
            [projectId]
          )
        ).rows[0]!;
        expect(failed).toMatchObject({ status: "pending", attempts: 1 });
        expect(failed.payload).not.toBeNull();
        await pool.query("UPDATE worker_jobs SET available_at = now() WHERE id = $1", [failed.id]);
        expect(await run(objectStore)).toEqual({ processed: true });
        expect(
          (
            await pool.query("SELECT status, attempts, payload FROM worker_jobs WHERE id = $1", [
              failed.id
            ])
          ).rows[0]
        ).toMatchObject({ status: "completed", attempts: 2, payload: null });
        const stored = await objectStore.getObject({
          key: buildReproductionObjectKey(projectId, incidentId)
        });
        expect(JSON.parse(gunzipSync(stored).toString())).toMatchObject({
          possible: false,
          reason: "request_target_unavailable"
        });
      } finally {
        await active.queue.close();
      }
    }
  );

  it("persists Redis ownership before acknowledgment and deduplicates a replay after acknowledgment failure", async () => {
    await ingest();
    const crashRedis = {
      ...redis,
      claim: async (name: Parameters<typeof redis.claim>[0]) => {
        const claim = await redis.claim(name);
        return claim === null
          ? null
          : {
              payload: claim.payload,
              ack: async () => {
                throw new Error("redis_ack_failed");
              }
            };
      }
    } as typeof redis;
    const first = worker(db, crashRedis);
    await expect(first.processing.normalize()).rejects.toThrow("redis_ack_failed");
    expect((await store.summary()).pending).toBe(1);
    const restarted = worker();
    await restarted.processing.normalize();
    await redis.reclaimStaleProcessingJobs("normalize-events", Date.now() + 1);
    expect(await restarted.processing.normalize()).toMatchObject({ processed: false });
    expect(
      (
        await pool.query(
          "SELECT id FROM worker_jobs WHERE project_id = $1 AND job_name = 'group-incident'",
          [projectId]
        )
      ).rows
    ).toHaveLength(1);
  });

  it("accepts a later explicit regeneration even when its source event is unchanged", async () => {
    const queue = worker().queue;
    await redis.clearJobQueue("build-bundle");
    const payload = {
      project_id: projectId,
      incident_id: randomUUID(),
      event_id: randomUUID(),
      occurred_at: new Date().toISOString(),
      occurrence_count: 1,
      trigger: "regeneration" as const
    };
    await redis.enqueue("build-bundle", payload);
    expect(await queue.dequeue("build-bundle")).toEqual(payload);
    await queue.enqueue("build-reproduction", {
      project_id: projectId,
      incident_id: payload.incident_id,
      bundle_key: "bundle",
      bundle_version: 1,
      occurred_at: payload.occurred_at
    });
    await queue.ackClaimedJobs();
    await redis.enqueue("build-bundle", payload);
    expect(await queue.dequeue("build-bundle")).toEqual(payload);
    await queue.enqueue("build-reproduction", {
      project_id: projectId,
      incident_id: payload.incident_id,
      bundle_key: "bundle",
      bundle_version: 1,
      occurred_at: payload.occurred_at
    });
    await queue.ackClaimedJobs();
    expect(
      (
        await pool.query(
          "SELECT id FROM worker_jobs WHERE project_id = $1 AND job_name = 'build-reproduction'",
          [projectId]
        )
      ).rows
    ).toHaveLength(2);
  });

  it("processes a durable transaction with one database connection", async () => {
    await ingest();
    const singlePool = new Pool({
      ...pool.options,
      password: pool.options.password,
      max: 1,
      connectionTimeoutMillis: 200
    });
    const single = worker(createQueryable(singlePool));
    try {
      await expect(single.processing.normalize()).resolves.toMatchObject({ processed: true });
    } finally {
      single.queue.dropClaimedJobs();
      await singlePool.end();
    }
  });
  it("serializes concurrent occurrences of one fingerprint and preserves chronological incident bounds", async () => {
    const times = Array.from({ length: 16 }, (_, index) =>
      new Date(Date.now() - index * 1000).toISOString()
    );
    for (const time of times) await ingest(time);
    const replicas = Array.from({ length: 4 }, () => worker());
    try {
      await Promise.all(
        replicas.map(async (replica) => {
          while ((await replica.processing.normalize()).processed) {
            /* drain */
          }
        })
      );
      await Promise.all(
        replicas.map(async (replica) => {
          while ((await replica.processing.group()).processed) {
            /* drain */
          }
        })
      );
      const incidents = (
        await pool.query<{
          id: string;
          occurrence_count: number;
          first_seen_at: Date;
          last_seen_at: Date;
        }>(
          "SELECT id, occurrence_count, first_seen_at, last_seen_at FROM incidents WHERE project_id = $1",
          [projectId]
        )
      ).rows;
      expect(incidents).toHaveLength(1);
      expect(incidents[0]!.occurrence_count).toBe(16);
      expect(incidents[0]!.first_seen_at.toISOString()).toBe(times[15]);
      expect(incidents[0]!.last_seen_at.toISOString()).toBe(times[0]);
      expect(
        (
          await pool.query("SELECT event_id FROM incident_events WHERE incident_id = $1", [
            incidents[0]!.id
          ])
        ).rows
      ).toHaveLength(16);
      expect(
        (
          await pool.query(
            "SELECT id FROM worker_jobs WHERE project_id = $1 AND job_name = 'build-bundle'",
            [projectId]
          )
        ).rows
      ).toHaveLength(3);
    } finally {
      replicas.forEach((replica) => replica.queue.dropClaimedJobs());
    }
  });

  it("keeps optional improvement failure separate from committed incident evidence", async () => {
    await ingest();
    const main = worker();
    await main.processing.normalize();
    await main.processing.group();
    const broken = worker({
      ...db,
      transaction: (callback) =>
        db.transaction!((tx) =>
          callback({
            ...tx,
            query: async (sql, params) => {
              if (sql.includes("automated_improvement_bundles_enabled"))
                throw new Error("simulated_improvement_storage_failure");
              return tx.query(sql, params);
            }
          })
        )
    });
    await expect(broken.processing.evaluateIncidentImprovement()).rejects.toThrow(
      "simulated_improvement_storage_failure"
    );
    await broken.queue.failClaimedJobs();
    const incidents = (
      await pool.query("SELECT occurrence_count FROM incidents WHERE project_id = $1", [projectId])
    ).rows;
    expect(incidents).toEqual([{ occurrence_count: 1 }]);
    expect(
      (
        await pool.query(
          "SELECT status FROM worker_jobs WHERE project_id = $1 AND job_name = 'build-bundle'",
          [projectId]
        )
      ).rows
    ).toEqual([{ status: "pending" }]);
    expect(
      (
        await pool.query(
          "SELECT status, attempts FROM worker_jobs WHERE project_id = $1 AND job_name = 'evaluate-incident-improvement'",
          [projectId]
        )
      ).rows
    ).toEqual([{ status: "pending", attempts: 1 }]);
  });
  it("evaluates an optional improvement from its retained source without copying the raw event into Postgres", async () => {
    const event = await ingest(new Date().toISOString(), true);
    const current = worker();
    await current.processing.normalize();
    const row = (
      await pool.query<{ payload: Record<string, unknown> }>(
        "SELECT payload FROM worker_jobs WHERE project_id = $1 AND job_name = 'evaluate-event-improvement'",
        [projectId]
      )
    ).rows[0]!;
    expect(row.payload).toMatchObject({
      project_id: projectId,
      event_id: event.event_id,
      object_key: expect.stringContaining(`raw-events/${projectId}/`)
    });
    expect(row.payload).not.toHaveProperty("event");
    expect(JSON.stringify(row.payload)).not.toContain("Checkout slow");
    await expect(current.processing.evaluateEventImprovement()).resolves.toEqual({
      processed: true
    });
    expect(
      (
        await pool.query(
          "SELECT status, payload FROM worker_jobs WHERE project_id = $1 AND job_name = 'evaluate-event-improvement'",
          [projectId]
        )
      ).rows
    ).toEqual([{ status: "completed", payload: null }]);
  });
});
