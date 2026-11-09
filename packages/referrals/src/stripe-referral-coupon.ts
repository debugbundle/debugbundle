import { z } from "zod";
import type { StripeBillingProvider } from "../../billing/src/stripe-subscription.js";
import { createStripeReferralReadBudget } from "./stripe-cash-receipts.js";
const id = z.string().min(1).max(255);
const CouponSchema = z.object({
  id,
  livemode: z.boolean(),
  valid: z.literal(true),
  percent_off: z.literal(10),
  amount_off: z.null(),
  duration: z.literal("once"),
  applies_to: z.object({ products: z.array(id).min(1).max(2) })
});
const PriceSchema = z.object({
  id,
  active: z.literal(true),
  livemode: z.boolean(),
  product: z.union([id, z.object({ id, deleted: z.literal(false).optional() })])
});
/** Read-only purchase validation. Product restrictions must cover Business base
 * products exclusively: using the same product for capacity cannot accidentally
 * turn a ten-percent base benefit into a discount on the entire checkout. */
export async function readVerifiedStripeReferralCoupon(
  provider: StripeBillingProvider,
  couponId: string,
  targetBasePriceId: string
): Promise<string> {
  try {
    id.parse(couponId);
    id.parse(targetBasePriceId);
    const configured = [...provider.priceMap.entries()].filter(
      ([, mapping]) =>
        mapping.plan === "business" &&
        mapping.purchasable !== false &&
        (mapping.type === "plan" || mapping.type === "extra_capacity")
    );
    const bases = configured.filter(([, mapping]) => mapping.type === "plan"),
      capacity = configured.filter(([, mapping]) => mapping.type === "extra_capacity");
    if (
      bases.length === 0 ||
      bases.length > 2 ||
      capacity.length > 2 ||
      !bases.some(([priceId]) => priceId === targetBasePriceId)
    )
      throw new Error("invalid_business_catalogue");
    const next = createStripeReferralReadBudget();
    const [rawCoupon, prices] = await Promise.all([
      provider.client.coupons.retrieve(couponId, {}, next()),
      Promise.all(
        configured.map(async ([priceId, mapping]) => {
          const price = PriceSchema.parse(
            await provider.client.prices.retrieve(priceId, {}, next())
          );
          if (price.id !== priceId) throw new Error("price_identity_mismatch");
          return {
            priceId,
            kind: mapping.type,
            livemode: price.livemode,
            product: typeof price.product === "string" ? price.product : price.product.id
          };
        })
      )
    ]);
    const coupon = CouponSchema.parse(rawCoupon);
    if (coupon.id !== couponId || prices.some((price) => price.livemode !== coupon.livemode))
      throw new Error("coupon_identity_mismatch");
    const baseProducts = new Set(
      prices.filter((price) => price.kind === "plan").map((price) => price.product)
    );
    const capacityProducts = new Set(
      prices.filter((price) => price.kind === "extra_capacity").map((price) => price.product)
    );
    const target = prices.find((price) => price.priceId === targetBasePriceId)!;
    if (
      !coupon.applies_to.products.includes(target.product) ||
      coupon.applies_to.products.some(
        (product) => !baseProducts.has(product) || capacityProducts.has(product)
      )
    )
      throw new Error("coupon_scope_invalid");
    return coupon.id;
  } catch {
    throw new Error("referral_coupon_unverified");
  }
}
