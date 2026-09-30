import { randomUUID } from "node:crypto";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { createSemanticAnalyticsRawRetentionService } from "../../packages/storage/src/semantic-analytics-raw-retention.js";
import { buildSemanticAnalyticsRawEventObjectKey } from "../../packages/storage/src/helpers.js";
import { createS3ObjectStoreClient } from "../../packages/storage/src/s3-client.js";
import { createSemanticAnalyticsReceiptStore } from "../../packages/storage/src/semantic-analytics-receipt-store.js";
import { createPostgresRetentionStore } from "../../packages/storage/src/retention-store.js";
import { loadVerifiedSemanticAnalyticsWorkerInput } from "../../packages/storage/src/semantic-analytics-worker-input.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
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

runIntegration("semantic analytics accepted raw retention", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const retention = createSemanticAnalyticsRawRetentionService(db);
  const s3Admin = createS3AdminClient();
  const objectStore = createS3ObjectStoreClient({
    endpoint: s3Endpoint,
    region: s3Region,
    bucket: s3Bucket,
    accessKeyId: "test",
    secretAccessKey: "test"
  });
  const now = "2026-09-28T12:00:00.000Z";
  let projectId: string;

  beforeEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await s3Admin.send(new CreateBucketCommand({ Bucket: s3Bucket })).catch(() => undefined);
    projectId = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId: randomUUID(),
      projectId,
      organizationName: "Retention",
      organizationSlug: "retention",
      projectName: "App",
      projectSlug: "app",
      organizationPlan: "team"
    });
  });

  afterAll(async () => {
    await pool.end();
    s3Admin.destroy();
  });

  async function seedReceipt(
    status: "pending" | "running" | "completed" | "failed",
    acceptedAt = "2026-09-25T12:00:00.000Z",
    eventId = randomUUID()
  ) {
    const jobId = randomUUID().replaceAll("-", "").repeat(2);
    const contentHash = `sha256:${"a".repeat(64)}`;
    const occurredAt = "2026-09-20T11:00:00.000Z";
    const key = buildSemanticAnalyticsRawEventObjectKey({
      projectId,
      eventId,
      occurredAt: new Date(occurredAt),
      contentHash
    });
    await pool.query(
      `INSERT INTO worker_jobs(id,job_name,project_id,payload,status,lease_token,lease_expires_at)
       VALUES($1,'process-semantic-analytics-event',$2::uuid,$3::jsonb,$4,
         CASE WHEN $4='running' THEN $5::uuid ELSE NULL END,
         CASE WHEN $4='running' THEN now()+interval '1 hour' ELSE NULL END)`,
      [
        jobId,
        projectId,
        JSON.stringify({ project_id: projectId, event_id: eventId }),
        status,
        randomUUID()
      ]
    );
    await pool.query(
      `INSERT INTO semantic_analytics_receipts(
         project_id,event_id,content_hash,raw_object_key,worker_job_id,principal,authority,
         scope,scope_revision,catalog_revision,accepted_at,expires_at,occurred_at)
       VALUES($1::uuid,$2::uuid,$3,$4,$5,'project_token','client_observed',
         $6::jsonb,1,1,$7::timestamptz,$7::timestamptz+interval '90 days',$8::timestamptz)`,
      [
        projectId,
        eventId,
        contentHash,
        key,
        jobId,
        JSON.stringify({ kind: "project", project_id: projectId }),
        acceptedAt,
        occurredAt
      ]
    );
    return { eventId, jobId, key, contentHash };
  }

  async function expireDeleteLease(eventId: string) {
    await pool.query(
      `UPDATE semantic_analytics_receipts
       SET raw_delete_retry_at=clock_timestamp()-interval '1 second'
       WHERE project_id=$1::uuid AND event_id=$2::uuid AND raw_status='deleting'`,
      [projectId, eventId]
    );
  }

  it("deletes expired raw bytes after a completed job while retaining the receipt", async () => {
    const { eventId, key } = await seedReceipt("completed");
    await objectStore.putObject({
      key,
      body: Buffer.from("protected"),
      contentType: "application/json",
      contentEncoding: "gzip"
    });
    await expect(objectStore.getObject({ key })).resolves.toEqual(Buffer.from("protected"));
    expect(await retention.cleanExpired({ now, limit: 10, objectStore })).toEqual({
      deleted: 1,
      hasMore: false
    });
    await expect(objectStore.getObject({ key })).rejects.toThrow("s3_object_not_found");
    expect(
      (
        await pool.query(
          "SELECT raw_status,raw_retention_outcome,raw_deleted_at IS NOT NULL AS deleted FROM semantic_analytics_receipts WHERE project_id=$1 AND event_id=$2",
          [projectId, eventId]
        )
      ).rows[0]
    ).toMatchObject({
      raw_status: "deleted",
      raw_retention_outcome: "job_completed",
      deleted: true
    });
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_loss_days")).rows[0]?.count
    ).toBe("0");
  });

  it("keeps a newly accepted offline event for its configured raw-retention period", async () => {
    const { eventId } = await seedReceipt("completed", now);
    const deleteObject = vi.fn(async () => undefined);
    expect(await retention.cleanExpired({ now, limit: 10, objectStore: { deleteObject } })).toEqual(
      {
        deleted: 0,
        hasMore: false
      }
    );
    expect(deleteObject).not.toHaveBeenCalled();
    expect(
      (
        await pool.query(
          "SELECT raw_status FROM semantic_analytics_receipts WHERE project_id=$1 AND event_id=$2",
          [projectId, eventId]
        )
      ).rows[0]
    ).toMatchObject({ raw_status: "active" });
  });

  it("stops a catch-up batch at its deadline without deleting the remaining object", async () => {
    const { eventId } = await seedReceipt("completed");
    const deleteObject = vi.fn(async () => undefined);
    expect(
      await retention.cleanExpired({
        now,
        limit: 1,
        objectStore: { deleteObject },
        deadlineMs: Date.now() - 1
      })
    ).toEqual({ deleted: 0, hasMore: true });
    expect(deleteObject).not.toHaveBeenCalled();
    expect(
      (
        await pool.query(
          "SELECT raw_status FROM semantic_analytics_receipts WHERE project_id=$1 AND event_id=$2",
          [projectId, eventId]
        )
      ).rows[0]
    ).toMatchObject({ raw_status: "active" });
  });

  it.each(["pending", "running", "failed"] as const)(
    "terminally marks an unprocessed %s job before raw deletion",
    async (status) => {
      const { jobId } = await seedReceipt(status);
      const deleteObject = vi.fn(async () => undefined);
      await retention.cleanExpired({ now, limit: 10, objectStore: { deleteObject } });
      expect(
        (
          await pool.query(
            "SELECT status,payload,lease_token,last_error_code FROM worker_jobs WHERE id=$1",
            [jobId]
          )
        ).rows[0]
      ).toMatchObject({
        status: "failed",
        payload: null,
        lease_token: null,
        last_error_code: "semantic_raw_retention_expired"
      });
      expect(
        (
          await pool.query(
            "SELECT raw_retention_outcome FROM semantic_analytics_receipts WHERE worker_job_id=$1",
            [jobId]
          )
        ).rows[0]
      ).toMatchObject({ raw_retention_outcome: "lost" });
      expect(
        (
          await pool.query(
            "SELECT occurred_on::text,lost_count::text FROM semantic_analytics_loss_days WHERE project_id=$1::uuid",
            [projectId]
          )
        ).rows
      ).toEqual([{ occurred_on: "2026-09-20", lost_count: "1" }]);
      expect(deleteObject).toHaveBeenCalledOnce();
    }
  );

  it("keeps a durable deletion intent and retries an S3 failure", async () => {
    const { eventId, key } = await seedReceipt("pending");
    const deleteObject = vi
      .fn()
      .mockRejectedValueOnce(new Error("S3 unavailable"))
      .mockResolvedValue(undefined);
    expect(await retention.cleanExpired({ now, limit: 10, objectStore: { deleteObject } })).toEqual(
      {
        deleted: 0,
        hasMore: false
      }
    );
    expect(
      (
        await pool.query(
          "SELECT raw_status FROM semantic_analytics_receipts WHERE project_id=$1 AND event_id=$2",
          [projectId, eventId]
        )
      ).rows[0]
    ).toMatchObject({ raw_status: "deleting" });
    expect(await retention.cleanExpired({ now, limit: 10, objectStore: { deleteObject } })).toEqual(
      { deleted: 0, hasMore: false }
    );
    await expireDeleteLease(eventId);
    expect(
      await retention.cleanExpired({
        now: "2026-09-28T12:05:00.000Z",
        limit: 10,
        objectStore: { deleteObject }
      })
    ).toEqual({ deleted: 1, hasMore: false });
    expect(deleteObject).toHaveBeenNthCalledWith(2, { key, signal: expect.any(AbortSignal) });
    expect(
      (
        await pool.query(
          "SELECT lost_count FROM semantic_analytics_loss_days WHERE project_id=$1::uuid",
          [projectId]
        )
      ).rows
    ).toEqual([{ lost_count: "1" }]);
    await createPostgresRetentionStore(db).pruneExpiredAnalyticsRollups({
      now: "2028-01-01T00:00:00.000Z",
      limit: 100
    });
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_loss_days")).rows[0]?.count
    ).toBe("0");
  });

  it("backfills lost receipts when the durable quality migration upgrades a populated predecessor", async () => {
    const { eventId } = await seedReceipt("failed");
    await pool.query(
      `UPDATE semantic_analytics_receipts
       SET raw_status='deleted',raw_retention_outcome='lost',raw_deleted_at=clock_timestamp()
       WHERE project_id=$1::uuid AND event_id=$2::uuid`,
      [projectId, eventId]
    );
    await migrateStorageSchema(db);
    await pool.query("DROP TABLE semantic_analytics_loss_days");
    const migrationId = "202609280012_add_semantic_analytics_loss_days";
    await pool.query("DELETE FROM storage_migration_ledger WHERE id=$1", [migrationId]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      `storage_schema_missing_migrations: ${migrationId}`
    );
    expect((await migrateStorageSchema(db)).applied).toEqual([migrationId]);
    expect(
      (
        await pool.query(
          "SELECT occurred_on::text,lost_count::text FROM semantic_analytics_loss_days WHERE project_id=$1::uuid",
          [projectId]
        )
      ).rows
    ).toEqual([{ occurred_on: "2026-09-20", lost_count: "1" }]);
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
  });

  it("retains a loss-quality marker after its transport receipt is pruned", async () => {
    await seedReceipt("pending");
    await retention.cleanExpired({
      now,
      limit: 10,
      objectStore: { deleteObject: async () => undefined }
    });
    expect(await retention.pruneExpired({ now: "2027-01-01T00:00:00.000Z", limit: 10 })).toEqual({
      pruned: 1,
      hasMore: false
    });
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_receipts")).rows[0]?.count
    ).toBe("0");
    expect(
      (
        await pool.query(
          "SELECT lost_count FROM semantic_analytics_loss_days WHERE project_id=$1::uuid",
          [projectId]
        )
      ).rows
    ).toEqual([{ lost_count: "1" }]);
  });

  it("counts separate lost jobs once per project day and rolls back when the marker cannot commit", async () => {
    const first = await seedReceipt("pending");
    await seedReceipt("failed");
    await pool.query(`CREATE FUNCTION reject_semantic_loss_day() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'loss marker unavailable'; END $$`);
    await pool.query(`CREATE TRIGGER reject_semantic_loss_day
      BEFORE INSERT ON semantic_analytics_loss_days
      FOR EACH ROW EXECUTE FUNCTION reject_semantic_loss_day()`);
    const deleteObject = vi.fn(async () => undefined);
    await expect(
      retention.cleanExpired({ now, limit: 10, objectStore: { deleteObject } })
    ).rejects.toThrow("loss marker unavailable");
    expect(deleteObject).not.toHaveBeenCalled();
    expect(
      (await pool.query("SELECT status FROM worker_jobs WHERE id=$1", [first.jobId])).rows
    ).toEqual([{ status: "pending" }]);
    expect(
      (
        await pool.query(
          "SELECT raw_status FROM semantic_analytics_receipts WHERE event_id=$1::uuid",
          [first.eventId]
        )
      ).rows
    ).toEqual([{ raw_status: "active" }]);
    await pool.query("DROP TRIGGER reject_semantic_loss_day ON semantic_analytics_loss_days");
    await pool.query("DROP FUNCTION reject_semantic_loss_day()");
    expect(await retention.cleanExpired({ now, limit: 10, objectStore: { deleteObject } })).toEqual(
      {
        deleted: 2,
        hasMore: false
      }
    );
    expect(
      (
        await pool.query(
          "SELECT lost_count FROM semantic_analytics_loss_days WHERE project_id=$1::uuid",
          [projectId]
        )
      ).rows
    ).toEqual([{ lost_count: "2" }]);
  });

  it("does not issue a second S3 delete while another cleanup owns the same object", async () => {
    const { eventId, key } = await seedReceipt("completed");
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const firstStartedPromise = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const firstDelete = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const deleteObject = vi
      .fn()
      .mockImplementationOnce(async () => {
        firstStarted();
        await firstDelete;
      })
      .mockResolvedValue(undefined);

    const first = retention.cleanExpired({ now, limit: 1, objectStore: { deleteObject } });
    await firstStartedPromise;
    expect(
      (
        await pool.query(
          "SELECT raw_status FROM semantic_analytics_receipts WHERE project_id=$1 AND event_id=$2",
          [projectId, eventId]
        )
      ).rows[0]
    ).toMatchObject({ raw_status: "deleting" });
    try {
      expect(
        await retention.cleanExpired({
          now: "2026-09-29T12:00:00.000Z",
          limit: 1,
          objectStore: { deleteObject }
        })
      ).toEqual({
        deleted: 0,
        hasMore: false
      });
      expect(deleteObject).toHaveBeenCalledOnce();
    } finally {
      releaseFirst();
    }
    expect(await first).toEqual({ deleted: 1, hasMore: true });
    expect(deleteObject).toHaveBeenCalledWith({ key, signal: expect.any(AbortSignal) });
  });

  it("does not let a failed oldest S3 deletion starve later expired raw objects", async () => {
    const oldest = await seedReceipt("completed", "2026-09-24T12:00:00.000Z");
    const later = await seedReceipt("completed", "2026-09-25T12:00:00.000Z");
    const deleteObject = vi.fn(async ({ key }: { key: string }) => {
      if (key === oldest.key) throw new Error("one object remains unavailable");
    });
    const firstProgress = vi.fn();

    expect(
      await retention.cleanExpired({
        now,
        limit: 1,
        objectStore: { deleteObject },
        onProgress: firstProgress
      })
    ).toEqual({ deleted: 0, hasMore: true });
    expect(firstProgress).toHaveBeenCalledWith({
      failed_deletes: 1,
      oldest_selected_due_at: "2026-09-25T12:00:00.000Z"
    });
    expect(await retention.cleanExpired({ now, limit: 1, objectStore: { deleteObject } })).toEqual({
      deleted: 1,
      hasMore: true
    });
    expect(deleteObject).toHaveBeenNthCalledWith(2, {
      key: later.key,
      signal: expect.any(AbortSignal)
    });
    expect(
      (
        await pool.query(
          "SELECT raw_status FROM semantic_analytics_receipts WHERE project_id=$1 AND event_id=$2",
          [projectId, later.eventId]
        )
      ).rows[0]
    ).toMatchObject({ raw_status: "deleted" });
  });

  it("commits only successful bulk deletions and retries a failed key after its lease", async () => {
    const first = await seedReceipt("completed", "2026-09-24T12:00:00.000Z");
    const second = await seedReceipt("completed", "2026-09-25T12:00:00.000Z");
    for (const key of [first.key, second.key])
      await objectStore.putObject({
        key,
        body: Buffer.from("protected"),
        contentType: "application/json",
        contentEncoding: "gzip"
      });
    const deleteObjects = vi.fn(async () => {
      await objectStore.deleteObject({ key: first.key });
      return { deleted: [first.key], failed: [second.key] };
    });
    const deleteObject = vi.fn(async () => undefined);
    const progress = vi.fn();
    expect(
      await retention.cleanExpired({
        now,
        limit: 10,
        objectStore: { deleteObject, deleteObjects },
        onProgress: progress
      })
    ).toEqual({ deleted: 1, hasMore: false });
    expect(deleteObjects).toHaveBeenCalledWith({
      keys: [first.key, second.key],
      signal: expect.any(AbortSignal)
    });
    expect(deleteObject).not.toHaveBeenCalled();
    expect(progress).toHaveBeenCalledWith({
      failed_deletes: 1,
      oldest_selected_due_at: "2026-09-25T12:00:00.000Z"
    });
    expect(
      (
        await pool.query(
          `SELECT event_id::text,raw_status FROM semantic_analytics_receipts
           WHERE project_id=$1::uuid ORDER BY accepted_at,event_id`,
          [projectId]
        )
      ).rows
    ).toEqual([
      { event_id: first.eventId, raw_status: "deleted" },
      { event_id: second.eventId, raw_status: "deleting" }
    ]);
    await expect(objectStore.getObject({ key: first.key })).rejects.toThrow("s3_object_not_found");
    await expect(objectStore.getObject({ key: second.key })).resolves.toEqual(
      Buffer.from("protected")
    );
    await expireDeleteLease(second.eventId);
    expect(await retention.cleanExpired({ now, limit: 10, objectStore })).toEqual({
      deleted: 1,
      hasMore: false
    });
    await expect(objectStore.getObject({ key: second.key })).rejects.toThrow("s3_object_not_found");
  });

  it("advances the semantic cursor across equal acceptance times without skipping a receipt", async () => {
    const receipts = [await seedReceipt("completed"), await seedReceipt("completed")];
    for (const { key } of receipts)
      await objectStore.putObject({
        key,
        body: Buffer.from("protected"),
        contentType: "application/json",
        contentEncoding: "gzip"
      });
    let cursor: { accepted_at: string; project_id: string; event_id: string } | undefined;
    for (let index = 0; index < receipts.length; index += 1) {
      const result = await retention.cleanExpired({
        now,
        limit: 1,
        objectStore,
        ...(cursor === undefined ? {} : { startAfter: cursor }),
        onCursor: (next) => {
          cursor = next ?? undefined;
        }
      });
      expect(result.deleted).toBe(1);
      expect(cursor).toBeDefined();
    }
    const rows = await pool.query<{ raw_status: string }>(
      `SELECT raw_status FROM semantic_analytics_receipts WHERE project_id=$1::uuid`,
      [projectId]
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.every((row) => row.raw_status === "deleted")).toBe(true);
  });

  it("does not let a stale worker read a raw-deleted receipt", async () => {
    const { eventId, jobId, key, contentHash } = await seedReceipt("completed");
    await retention.cleanExpired({
      now,
      limit: 10,
      objectStore: { deleteObject: vi.fn(async () => undefined) }
    });
    const getObject = vi.fn(async () => Buffer.from("unreachable"));
    expect(
      await db.transaction!((tx) =>
        loadVerifiedSemanticAnalyticsWorkerInput(
          tx,
          { getObject },
          {
            id: jobId,
            payload: {
              project_id: projectId,
              event_id: eventId,
              content_hash: contentHash,
              object_key: key
            }
          }
        )
      )
    ).toBeNull();
    expect(getObject).not.toHaveBeenCalled();
  });

  it("sweeps a late write even while its small receipt remains", async () => {
    const { key } = await seedReceipt("completed");
    await retention.cleanExpired({
      now,
      limit: 10,
      objectStore: { deleteObject: vi.fn(async () => undefined) }
    });
    await objectStore.putObject({
      key,
      body: Buffer.from("late protected write"),
      contentType: "application/json",
      contentEncoding: "gzip"
    });
    const sweep = await createSemanticAnalyticsReceiptStore(db).sweepOldUnownedObjects({
      objectStore,
      now: "2030-01-01T00:00:00.000Z"
    });
    expect(sweep.deleted).toBeGreaterThanOrEqual(1);
    await expect(objectStore.getObject({ key })).rejects.toThrow("s3_object_not_found");
  });

  it("prunes an expired transport receipt only after raw deletion and keeps business dedupe", async () => {
    const { eventId } = await seedReceipt("completed");
    await pool.query(
      `INSERT INTO semantic_analytics_operations(
         project_id,namespace_scope_kind,namespace_scope_id,namespace_revision,
         operation_kind,operation_id,first_event_id,first_content_hash,accepted_at)
       VALUES($1::uuid,'project',$1::uuid,0,'signup',$2,$3::uuid,$4,now())`,
      [projectId, `sha256:${"b".repeat(64)}`, eventId, `sha256:${"a".repeat(64)}`]
    );
    const expiresAt = (
      await pool.query<{ expires_at: Date }>(
        "SELECT expires_at FROM semantic_analytics_receipts WHERE project_id=$1 AND event_id=$2",
        [projectId, eventId]
      )
    ).rows[0]!.expires_at;
    const beforeExpiry = new Date(expiresAt.getTime() - 1).toISOString();
    expect(await retention.pruneExpired({ now: expiresAt.toISOString(), limit: 10 })).toEqual({
      pruned: 0,
      hasMore: false
    });
    const deleteObject = vi
      .fn()
      .mockRejectedValueOnce(new Error("S3 unavailable"))
      .mockResolvedValue(undefined);
    await retention.cleanExpired({ now, limit: 10, objectStore: { deleteObject } });
    expect(await retention.pruneExpired({ now: expiresAt.toISOString(), limit: 10 })).toEqual({
      pruned: 0,
      hasMore: false
    });
    await expireDeleteLease(eventId);
    await retention.cleanExpired({
      now: "2026-09-28T12:05:00.000Z",
      limit: 10,
      objectStore: { deleteObject }
    });
    expect(await retention.pruneExpired({ now: beforeExpiry, limit: 10 })).toEqual({
      pruned: 0,
      hasMore: false
    });
    expect(await retention.pruneExpired({ now: expiresAt.toISOString(), limit: 10 })).toEqual({
      pruned: 1,
      hasMore: false
    });
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_receipts")).rows[0]?.count
    ).toBe("0");
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_operations")).rows[0]?.count
    ).toBe("1");
  });

  it("prunes expired receipts in oldest-first bounded batches", async () => {
    const first = await seedReceipt("completed", "2026-09-23T12:00:00.000Z");
    const second = await seedReceipt("completed", "2026-09-24T12:00:00.000Z");
    const third = await seedReceipt("completed", "2026-09-25T12:00:00.000Z");
    const deleteObject = vi.fn(async () => undefined);
    await retention.cleanExpired({ now, limit: 10, objectStore: { deleteObject } });
    expect(await retention.pruneExpired({ now: "2027-01-01T00:00:00.000Z", limit: 2 })).toEqual({
      pruned: 2,
      hasMore: true
    });
    const remaining = (
      await pool.query<{ event_id: string }>("SELECT event_id FROM semantic_analytics_receipts")
    ).rows;
    expect(remaining).toEqual([{ event_id: third.eventId }]);
    expect(await retention.pruneExpired({ now: "2027-01-01T00:00:00.000Z", limit: 2 })).toEqual({
      pruned: 1,
      hasMore: false
    });
    expect(deleteObject).toHaveBeenCalledTimes(3);
    expect(first.eventId).not.toBe(second.eventId);
  });

  it("backfills populated predecessor receipts conservatively and requires the migration", async () => {
    const { eventId } = await seedReceipt("completed");
    await migrateStorageSchema(db);
    await pool.query("DROP INDEX semantic_analytics_receipts_raw_retention_idx");
    await pool.query("DROP INDEX semantic_analytics_receipts_raw_deleting_idx");
    await pool.query("ALTER TABLE semantic_analytics_receipts DROP COLUMN raw_status CASCADE");
    await pool.query("ALTER TABLE semantic_analytics_receipts DROP COLUMN raw_retention_outcome");
    await pool.query("ALTER TABLE semantic_analytics_receipts DROP COLUMN raw_deleted_at");
    await pool.query("ALTER TABLE semantic_analytics_receipts DROP COLUMN raw_delete_retry_at");
    await pool.query("ALTER TABLE semantic_analytics_receipts DROP COLUMN occurred_at");
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202609280010_add_semantic_raw_retention_state'"
    );
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202609280022_add_subject_erasure_raw_outcome'"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
    expect((await migrateStorageSchema(db)).applied).toContain(
      "202609280010_add_semantic_raw_retention_state"
    );
    expect(
      (
        await pool.query(
          "SELECT occurred_at=accepted_at AS conservative,raw_status FROM semantic_analytics_receipts WHERE project_id=$1 AND event_id=$2",
          [projectId, eventId]
        )
      ).rows[0]
    ).toEqual({ conservative: true, raw_status: "active" });
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
  });
});
