import { calculateCollectedBaseCash } from "../../referrals/src/commission-policy.js";
import { randomUUID } from "node:crypto";
import {
  ReferralReceiptSnapshotSchema,
  type ReferralReceiptSnapshot
} from "../../referrals/src/referral-ledger-contracts.js";
import { referralCustomerBindingMatches } from "./referral-customer-binding.js";
import { lockOfferIdentity } from "./offer-store-helpers.js";
import type { Queryable } from "./types.js";
interface RecoveryRow extends Record<string, unknown> {
  claim_id: string | null;
  version_id: string | null;
  attribution_id: string | null;
  owner_identity_hash: string;
  eligible_invoice_id: string | null;
  recovery_invoice_id: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  coupon_id: string;
}
/** SQL-only, in the receipt worker's fenced transaction. A verified finalised
 * zero invoice can retire an ambiguous draft repair, never its customer benefit
 * or Checkout reservation. Preserve the exact retirement as immutable evidence. */
export async function retireZeroBenefitRecovery(
  tx: Queryable,
  raw: ReferralReceiptSnapshot,
  kind: "offer" | "legacy"
): Promise<boolean> {
  const snapshot = ReferralReceiptSnapshotSchema.parse(raw),
    table = kind === "offer" ? "offer_claims" : "referral_invoice_benefits";
  const columns =
    kind === "offer"
      ? "id AS claim_id,version_id,attribution_id,owner_identity_hash,eligible_invoice_id,recovery_invoice_id,provider_customer_id,provider_subscription_id,coupon_id"
      : "NULL::uuid AS claim_id,NULL::uuid AS version_id,attribution_id,owner_identity_hash,eligible_invoice_id,recovery_invoice_id,provider_customer_id,provider_subscription_id,coupon_id";
  const read = async (lock = false): Promise<RecoveryRow | undefined> =>
    (
      await tx.query<RecoveryRow>(
        `SELECT ${columns} FROM ${table} WHERE organization_external_id=$1 ${lock ? "FOR UPDATE" : ""}`,
        [snapshot.organization_external_id]
      )
    ).rows[0];
  const original = await read();
  if (!original?.recovery_invoice_id || original.eligible_invoice_id) return false;
  const candidate = (
    row: RecoveryRow
  ):
    | NonNullable<ReferralReceiptSnapshot["offer_benefit_invoices"]>[number]
    | NonNullable<ReferralReceiptSnapshot["benefit_invoices"]>[number]
    | undefined => {
    const values =
      kind === "offer"
        ? snapshot.offer_benefit_invoices?.filter(
            (i) =>
              i.invoice_id === row.recovery_invoice_id &&
              i.claim_id === row.claim_id &&
              i.version_id === row.version_id
          )
        : snapshot.benefit_invoices?.filter(
            (i) =>
              i.invoice_id === row.recovery_invoice_id && i.attribution_id === row.attribution_id
          );
    if (values && values.length > 1) throw new Error("referral_zero_recovery_unverified");
    return values?.[0];
  };
  const isZero = (invoice: NonNullable<ReturnType<typeof candidate>>): boolean =>
    invoice.finalized &&
    (invoice.amount_due_minor === 0 ||
      ("base_net_minor" in invoice ? invoice.base_net_minor : invoice.business_base_net_minor) ===
        0);
  const first = candidate(original);
  if (!first || !isZero(first)) return false;
  await tx.query("SELECT id FROM organizations WHERE id=$1 FOR SHARE", [
    snapshot.organization_external_id
  ]);
  if (original.attribution_id)
    await tx.query("SELECT id FROM referral_attributions WHERE id=$1 FOR UPDATE", [
      original.attribution_id
    ]);
  await lockOfferIdentity(tx, original.owner_identity_hash);
  const row = await read(true);
  if (!row?.recovery_invoice_id || row.eligible_invoice_id) return false;
  const invoice = candidate(row);
  if (!invoice || !isZero(invoice)) return false;
  const cash = snapshot.invoices.filter((i) => i.invoice_id === invoice.invoice_id);
  if (
    row.owner_identity_hash !== snapshot.owner_identity_hash ||
    row.provider_customer_id !== snapshot.provider_customer_id ||
    row.provider_subscription_id !== invoice.subscription_id ||
    cash.length !== 1 ||
    !(await referralCustomerBindingMatches(
      tx,
      snapshot.organization_external_id,
      snapshot.provider_customer_id
    ))
  )
    throw new Error("referral_zero_recovery_unverified");
  const canonical = cash[0]!;
  // Capacity/tax-only cash does not consume a base benefit. Ever-collected base
  // cash does, even if later refunded; a refund must never reset the promise.
  if (
    calculateCollectedBaseCash(
      {
        lines: canonical.lines,
        cash_collected_minor: canonical.payments.reduce((sum, p) => sum + p.cash_minor, 0),
        refunds: []
      },
      kind === "legacy" ? ["business"] : ["solo", "team", "business"]
    ) > 0
  )
    throw new Error("referral_zero_recovery_unverified");
  const base =
    "base_net_minor" in invoice ? invoice.base_net_minor : invoice.business_base_net_minor;
  await tx.query(
    `INSERT INTO referral_benefit_recovery_retirements(id,kind,claim_id,attribution_id,organization_external_id,owner_identity_hash,coupon_id,provider_customer_id,provider_subscription_id,provider_invoice_id,amount_due_minor,base_net_minor,observed_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(provider_invoice_id) DO NOTHING`,
    [
      randomUUID(),
      kind,
      row.claim_id,
      row.attribution_id,
      snapshot.organization_external_id,
      row.owner_identity_hash,
      row.coupon_id,
      row.provider_customer_id,
      row.provider_subscription_id,
      invoice.invoice_id,
      invoice.amount_due_minor,
      base,
      snapshot.observed_at
    ]
  );
  const matching = await tx.query(
    `SELECT id FROM referral_benefit_recovery_retirements WHERE provider_invoice_id=$1 AND kind=$2 AND claim_id IS NOT DISTINCT FROM $3::uuid AND attribution_id IS NOT DISTINCT FROM $4::uuid AND organization_external_id=$5 AND owner_identity_hash=$6 AND coupon_id=$7 AND provider_customer_id=$8 AND provider_subscription_id=$9`,
    [
      invoice.invoice_id,
      kind,
      row.claim_id,
      row.attribution_id,
      snapshot.organization_external_id,
      row.owner_identity_hash,
      row.coupon_id,
      row.provider_customer_id,
      row.provider_subscription_id
    ]
  );
  if (matching.rows.length !== 1) throw new Error("referral_zero_recovery_scope_conflict");
  await tx.query(
    `UPDATE ${table} SET recovery_invoice_id=NULL,recovery_requested_at=NULL,recovery_completed_at=NULL,updated_at=now() WHERE organization_external_id=$1 AND recovery_invoice_id=$2 AND eligible_invoice_id IS NULL`,
    [snapshot.organization_external_id, invoice.invoice_id]
  );
  return true;
}
