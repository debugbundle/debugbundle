import Stripe from "stripe";

import type {
  StripeBillingProvider,
  StripePriceMapping
} from "../../../packages/billing/src/stripe-subscription.js";
export type { StripePriceMapping } from "../../../packages/billing/src/stripe-subscription.js";
export type StripeConfig = StripeBillingProvider;

export function createStripeConfig(
  env: Record<string, string | undefined> = process.env
): StripeConfig | null {
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

export {
  derivePlanFromSubscriptionItems,
  deriveBillingState,
  isEntitlementEligible
} from "../../../packages/billing/src/stripe-subscription.js";
