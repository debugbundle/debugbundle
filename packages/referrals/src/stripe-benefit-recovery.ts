import { createHash } from "node:crypto";
import { z } from "zod";
import type { StripeBillingProvider } from "../../billing/src/stripe-subscription.js";
import { createStripeReferralReadBudget } from "./stripe-cash-receipts.js";
import { readStripeInvoiceBenefit } from "./stripe-invoice-benefit.js";
import { readVerifiedStripeReferralCoupon } from "./stripe-referral-coupon.js";
const id = z.string().min(1).max(255);
const identifier = (value: unknown): string =>
  id.parse(typeof value === "object" && value !== null && "id" in value ? value.id : value);
export const ReferralBenefitRecoverySchema = z
  .object({
    organization_external_id: z.uuid(),
    attribution_id: z.uuid(),
    provider_customer_id: id,
    provider_subscription_id: id,
    coupon_id: id,
    invoice_id: id,
    requested_at: z.string().datetime(),
    livemode: z.boolean()
  })
  .strict();
/** One fixed draft-invoice update. It never creates, finalises, charges or
 * changes a subscription. Lost acknowledgements read back the same invoice;
 * replay after provider idempotency expiry remains confined to that invoice. */
export async function restoreStripeReferralBenefit(
  provider: StripeBillingProvider,
  raw: z.infer<typeof ReferralBenefitRecoverySchema>
): Promise<"applied" | "already_applied" | "recheck_invoices"> {
  try {
    const input = ReferralBenefitRecoverySchema.parse(raw),
      next = createStripeReferralReadBudget();
    const sub = await provider.client.subscriptions.retrieve(
      input.provider_subscription_id,
      { expand: ["discounts"] },
      next()
    );
    if (
      sub.id !== input.provider_subscription_id ||
      identifier(sub.customer) !== input.provider_customer_id ||
      sub.livemode !== input.livemode ||
      sub.metadata["organization_id"] !== input.organization_external_id ||
      sub.metadata["referral_attribution_id"] !== input.attribution_id ||
      !["active", "trialing", "past_due", "unpaid"].includes(sub.status) ||
      sub.items.has_more
    )
      throw new Error("subscription_unverified");
    const invoice = await provider.client.invoices.retrieve(
      input.invoice_id,
      { expand: ["discounts"] },
      next()
    );
    if (
      invoice.id !== input.invoice_id ||
      identifier(invoice.customer) !== input.provider_customer_id ||
      invoice.livemode !== input.livemode
    )
      throw new Error("invoice_unverified");
    if (invoice.status !== "draft") return "recheck_invoices";
    const lines = await provider.client.invoices.listLineItems(invoice.id, { limit: 100 }, next());
    if (lines.has_more) throw new Error("invoice_incomplete");
    const facts = readStripeInvoiceBenefit(invoice, lines.data, provider.priceMap);
    if (
      !facts ||
      facts.finalized ||
      facts.subscription_id !== sub.id ||
      facts.attribution_id !== input.attribution_id ||
      facts.amount_due_minor === 0 ||
      facts.business_base_net_minor === 0
    )
      throw new Error("ineligible_recovery");
    if (facts.ten_percent_base_coupon_ids.includes(input.coupon_id)) return "already_applied";
    if (facts.applied_coupon_ids.length > 0) throw new Error("foreign_discount");
    const base = sub.items.data.find(
      (item) =>
        provider.priceMap.get(item.price.id)?.plan === "business" &&
        provider.priceMap.get(item.price.id)?.type === "plan"
    );
    if (!base) throw new Error("base_unavailable");
    await readVerifiedStripeReferralCoupon(provider, input.coupon_id, base.price.id);
    const result = await provider.client.invoices.update(
      invoice.id,
      { discounts: [{ coupon: input.coupon_id }] },
      {
        ...next(),
        idempotencyKey: `referral-benefit:${createHash("sha256").update(`${input.organization_external_id}\n${sub.id}\n${input.invoice_id}\n${input.coupon_id}`).digest("hex")}`
      }
    );
    if (result.id !== invoice.id || identifier(result.customer) !== input.provider_customer_id)
      throw new Error("response_unverified");
    return "applied";
  } catch {
    throw new Error("referral_benefit_recovery_unavailable");
  }
}
