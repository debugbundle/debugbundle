import { createDefaultOffers } from "../../apps/api/src/default-offers.js";
import { createReferralLinkCodec } from "../../packages/referrals/src/referral-link.js";
import { createReferralEligibilityReader } from "../../packages/storage/src/referral-customer-eligibility.js";
import { OFFER_PROGRAMME_TABLES } from "../../packages/storage/src/offer-programme-schema.js";
import { seedConsolidationProjects } from "../helpers/consolidation-projects.js";
import { createPostgresBillingCheckoutStore } from "../../packages/storage/src/billing-checkout-store.js";
import { createOfferSignupProcessor } from "../../apps/worker/src/offer-signup-processor.js";
import {
  saveSignupOfferIntent,
  createOfferSignupStore
} from "../../packages/storage/src/offer-signup-store.js";
import { createLegacyOfferAdapter } from "../../packages/storage/src/legacy-offer-adapter.js";
import type { StripeBillingProvider } from "../../packages/billing/src/stripe-subscription.js";
import { mockedObject } from "../helpers/vitest.js";
import { vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Queryable } from "../../packages/storage/src/types.js";
import { afterAll, beforeEach, expect, it } from "vitest";
import { createOfferProgrammeStore } from "../../packages/storage/src/offer-programme-store.js";
import { createReferralStore } from "../../packages/storage/src/referral-store.js";
import { createReferralBenefitStore } from "../../packages/storage/src/referral-benefit-store.js";
import { readReferralBenefitContext } from "../../packages/storage/src/referral-benefit-recovery-store.js";
import { REFERRAL_TERMS_VERSION } from "../../packages/referrals/src/referral-contracts.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
import {
  resetOfferIntegrationSchema,
  createOfferTestAccount,
  createOfferTestUser,
  createOfferTestProgramme
} from "../helpers/offer-integration.js";
runIntegration("retired legacy offers and permanent ownership", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    options = { identityHashSecret: "offer-compatibility-secret-thirty-two-characters-long" },
    store = createOfferProgrammeStore(db, options),
    legacy = createReferralStore(db, options);
  let owner: string, org: string, creator: string, operator: string;
  beforeEach(async () => {
    await resetOfferIntegrationSchema(db);
    owner = await createOfferTestUser(db);
    org = await createOfferTestAccount(db, owner);
    creator = await createOfferTestUser(db);
    operator = await createOfferTestUser(db);
  });
  afterAll(async () => pool.end());
  it("refuses eligibility evidence for another Owner and for an unchecked existing provider customer", async () => {
    const read = createReferralEligibilityReader(db);
    await expect(read({ organization_id: org, actor_user_id: creator })).rejects.toMatchObject({
      code: "forbidden"
    });
    await db.query("UPDATE organizations SET stripe_customer_id='cus_unchecked' WHERE id=$1", [
      org
    ]);
    await expect(read({ organization_id: org, actor_user_id: owner })).rejects.toMatchObject({
      code: "program_unavailable"
    });
  });
  const enroll = async () => {
    const version = await createOfferTestProgramme(store, operator);
    await store.creators.join({
      user_id: creator,
      version_id: version.version_id,
      terms_version: version.policy.terms_version
    });
    return version;
  };
  it.each(["legacy", "versioned"] as const)(
    "serialises code blocking with an in-flight %s promise and preserves the admitted claim",
    async (kind) => {
      let code: string;
      if (kind === "legacy") {
        code = (
          await legacy.joinProgram({ user_id: creator, terms_version: REFERRAL_TERMS_VERSION })
        ).code;
      } else {
        await enroll();
        code = (await store.creators.claimCode({ user_id: creator, code: "RACE20" })).code;
      }
      let reads = 0;
      let blockWasSerialized = false;
      const concurrent: Queryable = {
        query: db.query,
        transaction: (work) =>
          db.transaction!(async (tx) =>
            work({
              query: async <Row extends Record<string, unknown>>(
                sql: string,
                params: unknown[]
              ) => {
                const result = await tx.query<Row>(sql, params);
                const eligibilityRead =
                  kind === "legacy"
                    ? sql.includes("SELECT p.id,p.user_id FROM referral_partners")
                    : sql.includes("FROM offer_codes c LEFT JOIN referral_partners");
                if (eligibilityRead && ++reads === (kind === "legacy" ? 1 : 2)) {
                  const blocker = await pool.connect();
                  try {
                    await blocker.query("BEGIN");
                    await blocker.query("SET LOCAL lock_timeout='100ms'");
                    try {
                      await blocker.query("UPDATE offer_codes SET blocked=true WHERE code=$1", [
                        code
                      ]);
                    } catch (error) {
                      if ((error as { code?: string }).code !== "55P03") throw error;
                      blockWasSerialized = true;
                    }
                  } finally {
                    await blocker.query("ROLLBACK");
                    blocker.release();
                  }
                }
                return result;
              }
            })
          )
      };
      const input = {
        organization_id: org,
        actor_user_id: owner,
        code,
        source: "manual" as const,
        explicit_correction: false,
        provider_customer_id_checked: null,
        provider_previously_paid: false
      };
      const apply = (connection: Queryable, request: typeof input) =>
        kind === "legacy"
          ? createReferralStore(connection, options).saveAttribution(request)
          : createOfferProgrammeStore(connection, options).claims.apply(request);
      await apply(concurrent, input);
      expect(blockWasSerialized).toBe(true);
      await store.creators.setCodeBlocked({
        operator_user_id: operator,
        code,
        blocked: true,
        reason: "Code under review"
      });
      const secondOwner = await createOfferTestUser(db);
      const secondOrg = await createOfferTestAccount(db, secondOwner);
      await expect(
        apply(db, { ...input, actor_user_id: secondOwner, organization_id: secondOrg })
      ).rejects.toMatchObject({
        code: kind === "legacy" ? "invalid_referral_code" : "invalid_offer_code"
      });
      expect(
        await legacy.getAttribution({ organization_id: org, actor_user_id: owner })
      ).not.toBeNull();
    }
  );
  it("honours durable legacy attribution when its signup completion acknowledgement is missing", async () => {
    const partner = await legacy.joinProgram({
      user_id: creator,
      terms_version: REFERRAL_TERMS_VERSION
    });
    await db.query(
      "UPDATE organizations SET trial_plan='business',trial_started_at=now()-interval '8 days',trial_ends_at=now()+interval '22 days' WHERE id=$1",
      [org]
    );
    await saveSignupOfferIntent(db, {
      organization_id: org,
      user_id: owner,
      hint: { code: partner.code, expires_at: new Date(Date.now() + 86400000).toISOString() }
    });
    await legacy.saveAttribution({
      organization_id: org,
      actor_user_id: owner,
      code: partner.code,
      source: "link",
      explicit_correction: false,
      provider_customer_id_checked: null,
      provider_previously_paid: false
    });
    expect(
      await createPostgresBillingCheckoutStore(db).claim({
        organization_id: org,
        target_plan: "business",
        expected_owner_user_id: owner,
        parameters: () => ({})
      })
    ).toBe("referral_coupon_required");
  });
  it("preserves account-owned programme terms, codes and claims when projects are consolidated", async () => {
    const projects = await seedConsolidationProjects(pool, db);
    await db.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [projects.userId]);
    await enroll();
    await store.creators.claimCode({ user_id: creator, code: "UNCHANGED20" });
    await store.claims.apply({
      organization_id: projects.organizationId,
      actor_user_id: projects.userId,
      code: "UNCHANGED20",
      source: "manual",
      explicit_correction: false,
      provider_customer_id_checked: null,
      provider_previously_paid: false
    });
    const snapshot = async (): Promise<Record<string, unknown[]>> => {
      const data: Record<string, unknown[]> = {};
      for (const table of OFFER_PROGRAMME_TABLES)
        data[table] = (
          await db.query(
            `SELECT to_jsonb(t) AS value FROM ${table} t ORDER BY to_jsonb(t)::text`,
            []
          )
        ).rows.map((row) => row["value"]);
      return data;
    };
    const before = await snapshot();
    await projects.consolidate();
    expect(await snapshot()).toEqual(before);
  });
  it("recovers legacy signup with new programmes disabled without spending unrelated new intents", async () => {
    const partner = await legacy.joinProgram({
      user_id: creator,
      terms_version: REFERRAL_TERMS_VERSION
    });
    const pendingOwner = await createOfferTestUser(db),
      pendingOrg = await createOfferTestAccount(db, pendingOwner);
    await saveSignupOfferIntent(db, {
      organization_id: pendingOrg,
      user_id: pendingOwner,
      hint: { code: "UNAVAILABLE20", expires_at: new Date(Date.now() + 86400000).toISOString() }
    });
    const customers = vi
        .fn()
        .mockRejectedValueOnce(new Error("provider_outage"))
        .mockResolvedValue({ data: [], has_more: false }),
      provider = mockedObject<StripeBillingProvider>({
        priceMap: new Map(),
        client: { customers: { list: customers } }
      });
    const offers = createDefaultOffers({
      db,
      config: { secret: options.identityHashSecret, enrollmentEnabled: true },
      stripeConfig: provider,
      enabled: false,
      operatorEmails: [],
      appBaseUrl: "https://app.example.test"
    });
    const signupHint = offers.signupHint(
      createReferralLinkCodec(options.identityHashSecret).issue(partner.code).split(";")[0]
    );
    expect(signupHint).toMatchObject({ code: partner.code });
    await saveSignupOfferIntent(db, {
      organization_id: org,
      user_id: owner,
      hint: signupHint!
    });
    expect(await offers.captureSignup({ organization_id: org, actor_user_id: owner }, true)).toBe(
      true
    );
    await db.query(
      "UPDATE offer_signup_intents SET next_attempt_at=now()-interval '1 minute' WHERE organization_id=$1",
      [org]
    );
    expect(
      await createOfferSignupProcessor({
        db,
        provider,
        secret: options.identityHashSecret,
        enabled: false,
        legacy_enabled: true
      })!()
    ).toEqual({ processed: true });
    expect(
      await legacy.getAttribution({ organization_id: org, actor_user_id: owner })
    ).toMatchObject({ partner_code: partner.code });
    expect(
      await createOfferSignupStore(db).read({ organization_id: org, actor_user_id: owner })
    ).toMatchObject({ status: "completed" });
    expect(
      (
        await db.query(
          "SELECT status,attempts FROM offer_signup_intents WHERE organization_id=$1",
          [pendingOrg]
        )
      ).rows[0]
    ).toEqual({ status: "pending", attempts: 0 });
    await store.creators.setCodeBlocked({
      operator_user_id: operator,
      code: partner.code,
      blocked: true,
      reason: "Legacy-code abuse review"
    });
    expect(await legacy.isActiveCode(partner.code)).toBe(false);
    const adapter = createLegacyOfferAdapter({
      db,
      secret: options.identityHashSecret,
      enabled: true,
      secure: true,
      readEligibility: async () => ({
        provider_customer_id_checked: null,
        provider_previously_paid: false
      })
    });
    expect(await adapter.preview(partner.code)).toBeNull();
    await expect(
      legacy.saveAttribution({
        organization_id: pendingOrg,
        actor_user_id: pendingOwner,
        code: partner.code,
        source: "manual",
        explicit_correction: false,
        provider_customer_id_checked: null,
        provider_previously_paid: false
      })
    ).rejects.toMatchObject({ code: "invalid_referral_code" });
    expect(
      await legacy.getAttribution({ organization_id: org, actor_user_id: owner })
    ).toMatchObject({ partner_code: partner.code });
  });
  it("allows a fully retired unused legacy marker to accept an explicit new offer and never resurrects ten percent", async () => {
    const partner = await legacy.joinProgram({
      user_id: creator,
      terms_version: REFERRAL_TERMS_VERSION
    });
    const attribution = await legacy.saveAttribution({
      organization_id: org,
      actor_user_id: owner,
      code: partner.code,
      source: "manual",
      explicit_correction: false,
      provider_customer_id_checked: null,
      provider_previously_paid: false
    });
    await db.query(
      "INSERT INTO referral_invoice_benefits(owner_identity_hash,attribution_id,organization_external_id,coupon_id) SELECT owner_identity_hash,id,organization_external_id,'old_coupon' FROM referral_attributions WHERE id=$1",
      [attribution.referral_id]
    );
    expect(await readReferralBenefitContext(db, org)).toBeNull();
    await enroll();
    const profile = await store.creators.claimCode({ user_id: creator, code: "REPLACE20" });
    const saved = await store.claims.apply({
      organization_id: org,
      actor_user_id: owner,
      code: profile.code,
      source: "manual",
      explicit_correction: true,
      provider_customer_id_checked: null,
      provider_previously_paid: false
    });
    expect(saved.status).toBe("saved");
    expect(
      await createReferralBenefitStore(db).checkoutContext({
        organization_id: org,
        actor_user_id: owner
      })
    ).toMatchObject({ discount_eligible: false });
    await store.claims.remove({ organization_id: org, actor_user_id: owner });
    expect(
      await createReferralBenefitStore(db).checkoutContext({
        organization_id: org,
        actor_user_id: owner
      })
    ).toMatchObject({ discount_eligible: false });
    expect(await readReferralBenefitContext(db, org)).toBeNull();
  });
  it("serialises first self-service code reservation with an operator correction", async () => {
    await enroll();
    const partner = (await store.creators.read(creator))!.partner_id;
    const results = await Promise.allSettled([
      store.creators.claimCode({ user_id: creator, code: "MYFIRST20" }),
      store.creators.correctCode({
        partner_id: partner,
        operator_user_id: operator,
        code: "CORRECT20",
        reason: "Verified brand correction"
      })
    ]);
    expect(results.filter((result) => result.status === "fulfilled").length).toBeGreaterThanOrEqual(
      1
    );
    expect(results.filter((result) => result.status === "rejected")).not.toMatchObject([
      { reason: { code: "23505" } }
    ]);
    expect(
      (
        await db.query(
          "SELECT id FROM offer_codes WHERE partner_id=$1 AND kind='creator' AND preferred",
          [partner]
        )
      ).rows
    ).toHaveLength(1);
    expect((await store.creators.read(creator))!.partner_id).toBe(partner);
  });
  it("retains code and protected customer identity tombstones after account deletion", async () => {
    await enroll();
    const profile = await store.creators.claimCode({ user_id: creator, code: "PERMANENT20" });
    await store.claims.apply({
      organization_id: org,
      actor_user_id: owner,
      code: profile.code,
      source: "manual",
      explicit_correction: false,
      provider_customer_id_checked: null,
      provider_previously_paid: false
    });
    const email = String(
      (await db.query("SELECT email FROM users WHERE id=$1", [owner])).rows[0]!["email"]
    );
    await db.query("DELETE FROM organizations WHERE id=$1", [org]);
    await db.query("DELETE FROM users WHERE id=$1", [owner]);
    const newOwner = randomUUID();
    await db.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      newOwner,
      email
    ]);
    const newOrg = await createOfferTestAccount(db, newOwner);
    await expect(
      store.claims.apply({
        organization_id: newOrg,
        actor_user_id: newOwner,
        code: profile.code,
        source: "manual",
        explicit_correction: false,
        provider_customer_id_checked: null,
        provider_previously_paid: false
      })
    ).rejects.toMatchObject({ code: "offer_ineligible" });
    const otherCreator = await createOfferTestUser(db),
      v = await enroll();
    await store.creators.join({
      user_id: otherCreator,
      version_id: v.version_id,
      terms_version: v.policy.terms_version
    });
    await expect(
      store.creators.claimCode({ user_id: otherCreator, code: profile.code })
    ).rejects.toMatchObject({ code: "creator_code_unavailable" });
  });
});
