import {
  readCompletedManagedSchedule,
  releaseCompletedManagedSchedule
} from "./stripe-completed-schedule.js";
import { isCapacityReductionSchedule } from "./stripe-schedule-safety.js";
import {
  applyStripeCapacityPayment,
  type CapacityPaymentRequired
} from "./stripe-capacity-payment.js";
import type Stripe from "stripe";
import { reconcileStripeSubscriptionOperation } from "./stripe-operation-reconciliation.js";
import { z } from "zod";
import type { BillingSummaryRecord } from "../../storage/src/index.js";
import type { BillingSubscriptionOperationStore } from "../../storage/src/billing-subscription-operation-store.js";
import {
  buildSchedulePhasesForReduction,
  buildSubscriptionItemsForQuantity,
  projectBillingSummary,
  type StripeBillingSubscriptionState
} from "./stripe-capacity.js";
import type { StripeBillingProvider } from "./stripe-subscription.js";
import {
  canReplayBillingOperation,
  BILLING_PROVIDER_REQUEST_OPTIONS
} from "./stripe-subscription-upgrade.js";

export type CapacityOperationError =
  | "billing_not_configured"
  | "billing_not_found"
  | "no_active_subscription"
  | "invalid_target_quantity"
  | "pending_capacity_reduction_exists"
  | "capacity_reduction_not_found"
  | "billing_change_in_progress";
export interface CapacityOperationContext {
  summary: BillingSummaryRecord;
  stripeState: StripeBillingSubscriptionState;
}
const ParametersSchema = z.object({
  releaseScheduleId: z.string().optional(),
  action: z.enum(["capacity_increase", "capacity_schedule", "capacity_cancel"]),
  resourceId: z.string().nullable(),
  body: z.record(z.string(), z.unknown()),
  result: z.object({
    plan: z.enum(["free", "solo", "team"]),
    additionalPurchased: z.number().int().nonnegative(),
    pendingReduction: z
      .object({
        additional_purchased: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
        effective_at: z.string()
      })
      .nullable()
  })
});

