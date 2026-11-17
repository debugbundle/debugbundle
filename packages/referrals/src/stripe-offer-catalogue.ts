import type Stripe from "stripe";
import { z } from "zod";
import { getBillingCatalogPrice } from "../../shared-types/src/billing-catalog.js";
import { stripePriceMatchesCatalog } from "../../billing/src/stripe-subscription.js";
import type {
  StripeBillingProvider,
  StripePriceMapping
} from "../../billing/src/stripe-subscription.js";
import { OfferPolicySchema, type OfferPolicy } from "./programme-policy.js";

const id = z.string().min(1).max(255);
const priceSchema = z.object({
  id,
  active: z.boolean(),
  livemode: z.boolean(),
  product: z.union([id, z.object({ id, deleted: z.literal(false).optional() })])
});
export interface StripeOfferCatalogue {
  policy: OfferPolicy;
  livemode: boolean;
  eligible: { priceId: string; mapping: StripePriceMapping; product: string; livemode: boolean }[];
  products: string[];
}
/** Include retained capacity and ineligible plans to detect shared products.
 * Retired prices stay readable but cannot be selected for new purchases. The
 * target price/domain claim checks intervals; one plan's intervals may share a product. */
export async function readStripeOfferCatalogue(
  provider: StripeBillingProvider,
  raw: OfferPolicy,
  next: () => Stripe.RequestOptions,
  expectedMode?: boolean
): Promise<StripeOfferCatalogue> {
  const policy = OfferPolicySchema.parse(raw);
  const configured = [...provider.priceMap].filter(
    ([, m]) => m.type === "plan" || m.type === "extra_capacity"
  );
  if (!configured.length || configured.length > 24) throw new Error("invalid_catalogue");
  const prices = await Promise.all(
    configured.map(async ([priceId, mapping]) => {
      const rawPrice = await provider.client.prices.retrieve(priceId, {}, next());
      const price = priceSchema.parse(rawPrice);
      if (price.id !== priceId || (mapping.purchasable !== false && !price.active))
        throw new Error("invalid_price");
      if (
        mapping.purchasable !== false &&
        mapping.type === "plan" &&
        mapping.plan !== "free" &&
        policy.eligible_plans.includes(mapping.plan) &&
        policy.eligible_intervals.includes(mapping.interval ?? "month") &&
        !stripePriceMatchesCatalog(rawPrice, {
          ...mapping,
          interval: mapping.interval ?? "month",
          currency: "usd",
          amount_minor: getBillingCatalogPrice(mapping.plan, mapping.interval ?? "month", "plan")
            .amount_minor
        })
      )
        throw new Error("offer_catalogue_price_mismatch");
      return {
        priceId,
        mapping,
        product: typeof price.product === "string" ? price.product : price.product.id,
        livemode: price.livemode
      };
    })
  );
  const livemode = expectedMode ?? prices[0]!.livemode;
  if (prices.some((p) => p.livemode !== livemode)) throw new Error("invalid_price_mode");
  const eligible = prices.filter(
    ({ mapping: m }) =>
      m.type === "plan" &&
      m.purchasable !== false &&
      m.plan !== "free" &&
      policy.eligible_plans.includes(m.plan) &&
      policy.eligible_intervals.includes(m.interval ?? "month")
  );
  if (
    policy.eligible_plans.some((plan) =>
      policy.eligible_intervals.some(
        (interval) =>
          eligible.filter(
            (p) => p.mapping.plan === plan && (p.mapping.interval ?? "month") === interval
          ).length !== 1
      )
    )
  )
    throw new Error("offer_catalogue_incomplete");
  const products = [...new Set(eligible.map((p) => p.product))].sort();
  const forbidden = new Set(
    prices
      .filter(
        ({ mapping: m }) =>
          m.type !== "plan" || m.plan === "free" || !policy.eligible_plans.includes(m.plan)
      )
      .map((p) => p.product)
  );
  if (!products.length || products.length > 6 || products.some((p) => forbidden.has(p)))
    throw new Error("coupon_scope_invalid");
  return { policy, livemode, eligible, products };
}
export function verifyStripeOfferCoupon(
  raw: unknown,
  couponId: string,
  catalogue: StripeOfferCatalogue
): string {
  const coupon = z
    .object({
      id: z.literal(couponId),
      valid: z.literal(true),
      livemode: z.literal(catalogue.livemode),
      percent_off: z.literal(catalogue.policy.discount_basis_points / 100),
      amount_off: z.null(),
      // Internal deadlines must not expire an already saved trial benefit.
      max_redemptions: z.null(),
      redeem_by: z.null(),
      duration: z.literal("once"),
      applies_to: z.object({ products: z.array(id).min(1).max(6) })
    })
    .parse(raw);
  if (
    catalogue.products.some((p) => !coupon.applies_to.products.includes(p)) ||
    coupon.applies_to.products.some((p) => !catalogue.products.includes(p))
  )
    throw new Error("coupon_scope_invalid");
  return coupon.id;
}
