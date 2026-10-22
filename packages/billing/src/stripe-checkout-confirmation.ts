import type Stripe from "stripe";
import type { BillingSyncStore, Queryable } from "../../storage/src/index.js";
import {
  deriveBillingState,
  derivePlanFromSubscriptionItems,
  assertSupportedSubscriptionItems,
  type StripeBillingProvider
} from "./stripe-subscription.js";
import { belongsTo, BILLING_PROVIDER_REQUEST_OPTIONS } from "./stripe-subscription-upgrade.js";
import { resolveStripeSubscriptionBillingPeriod } from "./stripe-billing-period.js";

export async function confirmStripeCheckout(input: {
  db: Queryable;
  store: BillingSyncStore;
  provider: StripeBillingProvider;
  organizationId: string;
  sessionId: string;
  now: string;
}): Promise<
  | "confirmed"
  | "billing_not_found"
  | "checkout_session_not_found"
  | "checkout_not_complete"
  | "billing_service_error"
> {
  const { provider, organizationId } = input;
  try {
    // xmin fences this read against any concurrent account write, including
    // a later webhook. Linking and entitlements commit as one conditional write.
    const row = (
      await input.db.query<{
        revision: string;
        stripe_subscription_id: string | null;
        stripe_customer_id: string | null;
        billing_state: string | null;
      }>(
        "SELECT xmin::text AS revision,stripe_subscription_id,stripe_customer_id,billing_state FROM organizations WHERE id=$1",
        [organizationId]
      )
    ).rows[0];
    if (!row) return "billing_not_found";
    if (!row.revision) return "billing_service_error";
    let session: Stripe.Checkout.Session;
    try {
      session = await provider.client.checkout.sessions.retrieve(
        input.sessionId,
        {},
        BILLING_PROVIDER_REQUEST_OPTIONS
      );
    } catch (error) {
      return error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "resource_missing"
        ? "checkout_session_not_found"
        : "billing_service_error";
    }
    if (
      (session.client_reference_id ?? session.metadata?.["organization_id"]) !== organizationId ||
      (session.metadata?.["organization_id"] &&
        session.metadata["organization_id"] !== organizationId)
    )
      return "checkout_session_not_found";
    if (
      session.mode !== "subscription" ||
      session.status !== "complete" ||
      !["paid", "no_payment_required"].includes(session.payment_status)
    )
      return "checkout_not_complete";
    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    const customerId =
      typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (
      !subscriptionId ||
      !customerId ||
      (row.stripe_customer_id && row.stripe_customer_id !== customerId)
    )
      return "checkout_not_complete";
    const subscription = await provider.client.subscriptions.retrieve(
      subscriptionId,
      { expand: ["items.data.price", "latest_invoice"] },
      BILLING_PROVIDER_REQUEST_OPTIONS
    );
    if (
      !belongsTo(subscription, subscriptionId, customerId, organizationId) ||
      !["active", "trialing"].includes(subscription.status) ||
      subscription.items.has_more
    )
      return "checkout_not_complete";
    let replacement: string | undefined;
    if (row.stripe_subscription_id && row.stripe_subscription_id !== subscriptionId) {
      if (row.billing_state !== "canceled") return "checkout_not_complete";
      const previous = await provider.client.subscriptions.retrieve(
        row.stripe_subscription_id,
        {},
        BILLING_PROVIDER_REQUEST_OPTIONS
      );
      if (
        !belongsTo(previous, row.stripe_subscription_id, customerId, organizationId) ||
        !["canceled", "incomplete_expired"].includes(previous.status)
      )
        return "checkout_not_complete";
      replacement = previous.id;
    }
    assertSupportedSubscriptionItems(subscription, provider.priceMap);
    const { plan, extraCapacityQuantity } = derivePlanFromSubscriptionItems(
      subscription.items.data,
      provider.priceMap
    );
    if (plan === "free") return "checkout_not_complete";
    const period = resolveStripeSubscriptionBillingPeriod(subscription);
    const applied = await input.store.updateEntitlements({
      organization_id: organizationId,
      plan,
      additional_capacity_units: extraCapacityQuantity,
      billing_state: deriveBillingState(subscription.status),
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      billing_period_starts_at: period.starts_at,
      billing_period_ends_at: period.ends_at,
      last_billing_sync_at: input.now,
      last_billing_event_id: `checkout_session:${session.id}`,
      expected_revision: row.revision,
      ...(replacement ? { replace_from_subscription_id: replacement } : {})
    });
    return applied === false ? "checkout_not_complete" : "confirmed";
  } catch {
    return "billing_service_error";
  }
}
