import type Stripe from "stripe";
import type {
  BillingInterval,
  BillingPriceKind,
  PaidTierName
} from "../../shared-types/src/index.js";
import {
  BillingSubscriptionOfferSchema,
  type BillingSubscriptionOffer
} from "../../shared-types/src/index.js";
import { resolveStripeSubscriptionBillingPeriod } from "./stripe-billing-period.js";
import { isPaidTier } from "../../shared-types/src/index.js";
import {
  assertSupportedSubscriptionItems,
  stripePriceMatchesCatalog,
  type StripeBillingProvider,
  type StripePriceMapping
} from "./stripe-subscription.js";

export interface StripeCatalogOffer {
  plan: PaidTierName;
  interval: BillingInterval;
  currency: "usd";
}

export async function validateStripePurchasePrices(
  provider: StripeBillingProvider,
  priceIds: readonly string[]
): Promise<boolean> {
  for (const id of new Set(priceIds)) {
    const mapping = provider.priceMap.get(id);
    if (!mapping) return false;
    if (mapping?.amount_minor === undefined) continue;
    const price = await provider.client.prices.retrieve(
      id,
      {},
      { timeout: 8000, maxNetworkRetries: 0 }
    );
    if (!price.active || !stripePriceMatchesCatalog(price, mapping)) return false;
  }
  return true;
}

/** Selection never falls back from a missing annual/Business price to Solo. */
export function findStripeCatalogPrice(
  priceMap: ReadonlyMap<string, StripePriceMapping>,
  offer: StripeCatalogOffer,
  kind: BillingPriceKind
): string | null {
  const matches = [...priceMap.entries()].filter(
    ([, entry]) =>
      entry.plan === offer.plan &&
      entry.type === kind &&
      (entry.interval ?? "month") === offer.interval &&
      (entry.currency ?? "usd") === offer.currency &&
      entry.purchasable !== false
  );
  return matches.length === 1 ? matches[0]![0] : null;
}

export function readStripeSubscriptionOffer(
  subscription: Stripe.Subscription,
  priceMap: Map<string, StripePriceMapping>
): StripeCatalogOffer & { additional_capacity_units: number } {
  assertSupportedSubscriptionItems(subscription, priceMap);
  const base = subscription.items.data.find(
    (item) => priceMap.get(item.price.id)?.type === "plan"
  )!;
  const mapping = priceMap.get(base.price.id)!;
  if (!isPaidTier(mapping.plan)) throw new Error("billing_subscription_items_unsupported");
  return {
    plan: mapping.plan,
    interval: mapping.interval ?? "month",
    currency: mapping.currency ?? "usd",
    additional_capacity_units:
      subscription.items.data.find((item) => priceMap.get(item.price.id)?.type === "extra_capacity")
        ?.quantity ?? 0
  };
}

/** Current provider unit amounts are facts, including retained older prices. */
export function readStripeSubscriptionOfferStatus(
  subscription: Stripe.Subscription,
  priceMap: Map<string, StripePriceMapping>
): BillingSubscriptionOffer {
  const offer = readStripeSubscriptionOffer(subscription, priceMap);
  const base = subscription.items.data.find(
    (item) => priceMap.get(item.price.id)?.type === "plan"
  )!;
  const extra = subscription.items.data.find(
    (item) => priceMap.get(item.price.id)?.type === "extra_capacity"
  );
  const period = resolveStripeSubscriptionBillingPeriod(subscription);
  return BillingSubscriptionOfferSchema.parse({
    ...offer,
    base_amount_minor: base.price.unit_amount ?? null,
    capacity_unit_amount_minor: extra?.price.unit_amount ?? null,
    term_starts_at: period.starts_at,
    term_ends_at: period.ends_at
  });
}

/** Preserve item identities and purchased quantity when changing a whole offer. */
export function buildStripeOfferItems(
  subscription: Stripe.Subscription,
  priceMap: Map<string, StripePriceMapping>,
  target: StripeCatalogOffer
): Array<{ id: string; price: string; quantity: number }> | null {
  readStripeSubscriptionOffer(subscription, priceMap);
  const items: Array<{ id: string; price: string; quantity: number }> = [];
  for (const item of subscription.items.data) {
    const price = findStripeCatalogPrice(priceMap, target, priceMap.get(item.price.id)!.type);
    if (!item.id || !price) return null;
    items.push({ id: item.id, price, quantity: item.quantity ?? 1 });
  }
  return items;
}
