import { randomUUID } from "node:crypto";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { afterAll, expect, it } from "vitest";
import {
  getTierCapabilities,
  MAX_BILLING_ADDITIONAL_CAPACITY_UNITS
} from "../../packages/shared-types/src/index.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  createRetentionCleanupService,
  type SemanticRetentionCatchUpProgress
} from "../../packages/storage/src/retention-store.js";
import { createSemanticAnalyticsRawRetentionService } from "../../packages/storage/src/semantic-analytics-raw-retention.js";
import { createS3ObjectStoreClient } from "../../packages/storage/src/s3-client.js";
import {
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  runIntegration,
  s3Bucket,
  s3Endpoint,
  s3Region,
  seedOwnedProject
} from "../helpers/integration-setup.js";

const STRESS_MODE = process.env["SEMANTIC_RETENTION_CAPACITY_STRESS"] === "1";
const LOSS_STRESS_MODE = process.env["SEMANTIC_RETENTION_LOSS_STRESS"] === "1";
const S3_LATENCY_MS = process.env["SEMANTIC_RETENTION_S3_LATENCY_MS"] === "50" ? 50 : 0;
const SAMPLE_SIZE = STRESS_MODE ? 22_000 : 2_000;
const RUN_COUNT = STRESS_MODE ? 1 : 2;
const ACCEPTED_AT = "2026-09-25T12:00:00.000Z";
const SCHEDULED_AT = "2026-09-28T12:00:00.000Z";

