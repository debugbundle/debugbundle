import type Stripe from "stripe";
import { z } from "zod";
import type { StripePriceMapping } from "../../billing/src/stripe-subscription.js";
import { OfferPolicySchema, type OfferPolicy } from "./programme-policy.js";
import { readStripeInvoiceDiscount } from "./stripe-invoice-discount.js";

const id = z.string().min(1).max(255);
export const OfferBenefitInvoiceSchema = z
  .object({
    invoice_id: id,
    subscription_id: id,
    claim_id: z.uuid().nullable(),
    version_id: z.uuid().nullable(),
    finalized: z.boolean(),
    created_at: z.string().datetime(),
    finalized_at: z.string().datetime().nullable(),
    amount_due_minor: z.number().int().safe().nonnegative(),
    base_net_minor: z.number().int().safe().nonnegative(),
    applied_coupon_ids: z.array(id).max(20),
    verified_base_coupon_ids: z.array(id).max(20)
  })
  .strict();
export type OfferBenefitInvoice = z.infer<typeof OfferBenefitInvoiceSchema>;
export function readStripeOfferInvoice(
  invoice: Stripe.Invoice,
  lines: readonly Stripe.InvoiceLineItem[],
  prices: ReadonlyMap<string, StripePriceMapping>,
  rawPolicy: OfferPolicy
): OfferBenefitInvoice | null {
  try {
    const policy = OfferPolicySchema.parse(rawPolicy),
      facts = readStripeInvoiceDiscount(invoice, lines, prices, policy);
    if (!facts) return null;
    return OfferBenefitInvoiceSchema.parse({
      ...facts,
      claim_id: invoice.parent?.subscription_details?.metadata?.["offer_claim_id"] ?? null,
      version_id: invoice.parent?.subscription_details?.metadata?.["offer_version_id"] ?? null
    });
  } catch {
    throw new Error("offer_invoice_benefit_unverified");
  }
}
