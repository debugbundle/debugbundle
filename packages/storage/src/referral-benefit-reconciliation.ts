import type { ReferralReceiptSnapshot } from "../../referrals/src/referral-ledger-contracts.js";
import type { ReferralBenefitRecoverySchema } from "../../referrals/src/stripe-benefit-recovery.js";
import type { z } from "zod";
import type { Queryable } from "./types.js";
import { createReferralBenefitStore } from "./referral-benefit-store.js";
import {
  readReferralBenefitContext,
  prepareReferralBenefitRecovery
} from "./referral-benefit-recovery-store.js";
/** SQL-only preparation after the complete bounded provider read. A finalized
 * eligible invoice consumes the offer even when payment failed. Zero-base/zero
 * due invoices leave the offer pending for the first eligible draft invoice. */
export async function reconcileReferralInvoiceBenefits(
  db: Queryable,
  snapshot: ReferralReceiptSnapshot,
  livemode: boolean
): Promise<z.infer<typeof ReferralBenefitRecoverySchema> | null> {
  const context = await readReferralBenefitContext(db, snapshot.organization_external_id);
  if (!context) return null;
  if (!snapshot.benefit_invoices) throw new Error("referral_invoice_benefits_missing");
  const invoices = snapshot.benefit_invoices
    .filter((invoice) => invoice.attribution_id === context.attribution_id)
    .sort(
      (a, b) =>
        (a.finalized_at ?? a.created_at).localeCompare(b.finalized_at ?? b.created_at) ||
        a.invoice_id.localeCompare(b.invoice_id)
    );
  const benefits = createReferralBenefitStore(db);
  let reserved = context.eligible_invoice_id;
  for (const invoice of invoices) {
    if (
      !invoice.finalized ||
      invoice.amount_due_minor === 0 ||
      invoice.business_base_net_minor === 0
    )
      continue;
    if (reserved !== null && reserved !== invoice.invoice_id) {
      if (invoice.applied_coupon_ids.includes(context.coupon_id))
        throw new Error("referral_invoice_benefit_reused");
      continue;
    }
    const decision = await benefits.observeInvoice({
      organization_external_id: snapshot.organization_external_id,
      provider_customer_id: snapshot.provider_customer_id,
      provider_subscription_id: invoice.subscription_id,
      invoice: {
        invoice_id: invoice.invoice_id,
        finalized: true,
        trial: false,
        amount_due_minor: invoice.amount_due_minor,
        business_base_net_minor: invoice.business_base_net_minor,
        expected_discount_applied: invoice.ten_percent_base_coupon_ids.includes(context.coupon_id)
      }
    });
    if (decision.action !== "keep_pending") reserved = decision.invoice_id;
  }
  if (reserved !== null) return null;
  const draft = invoices.find(
    (invoice) =>
      !invoice.finalized && invoice.amount_due_minor > 0 && invoice.business_base_net_minor > 0
  );
  if (!draft) return null;
  const command = {
    organization_external_id: snapshot.organization_external_id,
    attribution_id: context.attribution_id,
    provider_customer_id: snapshot.provider_customer_id,
    provider_subscription_id: draft.subscription_id,
    coupon_id: context.coupon_id,
    invoice_id: draft.invoice_id,
    livemode
  };
  const prepared = await prepareReferralBenefitRecovery(db, {
    organization_external_id: command.organization_external_id,
    provider_customer_id: command.provider_customer_id,
    provider_subscription_id: command.provider_subscription_id,
    invoice_id: command.invoice_id
  });
  return prepared ? { ...command, ...prepared } : null;
}
