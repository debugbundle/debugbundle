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
import { createReferralStore } from "../../packages/storage/src/referral-store.js";
import { REFERRAL_TERMS_VERSION } from "../../packages/referrals/src/referral-contracts.js";
import { mockedObject } from "../helpers/vitest.js";
import type { StripeConfig } from "../../apps/api/src/stripe-config.js";
import { saveSignupOfferIntent } from "../../packages/storage/src/offer-signup-store.js";
import { offerIdentityHash } from "../../packages/storage/src/offer-store-helpers.js";

runIntegration("confirmed first-purchase offer without a saved claim", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  const secret = "unsaved-offer-integration-secret-at-least-thirty-two-characters";
  const store = createOfferProgrammeStore(db, { identityHashSecret: secret });
  let operator: string, owner: string, creator: string, organization: string;
  const offers = () =>
    createDefaultOffers({
      db,
      enabled: true,
      config: { secret, enrollmentEnabled: true },
      operatorEmails: [],
      appBaseUrl: "https://app.example.test",
      stripeConfig: mockedObject<StripeConfig>({
        client: { customers: { list: async () => ({ data: [], has_more: false }) } },
        priceMap: new Map()
      })
    });
  const actor = () => ({ organization_id: organization, actor_user_id: owner });
  const selection = {
    target_plan: "solo" as const,
    interval: "month" as const,
    include_public_offers: true as const
  };
  beforeEach(async () => {
    await resetOfferIntegrationSchema(db);
    operator = await createOfferTestUser(db);
    owner = await createOfferTestUser(db);
    creator = await createOfferTestUser(db);
    organization = await createOfferTestAccount(db, owner);
    await db.query(
      "UPDATE organizations SET trial_plan='solo',trial_started_at=now()-interval '8 days',trial_ends_at=now()+interval '22 days' WHERE id=$1",
      [organization]
    );
  });
  afterAll(async () => {
    await pool.end();
  });
  const promotion = (discount = 3000, cap: number | null = null) =>
    createOfferTestProgramme(store, operator, {
      ...offerIntegrationPolicy,
      kind: "promotion",
      commission_basis_points: 0,
      discount_basis_points: discount,
      max_claims: cap
    });
  const legacyReferral = async () => {
    const legacy = createReferralStore(db, { identityHashSecret: secret });
    const partner = await legacy.joinProgram({
      user_id: creator,
      terms_version: REFERRAL_TERMS_VERSION
    });
    const attribution = await legacy.saveAttribution({
      ...actor(),
      code: partner.code,
      source: "manual",
      explicit_correction: false,
      provider_customer_id_checked: null,
      provider_previously_paid: false
    });
    return { partner, attribution };
  };
  it("previews without writing and creates exactly the confirmed claim once", async () => {
    const sale = await promotion(),
      service = offers();
    const quote = await service.quote(actor(), selection);
    expect(quote).toMatchObject({ version_id: sale.version_id, initial_total_minor: 350 });
    expect(await store.claims.read(actor())).toBeNull();
    expect((await db.query("SELECT id FROM offer_claim_history", [])).rows).toEqual([]);
    const verified = service.verifyQuote(quote.confirmation_token, actor())!;
    expect(await service.prepareCheckout(actor(), verified)).toMatchObject({
      claim_id: quote.claim_id,
      version_id: sale.version_id
    });
    expect(await service.prepareCheckout(actor(), verified)).toMatchObject({
      claim_id: quote.claim_id
    });
    expect((await store.getVersion(sale.version_id)).claims_count).toBe(1);
    expect((await db.query("SELECT id FROM offer_claim_history", [])).rows).toHaveLength(1);
  });
  it("preserves the previous no-claim response unless the caller opts into public offers", async () => {
    await promotion();
    await expect(
      offers().quote(actor(), { target_plan: "solo", interval: "month" })
    ).rejects.toMatchObject({ code: "offer_ineligible" });
    expect(await store.claims.read(actor())).toBeNull();
  });
  it("does not preview a new offer over an admitted ordinary checkout", async () => {
    await promotion();
    await db.query(
      "INSERT INTO billing_checkout_attempts(organization_id,id,target_plan,parameters) VALUES($1,$1,'solo','{}')",
      [organization]
    );
    await expect(offers().quote(actor(), selection)).rejects.toMatchObject({
      code: "offer_ineligible"
    });
    expect(await store.claims.read(actor())).toBeNull();
  });
  it("waits for an unresolved signup referral rather than losing its creator", async () => {
    await promotion();
    await saveSignupOfferIntent(db, {
      organization_id: organization,
      user_id: owner,
      hint: { code: "CREATOR20", expires_at: new Date(Date.now() + 60000).toISOString() }
    });
    await expect(offers().quote(actor(), selection)).rejects.toMatchObject({
      code: "programme_unavailable"
    });
    expect(await store.claims.read(actor())).toBeNull();
  });
  it("retains an existing legacy creator when a cheaper promotional purchase is confirmed", async () => {
    const { partner, attribution } = await legacyReferral();
    const sale = await promotion(),
      service = offers();
    const quote = await service.quote(actor(), { ...selection, target_plan: "business" });
    expect(quote.initial_total_minor).toBe(4130);
    expect(await store.claims.read(actor())).toBeNull();
    await service.prepareCheckout(actor(), service.verifyQuote(quote.confirmation_token, actor())!);
    expect(await store.claims.read(actor())).toMatchObject({
      claim_id: quote.claim_id,
      referral_code: partner.code,
      version: { version_id: sale.version_id }
    });
    expect(
      (
        await db.query(
          "SELECT attribution_id,referral_version_id FROM offer_claims WHERE organization_id=$1",
          [organization]
        )
      ).rows
    ).toEqual([{ attribution_id: attribution.referral_id, referral_version_id: null }]);
  });
  it("leaves an equal legacy referral on its original redemption path", async () => {
    await legacyReferral();
    await promotion(1000);
    await expect(
      offers().quote(actor(), { ...selection, target_plan: "business" })
    ).rejects.toMatchObject({ code: "offer_ineligible" });
    expect(await store.claims.read(actor())).toBeNull();
  });
  it("rejects a new attribution added after preview rather than overwriting it", async () => {
    await promotion();
    const service = offers(),
      quote = await service.quote(actor(), selection);
    await legacyReferral();
    await expect(
      service.prepareCheckout(actor(), service.verifyQuote(quote.confirmation_token, actor())!)
    ).rejects.toMatchObject({ code: "offer_context_changed" });
    expect(await store.claims.read(actor())).toBeNull();
  });
  it("serialises competing fresh confirmations without replacing the winner", async () => {
    const sale = await promotion(),
      service = offers();
    const quotes = await Promise.all([
      service.quote(actor(), selection),
      service.quote(actor(), selection)
    ]);
    const results = await Promise.allSettled(
      quotes.map((quote) =>
        service.prepareCheckout(actor(), service.verifyQuote(quote.confirmation_token, actor())!)
      )
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await store.getVersion(sale.version_id)).claims_count).toBe(1);
  });
  it.each(["blocked", "capped", "expired", "wait", "paid", "pending", "admitted"])(
    "rejects %s confirmation without creating a claim",
    async (reason) => {
      const sale = await promotion(3000, 1),
        service = offers();
      const quote = await service.quote(actor(), selection),
        verified = service.verifyQuote(quote.confirmation_token, actor())!;
      if (reason === "blocked")
        await db.query("UPDATE offer_codes SET blocked=true WHERE version_id=$1", [
          sale.version_id
        ]);
      if (reason === "capped")
        await db.query("UPDATE offer_programme_versions SET claims_count=1 WHERE id=$1", [
          sale.version_id
        ]);
      if (reason === "wait")
        await db.query("UPDATE organizations SET trial_started_at=now() WHERE id=$1", [
          organization
        ]);
      if (reason === "paid")
        await db.query(
          "INSERT INTO billing_customer_history(organization_external_id,owner_identity_hash,first_cash_at,provider_invoice_id,provider_payment_id) VALUES($1,$2,now(),'in_previous','pi_previous')",
          [organization, offerIdentityHash({ identityHashSecret: secret }, `${owner}@example.test`)]
        );
      if (reason === "pending")
        await saveSignupOfferIntent(db, {
          organization_id: organization,
          user_id: owner,
          hint: { code: "CREATOR20", expires_at: new Date(Date.now() + 60000).toISOString() }
        });
      if (reason === "admitted")
        await db.query(
          "INSERT INTO billing_checkout_attempts(organization_id,id,target_plan,parameters) VALUES($1,$1,'solo','{}')",
          [organization]
        );
      await expect(
        service.prepareCheckout(
          actor(),
          reason === "expired"
            ? { ...verified, expires_at: new Date(Date.now() - 60000).toISOString() }
            : verified
        )
      ).rejects.toBeDefined();
      expect(await store.claims.read(actor())).toBeNull();
    }
  );
});
