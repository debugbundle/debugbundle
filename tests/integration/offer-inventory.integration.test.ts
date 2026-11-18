import { afterAll, beforeEach, expect, it } from "vitest";
import { createOfferProgrammeStore } from "../../packages/storage/src/offer-programme-store.js";
import { createOfferBenefitStore } from "../../packages/storage/src/offer-benefit-store.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
import {
  resetOfferIntegrationSchema,
  createOfferTestAccount,
  createOfferTestUser,
  createOfferTestProgramme,
  offerIntegrationPolicy
} from "../helpers/offer-integration.js";
runIntegration("operator offer inventories", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    store = createOfferProgrammeStore(db, {
      identityHashSecret: "offer-inventory-secret-at-least-thirty-two-characters"
    });
  let operator: string, owner: string, org: string, code: string, partner: string;
  beforeEach(async () => {
    await resetOfferIntegrationSchema(db);
    operator = await createOfferTestUser(db);
    owner = await createOfferTestUser(db);
    org = await createOfferTestAccount(db, owner);
    const creator = await createOfferTestUser(db),
      version = await createOfferTestProgramme(store, operator, {
        ...offerIntegrationPolicy,
        allow_early_purchase_grants: true
      });
    await store.creators.join({
      user_id: creator,
      version_id: version.version_id,
      terms_version: version.policy.terms_version
    });
    const profile = await store.creators.claimCode({ user_id: creator, code: "FIND20" });
    code = profile.code;
    partner = profile.partner_id;
  });
  afterAll(async () => pool.end());
  it("pages stable code ownership without exposing private financial identity", async () => {
    const first = await store.inventory.codes({ limit: 1 }),
      next = await store.inventory.codes({ limit: 1, before: first[0]!.code_id });
    expect(first).toHaveLength(1);
    expect(next).toHaveLength(1);
    expect(first[0]!.code_id).not.toBe(next[0]!.code_id);
    expect(await store.inventory.codes({ code: "find20", partner_id: partner })).toMatchObject([
      { code: "FIND20", partner_id: partner, kind: "creator", blocked: false }
    ]);
    await store.creators.setCodeBlocked({
      operator_user_id: operator,
      code,
      blocked: true,
      reason: "Support review"
    });
    expect(await store.inventory.codes({ code })).toMatchObject([{ code, blocked: true }]);
    const creatorId = String(
      (await db.query("SELECT user_id FROM referral_partners WHERE id=$1", [partner])).rows[0]![
        "user_id"
      ]
    );
    expect(await store.creators.read(creatorId)).toMatchObject({ accepting_new_referrals: false });
    expect(JSON.stringify([...first, ...next])).not.toMatch(
      /owner_identity_hash|provider_|token_hash|example.test/
    );
  });
  it("finds the exact workspace claim and complete bounded grant history", async () => {
    const claim = await store.claims.apply({
      organization_id: org,
      actor_user_id: owner,
      code,
      source: "manual",
      explicit_correction: false,
      provider_customer_id_checked: null,
      provider_previously_paid: false
    });
    const benefits = createOfferBenefitStore(db),
      grant = await benefits.grantEarlyPurchase({
        claim_id: claim.claim_id,
        operator_user_id: operator,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        reason: "Assisted trial conversion"
      });
    expect(await store.inventory.claims({ code, organization_id: org })).toMatchObject([
      {
        claim_id: claim.claim_id,
        code,
        status: "saved",
        organization_id: org,
        legacy_referral: false
      }
    ]);
    expect(await store.inventory.claims({ code: "UNKNOWN20" })).toEqual([]);
    const history = await store.inventory.grants({ claim_id: claim.claim_id });
    expect(history).toMatchObject([
      {
        grant_id: grant.grant_id,
        claim_id: claim.claim_id,
        reason: "Assisted trial conversion",
        admitted_checkout: false,
        revoked_at: null
      }
    ]);
    await benefits.revokeEarlyPurchase(grant.grant_id);
    expect(
      (await store.inventory.grants({ claim_id: claim.claim_id }))[0]!.revoked_at
    ).not.toBeNull();
    expect(JSON.stringify(history)).not.toMatch(
      /owner_identity_hash|provider_|token_hash|example.test/
    );
  });
});
