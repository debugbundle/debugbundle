import Stripe from "stripe";
import {
  getBillingCatalogPrice,
  isPaidTier,
  type PaidTierName
} from "../../shared-types/src/index.js";

import type { StripeBillingProvider, StripePriceMapping } from "./stripe-subscription.js";
export type { StripePriceMapping } from "./stripe-subscription.js";
export type StripeConfig = StripeBillingProvider;

export function createStripeConfig(
  env: Record<string, string | undefined> = process.env,
  options: { requireWebhookSecret?: boolean } = {}
): StripeConfig | null {
  const secretKey = env["STRIPE_SECRET_KEY"]?.trim();
  const webhookSecret = env["STRIPE_WEBHOOK_SECRET"]?.trim();
  const soloPriceId = env["STRIPE_SOLO_PRICE_ID"]?.trim();
  const teamPriceId = env["STRIPE_TEAM_PRICE_ID"]?.trim();
  const soloExtraCapacityPriceId = env["STRIPE_SOLO_EXTRA_CAPACITY_PRICE_ID"]?.trim();
  const teamExtraCapacityPriceId = env["STRIPE_TEAM_EXTRA_CAPACITY_PRICE_ID"]?.trim();

  if (
    !secretKey ||
    ((options.requireWebhookSecret ?? true) && !webhookSecret) ||
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
  // Retain installed monthly identifiers. Optional offers are unavailable until
  // configured; an absent annual or Business price never selects another tier.
  if (priceMap.size !== 4) return null;
  const add = (priceId: string | undefined, mapping: StripePriceMapping): boolean => {
    const id = priceId?.trim();
    if (!id) return true;
    if (priceMap.has(id)) return false;
    priceMap.set(id, {
      ...mapping,
      ...(isPaidTier(mapping.plan)
        ? {
            amount_minor: getBillingCatalogPrice(
              mapping.plan,
              mapping.interval ?? "month",
              mapping.type
            ).amount_minor
          }
        : {})
    });
    return true;
  };
  for (const plan of ["solo", "team", "business"] satisfies PaidTierName[]) {
    const prefix = `STRIPE_${plan.toUpperCase()}`;
    if (
      !add(env[`${prefix}_ANNUAL_PRICE_ID`], {
        plan,
        type: "plan",
        interval: "year",
        currency: "usd"
      }) ||
      !add(env[`${prefix}_EXTRA_CAPACITY_ANNUAL_PRICE_ID`], {
        plan,
        type: "extra_capacity",
        interval: "year",
        currency: "usd"
      })
    )
      return null;
  }
  if (
    !add(env["STRIPE_BUSINESS_PRICE_ID"], {
      plan: "business",
      type: "plan",
      interval: "month",
      currency: "usd"
    }) ||
    !add(env["STRIPE_BUSINESS_EXTRA_CAPACITY_PRICE_ID"], {
      plan: "business",
      type: "extra_capacity",
      interval: "month",
      currency: "usd"
    }) ||
    !add(env["STRIPE_TEAM_EXTRA_CAPACITY_CURRENT_PRICE_ID"], {
      plan: "team",
      type: "extra_capacity",
      interval: "month",
      currency: "usd"
    })
  )
    return null;
  const currentTeamCapacity = env["STRIPE_TEAM_EXTRA_CAPACITY_CURRENT_PRICE_ID"]?.trim();
  if (currentTeamCapacity) {
    priceMap.set(teamExtraCapacityPriceId, {
      plan: "team",
      type: "extra_capacity",
      purchasable: false
    });
  }

  return {
    businessSalesEnabled: env["BUSINESS_SALES_ENABLED"] === "true",
    ...(env["STRIPE_BUSINESS_REFERRAL_COUPON_ID"]?.trim()
      ? { referralCouponId: env["STRIPE_BUSINESS_REFERRAL_COUPON_ID"].trim() }
      : {}),
    client,
    webhookSecret: webhookSecret ?? "",
    priceMap,
    soloPriceId,
    teamPriceId,
    soloExtraCapacityPriceId,
    teamExtraCapacityPriceId: currentTeamCapacity || teamExtraCapacityPriceId
  };
}

export {
  derivePlanFromSubscriptionItems,
  deriveBillingState,
  isEntitlementEligible
} from "./stripe-subscription.js";
