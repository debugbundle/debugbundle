import { z } from "zod";
import type { StripeBillingProvider } from "../../billing/src/stripe-subscription.js";
import type { OfferPolicy } from "./programme-policy.js";
import { createStripeReferralReadBudget } from "./stripe-cash-receipts.js";
import { readStripeOfferCatalogue, verifyStripeOfferCoupon } from "./stripe-offer-catalogue.js";

/** Verify the exact saved coupon again at Checkout/recovery. Public codes never
 * choose provider parameters, percentages or the Stripe test/live mode. */
export async function readVerifiedStripeOfferCoupon(
  provider: StripeBillingProvider,
  couponId: string,
  targetPriceId: string,
  rawPolicy: OfferPolicy,
  livemode: boolean
): Promise<string> {
  try {
    z.string().min(1).max(255).parse(couponId);
    z.string().min(1).max(255).parse(targetPriceId);
    const next = createStripeReferralReadBudget();
    const [coupon, catalogue] = await Promise.all([
      provider.client.coupons.retrieve(couponId, { expand: ["applies_to"] }, next()),
      readStripeOfferCatalogue(provider, rawPolicy, next, livemode)
    ]);
    if (!catalogue.eligible.some((p) => p.priceId === targetPriceId))
      throw new Error("offer_price_ineligible");
    return verifyStripeOfferCoupon(coupon, couponId, catalogue);
  } catch {
    throw new Error("offer_coupon_unverified");
  }
}
