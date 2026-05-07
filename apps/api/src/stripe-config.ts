import Stripe from "stripe";

import type { TierName } from "../../../packages/shared-types/src/index.js";

export interface StripePriceMapping {
  plan: TierName;
  type: "plan" | "extra_capacity";
}

export interface StripeConfig {
  client: Stripe;
  webhookSecret: string;
  priceMap: Map<string, StripePriceMapping>;
  soloPriceId: string;
  teamPriceId: string;
  soloExtraCapacityPriceId: string;
  teamExtraCapacityPriceId: string;
}

export function createStripeConfig(env: Record<string, string | undefined> = process.env): StripeConfig | null {
  const secretKey = env["STRIPE_SECRET_KEY"]?.trim();
  const webhookSecret = env["STRIPE_WEBHOOK_SECRET"]?.trim();
  const soloPriceId = env["STRIPE_SOLO_PRICE_ID"]?.trim();
  const teamPriceId = env["STRIPE_TEAM_PRICE_ID"]?.trim();
  const soloExtraCapacityPriceId = env["STRIPE_SOLO_EXTRA_CAPACITY_PRICE_ID"]?.trim();
  const teamExtraCapacityPriceId = env["STRIPE_TEAM_EXTRA_CAPACITY_PRICE_ID"]?.trim();

  if (
    !secretKey ||
    !webhookSecret ||
    !soloPriceId ||
    !teamPriceId ||
    !soloExtraCapacityPriceId ||
    !teamExtraCapacityPriceId
  ) {
    return null;
  }

  const client = new Stripe(secretKey, {
    apiVersion: "2026-02-25.clover",
    timeout: 15_000,
    maxNetworkRetries: 2
  });

  const priceMap = new Map<string, StripePriceMapping>([
    [soloPriceId, { plan: "solo", type: "plan" }],
    [teamPriceId, { plan: "team", type: "plan" }],
    [soloExtraCapacityPriceId, { plan: "solo", type: "extra_capacity" }],
    [teamExtraCapacityPriceId, { plan: "team", type: "extra_capacity" }]
  ]);

  return {
    client,
    webhookSecret,
    priceMap,
    soloPriceId,
    teamPriceId,
    soloExtraCapacityPriceId,
    teamExtraCapacityPriceId
  };
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
export function deriveBillingState(status: Stripe.Subscription.Status): string {
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
