import { afterAll, beforeEach, expect, it } from "vitest";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
import {
  resetOfferIntegrationSchema,
  createOfferTestUser,
  createOfferTestAccount,
  createOfferTestProgramme,
  offerIntegrationPolicy
} from "../helpers/offer-integration.js";
import { createOfferProgrammeStore } from "../../packages/storage/src/offer-programme-store.js";
import { createDefaultOffers } from "../../apps/api/src/default-offers.js";
import { saveSignupOfferIntent } from "../../packages/storage/src/offer-signup-store.js";
import { mockedObject } from "../helpers/vitest.js";
import type { StripeConfig } from "../../apps/api/src/stripe-config.js";
import { createOfferLinkCodec } from "../../packages/referrals/src/offer-link.js";
import { createReferralStore } from "../../packages/storage/src/referral-store.js";
import { REFERRAL_TERMS_VERSION } from "../../packages/referrals/src/referral-contracts.js";
import { createReferralLedgerStore } from "../../packages/storage/src/referral-ledger-store.js";
import { createOfferSignupProcessor } from "../../apps/worker/src/offer-signup-processor.js";
import type { StripeBillingProvider } from "../../packages/billing/src/stripe-subscription.js";

runIntegration("best eligible introductory offer and creator attribution", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  const secret = "best-offer-integration-secret-at-least-thirty-two-characters";
  const store = createOfferProgrammeStore(db, { identityHashSecret: secret });
  let operator: string, creator: string, owner: string, organization: string;
  const service = (duringEligibility?: () => Promise<void>) =>
    createDefaultOffers({
      db,
      enabled: true,
      config: { secret, enrollmentEnabled: true },
      operatorEmails: [],
      appBaseUrl: "https://app.example.test",
      stripeConfig: mockedObject<StripeConfig>({
        client: {
          customers: {
            list: async () => {
              await duringEligibility?.();
              return { data: [], has_more: false };
            }
          }
        },
        priceMap: new Map()
      })
    });
  const actor = () => ({ organization_id: organization, actor_user_id: owner });
  beforeEach(async () => {
    await resetOfferIntegrationSchema(db);
    operator = await createOfferTestUser(db);
    creator = await createOfferTestUser(db);
    owner = await createOfferTestUser(db);
    organization = await createOfferTestAccount(db, owner);
  });
  afterAll(async () => {
    await pool.end();
  });
  const enrol = async () => {
    const version = await createOfferTestProgramme(store, operator);
    await store.creators.join({
      user_id: creator,
      version_id: version.version_id,
      terms_version: version.policy.terms_version
    });
    const profile = await store.creators.claimCode({ user_id: creator, code: "CREATOR20" });
    return { version, profile };
  };
  const promotion = (
    discount: number,
    plans = ["solo", "team", "business"] as typeof offerIntegrationPolicy.eligible_plans
  ) =>
    createOfferTestProgramme(store, operator, {
      ...offerIntegrationPolicy,
      kind: "promotion",
      commission_basis_points: 0,
      discount_basis_points: discount,
      eligible_plans: plans
    });

  it("saves the cheaper promotion from a referral link while retaining the original creator terms", async () => {
    const { version, profile } = await enrol();
    const sale = await promotion(3000);
    await promotion(1000); // Newest must not displace the cheapest.
    const offers = service();
    expect(await offers.preview(profile.code)).toMatchObject({
      code: profile.code,
      version: { version_id: sale.version_id }
    });
    await saveSignupOfferIntent(db, {
      organization_id: organization,
      user_id: owner,
      hint: { code: profile.code, expires_at: new Date(Date.now() + 86400000).toISOString() }
    });
    await offers.retrySignup(actor());
    const saved = await store.claims.read(actor());
    expect(saved).toMatchObject({
      referral_code: profile.code,
      version: { version_id: sale.version_id },
      status: "saved"
    });
    expect(
      (
        await db.query("SELECT referral_version_id FROM offer_claims WHERE organization_id=$1", [
          organization
        ])
      ).rows
    ).toEqual([{ referral_version_id: version.version_id }]);
    expect(
      (
        await db.query("SELECT partner_id FROM referral_attributions WHERE organization_id=$1", [
          organization
        ])
      ).rows
    ).toEqual([{ partner_id: profile.partner_id }]);
    await offers.retrySignup(actor());
    expect(await store.claims.read(actor())).toEqual(saved);
    await db.query("UPDATE organizations SET stripe_customer_id='cus_best' WHERE id=$1", [
      organization
    ]);
    const identity = (
      await db.query<{ owner_identity_hash: string }>(
        "SELECT owner_identity_hash FROM offer_claims WHERE organization_id=$1",
        [organization]
      )
    ).rows[0]!.owner_identity_hash;
    const ledger = createReferralLedgerStore(db);
    expect(
      await ledger.reconcile({
        organization_external_id: organization,
        owner_identity_hash: identity,
        provider_customer_id: "cus_best",
        observed_at: "2026-11-18T12:00:00.000Z",
        invoices: [
          {
            invoice_id: "in_best",
            currency: "usd",
            lines: [
              {
                id: "base",
                kind: "plan",
                plan: "solo",
                net_amount_minor: 350,
                tax_amount_minor: 0,
                service_starts_at: "2026-11-18T00:00:00.000Z",
                service_ends_at: "2026-12-18T00:00:00.000Z"
              }
            ],
            payments: [
              {
                payment_id: "pay_best",
                cash_minor: 350,
                collected_at: "2026-11-18T01:00:00.000Z",
                provider_available_at: "2026-11-20T00:00:00.000Z"
              }
            ],
            refunds: [],
            disputed: false
          }
        ]
      })
    ).toMatchObject({ adjustment_minor: 175 });
  });
  it("chooses referral on equal rounded cost and defers narrow promotions to the exact quote", async () => {
    const { profile } = await enrol();
    await promotion(2000);
    const narrow = await promotion(5000, ["solo"]);
    const offers = service();
    const saved = await offers.apply(actor(), profile.code, false, "manual");
    expect(saved.version.policy.kind).toBe("referral");
    const quote = await offers.quote(actor(), { target_plan: "solo", interval: "month" });
    expect(quote).toMatchObject({ version_id: narrow.version_id, initial_total_minor: 250 });
    expect(await store.claims.read(actor())).toEqual(saved); // Preview cannot rewrite a saved promise.
    const verified = offers.verifyQuote(quote.confirmation_token, actor())!;
    const confirmed = await offers.prepareCheckout(actor(), verified);
    expect(confirmed).toMatchObject({ claim_id: saved.claim_id, version_id: narrow.version_id });
    expect((await store.claims.read(actor()))?.referral_code).toBe(profile.code);
  });
  it("uses the same cheapest choice and creator attribution during durable worker recovery", async () => {
    const { profile } = await enrol();
    const sale = await promotion(3000);
    await saveSignupOfferIntent(db, {
      organization_id: organization,
      user_id: owner,
      hint: { code: profile.code, expires_at: new Date(Date.now() + 86400000).toISOString() }
    });
    const provider = mockedObject<StripeBillingProvider>({
      client: { customers: { list: async () => ({ data: [], has_more: false }) } },
      priceMap: new Map()
    });
    expect(await createOfferSignupProcessor({ db, provider, secret, enabled: true })!()).toEqual({
      processed: true
    });
    expect(await store.claims.read(actor())).toMatchObject({
      referral_code: profile.code,
      version: { version_id: sale.version_id }
    });
  });
  it("returns the referral on a rounded-money tie even when a slightly higher promotion was saved", async () => {
    const { profile, version } = await enrol();
    const sale = await promotion(2001);
    const offers = service();
    const saved = await offers.apply(actor(), profile.code, false, "manual");
    expect(saved.version.version_id).toBe(sale.version_id);
    const quote = await offers.quote(actor(), { target_plan: "solo", interval: "month" });
    expect(quote).toMatchObject({ version_id: version.version_id, initial_total_minor: 400 });
    await offers.prepareCheckout(actor(), offers.verifyQuote(quote.confirmation_token, actor())!);
    expect(await store.claims.read(actor())).toMatchObject({
      referral_code: profile.code,
      version: { version_id: version.version_id }
    });
    expect(
      await offers.quote(actor(), { target_plan: "business", interval: "year" })
    ).toMatchObject({ version_id: sale.version_id, initial_total_minor: 47034 });
  });
  it("keeps the creator when a promotion link was visited first and never replaces a first creator passively", async () => {
    const { profile } = await enrol();
    const sale = await promotion(3000);
    const salePreview = await store.publicPromotion();
    const offers = service();
    const promotionCookie = createOfferLinkCodec(secret).issue(salePreview!.code);
    const referralCookie = await offers.visit(profile.code, promotionCookie);
    expect(referralCookie).not.toBeNull();
    expect(offers.signupHint(referralCookie!)).toMatchObject({ code: profile.code });
    expect(await offers.context(referralCookie!)).toMatchObject({
      code: profile.code,
      version: { version_id: sale.version_id }
    });
    expect(await offers.visit(salePreview!.code, referralCookie!)).toBeNull();
    expect(await store.claims.read(actor())).toBeNull();
  });
  it("retains the legacy Business commission contract when a cheaper promotion is saved", async () => {
    const partner = await createReferralStore(db, { identityHashSecret: secret }).joinProgram({
      user_id: creator,
      terms_version: REFERRAL_TERMS_VERSION
    });
    const sale = await promotion(3000);
    const offers = service();
    const saved = await offers.apply(actor(), partner.code, false, "manual");
    expect(saved).toMatchObject({
      referral_code: partner.code,
      version: { version_id: sale.version_id }
    });
    expect(
      (
        await db.query("SELECT referral_version_id FROM offer_claims WHERE organization_id=$1", [
          organization
        ])
      ).rows
    ).toEqual([{ referral_version_id: null }]);
    expect(
      await offers.quote(actor(), { target_plan: "business", interval: "month" })
    ).toMatchObject({ version_id: sale.version_id, initial_total_minor: 4130 });
  });
  it("rejects self-referral and invalid codes even when the promotion is cheaper", async () => {
    const { profile } = await enrol();
    await promotion(3000);
    const offers = service();
    await expect(offers.apply(actor(), "INVALID20", false, "manual")).rejects.toMatchObject({
      code: "invalid_offer_code"
    });
    const selfOrg = await createOfferTestAccount(db, creator);
    await expect(
      offers.apply(
        { organization_id: selfOrg, actor_user_id: creator },
        profile.code,
        false,
        "manual"
      )
    ).rejects.toMatchObject({ code: "offer_ineligible" });
    expect((await db.query("SELECT id FROM offer_claims", [])).rows).toEqual([]);
  });
  it("rejects a changed or blocked quoted promotion without altering the saved referral", async () => {
    const { profile } = await enrol();
    const offers = service(),
      saved = await offers.apply(actor(), profile.code, false, "manual");
    const sale = await promotion(3000);
    const quote = await offers.quote(actor(), { target_plan: "solo", interval: "month" });
    await db.query("UPDATE offer_codes SET blocked=true WHERE version_id=$1", [sale.version_id]);
    await expect(
      offers.prepareCheckout(actor(), offers.verifyQuote(quote.confirmation_token, actor())!)
    ).rejects.toMatchObject({ code: "offer_context_changed" });
    expect(await store.claims.read(actor())).toEqual(saved);
  });
  it("preserves the original creator agreement when a same-code revision offers a better confirmed price", async () => {
    const { profile, version } = await enrol();
    const offers = service();
    await offers.apply(actor(), profile.code, false, "manual");
    const revised = await store.createDraft({
      actor_user_id: operator,
      programme_id: version.programme_id,
      name: "Better referral price",
      public_description: "Revised terms",
      policy: { ...version.policy, discount_basis_points: 3000, commission_basis_points: 7500 }
    });
    await store.bindProvider({
      actor_user_id: operator,
      version_id: revised.version_id,
      coupon_id: "coupon_revised",
      livemode: false
    });
    await store.setState({
      actor_user_id: operator,
      version_id: revised.version_id,
      expected_state: "draft",
      state: "active",
      acknowledge_unlimited: true
    });
    await store.creators.join({
      user_id: creator,
      version_id: revised.version_id,
      terms_version: revised.policy.terms_version
    });
    const quote = await offers.quote(actor(), { target_plan: "solo", interval: "month" });
    expect(quote).toMatchObject({ version_id: revised.version_id, initial_total_minor: 350 });
    await offers.prepareCheckout(actor(), offers.verifyQuote(quote.confirmation_token, actor())!);
    expect((await store.claims.read(actor()))?.version.version_id).toBe(revised.version_id);
    expect(
      (
        await db.query("SELECT referral_version_id FROM offer_claims WHERE organization_id=$1", [
          organization
        ])
      ).rows
    ).toEqual([{ referral_version_id: version.version_id }]);
  });
  it("keeps a usable early-purchase grant until the ordinary wait permits a cheaper campaign", async () => {
    const version = await createOfferTestProgramme(store, operator, {
      ...offerIntegrationPolicy,
      allow_early_purchase_grants: true
    });
    await store.creators.join({
      user_id: creator,
      version_id: version.version_id,
      terms_version: version.policy.terms_version
    });
    const profile = await store.creators.claimCode({ user_id: creator, code: "EARLY20" });
    const offers = service(),
      saved = await offers.apply(actor(), profile.code, false, "manual");
    await offers.benefits.grantEarlyPurchase({
      claim_id: saved.claim_id,
      operator_user_id: operator,
      reason: "Verified early purchase",
      expires_at: new Date(Date.now() + 3600000).toISOString()
    });
    const sale = await promotion(3000);
    expect(await offers.quote(actor(), { target_plan: "solo", interval: "month" })).toMatchObject({
      version_id: version.version_id,
      initial_total_minor: 400
    });
    await db.query(
      "UPDATE organizations SET trial_plan='solo',trial_started_at=now()-interval '8 days',trial_ends_at=now()+interval '22 days' WHERE id=$1",
      [organization]
    );
    expect(await offers.quote(actor(), { target_plan: "solo", interval: "month" })).toMatchObject({
      version_id: sale.version_id,
      initial_total_minor: 350
    });
    expect(await store.claims.read(actor())).toEqual(saved);
  });
  it("does not restore an offer removed after a cheaper quote was previewed", async () => {
    const { profile } = await enrol();
    const offers = service();
    await offers.apply(actor(), profile.code, false, "manual");
    await promotion(3000);
    const quote = await offers.quote(actor(), { target_plan: "solo", interval: "month" });
    await store.claims.remove(actor());
    await expect(
      offers.prepareCheckout(actor(), offers.verifyQuote(quote.confirmation_token, actor())!)
    ).rejects.toMatchObject({ code: "offer_context_changed" });
    expect((await store.claims.read(actor()))?.status).toBe("revoked");
  });

  it.each(["removed", "expired"])(
    "does not replace a claim %s during provider eligibility verification",
    async (change) => {
      const { profile, version } = await enrol();
      const offers = service();
      const saved = await offers.apply(actor(), profile.code, false, "manual");
      const sale = await promotion(3000);
      const quote = await offers.quote(actor(), { target_plan: "solo", interval: "month" });
      let changed = false;
      const confirming = service(async () => {
        if (change === "removed") await store.claims.remove(actor());
        else
          await db.query(
            "UPDATE offer_claims SET redeem_by=now()-interval '1 second' WHERE id=$1",
            [saved.claim_id]
          );
        changed = true;
      });
      await expect(
        confirming.prepareCheckout(actor(), offers.verifyQuote(quote.confirmation_token, actor())!)
      ).rejects.toMatchObject({ code: "offer_context_changed" });
      expect(changed).toBe(true);
      expect(await store.claims.read(actor())).toMatchObject({
        claim_id: saved.claim_id,
        version: { version_id: version.version_id },
        status: change === "removed" ? "revoked" : "expired"
      });
      expect((await store.getVersion(sale.version_id)).claims_count).toBe(0);
      expect(
        (
          await db.query(
            "SELECT id FROM offer_claim_history WHERE claim_id=$1 AND action='replace'",
            [saved.claim_id]
          )
        ).rows
      ).toHaveLength(0);
    }
  );
  it("rejects a withdrawn replacement before Checkout and keeps the saved agreement", async () => {
    const { profile } = await enrol();
    const offers = service();
    const saved = await offers.apply(actor(), profile.code, false, "manual");
    const sale = await promotion(3000);
    const quote = await offers.quote(actor(), { target_plan: "solo", interval: "month" });
    expect(quote.version_id).toBe(sale.version_id);
    await store.setState({
      actor_user_id: operator,
      version_id: sale.version_id,
      expected_state: "active",
      state: "paused",
      acknowledge_unlimited: true
    });
    await expect(
      offers.prepareCheckout(actor(), offers.verifyQuote(quote.confirmation_token, actor())!)
    ).rejects.toMatchObject({ code: "offer_context_changed" });
    expect(await store.claims.read(actor())).toEqual(saved);
    expect((await db.query("SELECT id FROM billing_checkout_attempts", [])).rows).toHaveLength(0);
  });
});
