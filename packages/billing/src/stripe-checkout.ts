import type { BillingCheckoutStore } from "../../storage/src/billing-checkout-store.js";
import type { StripeBillingProvider as StripeConfig } from "./stripe-subscription.js";

const CHECKOUT_REQUEST_OPTIONS = { timeout: 8_000, maxNetworkRetries: 0 } as const;

export type CheckoutLinkResult =
  | { url: string }
  | "checkout_in_progress"
  | "checkout_not_allowed"
  | "paid_purchase_locked"
  | "upgrade_confirmation_required"
  | "billing_service_error"
  | null;

export async function createStripeCheckoutLink(options: {
  stripe: StripeConfig;
  store: BillingCheckoutStore;
  appBaseUrl: string;
  input: {
    organization_id: string;
    billing_email: string | undefined;
    target_plan: "solo" | "team";
    confirmed_ended_subscription_id?: string;
  };
}): Promise<CheckoutLinkResult> {
  const { stripe, store, appBaseUrl, input } = options;
  try {
    // Only confirmed expiry or an exact completed purchase whose subscription
    // is provider-confirmed terminal permits replacement. Uncertain work stays.
    for (let pass = 0; pass < 2; pass += 1) {
      const attempt = await store.claim({
        organization_id: input.organization_id,
        target_plan: input.target_plan,
        ...(input.confirmed_ended_subscription_id === undefined
          ? {}
          : { confirmed_ended_subscription_id: input.confirmed_ended_subscription_id }),
        parameters: (customerId, expiresAt) => ({
          mode: "subscription",
          client_reference_id: input.organization_id,
          metadata: { organization_id: input.organization_id },
          line_items: [
            {
              price: input.target_plan === "solo" ? stripe.soloPriceId : stripe.teamPriceId,
              quantity: 1
            }
          ],
          success_url: `${appBaseUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appBaseUrl}/billing?checkout=canceled`,
          automatic_tax: { enabled: true },
          billing_address_collection: "auto",
          tax_id_collection: { enabled: true },
          allow_promotion_codes: true,
          expires_at: expiresAt,
          payment_method_options: { card: { request_three_d_secure: "any" } },
          subscription_data: { metadata: { organization_id: input.organization_id } },
          ...(customerId === null
            ? input.billing_email === undefined
              ? {}
              : { customer_email: input.billing_email }
            : { customer: customerId, customer_update: { address: "auto", name: "auto" } })
        })
      });
      if (typeof attempt === "string") return attempt;
      if (attempt.target_plan !== input.target_plan && attempt.stripe_session_id === null)
        return "checkout_in_progress";
      // A one-hour expiry fixes this request's creation time. Stop ambiguous
      // replays before Stripe can prune the key at 24h; age never releases it.
      if (
        attempt.stripe_session_id === null &&
        typeof attempt.parameters["expires_at"] === "number" &&
        Date.now() / 1000 >= attempt.parameters["expires_at"] + 22 * 3600
      )
        return "checkout_in_progress";
      const session =
        attempt.stripe_session_id === null
          ? await stripe.client.checkout.sessions.create(
              attempt.parameters as NonNullable<
                Parameters<typeof stripe.client.checkout.sessions.create>[0]
              >,
              { ...CHECKOUT_REQUEST_OPTIONS, idempotencyKey: `billing-checkout:${attempt.id}` }
            )
          : await stripe.client.checkout.sessions.retrieve(
              attempt.stripe_session_id,
              {},
              CHECKOUT_REQUEST_OPTIONS
            );
      if (session.client_reference_id !== input.organization_id) return "billing_service_error";
      if (
        attempt.stripe_session_id === null &&
        !(await store.saveSession(input.organization_id, attempt.id, session.id))
      )
        return "billing_service_error";
      if (session.status === "expired") {
        if (!(await store.retireExpired(input.organization_id, attempt.id, session.id)))
          return "checkout_in_progress";
        continue;
      }
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (
        session.status === "complete" &&
        input.confirmed_ended_subscription_id !== undefined &&
        subscriptionId === input.confirmed_ended_subscription_id
      ) {
        if (
          !(await store.retireEndedSubscription(
            input.organization_id,
            attempt.id,
            session.id,
            subscriptionId
          ))
        )
          return "checkout_in_progress";
        continue;
      }
      if (session.status !== "open") return "checkout_in_progress";
      if (attempt.target_plan !== input.target_plan) return "checkout_in_progress";
      return session.url ? { url: session.url } : "billing_service_error";
    }
  } catch {
    // Preserve the reservation and exact parameters after provider/DB failures.
    // A subsequent request must reconcile or replay the same idempotent request.
    return "billing_service_error";
  }
  return "billing_service_error";
}
