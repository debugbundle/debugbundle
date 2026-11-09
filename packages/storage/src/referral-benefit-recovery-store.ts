import { z } from "zod";
import type { Queryable } from "./types.js";
import { runInTransaction } from "./transaction.js";
const id = z.string().min(1).max(255);
export const ReferralBenefitContextSchema = z
  .object({
    organization_external_id: z.uuid(),
    attribution_id: z.uuid(),
    coupon_id: id,
    provider_customer_id: id.nullable(),
    provider_subscription_id: id.nullable(),
    eligible_invoice_id: id.nullable()
  })
  .strict();
export async function readReferralBenefitContext(
  db: Queryable,
  organization: string
): Promise<z.infer<typeof ReferralBenefitContextSchema> | null> {
  z.uuid().parse(organization);
  const row = (
    await db.query<Record<string, unknown>>(
      "SELECT organization_external_id,attribution_id,coupon_id,provider_customer_id,provider_subscription_id,eligible_invoice_id FROM referral_invoice_benefits WHERE organization_external_id=$1",
      [organization]
    )
  ).rows[0];
  return row ? ReferralBenefitContextSchema.parse(row) : null;
}
export async function prepareReferralBenefitRecovery(
  db: Queryable,
  raw: {
    organization_external_id: string;
    provider_customer_id: string;
    provider_subscription_id: string;
    invoice_id: string;
  }
): Promise<{ requested_at: string } | null> {
  const input = z
    .object({
      organization_external_id: z.uuid(),
      provider_customer_id: id,
      provider_subscription_id: id,
      invoice_id: id
    })
    .strict()
    .parse(raw);
  return runInTransaction(db, async (tx) => {
    const row = (
      await tx.query<Record<string, unknown>>(
        "SELECT *,recovery_requested_at::text AS recovery_requested_at FROM referral_invoice_benefits WHERE organization_external_id=$1 FOR UPDATE",
        [input.organization_external_id]
      )
    ).rows[0];
    if (!row || row["eligible_invoice_id"] !== null) return null;
    if (
      (row["provider_customer_id"] !== null &&
        row["provider_customer_id"] !== input.provider_customer_id) ||
      (row["provider_subscription_id"] !== null &&
        row["provider_subscription_id"] !== input.provider_subscription_id)
    )
      throw new Error("referral_benefit_customer_mismatch");
    if (row["recovery_invoice_id"] === input.invoice_id) {
      return row["recovery_completed_at"] === null
        ? { requested_at: new Date(String(row["recovery_requested_at"])).toISOString() }
        : null;
    }
    if (row["recovery_requested_at"] !== null && row["recovery_completed_at"] === null)
      throw new Error("referral_benefit_recovery_unresolved");
    const result = (
      await tx.query<{ requested_at: string }>(
        "UPDATE referral_invoice_benefits SET provider_customer_id=$2,provider_subscription_id=$3,recovery_invoice_id=$4,recovery_requested_at=now(),recovery_completed_at=NULL,updated_at=now() WHERE organization_external_id=$1 RETURNING recovery_requested_at::text AS requested_at",
        [
          input.organization_external_id,
          input.provider_customer_id,
          input.provider_subscription_id,
          input.invoice_id
        ]
      )
    ).rows[0]!;
    return { requested_at: new Date(result.requested_at).toISOString() };
  });
}
export async function completeReferralBenefitRecovery(
  db: Queryable,
  organization: string,
  invoice: string
): Promise<void> {
  z.uuid().parse(organization);
  id.parse(invoice);
  const result = await db.query(
    "UPDATE referral_invoice_benefits SET recovery_completed_at=COALESCE(recovery_completed_at,now()),updated_at=now() WHERE organization_external_id=$1 AND recovery_invoice_id=$2 RETURNING owner_identity_hash",
    [organization, invoice]
  );
  if (result.rows.length !== 1) throw new Error("referral_benefit_recovery_changed");
}
