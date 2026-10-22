import { expect, it } from "vitest";
import { assertSupportedSubscriptionItems } from "../../../packages/billing/src/stripe-subscription.js";
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
