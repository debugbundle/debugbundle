import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  buildStripeOfferItems,
  findStripeCatalogPrice,
  readStripeSubscriptionOffer
} from "../../../packages/billing/src/stripe-price-catalog.js";
import type { StripePriceMapping } from "../../../packages/billing/src/stripe-subscription.js";

const priceMap = new Map<string, StripePriceMapping>([
  ["team", { plan: "team", type: "plan" }],
  ["legacy_extra", { plan: "team", type: "extra_capacity", purchasable: false }],
  ["current_extra", { plan: "team", type: "extra_capacity" }],
  ["business_annual", { plan: "business", type: "plan", interval: "year", currency: "usd" }],
  [
    "business_annual_extra",
    { plan: "business", type: "extra_capacity", interval: "year", currency: "usd" }
  ]
]);
const subscription = {
  items: {
    data: [
      { id: "base", price: { id: "team" }, quantity: 1 },
      { id: "extra", price: { id: "legacy_extra" }, quantity: 99 }
    ]
  }
} as Stripe.Subscription;
describe("Stripe catalogue selection", () => {
  it("keeps retained prices readable while selecting the current extra-unit price", () => {
    expect(readStripeSubscriptionOffer(subscription, priceMap)).toEqual({
      plan: "team",
      interval: "month",
      currency: "usd",
      additional_capacity_units: 99
    });
    expect(
      findStripeCatalogPrice(
        priceMap,
        { plan: "team", interval: "month", currency: "usd" },
        "extra_capacity"
      )
    ).toBe("current_extra");
  });
  it("does not substitute a monthly or lower-tier price for a missing offer", () => {
    expect(
      findStripeCatalogPrice(
        priceMap,
        { plan: "business", interval: "month", currency: "usd" },
        "plan"
      )
    ).toBeNull();
    expect(
      findStripeCatalogPrice(priceMap, { plan: "solo", interval: "year", currency: "usd" }, "plan")
    ).toBeNull();
  });
  it("retains both item IDs and all purchased units in an annual Business change", () => {
    expect(
      buildStripeOfferItems(subscription, priceMap, {
        plan: "business",
        interval: "year",
        currency: "usd"
      })
    ).toEqual([
      { id: "base", price: "business_annual", quantity: 1 },
      { id: "extra", price: "business_annual_extra", quantity: 99 }
    ]);
  });
  it("refuses an ambiguous or partially configured offer", () => {
    const partial = new Map(priceMap);
    partial.delete("business_annual_extra");
    expect(
      buildStripeOfferItems(subscription, partial, {
        plan: "business",
        interval: "year",
        currency: "usd"
      })
    ).toBeNull();
    partial.set("duplicate", { plan: "team", type: "plan" });
    expect(
      findStripeCatalogPrice(partial, { plan: "team", interval: "month", currency: "usd" }, "plan")
    ).toBeNull();
  });
});
