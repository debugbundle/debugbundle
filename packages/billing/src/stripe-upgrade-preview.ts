import { readCompletedManagedSchedule } from "./stripe-completed-schedule.js";
import { createUpgradeQuote, type BillingUpgradeQuote } from "./stripe-upgrade-quote.js";
import {
  belongsTo,
  planItems,
  validInvoice,
  invoicePaymentUrl,
  BILLING_PROVIDER_REQUEST_OPTIONS,
  type StripeUpgradeProvider
} from "./stripe-subscription-upgrade.js";
import type { BillingSubscriptionOperationStore } from "../../storage/src/billing-subscription-operation-store.js";

export type UpgradePreviewResult =
  | { quote: BillingUpgradeQuote }
  | { payment_url: string }
  | "checkout_not_allowed"
  | "checkout_in_progress"
  | "billing_service_error";

// Preview is read-only at Stripe: an existing unpaid invoice is resumed, never
// replaced with a new payment. An ambiguous reservation remains blocked.
export async function previewStripeSubscriptionUpgrade(input: {
  provider: StripeUpgradeProvider;
  store: BillingSubscriptionOperationStore;
  organizationId: string;
  subscriptionId: string;
  customerId: string;
  now?: number;
}): Promise<UpgradePreviewResult> {
  try {
    const { provider, organizationId, subscriptionId, customerId } = input;
    const subscription = await provider.client.subscriptions.retrieve(
      subscriptionId,
      { expand: ["items.data.price", "latest_invoice"] },
      BILLING_PROVIDER_REQUEST_OPTIONS
    );
    if (!belongsTo(subscription, subscriptionId, customerId, organizationId))
      return "checkout_not_allowed";
    const operation = await input.store.get(organizationId);
    if (operation?.completed_at === null && operation.parameters) {
      if (
        operation.kind !== "upgrade" ||
        !operation.resource_id ||
        operation.subscription_id !== subscriptionId ||
        operation.customer_id !== customerId
      )
        return "checkout_in_progress";
      const invoice = await provider.client.invoices.retrieve(
        operation.resource_id,
        {},
        BILLING_PROVIDER_REQUEST_OPTIONS
      );
      const url = invoicePaymentUrl(invoice);
      return validInvoice(invoice, subscriptionId, customerId) && invoice.status === "open" && url
        ? { payment_url: url }
        : "checkout_in_progress";
    }
    const items = planItems(subscription, provider, "solo");
    const invoice =
      typeof subscription.latest_invoice === "object" ? subscription.latest_invoice : null;
    if (
      !items ||
      subscription.status !== "active" ||
      (subscription.schedule &&
        !(await readCompletedManagedSchedule(provider.client, subscription, organizationId))) ||
      subscription.pending_update ||
      subscription.cancel_at ||
      subscription.cancel_at_period_end ||
      subscription.collection_method !== "charge_automatically" ||
      invoice?.status !== "paid"
    )
      return "checkout_not_allowed";
    return {
      quote: await createUpgradeQuote({
        client: provider.client,
        secret: provider.webhookSecret,
        organizationId,
        subscription,
        items,
        additionalCapacityUnits:
          items.find((item) => item.price === provider.teamExtraCapacityPriceId)?.quantity ?? 0,
        ...(input.now === undefined ? {} : { now: input.now })
      })
    };
  } catch {
    return "billing_service_error";
  }
}
