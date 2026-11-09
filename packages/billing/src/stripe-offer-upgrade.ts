import { canStartBusinessSale } from "./business-sales-policy.js";
import { derivePlanFromSubscriptionItems } from "./stripe-subscription.js";
import { createHash } from "node:crypto";
import type Stripe from "stripe";
import {
  BillingOfferQuoteSchema,
  type BillingOfferQuote,
  type BillingOfferSelection
} from "../../shared-types/src/index.js";
import type {
  BillingSubscriptionOperation,
  BillingSubscriptionOperationStore
} from "../../storage/src/billing-subscription-operation-store.js";
import type { StripeBillingProvider } from "./stripe-subscription.js";
import {
  createStripeOfferQuote,
  publicStripeOfferQuote,
  readStripeOfferAmounts,
  stripeOfferChangeAction,
  verifyStripeOfferQuote
} from "./stripe-offer-quote.js";
import { buildStripeOfferItems, validateStripePurchasePrices } from "./stripe-price-catalog.js";
import { readCompletedManagedSchedule } from "./stripe-completed-schedule.js";
import {
  applyStripeSubscriptionUpgradePayment,
  belongsTo,
  invoicePaymentUrl,
  validInvoice,
  BILLING_PROVIDER_REQUEST_OPTIONS,
  type SubscriptionUpgradeLinkResult
} from "./stripe-subscription-upgrade.js";

type ErrorResult =
  | "checkout_not_allowed"
  | "checkout_in_progress"
  | "billing_service_error"
  | "upgrade_confirmation_required";
export type StripeOfferUpgradePreviewResult =
  | { quote: BillingOfferQuote }
  | { payment_url: string }
  | ErrorResult;
interface OfferUpgradeInput {
  provider: StripeBillingProvider;
  store: BillingSubscriptionOperationStore;
  organizationId: string;
  subscriptionId: string;
  customerId: string;
  actorUserId: string;
  target: BillingOfferSelection;
  now?: number;
}
const sameTarget = (quote: BillingOfferQuote, target: BillingOfferSelection): boolean =>
  quote.target_plan === target.target_plan && quote.interval === target.interval;
const eligible = (sub: Stripe.Subscription): boolean =>
  sub.status === "active" &&
  !sub.pending_update &&
  !sub.cancel_at &&
  !sub.cancel_at_period_end &&
  sub.collection_method === "charge_automatically" &&
  typeof sub.latest_invoice === "object" &&
  sub.latest_invoice?.status === "paid";
async function load(input: OfferUpgradeInput): Promise<Stripe.Subscription> {
  const sub = await input.provider.client.subscriptions.retrieve(
    input.subscriptionId,
    { expand: ["items.data.price", "latest_invoice"] },
    BILLING_PROVIDER_REQUEST_OPTIONS
  );
  if (!belongsTo(sub, input.subscriptionId, input.customerId, input.organizationId))
    throw new Error("billing_identity_mismatch");
  return sub;
}
function ownedOperation(
  op: BillingSubscriptionOperation | null,
  input: OfferUpgradeInput
): op is BillingSubscriptionOperation {
  return (
    op?.kind === "upgrade" &&
    op.completed_at === null &&
    op.subscription_id === input.subscriptionId &&
    op.customer_id === input.customerId
  );
}

/** Read-only preview, including safe recovery of a previously accepted payment. */
export async function previewStripeOfferUpgrade(
  input: OfferUpgradeInput
): Promise<StripeOfferUpgradePreviewResult> {
  try {
    const op = await input.store.get(input.organizationId);
    const sub = await load(input);
    if (op?.completed_at === null) {
      if (!ownedOperation(op, input)) return "checkout_in_progress";
      if (op.resource_id) {
        const invoice = await input.provider.client.invoices.retrieve(
          op.resource_id,
          {},
          BILLING_PROVIDER_REQUEST_OPTIONS
        );
        const url = invoicePaymentUrl(invoice);
        if (
          validInvoice(invoice, input.subscriptionId, input.customerId) &&
          invoice.status === "open" &&
          url
        )
          return { payment_url: url };
      }
      const saved = BillingOfferQuoteSchema.safeParse(op.parameters?.["offer_quote"]);
      return op.intent["actor_user_id"] === input.actorUserId &&
        saved.success &&
        sameTarget(saved.data, input.target)
        ? { quote: { ...saved.data, resume_required: true } }
        : "checkout_in_progress";
    }
    if (
      !canStartBusinessSale({
        enabled: input.provider.businessSalesEnabled === true,
        current_plan: derivePlanFromSubscriptionItems(sub.items.data, input.provider.priceMap).plan,
        target_plan: input.target.target_plan
      })
    )
      return "checkout_not_allowed";
    if (
      !eligible(sub) ||
      stripeOfferChangeAction(input.provider, sub, input.target) !== "upgrade" ||
      (sub.schedule &&
        !(await readCompletedManagedSchedule(input.provider.client, sub, input.organizationId)))
    )
      return "checkout_not_allowed";
    return {
      quote: await createStripeOfferQuote({
        provider: input.provider,
        subscription: sub,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        target: input.target,
        operationRevision: op?.id ?? null,
        now: input.now ?? Date.now()
      })
    };
  } catch {
    return "billing_service_error";
  }
}

