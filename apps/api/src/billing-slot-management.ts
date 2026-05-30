import Stripe from "stripe";

import { getTierCapabilities, type TierName } from "../../../packages/shared-types/src/index.js";
import type {
  BillingSummaryRecord,
  BillingCapacityPendingReduction,
  BillingUsageMetric
} from "../../../packages/storage/src/index.js";

import { derivePlanFromSubscriptionItems, type StripeConfig } from "./stripe-config.js";

interface ProjectBillingLimits {
  monthly_bundle_requests: BillingUsageMetric;
  monthly_raw_ingested_events: BillingUsageMetric;
  retained_bundle_cap: BillingUsageMetric;
  monthly_remote_activations: BillingUsageMetric;
  monthly_alert_deliveries: BillingUsageMetric;
  monthly_webhook_deliveries: BillingUsageMetric;
}

export interface StripeBillingSubscriptionState {
  subscription: Stripe.Subscription;
  schedule: Stripe.SubscriptionSchedule | null;
  plan: TierName;
  additionalPurchased: number;
  pendingReduction: BillingCapacityPendingReduction | null;
}

function getPriceId(price: string | Stripe.Price | Stripe.DeletedPrice): string | null {
  if (typeof price === "string") {
    return price;
  }

  return "id" in price ? price.id : null;
}

function getRecurringInterval(item: Stripe.SubscriptionItem): {
  interval: Stripe.SubscriptionScheduleUpdateParams.Phase.Duration.Interval;
  interval_count: number;
} | null {
  const recurring = typeof item.price === "string" ? null : item.price.recurring;
  if (recurring === null || recurring === undefined) {
    return null;
  }

  return {
    interval: recurring.interval,
    interval_count: recurring.interval_count ?? 1
  };
}

function createPendingReduction(input: {
  plan: TierName;
  additionalPurchased: number;
  effectiveAt: string;
}): BillingCapacityPendingReduction {
  const capabilities = getTierCapabilities(input.plan);

  return {
    additional_purchased: input.additionalPurchased,
    total: capabilities.included_capacity_units + input.additionalPurchased,
    effective_at: input.effectiveAt
  };
}

function resolvePendingReduction(input: {
  schedule: Stripe.SubscriptionSchedule | null;
  stripeConfig: StripeConfig;
  currentAdditionalPurchased: number;
  fallbackEffectiveAt: string;
}): BillingCapacityPendingReduction | null {
  if (input.schedule === null || input.schedule.status !== "active") {
    return null;
  }

  const currentPhaseEnd = input.schedule.current_phase?.end_date ?? null;
  if (currentPhaseEnd === null) {
    return null;
  }

  const nextPhase = input.schedule.phases.find((phase) => phase.start_date >= currentPhaseEnd);
  if (nextPhase === undefined) {
    return null;
  }

  const nextItems = nextPhase.items
    .map((item) => {
      const priceId = getPriceId(item.price);
      if (priceId === null) {
        return null;
      }

      return {
        price: { id: priceId },
        quantity: item.quantity ?? 1
      } as Stripe.SubscriptionItem;
    })
    .filter((item): item is Stripe.SubscriptionItem => item !== null);
  const { plan, extraCapacityQuantity } = derivePlanFromSubscriptionItems(nextItems, input.stripeConfig.priceMap);

  if (extraCapacityQuantity >= input.currentAdditionalPurchased) {
    return null;
  }

  return createPendingReduction({
    plan,
    additionalPurchased: extraCapacityQuantity,
    effectiveAt: new Date(nextPhase.start_date * 1000).toISOString() || input.fallbackEffectiveAt
  });
}

