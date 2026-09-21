import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { hashToken, validateAgentToken, validateMemberToken, validateProjectToken } from "../../packages/auth/src/index.js";
import { createAgentTokenStore } from "../../packages/storage/src/agent-token-store.js";
import { createIntegrationPool, createQueryable, runIntegration, seedOwnedProject } from "../helpers/integration-setup.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";

runIntegration("agent credential database boundary", () => {
  const pool = createIntegrationPool();
  afterAll(async () => pool.end());

  it("stores only hashes, restricts project and issuer, and revokes without broad-token promotion", async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    const db = createQueryable(pool);
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    const organizationId = randomUUID();
    const projectId = randomUUID();
    const otherProjectId = randomUUID();
    const { ownerUserId } = await seedOwnedProject({ pool, organizationId, projectId,
      organizationName: "Agent test", organizationSlug: "agent-test", projectName: "API", projectSlug: "api" });
    await pool.query("INSERT INTO projects (id, organization_id, owner_user_id, name, slug, environment_default) VALUES ($1,$2,$3,'Other','other','production')",
      [otherProjectId, organizationId, ownerUserId]);
    const store = createAgentTokenStore(db);
    const created = await store.create({ projectId, actorUserId: ownerUserId, label: "Read only",
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() });
    expect(created?.plaintext).toMatch(/^dbundle_agent_/);
    const raw = await pool.query<{ token_hash: string }>("SELECT token_hash FROM agent_tokens WHERE id = $1", [created?.token_id]);
    expect(raw.rows[0]?.token_hash).toBe(hashToken(created!.plaintext));
    expect(JSON.stringify(raw.rows)).not.toContain(created!.plaintext);
    const resolve = (hash: string) => store.resolveByTokenHash(hash);
    expect((await validateAgentToken(created!.plaintext, resolve)).ok).toBe(true);
    expect((await validateMemberToken(created!.plaintext, async () => null)).ok).toBe(false);
    expect((await validateProjectToken(created!.plaintext, async () => null)).ok).toBe(false);
    expect((await store.list({ projectId: otherProjectId, actorUserId: ownerUserId }))?.length).toBe(0);
    expect(await store.revoke({ projectId: otherProjectId, actorUserId: ownerUserId, tokenId: created!.token_id })).toBeNull();
    // A redundant project membership must not bypass the issuer's suspended membership.
    await pool.query("INSERT INTO project_members (id, project_id, user_id, role) VALUES ($1,$2,$3,'admin')",
      [randomUUID(), projectId, ownerUserId]);
    await pool.query("UPDATE organization_members SET suspended_at = now() WHERE user_id = $1", [ownerUserId]);
    expect(await store.resolveByTokenHash(hashToken(created!.plaintext))).toBeNull();
    expect(await store.create({ projectId, actorUserId: ownerUserId, label: "blocked",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString() })).toBeNull();
    await pool.query("UPDATE organization_members SET suspended_at = NULL WHERE user_id = $1", [ownerUserId]);
    expect(await store.revoke({ projectId, actorUserId: ownerUserId, tokenId: created!.token_id })).not.toBeNull();
    expect(await validateAgentToken(created!.plaintext, resolve)).toMatchObject({ ok: false, error: "token_revoked" });
    await expect(pool.query("UPDATE agent_tokens SET scope = 'incident:write' WHERE id = $1", [created!.token_id])).rejects.toThrow();
  });
});