runIntegration("semantic analytics retention capacity", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const s3Admin = createS3AdminClient();
  const objectStore = createS3ObjectStoreClient({
    endpoint: s3Endpoint,
    region: s3Region,
    bucket: s3Bucket,
    accessKeyId: "test",
    secretAccessKey: "test"
  });

  afterAll(async () => {
    await pool.end();
    s3Admin.destroy();
  });

  it("measures two bounded catch-up runs against a real receipt backlog and competing database work", async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await s3Admin.send(new CreateBucketCommand({ Bucket: s3Bucket })).catch(() => undefined);

    const projectId = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId: randomUUID(),
      projectId,
      organizationName: "Capacity",
      organizationSlug: "capacity",
      projectName: "App",
      projectSlug: "app",
      organizationPlan: "team"
    });

    const seed = await pool.query<{ event_id: string; raw_object_key: string }>(
      `WITH items AS (
         SELECT md5('semantic-capacity-event-' || n)::uuid AS event_id,
                repeat(md5('semantic-capacity-job-' || n),2) AS job_id
         FROM generate_series(1,$2::int) AS n
       ), jobs AS (
         INSERT INTO worker_jobs(id,job_name,project_id,payload,status)
         SELECT job_id,'process-semantic-analytics-event',$1::uuid,NULL,$4
         FROM items RETURNING id
       )
       INSERT INTO semantic_analytics_receipts(
         project_id,event_id,content_hash,raw_object_key,worker_job_id,principal,authority,
         scope,scope_revision,catalog_revision,accepted_at,expires_at,occurred_at)
       SELECT $1::uuid,event_id,'sha256:' || repeat('a',64),
         'semantic-events/' || $1 || '/2026/09/25/12/' || event_id || '/' || repeat('a',64) || '.json.gz',
         job_id,'project_token','client_observed',
         jsonb_build_object('kind','project','project_id',$1),1,1,
         $3::timestamptz,$3::timestamptz+interval '90 days',$3::timestamptz
       FROM items
       RETURNING event_id::text,raw_object_key`,
      [projectId, SAMPLE_SIZE, ACCEPTED_AT, LOSS_STRESS_MODE ? "pending" : "completed"]
    );
    expect(seed.rows).toHaveLength(SAMPLE_SIZE);

    for (let index = 0; index < seed.rows.length; index += 25) {
      await Promise.all(
        seed.rows.slice(index, index + 25).map(({ raw_object_key: key }) =>
          objectStore.putObject({
            key,
            body: Buffer.from("protected"),
            contentType: "application/json",
            contentEncoding: "gzip"
          })
        )
      );
    }

    const progress: SemanticRetentionCatchUpProgress[] = [];
    const bulkDeleteSizes: number[] = [];
    const runner = createRetentionCleanupService({
      retentionStore: {} as Parameters<typeof createRetentionCleanupService>[0]["retentionStore"],
      objectStore: {
        ...objectStore,
        deleteObjects: async (input) => {
          bulkDeleteSizes.push(input.keys.length);
          if (S3_LATENCY_MS > 0) await new Promise((resolve) => setTimeout(resolve, S3_LATENCY_MS));
          return objectStore.deleteObjects(input);
        }
      },
      semanticRawRetention: createSemanticAnalyticsRawRetentionService(db),
      onSemanticCatchUp: (entry) => progress.push(entry),
      maxBatches: STRESS_MODE ? 220 : 10
    });
    let continueReads = true;
    let competingReads = 0;
    let competingWrites = 0;
    const competingJobIds = [
      randomUUID().replaceAll("-", "").repeat(2),
      randomUUID().replaceAll("-", "").repeat(2)
    ];
    await pool.query(
      `INSERT INTO worker_jobs(id,job_name,project_id,payload,status)
       VALUES($1,'process-semantic-analytics-event',$3::uuid,NULL,'completed'),
             ($2,'process-semantic-analytics-event',$3::uuid,NULL,'completed')`,
      [competingJobIds[0], competingJobIds[1], projectId]
    );
    const readers = Array.from({ length: 2 }, async () => {
      while (continueReads) {
        await pool.query("SELECT count(*) FROM worker_jobs WHERE project_id=$1::uuid", [projectId]);
        competingReads += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    });
    const writers = competingJobIds.map(async (jobId) => {
      while (continueReads) {
        await pool.query("UPDATE worker_jobs SET updated_at=now() WHERE id=$1", [jobId]);
        competingWrites += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    });

    const runs: Array<{ duration_ms: number; deleted: number; remaining: number }> = [];
    try {
      for (let run = 0; run < RUN_COUNT; run += 1) {
        const started = performance.now();
        await runner.runCleanup({ scheduled_at: SCHEDULED_AT, scope: "semantic_raw" });
        const durationMs = Math.round(performance.now() - started);
        const result = await pool.query<{ deleted: string; remaining: string }>(
          `SELECT count(*) FILTER (WHERE raw_status='deleted')::text AS deleted,
                  count(*) FILTER (WHERE raw_status<>'deleted')::text AS remaining
           FROM semantic_analytics_receipts WHERE project_id=$1::uuid`,
          [projectId]
        );
        runs.push({
          duration_ms: durationMs,
          deleted: Number(result.rows[0]?.deleted ?? 0),
          remaining: Number(result.rows[0]?.remaining ?? 0)
        });
      }
    } finally {
      continueReads = false;
      await Promise.all([...readers, ...writers]);
    }

    const deleted = runs.at(-1)?.deleted ?? 0;
    if (S3_LATENCY_MS === 0 && !LOSS_STRESS_MODE) {
      expect(bulkDeleteSizes).toHaveLength(SAMPLE_SIZE / 100);
      expect(bulkDeleteSizes.every((size) => size === 100)).toBe(true);
    } else {
      expect(bulkDeleteSizes.length).toBeLessThanOrEqual(SAMPLE_SIZE / 100);
      expect(bulkDeleteSizes.length).toBeGreaterThan(0);
    }
    const lostQuality = await pool.query<{ lost: string; transitioned: string }>(
      `SELECT
         (SELECT COALESCE(sum(lost_count),0)::text FROM semantic_analytics_loss_days
          WHERE project_id=$1::uuid) AS lost,
         (SELECT count(*)::text FROM semantic_analytics_receipts
          WHERE project_id=$1::uuid AND raw_retention_outcome='lost') AS transitioned`,
      [projectId]
    );
    const lostCount = Number(lostQuality.rows[0]?.lost ?? 0);
    const transitionedCount = Number(lostQuality.rows[0]?.transitioned ?? 0);
    expect(lostCount).toBe(transitionedCount);
    if (LOSS_STRESS_MODE) expect(lostCount).toBeGreaterThan(0);
    else expect(lostCount).toBe(0);
    const scheduledCeilingPerMinute = deleted / RUN_COUNT;
    const team = getTierCapabilities("team");
    const teamPerMinute =
      (team.included_capacity_units * team.monthly_analytics_events) / (30 * 24 * 60);
    const maxPurchasedPerMinute =
      ((team.included_capacity_units + MAX_BILLING_ADDITIONAL_CAPACITY_UNITS) *
        team.monthly_analytics_events) /
      (30 * 24 * 60);
    // These numbers are diagnostic capacity evidence, not a host-independent speed assertion.
    process.stdout.write(
      `SEMANTIC_RETENTION_CAPACITY ${JSON.stringify({
        sample_size: SAMPLE_SIZE,
        stress_mode: STRESS_MODE,
        loss_stress_mode: LOSS_STRESS_MODE,
        injected_s3_latency_ms: S3_LATENCY_MS,
        bulk_delete_calls: bulkDeleteSizes.length,
        runs,
        progress,
        competing_reads: competingReads,
        competing_writes: competingWrites,
        lost_quality_markers: lostCount,
        scheduled_ceiling_per_minute: scheduledCeilingPerMinute,
        team_included_per_minute: teamPerMinute,
        max_purchased_per_minute: maxPurchasedPerMinute
      })}\n`
    );
    expect(competingReads).toBeGreaterThan(0);
    expect(competingWrites).toBeGreaterThan(0);
    expect(progress).toHaveLength(RUN_COUNT);
    for (const entry of progress) {
      expect(entry).toMatchObject({ receipts_pruned: 0, work_remains_hint: true });
      if (S3_LATENCY_MS === 0 && !LOSS_STRESS_MODE)
        expect(entry).toMatchObject({
          raw_deleted: SAMPLE_SIZE / RUN_COUNT,
          batches: STRESS_MODE ? 220 : 10,
          reached_batch_limit: true,
          reached_deadline: false
        });
      else if (LOSS_STRESS_MODE) {
        expect(entry.raw_deleted).toBeGreaterThan(0);
        expect(entry.raw_deleted).toBeLessThanOrEqual(SAMPLE_SIZE);
        expect(entry.reached_deadline || entry.reached_batch_limit).toBe(true);
      } else {
        expect(entry.raw_deleted).toBeLessThan(SAMPLE_SIZE);
        expect(entry.reached_deadline).toBe(true);
      }
    }
    expect(deleted).toBeGreaterThan(0);
    expect(deleted + (runs.at(-1)?.remaining ?? 0)).toBe(SAMPLE_SIZE);
    if (runs.at(-1)?.remaining === 0) {
      await expect(objectStore.getObject({ key: seed.rows[0]!.raw_object_key })).rejects.toThrow(
        "s3_object_not_found"
      );
      await expect(
        objectStore.getObject({ key: seed.rows.at(-1)!.raw_object_key })
      ).rejects.toThrow("s3_object_not_found");
    }
  }, 300_000);

  if (process.env["SEMANTIC_RETENTION_SELECTION_STRESS"] === "1") {
    it("measures million-row candidate selection after a raw-retention reduction", async () => {
      await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
      await pool.query("CREATE SCHEMA public");
      await bootstrapStorageSchema(db);
      const projectId = randomUUID();
      await seedOwnedProject({
        pool,
        organizationId: randomUUID(),
        projectId,
        organizationName: "Selection Capacity",
        organizationSlug: "selection-capacity",
        projectName: "App",
        projectSlug: "app",
        organizationPlan: "team"
      });
      await pool.query(
        `INSERT INTO project_analytics_settings(project_id,raw_retention_days)
         VALUES($1::uuid,30)`,
        [projectId]
      );
      const seedStarted = performance.now();
      await pool.query(
        `WITH items AS (
           SELECT md5('semantic-selection-event-' || n)::uuid AS event_id,
                  repeat(md5('semantic-selection-job-' || n),2) AS job_id,
                  $2::timestamptz-make_interval(days => 1+(n % 30)) AS accepted_at
           FROM generate_series(1,1000000) AS n
         )
         INSERT INTO semantic_analytics_receipts(
           project_id,event_id,content_hash,raw_object_key,worker_job_id,principal,authority,
           scope,scope_revision,catalog_revision,accepted_at,expires_at,occurred_at)
         SELECT $1::uuid,event_id,'sha256:' || repeat('a',64),
           'semantic-events/' || $1 || '/' || event_id || '.json.gz',
           job_id,'project_token','client_observed',
           jsonb_build_object('kind','project','project_id',$1),1,1,
           accepted_at,accepted_at+interval '90 days',accepted_at
         FROM items`,
        [projectId, SCHEDULED_AT]
      );
      await pool.query("ANALYZE semantic_analytics_receipts");
      const seededMs = Math.round(performance.now() - seedStarted);
      const retention = createSemanticAnalyticsRawRetentionService(db);
      const neverDelete = {
        deleteObject: async () => {
          throw new Error("unexpected_delete");
        }
      };
      const beforeStarted = performance.now();
      expect(
        await retention.cleanExpired({
          now: SCHEDULED_AT,
          limit: 100,
          deadlineMs: Date.now() - 1,
          objectStore: neverDelete
        })
      ).toEqual({ deleted: 0, hasMore: false });
      const beforeMs = Math.round(performance.now() - beforeStarted);
      await pool.query(
        `UPDATE project_analytics_settings SET raw_retention_days=1
         WHERE project_id=$1::uuid`,
        [projectId]
      );
      const afterStarted = performance.now();
      expect(
        await retention.cleanExpired({
          now: SCHEDULED_AT,
          limit: 100,
          deadlineMs: Date.now() - 1,
          objectStore: neverDelete
        })
      ).toEqual({ deleted: 0, hasMore: true });
      const afterMs = Math.round(performance.now() - afterStarted);
      const repeatedSelectionMs: number[] = [];
      for (let sample = 0; sample < 20; sample += 1) {
        const started = performance.now();
        await retention.cleanExpired({
          now: SCHEDULED_AT,
          limit: 100,
          deadlineMs: Date.now() - 1,
          objectStore: neverDelete
        });
        repeatedSelectionMs.push(Math.round(performance.now() - started));
      }
      const sortedSelectionMs = [...repeatedSelectionMs].sort((left, right) => left - right);
      const cursorSelectionMs: number[] = [];
      let cursor: { accepted_at: string; project_id: string; event_id: string } | undefined;
      for (let sample = 0; sample < 20; sample += 1) {
        const previous = cursor;
        const started = performance.now();
        await retention.cleanExpired({
          now: SCHEDULED_AT,
          limit: 100,
          deadlineMs: Date.now() - 1,
          objectStore: neverDelete,
          ...(cursor === undefined ? {} : { startAfter: cursor }),
          onCursor: (next) => {
            cursor = next ?? undefined;
          }
        });
        expect(cursor).toBeDefined();
        if (previous !== undefined) expect(cursor).not.toEqual(previous);
        cursorSelectionMs.push(Math.round(performance.now() - started));
      }
      const sortedCursorMs = [...cursorSelectionMs].sort((left, right) => left - right);
      process.stdout.write(
        `SEMANTIC_RETENTION_SELECTION ${JSON.stringify({ rows: 1_000_000, seeded_ms: seededMs, before_ms: beforeMs, after_ms: afterMs, repeated_count: repeatedSelectionMs.length, repeated_p50_ms: sortedSelectionMs[9], repeated_p95_ms: sortedSelectionMs[18], repeated_total_ms: repeatedSelectionMs.reduce((sum, duration) => sum + duration, 0), cursor_count: cursorSelectionMs.length, cursor_p50_ms: sortedCursorMs[9], cursor_p95_ms: sortedCursorMs[18], cursor_total_ms: cursorSelectionMs.reduce((sum, duration) => sum + duration, 0) })}\n`
      );
    }, 300_000);
  }
});
