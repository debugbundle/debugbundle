import { readStripeCustomerPaymentHistory } from "../../referrals/src/stripe-customer-eligibility.js";
import { readVerifiedStripeReferralCoupon } from "../../referrals/src/stripe-referral-coupon.js";
import type { BillingCheckoutReferral } from "../../storage/src/billing-checkout-store.js";
import { canStartBusinessSale } from "./business-sales-policy.js";
import type { BillingCheckoutStore } from "../../storage/src/billing-checkout-store.js";
import type { BillingInterval, PaidTierName } from "../../shared-types/src/index.js";
import { z } from "zod";
import { findStripeCatalogPrice, validateStripePurchasePrices } from "./stripe-price-catalog.js";
import type { StripeBillingProvider as StripeConfig } from "./stripe-subscription.js";

const CHECKOUT_REQUEST_OPTIONS = { timeout: 8_000, maxNetworkRetries: 0 } as const;

export type CheckoutLinkResult =
  | { url: string }
  | "checkout_in_progress"
  | "checkout_not_allowed"
  | "paid_purchase_locked"
  | "upgrade_confirmation_required"
  | "billing_service_error"
  | "billing_not_configured"
  | null;

export async function createStripeCheckoutLink(options: {
  stripe: StripeConfig;
  store: BillingCheckoutStore;
  appBaseUrl: string;
  input: {
    organization_id: string;
    billing_email: string | undefined;
    target_plan: PaidTierName;
    interval?: BillingInterval;
    additional_capacity_units?: number;
    confirmed_ended_subscription_id?: string;
    expected_owner_user_id?: string;
  };
}): Promise<CheckoutLinkResult> {
  const { stripe, store, appBaseUrl, input } = options;
  if (
    !canStartBusinessSale({
      enabled: stripe.businessSalesEnabled === true,
      target_plan: input.target_plan
    })
  )
    return "checkout_not_allowed";
  try {
    const quantity = input.additional_capacity_units ?? 0;
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 99)
      return "checkout_not_allowed";
    const offer = {
      plan: input.target_plan,
      interval: input.interval ?? "month",
      currency: "usd" as const
    };
    const basePrice =
      input.interval === undefined && input.target_plan !== "business"
        ? input.target_plan === "solo"
          ? stripe.soloPriceId
          : stripe.teamPriceId
        : findStripeCatalogPrice(stripe.priceMap, offer, "plan");
    const capacityPrice =
      quantity === 0 ? null : findStripeCatalogPrice(stripe.priceMap, offer, "extra_capacity");
    if (!basePrice || (quantity > 0 && !capacityPrice)) return "billing_not_configured";
    const lineItems = [
      { price: basePrice, quantity: 1 },
      ...(quantity > 0 ? [{ price: capacityPrice!, quantity }] : [])
    ];
    // A configured ID is not proof that its provider amount/interval is correct.
    // Legacy identifiers remain readable; new catalogue prices are checked before
    // admitting a new purchase and again when deriving their entitlements.
    if (
      !(await validateStripePurchasePrices(
        stripe,
        lineItems.map((line) => line.price)
      ))
    )
      return "billing_not_configured";
    const matchesOffer = (parameters: Record<string, unknown>): boolean => {
      const parsed = z
        .array(z.object({ price: z.string(), quantity: z.number().int().positive() }).strict())
        .safeParse(parameters["line_items"]);
      return parsed.success && JSON.stringify(parsed.data) === JSON.stringify(lineItems);
    };
    // Only confirmed expiry or an exact completed purchase whose subscription
    // is provider-confirmed terminal permits replacement. Uncertain work stays.
    let referralCoupon: BillingCheckoutReferral | undefined;
    for (let pass = 0; pass < 4; pass += 1) {
      const attempt = await store.claim({
        organization_id: input.organization_id,
        target_plan: input.target_plan,
        ...(referralCoupon ? { referral_coupon: referralCoupon } : {}),
        ...(input.expected_owner_user_id === undefined
          ? {}
          : { expected_owner_user_id: input.expected_owner_user_id }),
        ...(input.confirmed_ended_subscription_id === undefined
          ? {}
          : { confirmed_ended_subscription_id: input.confirmed_ended_subscription_id }),
        parameters: (customerId, expiresAt, referral) => ({
          mode: "subscription",
          client_reference_id: input.organization_id,
          metadata: {
            organization_id: input.organization_id,
            ...(referral ? { referral_attribution_id: referral.attribution_id } : {})
          },
          line_items: lineItems,
          success_url: `${appBaseUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appBaseUrl}/billing?checkout=canceled`,
          automatic_tax: { enabled: true },
          billing_address_collection: "auto",
          tax_id_collection: { enabled: true },
          ...(referral
            ? { allow_promotion_codes: false, discounts: [{ coupon: referral.coupon_id }] }
            : { allow_promotion_codes: true }),
          expires_at: expiresAt,
          payment_method_options: { card: { request_three_d_secure: "any" } },
          subscription_data: {
            metadata: {
              organization_id: input.organization_id,
              ...(referral ? { referral_attribution_id: referral.attribution_id } : {})
            }
          },
          ...(customerId === null
            ? input.billing_email === undefined
              ? {}
              : { customer_email: input.billing_email }
            : { customer: customerId, customer_update: { address: "auto", name: "auto" } })
        })
      });
      if (attempt === "referral_coupon_required") {
        if (
          !stripe.referralCouponId ||
          !store.getReferralCheckoutContext ||
          !input.expected_owner_user_id
        )
          return "billing_not_configured";
        if (referralCoupon) return "checkout_in_progress";
        const context = await store.getReferralCheckoutContext({
          organization_id: input.organization_id,
          actor_user_id: input.expected_owner_user_id
        });
        if (!context?.discount_eligible) return "checkout_in_progress";
        try {
          if (
            await readStripeCustomerPaymentHistory(stripe.client, {
              customer_id: context.current_customer_id,
              verified_email: context.verified_owner_email
            })
          )
            return "checkout_not_allowed";
          referralCoupon = {
            provider_customer_id_checked: context.current_customer_id,
            verified_owner_email_checked: context.verified_owner_email,
            attribution_id: context.attribution_id,
            coupon_id: await readVerifiedStripeReferralCoupon(
              stripe,
              stripe.referralCouponId,
              basePrice
            )
          };
        } catch {
          return "billing_not_configured";
        }
        continue;
      }
      if (typeof attempt === "string") return attempt;
      if (
        (attempt.target_plan !== input.target_plan || !matchesOffer(attempt.parameters)) &&
        attempt.stripe_session_id === null
      )
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
      if (attempt.target_plan !== input.target_plan || !matchesOffer(attempt.parameters))
        return "checkout_in_progress";
      return session.url ? { url: session.url } : "billing_service_error";
    }
  } catch {
    // Preserve the reservation and exact parameters after provider/DB failures.
    // A subsequent request must reconcile or replay the same idempotent request.
    return "billing_service_error";
  }
  return "billing_service_error";
}
