import { createHash } from "node:crypto";
import { z } from "zod";
import type { StripeBillingProvider } from "../../billing/src/stripe-subscription.js";
import {
  OfferBenefitRecoverySchema,
  type OfferBenefitRecovery
} from "./offer-benefit-contracts.js";
import { createStripeReferralReadBudget } from "./stripe-cash-receipts.js";
import { readStripeOfferInvoice } from "./stripe-offer-invoice.js";
import { readVerifiedStripeOfferCoupon } from "./stripe-offer-coupon.js";

const identifier = (v: unknown): string =>
  z
    .string()
    .min(1)
    .max(255)
    .parse(typeof v === "object" && v !== null && "id" in v ? v.id : v);
/** Restore only the exact saved eligible draft. No subscription change,
 * invoice creation/finalisation, payment, refund or cross-invoice retry occurs. */
export async function restoreStripeOfferBenefit(
  provider: StripeBillingProvider,
  raw: OfferBenefitRecovery
): Promise<"applied" | "already_applied" | "recheck_invoices"> {
  try {
    const input = OfferBenefitRecoverySchema.parse(raw),
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
      sub.metadata["offer_claim_id"] !== input.claim_id ||
      sub.metadata["offer_version_id"] !== input.version_id ||
      !["active", "trialing", "past_due", "unpaid"].includes(sub.status) ||
      sub.items.has_more
    )
      throw new Error("offer_subscription_unverified");
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
      throw new Error("offer_invoice_unverified");
    if (invoice.status !== "draft") return "recheck_invoices";
    const lines = await provider.client.invoices.listLineItems(invoice.id, { limit: 100 }, next());
    if (lines.has_more) throw new Error("offer_invoice_incomplete");
    const facts = readStripeOfferInvoice(invoice, lines.data, provider.priceMap, input.policy);
    if (
      !facts ||
      facts.finalized ||
      facts.subscription_id !== sub.id ||
      facts.claim_id !== input.claim_id ||
      facts.version_id !== input.version_id ||
      facts.amount_due_minor === 0 ||
      facts.base_net_minor === 0
    )
      throw new Error("offer_recovery_ineligible");
    if (facts.verified_base_coupon_ids.includes(input.coupon_id)) return "already_applied";
    if (facts.applied_coupon_ids.length) throw new Error("offer_foreign_discount");
    const base = sub.items.data.find((item) => {
      const mapping = provider.priceMap.get(item.price.id);
      return (
        mapping?.type === "plan" &&
        mapping.plan !== "free" &&
        input.policy.eligible_plans.includes(mapping.plan) &&
        input.policy.eligible_intervals.includes(mapping.interval ?? "month")
      );
    });
    if (!base) throw new Error("offer_base_unavailable");
    await readVerifiedStripeOfferCoupon(
      provider,
      input.coupon_id,
      base.price.id,
      input.policy,
      input.livemode
    );
    const key = createHash("sha256")
      .update(`${input.claim_id}\n${sub.id}\n${input.invoice_id}\n${input.coupon_id}`)
      .digest("hex");
    const result = await provider.client.invoices.update(
      invoice.id,
      { discounts: [{ coupon: input.coupon_id }] },
      { ...next(), idempotencyKey: `offer-benefit:${key}` }
    );
    if (result.id !== invoice.id || identifier(result.customer) !== input.provider_customer_id)
      throw new Error("offer_response_unverified");
    return "applied";
  } catch {
    throw new Error("offer_benefit_recovery_unavailable");
  }
}
