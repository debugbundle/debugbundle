import { describe, expect, it, vi } from "vitest";
import { readStripeCustomerPaymentHistory } from "../../../packages/referrals/src/stripe-customer-eligibility.js";
vi.mock("../../../packages/referrals/src/stripe-customer-eligibility.js", () => ({
  readStripeCustomerPaymentHistory: vi.fn()
}));
import { createStripeCheckoutLink } from "../../../packages/billing/src/stripe-checkout.js";
import type {
  StripeBillingProvider,
  StripePriceMapping
} from "../../../packages/billing/src/stripe-subscription.js";
import type {
  BillingCheckoutAttempt,
  BillingCheckoutStore
} from "../../../packages/storage/src/billing-checkout-store.js";
import type { BillingInterval, PaidTierName } from "../../../packages/shared-types/src/index.js";

function fixture() {
  vi.mocked(readStripeCustomerPaymentHistory).mockReset().mockResolvedValue(false);
  let attempt: BillingCheckoutAttempt | null = null;
  const claim = vi.fn(async (input: Parameters<BillingCheckoutStore["claim"]>[0]) => {
    attempt ??= {
      id: "attempt",
      organization_id: "org",
      target_plan: input.target_plan,
      stripe_session_id: null,
      parameters: input.parameters(null, 4_000_000_000, input.referral_coupon)
    };
    return attempt;
  });
  const store: BillingCheckoutStore = {
    claim,
    saveSession: vi.fn(async (_org, _id, session) => {
      attempt!.stripe_session_id = session;
      return true;
    }),
    retireExpired: vi.fn(async () => true),
    retireEndedSubscription: vi.fn(async () => true)
  };
  const create = vi.fn(async () => ({
    id: "session",
    client_reference_id: "org",
    status: "open",
    url: "https://checkout.stripe.com/test"
  }));
  const retrieve = vi.fn(async () => ({
    id: "session",
    client_reference_id: "org",
    status: "open",
    url: "https://checkout.stripe.com/test"
  }));
  const priceMap = new Map<string, StripePriceMapping>();
  const price = {
    id: "business_year_plan",
    active: true,
    currency: "usd",
    unit_amount: 58800,
    tax_behavior: "exclusive",
    recurring: { interval: "year", interval_count: 1, usage_type: "licensed" }
  };
  const retrievePrice = vi.fn(async (priceId: string) => {
    void priceId;
    return price;
  });
  for (const plan of ["solo", "team", "business"] as const)
    for (const interval of ["month", "year"] as const)
      for (const type of ["plan", "extra_capacity"] as const)
        priceMap.set(`${plan}_${interval}_${type}`, { plan, interval, type, currency: "usd" });
  const provider = {
    businessSalesEnabled: true,
    client: { checkout: { sessions: { create, retrieve } }, prices: { retrieve: retrievePrice } },
    priceMap,
    soloPriceId: "solo_month_plan",
    teamPriceId: "team_month_plan",
    soloExtraCapacityPriceId: "solo_month_extra_capacity",
    teamExtraCapacityPriceId: "team_month_extra_capacity"
  } as unknown as StripeBillingProvider;
  const checkout = (plan: PaidTierName, interval: BillingInterval, quantity = 0) =>
    createStripeCheckoutLink({
      stripe: provider,
      store,
      appBaseUrl: "https://app.debugbundle.test",
      input: {
        organization_id: "org",
        billing_email: "owner@example.test",
        target_plan: plan,
        interval,
        additional_capacity_units: quantity
      }
    });
  return { checkout, provider, create, retrieve, claim, store, price, retrievePrice };
}

