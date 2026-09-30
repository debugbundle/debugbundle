import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { createAnalyticsSpaceStore } from "../../packages/storage/src/analytics-space-store.js";
import {
  applySpaceAnalyticsIdentityNamespaceChange,
  previewSpaceAnalyticsIdentityNamespaceChange,
  readSpaceAnalyticsIdentityNamespace
} from "../../packages/storage/src/analytics-space-identity-namespace-store.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("connected analytics space identity namespace", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  let organizationId: string;
  let ownerUserId: string;
  let siteProjectId: string;
  let appProjectId: string;
  let spaceId: string;

  beforeEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    organizationId = randomUUID();
    siteProjectId = randomUUID();
    appProjectId = randomUUID();
    ({ ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId: siteProjectId,
      organizationName: "Growth",
      organizationSlug: `growth-${organizationId}`,
      projectName: "Site",
      projectSlug: "site",
      organizationPlan: "team"
    }));
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
        display_name: "Connected product",
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
    if (created.kind !== "applied") throw new Error("connected space fixture rejected");
    spaceId = created.space.id;
  });

  afterAll(async () => pool.end());

  const fingerprint = (character: string): string => `sha256:${character.repeat(64)}`;
  const configure = (revision: number, character: string) => ({
    actorUserId: ownerUserId,
    spaceId,
    action: "configure" as const,
    expectedRevision: revision,
    idempotencyKey: randomUUID(),
    keyFingerprint: fingerprint(character)
  });

  it("reviews, applies and replays an active space namespace without storing a key", async () => {
    const change = configure(0, "a");
    const preview = await previewSpaceAnalyticsIdentityNamespaceChange(db, change);
    expect(preview).toMatchObject({
      kind: "preview",
      preview: {
        space_id: spaceId,
        expected_revision: 0,
        resulting_revision: 1,
        source_project_ids: [appProjectId, siteProjectId].sort(),
        current_key_fingerprint: null,
        proposed_key_fingerprint: fingerprint("a")
      }
    });
    if (preview.kind !== "preview") return;
    const applied = await applySpaceAnalyticsIdentityNamespaceChange(db, {
      ...change,
      previewHash: preview.preview.preview_hash
    });
    expect(applied).toMatchObject({
      kind: "applied",
      replayed: false,
      namespace: {
        space_id: spaceId,
        namespace_revision: 1,
        key_fingerprint: fingerprint("a"),
        revoked_at: null
      }
    });
    expect(
      await applySpaceAnalyticsIdentityNamespaceChange(db, {
        ...change,
        previewHash: preview.preview.preview_hash
      })
    ).toMatchObject({ kind: "applied", replayed: true });
    expect(await readSpaceAnalyticsIdentityNamespace(db, ownerUserId, spaceId)).toMatchObject({
      space_id: spaceId,
      namespace_revision: 1
    });
    expect(
      (
        await pool.query("SELECT revision,namespace_revision FROM analytics_spaces WHERE id=$1", [
          spaceId
        ])
      ).rows[0]
    ).toEqual({ revision: "1", namespace_revision: "1" });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM analytics_space_identity_namespace_mutations"
        )
      ).rows[0]?.count
    ).toBe(1);
    await expect(
      pool.query("UPDATE analytics_spaces SET namespace_key_fingerprint=NULL WHERE id=$1", [
        spaceId
      ])
    ).rejects.toThrow("analytics_spaces_identity_namespace_check");
  });

  it("fences stale review, changed replay, rotation and revocation", async () => {
    const first = configure(0, "a");
    const reviewed = await previewSpaceAnalyticsIdentityNamespaceChange(db, first);
    if (reviewed.kind !== "preview") throw new Error("namespace preview rejected");
    expect(
      await applySpaceAnalyticsIdentityNamespaceChange(db, {
        ...first,
        keyFingerprint: fingerprint("b"),
        previewHash: reviewed.preview.preview_hash
      })
    ).toEqual({ kind: "conflict" });
    expect(
      await applySpaceAnalyticsIdentityNamespaceChange(db, {
        ...first,
        previewHash: reviewed.preview.preview_hash
      })
    ).toMatchObject({ kind: "applied", replayed: false });
    expect(await previewSpaceAnalyticsIdentityNamespaceChange(db, first)).toEqual({
      kind: "conflict"
    });
    expect(
      await applySpaceAnalyticsIdentityNamespaceChange(db, {
        ...first,
        keyFingerprint: fingerprint("b"),
        previewHash: reviewed.preview.preview_hash
      })
    ).toEqual({ kind: "conflict" });
    const rotate = configure(1, "b");
    const rotation = await previewSpaceAnalyticsIdentityNamespaceChange(db, rotate);
    if (rotation.kind !== "preview") throw new Error("rotation preview rejected");
    expect(rotation.preview.contexts_fenced).toBe(true);
    expect(
      await applySpaceAnalyticsIdentityNamespaceChange(db, {
        ...rotate,
        previewHash: rotation.preview.preview_hash
      })
    ).toMatchObject({ kind: "applied", namespace: { namespace_revision: 2 } });
    const revoke = {
      actorUserId: ownerUserId,
      spaceId,
      action: "revoke" as const,
      expectedRevision: 2,
      idempotencyKey: randomUUID()
    };
    const revocation = await previewSpaceAnalyticsIdentityNamespaceChange(db, revoke);
    if (revocation.kind !== "preview") throw new Error("revoke preview rejected");
    expect(
      await applySpaceAnalyticsIdentityNamespaceChange(db, {
        ...revoke,
        previewHash: revocation.preview.preview_hash
      })
    ).toMatchObject({ kind: "applied", namespace: { namespace_revision: 3 } });
    expect(await readSpaceAnalyticsIdentityNamespace(db, ownerUserId, spaceId)).toMatchObject({
      namespace_revision: 3,
      revoked_at: expect.any(String)
    });
  });

  it("requires a reviewed revision after the connected sources change", async () => {
    const original = configure(0, "a");
    const originalPreview = await previewSpaceAnalyticsIdentityNamespaceChange(db, original);
    if (originalPreview.kind !== "preview") throw new Error("namespace preview rejected");
    expect(
      await applySpaceAnalyticsIdentityNamespaceChange(db, {
        ...original,
        previewHash: originalPreview.preview.preview_hash
      })
    ).toMatchObject({ kind: "applied", namespace: { namespace_revision: 1 } });

    const rebind = configure(1, "b");
    const stalePreview = await previewSpaceAnalyticsIdentityNamespaceChange(db, rebind);
    if (stalePreview.kind !== "preview") throw new Error("namespace rebind preview rejected");
    const spaces = createAnalyticsSpaceStore(db);
    const spaceChange = {
      action: "save" as const,
      mutation: {
        organization_id: organizationId,
        display_name: "Connected product",
        mode: "connected" as const,
        expected_revision: 1,
        idempotency_key: randomUUID(),
        project_ids: [siteProjectId]
      }
    };
    const spacePreview = await spaces.preview({
      actorUserId: ownerUserId,
      spaceId,
      change: spaceChange
    });
    if (spacePreview.kind !== "preview") throw new Error("space edit preview rejected");
    expect(
      await spaces.apply({
        actorUserId: ownerUserId,
        spaceId,
        change: spaceChange,
        previewHash: spacePreview.preview.preview_hash
      })
    ).toMatchObject({ kind: "applied" });

    expect(await readSpaceAnalyticsIdentityNamespace(db, ownerUserId, spaceId)).toMatchObject({
      namespace_revision: 1,
      source_project_ids: [appProjectId, siteProjectId].sort()
    });
    expect(
      await applySpaceAnalyticsIdentityNamespaceChange(db, {
        ...rebind,
        previewHash: stalePreview.preview.preview_hash
      })
    ).toEqual({ kind: "conflict" });
    const currentRebind = configure(1, "a");
    const reviewed = await previewSpaceAnalyticsIdentityNamespaceChange(db, currentRebind);
    if (reviewed.kind !== "preview") throw new Error("current rebind preview rejected");
    expect(reviewed.preview.source_project_ids).toEqual([siteProjectId]);
    expect(
      await applySpaceAnalyticsIdentityNamespaceChange(db, {
        ...currentRebind,
        previewHash: reviewed.preview.preview_hash
      })
    ).toMatchObject({
      kind: "applied",
      namespace: { namespace_revision: 2, source_project_ids: [siteProjectId] }
    });
  });

  it("requires the current owner, connected mode and every source's authority", async () => {
    expect(await readSpaceAnalyticsIdentityNamespace(db, randomUUID(), spaceId)).toBeNull();
    expect(
      await previewSpaceAnalyticsIdentityNamespaceChange(db, {
        ...configure(0, "a"),
        actorUserId: randomUUID()
      })
    ).toEqual({ kind: "forbidden" });
    const change = configure(0, "a");
    const preview = await previewSpaceAnalyticsIdentityNamespaceChange(db, change);
    if (preview.kind !== "preview") throw new Error("namespace preview rejected");
    await pool.query("UPDATE analytics_spaces SET mode='portfolio' WHERE id=$1", [spaceId]);
    expect(
      await applySpaceAnalyticsIdentityNamespaceChange(db, {
        ...change,
        previewHash: preview.preview.preview_hash
      })
    ).toEqual({ kind: "forbidden" });
    await pool.query("UPDATE analytics_spaces SET mode='connected' WHERE id=$1", [spaceId]);
    const otherOwner = randomUUID();
    await pool.query("INSERT INTO users(id,email) VALUES($1,'other-owner@example.test')", [
      otherOwner
    ]);
    await pool.query("UPDATE projects SET owner_user_id=$2 WHERE id=$1", [
      appProjectId,
      otherOwner
    ]);
    expect(
      await applySpaceAnalyticsIdentityNamespaceChange(db, {
        ...change,
        previewHash: preview.preview.preview_hash
      })
    ).toEqual({ kind: "forbidden" });
  });
});
