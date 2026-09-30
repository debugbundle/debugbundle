import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import {
  applyProjectCatalogInTransaction,
  createAnalyticsProjectCatalogStore,
  type AnalyticsProjectCatalogChange
} from "../../packages/storage/src/analytics-project-catalog-store.js";
import { runInTransaction } from "../../packages/storage/src/transaction.js";
import type { AnalyticsCatalogEntry } from "../../packages/shared-types/src/index.js";
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

runIntegration("project semantic catalog revisions", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const store = createAnalyticsProjectCatalogStore(db);
  let organizationId: string;
  let projectId: string;
  let ownerUserId: string;
  beforeEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    organizationId = randomUUID();
    projectId = randomUUID();
    ({ ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Catalog",
      organizationSlug: "catalog",
      projectName: "Service",
      projectSlug: "service"
    }));
  });
  afterAll(async () => pool.end());

  const entry = (): AnalyticsCatalogEntry => ({
    name: "account.created",
    revision: 1,
    description: "Committed account creation",
    producers: ["server"],
    purpose: "business_measurement",
    success_boundary: "committed",
    properties: {},
    measurements: {},
    expected_producers: []
  });
  const change = (): AnalyticsProjectCatalogChange => ({
    actorUserId: ownerUserId,
    projectId,
    expectedRevision: 0,
    idempotencyKey: randomUUID(),
    entries: [entry()]
  });

  it("previews without writes, applies one immutable catalog revision and safely replays", async () => {
    const input = change();
    const preview = await store.preview(input);
    expect(preview.kind).toBe("preview");
    if (preview.kind !== "preview") throw new Error("catalog fixture rejected");
    expect(preview.preview).toMatchObject({
      project_id: projectId,
      expected_revision: 0,
      resulting_revision: 1,
      catalog_revision: 1,
      added_names: ["account.created"],
      removed_names: [],
      changed_names: [],
      already_applied: false
    });
    expect(
      (await pool.query("SELECT count(*) FROM analytics_project_catalogs")).rows[0]?.count
    ).toBe("0");
    const applied = await store.apply({ ...input, previewHash: preview.preview.preview_hash });
    expect(applied.kind).toBe("applied");
    if (applied.kind !== "applied") throw new Error("catalog apply rejected");
    expect(applied.replayed).toBe(false);
    expect(applied.catalog).toMatchObject({
      project_id: projectId,
      revision: 1,
      catalog_revision: 1
    });
    expect((await store.read({ projectId, actorUserId: ownerUserId }))?.entries).toEqual([entry()]);
    expect(await store.apply({ ...input, previewHash: preview.preview.preview_hash })).toEqual({
      kind: "applied",
      replayed: true,
      catalog: applied.catalog
    });
    expect(await store.preview(input)).toMatchObject({
      kind: "preview",
      preview: { already_applied: true, resulting_revision: 1 }
    });
    expect((await store.preview({ ...input, entries: [] })).kind).toBe("conflict");
    expect(
      (await pool.query("SELECT count(*) FROM analytics_project_catalog_revisions")).rows[0]?.count
    ).toBe("1");
  });

  it("rolls back a catalog change when its enclosing plan transaction fails", async () => {
    const input = change();
    const preview = await store.preview(input);
    if (preview.kind !== "preview") throw new Error("catalog fixture rejected");
    await expect(
      runInTransaction(db, async (tx) => {
        const applied = await applyProjectCatalogInTransaction(tx, {
          ...input,
          previewHash: preview.preview.preview_hash
        });
        expect(applied.kind).toBe("applied");
        throw new Error("plan transaction failed");
      })
    ).rejects.toThrow("plan transaction failed");
    for (const table of [
      "analytics_project_catalogs",
      "analytics_project_catalog_revisions",
      "analytics_project_catalog_entry_revisions"
    ]) {
      const result = await pool.query(`SELECT count(*) FROM ${table}`);
      expect(result.rows[0]?.count).toBe("0");
    }
    expect((await store.apply({ ...input, previewHash: preview.preview.preview_hash })).kind).toBe(
      "applied"
    );
  });

  it("rejects reuse of an entry revision with changed content and accepts an explicit successor", async () => {
    const first = change();
    const firstPreview = await store.preview(first);
    if (firstPreview.kind !== "preview") throw new Error("fixture rejected");
    expect(
      (await store.apply({ ...first, previewHash: firstPreview.preview.preview_hash })).kind
    ).toBe("applied");
    const changed = {
      ...change(),
      expectedRevision: 1,
      entries: [{ ...entry(), description: "Different meaning" }]
    };
    expect((await store.preview(changed)).kind).toBe("conflict");
    const revised = { ...changed, entries: [{ ...changed.entries[0]!, revision: 2 }] };
    const preview = await store.preview(revised);
    expect(preview.kind).toBe("preview");
    if (preview.kind !== "preview") throw new Error("successor rejected");
    expect(preview.preview.changed_names).toEqual(["account.created"]);
    expect(
      (await store.apply({ ...revised, previewHash: preview.preview.preview_hash })).kind
    ).toBe("applied");
    expect(
      (
        await pool.query(
          "SELECT revision FROM analytics_project_catalog_entry_revisions ORDER BY revision"
        )
      ).rows
    ).toEqual([{ revision: "1" }, { revision: "2" }]);
    expect(
      (
        await store.preview({
          ...change(),
          expectedRevision: 2,
          entries: [entry()]
        })
      ).kind
    ).toBe("conflict");
  });

  it("requires current management access and an applied forward migration", async () => {
    const input = change();
    expect((await store.preview({ ...input, actorUserId: randomUUID() })).kind).toBe("forbidden");
    await pool.query("DELETE FROM storage_migration_ledger WHERE id=$1", [
      "202609280003_add_analytics_project_catalogs"
    ]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
  });

  it("intersects catalog property capacity with both the tier and project setting", async () => {
    const input = change();
    input.entries[0]!.properties = {
      method: { type: "enum", values: ["email"], required: true },
      invited: { type: "boolean", required: false }
    };
    expect((await store.preview(input)).kind).toBe("capacity_exceeded");
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [organizationId]);
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,max_custom_dimensions) VALUES($1,1)",
      [projectId]
    );
    expect((await store.preview(input)).kind).toBe("capacity_exceeded");
    await pool.query(
      "UPDATE project_analytics_settings SET max_custom_dimensions=2 WHERE project_id=$1",
      [projectId]
    );
    expect((await store.preview(input)).kind).toBe("preview");
  });

  it("serializes competing revisions and rejects unsafe catalog metadata", async () => {
    const unsafe = change();
    unsafe.entries[0]!.description = "dbundle_anl_SYNTHETIC_PRIVATE_CREDENTIAL";
    expect((await store.preview(unsafe)).kind).toBe("invalid");
    const left = change();
    const right = change();
    right.entries[0]!.name = "account.activated";
    const leftPreview = await store.preview(left);
    const rightPreview = await store.preview(right);
    if (leftPreview.kind !== "preview" || rightPreview.kind !== "preview")
      throw new Error("catalog fixtures rejected");
    const outcomes = await Promise.all([
      store.apply({ ...left, previewHash: leftPreview.preview.preview_hash }),
      store.apply({ ...right, previewHash: rightPreview.preview.preview_hash })
    ]);
    expect(outcomes.map((result) => result.kind).sort()).toEqual(["applied", "conflict"]);
    expect(
      (await pool.query("SELECT count(*) FROM analytics_project_catalog_revisions")).rows[0]?.count
    ).toBe("1");
  });

  it("rejects malformed changes and mismatched review hashes without writing", async () => {
    const input = change();
    expect(await store.read({ projectId, actorUserId: ownerUserId })).toBeNull();
    expect(await store.read({ projectId: "malformed", actorUserId: ownerUserId })).toBeNull();
    expect((await store.preview({ ...input, projectId: "malformed" })).kind).toBe("invalid");
    expect((await store.apply({ ...input, previewHash: "wrong" })).kind).toBe("conflict");
    expect(
      (await store.apply({ ...input, projectId: "malformed", previewHash: "wrong" })).kind
    ).toBe("invalid");
    expect(
      (await pool.query("SELECT count(*) FROM analytics_project_catalogs")).rows[0]?.count
    ).toBe("0");
  });

  it("keeps the catalog revision stable for an unchanged declaration", async () => {
    const first = change();
    const firstPreview = await store.preview(first);
    if (firstPreview.kind !== "preview") throw new Error("fixture rejected");
    expect(
      (await store.apply({ ...first, previewHash: firstPreview.preview.preview_hash })).kind
    ).toBe("applied");
    const same = { ...change(), expectedRevision: 1 };
    const secondPreview = await store.preview(same);
    expect(secondPreview.kind).toBe("preview");
    if (secondPreview.kind !== "preview") throw new Error("repeat declaration rejected");
    expect(secondPreview.preview.catalog_revision).toBe(1);
    const second = await store.apply({ ...same, previewHash: secondPreview.preview.preview_hash });
    expect(second.kind === "applied" ? second.catalog : null).toMatchObject({
      revision: 2,
      catalog_revision: 1
    });
    expect(
      (await pool.query("SELECT count(*) FROM analytics_project_catalog_entry_revisions")).rows[0]
        ?.count
    ).toBe("1");
  });
});
