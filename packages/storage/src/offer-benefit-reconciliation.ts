import { retireZeroBenefitRecovery } from "./referral-benefit-recovery-retirement.js";
import { z } from "zod";
import { OfferPolicySchema, type OfferPolicy } from "../../referrals/src/programme-policy.js";
import type { ReferralReceiptSnapshot } from "../../referrals/src/referral-ledger-contracts.js";
import { referralCustomerBindingMatches } from "./referral-customer-binding.js";
import { lockOfferIdentity } from "./offer-store-helpers.js";
import type { Queryable } from "./types.js";

export { OfferBenefitRecoverySchema } from "../../referrals/src/offer-benefit-contracts.js";
import {
  OfferBenefitRecoverySchema,
  type OfferBenefitRecovery
} from "../../referrals/src/offer-benefit-contracts.js";
interface Context extends Record<string, unknown> {
  id: string;
  version_id: string;
  attribution_id: string | null;
  owner_identity_hash: string;
  coupon_id: string;
  policy: OfferPolicy;
  eligible_invoice_id: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  recovery_invoice_id: string | null;
  recovery_requested_at: string | null;
  recovery_completed_at: string | null;
}
export async function readOfferReconciliationContext(
  db: Queryable,
  organizationId: string
): Promise<Context | null> {
  z.uuid().parse(organizationId);
  const row = (
    await db.query<Context>(
      `SELECT c.*,v.policy FROM offer_claims c JOIN offer_programme_versions v ON v.id=c.version_id
    WHERE c.organization_external_id=$1 AND c.checkout_attempt_id IS NOT NULL AND c.coupon_id IS NOT NULL`,
      [organizationId]
    )
  ).rows[0];
  return row ? { ...row, policy: OfferPolicySchema.parse(row.policy) } : null;
}

/** SQL-only intent preparation under the worker lease. Financial promises are
 * retained after account deletion and never replaced on an uncertain outcome. */
export async function reconcileOfferInvoiceBenefits(
  tx: Queryable,
  snapshot: ReferralReceiptSnapshot,
  livemode: boolean
): Promise<OfferBenefitRecovery | null> {
  await tx.query("SELECT id FROM organizations WHERE id=$1 FOR SHARE", [
    snapshot.organization_external_id
  ]);
  const original = await readOfferReconciliationContext(tx, snapshot.organization_external_id);
  if (!original) return null;
  if (original.attribution_id)
    await tx.query("SELECT id FROM referral_attributions WHERE id=$1 FOR UPDATE", [
      original.attribution_id
    ]);
  await lockOfferIdentity(tx, original.owner_identity_hash);
  await tx.query("SELECT id FROM offer_claims WHERE id=$1 FOR UPDATE", [original.id]);
  await retireZeroBenefitRecovery(tx, snapshot, "offer");
  const context = (await readOfferReconciliationContext(tx, snapshot.organization_external_id))!;
  if (
    snapshot.owner_identity_hash !== context.owner_identity_hash ||
    !(await referralCustomerBindingMatches(
      tx,
      snapshot.organization_external_id,
      snapshot.provider_customer_id
    )) ||
    (context.provider_customer_id !== null &&
      context.provider_customer_id !== snapshot.provider_customer_id)
  )
    throw new Error("offer_receipt_identity_mismatch");
  if (!snapshot.offer_benefit_invoices) throw new Error("offer_invoice_benefits_missing");
  const invoices = snapshot.offer_benefit_invoices
    .filter((i) => i.claim_id === context.id && i.version_id === context.version_id)
    .sort(
      (a, b) =>
        (a.finalized_at ?? a.created_at).localeCompare(b.finalized_at ?? b.created_at) ||
        a.invoice_id.localeCompare(b.invoice_id)
    );
  if (
    snapshot.invoices.some(
      (invoice) =>
        invoice.lines.some(
          (l) =>
            l.kind === "plan" &&
            l.net_amount_minor > 0 &&
            l.plan !== "free" &&
            context.policy.eligible_plans.includes(l.plan)
        ) && !invoices.some((i) => i.invoice_id === invoice.invoice_id)
    )
  )
    throw new Error("offer_invoice_context_missing");
  let reserved = context.eligible_invoice_id;
  for (const invoice of invoices) {
    if (
      context.provider_subscription_id !== null &&
      invoice.subscription_id !== context.provider_subscription_id
    )
      throw new Error("offer_subscription_mismatch");
    if (!invoice.finalized || invoice.amount_due_minor === 0 || invoice.base_net_minor === 0)
      continue;
    if (reserved !== null) {
      if (reserved !== invoice.invoice_id && invoice.applied_coupon_ids.includes(context.coupon_id))
        throw new Error("offer_invoice_benefit_reused");
      continue;
    }
    if (context.recovery_invoice_id !== null && context.recovery_invoice_id !== invoice.invoice_id)
      throw new Error("offer_recovery_in_progress");
    if (!invoice.verified_base_coupon_ids.includes(context.coupon_id))
      throw new Error("offer_invoice_discount_unverified");
    await tx.query(
      "UPDATE offer_claims SET eligible_invoice_id=$2,provider_customer_id=$3,provider_subscription_id=$4,updated_at=now() WHERE id=$1",
      [context.id, invoice.invoice_id, snapshot.provider_customer_id, invoice.subscription_id]
    );
    reserved = invoice.invoice_id;
  }
  if (reserved !== null) return null;
  const draft = invoices.find(
    (i) => !i.finalized && i.amount_due_minor > 0 && i.base_net_minor > 0
  );
  if (!draft) return null;
  if (context.recovery_invoice_id !== null && context.recovery_invoice_id !== draft.invoice_id)
    throw new Error("offer_recovery_in_progress");
  await tx.query(
    `UPDATE offer_claims SET recovery_invoice_id=$2,recovery_requested_at=COALESCE(recovery_requested_at,now()),
    provider_customer_id=$3,provider_subscription_id=$4,updated_at=now() WHERE id=$1`,
    [context.id, draft.invoice_id, snapshot.provider_customer_id, draft.subscription_id]
  );
  const updated = (await readOfferReconciliationContext(tx, snapshot.organization_external_id))!;
  if (updated.recovery_completed_at !== null) return null;
  return OfferBenefitRecoverySchema.parse({
    organization_external_id: snapshot.organization_external_id,
    claim_id: context.id,
    version_id: context.version_id,
    provider_customer_id: snapshot.provider_customer_id,
    provider_subscription_id: draft.subscription_id,
    coupon_id: context.coupon_id,
    invoice_id: draft.invoice_id,
    requested_at: new Date(updated.recovery_requested_at!).toISOString(),
    livemode,
    policy: context.policy
  });
}
export async function completeOfferBenefitRecovery(
  tx: Queryable,
  claimId: string,
  invoiceId: string
): Promise<void> {
  const result = await tx.query(
    "UPDATE offer_claims SET recovery_completed_at=COALESCE(recovery_completed_at,now()),updated_at=now() WHERE id=$1 AND recovery_invoice_id=$2 RETURNING id",
    [claimId, invoiceId]
  );
  if (result.rows.length !== 1) throw new Error("offer_recovery_context_changed");
}
