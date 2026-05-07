import { describe, expect, it } from "vitest";

import {
  createStripeConfig,
  deriveBillingState,
  derivePlanFromSubscriptionItems,
  isEntitlementEligible
} from "../../../apps/api/src/stripe-config.js";
import type { StripePriceMapping } from "../../../apps/api/src/stripe-config.js";
import type Stripe from "stripe";

describe("createStripeConfig", () => {
  it("should return null when STRIPE_SECRET_KEY is missing", () => {
    const result = createStripeConfig({
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      STRIPE_SOLO_PRICE_ID: "price_solo",
      STRIPE_TEAM_PRICE_ID: "price_team",
      STRIPE_SOLO_EXTRA_CAPACITY_PRICE_ID: "price_solo_capacity",
      STRIPE_TEAM_EXTRA_CAPACITY_PRICE_ID: "price_team_capacity"
    });

    expect(result).toBeNull();
  });

  it("should return null when any required env var is missing", () => {
    const base = {
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      STRIPE_SOLO_PRICE_ID: "price_solo",
      STRIPE_TEAM_PRICE_ID: "price_team",
      STRIPE_SOLO_EXTRA_CAPACITY_PRICE_ID: "price_solo_capacity",
      STRIPE_TEAM_EXTRA_CAPACITY_PRICE_ID: "price_team_capacity"
    };

    for (const key of Object.keys(base)) {
      const env = { ...base, [key]: "" };
      expect(createStripeConfig(env)).toBeNull();
    }
  });

  it("should return a valid config when all env vars are present", () => {
    const env = {
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      STRIPE_SOLO_PRICE_ID: "price_solo",
      STRIPE_TEAM_PRICE_ID: "price_team",
      STRIPE_SOLO_EXTRA_CAPACITY_PRICE_ID: "price_solo_capacity",
      STRIPE_TEAM_EXTRA_CAPACITY_PRICE_ID: "price_team_capacity"
    };

    const config = createStripeConfig(env);

    expect(config).not.toBeNull();
    expect(config!.webhookSecret).toBe("whsec_test");
    expect(config!.soloPriceId).toBe("price_solo");
    expect(config!.teamPriceId).toBe("price_team");
    expect(config!.soloExtraCapacityPriceId).toBe("price_solo_capacity");
    expect(config!.teamExtraCapacityPriceId).toBe("price_team_capacity");
    expect(config!.priceMap.size).toBe(4);
    expect(config!.priceMap.get("price_solo")).toEqual({ plan: "solo", type: "plan" });
    expect(config!.priceMap.get("price_team")).toEqual({ plan: "team", type: "plan" });
    expect(config!.priceMap.get("price_solo_capacity")).toEqual({ plan: "solo", type: "extra_capacity" });
    expect(config!.priceMap.get("price_team_capacity")).toEqual({ plan: "team", type: "extra_capacity" });
  });

  it("should trim whitespace from env var values", () => {
    const env = {
      STRIPE_SECRET_KEY: "  sk_test_123  ",
      STRIPE_WEBHOOK_SECRET: "  whsec_test  ",
      STRIPE_SOLO_PRICE_ID: " price_solo ",
      STRIPE_TEAM_PRICE_ID: " price_team ",
      STRIPE_SOLO_EXTRA_CAPACITY_PRICE_ID: " price_solo_capacity ",
      STRIPE_TEAM_EXTRA_CAPACITY_PRICE_ID: " price_team_capacity "
    };

    const config = createStripeConfig(env);

    expect(config).not.toBeNull();
    expect(config!.webhookSecret).toBe("whsec_test");
    expect(config!.soloPriceId).toBe("price_solo");
  });
});

