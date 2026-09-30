import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import {
  applySpaceAnalyticsIdentityNamespaceChange,
  previewSpaceAnalyticsIdentityNamespaceChange
} from "../../packages/storage/src/analytics-space-identity-namespace-store.js";
import { createAnalyticsSpaceStore } from "../../packages/storage/src/analytics-space-store.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("connected space namespace forward upgrade", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  afterAll(async () => pool.end());

  it("preserves a populated connected space and requires the new migration before use", async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    const organizationId = randomUUID();
    const siteProjectId = randomUUID();
    const appProjectId = randomUUID();
    const { ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId: siteProjectId,
      organizationName: "Existing organization",
      organizationSlug: `existing-${organizationId}`,
      projectName: "Site",
      projectSlug: "site",
      organizationPlan: "team"
    });
    await pool.query(
      `INSERT INTO projects(id,organization_id,owner_user_id,name,slug,environment_default)
       VALUES($1,$2,$3,'App','app','test')`,
      [appProjectId, organizationId, ownerUserId]
    );
    const spaces = createAnalyticsSpaceStore(db);
    const change = {
      action: "save" as const,
      mutation: {
        organization_id: organizationId,
        display_name: "Existing connected space",
        mode: "connected" as const,
        expected_revision: 0,
        idempotency_key: randomUUID(),
        project_ids: [siteProjectId, appProjectId]
      }
    };
    const preview = await spaces.preview({ actorUserId: ownerUserId, spaceId: null, change });
    if (preview.kind !== "preview") throw new Error("space preview fixture rejected");
    const created = await spaces.apply({
      actorUserId: ownerUserId,
      spaceId: null,
      change,
      previewHash: preview.preview.preview_hash
    });
    if (created.kind !== "applied") throw new Error("space fixture rejected");
    const spaceId = created.space.id;
    await pool.query("DROP TABLE analytics_space_identity_namespace_mutations");
    await pool.query(
      `ALTER TABLE analytics_spaces
       DROP CONSTRAINT analytics_spaces_identity_namespace_check,
       DROP COLUMN namespace_source_project_ids,
       DROP COLUMN namespace_key_fingerprint,
       DROP COLUMN namespace_activated_at,
       DROP COLUMN namespace_revoked_at`
    );
    const migrationId = "202609280026_bind_analytics_space_identity_namespace";
    await pool.query("DELETE FROM storage_migration_ledger WHERE id=$1", [migrationId]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      `storage_schema_missing_migrations: ${migrationId}`
    );
    expect((await migrateStorageSchema(db)).applied).toEqual([migrationId]);
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect(
      (
        await pool.query(
          "SELECT namespace_revision,namespace_source_project_ids FROM analytics_spaces WHERE id=$1",
          [spaceId]
        )
      ).rows[0]
    ).toEqual({ namespace_revision: null, namespace_source_project_ids: null });
    expect((await spaces.read({ actorUserId: ownerUserId, spaceId }))?.project_ids).toEqual(
      [siteProjectId, appProjectId].sort()
    );
    const namespaceChange = {
      actorUserId: ownerUserId,
      spaceId,
      action: "configure" as const,
      expectedRevision: 0,
      idempotencyKey: randomUUID(),
      keyFingerprint: `sha256:${"a".repeat(64)}`
    };
    const reviewed = await previewSpaceAnalyticsIdentityNamespaceChange(db, namespaceChange);
    if (reviewed.kind !== "preview") throw new Error("namespace preview rejected");
    expect(
      await applySpaceAnalyticsIdentityNamespaceChange(db, {
        ...namespaceChange,
        previewHash: reviewed.preview.preview_hash
      })
    ).toMatchObject({ kind: "applied", namespace: { namespace_revision: 1 } });
  });
});
