import {
  isCompletedManagedSchedule,
  readCompletedManagedSchedule,
  releaseCompletedManagedSchedule
} from "./stripe-completed-schedule.js";
import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { z } from "zod";
import { BillingPlanChangeQuoteSchema } from "../../billing-client/src/plan-change.js";
import { planChangeSource } from "./stripe-plan-change-quote.js";
import type {
  BillingPlanChangeError,
  BillingPlanChangeQuote,
  BillingPlanChangeResult,
  BillingPlanChangeState
} from "../../billing-client/src/plan-change.js";
import type { BillingSubscriptionOperationStore } from "../../storage/src/billing-subscription-operation-store.js";
import type { StripeBillingProvider } from "./stripe-subscription.js";
import {
  belongsTo,
  canReplayBillingOperation,
  BILLING_PROVIDER_REQUEST_OPTIONS as options
} from "./stripe-subscription-upgrade.js";
import {
  createPlanChangeQuote,
  readPlanChangeAmounts,
  verifyPlanChangeQuote
} from "./stripe-plan-change-quote.js";
import {
  planChangeItems,
  planChangePhases,
  readPendingPlanChange
} from "./stripe-plan-change-schedule.js";

const ParametersSchema = z
  .object({
    action: z.enum(["plan_schedule", "plan_cancel"]),
    schedule_id: z.string().nullable(),
    release_schedule_id: z.string().optional(),
    body: z.record(z.string(), z.unknown()),
    source: z.string().optional(),
    quote: BillingPlanChangeQuoteSchema.optional()
  })
  .strict();
