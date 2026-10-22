import type Stripe from "stripe";
import { z } from "zod";
import type { BillingSubscriptionOperationStore } from "../../storage/src/billing-subscription-operation-store.js";

const ExpectedItems = z
  .array(
    z.object({
      id: z.string().optional(),
      price: z.string(),
      quantity: z.number().int().positive()
    })
  )
  .min(1)
  .max(2);

// Payment can finish on Stripe after the initiating request ends. Reconcile the
// exact saved operation from reads before admitting a later capacity mutation.
// A mismatch or unknown outcome retains the reservation; no write to Stripe occurs.
export async function reconcileStripeSubscriptionOperation(input: {
  store: BillingSubscriptionOperationStore;
  client: Stripe;
  organizationId: string;
  subscription: Stripe.Subscription;
}): Promise<void> {
  const operation = await input.store.get(input.organizationId);
  if (
    !operation ||
    operation.completed_at !== null ||
    !["upgrade", "capacity_increase"].includes(operation.kind) ||
    !operation.parameters
  )
    return;
  const sub = input.subscription;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (
    sub.id !== operation.subscription_id ||
    customer !== operation.customer_id ||
    (sub.metadata?.["organization_id"] &&
      sub.metadata["organization_id"] !== input.organizationId) ||
    sub.pending_update
  )
    return;
  const latest = typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
  const invoice = operation.resource_id
    ? await input.client.invoices.retrieve(
        operation.resource_id,
        {},
        { timeout: 8000, maxNetworkRetries: 0 }
      )
    : latest;
  if (!invoice) return;
  const invoiceCustomer =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  const parent = invoice.parent?.subscription_details?.subscription;
  const invoiceSubscription = typeof parent === "string" ? parent : parent?.id;
  if (
    invoiceCustomer !== operation.customer_id ||
    invoiceSubscription !== sub.id ||
    invoice.billing_reason !== "subscription_update"
  )
    return;
  if (operation.resource_id && invoice.status === "void") {
    await input.store.retireVoidedPayment(input.organizationId, operation.id, invoice.id);
    return;
  }
  const body =
    operation.kind === "upgrade"
      ? operation.parameters
      : (operation.parameters["body"] as Record<string, unknown> | undefined);
  const expected = ExpectedItems.safeParse(body?.["items"]);
  if (
    invoice.status !== "paid" ||
    sub.status !== "active" ||
    !expected.success ||
    sub.items.has_more ||
    sub.items.data.length !== expected.data.length ||
    !expected.data.every((item) =>
      sub.items.data.some(
        (current) =>
          (!item.id || current.id === item.id) &&
          current.price.id === item.price &&
          current.quantity === item.quantity
      )
    )
  )
    return;
  if (
    !operation.resource_id &&
    !(await input.store.saveResource(input.organizationId, operation.id, invoice.id))
  )
    return;
  await input.store.complete(input.organizationId, operation.id);
}
