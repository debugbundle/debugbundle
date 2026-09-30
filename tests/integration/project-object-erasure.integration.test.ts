import { randomUUID } from "node:crypto";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { createPostgresMetadataStore } from "../../packages/storage/src/metadata-store.js";
import { createProjectObjectErasureService } from "../../packages/storage/src/project-object-erasure.js";
import { createS3ObjectStoreClient } from "../../packages/storage/src/s3-client.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
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

runIntegration("project object erasure", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const admin = createS3AdminClient();
  const objectStore = createS3ObjectStoreClient({
    endpoint: s3Endpoint,
    region: s3Region,
    bucket: s3Bucket,
    accessKeyId: "test",
    secretAccessKey: "test"
  });
  let projectId: string;

  beforeEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await admin.send(new CreateBucketCommand({ Bucket: s3Bucket })).catch(() => undefined);
    projectId = randomUUID();
    const organizationId = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Object Erasure",
      organizationSlug: "object-erasure",
      projectName: "App",
      projectSlug: "app"
    });
    await createPostgresMetadataStore(db).deleteProjectForOrganization({
      organization_id: organizationId,
      project_id: projectId
    });
  });

  afterAll(async () => {
    await pool.end();
    admin.destroy();
  });

  it("retains a partial S3 failure for retry and verifies a late semantic object", async () => {
    const key = `semantic-events/${projectId}/initial.json.gz`;
    await objectStore.putObject({
      key,
      body: Buffer.from("protected"),
      contentType: "application/json"
    });
    const deleteObjects = vi.fn(async (input: { keys: string[]; signal?: AbortSignal }) => {
      if (input.keys.includes(key)) return { deleted: [], failed: [key] };
      return objectStore.deleteObjects(input);
    });
    const erasure = createProjectObjectErasureService(db, { ...objectStore, deleteObjects });
    for (let index = 0; index < 5; index += 1) await erasure.processNext();
    expect(await erasure.processNext()).toMatchObject({ processed: true, failed: true });
    expect(await erasure.processNext()).toEqual({ processed: false });
    expect(
      (
        await pool.query(
          `SELECT prefix_index,failure_count FROM project_object_erasure_tasks
           WHERE project_id=$1::uuid`,
          [projectId]
        )
      ).rows[0]
    ).toMatchObject({ prefix_index: 5, failure_count: 1 });
    await pool.query(
      `UPDATE project_object_erasure_tasks
       SET next_attempt_at=clock_timestamp()-interval '1 second'
       WHERE project_id=$1::uuid`,
      [projectId]
    );
    const recovered = createProjectObjectErasureService(db, objectStore);
    expect(await recovered.processNext()).toMatchObject({ processed: true, deleted: 1 });
    await expect(objectStore.getObject({ key })).rejects.toThrow("s3_object_not_found");

    for (let index = 0; index < 4; index += 1) await recovered.processNext();
    const lateKey = `semantic-events/${projectId}/late.json.gz`;
    await objectStore.putObject({
      key: lateKey,
      body: Buffer.from("late"),
      contentType: "application/json"
    });
    await pool.query(
      `UPDATE project_object_erasure_tasks
       SET next_attempt_at=clock_timestamp()-interval '1 second'
       WHERE project_id=$1::uuid`,
      [projectId]
    );
    for (let index = 0; index < 9; index += 1) await recovered.processNext();
    await expect(objectStore.getObject({ key: lateKey })).rejects.toThrow("s3_object_not_found");
    const verified = await pool.query(
      `SELECT verified_at IS NOT NULL AS verified FROM project_object_erasure_tasks
       WHERE project_id=$1::uuid`,
      [projectId]
    );
    expect(verified.rows[0]).toMatchObject({ verified: true });
  });

  it("hands a pending subject erasure to the project journal when its project is deleted", async () => {
    const organizationId = randomUUID();
    const subjectProjectId = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId,
      projectId: subjectProjectId,
      organizationName: "Subject Erasure Handoff",
      organizationSlug: `subject-erasure-${subjectProjectId.slice(0, 8)}`,
      projectName: "App",
      projectSlug: "app"
    });
    const taskId = randomUUID();
    await pool.query(
      `INSERT INTO analytics_project_subject_erasures(
         task_id,project_id,writer_id,idempotency_key,mutation_hash,
         namespace_revision,subject_kind,subject_ref,cutoff_at)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,1,'anonymous',$6,clock_timestamp())`,
      [
        taskId,
        subjectProjectId,
        randomUUID(),
        randomUUID(),
        "a".repeat(64),
        `sha256:${"b".repeat(64)}`
      ]
    );
    const key = `semantic-events/${subjectProjectId}/subject.json.gz`;
    await objectStore.putObject({
      key,
      body: Buffer.from("protected"),
      contentType: "application/json"
    });
    await createPostgresMetadataStore(db).deleteProjectForOrganization({
      organization_id: organizationId,
      project_id: subjectProjectId
    });
    expect(
      (
        await pool.query(
          "SELECT task_id FROM analytics_project_subject_erasures WHERE task_id=$1::uuid",
          [taskId]
        )
      ).rows
    ).toHaveLength(0);
    expect(
      (
        await pool.query(
          "SELECT project_id FROM project_object_erasure_tasks WHERE project_id=$1::uuid",
          [subjectProjectId]
        )
      ).rows
    ).toHaveLength(1);
    const erasure = createProjectObjectErasureService(db, objectStore);
    let deleted = 0;
    for (let index = 0; index < 20 && deleted === 0; index += 1) {
      const result = await erasure.processNext();
      if (result.processed) deleted += result.deleted;
    }
    expect(deleted).toBe(1);
    await expect(objectStore.getObject({ key })).rejects.toThrow("s3_object_not_found");
  });

  it("reports confirmed keys from a partial bulk delete while retrying the failed key", async () => {
    const successfulKey = `semantic-events/${projectId}/a.json.gz`;
    const failedKey = `semantic-events/${projectId}/b.json.gz`;
    for (const key of [successfulKey, failedKey])
      await objectStore.putObject({
        key,
        body: Buffer.from("protected"),
        contentType: "application/json"
      });
    const service = createProjectObjectErasureService(db, {
      ...objectStore,
      deleteObjects: async () => {
        await objectStore.deleteObjects({ keys: [successfulKey] });
        return { deleted: [successfulKey], failed: [failedKey] };
      }
    });
    for (let index = 0; index < 5; index += 1) await service.processNext();
    expect(await service.processNext()).toMatchObject({
      processed: true,
      deleted: 1,
      failed: true
    });
    await expect(objectStore.getObject({ key: successfulKey })).rejects.toThrow(
      "s3_object_not_found"
    );
    expect(await objectStore.getObject({ key: failedKey })).toEqual(Buffer.from("protected"));
    await pool.query(
      `UPDATE project_object_erasure_tasks
       SET next_attempt_at=clock_timestamp()-interval '1 second'
       WHERE project_id=$1::uuid`,
      [projectId]
    );
    expect(await createProjectObjectErasureService(db, objectStore).processNext()).toMatchObject({
      processed: true,
      deleted: 1,
      failed: false
    });
  });

  it("keeps deletion intent transactional and records account-level cascade deletion", async () => {
    const organizationId = randomUUID();
    const cascadeProjectId = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId,
      projectId: cascadeProjectId,
      organizationName: "Cascade Erasure",
      organizationSlug: `cascade-${organizationId.slice(0, 8)}`,
      projectName: "Cascade App",
      projectSlug: "cascade-app"
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM organizations WHERE id=$1::uuid", [organizationId]);
      expect(
        (
          await client.query(
            "SELECT project_id FROM project_object_erasure_tasks WHERE project_id=$1::uuid",
            [cascadeProjectId]
          )
        ).rows
      ).toHaveLength(1);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    expect(
      (
        await pool.query(
          "SELECT project_id FROM project_object_erasure_tasks WHERE project_id=$1::uuid",
          [cascadeProjectId]
        )
      ).rows
    ).toHaveLength(0);
    await pool.query("DELETE FROM organizations WHERE id=$1::uuid", [organizationId]);
    expect(
      (
        await pool.query(
          "SELECT project_id FROM project_object_erasure_tasks WHERE project_id=$1::uuid",
          [cascadeProjectId]
        )
      ).rows
    ).toHaveLength(1);
  });

  it("leases a page to one worker and resumes a 101-object prefix without gaps", async () => {
    const keys = Array.from(
      { length: 101 },
      (_, index) => `raw-events/${projectId}/${index.toString().padStart(3, "0")}.json.gz`
    );
    for (const key of keys)
      await objectStore.putObject({
        key,
        body: Buffer.from("test"),
        contentType: "application/json"
      });
    let releaseListing: (() => void) | undefined;
    const listingGate = new Promise<void>((resolve) => {
      releaseListing = resolve;
    });
    let listingStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      listingStarted = resolve;
    });
    const first = createProjectObjectErasureService(db, {
      ...objectStore,
      listObjects: async (input) => {
        listingStarted?.();
        await listingGate;
        return objectStore.listObjects(input);
      }
    });
    const inFlight = first.processNext();
    await started;
    const second = createProjectObjectErasureService(db, objectStore);
    expect(await second.processNext()).toEqual({ processed: false });
    releaseListing?.();
    expect(await inFlight).toMatchObject({ processed: true, deleted: 100 });
    expect(await second.processNext()).toMatchObject({ processed: true, deleted: 1 });
    expect(
      await objectStore.listObjects({ prefix: `raw-events/${projectId}/`, maxKeys: 100 })
    ).toMatchObject({ objects: [], hasMore: false });
    expect(
      (
        await pool.query(
          "SELECT prefix_index,cursor_key FROM project_object_erasure_tasks WHERE project_id=$1::uuid",
          [projectId]
        )
      ).rows[0]
    ).toMatchObject({ prefix_index: 1, cursor_key: null });
  });

  it("removes a long valid S3 key under a deleted project prefix", async () => {
    const key = `raw-events/${projectId}/${"x".repeat(900)}.json.gz`;
    await objectStore.putObject({
      key,
      body: Buffer.from("protected"),
      contentType: "application/json"
    });
    expect(await createProjectObjectErasureService(db, objectStore).processNext()).toMatchObject({
      processed: true,
      deleted: 1,
      failed: false
    });
    await expect(objectStore.getObject({ key })).rejects.toThrow("s3_object_not_found");
  });

  it("migrates a populated predecessor and fails readiness until the journal exists", async () => {
    await migrateStorageSchema(db);
    await pool.query("DROP TRIGGER project_object_erasure_enqueue ON projects");
    await pool.query("DROP FUNCTION record_project_object_erasure_task()");
    await pool.query("DROP TABLE project_object_erasure_tasks");
    const migrationId = "202609280011_add_project_object_erasure_tasks";
    await pool.query("DELETE FROM storage_migration_ledger WHERE id=$1", [migrationId]);
    const organizationId = randomUUID();
    const existingProjectId = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId,
      projectId: existingProjectId,
      organizationName: "Predecessor Erasure",
      organizationSlug: `predecessor-${organizationId.slice(0, 8)}`,
      projectName: "Existing App",
      projectSlug: "existing-app"
    });
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      `storage_schema_missing_migrations: ${migrationId}`
    );
    expect((await migrateStorageSchema(db)).applied).toEqual([migrationId]);
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect(
      (await pool.query("SELECT id FROM projects WHERE id=$1::uuid", [existingProjectId])).rows
    ).toHaveLength(1);
    await pool.query("DELETE FROM projects WHERE id=$1::uuid", [existingProjectId]);
    expect(
      (
        await pool.query(
          "SELECT project_id FROM project_object_erasure_tasks WHERE project_id=$1::uuid",
          [existingProjectId]
        )
      ).rows
    ).toHaveLength(1);
  });

  it.skipIf(process.env["PROJECT_ERASURE_CAPACITY_STRESS"] !== "1")(
    "measures empty-prefix verification cost across deleted projects",
    async () => {
      const projectCount = Number(process.env["PROJECT_ERASURE_CAPACITY_PROJECTS"] || "100");
      const listLatencyMs = Number(process.env["PROJECT_ERASURE_LIST_LATENCY_MS"] || "0");
      expect(Number.isInteger(projectCount) && projectCount >= 1 && projectCount <= 100).toBe(true);
      expect(Number.isInteger(listLatencyMs) && listLatencyMs >= 0 && listLatencyMs <= 100).toBe(
        true
      );
      await pool.query(
        `INSERT INTO project_object_erasure_tasks(project_id)
         SELECT md5('erasure-capacity-' || n)::uuid FROM generate_series(1,$1::int) AS n`,
        [projectCount - 1]
      );
      let listingCalls = 0;
      const service = createProjectObjectErasureService(db, {
        ...objectStore,
        listObjects: async (input) => {
          listingCalls += 1;
          if (listLatencyMs > 0) await new Promise((resolve) => setTimeout(resolve, listLatencyMs));
          return objectStore.listObjects(input);
        }
      });
      const scans: Array<{ duration_ms: number; claims: number; lists: number }> = [];
      for (let round = 0; round < 2; round += 1) {
        if (round > 0)
          await pool.query(
            `UPDATE project_object_erasure_tasks
             SET next_attempt_at=clock_timestamp()-interval '1 second'
             WHERE scan_round=1`
          );
        const startedAt = performance.now();
        const beforeCalls = listingCalls;
        let claims = 0;
        while (claims < 1_000 && (await service.processNext()).processed) claims += 1;
        scans.push({
          duration_ms: Math.round(performance.now() - startedAt),
          claims,
          lists: listingCalls - beforeCalls
        });
      }
      process.stdout.write(
        `PROJECT_ERASURE_CAPACITY ${JSON.stringify({ projects: projectCount, added_list_latency_ms: listLatencyMs, scans })}\n`
      );
      expect(scans).toMatchObject([
        { claims: projectCount * 9, lists: projectCount * 8 },
        { claims: projectCount * 9, lists: projectCount * 8 }
      ]);
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS total FROM project_object_erasure_tasks WHERE verified_at IS NOT NULL"
          )
        ).rows[0]?.total
      ).toBe(projectCount);
    },
    120_000
  );
});
