import type Stripe from "stripe";
import { z } from "zod";
import type { StripePriceMapping } from "../../billing/src/stripe-subscription.js";
import {
  ReferralCommissionInputSchema,
  type ReferralCommissionInput
} from "./commission-policy.js";

type InvoiceSummary = {
  id: string;
  currency: string;
  total: number;
  total_excluding_tax: number | null;
};
const minor = z.number().int().safe().min(-1_000_000_000_000).max(1_000_000_000_000);
function amount(value: unknown, positive = false): number {
  const result = minor.parse(value);
  if (positive && result < 0) throw new Error("invalid_minor_amount");
  return result;
}
function timestamp(seconds: number): string {
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error("invalid_service_period");
  return new Date(seconds * 1000).toISOString();
}
/** Store allowlisted financial facts only. Provider subtotal is before tax and
 * discounts; the duplicate discount/pretax projections must agree. Reconcile
 * the complete original invoice totals before applying credit-note adjustments. */
export function mapStripeReferralInvoiceLines(
  invoice: InvoiceSummary,
  lines: readonly Stripe.InvoiceLineItem[],
  prices: ReadonlyMap<string, StripePriceMapping>
): ReferralCommissionInput["lines"] {
  try {
    if (
      invoice.currency !== "usd" ||
      !invoice.id ||
      lines.length < 1 ||
      lines.length > 100 ||
      new Set(lines.map((line) => line.id)).size !== lines.length
    )
      throw new Error("invoice_scope_unverified");
    const result = lines.map((line) => {
      if (line.invoice !== invoice.id || line.currency !== invoice.currency)
        throw new Error("invoice_scope_unverified");
      const discount = (line.discount_amounts ?? []).reduce(
        (sum, value) => sum + amount(value.amount, true),
        0
      );
      const credits = line.pretax_credit_amounts ?? [];
      const creditDiscount = credits
        .filter((value) => value.type === "discount")
        .reduce((sum, value) => sum + amount(value.amount, true), 0);
      if (discount > 0 && creditDiscount > 0 && discount !== creditDiscount)
        throw new Error("invoice_discount_unverified");
      const otherCredit = credits
        .filter((value) => value.type !== "discount")
        .reduce((sum, value) => sum + amount(value.amount, true), 0);
      const net = amount(line.subtotal) - Math.max(discount, creditDiscount) - otherCredit;
      const tax = (line.taxes ?? []).reduce((sum, value) => sum + amount(value.amount), 0);
      const price = line.pricing?.price_details?.price;
      const priceId = typeof price === "string" ? price : price?.id;
      const mapping = priceId ? prices.get(priceId) : undefined;
      if (mapping?.currency !== undefined && mapping.currency !== invoice.currency)
        throw new Error("invoice_currency_unverified");
      return ReferralCommissionInputSchema.shape.lines.element.parse({
        id: line.id,
        plan: mapping?.plan ?? "free",
        kind: mapping?.type ?? "other",
        net_amount_minor: net,
        tax_amount_minor: tax,
        service_starts_at: timestamp(line.period.start),
        service_ends_at: timestamp(line.period.end)
      });
    });
    const net = result.reduce((sum, line) => sum + line.net_amount_minor, 0),
      tax = result.reduce((sum, line) => sum + line.tax_amount_minor, 0);
    if (
      !Number.isSafeInteger(net) ||
      !Number.isSafeInteger(tax) ||
      net !== invoice.total_excluding_tax ||
      net + tax !== invoice.total
    )
      throw new Error("invoice_totals_unverified");
    return result;
  } catch {
    throw new Error("referral_invoice_lines_unverified");
  }
}
