import type Stripe from "stripe";
import type {
  BillingSubscriptionOperation,
  BillingSubscriptionOperationStore
} from "../../storage/src/billing-subscription-operation-store.js";
import type { BillingSummaryRecord } from "../../storage/src/index.js";
import type {
  CapacityOperationContext,
  CapacityOperationError
} from "./stripe-capacity-operations.js";
import {
  BILLING_PROVIDER_REQUEST_OPTIONS,
  belongsTo,
  canReplayBillingOperation,
  invoicePaymentUrl,
  validInvoice
} from "./stripe-subscription-upgrade.js";

export type CapacityPaymentRequired = { payment_required: { url: string } };

export async function applyStripeCapacityPayment(input: {
  client: Stripe;
  store: BillingSubscriptionOperationStore;
  organizationId: string;
  operation: BillingSubscriptionOperation;
  body: Stripe.SubscriptionUpdateParams;
  target: number;
  plan: string;
  now?: number;
  loadContext(): Promise<
    | CapacityOperationContext
    | "billing_not_configured"
    | "billing_not_found"
    | "no_active_subscription"
  >;
}): Promise<BillingSummaryRecord | CapacityPaymentRequired | CapacityOperationError> {
  const { operation, store, organizationId, client } = input;
  let invoice: Stripe.Invoice | null;
  if (operation.resource_id) {
    invoice = await client.invoices.retrieve(
      operation.resource_id,
      {},
      BILLING_PROVIDER_REQUEST_OPTIONS
    );
  } else {
    if (!canReplayBillingOperation(operation.created_at, input.now ?? Date.now()))
      return "billing_change_in_progress";
    const updated = await client.subscriptions.update(operation.subscription_id, input.body, {
      ...BILLING_PROVIDER_REQUEST_OPTIONS,
      idempotencyKey: `billing-subscription:${operation.id}:update`
    });
    if (!belongsTo(updated, operation.subscription_id, operation.customer_id, organizationId))
      return "billing_not_configured";
    invoice = typeof updated.latest_invoice === "object" ? updated.latest_invoice : null;
    if (
      !invoice ||
      !validInvoice(invoice, operation.subscription_id, operation.customer_id) ||
      !(await store.saveResource(organizationId, operation.id, invoice.id))
    )
      return "billing_not_configured";
  }
  if (!validInvoice(invoice, operation.subscription_id, operation.customer_id))
    return "billing_not_configured";
  if (invoice.status === "open") {
    const url = invoicePaymentUrl(invoice);
    return url ? { payment_required: { url } } : "billing_change_in_progress";
  }
  const context = await input.loadContext();
  if (typeof context === "string") return context;
  const state = context.stripeState;
  if (
    !belongsTo(
      state.subscription,
      operation.subscription_id,
      operation.customer_id,
      organizationId
    ) ||
    state.subscription.pending_update
  )
    return "billing_change_in_progress";
  if (invoice.status === "void") {
    await store.retireVoidedPayment(organizationId, operation.id, invoice.id);
    return "billing_change_in_progress";
  }
  if (
    invoice.status !== "paid" ||
    state.subscription.status !== "active" ||
    state.additionalPurchased !== input.target ||
    state.plan !== input.plan
  )
    return "billing_change_in_progress";
  if (!(await store.complete(organizationId, operation.id))) return "billing_not_configured";
  return context.summary;
}
