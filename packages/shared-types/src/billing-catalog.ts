import type { TierName } from "./tier-capabilities.js";
import type { BillingOfferSelection } from "./billing-offers.js";

export type PaidTierName = Exclude<TierName, "free">;
export type BillingInterval = "month" | "year";
export type BillingPriceKind = "plan" | "extra_capacity";

export function classifyBillingOfferChange(
  current: { plan: PaidTierName; interval: BillingInterval },
  target: BillingOfferSelection
): "upgrade" | "renewal" | null {
  if (current.plan === target.target_plan && current.interval === target.interval) return null;
  const rank: Record<PaidTierName, number> = { solo: 1, team: 2, business: 3 };
  return current.interval === target.interval && rank[target.target_plan] > rank[current.plan]
    ? "upgrade"
    : "renewal";
}

/** Explicit USD minor units keep annual totals and monthly equivalents exact. */
const AMOUNTS: Record<PaidTierName, Record<BillingInterval, Record<BillingPriceKind, number>>> = {
  solo: {
    month: { plan: 500, extra_capacity: 100 },
    year: { plan: 4800, extra_capacity: 1000 }
  },
  team: {
    month: { plan: 1900, extra_capacity: 300 },
    year: { plan: 19200, extra_capacity: 3000 }
  },
  business: {
    month: { plan: 5900, extra_capacity: 300 },
    year: { plan: 58800, extra_capacity: 3000 }
  }
};

export interface BillingCatalogPrice {
  tier: PaidTierName;
  interval: BillingInterval;
  currency: "usd";
  kind: BillingPriceKind;
  amount_minor: number;
}

export function isPaidTier(value: unknown): value is PaidTierName {
  return value === "solo" || value === "team" || value === "business";
}

export function normalizeTierName(value: unknown): TierName {
  return isPaidTier(value) ? value : "free";
}

export function getBillingCatalogPrice(
  tier: PaidTierName,
  interval: BillingInterval,
  kind: BillingPriceKind
): BillingCatalogPrice {
  return {
    tier,
    interval,
    kind,
    currency: "usd",
    amount_minor: AMOUNTS[tier][interval][kind]
  };
}
