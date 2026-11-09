import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  migrateStorageSchema,
  assertStorageSchemaMigrationsApplied
} from "../../packages/storage/src/schema-migrations.js";
import {
  REFERRAL_MIGRATION,
  referralSchemaAvailable
} from "../../packages/storage/src/referral-schema.js";
import { createReferralStore } from "../../packages/storage/src/referral-store.js";
import { REFERRAL_TERMS_VERSION } from "../../packages/referrals/src/referral-contracts.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("referral partners and durable customer attribution", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  const secret = "referral-identity-test-secret-at-least-thirty-two-characters";
  const store = createReferralStore(db, { identityHashSecret: secret });
  let partnerUser: string, owner: string, org: string;
  const identityHash = (email: string) =>
    createHmac("sha256", secret)
      .update(`referral-customer:v1:${email.trim().toLowerCase()}`)
      .digest("hex");
  async function user(verified = true): Promise<string> {
    const id = randomUUID();
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,$3)", [
      id,
      `${id}@example.test`,
      verified ? new Date().toISOString() : null
    ]);
    return id;
  }
  async function account(userId: string): Promise<string> {
    const id = randomUUID();
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan) VALUES($1::uuid,'Business prospect',$1::text,'free')",
      [id]
    );
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
      [randomUUID(), id, userId]
    );
    return id;
  }
  async function partner(userId = partnerUser) {
    return store.joinProgram({ user_id: userId, terms_version: REFERRAL_TERMS_VERSION });
  }
  function claim(code: string, changes: Record<string, unknown> = {}) {
    return store.saveAttribution({
      organization_id: org,
      actor_user_id: owner,
      code,
      source: "link",
      explicit_correction: false,
      provider_customer_id_checked: null,
      provider_previously_paid: false,
      ...changes
    });
  }
  beforeEach(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    partnerUser = await user();
    owner = await user();
    org = await account(owner);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("joins a verified Free user once, freezing terms and a public code on their identity", async () => {
    const first = await partner();
    expect(first).toMatchObject({
      status: "active",
      terms_version: REFERRAL_TERMS_VERSION,
      commission_basis_points: 5000
    });
    expect(first.code).toMatch(/^[A-Z2-7]{10}$/);
    await account(partnerUser);
    await account(partnerUser);
    expect(await partner()).toEqual(first);
    expect(await store.getPartner({ user_id: owner })).toBeNull();
    expect(await store.getPartner({ user_id: partnerUser })).toEqual(first);
    await expect(
      store.joinProgram({ user_id: partnerUser, terms_version: "not-accepted" })
    ).rejects.toMatchObject({ code: "terms_mismatch" });
    const unverified = await user(false);
    await expect(partner(unverified)).rejects.toMatchObject({
      code: "email_verification_required"
    });
    await pool.query("UPDATE referral_partners SET status='paused' WHERE user_id=$1", [
      partnerUser
    ]);
    expect((await partner()).status).toBe("paused");
    expect(await store.isActiveCode(first.code)).toBe(false);
    expect(await store.isActiveCode("unbounded-or-invalid-input")).toBe(false);
  });
  it("serialises concurrent enrolment and first-attribution attempts without replacing the first saved partner", async () => {
    const same = await Promise.all([partner(), partner()]);
    expect(same[0]).toEqual(same[1]);
    const other = await partner(await user());
    const claims = await Promise.allSettled([claim(same[0].code), claim(other.code)]);
    expect(claims.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = claims.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: { code: "attribution_change_requires_confirmation" }
    });
    expect(
      (await pool.query("SELECT id FROM referral_attributions WHERE organization_id=$1", [org]))
        .rows
    ).toHaveLength(1);
  });
  it("saves attribution before a no-card trial and leaves it attached through the trial", async () => {
    const p = await partner();
    const first = await claim(p.code);
    await pool.query(
      "UPDATE organizations SET plan='team',billing_state='trialing',trial_plan='team',trial_started_at=now(),trial_ends_at=now()+interval '30 days' WHERE id=$1",
      [org]
    );
    expect(await store.getAttribution({ organization_id: org, actor_user_id: owner })).toEqual(
      first
    );
    expect(await claim(p.code)).toEqual(first);
    expect(first).toMatchObject({ partner_code: p.code, source: "link", checkout_reserved: false });
  });
  it("keeps the first valid code and requires explicit correction before checkout reservation", async () => {
    const first = await partner(),
      second = await partner(await user());
    const saved = await claim(first.code);
    await expect(claim(second.code)).rejects.toMatchObject({
      code: "attribution_change_requires_confirmation"
    });
    expect(await claim(second.code, { source: "manual", explicit_correction: true })).toMatchObject(
      { referral_id: saved.referral_id, partner_code: second.code, source: "manual" }
    );
    await pool.query(
      "UPDATE referral_attributions SET reserved_checkout_attempt_id=$2 WHERE organization_id=$1",
      [org, randomUUID()]
    );
    await expect(claim(first.code, { explicit_correction: true })).rejects.toMatchObject({
      code: "attribution_frozen"
    });
  });
  it("rejects self-referrals, non-Owners, provider races and confirmed prior cash payment", async () => {
    const p = await partner();
    await expect(claim(p.code, { actor_user_id: partnerUser })).rejects.toMatchObject({
      code: "forbidden"
    });
    await expect(
      store.getAttribution({ organization_id: org, actor_user_id: partnerUser })
    ).rejects.toMatchObject({ code: "forbidden" });
    const ownPartner = await partner(owner);
    await expect(claim(ownPartner.code)).rejects.toMatchObject({ code: "referral_self_claim" });
    await expect(claim(p.code, { provider_previously_paid: true })).rejects.toMatchObject({
      code: "ineligible_customer"
    });
    await pool.query("UPDATE organizations SET stripe_customer_id='cus_changed' WHERE id=$1", [
      org
    ]);
    await expect(claim(p.code)).rejects.toMatchObject({ code: "billing_state_changed" });
  });
  it("remembers previous cash payment across workspace and account recreation without raw email", async () => {
    const p = await partner();
    await pool.query(
      "INSERT INTO billing_customer_history(organization_external_id,owner_identity_hash,first_cash_at,provider_invoice_id,provider_payment_id) VALUES($1,$2,now(),'invoice-paid','payment-paid')",
      [randomUUID(), identityHash(`${owner}@example.test`)]
    );
    await expect(claim(p.code)).rejects.toMatchObject({ code: "ineligible_customer" });
  });
  it("does not expose another partner's clients, invoices, debug data or private identities", async () => {
    const p = await partner(),
      otherUser = await user();
    await partner(otherUser);
    await claim(p.code);
    const mine = await store.listPartnerClients({ user_id: partnerUser, limit: 25 });
    expect(mine).toHaveLength(1);
    expect(Object.keys(mine[0]!).sort()).toEqual(["client_id", "created_at", "status"]);
    expect(JSON.stringify(mine)).not.toContain(org);
    expect(JSON.stringify(mine)).not.toContain(owner);
    expect(await store.listPartnerClients({ user_id: otherUser, limit: 25 })).toEqual([]);
  });
  it("retains minimum financial attribution when the customer organisation is deleted", async () => {
    const p = await partner(),
      attribution = await claim(p.code);
    await pool.query("DELETE FROM organizations WHERE id=$1", [org]);
    const rows = await pool.query(
      "SELECT organization_id,organization_external_id,owner_identity_hash FROM referral_attributions WHERE id=$1",
      [attribution.referral_id]
    );
    expect(rows.rows).toEqual([
      {
        organization_id: null,
        organization_external_id: org,
        owner_identity_hash: identityHash(`${owner}@example.test`)
      }
    ]);
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
  });
  it("refuses incomplete referral schema even when table names or an existing ledger suggest readiness", async () => {
    await pool.query(
      "ALTER TABLE referral_partners DROP CONSTRAINT referral_partners_commission_basis_points_check"
    );
    expect(await referralSchemaAvailable(db)).toBe(false);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "referral_schema_incomplete"
    );
    await pool.query("DELETE FROM storage_migration_ledger WHERE id=$1", [REFERRAL_MIGRATION.id]);
    await expect(migrateStorageSchema(db)).rejects.toThrow("referral_schema_incomplete");
    expect(
      (
        await pool.query("SELECT id FROM storage_migration_ledger WHERE id=$1", [
          REFERRAL_MIGRATION.id
        ])
      ).rows
    ).toEqual([]);
  });
});
