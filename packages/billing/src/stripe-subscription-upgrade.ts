import {
  readCompletedManagedSchedule,
  releaseCompletedManagedSchedule
} from "./stripe-completed-schedule.js";
import type Stripe from "stripe";
import { z } from "zod";
import { readUpgradeAmounts, verifyUpgradeQuote } from "./stripe-upgrade-quote.js";
import type { BillingSubscriptionOperationStore } from "../../storage/src/billing-subscription-operation-store.js";

export const BILLING_PROVIDER_REQUEST_OPTIONS = { timeout: 8_000, maxNetworkRetries: 0 } as const;
// Stripe can prune idempotency keys after 24h. Stop earlier, retaining the
// ambiguous reservation for reconciliation instead of risking another charge.
export const BILLING_IDEMPOTENT_REPLAY_WINDOW_MS = 23 * 60 * 60 * 1000;

export function canReplayBillingOperation(createdAt: string, now: number): boolean {
  const age = now - Date.parse(createdAt);
  // The reservation can be inserted milliseconds after the API captured now.
  // One minute of clock tolerance stays well inside the one-hour safety margin.
  return Number.isFinite(age) && age >= -60_000 && age < BILLING_IDEMPOTENT_REPLAY_WINDOW_MS;
}

export interface StripeUpgradeProvider {
  client: Stripe;
  webhookSecret: string;
  soloPriceId: string;
  teamPriceId: string;
  soloExtraCapacityPriceId: string;
  teamExtraCapacityPriceId: string;
}
export type SubscriptionUpgradeLinkResult =
  | { url: string }
  | "checkout_in_progress"
  | "checkout_not_allowed"
  | "billing_service_error"
  | "upgrade_confirmation_required";

const UpgradeParametersSchema = z.object({
  release_schedule_id: z.string().optional(),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        price: z.string().min(1),
        quantity: z.number().int().min(1).max(99)
      })
    )
    .min(1)
    .max(2),
  payment_behavior: z.literal("pending_if_incomplete"),
  proration_behavior: z.literal("always_invoice"),
  proration_date: z.number().int().nonnegative(),
  expand: z.tuple([z.literal("latest_invoice")])
});

export function belongsTo(
  subscription: Stripe.Subscription,
  subscriptionId: string,
  customerId: string,
  organizationId: string
): boolean {
  const customer =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  return (
    subscription.id === subscriptionId &&
    customer === customerId &&
    (!subscription.metadata?.["organization_id"] ||
      subscription.metadata["organization_id"] === organizationId)
  );
}

export function planItems(
  subscription: Stripe.Subscription,
  provider: StripeUpgradeProvider,
  plan: "solo" | "team"
): Stripe.SubscriptionUpdateParams.Item[] | null {
  if (
    subscription.items.has_more ||
    subscription.items.data.length < 1 ||
    subscription.items.data.length > 2
  )
    return null;
  const basePrice = plan === "solo" ? provider.soloPriceId : provider.teamPriceId;
  const capacityPrice =
    plan === "solo" ? provider.soloExtraCapacityPriceId : provider.teamExtraCapacityPriceId;
  let base = 0;
  let capacity = 0;
  const items: Stripe.SubscriptionUpdateParams.Item[] = [];
  for (const item of subscription.items.data) {
    if (!item.id) return null;
    if (item.price.id === basePrice && item.quantity === 1 && base++ === 0) {
      items.push({ id: item.id, price: provider.teamPriceId, quantity: 1 });
    } else if (
      item.price.id === capacityPrice &&
      Number.isSafeInteger(item.quantity) &&
      item.quantity! > 0 &&
      item.quantity! <= 99 &&
      capacity++ === 0
    ) {
      // Changing a Stripe item Price resets quantity unless it is explicit.
      items.push({
        id: item.id,
        price: provider.teamExtraCapacityPriceId,
        quantity: item.quantity!
      });
    } else return null;
  }
  return base === 1 ? items : null;
}

