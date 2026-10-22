import type Stripe from "stripe";
import type { StripeBillingProvider } from "./stripe-subscription.js";
import { assertSupportedSubscriptionItems } from "./stripe-subscription.js";
import {
  preservedPhaseSettings,
  preservedItemSettings,
  readSimpleSchedulePhases
} from "./stripe-schedule-safety.js";
import type { BillingPlanChangeState } from "../../billing-client/src/plan-change.js";

export function planChangeItems(
  subscription: Stripe.Subscription,
  provider: StripeBillingProvider,
  now: number
): {
  start: number;
  end: number;
  quantity: number;
  items: Array<{ id: string; price: string; quantity: number }>;
} {
  assertSupportedSubscriptionItems(subscription, provider.priceMap);
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
        provider.priceMap.get(item.price.id)?.plan !== "team" ||
        item.current_period_start !== start ||
        item.current_period_end !== end ||
        item.price.recurring?.interval !== "month" ||
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
  return {
    start,
    end,
    quantity:
      items.find((item) => provider.priceMap.get(item.price.id)?.type === "extra_capacity")
        ?.quantity ?? 0,
    items: items.map((item) => ({
      id: item.id,
      price:
        provider.priceMap.get(item.price.id)?.type === "plan"
          ? provider.soloPriceId
          : provider.soloExtraCapacityPriceId,
      quantity: item.quantity!
    }))
  };
}
export function planChangePhases(
  subscription: Stripe.Subscription,
  provider: StripeBillingProvider,
  now: number
): Stripe.SubscriptionScheduleUpdateParams.Phase[] {
  const target = planChangeItems(subscription, provider, now);
  const settings = preservedPhaseSettings(subscription);
  return [
    {
      start_date: target.start,
      end_date: target.end,
      proration_behavior: "none",
      ...settings,
      items: subscription.items.data.map((item) => ({
        price: item.price.id,
        quantity: item.quantity!,
        ...preservedItemSettings(item)
      }))
    },
    {
      start_date: target.end,
      duration: { interval: "month", interval_count: 1 },
      proration_behavior: "none",
      ...settings,
      items: subscription.items.data.map((item) => ({
        price: target.items.find((next) => next.id === item.id)!.price,
        quantity: item.quantity!,
        ...preservedItemSettings(item)
      }))
    }
  ];
}
const id = (value: string | { id: string }): string =>
  typeof value === "string" ? value : value.id;
function itemShape(
  items: Array<{ price: string | { id: string }; quantity?: number | null }>
): Array<{ price: string; quantity: number }> {
  return items
    .map((item) => ({ price: id(item.price), quantity: item.quantity ?? 1 }))
    .sort((a, b) => a.price.localeCompare(b.price));
}
// A metadata marker is insufficient: refuse release if somebody edited the
// future price, quantity, tax, discount, transition date or other custom phase settings.
export function readPendingPlanChange(
  subscription: Stripe.Subscription,
  schedule: Stripe.SubscriptionSchedule,
  provider: StripeBillingProvider,
  organizationId: string,
  now: number
): BillingPlanChangeState["pending_change"] {
  if (
    schedule.metadata?.["debugbundle_change"] !== "plan_downgrade" ||
    schedule.metadata["organization_id"] !== organizationId
  )
    return null;
  const phases = readSimpleSchedulePhases(subscription, schedule);
  if (!phases) return null;
  const [current, future] = phases;
  const target = planChangeItems(subscription, provider, now);
  if (
    current.start_date !== target.start ||
    current.end_date !== target.end ||
    future.start_date !== target.end ||
    JSON.stringify(itemShape(current.items)) !==
      JSON.stringify(itemShape(subscription.items.data)) ||
    JSON.stringify(itemShape(future.items)) !==
      JSON.stringify(itemShape(target.items as Array<{ price: string; quantity: number }>))
  )
    return null;
  for (const next of future.items) {
    const type = provider.priceMap.get(id(next.price))?.type;
    const previous = current.items.find(
      (item) => provider.priceMap.get(id(item.price))?.type === type
    );
    if (
      !previous ||
      ["discounts", "tax_rates"].some(
        (field) =>
          JSON.stringify(previous[field as "discounts" | "tax_rates"] ?? []) !==
          JSON.stringify(next[field as "discounts" | "tax_rates"] ?? [])
      )
    )
      return null;
  }
  return {
    schedule_id: schedule.id,
    target_plan: "solo",
    effective_at: new Date(target.end * 1000).toISOString(),
    additional_capacity_units: target.quantity
  };
}
