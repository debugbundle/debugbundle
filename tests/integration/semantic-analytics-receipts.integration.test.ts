import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import {
  admitSemanticAnalyticsEvent,
  type SemanticAnalyticsAdmissionContext
} from "../../packages/event-normalizer/src/semantic-analytics-admission.js";
import type { SemanticAnalyticsEvent } from "../../packages/shared-types/src/index.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { persistProtectedSemanticAnalyticsEvent } from "../../packages/storage/src/semantic-analytics-persistence.js";
import {
  createPostgresRetentionStore,
  createRetentionCleanupService
} from "../../packages/storage/src/retention-store.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import { createSemanticAnalyticsReceiptStore } from "../../packages/storage/src/semantic-analytics-receipt-store.js";
import { createSemanticAnalyticsRawRetentionService } from "../../packages/storage/src/semantic-analytics-raw-retention.js";
import { loadVerifiedSemanticAnalyticsWorkerInput } from "../../packages/storage/src/semantic-analytics-worker-input.js";
import { createS3ObjectStoreClient } from "../../packages/storage/src/s3-client.js";
import { buildSemanticAnalyticsRawEventObjectKey } from "../../packages/storage/src/helpers.js";
import {
  createIntegrationPool,
  createS3AdminClient,
  createQueryable,
  runIntegration,
  seedOwnedProject,
  s3Bucket,
  s3Endpoint,
  s3Region
} from "../helpers/integration-setup.js";

