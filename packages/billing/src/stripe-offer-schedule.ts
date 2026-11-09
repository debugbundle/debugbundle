import type Stripe from "stripe";
import {
  BillingOfferSelectionSchema,
  type BillingOfferSelection,
  type BillingOfferChangeState
} from "../../shared-types/src/index.js";
import type { StripeBillingProvider } from "./stripe-subscription.js";
import { buildStripeOfferItems } from "./stripe-price-catalog.js";
import { stripeOfferChangeAction } from "./stripe-offer-quote.js";
import { readStripeSubscriptionChangeWindow } from "./stripe-subscription-window.js";
import {
  preservedItemSettings,
  preservedPhaseSettings,
  readSimpleSchedulePhases
} from "./stripe-schedule-safety.js";

export function buildStripeOfferChangePhases(input: {
  subscription: Stripe.Subscription;
  provider: StripeBillingProvider;
  target: BillingOfferSelection;
  now: number;
}): Stripe.SubscriptionScheduleUpdateParams.Phase[] {
  const { subscription, provider, target } = input;
  const window = readStripeSubscriptionChangeWindow(subscription, provider, input.now);
  const nextItems = buildStripeOfferItems(subscription, provider.priceMap, {
    plan: target.target_plan,
    interval: target.interval,
    currency: "usd"
  });
  if (!nextItems || stripeOfferChangeAction(provider, subscription, target) !== "renewal")
    throw new Error("unsupported_plan_change");
  const settings = preservedPhaseSettings(subscription);
  return [
    {
      start_date: window.start,
      end_date: window.end,
      proration_behavior: "none",
      ...settings,
      items: subscription.items.data.map((item) => ({
        price: item.price.id,
        quantity: item.quantity!,
        ...preservedItemSettings(item)
      }))
    },
    {
      start_date: window.end,
      duration: { interval: target.interval, interval_count: 1 },
      proration_behavior: "none",
      ...settings,
      items: subscription.items.data.map((item) => ({
        price: nextItems.find((next) => next.id === item.id)!.price,
        quantity: item.quantity!,
        ...preservedItemSettings(item)
      }))
    }
  ];
}
const id = (value: string | { id: string }): string =>
  typeof value === "string" ? value : value.id;
const shape = (
  items: readonly { price?: string | { id: string }; quantity?: number | null }[]
): Array<{ price: string; quantity: number }> =>
  items
    .map((item) => ({
      price: item.price === undefined ? "" : id(item.price),
      quantity: item.quantity ?? 1
    }))
    .sort((a, b) => a.price.localeCompare(b.price));

/** Recognise only our exact supported future offer before cancellation or replay. */
export function readPendingStripeOfferChange(input: {
  subscription: Stripe.Subscription;
  schedule: Stripe.SubscriptionSchedule;
  provider: StripeBillingProvider;
  organizationId: string;
  now: number;
}): BillingOfferChangeState["pending_change"] {
  try {
    const { schedule, subscription, provider } = input;
    if (
      schedule.metadata?.["debugbundle_change"] !== "offer_change" ||
      schedule.metadata["organization_id"] !== input.organizationId
    )
      return null;
    const selection = BillingOfferSelectionSchema.safeParse({
      target_plan: schedule.metadata["target_plan"],
      interval: schedule.metadata["interval"]
    });
    const phases = readSimpleSchedulePhases(subscription, schedule);
    if (!selection.success || !phases) return null;
    const expected = buildStripeOfferChangePhases({ ...input, target: selection.data });
    if (
      phases[0].start_date !== expected[0]!.start_date ||
      phases[0].end_date !== expected[0]!.end_date ||
      phases[1].start_date !== expected[1]!.start_date ||
      JSON.stringify(shape(phases[0].items)) !== JSON.stringify(shape(expected[0]!.items)) ||
      JSON.stringify(shape(phases[1].items)) !== JSON.stringify(shape(expected[1]!.items))
    )
      return null;
    for (const next of phases[1].items) {
      const type = provider.priceMap.get(id(next.price))?.type;
      const previous = phases[0].items.find(
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
    const window = readStripeSubscriptionChangeWindow(subscription, provider, input.now);
    return {
      ...selection.data,
      schedule_id: schedule.id,
      effective_at: new Date(window.end * 1000).toISOString(),
      additional_capacity_units: window.additional_capacity_units
    };
  } catch {
    return null;
  }
}

/** Only finish the one-phase schedule created by this reserved operation when
 * its current prices, quantities, dates and preserved settings still match. */
export function isInitialStripeOfferSchedule(
  subscription: Stripe.Subscription,
  schedule: Stripe.SubscriptionSchedule
): boolean {
  const phase = schedule.phases[0];
  const first = subscription.items.data[0];
  if (
    !phase ||
    !first ||
    schedule.status !== "active" ||
    schedule.end_behavior !== "release" ||
    schedule.phases.length !== 1 ||
    id(schedule.subscription ?? "") !== subscription.id ||
    Object.keys(schedule.metadata ?? {}).length ||
    schedule.current_phase?.start_date !== first.current_period_start ||
    schedule.current_phase.end_date !== first.current_period_end ||
    phase.start_date !== first.current_period_start ||
    phase.end_date !== first.current_period_end ||
    JSON.stringify(shape(phase.items)) !== JSON.stringify(shape(subscription.items.data)) ||
    phase.add_invoice_items?.length ||
    phase.trial_end ||
    phase.transfer_data ||
    phase.application_fee_percent ||
    phase.on_behalf_of ||
    phase.billing_thresholds ||
    phase.description ||
    phase.invoice_settings ||
    phase.billing_cycle_anchor === "phase_start" ||
    Object.keys(phase.metadata ?? {}).length ||
    phase.items.some((item) => item.billing_thresholds || Object.keys(item.metadata ?? {}).length)
  )
    return false;
  const ids = (values: readonly (string | { id: string })[] | null | undefined): string =>
    JSON.stringify((values ?? []).map(id).sort());
  const discounts = (values: readonly { discount: unknown }[] | null | undefined): string =>
    ids(
      (values ?? []).map((value) => {
        const discount = value.discount;
        if (typeof discount === "string") return discount;
        return discount !== null &&
          typeof discount === "object" &&
          "id" in discount &&
          typeof discount.id === "string"
          ? discount.id
          : "";
      })
    );
  if (
    (phase.automatic_tax &&
      phase.automatic_tax.enabled !== (subscription.automatic_tax?.enabled ?? false)) ||
    ids(phase.default_tax_rates) !== ids(subscription.default_tax_rates) ||
    discounts(phase.discounts) !== ids(subscription.discounts) ||
    (phase.collection_method && phase.collection_method !== subscription.collection_method) ||
    (phase.default_payment_method &&
      id(phase.default_payment_method) !== id(subscription.default_payment_method ?? ""))
  )
    return false;
  return phase.items.every((item) => {
    const current = subscription.items.data.find((value) => value.price.id === id(item.price));
    return (
      current !== undefined &&
      ids(item.tax_rates) === ids(current.tax_rates) &&
      discounts(item.discounts) === ids(current.discounts)
    );
  });
}