export function createStripePlanChangeService(input: {
  provider: StripeBillingProvider;
  store: BillingSubscriptionOperationStore;
  organizationId: string;
  subscriptionId: string;
  customerId: string;
  now?: () => number;
}): {
  getStatus(): Promise<BillingPlanChangeResult>;
  preview(): Promise<{ quote: BillingPlanChangeQuote } | BillingPlanChangeError>;
  schedule(token: string): Promise<BillingPlanChangeResult>;
  cancel(scheduleId: string): Promise<BillingPlanChangeResult>;
} {
  const { provider, store, organizationId, subscriptionId, customerId } = input;
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
  const eligible = (sub: Stripe.Subscription): boolean =>
    sub.status === "active" &&
    !sub.cancel_at &&
    !sub.cancel_at_period_end &&
    !sub.pending_update &&
    sub.collection_method === "charge_automatically" &&
    typeof sub.latest_invoice === "object" &&
    sub.latest_invoice?.status === "paid";
  const pending = async (
    sub: Stripe.Subscription
  ): Promise<BillingPlanChangeState["pending_change"]> => {
    const op = await store.get(organizationId);
    const ownedOperation =
      op?.kind === "plan_schedule" &&
      op.parameters &&
      op.resource_id &&
      op.subscription_id === subscriptionId &&
      op.customer_id === customerId
        ? op
        : null;
    const scheduleId = sub.schedule
      ? typeof sub.schedule === "string"
        ? sub.schedule
        : sub.schedule.id
      : ownedOperation?.resource_id;
    if (!scheduleId) return null;
    const schedule = await provider.client.subscriptionSchedules.retrieve(scheduleId, {}, options);
    const result = readPendingPlanChange(sub, schedule, provider, organizationId, now());
    if (
      ownedOperation &&
      ownedOperation.resource_id === schedule.id &&
      ownedOperation.completed_at === null
    ) {
      // A lost update response may be revisited after the scheduled phase has
      // already applied. Reconcile exact known provider state without replay.
      const final = schedule.phases.at(-1);
      const applied =
        final &&
        !sub.items.has_more &&
        final.items.length === sub.items.data.length &&
        final.items.every((item) =>
          sub.items.data.some(
            (current) =>
              current.price.id === (typeof item.price === "string" ? item.price : item.price.id) &&
              current.quantity === (item.quantity ?? 1)
          )
        );
      const ended =
        schedule.status === "completed" ||
        (schedule.status === "released" && schedule.released_subscription === sub.id);
      if (
        result ||
        isCompletedManagedSchedule(sub, schedule, organizationId) ||
        (ended &&
          applied &&
          schedule.metadata?.["organization_id"] === organizationId &&
          schedule.metadata["debugbundle_change"] === "plan_downgrade")
      )
        await store.complete(organizationId, ownedOperation.id);
    }
    return result;
  };
  const service = {
    async getStatus(): Promise<BillingPlanChangeResult> {
      try {
        return { pending_change: await pending(await load()) };
      } catch {
        return "billing_service_error";
      }
    },
    async preview(): Promise<{ quote: BillingPlanChangeQuote } | BillingPlanChangeError> {
      try {
        const operation = await store.get(organizationId);
        if (operation?.completed_at === null) {
          const saved = ParametersSchema.safeParse(operation.parameters);
          if (
            operation.kind === "plan_schedule" &&
            operation.subscription_id === subscriptionId &&
            operation.customer_id === customerId &&
            saved.success &&
            saved.data.quote
          )
            return { quote: { ...saved.data.quote, resume_required: true } };
          return "billing_change_in_progress";
        }
        const sub = await load();
        if (
          !eligible(sub) ||
          (sub.schedule &&
            !(await readCompletedManagedSchedule(provider.client, sub, organizationId)))
        )
          return "plan_change_not_allowed";
        const target = planChangeItems(sub, provider, now());
        return {
          quote: await createPlanChangeQuote({
            client: provider.client,
            secret: provider.webhookSecret,
            organizationId,
            subscription: sub,
            items: target.items,
            quantity: target.quantity,
            effectiveAt: target.end,
            operationRevision: operation?.id ?? null,
            now: now()
          })
        };
      } catch {
        return "billing_service_error";
      }
    },
    async schedule(token: string): Promise<BillingPlanChangeResult> {
      let attemptId: string | undefined;
      try {
        let sub = await load();
        const existing = await pending(sub);
        if (existing) return { pending_change: existing };
        const intent = { quote_hash: createHash("sha256").update(token).digest("hex") };
        const previous = await store.get(organizationId);
        const resuming =
          previous?.completed_at === null &&
          previous.kind === "plan_schedule" &&
          previous.intent["quote_hash"] === intent.quote_hash;
        const confirmation = verifyPlanChangeQuote({
          token,
          secret: provider.webhookSecret,
          organizationId,
          subscription: sub,
          now: now()
        });
        if (
          !resuming &&
          (!confirmation || confirmation.operationRevision !== (previous?.id ?? null))
        )
          return "plan_change_confirmation_required";
        let op = await store.claim({
          organization_id: organizationId,
          kind: "plan_schedule",
          intent,
          expected_operation_id: confirmation?.operationRevision ?? null
        });
        if (typeof op === "string") return op;
        attemptId = op.id;
        if (op.subscription_id !== subscriptionId || op.customer_id !== customerId)
          return "billing_change_in_progress";
        if (!op.parameters) {
          // Re-read after reserving: concurrent mutations share this durable slot.
          sub = await load();
          const verified = verifyPlanChangeQuote({
            token,
            secret: provider.webhookSecret,
            organizationId,
            subscription: sub,
            now: now()
          });
          const quote = verified?.quote ?? null;
          const completedScheduleId = await readCompletedManagedSchedule(
            provider.client,
            sub,
            organizationId
          );
          let error: BillingPlanChangeError | null = null;
          if (!eligible(sub) || (sub.schedule && !completedScheduleId))
            error = "plan_change_not_allowed";
          else if (!quote) error = "plan_change_confirmation_required";
          else {
            const target = planChangeItems(sub, provider, now());
            const amounts = await readPlanChangeAmounts(
              provider.client,
              subscriptionId,
              target.items,
              completedScheduleId ? "next" : undefined
            );
            if (
              amounts.currency !== quote.currency ||
              amounts.tax !== quote.tax ||
              amounts.monthly_total !== quote.monthly_total
            )
              error = "plan_change_confirmation_required";
          }
          if (error) {
            await store.abandonUnprepared(organizationId, op.id);
            return error;
          }
          const prepared = await store.prepare(organizationId, op.id, {
            action: "plan_schedule",
            schedule_id: null,
            ...(completedScheduleId ? { release_schedule_id: completedScheduleId } : {}),
            source: planChangeSource(sub),
            quote,
            body: {
              metadata: { debugbundle_change: "plan_downgrade", organization_id: organizationId },
              end_behavior: "release",
              proration_behavior: "none",
              phases: planChangePhases(sub, provider, now())
            }
          });
          if (!prepared) return "billing_change_in_progress";
          op = prepared;
        }
        const parameters = ParametersSchema.parse(op.parameters);
        if (
          parameters.action !== "plan_schedule" ||
          !eligible(sub) ||
          !canReplayBillingOperation(op.created_at, now())
        )
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
          // If create timed out, the stable key recovers that same schedule.
          const created = await provider.client.subscriptionSchedules.create(
            { from_subscription: subscriptionId },
            requestOptions("create")
          );
          scheduleId = created.id;
          if (!(await store.saveResource(organizationId, op.id, scheduleId)))
            return "billing_change_in_progress";
        }
        sub = await load();
        if (
          !eligible(sub) ||
          (typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id) !== scheduleId ||
          planChangeSource(sub) !== parameters.source
        )
          return "billing_change_in_progress";
        const currentSchedule = await provider.client.subscriptionSchedules.retrieve(
          scheduleId,
          {},
          options
        );
        const applied = readPendingPlanChange(
          sub,
          currentSchedule,
          provider,
          organizationId,
          now()
        );
        if (applied) {
          if (!(await store.complete(organizationId, op.id))) return "billing_change_in_progress";
          return { pending_change: applied };
        }
        // Only finish the one-phase schedule created by this operation. Never
        // overwrite an unrelated future phase after an uncertain response.
        if (
          currentSchedule.status !== "active" ||
          currentSchedule.phases.length !== 1 ||
          currentSchedule.metadata?.["debugbundle_change"]
        )
          return "billing_change_in_progress";
        const updated = await provider.client.subscriptionSchedules.update(
          scheduleId,
          parameters.body as Stripe.SubscriptionScheduleUpdateParams,
          requestOptions("update")
        );
        const result = readPendingPlanChange(sub, updated, provider, organizationId, now());
        if (!result || !(await store.complete(organizationId, op.id)))
          return "billing_change_in_progress";
        return { pending_change: result };
      } catch {
        if (attemptId) await store.abandonUnprepared(organizationId, attemptId);
        return "billing_service_error";
      }
    },
    async cancel(scheduleId: string): Promise<BillingPlanChangeResult> {
      try {
        const sub = await load();
        const previous = await store.get(organizationId);
        // A known released schedule is safe to reconcile even beyond replay TTL.
        if (
          previous?.kind === "plan_cancel" &&
          previous.resource_id === scheduleId &&
          previous.subscription_id === subscriptionId &&
          previous.customer_id === customerId
        ) {
          const schedule = await provider.client.subscriptionSchedules.retrieve(
            scheduleId,
            {},
            options
          );
          const released = schedule.released_subscription;
          if (schedule.status === "released" && released === subscriptionId) {
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
          intent: { schedule_id: scheduleId }
        });
        if (typeof op === "string") return op;
        if (op.subscription_id !== subscriptionId || op.customer_id !== customerId)
          return "billing_change_in_progress";
        if (!op.parameters) {
          const prepared = await store.prepare(organizationId, op.id, {
            action: "plan_cancel",
            schedule_id: scheduleId,
            body: {}
          });
          if (!prepared) return "billing_change_in_progress";
          op = prepared;
        }
        if (!canReplayBillingOperation(op.created_at, now())) return "billing_change_in_progress";
        if (!(await store.saveResource(organizationId, op.id, scheduleId)))
          return "billing_change_in_progress";
        await provider.client.subscriptionSchedules.release(
          scheduleId,
          {},
          { ...options, idempotencyKey: `billing-subscription:${op.id}:release` }
        );
        if (!(await store.complete(organizationId, op.id))) return "billing_change_in_progress";
        return { pending_change: null };
      } catch {
        return "billing_service_error";
      }
    }
  };
  return service;
}
