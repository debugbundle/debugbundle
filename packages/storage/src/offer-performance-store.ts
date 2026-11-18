import { z } from "zod";
import {
  OfferPerformanceSchema,
  OfferPerformanceQuerySchema,
  OfferPerformanceReportSchema,
  projectOfferPerformance
} from "../../referrals/src/offer-performance.js";
import type { ReferralReceiptSnapshot } from "../../referrals/src/referral-ledger-contracts.js";
import { referralCustomerBindingMatches } from "./referral-customer-binding.js";
import type { Queryable } from "./types.js";
/** Called in the receipt worker's fenced final transaction. Stale observations
 * cannot overwrite a later projection. The projection grants no payout rights. */
export async function recordOfferPerformance(
  tx: Queryable,
  snapshot: ReferralReceiptSnapshot
): Promise<void> {
  const claim = (
    await tx.query<{
      id: string;
      owner_identity_hash: string;
      provider_customer_id: string | null;
      performance: unknown;
    }>(
      "SELECT id,owner_identity_hash,provider_customer_id,performance FROM offer_claims WHERE organization_external_id=$1 FOR UPDATE",
      [snapshot.organization_external_id]
    )
  ).rows[0];
  if (!claim) return;
  if (
    claim.owner_identity_hash !== snapshot.owner_identity_hash ||
    (claim.provider_customer_id !== null &&
      claim.provider_customer_id !== snapshot.provider_customer_id) ||
    !(await referralCustomerBindingMatches(
      tx,
      snapshot.organization_external_id,
      snapshot.provider_customer_id
    ))
  )
    throw new Error("offer_performance_binding_mismatch");
  const previous =
    claim.performance === null ? null : OfferPerformanceSchema.parse(claim.performance);
  if (previous && previous.observed_at > snapshot.observed_at) return;
  await tx.query("UPDATE offer_claims SET performance=$2::jsonb WHERE id=$1", [
    claim.id,
    JSON.stringify(projectOfferPerformance(snapshot))
  ]);
}
/** Cohort report: claims in [from,to), current lifetime verified money as of
 * each receipt observation. Coverage and held/disputed counts are explicit. */
export async function readOfferPerformance(
  db: Queryable,
  raw: z.input<typeof OfferPerformanceQuerySchema>
): Promise<z.infer<typeof OfferPerformanceReportSchema>> {
  const input = OfferPerformanceQuerySchema.parse(raw);
  const row = (
    await db.query(
      `WITH cohort AS (SELECT c.* FROM offer_claims c WHERE c.claimed_at>=$1::timestamptz AND c.claimed_at<$2::timestamptz AND ($3::uuid IS NULL OR c.version_id=$3)),
 money AS (SELECT COALESCE(sum(l.amount_minor),0) AS net,COALESCE(sum(l.amount_minor) FILTER(WHERE b.status='paid'),0) AS paid,COALESCE(-sum(l.amount_minor) FILTER(WHERE l.amount_minor<0),0) AS reversed FROM cohort c JOIN referral_commission_ledger l ON l.attribution_id=c.attribution_id LEFT JOIN referral_payout_entries e ON e.ledger_entry_id=l.id LEFT JOIN referral_payout_batches b ON b.id=e.batch_id)
 SELECT clock_timestamp() AS as_of,count(*) AS claims,count(*) FILTER(WHERE o.trial_ends_at>clock_timestamp() AND o.billing_state='trialing') AS active_trials,
 count(*) FILTER(WHERE h.organization_external_id IS NOT NULL) AS paid_conversions,count(*) FILTER(WHERE c.performance IS NOT NULL) AS reconciled_claims,count(*) FILTER(WHERE c.performance IS NULL) AS unreconciled_claims,
 min((c.performance->>'observed_at')::timestamptz) AS oldest_observation,max((c.performance->>'observed_at')::timestamptz) AS latest_observation,
 COALESCE(sum((c.performance->>'base_cash_collected_minor')::bigint),0) AS base_cash_collected_minor,COALESCE(sum((c.performance->>'base_cash_retained_minor')::bigint),0) AS base_cash_retained_minor,COALESCE(sum((c.performance->>'base_discount_minor')::bigint),0) AS base_discount_minor,
 COALESCE(bool_and(COALESCE((c.performance->>'discount_coverage_complete')::boolean,false)),true) AS discount_coverage_complete,
 COALESCE(sum((c.performance->>'disputed_invoices')::int),0) AS disputed_invoices,COALESCE(sum((c.performance->>'held_invoices')::int),0) AS held_invoices,
 (SELECT net FROM money) AS commission_net_minor,(SELECT paid FROM money) AS commission_paid_minor,(SELECT reversed FROM money) AS commission_reversed_minor
 FROM cohort c LEFT JOIN organizations o ON o.id=c.organization_id LEFT JOIN billing_customer_history h ON h.organization_external_id=c.organization_external_id`,
      [input.from, input.to, input.version_id ?? null]
    )
  ).rows[0]!;
  const out: Record<string, unknown> = {
    ...row,
    ...input,
    version_id: input.version_id ?? null,
    currency: "usd"
  };
  for (const key of ["as_of", "oldest_observation", "latest_observation"])
    out[key] = row[key] === null ? null : new Date(row[key] as string | Date).toISOString();
  for (const key of [
    "claims",
    "active_trials",
    "paid_conversions",
    "reconciled_claims",
    "unreconciled_claims",
    "base_cash_collected_minor",
    "base_cash_retained_minor",
    "base_discount_minor",
    "commission_net_minor",
    "commission_paid_minor",
    "commission_reversed_minor",
    "disputed_invoices",
    "held_invoices"
  ])
    out[key] = Number(row[key]);
  out["base_cash_reversed_minor"] = Math.max(
    0,
    Number(row["base_cash_collected_minor"]) - Number(row["base_cash_retained_minor"])
  );
  return OfferPerformanceReportSchema.parse(out);
}
