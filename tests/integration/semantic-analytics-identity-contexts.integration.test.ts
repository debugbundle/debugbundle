import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import {
  associateProjectAnalyticsIdentityContext,
  createProjectAnalyticsIdentityContext,
  resolveProjectAnalyticsIdentityContext,
  resolveProjectAnalyticsIdentityContextInTransaction,
  revokeProjectAnalyticsIdentityContext
} from "../../packages/storage/src/analytics-identity-context-store.js";
import { createAnalyticsIdentityContextRetention } from "../../packages/storage/src/analytics-identity-context-retention.js";
import {
  readProjectAnalyticsSubjectErasureStatus,
  requestProjectAnalyticsSubjectErasure
} from "../../packages/storage/src/analytics-subject-erasure-store.js";
import { hasProjectAnalyticsSubjectErasureFence } from "../../packages/storage/src/analytics-subject-erasure-fence.js";
import { createAnalyticsSubjectErasureRetention } from "../../packages/storage/src/analytics-subject-erasure-retention.js";
import { processProjectAnalyticsSubjectErasurePass } from "../../packages/storage/src/analytics-subject-erasure-processor.js";
import {
  applyProjectAnalyticsIdentityNamespaceChange,
  previewProjectAnalyticsIdentityNamespaceChange,
  readProjectAnalyticsIdentityNamespace
} from "../../packages/storage/src/analytics-identity-namespace-store.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("semantic relay identity contexts", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  let projectId: string;
  let writerId: string;
  let writerHash: string;
  let ownerUserId: string;

  beforeEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    const organizationId = randomUUID();
    projectId = randomUUID();
    ({ ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Growth",
      organizationSlug: `growth-${projectId}`,
      projectName: "App",
      projectSlug: `app-${projectId}`,
      organizationPlan: "team"
    }));
    writerHash = "a".repeat(64);
    writerId = randomUUID();
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,enabled,privacy_mode,max_custom_dimensions) VALUES($1,true,'strict',2)",
      [projectId]
    );
    await pool.query("INSERT INTO analytics_writer_state(project_id,revision) VALUES($1,1)", [
      projectId
    ]);
    await pool.query(
      `INSERT INTO analytics_writers(id,project_id,organization_id,issuer_user_id,kind,display_name,token_hash,expires_at)
       VALUES($1,$2,$3,$4,'server','Identity writer',$5,now()+interval '30 days')`,
      [writerId, projectId, organizationId, ownerUserId, writerHash]
    );
    const catalog = [
      {
        name: "account.created",
        revision: 1,
        description: "Committed account",
        producers: ["server"],
        purpose: "business_measurement",
        success_boundary: "committed",
        properties: { signup_method: { type: "enum", values: ["email", "oauth"], required: true } },
        measurements: {},
        expected_producers: []
      }
    ];
    await pool.query(
      "INSERT INTO analytics_project_catalogs(project_id,revision,catalog_revision,content_hash,entries) VALUES($1,1,1,$2,$3::jsonb)",
      [projectId, "b".repeat(64), JSON.stringify(catalog)]
    );
    await pool.query(
      `INSERT INTO analytics_project_plans(project_id,revision,catalog_revision,business_measurement_enabled,content_hash,catalog,reports)
       VALUES($1,1,1,false,$2,$3::jsonb,'[]'::jsonb)`,
      [projectId, "c".repeat(64), JSON.stringify(catalog)]
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it("does not complete an erasure while a pre-cutoff staged object commits", async () => {
    const taskId = randomUUID();
    await pool.query(
      `INSERT INTO analytics_project_subject_erasures(
         task_id,project_id,writer_id,idempotency_key,mutation_hash,
         namespace_revision,subject_kind,subject_ref,cutoff_at)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,1,'anonymous',$6,clock_timestamp())`,
      [taskId, projectId, writerId, randomUUID(), "c".repeat(64), `sha256:${"d".repeat(64)}`]
    );
    const blocker = await pool.connect();
    let pass: ReturnType<typeof processProjectAnalyticsSubjectErasurePass> | null = null;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM projects WHERE id=$1::uuid FOR UPDATE", [projectId]);
      await blocker.query(
        `INSERT INTO semantic_analytics_pending_objects(
           project_id,event_id,content_hash,raw_object_key,created_at)
         SELECT $1::uuid,$2::uuid,$3,'pre-cutoff-object',cutoff_at-interval '1 second'
         FROM analytics_project_subject_erasures WHERE task_id=$4::uuid`,
        [projectId, randomUUID(), `sha256:${"e".repeat(64)}`, taskId]
      );
      pass = processProjectAnalyticsSubjectErasurePass(
        db,
        {
          deleteObjects: async () => ({ deleted: [], failed: [] }),
          listObjects: async () => ({ objects: [], hasMore: false })
        },
        { limit: 100 }
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(
        (
          await pool.query<{ status: string }>(
            "SELECT status FROM analytics_project_subject_erasures WHERE task_id=$1::uuid",
            [taskId]
          )
        ).rows[0]?.status
      ).toBe("pending");
      await blocker.query("COMMIT");
      expect(await pass).toMatchObject({ task_id: taskId, complete: false, has_more: true });
      pass = null;
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
      await pass?.catch(() => undefined);
    }
  });

  it("reads only an authorized project's payload-free erasure status", async () => {
    const taskId = randomUUID();
    await pool.query(
      `INSERT INTO analytics_project_subject_erasures(
         task_id,project_id,writer_id,idempotency_key,mutation_hash,
         namespace_revision,subject_kind,subject_ref,cutoff_at)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,1,'anonymous',$6,clock_timestamp())`,
      [taskId, projectId, writerId, randomUUID(), "c".repeat(64), `sha256:${"d".repeat(64)}`]
    );
    expect(
      await readProjectAnalyticsSubjectErasureStatus(db, {
        actorUserId: ownerUserId,
        projectId,
        taskId
      })
    ).toMatchObject({ kind: "status", task: { task_id: taskId, status: "pending" } });
    expect(
      await readProjectAnalyticsSubjectErasureStatus(db, {
        actorUserId: randomUUID(),
        projectId,
        taskId
      })
    ).toEqual({ kind: "forbidden" });
    await pool.query(
      `UPDATE analytics_project_subject_erasures
       SET status='complete',completed_at=clock_timestamp() WHERE task_id=$1::uuid`,
      [taskId]
    );
    const complete = await readProjectAnalyticsSubjectErasureStatus(db, {
      actorUserId: ownerUserId,
      projectId,
      taskId
    });
    expect(complete).toMatchObject({ kind: "status", task: { status: "complete" } });
    expect(JSON.stringify(complete)).not.toContain(`sha256:${"d".repeat(64)}`);
  });

  it("prunes expired relay contexts in bounded oldest-first batches", async () => {
    const now = Date.now();
    for (const ageMinutes of [20, 15, 0]) {
      const issuedAt = new Date(now - ageMinutes * 60_000).toISOString();
      const expiresAt = new Date(now + (5 - ageMinutes) * 60_000).toISOString();
      await pool.query(
        `INSERT INTO analytics_project_identity_contexts(
          context_id,project_id,writer_id,idempotency_key,mutation_hash,scope_revision,
          namespace_revision,producer_epoch,binding_hash,anonymous_id_hash,privacy_mode,
          issued_at,expires_at)
         VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,1,1,$6::uuid,$7,$8,'standard',
           $9::timestamptz,$10::timestamptz)`,
        [
          randomUUID(),
          projectId,
          writerId,
          randomUUID(),
          "e".repeat(64),
          randomUUID(),
          `sha256:${"a".repeat(64)}`,
          `sha256:${"b".repeat(64)}`,
          issuedAt,
          expiresAt
        ]
      );
    }
    const retention = createAnalyticsIdentityContextRetention(db);
    const at = new Date(now).toISOString();
    expect(await retention.pruneExpired({ now: at, limit: 1 })).toEqual({
      pruned: 1,
      hasMore: true
    });
    expect(await retention.pruneExpired({ now: at, limit: 1 })).toEqual({
      pruned: 1,
      hasMore: true
    });
    expect(await retention.pruneExpired({ now: at, limit: 1 })).toEqual({
      pruned: 0,
      hasMore: false
    });
    expect(
      (await pool.query("SELECT count(*) FROM analytics_project_identity_contexts")).rows[0]?.count
    ).toBe("1");
    await pool.query(
      `INSERT INTO analytics_project_identity_associations(
         project_id,context_id,writer_id,namespace_revision,producer_epoch,
         anonymous_id_hash,user_id_hash,associated_at,expires_at)
       VALUES($1,$2,$3,1,$4,$5,$6,
         now()-interval '91 days',now()-interval '1 day')`,
      [
        projectId,
        randomUUID(),
        writerId,
        randomUUID(),
        `sha256:${"a".repeat(64)}`,
        `sha256:${"b".repeat(64)}`
      ]
    );
    const erasureTaskId = randomUUID();
    await pool.query(
      `INSERT INTO analytics_project_subject_erasures(
         task_id,project_id,writer_id,idempotency_key,mutation_hash,
         namespace_revision,subject_kind,subject_ref,cutoff_at)
       VALUES($1,$2,$3,$4,$5,1,'user',$6,now())`,
      [erasureTaskId, projectId, writerId, randomUUID(), "c".repeat(64), `sha256:${"b".repeat(64)}`]
    );
    expect(await retention.pruneExpiredAssociations({ now: at, limit: 1 })).toEqual({
      pruned: 0,
      hasMore: false
    });
    expect(
      await createAnalyticsSubjectErasureRetention(db).pruneCompleted({
        now: new Date(now + 91 * 86_400_000).toISOString(),
        limit: 1
      })
    ).toEqual({ pruned: 0, hasMore: false });
    await pool.query(
      `UPDATE analytics_project_subject_erasures
       SET status='complete',completed_at=now() WHERE task_id=$1`,
      [erasureTaskId]
    );
    expect(await retention.pruneExpiredAssociations({ now: at, limit: 1 })).toEqual({
      pruned: 1,
      hasMore: true
    });
    expect(await retention.pruneExpiredAssociations({ now: at, limit: 1 })).toEqual({
      pruned: 0,
      hasMore: false
    });
    expect(
      await createAnalyticsSubjectErasureRetention(db).pruneCompleted({
        now: new Date(now + 91 * 86_400_000).toISOString(),
        limit: 1
      })
    ).toEqual({ pruned: 1, hasMore: true });
  });

  it("backfills retained known associations through the forward migration", async () => {
    await migrateStorageSchema(db);
    const contextId = randomUUID();
    const anonymousRef = `sha256:${"a".repeat(64)}`;
    const userRef = `sha256:${"b".repeat(64)}`;
    const accountRef = `sha256:${"c".repeat(64)}`;
    await pool.query(
      `INSERT INTO analytics_project_identity_contexts(
         context_id,project_id,writer_id,idempotency_key,mutation_hash,scope_revision,
         namespace_revision,producer_epoch,binding_hash,anonymous_id_hash,user_id_hash,
         account_id_hash,privacy_mode,expires_at,associated_at,
         association_idempotency_key,association_hash)
       VALUES($1,$2,$3,$4,$5,1,1,$6,$7,$8,$9,$10,'custom',
         now()+interval '5 minutes',now(),$11,$12)`,
      [
        contextId,
        projectId,
        writerId,
        randomUUID(),
        "d".repeat(64),
        randomUUID(),
        `sha256:${"e".repeat(64)}`,
        anonymousRef,
        userRef,
        accountRef,
        randomUUID(),
        "f".repeat(64)
      ]
    );
    await pool.query("DROP TABLE analytics_project_identity_associations");
    const id = "202609280020_retain_analytics_identity_associations";
    await pool.query("DELETE FROM storage_migration_ledger WHERE id=$1", [id]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      `storage_schema_missing_migrations: ${id}`
    );
    expect((await migrateStorageSchema(db)).applied).toEqual([id]);
    expect(
      (
        await pool.query(
          `SELECT anonymous_id_hash,user_id_hash,account_id_hash
           FROM analytics_project_identity_associations
           WHERE project_id=$1 AND context_id=$2`,
          [projectId, contextId]
        )
      ).rows[0]
    ).toMatchObject({
      anonymous_id_hash: anonymousRef,
      user_id_hash: userRef,
      account_id_hash: accountRef
    });
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
  });

  it("rotates and revokes an owner-configured project namespace without reusing prior authority", async () => {
    const first = {
      actorUserId: ownerUserId,
      projectId,
      expectedRevision: 0,
      idempotencyKey: randomUUID(),
      action: "configure" as const,
      keyFingerprint: `sha256:${"e".repeat(64)}`
    };
    const reviewed = await previewProjectAnalyticsIdentityNamespaceChange(db, first);
    expect(reviewed).toMatchObject({
      kind: "preview",
      preview: { expected_revision: 0, resulting_revision: 1, contexts_fenced: false }
    });
    if (reviewed.kind !== "preview") throw new Error("namespace_preview_unavailable");
    expect(
      await applyProjectAnalyticsIdentityNamespaceChange(db, {
        ...first,
        previewHash: "a".repeat(64)
      })
    ).toEqual({ kind: "conflict" });
    const applied = await applyProjectAnalyticsIdentityNamespaceChange(db, {
      ...first,
      previewHash: reviewed.preview.preview_hash
    });
    expect(applied).toMatchObject({
      kind: "applied",
      replayed: false,
      namespace: { namespace_revision: 1, key_fingerprint: first.keyFingerprint, revoked_at: null }
    });
    expect(
      await applyProjectAnalyticsIdentityNamespaceChange(db, {
        ...first,
        previewHash: reviewed.preview.preview_hash
      })
    ).toMatchObject({
      kind: "applied",
      replayed: true,
      namespace: { namespace_revision: 1 }
    });
    expect(
      await applyProjectAnalyticsIdentityNamespaceChange(db, {
        ...first,
        keyFingerprint: `sha256:${"f".repeat(64)}`
      })
    ).toEqual({ kind: "conflict" });
    expect(
      await applyProjectAnalyticsIdentityNamespaceChange(db, {
        ...first,
        actorUserId: randomUUID(),
        idempotencyKey: randomUUID()
      })
    ).toEqual({ kind: "forbidden" });

    const rotated = await applyProjectAnalyticsIdentityNamespaceChange(db, {
      ...first,
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
      keyFingerprint: `sha256:${"f".repeat(64)}`
    });
    expect(rotated).toMatchObject({ kind: "applied", namespace: { namespace_revision: 2 } });
    expect(await readProjectAnalyticsIdentityNamespace(db, ownerUserId, projectId)).toMatchObject({
      namespace_revision: 2,
      key_fingerprint: `sha256:${"f".repeat(64)}`
    });
    expect(
      await applyProjectAnalyticsIdentityNamespaceChange(db, {
        ...first,
        expectedRevision: 1,
        idempotencyKey: randomUUID()
      })
    ).toEqual({ kind: "conflict" });

    const revoked = await applyProjectAnalyticsIdentityNamespaceChange(db, {
      actorUserId: ownerUserId,
      projectId,
      expectedRevision: 2,
      idempotencyKey: randomUUID(),
      action: "revoke"
    });
    expect(revoked).toMatchObject({
      kind: "applied",
      namespace: { namespace_revision: 3, revoked_at: expect.any(String) }
    });
    expect(
      await applyProjectAnalyticsIdentityNamespaceChange(db, {
        ...first,
        expectedRevision: 3,
        idempotencyKey: randomUUID(),
        keyFingerprint: `sha256:${"a".repeat(64)}`
      })
    ).toMatchObject({ kind: "applied", namespace: { namespace_revision: 4, revoked_at: null } });
  });

  it("binds relay contexts to the current writer, namespace, epoch and binding through revocation", async () => {
    await pool.query("UPDATE analytics_writers SET kind='relay' WHERE id=$1", [writerId]);
    await pool.query(
      "UPDATE project_analytics_settings SET privacy_mode='custom' WHERE project_id=$1",
      [projectId]
    );
    await pool.query(
      `INSERT INTO analytics_project_identity_namespaces(project_id,namespace_revision,key_fingerprint)
       VALUES($1,1,$2)`,
      [projectId, `sha256:${"e".repeat(64)}`]
    );
    const producerEpoch = randomUUID();
    const bindingHash = `sha256:${"f".repeat(64)}`;
    const anonymousHash = `sha256:${"a".repeat(64)}`;
    const request = {
      producer_epoch: producerEpoch,
      binding_hash: bindingHash,
      namespace_revision: 1,
      anonymous_id_hash: anonymousHash,
      consent_granted: true as const,
      idempotency_key: randomUUID()
    };
    const created = await createProjectAnalyticsIdentityContext(db, writerHash, request);
    expect(created.kind).toBe("created");
    if (created.kind !== "created") return;
    expect(created.context).toMatchObject({
      project_id: projectId,
      anonymous_id_hash: anonymousHash,
      user_id_hash: null,
      namespace_revision: 1,
      privacy_mode: "custom"
    });
    expect(await createProjectAnalyticsIdentityContext(db, writerHash, request)).toMatchObject({
      kind: "created",
      replayed: true,
      context: { context_id: created.context.context_id }
    });
    expect(
      await db.transaction!((tx) =>
        resolveProjectAnalyticsIdentityContextInTransaction(tx, writerHash, {
          context_id: created.context.context_id,
          producer_epoch: producerEpoch,
          binding_hash: bindingHash
        })
      )
    ).toMatchObject({
      writerId,
      context: { context_id: created.context.context_id, project_id: projectId }
    });
    expect(
      await createProjectAnalyticsIdentityContext(db, writerHash, {
        ...request,
        anonymous_id_hash: `sha256:${"b".repeat(64)}`
      })
    ).toEqual({ kind: "conflict" });
    expect(
      await resolveProjectAnalyticsIdentityContext(db, writerHash, {
        contextId: created.context.context_id,
        producerEpoch,
        bindingHash: `sha256:${"b".repeat(64)}`
      })
    ).toBeNull();

    const association = {
      context_id: created.context.context_id,
      producer_epoch: producerEpoch,
      binding_hash: bindingHash,
      namespace_revision: 1,
      anonymous_id_hash: anonymousHash,
      user_id_hash: `sha256:${"c".repeat(64)}`,
      account_id_hash: null,
      consent_granted: true as const,
      idempotency_key: randomUUID()
    };
    const associated = await associateProjectAnalyticsIdentityContext(db, writerHash, association);
    expect(associated).toMatchObject({
      kind: "associated",
      replayed: false,
      context: { user_id_hash: association.user_id_hash }
    });
    expect(
      await associateProjectAnalyticsIdentityContext(db, writerHash, association)
    ).toMatchObject({
      kind: "associated",
      replayed: true
    });
    expect(
      (
        await pool.query(
          `SELECT namespace_revision,anonymous_id_hash,user_id_hash,account_id_hash
           FROM analytics_project_identity_associations WHERE project_id=$1 AND context_id=$2`,
          [projectId, created.context.context_id]
        )
      ).rows[0]
    ).toMatchObject({
      namespace_revision: "1",
      anonymous_id_hash: anonymousHash,
      user_id_hash: association.user_id_hash,
      account_id_hash: null
    });
    expect(
      await associateProjectAnalyticsIdentityContext(db, writerHash, {
        ...association,
        user_id_hash: `sha256:${"d".repeat(64)}`,
        idempotency_key: randomUUID()
      })
    ).toEqual({ kind: "conflict" });

    const second = await createProjectAnalyticsIdentityContext(db, writerHash, {
      ...request,
      idempotency_key: randomUUID()
    });
    expect(second.kind).toBe("created");
    if (second.kind !== "created") return;
    await pool.query(
      `UPDATE analytics_project_identity_namespaces
       SET namespace_revision=2,key_fingerprint=$2 WHERE project_id=$1`,
      [projectId, `sha256:${"b".repeat(64)}`]
    );
    expect(
      await resolveProjectAnalyticsIdentityContext(db, writerHash, {
        contextId: second.context.context_id,
        producerEpoch,
        bindingHash
      })
    ).toBeNull();

    const revocation = {
      context_id: created.context.context_id,
      producer_epoch: producerEpoch,
      binding_hash: bindingHash,
      idempotency_key: randomUUID()
    };
    await pool.query("UPDATE project_analytics_settings SET enabled=false WHERE project_id=$1", [
      projectId
    ]);
    const revoked = await revokeProjectAnalyticsIdentityContext(db, writerHash, revocation);
    expect(revoked).toMatchObject({ kind: "revoked", receipt: { replayed: false } });
    expect(await revokeProjectAnalyticsIdentityContext(db, writerHash, revocation)).toMatchObject({
      kind: "revoked",
      receipt: { replayed: true }
    });
    await createAnalyticsIdentityContextRetention(db).pruneExpired({
      now: new Date(Date.now() + 6 * 60_000).toISOString(),
      limit: 100
    });
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM analytics_project_identity_associations WHERE project_id=$1 AND context_id=$2",
          [projectId, created.context.context_id]
        )
      ).rows[0]?.count
    ).toBe("1");
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM analytics_project_identity_revocations WHERE context_id=$1",
          [created.context.context_id]
        )
      ).rows[0]?.count
    ).toBe("1");
    expect(
      (
        await pool.query(
          `SELECT count(*) FROM analytics_project_identity_epoch_revocations
           WHERE project_id=$1 AND writer_id=$2 AND producer_epoch=$3`,
          [projectId, writerId, producerEpoch]
        )
      ).rows[0]?.count
    ).toBe("1");
    expect(await revokeProjectAnalyticsIdentityContext(db, writerHash, revocation)).toMatchObject({
      kind: "revoked",
      receipt: { replayed: true }
    });
    expect(
      await revokeProjectAnalyticsIdentityContext(db, writerHash, {
        ...revocation,
        binding_hash: `sha256:${"b".repeat(64)}`
      })
    ).toEqual({ kind: "unavailable" });
    expect(
      await resolveProjectAnalyticsIdentityContext(db, writerHash, {
        contextId: created.context.context_id,
        producerEpoch,
        bindingHash
      })
    ).toBeNull();
    await pool.query("UPDATE project_analytics_settings SET enabled=true WHERE project_id=$1", [
      projectId
    ]);
    expect(
      await createProjectAnalyticsIdentityContext(db, writerHash, {
        ...request,
        idempotency_key: randomUUID()
      })
    ).toEqual({ kind: "unavailable" });
    await pool.query("DELETE FROM projects WHERE id=$1", [projectId]);
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM analytics_project_identity_revocations WHERE context_id=$1",
          [created.context.context_id]
        )
      ).rows[0]?.count
    ).toBe("0");
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM analytics_project_identity_epoch_revocations WHERE project_id=$1",
          [projectId]
        )
      ).rows[0]?.count
    ).toBe("0");
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM analytics_project_identity_associations WHERE project_id=$1",
          [projectId]
        )
      ).rows[0]?.count
    ).toBe("0");
  });

  it("rejects relay context creation without custom or standard privacy and current namespace", async () => {
    await pool.query("UPDATE analytics_writers SET kind='relay' WHERE id=$1", [writerId]);
    const request = {
      producer_epoch: randomUUID(),
      binding_hash: `sha256:${"f".repeat(64)}`,
      namespace_revision: 1,
      anonymous_id_hash: `sha256:${"a".repeat(64)}`,
      consent_granted: true as const,
      idempotency_key: randomUUID()
    };
    expect(await createProjectAnalyticsIdentityContext(db, writerHash, request)).toEqual({
      kind: "unavailable"
    });
    await pool.query(
      `INSERT INTO analytics_project_identity_namespaces(project_id,namespace_revision,key_fingerprint)
       VALUES($1,1,$2)`,
      [projectId, `sha256:${"e".repeat(64)}`]
    );
    expect(await createProjectAnalyticsIdentityContext(db, writerHash, request)).toEqual({
      kind: "unavailable"
    });
    await pool.query(
      "UPDATE project_analytics_settings SET privacy_mode='standard' WHERE project_id=$1",
      [projectId]
    );
    const created = await createProjectAnalyticsIdentityContext(db, writerHash, request);
    expect(created.kind).toBe("created");
    if (created.kind !== "created") return;
    await pool.query("UPDATE analytics_writers SET revoked_at=now() WHERE id=$1", [writerId]);
    expect(
      await resolveProjectAnalyticsIdentityContext(db, writerHash, {
        contextId: created.context.context_id,
        producerEpoch: request.producer_epoch,
        bindingHash: request.binding_hash
      })
    ).toBeNull();
    expect(
      await createProjectAnalyticsIdentityContext(db, writerHash, {
        ...request,
        idempotency_key: randomUUID()
      })
    ).toEqual({ kind: "unavailable" });
  });

  it("records an idempotent protected subject cutoff and fences its associated producer epoch", async () => {
    await pool.query("UPDATE analytics_writers SET kind='relay' WHERE id=$1", [writerId]);
    await pool.query(
      "UPDATE project_analytics_settings SET privacy_mode='custom' WHERE project_id=$1",
      [projectId]
    );
    await pool.query(
      `INSERT INTO analytics_project_identity_namespaces(project_id,namespace_revision,key_fingerprint)
       VALUES($1,1,$2)`,
      [projectId, `sha256:${"e".repeat(64)}`]
    );
    const contextRequest = {
      producer_epoch: randomUUID(),
      binding_hash: `sha256:${"f".repeat(64)}`,
      namespace_revision: 1,
      anonymous_id_hash: `sha256:${"a".repeat(64)}`,
      consent_granted: true as const,
      idempotency_key: randomUUID()
    };
    const created = await createProjectAnalyticsIdentityContext(db, writerHash, contextRequest);
    if (created.kind !== "created") throw new Error("context_missing");
    const userRef = `sha256:${"b".repeat(64)}`;
    expect(
      await associateProjectAnalyticsIdentityContext(db, writerHash, {
        context_id: created.context.context_id,
        producer_epoch: contextRequest.producer_epoch,
        binding_hash: contextRequest.binding_hash,
        namespace_revision: 1,
        anonymous_id_hash: contextRequest.anonymous_id_hash,
        user_id_hash: userRef,
        account_id_hash: null,
        consent_granted: true,
        idempotency_key: randomUUID()
      })
    ).toMatchObject({ kind: "associated" });
    const pendingContextRequest = {
      ...contextRequest,
      producer_epoch: randomUUID(),
      anonymous_id_hash: `sha256:${"d".repeat(64)}`,
      idempotency_key: randomUUID()
    };
    const pendingContext = await createProjectAnalyticsIdentityContext(
      db,
      writerHash,
      pendingContextRequest
    );
    if (pendingContext.kind !== "created") throw new Error("pending_context_missing");
    const olderAnonymousEvent = randomUUID();
    await pool.query(
      `INSERT INTO semantic_analytics_receipts(
         project_id,event_id,content_hash,raw_object_key,worker_job_id,principal,authority,
         scope,scope_revision,catalog_revision,identity_scope,identity_verification,
         namespace_revision,accepted_at,expires_at,occurred_at,
         identity_context_id,identity_writer_id,identity_producer_epoch,
         raw_status,raw_retention_outcome,raw_deleted_at)
       VALUES($1,$2,$3,$4,$5,'relay','client_observed',$6::jsonb,1,1,
         $6::jsonb,'project_anonymous',1,now(),now()+interval '30 days',now(),
         $7,$8,$9,'deleted','job_completed',now())`,
      [
        projectId,
        olderAnonymousEvent,
        `sha256:${"e".repeat(64)}`,
        `raw/${olderAnonymousEvent}`,
        "f".repeat(64),
        JSON.stringify({ kind: "project", project_id: projectId }),
        pendingContext.context.context_id,
        writerId,
        pendingContextRequest.producer_epoch
      ]
    );
    await pool.query(
      `INSERT INTO semantic_analytics_receipt_subjects(
         project_id,event_id,namespace_revision,subject_kind,subject_ref)
       VALUES($1,$2,1,'anonymous',$3)`,
      [projectId, olderAnonymousEvent, pendingContextRequest.anonymous_id_hash]
    );
    const erasure = {
      namespace_revision: 1,
      subject_kind: "user" as const,
      subject_ref: userRef,
      idempotency_key: randomUUID()
    };
    const requested = await requestProjectAnalyticsSubjectErasure(db, writerHash, erasure);
    expect(requested).toMatchObject({
      kind: "accepted",
      receipt: { status: "pending", replayed: false }
    });
    if (requested.kind !== "accepted") return;
    const subjectLookup = {
      projectId,
      namespaceRevision: 1,
      subjectRefs: [{ kind: "anonymous" as const, ref: contextRequest.anonymous_id_hash }]
    };
    expect(
      await hasProjectAnalyticsSubjectErasureFence(db, {
        ...subjectLookup,
        occurredAt: new Date(Date.parse(requested.receipt.cutoff_at) - 1).toISOString()
      })
    ).toBe(true);
    expect(
      await hasProjectAnalyticsSubjectErasureFence(db, {
        ...subjectLookup,
        occurredAt: new Date(Date.parse(requested.receipt.cutoff_at) + 1).toISOString()
      })
    ).toBe(false);
    expect(await requestProjectAnalyticsSubjectErasure(db, writerHash, erasure)).toMatchObject({
      kind: "accepted",
      receipt: { task_id: requested.receipt.task_id, replayed: true }
    });
    expect(
      await requestProjectAnalyticsSubjectErasure(db, writerHash, {
        ...erasure,
        subject_ref: `sha256:${"c".repeat(64)}`
      })
    ).toEqual({ kind: "conflict" });
    expect(
      (
        await pool.query(
          `SELECT count(*) FROM analytics_project_identity_epoch_revocations
           WHERE project_id=$1 AND writer_id=$2 AND producer_epoch=$3`,
          [projectId, writerId, contextRequest.producer_epoch]
        )
      ).rows[0]?.count
    ).toBe("1");
    expect(
      await createProjectAnalyticsIdentityContext(db, writerHash, {
        ...contextRequest,
        idempotency_key: randomUUID()
      })
    ).toEqual({ kind: "unavailable" });
    expect(
      await associateProjectAnalyticsIdentityContext(db, writerHash, {
        context_id: pendingContext.context.context_id,
        producer_epoch: pendingContextRequest.producer_epoch,
        binding_hash: pendingContextRequest.binding_hash,
        namespace_revision: 1,
        anonymous_id_hash: pendingContextRequest.anonymous_id_hash,
        user_id_hash: userRef,
        account_id_hash: null,
        consent_granted: true,
        idempotency_key: randomUUID()
      })
    ).toEqual({ kind: "unavailable" });
    expect(
      await createProjectAnalyticsIdentityContext(db, writerHash, {
        ...contextRequest,
        producer_epoch: randomUUID(),
        idempotency_key: randomUUID()
      })
    ).toMatchObject({ kind: "created" });
    const freshAnonymousContext = await createProjectAnalyticsIdentityContext(db, writerHash, {
      ...pendingContextRequest,
      producer_epoch: randomUUID(),
      idempotency_key: randomUUID()
    });
    if (freshAnonymousContext.kind !== "created") throw new Error("fresh_context_missing");
    expect(
      await associateProjectAnalyticsIdentityContext(db, writerHash, {
        context_id: freshAnonymousContext.context.context_id,
        producer_epoch: freshAnonymousContext.context.producer_epoch,
        binding_hash: pendingContextRequest.binding_hash,
        namespace_revision: 1,
        anonymous_id_hash: pendingContextRequest.anonymous_id_hash,
        user_id_hash: userRef,
        account_id_hash: null,
        consent_granted: true,
        idempotency_key: randomUUID()
      })
    ).toEqual({ kind: "unavailable" });
    await pool.query("DELETE FROM projects WHERE id=$1", [projectId]);
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM analytics_project_subject_erasures WHERE project_id=$1",
          [projectId]
        )
      ).rows[0]?.count
    ).toBe("0");
  });
});