// Capacity changes and upgrades share a reservation. Persist exact provider
// commands before dispatch; timeout recovery must not recompute their contents.
export async function runStripeCapacityOperation(input: {
  store: BillingSubscriptionOperationStore;
  provider: StripeBillingProvider;
  organizationId: string;
  kind: "capacity_increase" | "capacity_schedule" | "capacity_cancel";
  target?: number;
  loadContext(): Promise<
    | CapacityOperationContext
    | "billing_not_configured"
    | "billing_not_found"
    | "no_active_subscription"
  >;
  now?: number;
}): Promise<BillingSummaryRecord | CapacityPaymentRequired | CapacityOperationError> {
  const { store, provider, organizationId, kind } = input;
  try {
    const previous = await store.get(organizationId);
    if (previous?.parameters && previous.completed_at === null) {
      const latest = await input.loadContext();
      if (typeof latest !== "string")
        await reconcileStripeSubscriptionOperation({
          store,
          client: provider.client,
          organizationId,
          subscription: latest.stripeState.subscription
        });
    }
    let operation = await store.claim({
      organization_id: organizationId,
      kind,
      intent: input.target === undefined ? {} : { target: input.target }
    });
    if (typeof operation === "string") return operation;
    const context = await input.loadContext();
    if (typeof context === "string") {
      await store.abandonUnprepared(organizationId, operation.id);
      return context;
    }
    const { subscription } = context.stripeState;
    const customer =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    if (
      subscription.id !== operation.subscription_id ||
      customer !== operation.customer_id ||
      subscription.status !== "active"
    ) {
      await store.abandonUnprepared(organizationId, operation.id);
      return "no_active_subscription";
    }
    if (operation.completed_at !== null) return context.summary;
    if (subscription.pending_update && operation.parameters === null) {
      await store.abandonUnprepared(organizationId, operation.id);
      return "billing_change_in_progress";
    }
    if (operation.parameters === null) {
      const { stripeState, summary } = context;
      const completedScheduleId =
        kind === "capacity_cancel"
          ? null
          : await readCompletedManagedSchedule(provider.client, subscription, organizationId);
      const target = input.target ?? 0;
      let error: CapacityOperationError | undefined;
      if (
        subscription.cancel_at_period_end ||
        subscription.cancel_at ||
        subscription.collection_method !== "charge_automatically" ||
        typeof subscription.latest_invoice !== "object" ||
        subscription.latest_invoice?.status !== "paid"
      ) {
        await store.abandonUnprepared(organizationId, operation.id);
        return "no_active_subscription";
      }
      if (
        stripeState.schedule &&
        !completedScheduleId &&
        (kind === "capacity_increase" ||
          !isCapacityReductionSchedule(subscription, stripeState.schedule, provider))
      ) {
        await store.abandonUnprepared(organizationId, operation.id);
        return stripeState.pendingReduction
          ? "pending_capacity_reduction_exists"
          : "billing_change_in_progress";
      }
      if (kind === "capacity_increase") {
        if (
          !Number.isSafeInteger(target) ||
          target <= stripeState.additionalPurchased ||
          target > 99
        )
          error = "invalid_target_quantity";
        else if (stripeState.pendingReduction !== null) error = "pending_capacity_reduction_exists";
      } else if (kind === "capacity_schedule") {
        if (
          !Number.isSafeInteger(target) ||
          target < 0 ||
          target >= stripeState.additionalPurchased
        )
          error = "invalid_target_quantity";
      } else if (stripeState.schedule === null || stripeState.pendingReduction === null)
        error = "capacity_reduction_not_found";
      if (error) {
        await store.abandonUnprepared(organizationId, operation.id);
        return error;
      }
      const parameters = {
        action: kind,
        resourceId: completedScheduleId ? null : (stripeState.schedule?.id ?? null),
        ...(completedScheduleId ? { releaseScheduleId: completedScheduleId } : {}),
        body:
          kind === "capacity_increase"
            ? {
                items: buildSubscriptionItemsForQuantity({
                  subscription,
                  stripeConfig: provider,
                  targetAdditionalPurchased: target,
                  plan: stripeState.plan
                }).map((item) => ({
                  ...item,
                  price:
                    item.price ??
                    subscription.items.data.find((current) => current.id === item.id)?.price.id
                })),
                payment_behavior: "pending_if_incomplete",
                proration_behavior: "always_invoice",
                proration_date: Math.floor((input.now ?? Date.now()) / 1000),
                expand: ["latest_invoice"]
              }
            : kind === "capacity_schedule"
              ? {
                  metadata: {
                    debugbundle_change: "capacity_reduction",
                    organization_id: organizationId
                  },
                  end_behavior: "release",
                  proration_behavior: "none",
                  phases: buildSchedulePhasesForReduction({
                    subscription,
                    schedule: completedScheduleId ? null : stripeState.schedule,
                    stripeConfig: provider,
                    summary,
                    targetAdditionalPurchased: target,
                    plan: stripeState.plan
                  })
                }
              : {},
        result: {
          plan: stripeState.plan,
          additionalPurchased:
            kind === "capacity_increase" ? target : stripeState.additionalPurchased,
          pendingReduction:
            kind === "capacity_schedule"
              ? {
                  additional_purchased: target,
                  total: summary.capacity_units.included + target,
                  effective_at: summary.usage_window.ends_at
                }
              : null
        }
      };
      if (kind === "capacity_schedule" && parameters.result.pendingReduction) {
        const phases = (parameters.body as Stripe.SubscriptionScheduleUpdateParams).phases;
        const effectiveAt = phases?.[1]?.start_date;
        if (typeof effectiveAt !== "number" || !Number.isFinite(effectiveAt))
          throw new Error("billing_period_unavailable");
        parameters.result.pendingReduction.effective_at = new Date(
          effectiveAt * 1000
        ).toISOString();
      }
      const prepared = await store.prepare(organizationId, operation.id, parameters);
      if (!prepared) return "billing_not_configured";
      operation = prepared;
    }
    if (
      kind !== "capacity_increase" &&
      !canReplayBillingOperation(operation.created_at, input.now ?? Date.now())
    )
      return "billing_change_in_progress";
    const parameters = ParametersSchema.parse(operation.parameters);
    if (parameters.action !== kind) return "billing_change_in_progress";
    const options = (step: string): Stripe.RequestOptions => ({
      ...BILLING_PROVIDER_REQUEST_OPTIONS,
      idempotencyKey: `billing-subscription:${operation.id}:${step}`
    });
    if (
      parameters.releaseScheduleId &&
      !(await releaseCompletedManagedSchedule({
        client: provider.client,
        subscription,
        organizationId,
        scheduleId: parameters.releaseScheduleId,
        allowWrite: canReplayBillingOperation(operation.created_at, input.now ?? Date.now()),
        idempotencyKey: `billing-subscription:${operation.id}:release-completed`
      }))
    )
      return "billing_change_in_progress";
    if (kind === "capacity_increase") {
      return await applyStripeCapacityPayment({
        client: provider.client,
        store,
        organizationId,
        operation,
        body: parameters.body as Stripe.SubscriptionUpdateParams,
        target: parameters.result.additionalPurchased,
        plan: parameters.result.plan,
        loadContext: () => input.loadContext(),
        ...(input.now === undefined ? {} : { now: input.now })
      });
    } else if (kind === "capacity_schedule") {
      let resourceId = operation.resource_id ?? parameters.resourceId;
      if (!resourceId) {
        const schedule = await provider.client.subscriptionSchedules.create(
          { from_subscription: operation.subscription_id },
          options("create")
        );
        resourceId = schedule.id;
        if (!resourceId || !(await store.saveResource(organizationId, operation.id, resourceId)))
          return "billing_not_configured";
      }
      await provider.client.subscriptionSchedules.update(
        resourceId,
        parameters.body as Stripe.SubscriptionScheduleUpdateParams,
        options("update")
      );
    } else {
      if (!parameters.resourceId) return "capacity_reduction_not_found";
      await provider.client.subscriptionSchedules.release(
        parameters.resourceId,
        {},
        options("release")
      );
    }
    if (!(await store.complete(organizationId, operation.id))) return "billing_not_configured";
    return projectBillingSummary({ summary: context.summary, ...parameters.result });
  } catch {
    return "billing_not_configured";
  }
}
