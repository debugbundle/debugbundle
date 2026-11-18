import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { createPostgresAuthStore } from "../../packages/storage/src/auth-store.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createWebSessionAuthService, hashToken } from "../../packages/auth/src/index.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("rolling browser sessions", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const store = createPostgresAuthStore(db);
  const service = createWebSessionAuthService({
    ...store,
    acceptProjectInvite: async () => ({ kind: "invalid_token" as const })
  });
  const started = new Date("2026-11-01T12:00:00.000Z");
  const day = 86_400_000;
  const at = (days: number) => new Date(started.getTime() + days * day);
  let user: string, org: string, session: string;

  beforeEach(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    user = randomUUID();
    org = randomUUID();
    session = randomUUID();
    await pool.query("INSERT INTO users(id,email) VALUES($1,$2)", [user, `${user}@example.test`]);
    await pool.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Session test',$2)", [
      org,
      org
    ]);
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
      [randomUUID(), org, user]
    );
    await pool.query(
      "INSERT INTO sessions(id,user_id,organization_id,session_token_hash,created_at,expires_at,auth_method) VALUES($1,$2,$3,$4,$5,$6,'email_code')",
      [session, user, org, hashToken("session-secret"), started, at(7)]
    );
  });
  afterAll(async () => {
    await pool.end();
  });

  it("renews foreground activity but passive authentication leaves the idle deadline unchanged", async () => {
    const before = await service.resolveSessionByToken("session-secret", { now: at(6) });
    expect(Date.parse(before!.expires_at)).toBe(at(7).getTime());
    const renewed = await service.renewSessionByToken("session-secret", { now: at(6) });
    expect(Date.parse(renewed!.expires_at)).toBe(at(13).getTime());
    expect(Date.parse(renewed!.absolute_expires_at)).toBe(at(30).getTime());
    expect(await service.resolveSessionByToken("session-secret", { now: at(12) })).not.toBeNull();
    expect(await service.resolveSessionByToken("session-secret", { now: at(13) })).toBeNull();
    expect(await service.renewSessionByToken("session-secret", { now: at(13) })).toBeNull();
  });

  it("caps renewals at the original sign-in plus thirty days", async () => {
    for (const days of [6, 12, 18, 24, 29]) {
      const renewed = await service.renewSessionByToken("session-secret", { now: at(days) });
      expect(Date.parse(renewed!.expires_at)).toBe(at(Math.min(days + 7, 30)).getTime());
    }
    expect(await service.resolveSessionByToken("session-secret", { now: at(30) })).toBeNull();
    expect(await service.renewSessionByToken("session-secret", { now: at(30) })).toBeNull();
    const row = (
      await pool.query<{ created_at: Date; expires_at: Date }>(
        "SELECT created_at,expires_at FROM sessions WHERE id=$1",
        [session]
      )
    ).rows[0]!;
    expect(row.created_at.toISOString()).toBe(started.toISOString());
    expect(row.expires_at.toISOString()).toBe(at(30).toISOString());
  });

  it.each(["revoked", "expired", "member suspended", "organization suspended", "future creation"])(
    "does not renew a %s session",
    async (state) => {
      if (state === "revoked")
        await store.revokeSessionByTokenHash({
          session_token_hash: hashToken("session-secret"),
          revoked_at: at(1).toISOString()
        });
      if (state === "member suspended")
        await pool.query("UPDATE organization_members SET suspended_at=$1 WHERE user_id=$2", [
          at(1),
          user
        ]);
      if (state === "organization suspended")
        await pool.query("UPDATE organizations SET suspended_at=$1 WHERE id=$2", [at(1), org]);
      if (state === "future creation")
        await pool.query("UPDATE sessions SET created_at=$1 WHERE id=$2", [at(4), session]);
      expect(
        await service.renewSessionByToken("session-secret", {
          now: at(state === "expired" ? 7 : 2)
        })
      ).toBeNull();
      const row = (
        await pool.query<{ expires_at: Date }>("SELECT expires_at FROM sessions WHERE id=$1", [
          session
        ])
      ).rows[0]!;
      expect(row.expires_at.toISOString()).toBe(at(7).toISOString());
    }
  );

  it("serializes overlapping renewal and logout without restoring revoked authority", async () => {
    await Promise.all([
      service.renewSessionByToken("session-secret", { now: at(5) }),
      service.renewSessionByToken("session-secret", { now: at(6) })
    ]);
    const row = (
      await pool.query<{ expires_at: Date }>("SELECT expires_at FROM sessions WHERE id=$1", [
        session
      ])
    ).rows[0]!;
    expect(row.expires_at.toISOString()).toBe(at(13).toISOString());
    await Promise.all([
      service.renewSessionByToken("session-secret", { now: at(7) }),
      service.revokeSessionByToken("session-secret", { now: at(7) })
    ]);
    expect(await service.resolveSessionByToken("session-secret", { now: at(7) })).toBeNull();
    expect(await service.renewSessionByToken("session-secret", { now: at(7) })).toBeNull();
  });

  it("enforces the absolute deadline even if a stored idle expiry is later", async () => {
    await pool.query("UPDATE sessions SET expires_at=$1 WHERE id=$2", [at(40), session]);
    expect(await service.resolveSessionByToken("session-secret", { now: at(30) })).toBeNull();
    expect(await service.renewSessionByToken("session-secret", { now: at(30) })).toBeNull();
    expect(
      await service.acceptInviteForSession("session-secret", { token: "invalid", now: at(30) })
    ).toEqual({ ok: false, error: "invalid_session" });
  });
});
