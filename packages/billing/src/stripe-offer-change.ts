import { canStartBusinessSale } from "./business-sales-policy.js";
import { derivePlanFromSubscriptionItems } from "./stripe-subscription.js";
import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { z } from "zod";
import {
  BillingOfferQuoteSchema,
  type BillingOfferQuote,
  type BillingOfferSelection,
  type BillingOfferChangeState,
  type BillingOfferStatus
} from "../../shared-types/src/index.js";
import type { BillingPlanChangeError } from "../../billing-client/src/plan-change.js";
import type {
  BillingSubscriptionOperation,
  BillingSubscriptionOperationStore
} from "../../storage/src/billing-subscription-operation-store.js";
import type { StripeBillingProvider } from "./stripe-subscription.js";
import {
  buildStripeOfferItems,
  readStripeSubscriptionOffer,
  readStripeSubscriptionOfferStatus,
  validateStripePurchasePrices
} from "./stripe-price-catalog.js";
import {
  createStripeOfferQuote,
  publicStripeOfferQuote,
  readStripeOfferAmounts,
  stripeOfferChangeAction,
  verifyStripeOfferQuote
} from "./stripe-offer-quote.js";
import {
  buildStripeOfferChangePhases,
  isInitialStripeOfferSchedule,
  readPendingStripeOfferChange
} from "./stripe-offer-schedule.js";
import { planChangeSource } from "./stripe-plan-change-quote.js";
import {
  isCompletedManagedSchedule,
  readCompletedManagedSchedule,
  releaseCompletedManagedSchedule
} from "./stripe-completed-schedule.js";
import {
  belongsTo,
  canReplayBillingOperation,
  BILLING_PROVIDER_REQUEST_OPTIONS as options
} from "./stripe-subscription-upgrade.js";

const ParametersSchema = z
  .object({
    action: z.enum(["offer_schedule", "offer_cancel"]),
    schedule_id: z.string().nullable(),
    release_schedule_id: z.string().optional(),
    source: z.string().length(64).optional(),
    quote: BillingOfferQuoteSchema.optional(),
    body: z.record(z.string(), z.unknown())
  })
  .strict();
const SavedPhasesSchema = z
  .array(
    z.object({
      items: z
        .array(z.object({ price: z.string(), quantity: z.number().int().positive() }))
        .min(1)
        .max(2)
    })
  )
  .min(2)
  .max(2);
type StateResult = BillingOfferChangeState | BillingPlanChangeError;
const priceId = (price: string | { id: string }): string =>
  typeof price === "string" ? price : price.id;
const itemShape = (
  items: readonly { price: string | { id: string }; quantity?: number | null }[]
): string =>
  JSON.stringify(
    items
      .map((item) => ({ price: priceId(item.price), quantity: item.quantity ?? 1 }))
      .sort((a, b) => a.price.localeCompare(b.price))
  );