describe("derivePlanFromSubscriptionItems", () => {
  function buildPriceMap(): Map<string, StripePriceMapping> {
    return new Map([
      ["price_solo", { plan: "solo", type: "plan" }],
      ["price_team", { plan: "team", type: "plan" }],
      ["price_solo_capacity", { plan: "solo", type: "extra_capacity" }],
      ["price_team_capacity", { plan: "team", type: "extra_capacity" }]
    ]);
  }

  function buildItem(priceId: string, quantity: number): Stripe.SubscriptionItem {
    return { price: { id: priceId } as Stripe.Price, quantity } as Stripe.SubscriptionItem;
  }

  it("should return free plan when no items match the price map", () => {
    const result = derivePlanFromSubscriptionItems(
      [buildItem("price_unknown", 1)],
      buildPriceMap()
    );

    expect(result).toEqual({ plan: "free", extraCapacityQuantity: 0 });
  });

  it("should return free plan for empty items array", () => {
    const result = derivePlanFromSubscriptionItems([], buildPriceMap());

    expect(result).toEqual({ plan: "free", extraCapacityQuantity: 0 });
  });

  it("should detect solo plan from subscription items", () => {
    const result = derivePlanFromSubscriptionItems(
      [buildItem("price_solo", 1)],
      buildPriceMap()
    );

    expect(result).toEqual({ plan: "solo", extraCapacityQuantity: 0 });
  });

  it("should detect team plan from subscription items", () => {
    const result = derivePlanFromSubscriptionItems(
      [buildItem("price_team", 1)],
      buildPriceMap()
    );

    expect(result).toEqual({ plan: "team", extraCapacityQuantity: 0 });
  });

    it("should detect plan with extra capacity", () => {
    const result = derivePlanFromSubscriptionItems(
      [
        buildItem("price_team", 1),
          buildItem("price_team_capacity", 3)
      ],
      buildPriceMap()
    );

    expect(result).toEqual({ plan: "team", extraCapacityQuantity: 3 });
  });

  it("should handle items with missing quantity as 0 extra capacity", () => {
    const item = { price: { id: "price_solo_capacity" } as Stripe.Price } as Stripe.SubscriptionItem;
    // quantity is undefined
    const result = derivePlanFromSubscriptionItems([item], buildPriceMap());

    expect(result).toEqual({ plan: "free", extraCapacityQuantity: 0 });
  });
});

describe("deriveBillingState", () => {
  it("should map active to active", () => {
    expect(deriveBillingState("active")).toBe("active");
  });

  it("should map trialing to active", () => {
    expect(deriveBillingState("trialing")).toBe("active");
  });

  it("should map past_due to past_due", () => {
    expect(deriveBillingState("past_due")).toBe("past_due");
  });

  it("should map canceled to canceled", () => {
    expect(deriveBillingState("canceled")).toBe("canceled");
  });

  it("should map unpaid to unpaid", () => {
    expect(deriveBillingState("unpaid")).toBe("unpaid");
  });

  it("should map incomplete to incomplete", () => {
    expect(deriveBillingState("incomplete")).toBe("incomplete");
  });

  it("should map incomplete_expired to canceled", () => {
    expect(deriveBillingState("incomplete_expired")).toBe("canceled");
  });

  it("should map paused to canceled", () => {
    expect(deriveBillingState("paused")).toBe("canceled");
  });
});

describe("isEntitlementEligible", () => {
  it("should return true for active billing state", () => {
    expect(isEntitlementEligible("active")).toBe(true);
  });

  it("should keep base plan entitlements active for past_due billing state", () => {
    expect(isEntitlementEligible("past_due")).toBe(true);
    expect(isEntitlementEligible("past_due", "extra_capacity")).toBe(true);
  });

  it("should return false for canceled billing state", () => {
    expect(isEntitlementEligible("canceled")).toBe(false);
  });

  it("should return false for unpaid billing state", () => {
    expect(isEntitlementEligible("unpaid")).toBe(false);
  });

  it("should keep only the base plan active for incomplete billing state", () => {
    expect(isEntitlementEligible("incomplete")).toBe(true);
    expect(isEntitlementEligible("incomplete", "extra_capacity")).toBe(false);
  });
});
