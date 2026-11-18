import { readStripeInvoiceDiscount } from "./stripe-invoice-discount.js";
import type Stripe from "stripe";
import { z } from "zod";
import type { StripePriceMapping } from "../../billing/src/stripe-subscription.js";
import { ReferralBenefitInvoiceSchema } from "./customer-benefit.js";
/** A separate allowlisted projection: invoice finalisation determines the
 * customer benefit, while verified collected cash determines commission. */
export function readStripeInvoiceBenefit(
  invoice: Stripe.Invoice,
  lines: readonly Stripe.InvoiceLineItem[],
  prices: ReadonlyMap<string, StripePriceMapping>
): z.infer<typeof ReferralBenefitInvoiceSchema> | null {
  try {
    const facts = readStripeInvoiceDiscount(invoice, lines, prices, {
      eligible_plans: ["business"],
      discount_basis_points: 1000
    });
    if (!facts) return null;
    return ReferralBenefitInvoiceSchema.parse({
      invoice_id: facts.invoice_id,
      subscription_id: facts.subscription_id,
      attribution_id:
        invoice.parent?.subscription_details?.metadata?.["referral_attribution_id"] ?? null,
      finalized: facts.finalized,
      created_at: facts.created_at,
      finalized_at: facts.finalized_at,
      amount_due_minor: facts.amount_due_minor,
      business_base_net_minor: facts.base_net_minor,
      applied_coupon_ids: facts.applied_coupon_ids,
      ten_percent_base_coupon_ids: facts.verified_base_coupon_ids
    });
  } catch {
    throw new Error("referral_invoice_benefit_unverified");
  }
}