export function createStripeOfferChangeService(input: {
  provider: StripeBillingProvider;
  store: BillingSubscriptionOperationStore;
  organizationId: string;
  actorUserId: string;
  subscriptionId: string;
  customerId: string;
  now?: () => number;
}): {
  getStatus(): Promise<BillingOfferStatus | BillingPlanChangeError>;
  preview(
    target: BillingOfferSelection
  ): Promise<{ quote: BillingOfferQuote } | BillingPlanChangeError>;
  schedule(token: string): Promise<StateResult>;
  cancel(scheduleId: string): Promise<StateResult>;
} {
  const { provider, store, organizationId, actorUserId, subscriptionId, customerId } = input;
  const now = input.now ?? Date.now;
  const load = async (): Promise<Stripe.Subscription> => {
    const sub = await provider.client.subscriptions.retrieve(
      subscriptionId,
      { expand: ["items.data.price", "latest_invoice"] },
      options
    );
    if (!belongsTo(sub, subscriptionId, customerId, organizationId))
      throw new Error("billing_identity_mismatch");
    return sub;
  };
  const owned = (
    op: BillingSubscriptionOperation | null,
    kind: "plan_schedule" | "plan_cancel"
  ): op is BillingSubscriptionOperation =>
    op?.kind === kind && op.subscription_id === subscriptionId && op.customer_id === customerId;
  const eligible = (sub: Stripe.Subscription): boolean =>
    sub.status === "active" &&
    !sub.pending_update &&
    !sub.cancel_at &&
    !sub.cancel_at_period_end &&
    sub.collection_method === "charge_automatically" &&
    typeof sub.latest_invoice === "object" &&
    sub.latest_invoice?.status === "paid";
  const pending = async (
    sub: Stripe.Subscription
  ): Promise<BillingOfferChangeState["pending_change"]> => {
    const op = await store.get(organizationId);
    const saved = ParametersSchema.safeParse(op?.parameters);
    const operation =
      owned(op, "plan_schedule") && saved.success && saved.data.action === "offer_schedule"
        ? op
        : null;
    const scheduleId = sub.schedule ? priceId(sub.schedule) : operation?.resource_id;
    if (!scheduleId) return null;
    const schedule = await provider.client.subscriptionSchedules.retrieve(scheduleId, {}, options);
    const result = readPendingStripeOfferChange({
      subscription: sub,
      schedule,
      provider,
      organizationId,
      now: now()
    });
    if (operation?.completed_at === null && schedule.id === operation.resource_id) {
      let applied = false;
      if (saved.success && saved.data.quote) {
        const expected = SavedPhasesSchema.safeParse(saved.data.body["phases"]);
        const final = schedule.phases.at(-1);
        const current = readStripeSubscriptionOffer(sub, provider.priceMap);
        applied =
          expected.success &&
          final !== undefined &&
          current.plan === saved.data.quote.target_plan &&
          current.interval === saved.data.quote.interval &&
          itemShape(final.items) === itemShape(expected.data[1]!.items) &&
          itemShape(sub.items.data) === itemShape(expected.data[1]!.items);
      }
      const ended =
        schedule.status === "completed" ||
        (schedule.status === "released" && schedule.released_subscription === sub.id);
      if (
        result ||
        (applied &&
          schedule.metadata?.["organization_id"] === organizationId &&
          schedule.metadata["debugbundle_change"] === "offer_change" &&
          (ended || isCompletedManagedSchedule(sub, schedule, organizationId)))
      )
        await store.complete(organizationId, operation.id);
    }
    return result;
  };
  return {
    async getStatus(): Promise<BillingOfferStatus | BillingPlanChangeError> {
      try {
        const sub = await load();
        return {
          pending_change: await pending(sub),
          subscription: readStripeSubscriptionOfferStatus(sub, provider.priceMap)
        };
      } catch {
        return "billing_service_error";
      }
    },
    async preview(target): Promise<{ quote: BillingOfferQuote } | BillingPlanChangeError> {
      try {
        const sub = await load();
        await pending(sub);
        const op = await store.get(organizationId);
        if (op?.completed_at === null) {
          const saved = ParametersSchema.safeParse(op.parameters);
          return owned(op, "plan_schedule") &&
            op.intent["actor_user_id"] === actorUserId &&
            saved.success &&
            saved.data.quote &&
            saved.data.quote.target_plan === target.target_plan &&
            saved.data.quote.interval === target.interval
            ? { quote: { ...saved.data.quote, resume_required: true } }
            : "billing_change_in_progress";
        }
        if (
          !canStartBusinessSale({
            enabled: provider.businessSalesEnabled === true,
            current_plan: derivePlanFromSubscriptionItems(sub.items.data, provider.priceMap).plan,
            target_plan: target.target_plan
          })
        )
          return "plan_change_not_allowed";
        if (
          !eligible(sub) ||
          stripeOfferChangeAction(provider, sub, target) !== "renewal" ||
          (sub.schedule &&
            !(await readCompletedManagedSchedule(provider.client, sub, organizationId)))
        )
          return "plan_change_not_allowed";
        buildStripeOfferChangePhases({ subscription: sub, provider, target, now: now() });
        return {
          quote: await createStripeOfferQuote({
            provider,
            subscription: sub,
            organizationId,
            actorUserId,
            target,
            operationRevision: op?.id ?? null,
            now: now()
          })
        };
      } catch {
        return "billing_service_error";
      }
    },
    async schedule(token): Promise<StateResult> {
      let attemptId: string | undefined;
      try {
        if (token.length > 8192) return "plan_change_confirmation_required";
        let sub = await load();
        const existing = await pending(sub);
        if (existing) return { pending_change: existing };
        const previous = await store.get(organizationId);
        const intent = {
          offer_version: 1,
          actor_user_id: actorUserId,
          quote_hash: createHash("sha256").update(token).digest("hex")
        };
        const resuming =
          owned(previous, "plan_schedule") &&
          previous.completed_at === null &&
          previous.parameters !== null &&
          Object.entries(intent).every(([key, value]) => previous.intent[key] === value);
        const confirmation = verifyStripeOfferQuote({
          token,
          secret: provider.webhookSecret,
          organizationId,
          actorUserId,
          subscription: sub,
          now: now()
        });
        if (
          !resuming &&
          (!confirmation ||
            confirmation.action !== "renewal" ||
            confirmation.operation_revision !== (previous?.id ?? null))
        )
          return "plan_change_confirmation_required";
        if (
          !resuming &&
          confirmation &&
          !canStartBusinessSale({
            enabled: provider.businessSalesEnabled === true,
            current_plan: derivePlanFromSubscriptionItems(sub.items.data, provider.priceMap).plan,
            target_plan: confirmation.target_plan
          })
        )
          return "plan_change_not_allowed";
        let op = await store.claim({
          organization_id: organizationId,
          kind: "plan_schedule",
          intent,
          expected_owner_user_id: actorUserId,
          ...(resuming ? {} : { expected_operation_id: confirmation!.operation_revision })
        });
        if (typeof op === "string") return op;
        attemptId = op.id;
        if (!owned(op, "plan_schedule")) return "billing_change_in_progress";
        if (!op.parameters) {
          sub = await load();
          const verified = verifyStripeOfferQuote({
            token,
            secret: provider.webhookSecret,
            organizationId,
            actorUserId,
            subscription: sub,
            now: now()
          });
          const completedScheduleId = await readCompletedManagedSchedule(
            provider.client,
            sub,
            organizationId
          );
          if (
            !verified ||
            verified.action !== "renewal" ||
            verified.amount_due !== 0 ||
            !eligible(sub) ||
            (sub.schedule && !completedScheduleId)
          ) {
            await store.abandonUnprepared(organizationId, op.id);
            return "plan_change_confirmation_required";
          }
          const target = { target_plan: verified.target_plan, interval: verified.interval };
          const phases = buildStripeOfferChangePhases({
            subscription: sub,
            provider,
            target,
            now: now()
          });
          const items = buildStripeOfferItems(sub, provider.priceMap, {
            plan: target.target_plan,
            interval: target.interval,
            currency: "usd"
          });
          if (!items || JSON.stringify(items) !== JSON.stringify(verified.items)) {
            await store.abandonUnprepared(organizationId, op.id);
            return "plan_change_confirmation_required";
          }
          const amounts = await readStripeOfferAmounts({
            client: provider.client,
            subscriptionId,
            items,
            action: "renewal",
            prorationDate: verified.proration_date,
            ...(completedScheduleId ? { recurringPreviewMode: "next" as const } : {})
          });
          if (
            amounts.currency !== verified.currency ||
            amounts.tax !== verified.tax ||
            amounts.recurring_total !== verified.recurring_total ||
            !(await validateStripePurchasePrices(
              provider,
              items.map((item) => item.price)
            ))
          ) {
            await store.abandonUnprepared(organizationId, op.id);
            return "plan_change_confirmation_required";
          }
          const prepared = await store.prepare(
            organizationId,
            op.id,
            {
              action: "offer_schedule",
              schedule_id: null,
              source: planChangeSource(sub),
              quote: publicStripeOfferQuote(verified, token),
              ...(completedScheduleId ? { release_schedule_id: completedScheduleId } : {}),
              body: {
                metadata: {
                  debugbundle_change: "offer_change",
                  organization_id: organizationId,
                  ...target
                },
                end_behavior: "release",
                proration_behavior: "none",
                phases
              }
            },
            actorUserId
          );
          if (!prepared) return "billing_change_in_progress";
          op = prepared;
        }
        const parameters = ParametersSchema.parse(op.parameters);
        if (
          parameters.action !== "offer_schedule" ||
          !eligible(sub) ||
          !canReplayBillingOperation(op.created_at, now())
        )
          return "billing_change_in_progress";
        if (!(await store.prepare(organizationId, op.id, op.parameters!, actorUserId)))
          return "billing_change_in_progress";
        const requestOptions = (step: string): Stripe.RequestOptions => ({
          ...options,
          idempotencyKey: `billing-subscription:${op.id}:${step}`
        });
        if (
          parameters.release_schedule_id &&
          !(await releaseCompletedManagedSchedule({
            client: provider.client,
            subscription: sub,
            organizationId,
            scheduleId: parameters.release_schedule_id,
            idempotencyKey: `billing-subscription:${op.id}:release-completed`
          }))
        )
          return "billing_change_in_progress";
        let scheduleId = op.resource_id;
        if (!scheduleId) {
          const created = await provider.client.subscriptionSchedules.create(
            { from_subscription: subscriptionId },
            requestOptions("create")
          );
          scheduleId = created.id;
          if (!scheduleId || !(await store.saveResource(organizationId, op.id, scheduleId)))
            return "billing_change_in_progress";
        }
        sub = await load();
        if (
          !eligible(sub) ||
          (sub.schedule ? priceId(sub.schedule) : null) !== scheduleId ||
          planChangeSource(sub) !== parameters.source
        )
          return "billing_change_in_progress";
        const schedule = await provider.client.subscriptionSchedules.retrieve(
          scheduleId,
          {},
          options
        );
        const applied = readPendingStripeOfferChange({
          subscription: sub,
          schedule,
          provider,
          organizationId,
          now: now()
        });
        if (applied) {
          if (!(await store.complete(organizationId, op.id))) return "billing_change_in_progress";
          return { pending_change: applied };
        }
        if (!isInitialStripeOfferSchedule(sub, schedule)) return "billing_change_in_progress";
        if (!(await store.prepare(organizationId, op.id, op.parameters!, actorUserId)))
          return "billing_change_in_progress";
        const updated = await provider.client.subscriptionSchedules.update(
          scheduleId,
          parameters.body as Stripe.SubscriptionScheduleUpdateParams,
          requestOptions("update")
        );
        const result = readPendingStripeOfferChange({
          subscription: sub,
          schedule: updated,
          provider,
          organizationId,
          now: now()
        });
        if (!result || !(await store.complete(organizationId, op.id)))
          return "billing_change_in_progress";
        return { pending_change: result };
      } catch {
        if (attemptId) await store.abandonUnprepared(organizationId, attemptId).catch(() => false);
        return "billing_service_error";
      }
    },
    async cancel(scheduleId): Promise<StateResult> {
      try {
        let sub = await load();
        const previous = await store.get(organizationId);
        const saved = ParametersSchema.safeParse(previous?.parameters);
        if (
          owned(previous, "plan_cancel") &&
          previous.resource_id === scheduleId &&
          saved.success &&
          saved.data.action === "offer_cancel"
        ) {
          const schedule = await provider.client.subscriptionSchedules.retrieve(
            scheduleId,
            {},
            options
          );
          if (isCompletedManagedSchedule(sub, schedule, organizationId)) {
            await store.complete(organizationId, previous.id);
            return "plan_change_not_found";
          }
          if (schedule.status === "released" && schedule.released_subscription === subscriptionId) {
            await store.complete(organizationId, previous.id);
            return { pending_change: null };
          }
        }
        const current = await pending(sub);
        if (!current || current.schedule_id !== scheduleId) return "plan_change_not_found";
        if (!eligible(sub)) return "plan_change_not_allowed";
        let op = await store.claim({
          organization_id: organizationId,
          kind: "plan_cancel",
          intent: { offer_version: 1, actor_user_id: actorUserId, schedule_id: scheduleId },
          expected_owner_user_id: actorUserId
        });
        if (typeof op === "string") return op;
        if (!owned(op, "plan_cancel")) return "billing_change_in_progress";
        if (!op.parameters) {
          const prepared = await store.prepare(
            organizationId,
            op.id,
            { action: "offer_cancel", schedule_id: scheduleId, body: {} },
            actorUserId
          );
          if (!prepared) return "billing_change_in_progress";
          op = prepared;
        }
        if (!canReplayBillingOperation(op.created_at, now())) return "billing_change_in_progress";
        if (!(await store.saveResource(organizationId, op.id, scheduleId)))
          return "billing_change_in_progress";
        sub = await load();
        const schedule = await provider.client.subscriptionSchedules.retrieve(
          scheduleId,
          {},
          options
        );
        if (
          !eligible(sub) ||
          !readPendingStripeOfferChange({
            subscription: sub,
            schedule,
            provider,
            organizationId,
            now: now()
          })
        ) {
          if (isCompletedManagedSchedule(sub, schedule, organizationId))
            await store.complete(organizationId, op.id);
          return "plan_change_not_found";
        }
        if (!(await store.prepare(organizationId, op.id, op.parameters!, actorUserId)))
          return "billing_change_in_progress";
        const released = await provider.client.subscriptionSchedules.release(
          scheduleId,
          {},
          { ...options, idempotencyKey: `billing-subscription:${op.id}:release` }
        );
        if (
          released.status !== "released" ||
          released.released_subscription !== subscriptionId ||
          !(await store.complete(organizationId, op.id))
        )
          return "billing_change_in_progress";
        return { pending_change: null };
      } catch {
        return "billing_service_error";
      }
    }
  };
}
