import { expect, it, vi } from "vitest";
import type { StripeBillingProvider } from "../../../packages/billing/src/stripe-subscription.js";
import { readVerifiedStripeReferralCoupon } from "../../../packages/referrals/src/stripe-referral-coupon.js";
function fixture() {
  const coupon = {
    id: "coupon_referral",
    livemode: false,
    valid: true,
    percent_off: 10,
    amount_off: null,
    duration: "once",
    applies_to: { products: ["prod_business"] }
  };
  // Stripe omits product restrictions unless the retrieval explicitly expands them.
  const retrieveCoupon = vi
    .fn()
    .mockImplementation(async (_id: string, params: { expand?: string[] }) =>
      params.expand?.includes("applies_to") ? coupon : { ...coupon, applies_to: undefined }
    );
  const retrievePrice = vi.fn().mockImplementation(async (id: string) => ({
    id,
    active: true,
    livemode: false,
    product: id === "price_capacity" ? "prod_capacity" : "prod_business"
  }));
  const provider = {
    client: { coupons: { retrieve: retrieveCoupon }, prices: { retrieve: retrievePrice } },
    priceMap: new Map([
      ["price_business", { plan: "business", type: "plan", interval: "month", currency: "usd" }],
      [
        "price_capacity",
        { plan: "business", type: "extra_capacity", interval: "month", currency: "usd" }
      ]
    ])
  } as unknown as StripeBillingProvider;
  return { coupon, retrieveCoupon, retrievePrice, provider };
}
it("accepts only a verified ten percent once coupon restricted to configured Business base products", async () => {
  const f = fixture();
  expect(
    await readVerifiedStripeReferralCoupon(f.provider, "coupon_referral", "price_business")
  ).toBe("coupon_referral");
  expect(f.retrieveCoupon).toHaveBeenCalledWith(
    "coupon_referral",
    { expand: ["applies_to"] },
    expect.objectContaining({ timeout: 8000, maxNetworkRetries: 0 })
  );
});
it.each(["percent", "duration", "invalid", "capacity", "unrestricted", "foreign", "mode"])(
  "refuses unsafe coupon configuration: %s",
  async (reason) => {
    const f = fixture();
    if (reason === "percent") f.coupon.percent_off = 20;
    if (reason === "duration") f.coupon.duration = "forever";
    if (reason === "invalid") f.coupon.valid = false;
    if (reason === "capacity") f.coupon.applies_to.products = ["prod_business", "prod_capacity"];
    if (reason === "unrestricted") f.coupon.applies_to.products = [];
    if (reason === "foreign") f.coupon.id = "another_coupon";
    if (reason === "mode") f.coupon.livemode = true;
    await expect(
      readVerifiedStripeReferralCoupon(f.provider, "coupon_referral", "price_business")
    ).rejects.toThrow("referral_coupon_unverified");
  }
);
it("refuses a shared base and capacity product rather than discounting add-ons", async () => {
  const f = fixture();
  f.retrievePrice.mockImplementation(async (id: string) => ({
    id,
    active: true,
    livemode: false,
    product: "prod_business"
  }));
  await expect(
    readVerifiedStripeReferralCoupon(f.provider, "coupon_referral", "price_business")
  ).rejects.toThrow("referral_coupon_unverified");
});
