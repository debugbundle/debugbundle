import { z } from "zod";
import { calculateCollectedBaseCash } from "./commission-policy.js";
import {
  ReferralReceiptSnapshotSchema,
  type ReferralReceiptSnapshot
} from "./referral-ledger-contracts.js";
const amount = z.number().int().safe().nonnegative().max(1_000_000_000_000_000);
export const OfferPerformanceSchema = z
  .object({
    observed_at: z.string().datetime(),
    base_cash_collected_minor: amount,
    base_cash_retained_minor: amount,
    base_discount_minor: amount,
    discount_coverage_complete: z.boolean(),
    disputed_invoices: z.number().int().nonnegative(),
    held_invoices: z.number().int().nonnegative()
  })
  .strict();
export const OfferPerformanceQuerySchema = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    version_id: z.uuid().optional()
  })
  .strict()
  .refine(
    (v) =>
      Date.parse(v.to) > Date.parse(v.from) &&
      Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000,
    "Use an increasing UTC window of at most 366 days."
  );
export const OfferPerformanceReportSchema = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    as_of: z.string().datetime(),
    version_id: z.uuid().nullable(),
    claims: amount,
    active_trials: amount,
    paid_conversions: amount,
    reconciled_claims: amount,
    unreconciled_claims: amount,
    oldest_observation: z.string().datetime().nullable(),
    latest_observation: z.string().datetime().nullable(),
    base_cash_collected_minor: amount,
    base_cash_retained_minor: amount,
    base_cash_reversed_minor: amount,
    base_discount_minor: amount,
    discount_coverage_complete: z.boolean(),
    commission_net_minor: z.number().int().safe(),
    commission_paid_minor: z.number().int().safe(),
    commission_reversed_minor: amount,
    disputed_invoices: amount,
    held_invoices: amount,
    currency: z.literal("usd")
  })
  .strict();
/** Derived reporting data only; receipt snapshots and the existing append-only
 * commission ledger remain the financial authority. Never accepts browser facts. */
export function projectOfferPerformance(
  raw: ReferralReceiptSnapshot
): z.infer<typeof OfferPerformanceSchema> {
  const snapshot = ReferralReceiptSnapshotSchema.parse(raw),
    plans = ["solo", "team", "business"] as const;
  let collected = 0,
    retained = 0,
    discount = 0,
    complete = true,
    disputed = 0,
    held = 0;
  for (const invoice of snapshot.invoices) {
    const input = {
      lines: invoice.lines,
      cash_collected_minor: invoice.payments.reduce((n, p) => n + p.cash_minor, 0),
      refunds: invoice.refunds
    };
    collected += calculateCollectedBaseCash({ ...input, refunds: [] }, [...plans]);
    retained += calculateCollectedBaseCash(input, [...plans]);
    discount += invoice.base_discount_minor ?? 0;
    complete &&= invoice.base_discount_minor !== undefined;
    disputed += Number(invoice.disputed);
    held += Number(invoice.reconciliation_hold !== undefined);
  }
  return OfferPerformanceSchema.parse({
    observed_at: snapshot.observed_at,
    base_cash_collected_minor: collected,
    base_cash_retained_minor: retained,
    base_discount_minor: discount,
    discount_coverage_complete: complete,
    disputed_invoices: disputed,
    held_invoices: held
  });
}