function buildAllowanceLimits(plan: TierName, totalCapacityUnits: number): ProjectBillingLimits {
  const capabilities = getTierCapabilities(plan);

  return {
    monthly_bundle_requests: {
      used: 0,
      limit: capabilities.monthly_bundle_requests * totalCapacityUnits
    },
    monthly_raw_ingested_events: {
      used: 0,
      limit: capabilities.monthly_raw_ingested_events * totalCapacityUnits
    },
    retained_bundle_cap: {
      used: 0,
      limit: capabilities.retained_bundle_cap * totalCapacityUnits
    },
    monthly_remote_activations: {
      used: 0,
      limit: capabilities.monthly_remote_activations * totalCapacityUnits
    },
    monthly_alert_deliveries: {
      used: 0,
      limit: capabilities.monthly_alert_deliveries * totalCapacityUnits
    },
    monthly_webhook_deliveries: {
      used: 0,
      limit: capabilities.monthly_webhook_deliveries * totalCapacityUnits
    }
  };
}

export function projectBillingSummary(input: {
  summary: BillingSummaryRecord;
  plan?: TierName;
  additionalPurchased: number;
  pendingReduction?: BillingCapacityPendingReduction | null;
}): BillingSummaryRecord {
  const plan = input.plan ?? input.summary.plan;
  const capabilities = getTierCapabilities(plan);
  const totalCapacityUnits = capabilities.included_capacity_units + input.additionalPurchased;
  const allowanceLimits = buildAllowanceLimits(plan, totalCapacityUnits);

  return {
    ...input.summary,
    plan,
    capacity_units: {
      ...input.summary.capacity_units,
      total: totalCapacityUnits,
      included: capabilities.included_capacity_units,
      additional_purchased: input.additionalPurchased,
      pending_reduction: input.pendingReduction ?? null
    },
    allowances: {
      monthly_bundle_requests: {
        used: input.summary.allowances.monthly_bundle_requests.used,
        limit: allowanceLimits.monthly_bundle_requests.limit
      },
      monthly_raw_ingested_events: {
        used: input.summary.allowances.monthly_raw_ingested_events.used,
        limit: allowanceLimits.monthly_raw_ingested_events.limit
      },
      retained_bundle_cap: {
        used: input.summary.allowances.retained_bundle_cap.used,
        limit: allowanceLimits.retained_bundle_cap.limit
      },
      monthly_remote_activations: {
        used: input.summary.allowances.monthly_remote_activations.used,
        limit: allowanceLimits.monthly_remote_activations.limit
      },
      monthly_alert_deliveries: {
        used: input.summary.allowances.monthly_alert_deliveries.used,
        limit: allowanceLimits.monthly_alert_deliveries.limit
      },
      monthly_webhook_deliveries: {
        used: input.summary.allowances.monthly_webhook_deliveries.used,
        limit: allowanceLimits.monthly_webhook_deliveries.limit
      }
    }
  };
}

export async function loadStripeBillingSubscriptionState(input: {
  stripeConfig: StripeConfig;
  subscriptionId: string;
  fallbackPlan: TierName;
  fallbackEffectiveAt: string;
  timeoutMs?: number;
}): Promise<StripeBillingSubscriptionState> {
  const requestOptions =
    input.timeoutMs === undefined
      ? undefined
      : {
          timeout: input.timeoutMs,
          maxNetworkRetries: 0
        } satisfies Stripe.RequestOptions;
  const subscription = await input.stripeConfig.client.subscriptions.retrieve(
    input.subscriptionId,
    {
      expand: ["schedule", "items.data.price"]
    },
    requestOptions
  );
  const liveState = derivePlanFromSubscriptionItems(subscription.items.data, input.stripeConfig.priceMap);
  const plan = liveState.plan === "free" ? input.fallbackPlan : liveState.plan;
  const schedule =
    subscription.schedule === null
      ? null
      : typeof subscription.schedule === "string"
        ? await input.stripeConfig.client.subscriptionSchedules.retrieve(subscription.schedule, {}, requestOptions)
        : subscription.schedule;

  return {
    subscription,
    schedule,
    plan,
    additionalPurchased: Math.max(0, liveState.extraCapacityQuantity),
    pendingReduction: resolvePendingReduction({
      schedule,
      stripeConfig: input.stripeConfig,
      currentAdditionalPurchased: Math.max(0, liveState.extraCapacityQuantity),
      fallbackEffectiveAt: input.fallbackEffectiveAt
    })
  };
}