/** Reuses the established pending-update protocol; never creates another subscription. */
export async function createStripeOfferUpgradeLink(
  input: OfferUpgradeInput & { appBaseUrl: string; confirmationToken: string }
): Promise<SubscriptionUpgradeLinkResult> {
  const { provider, store, organizationId } = input;
  const now = input.now ?? Date.now();
  let attemptId: string | undefined;
  try {
    if (input.confirmationToken.length > 8192) return "upgrade_confirmation_required";
    const previous = await store.get(organizationId);
    const intent = {
      offer_version: 1,
      actor_user_id: input.actorUserId,
      target_plan: input.target.target_plan,
      interval: input.target.interval,
      quote_hash: createHash("sha256").update(input.confirmationToken).digest("hex")
    };
    const resuming =
      ownedOperation(previous, input) &&
      Object.entries(intent).every(([key, value]) => previous.intent[key] === value);
    let sub = await load(input);
    const confirmation = verifyStripeOfferQuote({
      token: input.confirmationToken,
      secret: provider.webhookSecret,
      organizationId,
      actorUserId: input.actorUserId,
      subscription: sub,
      now
    });
    if (
      !resuming &&
      (!confirmation ||
        confirmation.action !== "upgrade" ||
        confirmation.target_plan !== input.target.target_plan ||
        confirmation.interval !== input.target.interval ||
        confirmation.operation_revision !== (previous?.id ?? null))
    )
      return "upgrade_confirmation_required";
    if (
      !resuming &&
      (!eligible(sub) || stripeOfferChangeAction(provider, sub, input.target) !== "upgrade")
    )
      return "checkout_not_allowed";
    if (
      !resuming &&
      !canStartBusinessSale({
        enabled: provider.businessSalesEnabled === true,
        current_plan: derivePlanFromSubscriptionItems(sub.items.data, provider.priceMap).plan,
        target_plan: input.target.target_plan
      })
    )
      return "checkout_not_allowed";
    let op = await store.claim({
      organization_id: organizationId,
      kind: "upgrade",
      intent,
      expected_owner_user_id: input.actorUserId,
      ...(resuming ? {} : { expected_operation_id: confirmation!.operation_revision })
    });
    if (typeof op === "string")
      return op === "no_active_subscription" ? "checkout_not_allowed" : "checkout_in_progress";
    attemptId = op.id;
    if (!ownedOperation(op, input)) return "checkout_in_progress";
    if (!op.parameters) {
      sub = await load(input);
      const verified = verifyStripeOfferQuote({
        token: input.confirmationToken,
        secret: provider.webhookSecret,
        organizationId,
        actorUserId: input.actorUserId,
        subscription: sub,
        now
      });
      const completedScheduleId = await readCompletedManagedSchedule(
        provider.client,
        sub,
        organizationId
      );
      const items = buildStripeOfferItems(sub, provider.priceMap, {
        plan: input.target.target_plan,
        interval: input.target.interval,
        currency: "usd"
      });
      if (
        !verified ||
        verified.action !== "upgrade" ||
        !eligible(sub) ||
        stripeOfferChangeAction(provider, sub, input.target) !== "upgrade" ||
        (sub.schedule && !completedScheduleId) ||
        !items ||
        JSON.stringify(items) !== JSON.stringify(verified.items)
      ) {
        await store.abandonUnprepared(organizationId, op.id);
        return "upgrade_confirmation_required";
      }
      const amounts = await readStripeOfferAmounts({
        client: provider.client,
        subscriptionId: input.subscriptionId,
        items,
        action: "upgrade",
        prorationDate: verified.proration_date,
        ...(completedScheduleId ? { recurringPreviewMode: "next" as const } : {})
      });
      if (
        amounts.currency !== verified.currency ||
        amounts.amount_due !== verified.amount_due ||
        amounts.tax !== verified.tax ||
        amounts.recurring_total !== verified.recurring_total ||
        !(await validateStripePurchasePrices(
          provider,
          items.map((item) => item.price)
        ))
      ) {
        await store.abandonUnprepared(organizationId, op.id);
        return "upgrade_confirmation_required";
      }
      const prepared = await store.prepare(
        organizationId,
        op.id,
        {
          items,
          ...(completedScheduleId ? { release_schedule_id: completedScheduleId } : {}),
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
          proration_date: verified.proration_date,
          expand: ["latest_invoice"],
          offer_quote: publicStripeOfferQuote(verified, input.confirmationToken)
        },
        input.actorUserId
      );
      if (!prepared) return "checkout_in_progress";
      op = prepared;
    }
    return await applyStripeSubscriptionUpgradePayment({
      provider,
      store,
      organizationId,
      operation: op,
      subscription: sub,
      appBaseUrl: input.appBaseUrl,
      now,
      expectedOwnerUserId: input.actorUserId
    });
  } catch {
    if (attemptId) await store.abandonUnprepared(organizationId, attemptId).catch(() => false);
    return "billing_service_error";
  }
}
