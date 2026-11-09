import type Stripe from "stripe";
import { z } from "zod";
import type { StripePriceMapping } from "../../billing/src/stripe-subscription.js";
import { ReferralBenefitInvoiceSchema } from "./customer-benefit.js";
const id = z.string().min(1).max(255);
const identifier = (value: unknown): string =>
  id.parse(typeof value === "object" && value !== null && "id" in value ? value.id : value);
/** A separate allowlisted projection: invoice finalisation determines the
 * customer benefit, while verified collected cash determines commission. */
export function readStripeInvoiceBenefit(
  invoice: Stripe.Invoice,
  lines: readonly Stripe.InvoiceLineItem[],
  prices: ReadonlyMap<string, StripePriceMapping>
): z.infer<typeof ReferralBenefitInvoiceSchema> | null {
  try {
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
    const coupons = new Map(discounts.map((d) => [d.id, identifier(d.source.coupon)]));
    const valid = new Set<string>();
    let base = 0;
    const baseLines = lines.filter((line) => {
      const price = line.pricing?.price_details?.price;
      const mapping = price ? prices.get(identifier(price)) : undefined;
      return mapping?.plan === "business" && mapping.type === "plan";
    });
    for (const line of baseLines) {
      const discount = (line.discount_amounts ?? []).reduce((sum, d) => sum + d.amount, 0);
      base +=
        line.subtotal -
        discount -
        (line.pretax_credit_amounts ?? [])
          .filter((c) => c.type !== "discount")
          .reduce((sum, c) => sum + c.amount, 0);
    }
    for (const discount of discounts) {
      if (discount.promotion_code !== null || discounts.length !== 1 || baseLines.length === 0)
        continue;
      const onlyBase = lines.every(
        (line) =>
          baseLines.includes(line) ||
          !(line.discount_amounts ?? []).some(
            (d) => identifier(d.discount) === discount.id && d.amount > 0
          )
      );
      const exact = baseLines.every((line) => {
        const amounts = line.discount_amounts ?? [];
        const applied = amounts
          .filter((d) => identifier(d.discount) === discount.id)
          .reduce((sum, d) => sum + d.amount, 0);
        return (
          line.subtotal > 0 &&
          amounts.every((d) => identifier(d.discount) === discount.id) &&
          applied >= Math.floor(line.subtotal / 10) &&
          applied <= Math.ceil(line.subtotal / 10)
        );
      });
      if (onlyBase && exact) valid.add(coupons.get(discount.id)!);
    }
    return ReferralBenefitInvoiceSchema.parse({
      invoice_id: invoice.id,
      subscription_id: identifier(subscription),
      attribution_id:
        invoice.parent?.subscription_details?.metadata?.["referral_attribution_id"] ?? null,
      finalized: invoice.status !== "draft" && invoice.status_transitions.finalized_at !== null,
      created_at: new Date(invoice.created * 1000).toISOString(),
      finalized_at:
        invoice.status_transitions.finalized_at === null
          ? null
          : new Date(invoice.status_transitions.finalized_at * 1000).toISOString(),
      amount_due_minor: invoice.amount_due,
      business_base_net_minor: Math.max(0, base),
      applied_coupon_ids: [...coupons.values()],
      ten_percent_base_coupon_ids: [...valid]
    });
  } catch {
    throw new Error("referral_invoice_benefit_unverified");
  }
}
