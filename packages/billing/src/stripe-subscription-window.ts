import type Stripe from "stripe";
import type { StripeBillingProvider } from "./stripe-subscription.js";
import { readStripeSubscriptionOffer } from "./stripe-price-catalog.js";

/** One paid term for all licensed items; never use an allowance window to schedule money. */
export function readStripeSubscriptionChangeWindow(
  subscription: Stripe.Subscription,
  provider: StripeBillingProvider,
  now: number
): ReturnType<typeof readStripeSubscriptionOffer> & { start: number; end: number } {
  const offer = readStripeSubscriptionOffer(subscription, provider.priceMap);
  const items = subscription.items.data;
  const start = items[0]!.current_period_start,
    end = items[0]!.current_period_end;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    end <= start ||
    end * 1000 <= now ||
    start * 1000 > now ||
    items.some(
      (item) =>
        item.current_period_start !== start ||
        item.current_period_end !== end ||
        item.price.recurring?.interval !== offer.interval ||
        item.price.recurring.interval_count !== 1 ||
        item.billing_thresholds
    ) ||
    subscription.transfer_data ||
    subscription.application_fee_percent ||
    subscription.on_behalf_of ||
    subscription.billing_thresholds ||
    subscription.automatic_tax?.liability?.type === "account"
  )
    throw new Error("unsupported_plan_change");
  return { ...offer, start, end };
}
