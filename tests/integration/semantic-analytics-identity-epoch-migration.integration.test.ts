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

runIntegration("semantic identity epoch upgrade", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);

  afterAll(async () => pool.end());

  it("backfills revoked epochs and receipt provenance from populated context and tombstone rows", async () => {
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
      organizationName: "Epoch upgrade",
      organizationSlug: `epoch-${projectId}`,
      projectName: "App",
      projectSlug: "app"
    });
    const writerId = randomUUID();
    const epoch = randomUUID();
    const liveContextId = randomUUID();
    const prunedContextId = randomUUID();
    const receiptEventId = randomUUID();
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
        liveContextId,
        projectId,
        writerId,
        randomUUID(),
        "b".repeat(64),
        epoch,
        `sha256:${"c".repeat(64)}`,
        `sha256:${"d".repeat(64)}`
      ]
    );
    await pool.query(
      `INSERT INTO analytics_project_identity_revocations(
         context_id,project_id,writer_id,producer_epoch,binding_hash,revoked_at)
       VALUES($1,$2,$3,$4,$5,now())`,
      [prunedContextId, projectId, writerId, epoch, `sha256:${"e".repeat(64)}`]
    );
    await pool.query(
      `INSERT INTO semantic_analytics_receipts(
         project_id,event_id,content_hash,raw_object_key,worker_job_id,principal,authority,
         scope,scope_revision,catalog_revision,identity_scope,identity_verification,
         namespace_revision,accepted_at,expires_at,occurred_at,identity_context_id,identity_writer_id)
       VALUES($1,$2,$3,'raw/example',$4,'relay','client_observed',$5::jsonb,1,1,
         $5::jsonb,'project_anonymous',1,now(),now()+interval '30 days',now(),$6,$7)`,
      [
        projectId,
        receiptEventId,
        `sha256:${"f".repeat(64)}`,
        "0".repeat(64),
        JSON.stringify({ kind: "project", project_id: projectId }),
        liveContextId,
        writerId
      ]
    );
    await pool.query("DROP TABLE analytics_project_identity_epoch_revocations");
    await pool.query(
      `ALTER TABLE semantic_analytics_receipts
       DROP CONSTRAINT semantic_analytics_receipts_identity_epoch_check,
       DROP COLUMN identity_producer_epoch`
    );
    const id = "202609280018_fence_analytics_identity_producer_epochs";
    await pool.query("DELETE FROM storage_migration_ledger WHERE id=$1", [id]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      `storage_schema_missing_migrations: ${id}`
    );
    expect((await migrateStorageSchema(db)).applied).toEqual([id]);
    expect(
      (
        await pool.query(
          "SELECT producer_epoch FROM analytics_project_identity_epoch_revocations WHERE project_id=$1",
          [projectId]
        )
      ).rows
    ).toEqual([{ producer_epoch: epoch }]);
    expect(
      (
        await pool.query(
          "SELECT identity_producer_epoch FROM semantic_analytics_receipts WHERE event_id=$1",
          [receiptEventId]
        )
      ).rows[0]
    ).toEqual({ identity_producer_epoch: epoch });
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
  });

  it("widens populated receipt provenance for authenticated server namespace facts", async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    const projectId = randomUUID();
    await seedOwnedProject({
      pool,
      projectId,
      organizationId: randomUUID(),
      organizationName: "Server identity upgrade",
      organizationSlug: `server-identity-${projectId}`,
      projectName: "App",
      projectSlug: "app"
    });
    const scope = JSON.stringify({ kind: "project", project_id: projectId });
    await pool.query(
      `INSERT INTO semantic_analytics_receipts(
         project_id,event_id,content_hash,raw_object_key,worker_job_id,principal,authority,
         scope,scope_revision,catalog_revision,accepted_at,expires_at,occurred_at)
       VALUES($1,$2,$3,'raw/old',$4,'server_writer','server_authoritative',$5::jsonb,
         1,1,now(),now()+interval '30 days',now())`,
      [projectId, randomUUID(), `sha256:${"a".repeat(64)}`, "b".repeat(64), scope]
    );
    await pool.query(
      `ALTER TABLE semantic_analytics_receipts
       DROP CONSTRAINT semantic_analytics_receipts_identity_context_check,
       ADD CONSTRAINT semantic_analytics_receipts_identity_context_check CHECK (
         (identity_context_id IS NULL AND identity_writer_id IS NULL)
         OR (identity_context_id IS NOT NULL AND identity_writer_id IS NOT NULL
             AND principal='relay' AND identity_scope IS NOT NULL)
       )`
    );
    const id = "202609280025_bind_semantic_server_identity_writer";
    await pool.query("DELETE FROM storage_migration_ledger WHERE id=$1", [id]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      `storage_schema_missing_migrations: ${id}`
    );
    expect((await migrateStorageSchema(db)).applied).toEqual([id]);
    await pool.query(
      `INSERT INTO semantic_analytics_receipts(
         project_id,event_id,content_hash,raw_object_key,worker_job_id,principal,authority,
         scope,scope_revision,catalog_revision,identity_scope,identity_verification,
         namespace_revision,accepted_at,expires_at,occurred_at,identity_writer_id)
       VALUES($1,$2,$3,'raw/server',$4,'server_writer','server_authoritative',$5::jsonb,
         1,1,$5::jsonb,'server_namespace',1,now(),now()+interval '30 days',now(),$6)`,
      [projectId, randomUUID(), `sha256:${"c".repeat(64)}`, "d".repeat(64), scope, randomUUID()]
    );
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM semantic_analytics_receipts WHERE project_id=$1",
          [projectId]
        )
      ).rows[0]
    ).toEqual({ count: 2 });
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
  });
});