function expandedInvoice(subscription: Stripe.Subscription): Stripe.Invoice | null {
  return typeof subscription.latest_invoice === "object" ? subscription.latest_invoice : null;
}

export function validInvoice(
  invoice: Stripe.Invoice,
  subscriptionId: string,
  customerId: string
): boolean {
  const customer = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  const parent = invoice.parent?.subscription_details?.subscription;
  const subscription = typeof parent === "string" ? parent : parent?.id;
  return (
    customer === customerId &&
    subscription === subscriptionId &&
    invoice.billing_reason === "subscription_update"
  );
}

export function invoicePaymentUrl(invoice: Stripe.Invoice): string | null {
  try {
    const url = new URL(invoice.hosted_invoice_url ?? "");
    return url.protocol === "https:" &&
      url.hostname === "invoice.stripe.com" &&
      !url.username &&
      !url.password &&
      !url.port
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export async function createStripeSubscriptionUpgradeLink(input: {
  provider: StripeUpgradeProvider;
  store: BillingSubscriptionOperationStore;
  organizationId: string;
  appBaseUrl: string;
  confirmationToken?: string;
  now?: number;
}): Promise<SubscriptionUpgradeLinkResult> {
  const { provider, store, organizationId, appBaseUrl } = input;
  const now = input.now ?? Date.now();
  try {
    let operation = await store.claim({
      organization_id: organizationId,
      kind: "upgrade",
      intent: { target_plan: "team" }
    });
    if (operation === "billing_change_in_progress") return "checkout_in_progress";
    if (operation === "no_active_subscription") return "checkout_not_allowed";
    let subscription = await provider.client.subscriptions.retrieve(
      operation.subscription_id,
      { expand: ["items.data.price", "latest_invoice"] },
      BILLING_PROVIDER_REQUEST_OPTIONS
    );
    if (!belongsTo(subscription, operation.subscription_id, operation.customer_id, organizationId))
      return "checkout_not_allowed";
    const refreshed = await store.claim({
      organization_id: organizationId,
      kind: "upgrade",
      intent: { target_plan: "team" }
    });
    if (typeof refreshed === "string" || refreshed.id !== operation.id)
      return "checkout_in_progress";
    operation = refreshed;
    if (subscription.status !== "active") {
      await store.abandonUnprepared(organizationId, operation.id);
      return "checkout_not_allowed";
    }
    const teamItems = planItems(subscription, provider, "team");
    if (
      teamItems &&
      !subscription.pending_update &&
      expandedInvoice(subscription)?.status === "paid"
    ) {
      if (!(await store.complete(organizationId, operation.id))) return "billing_service_error";
      return { url: `${appBaseUrl}/billing?checkout=success` };
    }
    if (operation.completed_at !== null) return "checkout_not_allowed";
    if (operation.parameters === null) {
      const items = planItems(subscription, provider, "solo");
      const completedScheduleId = await readCompletedManagedSchedule(
        provider.client,
        subscription,
        organizationId
      );
      if (
        !items ||
        (subscription.schedule && !completedScheduleId) ||
        subscription.pending_update ||
        subscription.cancel_at_period_end ||
        subscription.cancel_at ||
        subscription.collection_method !== "charge_automatically" ||
        expandedInvoice(subscription)?.status !== "paid"
      ) {
        await store.abandonUnprepared(organizationId, operation.id);
        return "checkout_not_allowed";
      }
      const quote = input.confirmationToken
        ? verifyUpgradeQuote({
            token: input.confirmationToken,
            secret: provider.webhookSecret,
            organizationId,
            subscription,
            now
          })
        : null;
      if (!quote || JSON.stringify(quote.items) !== JSON.stringify(items)) {
        await store.abandonUnprepared(organizationId, operation.id);
        return "upgrade_confirmation_required";
      }
      const amounts = await readUpgradeAmounts({
        client: provider.client,
        subscriptionId: subscription.id,
        items,
        prorationDate: quote.proration_date,
        ...(completedScheduleId ? { recurringPreviewMode: "next" as const } : {})
      });
      if (
        amounts.currency !== quote.currency ||
        amounts.amount_due !== quote.amount_due ||
        amounts.tax !== quote.tax ||
        amounts.monthly_total !== quote.monthly_total
      ) {
        await store.abandonUnprepared(organizationId, operation.id);
        return "upgrade_confirmation_required";
      }
      const prepared = await store.prepare(organizationId, operation.id, {
        items,
        ...(completedScheduleId ? { release_schedule_id: completedScheduleId } : {}),
        payment_behavior: "pending_if_incomplete",
        proration_behavior: "always_invoice",
        proration_date: quote.proration_date,
        expand: ["latest_invoice"]
      });
      if (!prepared) return "billing_service_error";
      operation = prepared;
    }
    let invoice: Stripe.Invoice | null;
    if (operation.resource_id) {
      invoice = await provider.client.invoices.retrieve(
        operation.resource_id,
        {},
        BILLING_PROVIDER_REQUEST_OPTIONS
      );
    } else {
      if (!canReplayBillingOperation(operation.created_at, input.now ?? Date.now()))
        return "checkout_in_progress";
      const { release_schedule_id: releaseScheduleId, ...parameters } =
        UpgradeParametersSchema.parse(operation.parameters);
      if (
        releaseScheduleId &&
        !(await releaseCompletedManagedSchedule({
          client: provider.client,
          subscription,
          organizationId,
          scheduleId: releaseScheduleId,
          idempotencyKey: `billing-subscription:${operation.id}:release-completed`
        }))
      )
        return "checkout_in_progress";
      const updated = await provider.client.subscriptions.update(
        operation.subscription_id,
        parameters,
        {
          ...BILLING_PROVIDER_REQUEST_OPTIONS,
          idempotencyKey: `billing-subscription:${operation.id}:update`
        }
      );
      if (!belongsTo(updated, operation.subscription_id, operation.customer_id, organizationId))
        return "billing_service_error";
      invoice = expandedInvoice(updated);
      if (!invoice || !validInvoice(invoice, operation.subscription_id, operation.customer_id))
        return "billing_service_error";
      if (!(await store.saveResource(organizationId, operation.id, invoice.id)))
        return "billing_service_error";
      // Never use the possibly cached mutation response as the final entitlement
      // snapshot. Webhooks and the existing billing-return poll own that state.
      subscription = await provider.client.subscriptions.retrieve(
        operation.subscription_id,
        { expand: ["items.data.price", "latest_invoice"] },
        BILLING_PROVIDER_REQUEST_OPTIONS
      );
    }
    if (
      !invoice ||
      !validInvoice(invoice, operation.subscription_id, operation.customer_id) ||
      !belongsTo(subscription, operation.subscription_id, operation.customer_id, organizationId)
    )
      return "billing_service_error";
    if (
      invoice.status === "paid" &&
      subscription.status === "active" &&
      !subscription.pending_update &&
      planItems(subscription, provider, "team")
    ) {
      if (!(await store.complete(organizationId, operation.id))) return "billing_service_error";
      return { url: `${appBaseUrl}/billing?checkout=success` };
    }
    if (
      invoice.status === "void" &&
      !subscription.pending_update &&
      planItems(subscription, provider, "solo")
    ) {
      await store.retireVoidedPayment(organizationId, operation.id, invoice.id);
      return "checkout_in_progress";
    }
    if (invoice.status !== "open") return "checkout_in_progress";
    const url = invoicePaymentUrl(invoice);
    return url ? { url } : "billing_service_error";
  } catch {
    // Keep prepared parameters and the attempt identity after every uncertain
    // provider or persistence result. A later explicit request reconciles them.
    return "billing_service_error";
  }
}
