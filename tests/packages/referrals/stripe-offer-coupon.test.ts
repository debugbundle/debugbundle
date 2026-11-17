import { expect, it } from "vitest";
import { stripeOfferCouponFixture } from "../../helpers/stripe-offer-coupon.js";
import { readVerifiedStripeOfferCoupon } from "../../../packages/referrals/src/stripe-offer-coupon.js";
import type { OfferPolicy } from "../../../packages/referrals/src/programme-policy.js";

const policy: OfferPolicy = {
  kind: "referral",
  discount_basis_points: 2000,
  eligible_plans: ["solo", "team", "business"],
  eligible_intervals: ["month", "year"],
  commission_basis_points: 5000,
  commission_months: 12,
  claims_start_at: "2026-11-01T00:00:00.000Z",
  claims_end_at: null,
  redeem_by: null,
  max_claims: null,
  allow_early_purchase_grants: false,
  terms_version: "v2"
};
const fixture = stripeOfferCouponFixture;
it("verifies the frozen percentage and only eligible base products across all six prices", async () => {
  const f = fixture();
  expect(
    await readVerifiedStripeOfferCoupon(
      f.provider,
      "coupon_offer",
      "price_solo_plan_month",
      policy,
      false
    )
  ).toBe("coupon_offer");
  expect(f.coupons).toHaveBeenCalledWith(
    "coupon_offer",
    { expand: ["applies_to"] },
    expect.objectContaining({ timeout: 8000, maxNetworkRetries: 0 })
  );
});
it("retains monthly-only admission when the same plan shares a product across intervals", async () => {
  const f = fixture();
  f.coupon.applies_to.products = ["prod_solo"];
  const selected: OfferPolicy = {
    ...policy,
    eligible_plans: ["solo"],
    eligible_intervals: ["month"]
  };
  await expect(
    readVerifiedStripeOfferCoupon(
      f.provider,
      "coupon_offer",
      "price_solo_plan_month",
      selected,
      false
    )
  ).resolves.toBe("coupon_offer");
  await expect(
    readVerifiedStripeOfferCoupon(
      f.provider,
      "coupon_offer",
      "price_solo_plan_year",
      selected,
      false
    )
  ).rejects.toThrow("offer_coupon_unverified");
});
it.each(["amount", "duration", "mode", "capacity", "foreign", "scope", "shared", "cap", "expiry"])(
  "rejects unsafe coupon %s",
  async (reason) => {
    const f = fixture();
    if (reason === "cap") f.coupon.max_redemptions = 10;
    if (reason === "expiry") f.coupon.redeem_by = 2000000000;
    if (reason === "amount") f.coupon.percent_off = 10;
    if (reason === "duration") f.coupon.duration = "forever";
    if (reason === "mode") f.coupon.livemode = true;
    if (reason === "capacity") f.coupon.applies_to.products.push("prod_capacity_solo");
    if (reason === "foreign") f.coupon.id = "other";
    if (reason === "scope") f.coupon.applies_to.products = ["prod_business"];
    const readPrice = f.prices.getMockImplementation()!;
    if (reason === "shared")
      f.prices.mockImplementation(async (id: string) => ({
        ...(await readPrice(id)),
        product: "prod_solo"
      }));
    await expect(
      readVerifiedStripeOfferCoupon(
        f.provider,
        "coupon_offer",
        "price_solo_plan_month",
        policy,
        false
      )
    ).rejects.toThrow("offer_coupon_unverified");
  }
);
