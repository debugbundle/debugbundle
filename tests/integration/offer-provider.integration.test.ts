import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { createDefaultOffers } from "../../apps/api/src/default-offers.js";
import { createStripeCheckoutLink } from "../../packages/billing/src/stripe-checkout.js";
import type { StripeBillingProvider } from "../../packages/billing/src/stripe-subscription.js";
import { createPostgresBillingCheckoutStore } from "../../packages/storage/src/billing-checkout-store.js";
import { stripeOfferCouponFixture } from "../helpers/stripe-offer-coupon.js";
import { mockedObject } from "../helpers/vitest.js";
import {
  createOfferTestAccount,
  createOfferTestUser,
  offerIntegrationPolicy,
  resetOfferIntegrationSchema
} from "../helpers/offer-integration.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("automatic programme provider preparation", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  let actor: string;
  beforeEach(async () => {
    await resetOfferIntegrationSchema(db);
    actor = await createOfferTestUser(db);
  });
  afterAll(async () => pool.end());
  async function fixture(kind: "referral" | "promotion" = "referral") {
    const provider = stripeOfferCouponFixture();
    const offers = createDefaultOffers({
      db,
      stripeConfig: provider.provider,
      config: {
        secret: "automatic-offer-provider-fixture-at-least-32-characters",
        enrollmentEnabled: true
      },
      enabled: true,
      operatorEmails: [],
      appBaseUrl: "https://app.example.test"
    });
    const draft = await offers.store.createDraft({
      actor_user_id: actor,
      name: "Automatic offer",
      public_description: "Synthetic only",
      policy: {
        ...offerIntegrationPolicy,
        kind,
        commission_basis_points: kind === "promotion" ? 0 : 7500
      }
    });
    const change = {
      actor_user_id: actor,
      version_id: draft.version_id,
      expected_state: "draft" as const,
      state: "active" as const,
      acknowledge_unlimited: true
    };
    return { provider, offers, draft, change };
  }
  it.each([
    ["referral", "active"],
    ["promotion", "active"],
    ["referral", "scheduled"],
    ["promotion", "scheduled"]
  ] as const)(
    "prepares %s automatically for %s and preserves its immutable binding on pause/resume",
    async (kind, state) => {
      const f = await fixture(kind);
      expect((await f.offers.changeState({ ...f.change, state })).state).toBe(state);
      const original = (
        await pool.query(
          "SELECT coupon_id,livemode,configured_by FROM offer_provider_bindings WHERE version_id=$1",
          [f.draft.version_id]
        )
      ).rows[0];
      expect(original).toMatchObject({ livemode: false, configured_by: actor });
      expect(f.provider.create).toHaveBeenCalledOnce();
      await f.offers.changeState({ ...f.change, expected_state: state, state: "paused" });
      await f.offers.changeState({ ...f.change, expected_state: "paused" });
      expect(f.provider.create).toHaveBeenCalledOnce();
      expect(
        (
          await pool.query(
            "SELECT coupon_id,livemode,configured_by FROM offer_provider_bindings WHERE version_id=$1",
            [f.draft.version_id]
          )
        ).rows[0]
      ).toEqual(original);
    }
  );
  it("recovers a successful provider write after binding persistence fails", async () => {
    const f = await fixture();
    vi.spyOn(f.offers.store, "bindProvider").mockRejectedValueOnce(
      new Error("transient database failure")
    );
    await expect(f.offers.changeState(f.change)).rejects.toMatchObject({
      code: "programme_payment_setup_failed"
    });
    expect((await f.offers.store.getVersion(f.draft.version_id)).state).toBe("draft");
    expect((await pool.query("SELECT * FROM offer_provider_bindings")).rows).toHaveLength(0);
    await f.offers.changeState(f.change);
    expect(f.provider.create).toHaveBeenCalledOnce();
    expect((await pool.query("SELECT * FROM offer_provider_bindings")).rows).toHaveLength(1);
  });
  it("keeps provider failures inactive and retries with the same identity", async () => {
    const f = await fixture();
    f.provider.create.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(f.offers.changeState(f.change)).rejects.toMatchObject({
      code: "programme_payment_setup_failed"
    });
    expect((await f.offers.store.getVersion(f.draft.version_id)).state).toBe("draft");
    await f.offers.changeState(f.change);
    expect(f.provider.create.mock.calls[0]![0].id).toBe(f.provider.create.mock.calls[1]![0].id);
    expect((await pool.query("SELECT * FROM offer_provider_bindings")).rows).toHaveLength(1);
  });
  it("serialises competing activations without duplicate bindings or changed coupon identity", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      f.offers.changeState(f.change),
      f.offers.changeState(f.change)
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await pool.query("SELECT * FROM offer_provider_bindings")).rows).toHaveLength(1);
    expect(new Set(f.provider.create.mock.calls.map(([input]) => input.id)).size).toBe(1);
    expect((await f.offers.store.getVersion(f.draft.version_id)).state).toBe("active");
  });
  it.each(["referral", "promotion"] as const)(
    "carries an automatically prepared %s through a saved claim, confirmed quote and retried checkout",
    async (kind) => {
      const f = await fixture(kind);
      const owner = await createOfferTestUser(db),
        org = await createOfferTestAccount(db, owner),
        customer = { actor_user_id: owner, organization_id: org };
      await db.query(
        "UPDATE organizations SET trial_plan='team',trial_started_at=now()-interval '8 days',trial_ends_at=now()+interval '22 days' WHERE id=$1",
        [org]
      );
      const session = {
        id: "cs_automatic_offer",
        client_reference_id: org,
        status: "open",
        url: "https://checkout.stripe.com/automatic-test"
      };
      const create = vi.fn().mockResolvedValue(session);
      f.provider.provider.client = mockedObject<StripeBillingProvider>({
        client: {
          ...f.provider.provider.client,
          customers: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
          checkout: { sessions: { create, retrieve: vi.fn().mockResolvedValue(session) } }
        }
      }).client;
      await f.offers.changeState(f.change);
      if (kind === "referral") {
        await f.offers.store.creators.join({
          user_id: actor,
          version_id: f.draft.version_id,
          terms_version: f.draft.policy.terms_version
        });
        await f.offers.store.creators.claimCode({ user_id: actor, code: "AUTOMATIC20" });
      } else {
        await f.offers.store.createPromotionCode({
          actor_user_id: actor,
          version_id: f.draft.version_id,
          code: "AUTOMATIC20"
        });
      }
      const claim = await f.offers.apply(customer, "AUTOMATIC20", false, "manual");
      const selection = {
        target_plan: "team" as const,
        interval: "year" as const,
        additional_capacity_units: 1
      };
      const quote = await f.offers.quote(customer, selection);
      const proof = f.offers.verifyQuote(quote.confirmation_token, customer);
      expect(proof).toMatchObject({ claim_id: claim.claim_id, version_id: f.draft.version_id });
      expect(quote.discount_minor).toBe(3840);
      expect(quote.renewal_total_minor - quote.initial_total_minor).toBe(quote.discount_minor);
      const checkout = createPostgresBillingCheckoutStore(db);
      const purchase = () =>
        createStripeCheckoutLink({
          stripe: f.provider.provider,
          store: checkout,
          appBaseUrl: "https://app.example.test",
          input: {
            ...selection,
            organization_id: org,
            expected_owner_user_id: owner,
            billing_email: `${owner}@example.test`,
            expected_offer: proof!
          }
        });
      expect(await purchase()).toEqual({ url: session.url });
      expect(await purchase()).toEqual({ url: session.url });
      expect(create).toHaveBeenCalledOnce();
      expect(f.provider.create).toHaveBeenCalledOnce();
      const coupon = f.provider.create.mock.results[0]!.value;
      expect(create.mock.calls[0]![0]).toMatchObject({
        line_items: [
          { price: "price_team_plan_year", quantity: 1 },
          { price: "price_team_extra_capacity_year", quantity: 1 }
        ],
        allow_promotion_codes: false,
        discounts: [{ coupon: (await coupon).id }],
        subscription_data: {
          metadata: { offer_claim_id: claim.claim_id, offer_version_id: f.draft.version_id }
        }
      });
    }
  );
});
