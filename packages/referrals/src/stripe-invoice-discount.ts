import type Stripe from "stripe";
import { z } from "zod";
import type { StripePriceMapping } from "../../billing/src/stripe-subscription.js";

const id = z.string().min(1).max(255);
const identifier = (value: unknown): string =>
  id.parse(typeof value === "object" && value !== null && "id" in value ? value.id : value);
/** Only complete, exact base-line discounts are evidence of the promised offer.
 * Provider promotion entry or discounts on capacity never establish it. */
export function readStripeInvoiceDiscount(
  invoice: Stripe.Invoice,
  lines: readonly Stripe.InvoiceLineItem[],
  prices: ReadonlyMap<string, StripePriceMapping>,
  policy: {
    eligible_plans: readonly string[];
    eligible_intervals?: readonly string[];
    discount_basis_points: number;
  }
): {
  invoice_id: string;
  subscription_id: string;
  finalized: boolean;
  created_at: string;
  finalized_at: string | null;
  amount_due_minor: number;
  base_net_minor: number;
  applied_coupon_ids: string[];
  verified_base_coupon_ids: string[];
} | null {
  const subscription = invoice.parent?.subscription_details?.subscription;
  if (!subscription) return null;
  const discounts = z
    .array(
      z.object({
        id,
        promotion_code: z.unknown().nullable(),
        source: z.object({ type: z.literal("coupon"), coupon: z.union([id, z.object({ id })]) })
      })
    )
    .max(20)
    .parse(invoice.discounts);
  const coupons = new Map(discounts.map((d) => [d.id, identifier(d.source.coupon)])),
    valid = new Set<string>();
  const bases = lines.filter((line) => {
    const price = line.pricing?.price_details?.price,
      mapping = price ? prices.get(identifier(price)) : undefined;
    return (
      mapping?.type === "plan" &&
      policy.eligible_plans.includes(mapping.plan) &&
      (!policy.eligible_intervals ||
        policy.eligible_intervals.includes(mapping.interval ?? "month"))
    );
  });
  const net = bases.reduce(
    (sum, line) =>
      sum +
      line.subtotal -
      (line.discount_amounts ?? []).reduce((total, d) => total + d.amount, 0) -
      (line.pretax_credit_amounts ?? [])
        .filter((c) => c.type !== "discount")
        .reduce((total, c) => total + c.amount, 0),
    0
  );
  for (const discount of discounts) {
    if (discount.promotion_code !== null || discounts.length !== 1 || bases.length === 0) continue;
    const onlyBase = lines.every(
      (line) =>
        bases.includes(line) ||
        !(line.discount_amounts ?? []).some(
          (d) => identifier(d.discount) === discount.id && d.amount > 0
        )
    );
    const exact = bases.every((line) => {
      const amounts = line.discount_amounts ?? [],
        applied = amounts
          .filter((d) => identifier(d.discount) === discount.id)
          .reduce((sum, d) => sum + d.amount, 0);
      const numerator =
        BigInt(z.number().int().safe().nonnegative().parse(line.subtotal)) *
        BigInt(policy.discount_basis_points);
      return (
        line.subtotal > 0 &&
        amounts.every((d) => identifier(d.discount) === discount.id) &&
        applied >= Number(numerator / 10000n) &&
        applied <= Number((numerator + 9999n) / 10000n)
      );
    });
    if (onlyBase && exact) valid.add(coupons.get(discount.id)!);
  }
  return {
    invoice_id: invoice.id,
    subscription_id: identifier(subscription),
    finalized: invoice.status !== "draft" && invoice.status_transitions.finalized_at !== null,
    created_at: new Date(invoice.created * 1000).toISOString(),
    finalized_at:
      invoice.status_transitions.finalized_at === null
        ? null
        : new Date(invoice.status_transitions.finalized_at * 1000).toISOString(),
    amount_due_minor: invoice.amount_due,
    base_net_minor: Math.max(0, net),
    applied_coupon_ids: [...coupons.values()],
    verified_base_coupon_ids: [...valid]
  };
}
