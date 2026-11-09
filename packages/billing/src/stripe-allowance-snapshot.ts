import type Stripe from "stripe";
import type { BillingEntitlementUpdate } from "../../storage/src/billing-sync-store.js";
import type { StripePriceMapping } from "./stripe-subscription.js";

/** Provider paid terms and monthly allowance clocks are separate persisted facts. */
export function stripeAllowanceSnapshot(
  subscription: Stripe.Subscription,
  priceMap: ReadonlyMap<string, StripePriceMapping>,
  periodStart: string | null
): Pick<BillingEntitlementUpdate, "billing_interval" | "billing_allowance_anchor_at"> {
  const base = subscription.items.data.find((item) => priceMap.get(item.price.id)?.type === "plan");
  const mapping = base === undefined ? undefined : priceMap.get(base.price.id);
  if (!mapping) return {};
  const anchor = subscription.billing_cycle_anchor;
  return {
    billing_interval: mapping.interval ?? "month",
    billing_allowance_anchor_at:
      Number.isSafeInteger(anchor) && anchor > 0
        ? new Date(anchor * 1000).toISOString()
        : periodStart
  };
}
