import type Stripe from "stripe";
import type { TierName } from "../../shared-types/src/index.js";

export interface StripePriceMapping {
  plan: TierName;
  type: "plan" | "extra_capacity";
}
export interface StripeBillingProvider {
  client: Stripe;
  webhookSecret: string;
  priceMap: Map<string, StripePriceMapping>;
  soloPriceId: string;
  teamPriceId: string;
  soloExtraCapacityPriceId: string;
  teamExtraCapacityPriceId: string;
}

/**
 * Derive the internal plan from Stripe subscription items using the price map.
 */
export function derivePlanFromSubscriptionItems(
  items: Stripe.SubscriptionItem[],
  priceMap: Map<string, StripePriceMapping>
): { plan: TierName; extraCapacityQuantity: number } {
  let plan: TierName = "free";
  let extraCapacityQuantity = 0;

  for (const item of items) {
    const priceId = item.price.id;
    const mapping = priceMap.get(priceId);
    if (mapping === undefined) {
      continue;
    }

    if (mapping.type === "plan") {
      plan = mapping.plan;
    } else if (mapping.type === "extra_capacity") {
      extraCapacityQuantity = item.quantity ?? 0;
    }
  }

  return { plan, extraCapacityQuantity };
}

/**
 * Map Stripe subscription status to internal billing state.
 */
export function deriveBillingState(
  status: Stripe.Subscription.Status
): "active" | "past_due" | "canceled" | "unpaid" | "incomplete" {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "canceled";
    case "paused":
      return "canceled";
    default:
      return "canceled";
  }
}

/**
 * Whether the given billing state should keep the requested entitlement active.
 *
 * V1 policy:
 * - active/trialing: base plan and extra capacity units remain active
 * - past_due: keep all paid entitlements active during Stripe retry window
 * - incomplete: keep base plan active, but suspend extra capacity units until payment succeeds
 */
export function isEntitlementEligible(
  billingState: string,
  entitlement: "plan" | "extra_capacity" = "plan"
): boolean {
  switch (billingState) {
    case "active":
      return true;
    case "past_due":
      return true;
    case "incomplete":
      return entitlement === "plan";
    default:
      return false;
  }
}

/** Unknown or partial item lists require reconciliation, never an inferred downgrade. */
export function assertSupportedSubscriptionItems(
  subscription: Stripe.Subscription,
  priceMap: Map<string, StripePriceMapping>
): void {
  const items = subscription.items.data;
  const fail = (): never => {
    throw new Error("billing_subscription_items_unsupported");
  };
  if (subscription.items.has_more || items.length < 1 || items.length > 2) fail();
  const bases = items.filter((item) => priceMap.get(item.price.id)?.type === "plan");
  if (bases.length !== 1 || (bases[0]!.quantity ?? 1) !== 1) fail();
  const plan = priceMap.get(bases[0]!.price.id)!.plan;
  for (const item of items) {
    const mapping = priceMap.get(item.price.id);
    if (
      !mapping ||
      mapping.plan !== plan ||
      !Number.isSafeInteger(item.quantity ?? 1) ||
      (item.quantity ?? 1) < 1 ||
      (item.quantity ?? 1) > 99
    )
      fail();
  }
}
