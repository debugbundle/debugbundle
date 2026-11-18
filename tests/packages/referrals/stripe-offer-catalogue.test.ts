import { expect, it } from "vitest";
import { prepareStripeOfferCoupon } from "../../../packages/referrals/src/stripe-offer-provisioning.js";
import { readVerifiedStripeOfferCoupon } from "../../../packages/referrals/src/stripe-offer-coupon.js";
import { stripeOfferCouponFixture } from "../../helpers/stripe-offer-coupon.js";
import { offerVersion } from "../../helpers/offer-fixtures.js";

function fixture() {
  const f = stripeOfferCouponFixture();
  const price = f.prices.getMockImplementation()!;
  return { ...f, price };
}

it("rejects ambiguous purchase price selection before preparing a coupon", async () => {
  const f = fixture();
  f.provider.priceMap.set("price_solo_duplicate_month", {
    plan: "solo",
    type: "plan",
    interval: "month",
    currency: "usd"
  });
  await expect(prepareStripeOfferCoupon(f.provider, offerVersion)).rejects.toThrow(
    "offer_coupon_unverified"
  );
  expect(f.create).not.toHaveBeenCalled();
});

it.each(["amount", "currency", "interval", "interval count", "usage", "tax"])(
  "rejects provider %s that disagrees with the advertised base price before preparing a coupon",
  async (reason) => {
    const f = fixture();
    f.prices.mockImplementation(async (id) => {
      const price = await f.price(id);
      if (id !== "price_solo_plan_month") return price;
      if (reason === "amount") price.unit_amount += 1;
      if (reason === "currency") price.currency = "eur";
      if (reason === "interval") price.recurring.interval = "year";
      if (reason === "interval count") price.recurring.interval_count = 2;
      if (reason === "usage") price.recurring.usage_type = "metered";
      if (reason === "tax") price.tax_behavior = "inclusive";
      return price;
    });
    await expect(prepareStripeOfferCoupon(f.provider, offerVersion)).rejects.toThrow(
      "offer_coupon_unverified"
    );
    expect(f.create).not.toHaveBeenCalled();
  }
);

it.each([false, true])(
  "checks retained capacity products even when inactive=%s",
  async (inactive) => {
    const f = fixture();
    f.provider.priceMap.set("price_team_retained_capacity", {
      plan: "team",
      type: "extra_capacity",
      purchasable: false
    });
    f.prices.mockImplementation(async (id) => ({
      ...(await f.price(id)),
      ...(id === "price_team_retained_capacity" ? { active: !inactive, product: "prod_team" } : {})
    }));
    await expect(prepareStripeOfferCoupon(f.provider, offerVersion)).rejects.toThrow(
      "offer_coupon_unverified"
    );
    expect(f.create).not.toHaveBeenCalled();
    await expect(
      readVerifiedStripeOfferCoupon(
        f.provider,
        "coupon_offer",
        "price_team_plan_month",
        offerVersion.policy,
        false
      )
    ).rejects.toThrow("offer_coupon_unverified");
  }
);

it("retains separate inactive historical capacity without offering it for new purchases", async () => {
  const f = fixture();
  f.provider.priceMap.set("price_team_retained_capacity", {
    plan: "team",
    type: "extra_capacity",
    purchasable: false
  });
  f.prices.mockImplementation(async (id) => ({
    ...(await f.price(id)),
    ...(id === "price_team_retained_capacity"
      ? { active: false, product: "prod_retained_capacity" }
      : {})
  }));
  const binding = await prepareStripeOfferCoupon(f.provider, offerVersion);
  await expect(
    readVerifiedStripeOfferCoupon(
      f.provider,
      binding.coupon_id,
      "price_team_plan_month",
      offerVersion.policy,
      false
    )
  ).resolves.toBe(binding.coupon_id);
  expect(f.create.mock.calls[0]![0].applies_to?.products).not.toContain("prod_retained_capacity");
});