describe("interval-aware reserved checkout", () => {
  it.each(["amount", "tax", "interval", "currency", "inactive", "metered"])(
    "refuses a misconfigured new price: %s",
    async (reason) => {
      const f = fixture();
      f.provider.priceMap.set("business_year_plan", {
        plan: "business",
        interval: "year",
        currency: "usd",
        type: "plan",
        amount_minor: 58800
      });
      if (reason === "amount") f.price.unit_amount = 58801;
      if (reason === "tax") f.price.tax_behavior = "inclusive";
      if (reason === "interval") f.price.recurring.interval = "month";
      if (reason === "currency") f.price.currency = "eur";
      if (reason === "inactive") f.price.active = false;
      if (reason === "metered") f.price.recurring.usage_type = "metered";
      expect(await f.checkout("business", "year")).toBe("billing_not_configured");
      expect(f.claim).not.toHaveBeenCalled();
      expect(f.create).not.toHaveBeenCalled();
    }
  );
  it.each([
    ["solo", "month"],
    ["solo", "year"],
    ["team", "month"],
    ["team", "year"],
    ["business", "month"],
    ["business", "year"]
  ] as const)("reserves %s/%s with matching extra-unit pricing", async (plan, interval) => {
    const f = fixture();
    expect(await f.checkout(plan, interval, 99)).toEqual({
      url: "https://checkout.stripe.com/test"
    });
    expect(f.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          { price: `${plan}_${interval}_plan`, quantity: 1 },
          { price: `${plan}_${interval}_extra_capacity`, quantity: 99 }
        ]
      }),
      { timeout: 8000, maxNetworkRetries: 0, idempotencyKey: "billing-checkout:attempt" }
    );
  });
  it("refuses an unconfigured annual offer before reserving or charging", async () => {
    const f = fixture();
    f.provider.priceMap.delete("business_year_plan");
    expect(await f.checkout("business", "year")).toBe("billing_not_configured");
    expect(f.claim).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
  });
  it("reuses the same session and blocks a changed interval or quantity", async () => {
    const f = fixture();
    await f.checkout("business", "year", 2);
    expect(await f.checkout("business", "year", 2)).toEqual({
      url: "https://checkout.stripe.com/test"
    });
    expect(await f.checkout("business", "month", 2)).toBe("checkout_in_progress");
    expect(await f.checkout("business", "year", 3)).toBe("checkout_in_progress");
    expect(f.create).toHaveBeenCalledTimes(1);
  });
  it.each([-1, 100, 1.5, NaN])("rejects invalid extra-unit quantity %s", async (quantity) => {
    const f = fixture();
    expect(await f.checkout("business", "year", quantity)).toBe("checkout_not_allowed");
    expect(f.claim).not.toHaveBeenCalled();
  });
});
it("blocks fresh Business checkout before reservations or provider work when the launch gate is closed", async () => {
  const f = fixture();
  f.provider.businessSalesEnabled = false;
  expect(await f.checkout("business", "year")).toBe("checkout_not_allowed");
  expect(f.claim).not.toHaveBeenCalled();
  expect(f.create).not.toHaveBeenCalled();
  expect(f.retrievePrice).not.toHaveBeenCalled();
});
function referralFixture() {
  const f = fixture(),
    coupon = {
      id: "coupon_referral",
      valid: true,
      livemode: false,
      percent_off: 10,
      amount_off: null,
      duration: "once",
      applies_to: { products: ["prod_business"] }
    };
  f.provider.referralCouponId = "coupon_referral";
  const retrieveCoupon = vi.fn().mockResolvedValue(coupon);
  f.provider.client.coupons = {
    retrieve: retrieveCoupon
  } as unknown as typeof f.provider.client.coupons;
  f.retrievePrice.mockImplementation(async (id: string) => ({
    ...f.price,
    id,
    livemode: false,
    product: id.includes("extra_capacity") ? "prod_capacity" : "prod_business"
  }));
  f.store.getReferralCheckoutContext = vi.fn().mockResolvedValue({
    attribution_id: "11111111-1111-4111-8111-111111111111",
    discount_eligible: true,
    current_customer_id: null,
    verified_owner_email: "owner@example.test"
  });
  vi.mocked(f.store.claim).mockResolvedValueOnce("referral_coupon_required");
  const request = {
    stripe: f.provider,
    store: f.store,
    appBaseUrl: "https://app.debugbundle.test",
    input: {
      organization_id: "org",
      billing_email: "owner@example.test",
      target_plan: "business" as const,
      interval: "year" as const,
      expected_owner_user_id: "owner"
    }
  };
  return { ...f, request, retrieveCoupon };
}
it("applies the verified referral coupon only after the store asks for an eligible Business reservation", async () => {
  const f = referralFixture();
  expect(await createStripeCheckoutLink(f.request)).toEqual({
    url: "https://checkout.stripe.com/test"
  });
  expect(f.create).toHaveBeenCalledWith(
    expect.objectContaining({
      allow_promotion_codes: false,
      discounts: [{ coupon: "coupon_referral" }]
    }),
    expect.any(Object)
  );
  expect(f.retrieveCoupon).toHaveBeenCalledOnce();
});
it("does not create a full-price referral checkout when its promised coupon is unconfigured", async () => {
  const f = fixture();
  vi.mocked(f.store.claim).mockResolvedValueOnce("referral_coupon_required");
  expect(await f.checkout("business", "year")).toBe("billing_not_configured");
  expect(f.create).not.toHaveBeenCalled();
});

it("rechecks provider payment history before a fresh referred checkout", async () => {
  const f = referralFixture();
  vi.mocked(readStripeCustomerPaymentHistory).mockResolvedValue(true);
  expect(await createStripeCheckoutLink(f.request)).toBe("checkout_not_allowed");
  expect(f.create).not.toHaveBeenCalled();
  expect(f.claim).toHaveBeenCalledTimes(1);
});
it("recovers the exact coupon-bearing request after a lost response without reassessing the admitted benefit", async () => {
  const f = referralFixture();
  f.create.mockRejectedValueOnce(new Error("ack_lost"));
  expect(await createStripeCheckoutLink(f.request)).toBe("billing_service_error");
  const admitted = f.create.mock.calls[0];
  vi.mocked(readStripeCustomerPaymentHistory).mockResolvedValue(true);
  f.retrieveCoupon.mockRejectedValue(new Error("coupon_deleted"));
  expect(await createStripeCheckoutLink(f.request)).toEqual({
    url: "https://checkout.stripe.com/test"
  });
  expect(f.create.mock.calls[1]).toEqual(admitted);
  expect(readStripeCustomerPaymentHistory).toHaveBeenCalledTimes(1);
  expect(f.retrieveCoupon).toHaveBeenCalledTimes(1);
});
