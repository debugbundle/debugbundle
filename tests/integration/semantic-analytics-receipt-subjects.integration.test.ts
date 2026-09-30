import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("semantic receipt subject upgrade", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);

  afterAll(async () => pool.end());

  it("backfills retained context references and leaves unrecoverable provenance absent", async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const { ownerUserId } = await seedOwnedProject({
      pool,
      projectId,
      organizationId,
      organizationName: "Subject upgrade",
      organizationSlug: `subject-${projectId}`,
      projectName: "App",
      projectSlug: "app"
    });
    const writerId = randomUUID();
    const contextId = randomUUID();
    const producerEpoch = randomUUID();
    const knownEventId = randomUUID();
    const missingEventId = randomUUID();
    const anonymousRef = `sha256:${"b".repeat(64)}`;
    await pool.query("INSERT INTO analytics_writer_state(project_id,revision) VALUES($1,1)", [
      projectId
    ]);
    await pool.query(
      `INSERT INTO analytics_writers(id,project_id,organization_id,issuer_user_id,kind,display_name,token_hash,expires_at)
       VALUES($1,$2,$3,$4,'relay','Relay',$5,now()+interval '1 day')`,
      [writerId, projectId, organizationId, ownerUserId, "a".repeat(64)]
    );
    await pool.query(
      `INSERT INTO analytics_project_identity_contexts(
         context_id,project_id,writer_id,idempotency_key,mutation_hash,scope_revision,
         namespace_revision,producer_epoch,binding_hash,anonymous_id_hash,privacy_mode,expires_at)
       VALUES($1,$2,$3,$4,$5,1,1,$6,$7,$8,'standard',now()+interval '5 minutes')`,
      [
        contextId,
        projectId,
        writerId,
        randomUUID(),
        "c".repeat(64),
        producerEpoch,
        `sha256:${"d".repeat(64)}`,
        anonymousRef
      ]
    );
    for (const [eventId, linkedContextId] of [
      [knownEventId, contextId],
      [missingEventId, randomUUID()]
    ]) {
      await pool.query(
        `INSERT INTO semantic_analytics_receipts(
           project_id,event_id,content_hash,raw_object_key,worker_job_id,principal,authority,
           scope,scope_revision,catalog_revision,identity_scope,identity_verification,
           namespace_revision,accepted_at,expires_at,occurred_at,
           identity_context_id,identity_writer_id,identity_producer_epoch)
         VALUES($1,$2,$3,$4,$5,'relay','client_observed',$6::jsonb,1,1,
           $6::jsonb,'project_anonymous',1,now(),now()+interval '30 days',now(),$7,$8,$9)`,
        [
          projectId,
          eventId,
          `sha256:${"e".repeat(64)}`,
          `raw/${eventId}`,
          "f".repeat(64),
          JSON.stringify({ kind: "project", project_id: projectId }),
          linkedContextId,
          writerId,
          producerEpoch
        ]
      );
    }
    await pool.query("DROP TABLE semantic_analytics_receipt_subjects");
    const id = "202609280019_index_semantic_receipt_subjects";
    await pool.query("DELETE FROM storage_migration_ledger WHERE id=$1", [id]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      `storage_schema_missing_migrations: ${id}`
    );
    expect((await migrateStorageSchema(db)).applied).toEqual([id]);
    expect(
      (
        await pool.query(
          `SELECT event_id,subject_kind,subject_ref FROM semantic_analytics_receipt_subjects
           WHERE project_id=$1`,
          [projectId]
        )
      ).rows
    ).toEqual([{ event_id: knownEventId, subject_kind: "anonymous", subject_ref: anonymousRef }]);
    await pool.query("DELETE FROM semantic_analytics_receipts WHERE event_id=$1", [knownEventId]);
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_receipt_subjects")).rows[0]?.count
    ).toBe("0");
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
  });
});