runIntegration("semantic analytics durable receipts", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const receipts = createSemanticAnalyticsReceiptStore(db);
  const s3Admin = createS3AdminClient();
  let organizationId: string;
  let projectId: string;
  const receivedAt = "2026-09-28T10:01:00.000Z";

  beforeEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await s3Admin.send(new CreateBucketCommand({ Bucket: s3Bucket })).catch(() => undefined);
    organizationId = randomUUID();
    projectId = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Growth",
      organizationSlug: "growth",
      projectName: "App",
      projectSlug: "app",
      organizationPlan: "team"
    });
  });
  afterAll(async () => {
    await pool.end();
    s3Admin.destroy();
  });

  const event = (): SemanticAnalyticsEvent =>
    JSON.parse(
      readFileSync(new URL("../fixtures/analytics-semantic-event.json", import.meta.url), "utf8")
    ) as SemanticAnalyticsEvent;
  const admitted = (value = event()) => {
    const context: SemanticAnalyticsAdmissionContext = {
      projectId,
      scope: { kind: "project", project_id: projectId },
      scopeRevision: 1,
      catalogRevision: 1,
      principal: "server_writer",
      receivedAt,
      enabled: true,
      businessMeasurementAllowed: true,
      minimumPrivacy: "strict",
      maxProperties: 1,
      earliestOccurredAt: "2026-09-26T10:00:00.000Z",
      identity: null,
      supportedCurrencies: { USD: 2 },
      catalog: [
        {
          name: "account.created",
          revision: 1,
          description: "Committed account",
          producers: ["server"],
          purpose: "business_measurement",
          success_boundary: "committed",
          properties: {
            signup_method: { type: "enum", values: ["email", "oauth"], required: true }
          },
          measurements: {},
          expected_producers: []
        }
      ]
    };
    const result = admitSemanticAnalyticsEvent(value, context);
    if (!result.accepted) throw new Error(`fixture rejected: ${result.reason}`);
    return result;
  };
  const input = (value = event(), authorized = true) => ({
    admission: admitted(value),
    principal: "server_writer" as const,
    periodStartsAt: "2026-09-01T00:00:00.000Z",
    limits: {
      monthly_analytics_events: 1,
      monthly_analytics_sessions: 100,
      monthly_analytics_journey_samples: 100,
      monthly_analytics_bundle_generations: 100
    },
    recheck: async () => authorized
  });

  it("commits one receipt, quota claim, operation identity and durable job; lost ACK replay is identical", async () => {
    const prepared = input();
    expect(await receipts.checkBeforeWrite(prepared)).toMatchObject({ kind: "ready" });
    const first = await receipts.acceptPrepared(prepared);
    expect(first.kind).toBe("accepted");
    if (first.kind !== "accepted") throw new Error("receipt rejected");
    expect(first.duplicate).toBe(false);
    expect(first.receipt).toMatchObject({
      event_id: prepared.admission.event.event_id,
      content_hash: prepared.admission.content_hash,
      operation_id: prepared.admission.event.operation_id
    });
    expect(await receipts.acceptPrepared(prepared)).toEqual({
      kind: "accepted",
      duplicate: true,
      receipt: first.receipt
    });
    expect(await receipts.checkBeforeWrite(prepared)).toEqual({
      kind: "accepted",
      duplicate: true,
      receipt: first.receipt
    });
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_receipts")).rows[0]?.count
    ).toBe("1");
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_operations")).rows[0]?.count
    ).toBe("1");
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM worker_jobs WHERE job_name='process-semantic-analytics-event'"
        )
      ).rows[0]?.count
    ).toBe("1");
    expect(
      (await pool.query("SELECT analytics_events FROM analytics_usage_counters")).rows[0]
        ?.analytics_events
    ).toBe(1);
  });

  it("replays the original receipt after its accepted raw object is deleted", async () => {
    const prepared = input();
    expect((await receipts.checkBeforeWrite(prepared)).kind).toBe("ready");
    const first = await receipts.acceptPrepared(prepared);
    expect(first.kind).toBe("accepted");
    await pool.query(
      "UPDATE semantic_analytics_receipts SET occurred_at='2026-09-20T10:00:00.000Z' WHERE project_id=$1",
      [projectId]
    );
    await pool.query(
      "UPDATE worker_jobs SET status='completed',payload=NULL WHERE job_name='process-semantic-analytics-event' AND project_id=$1",
      [projectId]
    );
    await createSemanticAnalyticsRawRetentionService(db).cleanExpired({
      now: "2026-10-01T00:00:00.000Z",
      limit: 10,
      objectStore: { deleteObject: async () => undefined }
    });
    expect(await receipts.checkBeforeWrite(prepared)).toEqual({
      kind: "accepted",
      duplicate: true,
      receipt: first.kind === "accepted" ? first.receipt : undefined
    });
    expect((await pool.query("SELECT count(*) FROM analytics_usage_claims")).rows[0]?.count).toBe(
      "1"
    );
  });

  it("refuses financial receipts without an authenticated billing-source namespace", async () => {
    const payment = event();
    payment.payload.money = { amount_minor: "1000", currency: "USD", exponent: 2 };
    payment.payload.financial = {
      kind: "payment",
      payment_id: `sha256:${"b".repeat(64)}`,
      subscription_id: null
    };
    const prepared = input(payment);
    expect(await receipts.checkBeforeWrite(prepared)).toEqual({ kind: "authority_changed" });
    expect(await receipts.acceptPrepared(prepared)).toEqual({ kind: "authority_changed" });
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_pending_objects")).rows[0]?.count
    ).toBe("0");
    expect((await pool.query("SELECT count(*) FROM analytics_usage_claims")).rows[0]?.count).toBe(
      "0"
    );
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_receipts")).rows[0]?.count
    ).toBe("0");
  });

  it("rejects conflicting protected content and a second event for the same operation without charging", async () => {
    const first = input();
    expect((await receipts.checkBeforeWrite(first)).kind).toBe("ready");
    expect((await receipts.acceptPrepared(first)).kind).toBe("accepted");
    const changed = event();
    changed.payload.properties["signup_method"] = "oauth";
    expect(await receipts.checkBeforeWrite(input(changed))).toEqual({ kind: "event_id_conflict" });
    expect(await receipts.acceptPrepared(input(changed))).toEqual({ kind: "event_id_conflict" });
    const newTransport = event();
    newTransport.event_id = randomUUID();
    expect(await receipts.checkBeforeWrite(input(newTransport))).toEqual({
      kind: "operation_conflict"
    });
    expect(await receipts.acceptPrepared(input(newTransport))).toEqual({
      kind: "operation_conflict"
    });
    expect(
      (await pool.query("SELECT analytics_events FROM analytics_usage_counters")).rows[0]
        ?.analytics_events
    ).toBe(1);
  });

  it("rechecks current authority and rolls back quota when job enqueue fails", async () => {
    expect(await receipts.checkBeforeWrite(input(event(), false))).toEqual({
      kind: "authority_changed"
    });
    expect(await receipts.acceptPrepared(input(event(), false))).toEqual({
      kind: "authority_changed"
    });
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_receipts")).rows[0]?.count
    ).toBe("0");
    await pool.query(`CREATE FUNCTION reject_semantic_job() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.job_name='process-semantic-analytics-event' THEN RAISE EXCEPTION 'job refused'; END IF; RETURN NEW; END $$`);
    await pool.query(
      "CREATE TRIGGER reject_semantic_job BEFORE INSERT ON worker_jobs FOR EACH ROW EXECUTE FUNCTION reject_semantic_job()"
    );
    expect((await receipts.checkBeforeWrite(input())).kind).toBe("ready");
    await expect(receipts.acceptPrepared(input())).rejects.toThrow("job refused");
    expect((await pool.query("SELECT count(*) FROM analytics_usage_claims")).rows[0]?.count).toBe(
      "0"
    );
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_receipts")).rows[0]?.count
    ).toBe("0");
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_pending_objects")).rows[0]?.count
    ).toBe("1");
  });

  it("holds the owning organization before the project through receipt preflight", async () => {
    const prepared = {
      ...input(),
      recheck: async () => {
        const racer = await pool.connect();
        try {
          await racer.query("BEGIN");
          await racer.query("SET LOCAL lock_timeout='50ms'");
          await expect(
            racer.query("UPDATE organizations SET plan='solo' WHERE id=$1", [organizationId])
          ).rejects.toMatchObject({ code: "55P03" });
          await racer.query("ROLLBACK");
        } finally {
          racer.release();
        }
        return true;
      }
    };
    expect((await receipts.checkBeforeWrite(prepared)).kind).toBe("ready");
    await pool.query("UPDATE organizations SET suspended_at=now() WHERE id=$1", [organizationId]);
    expect(await receipts.checkBeforeWrite(input())).toEqual({ kind: "authority_changed" });
  });

  it("serializes concurrent same-ID accepts to one quota claim and one job", async () => {
    const prepared = input();
    expect((await receipts.checkBeforeWrite(prepared)).kind).toBe("ready");
    const outcomes = await Promise.all([
      receipts.acceptPrepared(prepared),
      receipts.acceptPrepared(prepared)
    ]);
    expect(outcomes.map((entry) => entry.kind)).toEqual(["accepted", "accepted"]);
    expect(outcomes.filter((entry) => entry.kind === "accepted" && !entry.duplicate)).toHaveLength(
      1
    );
    expect((await pool.query("SELECT count(*) FROM analytics_usage_claims")).rows[0]?.count).toBe(
      "1"
    );
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM worker_jobs WHERE job_name='process-semantic-analytics-event'"
        )
      ).rows[0]?.count
    ).toBe("1");
  });

  it("returns a quota rejection without reserving a second receipt or operation", async () => {
    expect((await receipts.checkBeforeWrite(input())).kind).toBe("ready");
    expect((await receipts.acceptPrepared(input())).kind).toBe("accepted");
    const second = event();
    second.event_id = randomUUID();
    second.operation_id = `sha256:${"b".repeat(64)}`;
    const prepared = input(second);
    expect((await receipts.checkBeforeWrite(prepared)).kind).toBe("ready");
    expect(await receipts.acceptPrepared(prepared)).toEqual({ kind: "quota_exceeded" });
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_receipts")).rows[0]?.count
    ).toBe("1");
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_operations")).rows[0]?.count
    ).toBe("1");
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM worker_jobs WHERE job_name='process-semantic-analytics-event'"
        )
      ).rows[0]?.count
    ).toBe("1");
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_pending_objects")).rows[0]?.count
    ).toBe("1");
  });

  it("requires a staged object before claiming quota and safely retires an old orphan", async () => {
    const prepared = input();
    expect(await receipts.acceptPrepared(prepared)).toEqual({ kind: "object_not_staged" });
    expect((await pool.query("SELECT count(*) FROM analytics_usage_claims")).rows[0]?.count).toBe(
      "0"
    );
    const preflight = await receipts.checkBeforeWrite(prepared);
    expect(preflight.kind).toBe("ready");
    if (preflight.kind !== "ready") throw new Error("fixture not staged");
    await pool.query(
      "UPDATE semantic_analytics_pending_objects SET updated_at=now()-interval '2 hours'"
    );
    const deleted: string[] = [];
    expect(
      await receipts.cleanOldOrphans({
        deleteObject: async ({ key }) => {
          deleted.push(key);
        }
      })
    ).toBe(1);
    expect(deleted).toEqual([preflight.object_key]);
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_pending_objects")).rows[0]?.count
    ).toBe("0");
    expect(await receipts.acceptPrepared(prepared)).toEqual({ kind: "object_not_staged" });
  });

  it("fences acceptance while orphan deletion is retried and never deletes an accepted object", async () => {
    const prepared = input();
    const preflight = await receipts.checkBeforeWrite(prepared);
    if (preflight.kind !== "ready") throw new Error("fixture not staged");
    await pool.query(
      "UPDATE semantic_analytics_pending_objects SET updated_at=now()-interval '2 hours'"
    );
    await expect(
      receipts.cleanOldOrphans({
        deleteObject: async () => {
          throw new Error("object store unavailable");
        }
      })
    ).rejects.toThrow("object store unavailable");
    expect(await receipts.acceptPrepared(prepared)).toEqual({ kind: "object_not_staged" });
    expect((await receipts.checkBeforeWrite(prepared)).kind).toBe("object_not_staged");
    await pool.query(
      "UPDATE semantic_analytics_pending_objects SET updated_at=now()-interval '6 minutes'"
    );
    const deleted: string[] = [];
    expect(
      await receipts.cleanOldOrphans({
        deleteObject: async ({ key }) => {
          deleted.push(key);
        }
      })
    ).toBe(1);
    expect(deleted).toEqual([preflight.object_key]);
    expect((await receipts.checkBeforeWrite(prepared)).kind).toBe("ready");
    expect((await receipts.acceptPrepared(prepared)).kind).toBe("accepted");
    expect(
      await receipts.cleanOldOrphans({
        deleteObject: async ({ key }) => {
          deleted.push(key);
        }
      })
    ).toBe(0);
    expect(deleted).toEqual([preflight.object_key]);
  });

  it("writes only protected canonical bytes before ACK and skips S3 on a lost-response replay", async () => {
    const prepared = input();
    const objects: Array<{ key: string; body: Buffer; encoding: string | undefined }> = [];
    const objectStore = {
      putObject: async (entry: { key: string; body: Buffer; contentEncoding?: string }) => {
        objects.push({ key: entry.key, body: entry.body, encoding: entry.contentEncoding });
      }
    };
    const first = await persistProtectedSemanticAnalyticsEvent(receipts, prepared, objectStore);
    expect(first.kind).toBe("accepted");
    expect(objects).toHaveLength(1);
    expect(objects[0]?.key).toMatch(/^semantic-events\//);
    expect(objects[0]?.encoding).toBe("gzip");
    expect(JSON.parse(gunzipSync(objects[0]!.body).toString("utf8"))).toEqual(
      prepared.admission.event
    );
    expect(
      await persistProtectedSemanticAnalyticsEvent(receipts, prepared, objectStore)
    ).toMatchObject({
      kind: "accepted",
      duplicate: true
    });
    expect(objects).toHaveLength(1);
  });

  it("does not acknowledge or charge quota when the protected object write fails", async () => {
    await expect(
      persistProtectedSemanticAnalyticsEvent(receipts, input(), {
        putObject: async () => {
          throw new Error("S3 unavailable");
        }
      })
    ).rejects.toThrow("S3 unavailable");
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_receipts")).rows[0]?.count
    ).toBe("0");
    expect((await pool.query("SELECT count(*) FROM analytics_usage_claims")).rows[0]?.count).toBe(
      "0"
    );
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_pending_objects")).rows[0]?.count
    ).toBe("1");
  });

  it("persists protected bytes in LocalStack before durable acceptance", async () => {
    const objectStore = createS3ObjectStoreClient({
      endpoint: s3Endpoint,
      region: s3Region,
      bucket: s3Bucket,
      accessKeyId: "test",
      secretAccessKey: "test"
    });
    const prepared = input();
    expect(
      (await persistProtectedSemanticAnalyticsEvent(receipts, prepared, objectStore)).kind
    ).toBe("accepted");
    const row = (
      await pool.query<{ raw_object_key: string }>(
        "SELECT raw_object_key FROM semantic_analytics_receipts WHERE project_id=$1",
        [projectId]
      )
    ).rows[0];
    expect(row).toBeDefined();
    const body = await objectStore.getObject({ key: row!.raw_object_key });
    expect(JSON.parse(gunzipSync(body).toString("utf8"))).toEqual(prepared.admission.event);
  });

  it("deletes a real S3 orphan on the scheduled retention path after quota rejection", async () => {
    const objectStore = createS3ObjectStoreClient({
      endpoint: s3Endpoint,
      region: s3Region,
      bucket: s3Bucket,
      accessKeyId: "test",
      secretAccessKey: "test"
    });
    const prepared = input();
    prepared.limits.monthly_analytics_events = 0;
    expect(await persistProtectedSemanticAnalyticsEvent(receipts, prepared, objectStore)).toEqual({
      kind: "quota_exceeded"
    });
    const row = (
      await pool.query<{ raw_object_key: string }>(
        "SELECT raw_object_key FROM semantic_analytics_pending_objects WHERE project_id=$1",
        [projectId]
      )
    ).rows[0];
    expect(row).toBeDefined();
    await expect(objectStore.getObject({ key: row!.raw_object_key })).resolves.toBeInstanceOf(
      Buffer
    );
    await pool.query(
      "UPDATE semantic_analytics_pending_objects SET updated_at=now()-interval '2 hours'"
    );
    await createRetentionCleanupService({
      retentionStore: createPostgresRetentionStore(db),
      objectStore,
      semanticOrphans: receipts,
      maxBatches: 1
    }).runCleanup({ scheduled_at: new Date().toISOString() });
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_pending_objects")).rows[0]?.count
    ).toBe("0");
    await expect(objectStore.getObject({ key: row!.raw_object_key })).rejects.toThrow();
  });

  it("sweeps a late unjournaled S3 object using durable listing progress", async () => {
    const sweepNow = new Date(Date.now() + 3 * 60 * 60 * 1_000).toISOString();
    const objectStore = createS3ObjectStoreClient({
      endpoint: s3Endpoint,
      region: s3Region,
      bucket: s3Bucket,
      accessKeyId: "test",
      secretAccessKey: "test"
    });
    await objectStore.deleteObjectsByPrefix("semantic-events/");
    const key = buildSemanticAnalyticsRawEventObjectKey({
      projectId,
      eventId: randomUUID(),
      occurredAt: new Date("2026-09-28T10:00:00.000Z"),
      contentHash: `sha256:${"a".repeat(64)}`
    });
    await objectStore.putObject({
      key,
      body: Buffer.from("late protected write"),
      contentType: "application/json",
      contentEncoding: "gzip"
    });
    expect(
      await receipts.sweepOldUnownedObjects({
        objectStore,
        now: sweepNow
      })
    ).toMatchObject({ scanned: 1, deleted: 1, hasMore: false });
    await expect(objectStore.getObject({ key })).rejects.toThrow("s3_object_not_found");
    expect(
      (await pool.query("SELECT last_key FROM semantic_analytics_orphan_sweep_state WHERE id=1"))
        .rows
    ).toEqual([{ last_key: null }]);
    const scheduledKey = buildSemanticAnalyticsRawEventObjectKey({
      projectId,
      eventId: randomUUID(),
      occurredAt: new Date("2026-09-28T10:00:00.000Z"),
      contentHash: `sha256:${"b".repeat(64)}`
    });
    await objectStore.putObject({
      key: scheduledKey,
      body: Buffer.from("late scheduled write"),
      contentType: "application/json",
      contentEncoding: "gzip"
    });
    await createRetentionCleanupService({
      retentionStore: createPostgresRetentionStore(db),
      objectStore,
      semanticOrphans: receipts,
      maxBatches: 1
    }).runCleanup({ scheduled_at: sweepNow });
    await expect(objectStore.getObject({ key: scheduledKey })).rejects.toThrow(
      "s3_object_not_found"
    );
  });

  it("never sweeps an accepted or actively staged protected object", async () => {
    const sweepNow = new Date(Date.now() + 3 * 60 * 60 * 1_000).toISOString();
    const objectStore = createS3ObjectStoreClient({
      endpoint: s3Endpoint,
      region: s3Region,
      bucket: s3Bucket,
      accessKeyId: "test",
      secretAccessKey: "test"
    });
    await objectStore.deleteObjectsByPrefix("semantic-events/");
    const accepted = input();
    expect(
      (await persistProtectedSemanticAnalyticsEvent(receipts, accepted, objectStore)).kind
    ).toBe("accepted");
    const acceptedKey = (
      await pool.query<{ raw_object_key: string }>(
        "SELECT raw_object_key FROM semantic_analytics_receipts WHERE project_id=$1",
        [projectId]
      )
    ).rows[0]!.raw_object_key;
    const staged = input({
      ...event(),
      event_id: randomUUID(),
      operation_id: `sha256:${"c".repeat(64)}`
    });
    const ready = await receipts.checkBeforeWrite(staged);
    expect(ready.kind).toBe("ready");
    if (ready.kind !== "ready") throw new Error("not staged");
    await objectStore.putObject({
      key: ready.object_key,
      body: Buffer.from("in-flight protected write"),
      contentType: "application/json",
      contentEncoding: "gzip"
    });
    expect(
      await receipts.sweepOldUnownedObjects({
        objectStore,
        now: sweepNow
      })
    ).toMatchObject({ scanned: 2, deleted: 0, hasMore: false });
    await expect(objectStore.getObject({ key: acceptedKey })).resolves.toBeInstanceOf(Buffer);
    await expect(objectStore.getObject({ key: ready.object_key })).resolves.toBeInstanceOf(Buffer);
  });

  it("resumes a bounded sweep page and leaves recent objects untouched", async () => {
    const keys = Array.from({ length: 101 }, () =>
      buildSemanticAnalyticsRawEventObjectKey({
        projectId,
        eventId: randomUUID(),
        occurredAt: new Date("2026-09-28T10:00:00.000Z"),
        contentHash: `sha256:${"d".repeat(64)}`
      })
    ).sort();
    const deleteObject = vi.fn(async () => undefined);
    const objectStore = {
      deleteObject,
      async listObjects(request: { startAfter?: string; maxKeys: number }) {
        const remaining = keys.filter((key) => key > (request.startAfter ?? ""));
        return {
          objects: remaining.slice(0, request.maxKeys).map((key) => ({
            key,
            lastModifiedAt: new Date(
              key === keys.at(-1) ? "2026-09-29T01:30:00.000Z" : "2026-09-28T10:00:00.000Z"
            )
          })),
          hasMore: remaining.length > request.maxKeys
        };
      }
    };
    expect(
      await receipts.sweepOldUnownedObjects({
        objectStore,
        now: "2026-09-29T02:00:00.000Z"
      })
    ).toEqual({ scanned: 100, deleted: 100, hasMore: true });
    expect(
      (await pool.query("SELECT last_key FROM semantic_analytics_orphan_sweep_state WHERE id=1"))
        .rows[0]?.last_key
    ).toBe(keys[99]);
    expect(
      await receipts.sweepOldUnownedObjects({
        objectStore,
        now: "2026-09-29T02:00:00.000Z"
      })
    ).toEqual({ scanned: 1, deleted: 0, hasMore: false });
    expect(deleteObject).toHaveBeenCalledTimes(100);
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_pending_objects")).rows[0]?.count
    ).toBe("0");
  });

  it("verifies accepted worker ownership, protected bytes and receipt provenance", async () => {
    const objectStore = createS3ObjectStoreClient({
      endpoint: s3Endpoint,
      region: s3Region,
      bucket: s3Bucket,
      accessKeyId: "test",
      secretAccessKey: "test"
    });
    const prepared = input();
    expect(
      (await persistProtectedSemanticAnalyticsEvent(receipts, prepared, objectStore)).kind
    ).toBe("accepted");
    const job = (
      await pool.query<{ id: string; payload: Record<string, unknown> }>(
        "SELECT id,payload FROM worker_jobs WHERE job_name='process-semantic-analytics-event'"
      )
    ).rows[0]!;
    const verified = await db.transaction!(async (tx) =>
      loadVerifiedSemanticAnalyticsWorkerInput(tx, objectStore, job)
    );
    expect(verified).toMatchObject({
      event: prepared.admission.event,
      provenance: {
        principal: "server_writer",
        authority: "server_authoritative",
        catalog_revision: 1,
        scope_revision: 1
      }
    });
  });

  it("rejects mismatched jobs and modified S3 bytes without returning an event", async () => {
    const objectStore = createS3ObjectStoreClient({
      endpoint: s3Endpoint,
      region: s3Region,
      bucket: s3Bucket,
      accessKeyId: "test",
      secretAccessKey: "test"
    });
    const prepared = input();
    await persistProtectedSemanticAnalyticsEvent(receipts, prepared, objectStore);
    const job = (
      await pool.query<{ id: string; payload: Record<string, unknown> }>(
        "SELECT id,payload FROM worker_jobs WHERE job_name='process-semantic-analytics-event'"
      )
    ).rows[0]!;
    await expect(
      db.transaction!((tx) =>
        loadVerifiedSemanticAnalyticsWorkerInput(tx, objectStore, {
          ...job,
          payload: { ...job.payload, content_hash: `sha256:${"0".repeat(64)}` }
        })
      )
    ).rejects.toThrow("semantic_worker_job_receipt_mismatch");
    await objectStore.putObject({
      key: job.payload["object_key"] as string,
      body: Buffer.from("changed"),
      contentType: "application/json",
      contentEncoding: "gzip"
    });
    await expect(
      db.transaction!((tx) => loadVerifiedSemanticAnalyticsWorkerInput(tx, objectStore, job))
    ).rejects.toThrow("semantic_worker_object_invalid");
  });

  it("does not load an event after its durable receipt is removed", async () => {
    const objectStore = createS3ObjectStoreClient({
      endpoint: s3Endpoint,
      region: s3Region,
      bucket: s3Bucket,
      accessKeyId: "test",
      secretAccessKey: "test"
    });
    await persistProtectedSemanticAnalyticsEvent(receipts, input(), objectStore);
    const job = (
      await pool.query<{ id: string; payload: Record<string, unknown> }>(
        "SELECT id,payload FROM worker_jobs WHERE job_name='process-semantic-analytics-event'"
      )
    ).rows[0]!;
    await pool.query("DELETE FROM semantic_analytics_receipts WHERE project_id=$1", [projectId]);
    expect(
      await db.transaction!((tx) => loadVerifiedSemanticAnalyticsWorkerInput(tx, objectStore, job))
    ).toBeNull();
  });

  it("fails readiness without the receipt migration and upgrades a populated predecessor", async () => {
    await migrateStorageSchema(db);
    await pool.query("DROP TABLE semantic_analytics_pending_objects");
    await pool.query("DROP TABLE semantic_analytics_operations");
    await pool.query("DROP TABLE semantic_analytics_receipt_subjects");
    await pool.query("DROP TABLE analytics_project_identity_associations");
    await pool.query("DROP TABLE analytics_project_subject_erasures");
    await pool.query("DROP TABLE semantic_analytics_receipts");
    await pool.query("DROP TABLE analytics_project_identity_epoch_revocations");
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202609280010_add_semantic_raw_retention_state'"
    );
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202609280006_add_semantic_analytics_receipts'"
    );
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202609280017_add_semantic_identity_receipt_provenance'"
    );
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202609280018_fence_analytics_identity_producer_epochs'"
    );
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202609280019_index_semantic_receipt_subjects'"
    );
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202609280020_retain_analytics_identity_associations'"
    );
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202609280021_add_analytics_subject_erasure_tasks'"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
    const result = await migrateStorageSchema(db);
    expect(result.applied).toContain("202609280006_add_semantic_analytics_receipts");
    expect(result.applied).toContain("202609280010_add_semantic_raw_retention_state");
    expect(result.applied).toContain("202609280017_add_semantic_identity_receipt_provenance");
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect(
      (await pool.query("SELECT id FROM projects WHERE id=$1", [projectId])).rows
    ).toHaveLength(1);
    const prepared = input();
    expect((await receipts.checkBeforeWrite(prepared)).kind).toBe("ready");
    expect((await receipts.acceptPrepared(prepared)).kind).toBe("accepted");
  });

  it("fails readiness without sweep progress and upgrades a populated predecessor", async () => {
    await migrateStorageSchema(db);
    await pool.query("DROP TABLE semantic_analytics_orphan_sweep_state");
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202609280008_add_semantic_orphan_sweep_state'"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
    const result = await migrateStorageSchema(db);
    expect(result.applied).toContain("202609280008_add_semantic_orphan_sweep_state");
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect(
      (await pool.query("SELECT id FROM projects WHERE id=$1", [projectId])).rows
    ).toHaveLength(1);
  });
});
