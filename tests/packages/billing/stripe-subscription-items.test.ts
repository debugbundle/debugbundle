import { expect, it } from "vitest";
import { assertSupportedSubscriptionItems } from "../../../packages/billing/src/stripe-subscription.js";
import type Stripe from "stripe";
import type { StripePriceMapping } from "../../../packages/billing/src/stripe-subscription.js";
const mapping = new Map([
  ["price_solo", { plan: "solo", type: "plan" }],
  ["price_team", { plan: "team", type: "plan" }],
  ["price_extra", { plan: "solo", type: "extra_capacity" }]
]);
it.each(["unknown", "two_plans", "wrong_capacity_plan", "quantity", "pagination"])(
  "rejects %s subscription layouts instead of inventing entitlements",
  (reason) => {
    const sub = {
      items: { has_more: false, data: [{ price: { id: "price_solo" }, quantity: 1 }] }
    };
    if (reason === "unknown") sub.items.data.push({ price: { id: "unknown_price" }, quantity: 1 });
    if (reason === "two_plans") sub.items.data.push({ price: { id: "price_team" }, quantity: 1 });
    if (reason === "wrong_capacity_plan") {
      sub.items.data[0]!.price.id = "price_team";
      sub.items.data.push({ price: { id: "price_extra" }, quantity: 3 });
    }
    if (reason === "quantity") sub.items.data[0]!.quantity = 3;
    if (reason === "pagination") sub.items.has_more = true;
    expect(() => assertSupportedSubscriptionItems(sub as never, mapping as never)).toThrow(
      "billing_subscription_items_unsupported"
    );
  }
);

const annualMapping = new Map<string, StripePriceMapping>([
  ["business_year", { plan: "business", type: "plan", interval: "year", currency: "usd" }],
  [
    "business_extra_year",
    { plan: "business", type: "extra_capacity", interval: "year", currency: "usd" }
  ],
  [
    "business_extra_month",
    { plan: "business", type: "extra_capacity", interval: "month", currency: "usd" }
  ]
]);
function annualSubscription(): Stripe.Subscription {
  return {
    items: {
      has_more: false,
      data: [
        {
          price: {
            id: "business_year",
            currency: "usd",
            recurring: { interval: "year", interval_count: 1 }
          },
          quantity: 1
        },
        {
          price: {
            id: "business_extra_year",
            currency: "usd",
            recurring: { interval: "year", interval_count: 1 }
          },
          quantity: 99
        }
      ]
    }
  } as Stripe.Subscription;
}
it("accepts a Business annual base and matching capacity", () => {
  expect(() => assertSupportedSubscriptionItems(annualSubscription(), annualMapping)).not.toThrow();
});
it.each(["mixed_interval", "provider_interval", "provider_currency", "interval_count"])(
  "refuses inconsistent annual item metadata: %s",
  (reason) => {
    const subscription = annualSubscription();
    const price = subscription.items.data[1]!.price;
    if (reason === "mixed_interval") price.id = "business_extra_month";
    if (reason === "provider_interval") price.recurring!.interval = "month";
    if (reason === "provider_currency") price.currency = "eur";
    if (reason === "interval_count") price.recurring!.interval_count = 2;
    expect(() => assertSupportedSubscriptionItems(subscription, annualMapping)).toThrow(
      "billing_subscription_items_unsupported"
    );
  }
);
