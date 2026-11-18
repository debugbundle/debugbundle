import { z } from "zod";
import type { StripeBillingProvider } from "../../billing/src/stripe-subscription.js";
import { ProgrammeVersionSchema, type ProgrammeVersion } from "./programme-policy.js";
import { createStripeReferralReadBudget } from "./stripe-cash-receipts.js";
import { readStripeOfferCatalogue, verifyStripeOfferCoupon } from "./stripe-offer-catalogue.js";

/** Only authorised activation/scheduling calls this, outside DB locks. Fixed IDs
 * survive idempotency retention. No promotion code, subscription or charge is created. */
export async function prepareStripeOfferCoupon(
  provider: StripeBillingProvider,
  raw: ProgrammeVersion
): Promise<{ coupon_id: string; livemode: boolean }> {
  try {
    const version = ProgrammeVersionSchema.parse(raw),
      next = createStripeReferralReadBudget(15000, 30);
    const catalogue = await readStripeOfferCatalogue(provider, version.policy, next);
    const couponId = `dbof_${version.version_id.replaceAll("-", "")}_${catalogue.livemode ? "l" : "t"}`;
    const metadata = {
      offer_programme_id: version.programme_id,
      offer_version_id: version.version_id
    };
    const retrieve = (): Promise<unknown> =>
      provider.client.coupons.retrieve(couponId, { expand: ["applies_to"] }, next());
    let coupon: unknown;
    try {
      coupon = await retrieve();
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("statusCode" in error) ||
        error.statusCode !== 404 ||
        !("code" in error) ||
        error.code !== "resource_missing"
      )
        throw error;
      try {
        coupon = await provider.client.coupons.create(
          {
            id: couponId,
            duration: "once",
            percent_off: version.policy.discount_basis_points / 100,
            name: "DebugBundle introductory offer",
            applies_to: { products: catalogue.products },
            expand: ["applies_to"],
            metadata
          },
          { ...next(), idempotencyKey: `offer-coupon:${couponId}` }
        );
      } catch {
        // Resolve conflicts and lost responses by canonical identity. Never rotate
        // IDs, issue another create in this attempt, or delete existing coupons.
        coupon = await retrieve();
      }
    }
    verifyStripeOfferCoupon(coupon, couponId, catalogue);
    z.object({
      metadata: z.object({
        offer_programme_id: z.literal(metadata.offer_programme_id),
        offer_version_id: z.literal(metadata.offer_version_id)
      })
    }).parse(coupon);
    return { coupon_id: couponId, livemode: catalogue.livemode };
  } catch {
    throw new Error("offer_coupon_unverified");
  }
}
