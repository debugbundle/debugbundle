import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { createAnalyticsWriterStore } from "../../packages/storage/src/analytics-writer-store.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  migrateStorageSchema,
  assertStorageSchemaMigrationsApplied
} from "../../packages/storage/src/schema-migrations.js";
import { hashToken, validateAnalyticsWriterToken } from "../../packages/auth/src/index.js";
import type { AnalyticsWriterChange } from "../../packages/shared-types/src/index.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("analytics writer credential ownership", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const store = createAnalyticsWriterStore(db);
  let projectId: string, organizationId: string, ownerUserId: string;
  beforeEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    projectId = randomUUID();
    organizationId = randomUUID();
    ({ ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Product",
      organizationSlug: "product",
      projectName: "Billing",
      projectSlug: "billing"
    }));
  });
  afterAll(async () => pool.end());
  const create = (revision = 0): AnalyticsWriterChange => ({
    action: "create",
    mutation: {
      kind: "server",
      display_name: "Billing worker",
      expires_in_days: 90,
      expected_revision: revision,
      idempotency_key: randomUUID()
    }
  });
  const input = (change: AnalyticsWriterChange) => ({
    projectId,
    actorUserId: ownerUserId,
    change
  });
  async function apply(change: AnalyticsWriterChange) {
    const preview = await store.preview(input(change));
    if (preview.kind !== "preview") return preview;
    return store.apply({ ...input(change), previewHash: preview.preview.preview_hash });
  }

  it("previews without writing, stores only hashes and never recovers plaintext on replay", async () => {
    const change = create();
    const preview = await store.preview(input(change));
    expect(preview.kind).toBe("preview");
    expect((await pool.query("SELECT count(*) FROM analytics_writers")).rows[0].count).toBe("0");
    expect((await pool.query("SELECT count(*) FROM analytics_writer_state")).rows[0].count).toBe(
      "0"
    );
    const created = await apply(change);
    expect(created.kind).toBe("applied");
    if (created.kind !== "applied" || created.result.disposition !== "issued")
      throw new Error("fixture rejected");
    expect(created.result.revision).toBe(1);
    const stored = (await pool.query("SELECT token_hash FROM analytics_writers")).rows[0];
    expect(stored.token_hash).toBe(hashToken(created.result.plaintext));
    const mutations = await pool.query(
      "SELECT row_to_json(m) AS value FROM analytics_writer_mutations m"
    );
    expect(JSON.stringify(mutations.rows)).not.toContain(created.result.plaintext);
    expect(await apply(change)).toEqual({
      kind: "applied",
      result: {
        disposition: "secret_unavailable",
        revision: 1,
        replayed: true,
        writer: created.result.writer
      }
    });
    const listing = await store.list({ projectId, actorUserId: ownerUserId });
    expect(listing?.writers).toEqual([created.result.writer]);
    expect(JSON.stringify(listing)).not.toContain(created.result.plaintext);
    await expect(
      validateAnalyticsWriterToken(created.result.plaintext, store.resolveByTokenHash)
    ).resolves.toMatchObject({ ok: true, context: { project_id: projectId, kind: "server" } });
  });

  it("serializes concurrent creation and enforces preview/revision/idempotency correspondence", async () => {
    const change = create();
    const [a, b] = await Promise.all([apply(change), apply(change)]);
    expect([a.kind, b.kind]).toEqual(["applied", "applied"]);
    if (a.kind !== "applied" || b.kind !== "applied") throw new Error("fixture rejected");
    expect(new Set([a.result.disposition, b.result.disposition])).toEqual(
      new Set(["issued", "secret_unavailable"])
    );
    expect(a.result.writer.id).toBe(b.result.writer.id);
    expect((await pool.query("SELECT count(*) FROM analytics_writers")).rows[0].count).toBe("1");
    expect(await apply(create(0))).toEqual({ kind: "conflict" });
    expect(await store.apply({ ...input(create(1)), previewHash: "0".repeat(64) })).toEqual({
      kind: "conflict"
    });
    if (change.action !== "create") throw new Error("fixture rejected");
    expect(
      await apply({ ...change, mutation: { ...change.mutation, display_name: "Changed" } })
    ).toEqual({ kind: "conflict" });
  });

  it("revokes admission immediately, supports safe replay and rejects source/actor impersonation", async () => {
    const created = await apply(create());
    if (created.kind !== "applied" || created.result.disposition !== "issued")
      throw new Error("fixture rejected");
    const change: AnalyticsWriterChange = {
      action: "revoke",
      mutation: {
        writer_id: created.result.writer.id,
        expected_revision: 1,
        idempotency_key: randomUUID()
      }
    };
    expect(await store.preview({ ...input(change), actorUserId: randomUUID() })).toEqual({
      kind: "forbidden"
    });
    expect(await store.list({ projectId, actorUserId: randomUUID() })).toBeNull();
    const revoked = await apply(change);
    expect(revoked).toMatchObject({
      kind: "applied",
      result: { disposition: "revoked", revision: 2, replayed: false }
    });
    await expect(
      validateAnalyticsWriterToken(created.result.plaintext, store.resolveByTokenHash)
    ).resolves.toMatchObject({ ok: false });
    expect(await apply(change)).toMatchObject({
      kind: "applied",
      result: { disposition: "revoked", revision: 2, replayed: true }
    });
    expect((await store.list({ projectId, actorUserId: ownerUserId }))?.writers).toEqual([]);
  });

  it("keeps relay authority separate and fences suspended/deleted owning projects", async () => {
    const change = create();
    if (change.action !== "create") throw new Error("fixture rejected");
    change.mutation.kind = "relay";
    const created = await apply(change);
    if (created.kind !== "applied" || created.result.disposition !== "issued")
      throw new Error("fixture rejected");
    await expect(
      validateAnalyticsWriterToken(created.result.plaintext, store.resolveByTokenHash)
    ).resolves.toEqual({ ok: false, error: "invalid_token" });
    await expect(
      validateAnalyticsWriterToken(created.result.plaintext, store.resolveByTokenHash, {
        allowedKinds: ["relay"]
      })
    ).resolves.toMatchObject({ ok: true, context: { kind: "relay" } });
    await pool.query("UPDATE organizations SET suspended_at=now() WHERE id=$1", [organizationId]);
    expect(await store.resolveByTokenHash(hashToken(created.result.plaintext))).toBeNull();
    expect(await store.list({ projectId, actorUserId: ownerUserId })).toBeNull();
    await pool.query("DELETE FROM projects WHERE id=$1", [projectId]);
    expect((await pool.query("SELECT count(*) FROM analytics_writers")).rows[0].count).toBe("0");
    expect(await store.resolveByTokenHash(hashToken(created.result.plaintext))).toBeNull();
  });

  it("enforces ten active writers and still permits revocation at the creation revision ceiling", async () => {
    for (let revision = 0; revision < 10; revision++)
      expect((await apply(create(revision))).kind).toBe("applied");
    expect(await apply(create(10))).toEqual({ kind: "capacity_exceeded" });
    const listing = await store.list({ projectId, actorUserId: ownerUserId });
    expect(listing?.writers).toHaveLength(10);
    await pool.query("UPDATE analytics_writer_state SET revision=1000 WHERE project_id=$1", [
      projectId
    ]);
    expect(await apply(create(1000))).toEqual({ kind: "capacity_exceeded" });
    const revoke: AnalyticsWriterChange = {
      action: "revoke",
      mutation: {
        writer_id: listing!.writers[0]!.id,
        expected_revision: 1000,
        idempotency_key: randomUUID()
      }
    };
    expect(await apply(revoke)).toMatchObject({
      kind: "applied",
      result: { disposition: "revoked", revision: 1001 }
    });
    expect((await store.list({ projectId, actorUserId: ownerUserId }))?.writers).toHaveLength(9);
  });

  it("rolls back credential and revision ownership when the management receipt cannot persist", async () => {
    const change = create();
    await pool.query(`CREATE FUNCTION reject_writer_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic_writer_receipt_failure'; END $$`);
    await pool.query(`CREATE TRIGGER reject_writer_receipt BEFORE INSERT ON analytics_writer_mutations
      FOR EACH ROW EXECUTE FUNCTION reject_writer_receipt()`);
    await expect(apply(change)).rejects.toThrow("synthetic_writer_receipt_failure");
    expect((await pool.query("SELECT count(*) FROM analytics_writers")).rows[0].count).toBe("0");
    expect((await pool.query("SELECT count(*) FROM analytics_writer_state")).rows[0].count).toBe(
      "0"
    );
    await pool.query("DROP TRIGGER reject_writer_receipt ON analytics_writer_mutations");
    expect((await apply(change)).kind).toBe("applied");
  });

  it("protects labels before preview/persistence and frees expired capacity without extending a credential", async () => {
    const change = create();
    if (change.action !== "create") throw new Error("fixture rejected");
    const secret = `dbundle_anl_${"a".repeat(43)}`;
    change.mutation.display_name = `Worker ${secret}`;
    const preview = await store.preview(input(change));
    expect(JSON.stringify(preview)).not.toContain(secret);
    const created = await apply(change);
    if (created.kind !== "applied" || created.result.disposition !== "issued")
      throw new Error("fixture rejected");
    expect(created.result.writer.display_name).toBe("Worker [REDACTED]");
    await pool.query(
      "UPDATE analytics_writers SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=$1",
      [created.result.writer.id]
    );
    expect((await store.list({ projectId, actorUserId: ownerUserId }))?.writers).toEqual([]);
    await expect(
      validateAnalyticsWriterToken(created.result.plaintext, store.resolveByTokenHash)
    ).resolves.toEqual({ ok: false, error: "token_expired" });
    expect((await apply(create(1))).kind).toBe("applied");
    expect(await store.preview({ ...input(create()), projectId: randomUUID() })).toEqual({
      kind: "forbidden"
    });
    expect(await store.preview({ ...input(create()), actorUserId: "bad" })).toEqual({
      kind: "invalid"
    });
    expect(
      await store.apply({ ...input(create()), projectId: "bad", previewHash: "0".repeat(64) })
    ).toEqual({ kind: "invalid" });
    expect(await store.list({ projectId: "bad", actorUserId: ownerUserId })).toBeNull();
    expect(await store.resolveByTokenHash("bad")).toBeNull();
  });

  it("requires the real forward migration before runtime readiness", async () => {
    await pool.query(
      "DROP TABLE analytics_writer_mutations,analytics_writers,analytics_writer_state CASCADE"
    );
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202609280002_add_analytics_writers'"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
    expect((await migrateStorageSchema(db)).applied).toContain(
      "202609280002_add_analytics_writers"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect((await apply(create())).kind).toBe("applied");
  });

  it("does not let a redundant collaborator row bypass a removed owner's organization membership", async () => {
    const created = await apply(create());
    if (created.kind !== "applied" || created.result.disposition !== "issued")
      throw new Error("fixture rejected");
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'admin')",
      [randomUUID(), projectId, ownerUserId]
    );
    await pool.query("DELETE FROM organization_members WHERE organization_id=$1 AND user_id=$2", [
      organizationId,
      ownerUserId
    ]);
    expect(await store.resolveByTokenHash(hashToken(created.result.plaintext))).toBeNull();
    expect(await store.preview(input(create(1)))).toEqual({ kind: "forbidden" });
  });

  it("rechecks collaborator management and sharing entitlement for both reads and admission", async () => {
    const admin = randomUUID();
    await pool.query("INSERT INTO users(id,email) VALUES($1,'writer-admin@example.test')", [admin]);
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'member')",
      [randomUUID(), organizationId, admin]
    );
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'admin')",
      [randomUUID(), projectId, admin]
    );
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [organizationId]);
    const request = { projectId, actorUserId: admin, change: create() };
    const preview = await store.preview(request);
    if (preview.kind !== "preview") throw new Error("fixture rejected");
    const created = await store.apply({ ...request, previewHash: preview.preview.preview_hash });
    if (created.kind !== "applied" || created.result.disposition !== "issued")
      throw new Error("fixture rejected");
    const tokenHash = hashToken(created.result.plaintext);
    expect(await store.resolveByTokenHash(tokenHash)).not.toBeNull();
    await pool.query("UPDATE organizations SET plan='free' WHERE id=$1", [organizationId]);
    expect(await store.resolveByTokenHash(tokenHash)).toBeNull();
    expect(await store.list({ projectId, actorUserId: admin })).toBeNull();
    expect((await store.list({ projectId, actorUserId: ownerUserId }))?.writers).toHaveLength(1);
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [organizationId]);
    await pool.query(
      "UPDATE project_members SET role='member' WHERE project_id=$1 AND user_id=$2",
      [projectId, admin]
    );
    expect(await store.resolveByTokenHash(tokenHash)).toBeNull();
    expect(await store.preview({ ...request, change: create(1) })).toEqual({ kind: "forbidden" });
    await pool.query("UPDATE project_members SET role='admin' WHERE project_id=$1 AND user_id=$2", [
      projectId,
      admin
    ]);
    await pool.query(
      "UPDATE organization_members SET suspended_at=now() WHERE organization_id=$1 AND user_id=$2",
      [organizationId, admin]
    );
    expect(await store.resolveByTokenHash(tokenHash)).toBeNull();
    expect(await store.list({ projectId, actorUserId: admin })).toBeNull();
  });
});
