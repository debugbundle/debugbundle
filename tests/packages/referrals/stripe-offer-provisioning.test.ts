import { expect, it } from "vitest";
import { prepareStripeOfferCoupon } from "../../../packages/referrals/src/stripe-offer-provisioning.js";
import { stripeOfferCouponFixture } from "../../helpers/stripe-offer-coupon.js";
import { offerVersion } from "../../helpers/offer-fixtures.js";

it.each([false, true])(
  "prepares the frozen base-only discount in server-determined mode live=%s",
  async (live) => {
    const f = stripeOfferCouponFixture(live);
    const binding = await prepareStripeOfferCoupon(f.provider, offerVersion);
    expect(binding.livemode).toBe(live);
    expect(f.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: binding.coupon_id,
        duration: "once",
        percent_off: 20,
        expand: ["applies_to"],
        applies_to: { products: ["prod_business", "prod_solo", "prod_team"] },
        metadata: {
          offer_programme_id: offerVersion.programme_id,
          offer_version_id: offerVersion.version_id
        }
      }),
      expect.objectContaining({
        idempotencyKey: expect.any(String),
        maxNetworkRetries: 0,
        timeout: expect.any(Number)
      })
    );
    expect(f.create.mock.calls[0]![0]).not.toHaveProperty("max_redemptions");
    expect(f.create.mock.calls[0]![0]).not.toHaveProperty("redeem_by");
    expect(await prepareStripeOfferCoupon(f.provider, offerVersion)).toEqual(binding);
    expect(f.create).toHaveBeenCalledTimes(1);
  }
);

it("recovers a lost create acknowledgement using the same deterministic coupon", async () => {
  const f = stripeOfferCouponFixture(),
    create = f.create.getMockImplementation()!;
  f.create.mockImplementationOnce(async (params) => {
    await create(params);
    throw new Error("provider acknowledgement lost");
  });
  const binding = await prepareStripeOfferCoupon(f.provider, offerVersion);
  expect(f.saved.has(binding.coupon_id)).toBe(true);
  expect(await prepareStripeOfferCoupon(f.provider, offerVersion)).toEqual(binding);
  expect(f.create).toHaveBeenCalledTimes(1);
});

it.each(["percent", "metadata", "expiry", "capacity", "mode"])(
  "rejects existing deterministic coupons with mismatched %s",
  async (reason) => {
    const f = stripeOfferCouponFixture();
    const binding = await prepareStripeOfferCoupon(f.provider, offerVersion);
    const coupon = f.saved.get(binding.coupon_id)!;
    if (reason === "percent") coupon.percent_off = 10;
    if (reason === "metadata") coupon.metadata["offer_version_id"] = offerVersion.programme_id;
    if (reason === "expiry") coupon.redeem_by = 2000000000;
    if (reason === "capacity") coupon.applies_to.products.push("prod_capacity_solo");
    if (reason === "mode") coupon.livemode = true;
    await expect(prepareStripeOfferCoupon(f.provider, offerVersion)).rejects.toThrow(
      "offer_coupon_unverified"
    );
    expect(f.create).toHaveBeenCalledTimes(1);
  }
);

it("rejects incomplete or shared capacity products before creating any provider object", async () => {
  const f = stripeOfferCouponFixture();
  const readPrice = f.prices.getMockImplementation()!;
  f.prices.mockImplementation(async (id) => ({
    ...(await readPrice(id)),
    product: "prod_shared"
  }));
  await expect(prepareStripeOfferCoupon(f.provider, offerVersion)).rejects.toThrow(
    "offer_coupon_unverified"
  );
  expect(f.create).not.toHaveBeenCalled();
  f.provider.priceMap.clear();
  await expect(prepareStripeOfferCoupon(f.provider, offerVersion)).rejects.toThrow(
    "offer_coupon_unverified"
  );
  expect(f.create).not.toHaveBeenCalled();
});

it("supports an internal monthly-only scope when both intervals share a base product", async () => {
  const f = stripeOfferCouponFixture();
  await expect(
    prepareStripeOfferCoupon(f.provider, {
      ...offerVersion,
      policy: { ...offerVersion.policy, eligible_plans: ["solo"], eligible_intervals: ["month"] }
    })
  ).resolves.toMatchObject({ livemode: false });
  expect(f.create.mock.calls[0]![0].applies_to?.products).toEqual(["prod_solo"]);
});

it("does not create on a failed read and bounds an unsuccessful ambiguous write", async () => {
  const f = stripeOfferCouponFixture();
  f.coupons.mockRejectedValueOnce(new Error("private provider failure"));
  await expect(prepareStripeOfferCoupon(f.provider, offerVersion)).rejects.toThrow(
    "offer_coupon_unverified"
  );
  expect(f.create).not.toHaveBeenCalled();
  f.create.mockRejectedValueOnce(new Error("lost write"));
  await expect(prepareStripeOfferCoupon(f.provider, offerVersion)).rejects.toThrow(
    "offer_coupon_unverified"
  );
  expect(f.create).toHaveBeenCalledTimes(1);
});
it.each([
  "mixed mode",
  "wrong price",
  "missing interval",
  "oversized catalogue",
  "excess products"
])("rejects %s before a provider write", async (reason) => {
  const f = stripeOfferCouponFixture();
  const readPrice = f.prices.getMockImplementation()!;
  if (reason === "mixed mode")
    f.prices.mockImplementation(async (id) => ({
      ...(await readPrice(id)),
      livemode: id.includes("business"),
      product: id
    }));
  if (reason === "wrong price")
    f.prices.mockImplementation(async (id) => ({
      ...(await readPrice(id)),
      id: "unexpected",
      product: "product"
    }));
  if (reason === "missing interval") f.provider.priceMap.delete("price_business_plan_year");
  if (reason === "oversized catalogue")
    for (let n = 0; n < 25; n++)
      f.provider.priceMap.set(`overflow_${n}`, { plan: "solo", type: "plan" });
  if (reason === "excess products") {
    f.provider.priceMap.set("duplicate_solo_month", {
      plan: "solo",
      type: "plan",
      interval: "month"
    });
    f.prices.mockImplementation(async (id) => ({
      ...(await readPrice(id)),
      product: `prod_${id}`
    }));
  }
  await expect(prepareStripeOfferCoupon(f.provider, offerVersion)).rejects.toThrow(
    "offer_coupon_unverified"
  );
  expect(f.create).not.toHaveBeenCalled();
});