export function buildSubscriptionItemsForQuantity(input: {
  subscription: Stripe.Subscription;
  stripeConfig: StripeConfig;
  targetAdditionalPurchased: number;
  plan: TierName;
}): Array<Stripe.SubscriptionUpdateParams.Item> {
  const extraCapacityPriceId =
    input.plan === "team" ? input.stripeConfig.teamExtraCapacityPriceId : input.stripeConfig.soloExtraCapacityPriceId;
  const items: Array<Stripe.SubscriptionUpdateParams.Item> = [];
  let hasExtraCapacityItem = false;

  for (const item of input.subscription.items.data) {
    const priceId = getPriceId(item.price);
    const mapping = priceId === null ? undefined : input.stripeConfig.priceMap.get(priceId);

    if (mapping?.type === "extra_capacity") {
      hasExtraCapacityItem = true;
      if (input.targetAdditionalPurchased > 0) {
        items.push({
          id: item.id,
          quantity: input.targetAdditionalPurchased
        });
      } else {
        items.push({
          id: item.id,
          deleted: true
        });
      }
      continue;
    }

    items.push({
      id: item.id,
      quantity: item.quantity ?? 1
    });
  }

  if (!hasExtraCapacityItem && input.targetAdditionalPurchased > 0) {
    items.push({
      price: extraCapacityPriceId,
      quantity: input.targetAdditionalPurchased
    });
  }

  return items;
}

export function buildSchedulePhasesForReduction(input: {
  subscription: Stripe.Subscription;
  schedule: Stripe.SubscriptionSchedule | null;
  stripeConfig: StripeConfig;
  summary: BillingSummaryRecord;
  targetAdditionalPurchased: number;
  plan: TierName;
}): Array<Stripe.SubscriptionScheduleUpdateParams.Phase> {
  const baseInterval =
    input.subscription.items.data
      .map((item) => getRecurringInterval(item))
      .find((interval) => interval !== null) ?? { interval: "month", interval_count: 1 };

  const buildPhaseItems = (targetAdditionalPurchased: number): Array<Stripe.SubscriptionScheduleUpdateParams.Phase.Item> => {
    const extraCapacityPriceId =
      input.plan === "team" ? input.stripeConfig.teamExtraCapacityPriceId : input.stripeConfig.soloExtraCapacityPriceId;
    const items: Array<Stripe.SubscriptionScheduleUpdateParams.Phase.Item> = [];
    let hasExtraCapacityItem = false;

    for (const item of input.subscription.items.data) {
      const priceId = getPriceId(item.price);
      const mapping = priceId === null ? undefined : input.stripeConfig.priceMap.get(priceId);

      if (mapping?.type === "extra_capacity") {
        hasExtraCapacityItem = true;
        if (targetAdditionalPurchased > 0) {
          items.push({
            price: priceId,
            quantity: targetAdditionalPurchased
          });
        }
        continue;
      }

      if (priceId !== null) {
        items.push({
          price: priceId,
          quantity: item.quantity ?? 1
        });
      }
    }

    if (!hasExtraCapacityItem && targetAdditionalPurchased > 0) {
      items.push({
        price: extraCapacityPriceId,
        quantity: targetAdditionalPurchased
      });
    }

    return items;
  };

  const currentPhaseStartDate =
    input.schedule?.current_phase?.start_date ??
    input.subscription.current_period_start ??
    Math.floor(new Date(input.summary.usage_window.starts_at).getTime() / 1000);
  const currentPhaseEndDate =
    input.schedule?.current_phase?.end_date ??
    input.subscription.current_period_end ??
    Math.floor(new Date(input.summary.usage_window.ends_at).getTime() / 1000);

  return [
    {
      start_date: currentPhaseStartDate,
      end_date: currentPhaseEndDate,
      items: buildPhaseItems(input.summary.capacity_units.additional_purchased),
      proration_behavior: "none"
    },
    {
      start_date: currentPhaseEndDate,
      duration: baseInterval,
      items: buildPhaseItems(input.targetAdditionalPurchased),
      proration_behavior: "none"
    }
  ];
}
