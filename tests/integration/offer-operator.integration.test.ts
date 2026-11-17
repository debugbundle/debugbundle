import { randomUUID, createHash } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { createOfferOperatorStore } from "../../packages/storage/src/offer-operator-store.js";
import {
  resetOfferIntegrationSchema,
  createOfferTestAccount,
  createOfferTestUser
} from "../helpers/offer-integration.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
runIntegration("offer operator delegation authority", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  let user: string, org: string, session: string, token: string;
  const bearer = "dbundle_mem_operator_fixture";
  const store = () => createOfferOperatorStore(db, [`${user}@example.test`]);
  const issue = () =>
    store().issue({
      user_id: user,
      session_id: session,
      member_token_id: token,
      actions: ["read", "manage"]
    });
  beforeEach(async () => {
    await resetOfferIntegrationSchema(db);
    user = await createOfferTestUser(db);
    org = await createOfferTestAccount(db, user);
    session = randomUUID();
    token = randomUUID();
    await pool.query(
      "INSERT INTO sessions(id,user_id,organization_id,session_token_hash,auth_method,expires_at) VALUES($1,$2,$3,$4,'email_code',now()+interval '1 day')",
      [session, user, org, hash("session-fixture")]
    );
    await pool.query(
      "INSERT INTO member_tokens(id,user_id,organization_id,token_hash,label) VALUES($1,$2,$3,$4,'operator fixture')",
      [token, user, org, hash(bearer)]
    );
  });
  afterAll(async () => pool.end());
  it("stores only a hash and binds authority to the exact token and explicitly selected actions", async () => {
    const start = Date.now(),
      delegation = await issue();
    expect(Date.parse(delegation.expires_at) - start).toBeGreaterThan(14 * 60000);
    expect(Date.parse(delegation.expires_at) - start).toBeLessThanOrEqual(15 * 60000 + 1000);
    const persisted = (await pool.query("SELECT * FROM offer_operator_delegations")).rows[0]!;
    expect(persisted.proof_hash).toBe(hash(delegation.proof));
    expect(JSON.stringify(persisted)).not.toContain(delegation.proof);
    expect(
      await store().authorize({ bearer_token: bearer, proof: delegation.proof, action: "read" })
    ).toEqual({ user_id: user, organization_id: org });
    expect(
      await store().authorize({ bearer_token: "other", proof: delegation.proof, action: "read" })
    ).toBeNull();
    expect(
      await store().authorize({ bearer_token: bearer, proof: delegation.proof, action: "activate" })
    ).toBeNull();
    expect(
      await store().authorize({ bearer_token: bearer, proof: delegation.proof, action: "grant" })
    ).toBeNull();
  });
  it.each([
    "proof",
    "token",
    "session",
    "email",
    "allowlist",
    "membership",
    "workspace",
    "scope",
    "expiry"
  ] as const)("denies a previously issued proof after %s authority is lost", async (kind) => {
    const delegation = await issue();
    if (kind === "proof") await store().revoke({ user_id: user, proof: delegation.proof });
    if (kind === "token")
      await pool.query("UPDATE member_tokens SET revoked_at=now() WHERE id=$1", [token]);
    if (kind === "session")
      await pool.query("UPDATE sessions SET revoked_at=now() WHERE id=$1", [session]);
    if (kind === "email")
      await pool.query("UPDATE users SET email_verified_at=NULL WHERE id=$1", [user]);
    if (kind === "membership")
      await pool.query("DELETE FROM organization_members WHERE organization_id=$1 AND user_id=$2", [
        org,
        user
      ]);
    if (kind === "workspace")
      await pool.query("UPDATE organizations SET suspended_at=now() WHERE id=$1", [org]);
    if (kind === "scope")
      await pool.query("UPDATE member_tokens SET scope_policy=$2::jsonb WHERE id=$1", [
        token,
        JSON.stringify({ version: 1, kind: "project", project_ids: [] })
      ]);
    if (kind === "expiry")
      await pool.query(
        "UPDATE offer_operator_delegations SET expires_at=now()-interval '1 second'"
      );
    const current = kind === "allowlist" ? createOfferOperatorStore(db, []) : store();
    expect(
      await current.authorize({ bearer_token: bearer, proof: delegation.proof, action: "read" })
    ).toBeNull();
  });
  it.each([
    "github",
    "unverified",
    "other_user",
    "other_workspace",
    "scoped",
    "suspended"
  ] as const)("refuses issuance from %s credentials", async (kind) => {
    if (kind === "github")
      await pool.query("UPDATE sessions SET auth_method='github_oauth' WHERE id=$1", [session]);
    if (kind === "unverified")
      await pool.query("UPDATE users SET email_verified_at=NULL WHERE id=$1", [user]);
    if (kind === "other_user")
      await pool.query("UPDATE member_tokens SET user_id=$2 WHERE id=$1", [
        token,
        await createOfferTestUser(db)
      ]);
    if (kind === "other_workspace")
      await pool.query("UPDATE member_tokens SET organization_id=$2 WHERE id=$1", [
        token,
        await createOfferTestAccount(db, user)
      ]);
    if (kind === "scoped")
      await pool.query("UPDATE member_tokens SET scope_policy=$2::jsonb WHERE id=$1", [
        token,
        JSON.stringify({ version: 1, kind: "project", project_ids: [] })
      ]);
    if (kind === "suspended")
      await pool.query(
        "UPDATE organization_members SET suspended_at=now() WHERE organization_id=$1 AND user_id=$2",
        [org, user]
      );
    await expect(issue()).rejects.toMatchObject({ code: "operator_authorization_required" });
  });
  it("rejects session-workspace changes and deletes proofs when the issuing identity is deleted", async () => {
    const delegation = await issue(),
      other = await createOfferTestAccount(db, user);
    await pool.query("UPDATE sessions SET organization_id=$2 WHERE id=$1", [session, other]);
    expect(
      await store().authorize({ bearer_token: bearer, proof: delegation.proof, action: "read" })
    ).toBeNull();
    await pool.query("DELETE FROM users WHERE id=$1", [user]);
    expect(
      (await pool.query("SELECT proof_hash FROM offer_operator_delegations")).rows
    ).toHaveLength(0);
  });
});
