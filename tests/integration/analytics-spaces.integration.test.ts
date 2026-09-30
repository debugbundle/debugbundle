import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { createAnalyticsSpaceStore } from "../../packages/storage/src/analytics-space-store.js";
import {
  bootstrapStorageSchema,
  prepareStorageBootstrap
} from "../../packages/storage/src/migrations.js";
import {
  assertStorageSchemaMigrationsApplied,
  seedStorageMigrationLedgerForCurrentSchema,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";
import type { AnalyticsSpaceMutation } from "../../packages/shared-types/src/index.js";

runIntegration("analytics space authorization and membership", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const store = createAnalyticsSpaceStore(db);
  async function mutate(input: {
    actorUserId: string;
    spaceId: string | null;
    mutation: AnalyticsSpaceMutation;
  }) {
    const changeInput = {
      actorUserId: input.actorUserId,
      spaceId: input.spaceId,
      change: { action: "save" as const, mutation: input.mutation }
    };
    const preview = await store.preview(changeInput);
    if (preview.kind !== "preview") return preview;
    return store.apply({ ...changeInput, previewHash: preview.preview.preview_hash });
  }
  let organizationId: string, projectId: string, secondProjectId: string, ownerUserId: string;
  beforeEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    organizationId = randomUUID();
    projectId = randomUUID();
    secondProjectId = randomUUID();
    ({ ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Product",
      organizationSlug: "product",
      projectName: "Site",
      projectSlug: "site"
    }));
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug,environment_default) VALUES($1,$2,$3,'App','app','test')",
      [secondProjectId, organizationId, ownerUserId]
    );
  });
  afterAll(async () => pool.end());
  const mutation = (): AnalyticsSpaceMutation => ({
    organization_id: organizationId,
    display_name: "Product growth",
    mode: "portfolio",
    expected_revision: 0,
    idempotency_key: randomUUID(),
    project_ids: [projectId, secondProjectId]
  });
  async function create(): Promise<string> {
    const result = await mutate({
      actorUserId: ownerUserId,
      spaceId: null,
      mutation: mutation()
    });
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") throw new Error("space fixture rejected");
    return result.space.id;
  }
  it("deduplicates creation and serializes revision changes without moving projects implicitly", async () => {
    const input = { actorUserId: ownerUserId, spaceId: null, mutation: mutation() };
    const [first, replay] = await Promise.all([mutate(input), mutate(input)]);
    expect(first.kind).toBe("applied");
    expect(replay.kind).toBe("applied");
    if (first.kind !== "applied" || replay.kind !== "applied") throw new Error("fixture rejected");
    expect(first.space.id).toBe(replay.space.id);
    expect(first.space).toEqual(replay.space);
    const upperReplay = await mutate({
      ...input,
      mutation: {
        ...input.mutation,
        organization_id: organizationId.toUpperCase(),
        idempotency_key: input.mutation.idempotency_key.toUpperCase(),
        project_ids: input.mutation.project_ids.map((id) => id.toUpperCase())
      }
    });
    expect(upperReplay).toEqual({ kind: "applied", replayed: true, space: first.space });
    expect((await pool.query("SELECT * FROM analytics_space_revisions")).rows).toHaveLength(1);
    expect(
      (
        await mutate({
          ...input,
          mutation: { ...input.mutation, display_name: "conflicting" }
        })
      ).kind
    ).toBe("conflict");
    expect((await mutate({ ...input, mutation: mutation() })).kind).toBe("project_already_linked");
    const update = {
      actorUserId: ownerUserId,
      spaceId: first.space.id,
      mutation: { ...mutation(), expected_revision: 1, project_ids: [projectId] }
    };
    const competingUpdate = {
      ...update,
      mutation: { ...update.mutation, idempotency_key: randomUUID() }
    };
    const outcomes = await Promise.all([mutate(update), mutate(competingUpdate)]);
    expect(outcomes.map((result) => result.kind).sort()).toEqual(["applied", "conflict"]);
    const updateReplay = await mutate(outcomes[0]?.kind === "applied" ? update : competingUpdate);
    const applied = outcomes.find((result) => result.kind === "applied");
    expect(updateReplay.kind === "applied" ? updateReplay.space : null).toEqual(
      applied?.kind === "applied" ? applied.space : null
    );
    expect(
      await store.authorizeSnapshot({
        spaceId: first.space.id,
        actorUserId: ownerUserId,
        revision: 1,
        sourceProjectIds: [projectId, secondProjectId]
      })
    ).toBe(false);
  });
  it("requires owning-organization authority and every source even on cached snapshot reads", async () => {
    const collaborator = randomUUID();
    await pool.query("INSERT INTO users(id,email) VALUES($1,'collaborator@example.test')", [
      collaborator
    ]);
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'member')",
      [randomUUID(), organizationId, collaborator]
    );
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'admin')",
      [randomUUID(), projectId, collaborator]
    );
    expect(
      (await mutate({ actorUserId: collaborator, spaceId: null, mutation: mutation() })).kind
    ).toBe("forbidden");
    const spaceId = await create();
    expect(await store.read({ spaceId, actorUserId: collaborator })).toBeNull();
    await expect(
      pool.query("UPDATE projects SET owner_user_id=NULL WHERE id=$1", [secondProjectId])
    ).rejects.toThrow("not-null constraint");
    expect(await store.read({ spaceId, actorUserId: collaborator })).toBeNull();
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'member')",
      [randomUUID(), secondProjectId, collaborator]
    );
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [organizationId]);
    expect(await store.read({ spaceId, actorUserId: collaborator })).not.toBeNull();
    await pool.query("UPDATE organizations SET plan='free' WHERE id=$1", [organizationId]);
    expect(await store.read({ spaceId, actorUserId: collaborator })).toBeNull();
    expect(await store.list({ organizationId, actorUserId: collaborator })).toEqual([]);
    expect(await store.read({ spaceId, actorUserId: ownerUserId })).not.toBeNull();
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [organizationId]);
    expect(
      await store.authorizeSnapshot({
        spaceId,
        actorUserId: collaborator,
        revision: 1,
        sourceProjectIds: [projectId]
      })
    ).toBe(false);
    await pool.query("UPDATE organization_members SET suspended_at=now() WHERE user_id=$1", [
      collaborator
    ]);
    expect(
      await store.authorizeSnapshot({
        spaceId,
        actorUserId: collaborator,
        revision: 1,
        sourceProjectIds: [projectId, secondProjectId]
      })
    ).toBe(false);
  });
  it("fails closed on malformed queued snapshot identifiers before database UUID casts", async () => {
    const spaceId = await create();
    expect(await store.read({ actorUserId: ownerUserId, spaceId: "malformed" })).toBeNull();
    expect(await store.list({ actorUserId: ownerUserId, organizationId: "malformed" })).toEqual([]);
    expect(
      await store.preview({
        actorUserId: "malformed",
        spaceId,
        change: { action: "save", mutation: { ...mutation(), expected_revision: 1 } }
      })
    ).toEqual({ kind: "invalid" });
    expect(
      await store.authorizeSnapshot({
        actorUserId: ownerUserId,
        spaceId: "malformed",
        revision: 1,
        sourceProjectIds: [projectId, secondProjectId]
      })
    ).toBe(false);
    expect(
      await store.authorizeSnapshot({
        actorUserId: ownerUserId,
        spaceId,
        revision: 1,
        sourceProjectIds: [projectId, "malformed"]
      })
    ).toBe(false);
    expect(
      await store.authorizeSnapshot({
        actorUserId: ownerUserId,
        spaceId,
        revision: 0,
        sourceProjectIds: [projectId, secondProjectId]
      })
    ).toBe(false);
  });
  it("rejects cross-organization binding in the service and direct database writes", async () => {
    const otherProject = randomUUID(),
      otherOrganization = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId: otherOrganization,
      projectId: otherProject,
      organizationName: "Other",
      organizationSlug: "other",
      projectName: "Other",
      projectSlug: "other"
    });
    const input = mutation();
    input.project_ids.push(otherProject);
    expect((await mutate({ actorUserId: ownerUserId, spaceId: null, mutation: input })).kind).toBe(
      "forbidden"
    );
    const spaceId = await create();
    await expect(
      pool.query("INSERT INTO analytics_space_projects(space_id,project_id) VALUES($1,$2)", [
        spaceId,
        otherProject
      ])
    ).rejects.toThrow("space_project_organization_mismatch");
    await expect(
      pool.query("UPDATE projects SET organization_id=$1 WHERE id=$2", [
        otherOrganization,
        projectId
      ])
    ).rejects.toThrow("space_project_organization_mismatch");
  });
  it("fences snapshots when a project is deleted without damaging remaining projects", async () => {
    const spaceId = await create();
    await pool.query("DELETE FROM projects WHERE id=$1", [secondProjectId]);
    const space = await store.read({ spaceId, actorUserId: ownerUserId });
    expect(space?.revision).toBe(2);
    expect(space?.project_ids).toEqual([projectId]);
    expect(
      await store.authorizeSnapshot({
        spaceId,
        actorUserId: ownerUserId,
        revision: 1,
        sourceProjectIds: [projectId, secondProjectId]
      })
    ).toBe(false);
    await pool.query("DELETE FROM projects WHERE id=$1", [projectId]);
    expect(await store.read({ spaceId, actorUserId: ownerUserId })).toBeNull();
  });
  it("rolls back membership and audit together on a persistence failure", async () => {
    await pool.query(
      "ALTER TABLE analytics_space_revisions ADD CONSTRAINT injected_failure CHECK (display_name <> 'reject_write')"
    );
    await expect(
      mutate({
        actorUserId: ownerUserId,
        spaceId: null,
        mutation: { ...mutation(), display_name: "reject_write" }
      })
    ).rejects.toThrow("injected_failure");
    expect((await pool.query("SELECT * FROM analytics_spaces")).rows).toHaveLength(0);
    expect((await pool.query("SELECT * FROM analytics_space_projects")).rows).toHaveLength(0);
    expect((await pool.query("SELECT * FROM analytics_space_revisions")).rows).toHaveLength(0);
  });
  it("previews without writes and binds apply to the reviewed actor, target, content and revision", async () => {
    const change = { action: "save" as const, mutation: mutation() };
    const input = { actorUserId: ownerUserId, spaceId: null, change };
    const preview = await store.preview(input);
    expect(preview.kind).toBe("preview");
    if (preview.kind !== "preview") throw new Error("preview rejected");
    expect(preview.preview.added_project_ids).toEqual([...change.mutation.project_ids].sort());
    expect((await pool.query("SELECT * FROM analytics_spaces")).rows).toHaveLength(0);
    const approved = { ...input, previewHash: preview.preview.preview_hash };
    expect(
      (
        await store.apply({
          ...approved,
          change: { ...change, mutation: { ...change.mutation, display_name: "unreviewed" } }
        })
      ).kind
    ).toBe("conflict");
    const result = await store.apply(approved);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") throw new Error("apply rejected");
    const updateInput = {
      actorUserId: ownerUserId,
      spaceId: result.space.id,
      change: {
        action: "save" as const,
        mutation: { ...mutation(), expected_revision: 1, project_ids: [projectId] }
      }
    };
    const updatePreview = await store.preview(updateInput);
    if (updatePreview.kind !== "preview") throw new Error("update preview rejected");
    expect(updatePreview.preview.removed_project_ids).toEqual([secondProjectId]);
    expect((await pool.query("SELECT * FROM analytics_space_revisions")).rows).toHaveLength(1);
    await pool.query("DELETE FROM projects WHERE id=$1", [secondProjectId]);
    expect(
      (await store.apply({ ...updateInput, previewHash: updatePreview.preview.preview_hash })).kind
    ).toBe("conflict");
    expect(
      (await store.read({ actorUserId: ownerUserId, spaceId: result.space.id }))?.revision
    ).toBe(2);
  });
  it("archives with an immutable audit, releases memberships and rechecks replay permissions", async () => {
    const spaceId = await create();
    const input = {
      actorUserId: ownerUserId,
      spaceId,
      change: {
        action: "archive" as const,
        mutation: {
          organization_id: organizationId,
          expected_revision: 1,
          idempotency_key: randomUUID()
        }
      }
    };
    const preview = await store.preview(input);
    if (preview.kind !== "preview") throw new Error("archive preview rejected");
    expect(preview.preview.removed_project_ids).toEqual([projectId, secondProjectId].sort());
    expect(await store.list({ actorUserId: ownerUserId, organizationId })).toHaveLength(1);
    const appliedInput = { ...input, previewHash: preview.preview.preview_hash };
    const archived = await store.apply(appliedInput);
    expect(archived.kind === "applied" && archived.space.archived).toBe(true);
    expect(await store.apply(appliedInput)).toEqual({ ...archived, replayed: true });
    expect(await store.list({ actorUserId: ownerUserId, organizationId })).toEqual([]);
    expect(await store.read({ actorUserId: ownerUserId, spaceId })).toBeNull();
    expect(
      await store.authorizeSnapshot({
        actorUserId: ownerUserId,
        spaceId,
        revision: 1,
        sourceProjectIds: [projectId, secondProjectId]
      })
    ).toBe(false);
    expect((await pool.query("SELECT * FROM analytics_space_projects")).rows).toHaveLength(0);
    expect(
      (await pool.query("SELECT * FROM projects WHERE organization_id=$1", [organizationId])).rows
    ).toHaveLength(2);
    expect(
      (await pool.query("SELECT * FROM analytics_space_revisions WHERE archived")).rows
    ).toHaveLength(1);
    // Archive frees source membership, never resurrects the old space or its namespace.
    expect(await create()).not.toBe(spaceId);
    await pool.query("UPDATE organization_members SET suspended_at=now() WHERE user_id=$1", [
      ownerUserId
    ]);
    expect((await store.apply(appliedInput)).kind).toBe("forbidden");
    expect(await store.list({ actorUserId: ownerUserId, organizationId })).toEqual([]);
  });
  it("rejects invalid, missing and over-capacity mutations without partial changes", async () => {
    const input = { actorUserId: ownerUserId, spaceId: null, mutation: mutation() };
    expect(
      (await mutate({ ...input, mutation: { ...input.mutation, display_name: "" } })).kind
    ).toBe("invalid");
    expect(
      (await mutate({ ...input, mutation: { ...input.mutation, expected_revision: 1 } })).kind
    ).toBe("conflict");
    expect((await mutate({ ...input, spaceId: randomUUID() })).kind).toBe("forbidden");
    const spaceId = await create();
    await pool.query("UPDATE analytics_spaces SET revision=1000 WHERE id=$1", [spaceId]);
    expect(
      (
        await mutate({
          ...input,
          spaceId,
          mutation: { ...mutation(), expected_revision: 1000 }
        })
      ).kind
    ).toBe("capacity_exceeded");
    await pool.query(
      `INSERT INTO analytics_spaces(id,organization_id,display_name,mode,revision)
      SELECT gen_random_uuid(),$1,'Reserved','portfolio',1 FROM generate_series(1,19)`,
      [organizationId]
    );
    expect((await mutate({ ...input, mutation: mutation() })).kind).toBe("capacity_exceeded");
    expect((await pool.query("SELECT * FROM analytics_space_revisions")).rows).toHaveLength(1);
    const archive = {
      actorUserId: ownerUserId,
      spaceId,
      change: {
        action: "archive" as const,
        mutation: {
          organization_id: organizationId,
          expected_revision: 1000,
          idempotency_key: randomUUID()
        }
      }
    };
    const preview = await store.preview(archive);
    if (preview.kind !== "preview") throw new Error("archive must remain available at capacity");
    const archived = await store.apply({ ...archive, previewHash: preview.preview.preview_hash });
    expect(archived.kind === "applied" && archived.space.revision).toBe(1001);
    expect(archived.kind === "applied" && archived.space.archived).toBe(true);
    expect(
      await store.authorizeSnapshot({
        actorUserId: ownerUserId,
        spaceId,
        revision: 1000,
        sourceProjectIds: [projectId, secondProjectId]
      })
    ).toBe(false);
    expect(await create()).not.toBe(spaceId);
  });
  it("upgrades a populated predecessor before readiness and keeps legacy source rows", async () => {
    await pool.query(
      "DROP TABLE analytics_space_revisions, analytics_space_projects, analytics_spaces CASCADE"
    );
    await pool.query("DROP TRIGGER IF EXISTS analytics_space_project_deleted ON projects");
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202609280001_add_analytics_spaces'"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "storage_schema_missing_migrations"
    );
    await expect(prepareStorageBootstrap(db)).resolves.toEqual({ status: "existing_schema" });
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "storage_schema_missing_migrations"
    );
    const client = await pool.connect();
    try {
      expect(
        (await migrateStorageSchema({ query: (sql, params) => client.query(sql, params) })).applied
      ).toEqual(["202609280001_add_analytics_spaces"]);
    } finally {
      client.release();
    }
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect(
      (await pool.query("SELECT id FROM projects WHERE organization_id=$1", [organizationId])).rows
    ).toHaveLength(2);
    expect((await pool.query("SELECT * FROM analytics_spaces")).rows).toHaveLength(0);
    // Matching tables alone cannot certify a pre-ledger schema with a missing deletion fence.
    await pool.query("DROP TRIGGER analytics_space_project_deleted ON projects");
    await pool.query("DELETE FROM storage_migration_ledger");
    const legacyClient = await pool.connect();
    try {
      const legacyDb = {
        query: (sql: string, params: unknown[]) => legacyClient.query(sql, params)
      };
      expect(await seedStorageMigrationLedgerForCurrentSchema(legacyDb)).toBe("not_current_schema");
      expect(
        (await legacyClient.query("SELECT id FROM storage_migration_ledger")).rows
      ).toHaveLength(0);
      expect((await migrateStorageSchema(legacyDb)).applied).toContain(
        "202609280001_add_analytics_spaces"
      );
    } finally {
      legacyClient.release();
    }
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect(
      (await pool.query("SELECT id FROM projects WHERE organization_id=$1", [organizationId])).rows
    ).toHaveLength(2);
  });
});
