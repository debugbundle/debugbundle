import { z } from "zod";
const providerId = z.string().min(1).max(255);
const money = z.number().int().safe().nonnegative();
export const ReferralBenefitInvoiceSchema = z
  .object({
    invoice_id: providerId,
    subscription_id: providerId,
    attribution_id: z.uuid().nullable(),
    finalized: z.boolean(),
    created_at: z.string().datetime(),
    finalized_at: z.string().datetime().nullable(),
    amount_due_minor: money,
    business_base_net_minor: money,
    applied_coupon_ids: z.array(providerId).max(20),
    ten_percent_base_coupon_ids: z.array(providerId).max(20)
  })
  .strict();
const InputSchema = z
  .object({
    reserved_invoice_id: providerId.nullable(),
    invoice: z
      .object({
        invoice_id: providerId,
        finalized: z.boolean(),
        trial: z.boolean(),
        amount_due_minor: money,
        business_base_net_minor: money,
        expected_discount_applied: z.boolean()
      })
      .strict()
  })
  .strict();
export type ReferralInvoiceBenefitDecision =
  | { action: "keep_pending" }
  | { action: "reserve_invoice" | "same_invoice" | "already_reserved"; invoice_id: string };
/** The customer discount belongs to one eligible invoice, independently of cash
 * commission. Finalisation freezes it; retries do not create a second benefit.
 * All invoice/discount facts must come from the verified provider adapter. */
export function decideReferralInvoiceBenefit(
  raw: z.infer<typeof InputSchema>
): ReferralInvoiceBenefitDecision {
  const input = InputSchema.parse(raw),
    invoice = input.invoice;
  if (input.reserved_invoice_id !== null)
    return {
      action:
        input.reserved_invoice_id === invoice.invoice_id ? "same_invoice" : "already_reserved",
      invoice_id: input.reserved_invoice_id
    };
  if (
    !invoice.finalized ||
    invoice.trial ||
    invoice.amount_due_minor === 0 ||
    invoice.business_base_net_minor === 0
  )
    return { action: "keep_pending" };
  if (!invoice.expected_discount_applied) throw new Error("referral_invoice_discount_unverified");
  return { action: "reserve_invoice", invoice_id: invoice.invoice_id };
}
