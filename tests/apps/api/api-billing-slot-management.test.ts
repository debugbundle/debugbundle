import { describe, expect, it } from "vitest";

import { buildSchedulePhasesForReduction } from "../../../apps/api/src/billing-slot-management.js";
import type { StripePriceMapping } from "../../../apps/api/src/stripe-config.js";
import type Stripe from "stripe";

function buildSummary(additionalPurchased: number) {
  return {
    plan: "solo",
    stripe_customer_id: "cus_123",
    active_projects: 2,
    capacity_units: {
      total: 3 + additionalPurchased,
      included: 3,
      additional_purchased: additionalPurchased,
      pending_reduction: null
    },
    usage_window: {
      starts_at: "2026-03-23T11:56:12.000Z",
      ends_at: "2026-04-23T11:56:12.000Z"
    },
    allowances: {
      monthly_bundle_requests: { used: 20, limit: 1250 },
      monthly_raw_ingested_events: { used: 200, limit: 10000 },
      retained_bundle_cap: { used: 5, limit: 750 },
      monthly_remote_activations: { used: 1, limit: 125 },
      monthly_alert_deliveries: { used: 3, limit: 375 },
      monthly_webhook_deliveries: { used: 6, limit: 1250 }
    }
  };
}

function buildSubscriptionItem(priceId: string, quantity: number): Stripe.SubscriptionItem {
  return {
    id: `si_${priceId}`,
    price: {
      id: priceId,
      recurring: {
        interval: "month",
        interval_count: 1
      }
    } as Stripe.Price,
    quantity
  } as Stripe.SubscriptionItem;
}

function buildPriceMap(): Map<string, StripePriceMapping> {
  return new Map([
    ["price_solo", { plan: "solo", type: "plan" }],
    ["price_solo_capacity_legacy", { plan: "solo", type: "extra_capacity" }],
    ["price_solo_capacity_current", { plan: "solo", type: "extra_capacity" }]
  ]);
}

describe("buildSchedulePhasesForReduction", () => {
  it("preserves the live extra-capacity price on current and future phases", () => {
    const phases = buildSchedulePhasesForReduction({
      subscription: {
        items: {
          data: [buildSubscriptionItem("price_solo", 1), buildSubscriptionItem("price_solo_capacity_legacy", 2)]
        }
      } as Stripe.Subscription,
      stripeConfig: {
        priceMap: buildPriceMap(),
        soloExtraCapacityPriceId: "price_solo_capacity_current",
        teamExtraCapacityPriceId: "price_team_capacity_current"
      } as never,
      summary: buildSummary(2),
      targetAdditionalPurchased: 1,
      plan: "solo"
    });

    expect(phases[0]?.items).toEqual([
      { price: "price_solo", quantity: 1 },
      { price: "price_solo_capacity_legacy", quantity: 2 }
    ]);
    expect(phases[1]?.items).toEqual([
      { price: "price_solo", quantity: 1 },
      { price: "price_solo_capacity_legacy", quantity: 1 }
    ]);
  });

  it("drops the extra-capacity line item entirely when reducing to zero", () => {
    const phases = buildSchedulePhasesForReduction({
      subscription: {
        items: {
          data: [buildSubscriptionItem("price_solo", 1), buildSubscriptionItem("price_solo_capacity_legacy", 2)]
        }
      } as Stripe.Subscription,
      stripeConfig: {
        priceMap: buildPriceMap(),
        soloExtraCapacityPriceId: "price_solo_capacity_current",
        teamExtraCapacityPriceId: "price_team_capacity_current"
      } as never,
      summary: buildSummary(2),
      targetAdditionalPurchased: 0,
      plan: "solo"
    });

    expect(phases[0]?.items).toEqual([
      { price: "price_solo", quantity: 1 },
      { price: "price_solo_capacity_legacy", quantity: 2 }
    ]);
    expect(phases[1]?.items).toEqual([{ price: "price_solo", quantity: 1 }]);
  });
});