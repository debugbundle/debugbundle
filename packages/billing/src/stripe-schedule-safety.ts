import type Stripe from "stripe";
import type { StripeBillingProvider } from "./stripe-subscription.js";

function id(value: string | { id: string }): string {
  return typeof value === "string" ? value : value.id;
}

export function preservedPhaseSettings(
  subscription: Stripe.Subscription
): Pick<
  Stripe.SubscriptionScheduleUpdateParams.Phase,
  "automatic_tax" | "discounts" | "default_tax_rates"
> {
  return {
    ...(subscription.automatic_tax
      ? { automatic_tax: { enabled: subscription.automatic_tax.enabled } }
      : {}),
    ...(subscription.discounts
      ? { discounts: subscription.discounts.map((discount) => ({ discount: id(discount) })) }
      : {}),
    ...(subscription.default_tax_rates
      ? { default_tax_rates: subscription.default_tax_rates.map(id) }
      : {})
  };
}
export function preservedItemSettings(
  item: Stripe.SubscriptionItem
): Pick<Stripe.SubscriptionScheduleUpdateParams.Phase.Item, "discounts" | "tax_rates"> {
  return {
    ...(item.discounts
      ? { discounts: item.discounts.map((discount) => ({ discount: id(discount) })) }
      : {}),
    ...(item.tax_rates ? { tax_rates: item.tax_rates.map(id) } : {})
  };
}

// Only edit our simple two-phase capacity reduction. Legacy schedules created
// by the same flow predate the metadata marker, so validate their full shape.
export function readSimpleSchedulePhases(
  subscription: Stripe.Subscription,
  schedule: Stripe.SubscriptionSchedule
): [Stripe.SubscriptionSchedule.Phase, Stripe.SubscriptionSchedule.Phase] | null {
  if (
    schedule.status !== "active" ||
    schedule.end_behavior !== "release" ||
    !schedule.current_phase ||
    (schedule.subscription && id(schedule.subscription) !== subscription.id)
  )
    return null;
  const phases = schedule.phases.filter(
    (phase) => phase.end_date > schedule.current_phase!.start_date
  );
  if (
    phases.length !== 2 ||
    phases[0]!.end_date !== phases[1]!.start_date ||
    phases[0]!.start_date !== schedule.current_phase.start_date
  )
    return null;
  const current = phases[0]!;
  const future = phases[1]!;
  if (
    phases.some(
      (phase) =>
        phase.add_invoice_items?.length ||
        phase.trial_end ||
        phase.transfer_data ||
        phase.application_fee_percent ||
        phase.on_behalf_of ||
        phase.billing_thresholds ||
        phase.description ||
        phase.default_payment_method ||
        phase.invoice_settings ||
        phase.billing_cycle_anchor === "phase_start" ||
        Object.keys(phase.metadata ?? {}).length ||
        phase.items.some(
          (item) => item.billing_thresholds || Object.keys(item.metadata ?? {}).length
        )
    )
  )
    return null;
  // A future promotion, tax, collection or payment-method change belongs to a
  // different flow, even if its item quantities resemble a capacity reduction.
  for (const field of [
    "discounts",
    "default_tax_rates",
    "automatic_tax",
    "collection_method",
    "default_payment_method",
    "invoice_settings",
    "billing_cycle_anchor",
    "metadata"
  ] as const) {
    if (JSON.stringify(current[field] ?? null) !== JSON.stringify(future[field] ?? null))
      return null;
  }
  return [current, future];
}

export function isCapacityReductionSchedule(
  subscription: Stripe.Subscription,
  schedule: Stripe.SubscriptionSchedule,
  provider: StripeBillingProvider
): boolean {
  if (
    schedule.metadata?.["debugbundle_change"] &&
    schedule.metadata["debugbundle_change"] !== "capacity_reduction"
  )
    return false;
  const phases = readSimpleSchedulePhases(subscription, schedule);
  if (!phases) return false;
  const [current, future] = phases;
  const normalize = (
    items: Array<{ price: string | { id: string }; quantity?: number | null }>
  ): Array<{ price: string; quantity: number }> =>
    items
      .map((item) => ({ price: id(item.price), quantity: item.quantity ?? 1 }))
      .sort((a, b) => a.price.localeCompare(b.price));
  if (
    JSON.stringify(normalize(current.items)) !== JSON.stringify(normalize(subscription.items.data))
  )
    return false;
  const currentBase = current.items.find(
    (item) => provider.priceMap.get(id(item.price))?.type === "plan"
  );
  const futureBase = future.items.find(
    (item) => provider.priceMap.get(id(item.price))?.type === "plan"
  );
  if (
    !currentBase ||
    !futureBase ||
    id(currentBase.price) !== id(futureBase.price) ||
    currentBase.quantity !== futureBase.quantity
  )
    return false;
  const known = future.items.every((item) => provider.priceMap.has(id(item.price)));
  const currentExtra = current.items.filter(
    (item) => provider.priceMap.get(id(item.price))?.type === "extra_capacity"
  );
  const futureExtra = future.items.filter(
    (item) => provider.priceMap.get(id(item.price))?.type === "extra_capacity"
  );
  // Rebuilding phases may change quantity only. A different future price,
  // discount or tax arrangement must be managed by its original flow.
  for (const next of future.items) {
    const previous = current.items.find((item) => id(item.price) === id(next.price));
    if (
      !previous ||
      ["discounts", "tax_rates"].some((field) => {
        const key = field as "discounts" | "tax_rates";
        return JSON.stringify(previous[key] ?? []) !== JSON.stringify(next[key] ?? []);
      })
    )
      return false;
  }
  return (
    known &&
    currentExtra.length === 1 &&
    futureExtra.length <= 1 &&
    (futureExtra[0]?.quantity ?? 0) < (currentExtra[0]?.quantity ?? 0)
  );
}
