import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { referralCustomerBindingMatches } from "./referral-customer-binding.js";
import {
  calculateReferralCommission,
  referralFundsAvailableAt
} from "../../referrals/src/commission-policy.js";
import {
  ReferralReceiptSnapshotSchema,
  ReferralBalanceSchema,
  ReferralPayoutSchema,
  ReferralPartnerEarningsSchema,
  type ReferralReceiptSnapshot,
  type ReferralBalance,
  type ReferralPayout,
  type ReferralPartnerEarnings
} from "../../referrals/src/referral-ledger-contracts.js";
import type { Queryable } from "./types.js";
import { runInTransaction } from "./transaction.js";

export interface ReferralLedgerStore {
  reconcile(input: ReferralReceiptSnapshot): Promise<{
    status: "recorded" | "duplicate" | "stale" | "no_referral";
    adjustment_minor: number;
  }>;
  balance(partnerId: string, now: string): Promise<ReferralBalance>;
  listPartnerBalances(input: {
    now: string;
    limit: number;
    before?: string;
  }): Promise<ReferralPartnerEarnings[]>;
  claim(input: {
    partner_id: string;
    claim_id: string;
    operator_user_id: string;
    now: string;
  }): Promise<ReferralPayout>;
  markUncertain(input: {
    batch_id: string;
    operator_user_id: string;
    now: string;
  }): Promise<ReferralPayout>;
  recordPayment(input: {
    batch_id: string;
    operator_user_id: string;
    now: string;
    external_reference: string;
  }): Promise<ReferralPayout>;
  listPayouts(input: {
    partner_id?: string;
    limit: number;
    before?: string;
  }): Promise<ReferralPayout[]>;
}
// A newer unreconciled financial event holds positive cash. Unknown customer
// scope conservatively holds payouts until the bounded provider lookup binds it.
const financialHold = `NOT EXISTS(SELECT 1 FROM referral_reconciliation_events r
  WHERE r.status='pending' AND (r.organization_external_id IS NULL OR r.organization_external_id=(SELECT a.organization_external_id FROM referral_attributions a WHERE a.id=i.attribution_id)))`;
const payoutColumns = `id AS batch_id,partner_id,currency,amount_minor::text,status,external_reference,claimed_at::text,paid_at::text`;
type PayoutRow = Record<string, unknown> & {
  amount_minor: string;
  claimed_at: string;
  paid_at: string | null;
};
function payout(row: PayoutRow): ReferralPayout {
  return ReferralPayoutSchema.parse({
    ...row,
    amount_minor: Number(row.amount_minor),
    claimed_at: new Date(row.claimed_at).toISOString(),
    paid_at: row.paid_at === null ? null : new Date(row.paid_at).toISOString()
  });
}
const PayoutActorSchema = z
  .object({ batch_id: z.uuid(), operator_user_id: z.uuid(), now: z.string().datetime() })
  .strict();
async function lockPartner(db: Queryable, partnerId: string): Promise<void> {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `referral-payout:usd:${partnerId}`
  ]);
}
function canonicalSnapshot(raw: ReferralReceiptSnapshot): ReferralReceiptSnapshot {
  const input = ReferralReceiptSnapshotSchema.parse(raw);
  input.invoices.sort((a, b) => a.invoice_id.localeCompare(b.invoice_id));
  const payments = new Set<string>(),
    invoices = new Set<string>();
  for (const invoice of input.invoices) {
    if (invoices.has(invoice.invoice_id)) throw new Error("duplicate_referral_fact");
    invoices.add(invoice.invoice_id);
    invoice.lines.sort((a, b) => a.id.localeCompare(b.id));
    invoice.refunds.sort((a, b) => a.id.localeCompare(b.id));
    for (const refund of invoice.refunds)
      refund.allocations?.sort((a, b) => a.line_id.localeCompare(b.line_id));
    invoice.payments.sort((a, b) => a.payment_id.localeCompare(b.payment_id));
    for (const payment of invoice.payments) {
      if (payments.has(payment.payment_id)) throw new Error("duplicate_referral_fact");
      payments.add(payment.payment_id);
    }
  }
  if (Buffer.byteLength(JSON.stringify(input)) > 2 * 1024 * 1024)
    throw new Error("referral_snapshot_too_large");
  return input;
}

/** Only trusted provider reconciliation writes this store. Receipts and target
 * deltas are append-only. Partner/currency locking also fences payout claims
 * against refund/dispute commits; no network work occurs under these locks. */
export function createReferralLedgerStore(db: Queryable): ReferralLedgerStore {
  return {
    async reconcile(raw) {
      const input = canonicalSnapshot(raw);
      return runInTransaction(db, async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `referral-receipt:${input.organization_external_id}`
        ]);
        const live = (
          await tx.query<{ stripe_customer_id: string | null }>(
            "SELECT stripe_customer_id FROM organizations WHERE id=$1 FOR SHARE",
            [input.organization_external_id]
          )
        ).rows[0];
        if (
          live &&
          !(await referralCustomerBindingMatches(
            tx,
            input.organization_external_id,
            input.provider_customer_id
          ))
        )
          throw new Error("referral_receipt_customer_mismatch");
        const collections = input.invoices
          .flatMap((invoice) =>
            invoice.payments
              .filter((p) => p.cash_minor > 0)
              .map((payment) => ({ invoice, payment }))
          )
          .sort(
            (a, b) =>
              a.payment.collected_at.localeCompare(b.payment.collected_at) ||
              a.payment.payment_id.localeCompare(b.payment.payment_id)
          );
        const first = collections[0];
        if (first)
          await tx.query(
            `INSERT INTO billing_customer_history(organization_external_id,owner_identity_hash,first_cash_at,provider_invoice_id,provider_payment_id)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_external_id) DO UPDATE
          SET first_cash_at=EXCLUDED.first_cash_at,provider_invoice_id=EXCLUDED.provider_invoice_id,provider_payment_id=EXCLUDED.provider_payment_id
          WHERE (EXCLUDED.first_cash_at,EXCLUDED.provider_payment_id)<(billing_customer_history.first_cash_at,billing_customer_history.provider_payment_id)`,
            [
              input.organization_external_id,
              input.owner_identity_hash,
              first.payment.collected_at,
              first.invoice.invoice_id,
              first.payment.payment_id
            ]
          );
        const attribution = (
          await tx.query<{ id: string; partner_id: string; owner_identity_hash: string }>(
            "SELECT id,partner_id,owner_identity_hash FROM referral_attributions WHERE organization_external_id=$1 FOR UPDATE",
            [input.organization_external_id]
          )
        ).rows[0];
        if (!attribution) return { status: "no_referral", adjustment_minor: 0 };
        if (attribution.owner_identity_hash !== input.owner_identity_hash)
          throw new Error("referral_receipt_identity_mismatch");
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `referral-benefit:${input.owner_identity_hash}`
        ]);
        await lockPartner(tx, attribution.partner_id);
        const latest = (
          await tx.query<{ observed_at: string }>(
            "SELECT observed_at::text FROM referral_receipt_snapshots WHERE organization_external_id=$1 ORDER BY observed_at DESC,id DESC LIMIT 1",
            [input.organization_external_id]
          )
        ).rows[0];
        if (latest && Date.parse(latest.observed_at) > Date.parse(input.observed_at))
          return { status: "stale", adjustment_minor: 0 };
        const digest = createHash("sha256")
          .update(
            JSON.stringify({
              customer: input.provider_customer_id,
              identity: input.owner_identity_hash,
              invoices: input.invoices
            })
          )
          .digest("hex");
        const snapshotId = randomUUID();
        const inserted = await tx.query(
          `INSERT INTO referral_receipt_snapshots(id,organization_external_id,provider_customer_id,owner_identity_hash,digest,facts,observed_at)
          VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT(organization_external_id,digest) DO NOTHING RETURNING id`,
          [
            snapshotId,
            input.organization_external_id,
            input.provider_customer_id,
            input.owner_identity_hash,
            digest,
            JSON.stringify(input.invoices),
            input.observed_at
          ]
        );
        if (!inserted.rows.length) return { status: "duplicate", adjustment_minor: 0 };
        // Capacity-only Business cash is retained in customer payment history,
        // but cannot start or consume the first paid base-service benefit.
        // Any earlier paid Solo/Team service remains ineligible, including a
        // positive add-on during a zero-base bill on those paid tiers.
        const firstService = collections.find(({ invoice }) =>
          invoice.lines.some(
            (line) =>
              line.net_amount_minor > 0 &&
              (line.kind === "plan" || line.plan === "solo" || line.plan === "team")
          )
        );
        if (!firstService) return { status: "recorded", adjustment_minor: 0 };
        const firstBase = firstService.invoice.lines
          .filter((line) => line.kind === "plan" && line.net_amount_minor > 0)
          .sort(
            (a, b) =>
              a.service_starts_at.localeCompare(b.service_starts_at) || a.id.localeCompare(b.id)
          )[0];
        const priorIdentity =
          (
            await tx.query<{ blocked: boolean }>(
              `SELECT EXISTS(SELECT 1 FROM referral_invoice_benefits WHERE owner_identity_hash=$1 AND attribution_id<>$2) OR
          COALESCE((SELECT organization_external_id<>$3::uuid FROM billing_customer_history WHERE owner_identity_hash=$1 ORDER BY first_cash_at,provider_payment_id,organization_external_id LIMIT 1),false) AS blocked`,
              [input.owner_identity_hash, attribution.id, input.organization_external_id]
            )
          ).rows[0]?.blocked === true;
        const status = firstBase?.plan === "business" && !priorIdentity ? "eligible" : "ineligible";
        await tx.query(
          `INSERT INTO referral_commission_periods(attribution_id,first_paid_service_starts_at,first_payment_id,status)
          VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [
            attribution.id,
            firstBase?.service_starts_at ?? firstService.payment.collected_at,
            firstService.payment.payment_id,
            status
          ]
        );
        const period = (
          await tx.query<{
            first_paid_service_starts_at: string;
            first_payment_id: string;
            status: string;
          }>(
            "SELECT first_paid_service_starts_at::text,first_payment_id,status FROM referral_commission_periods WHERE attribution_id=$1",
            [attribution.id]
          )
        ).rows[0]!;
        if (period.first_payment_id !== firstService.payment.payment_id)
          throw new Error("referral_payment_chronology_changed");
        if (period.status !== status) throw new Error("referral_identity_chronology_changed");
        const existing = (
          await tx.query<{ invoice_id: string; target_minor: string }>(
            "SELECT invoice_id,target_minor::text FROM referral_invoice_balances WHERE attribution_id=$1",
            [attribution.id]
          )
        ).rows;
        const old = new Map(existing.map((row) => [row.invoice_id, Number(row.target_minor)]));
        if (
          existing.some(
            (row) => !input.invoices.some((invoice) => invoice.invoice_id === row.invoice_id)
          )
        )
          throw new Error("referral_history_incomplete");
        let adjustment = 0;
        for (const invoice of input.invoices) {
          const cash = invoice.payments.reduce((total, payment) => total + payment.cash_minor, 0);
          const target = calculateReferralCommission({
            first_paid_service_starts_at: new Date(
              period.first_paid_service_starts_at
            ).toISOString(),
            lines: invoice.lines,
            cash_collected_minor: cash,
            refunds: invoice.refunds
          });
          const eligibleTarget = period.status === "eligible" ? target : 0;
          const previous = old.get(invoice.invoice_id) ?? 0;
          const changed = await tx.query(
            `INSERT INTO referral_invoice_balances(invoice_id,attribution_id,target_minor,payout_held,snapshot_id)
            VALUES($1,$2,$3,$4,$5) ON CONFLICT(invoice_id) DO UPDATE SET target_minor=EXCLUDED.target_minor,payout_held=EXCLUDED.payout_held,snapshot_id=EXCLUDED.snapshot_id
            WHERE referral_invoice_balances.attribution_id=EXCLUDED.attribution_id RETURNING invoice_id`,
            [
              invoice.invoice_id,
              attribution.id,
              eligibleTarget,
              invoice.disputed || invoice.reconciliation_hold !== undefined,
              snapshotId
            ]
          );
          if (changed.rows.length !== 1) throw new Error("referral_financial_scope_conflict");
          const delta = eligibleTarget - previous;
          if (!delta) continue;
          const available = invoice.payments.reduce((latest, payment) => {
            const value = referralFundsAvailableAt(
              payment.collected_at,
              payment.provider_available_at
            );
            return value > latest ? value : latest;
          }, "1970-01-01T00:00:00.000Z");
          await tx.query(
            `INSERT INTO referral_commission_ledger(id,partner_id,attribution_id,invoice_id,snapshot_id,currency,amount_minor,available_at)
            VALUES($1,$2,$3,$4,$5,'usd',$6,$7)`,
            [
              randomUUID(),
              attribution.partner_id,
              attribution.id,
              invoice.invoice_id,
              snapshotId,
              delta,
              available
            ]
          );
          adjustment += delta;
        }
        return { status: "recorded", adjustment_minor: adjustment };
      });
    },
    async balance(partnerId, now) {
      z.uuid().parse(partnerId);
      z.string().datetime().parse(now);
      const rows = (
        await db.query<{ bucket: string; amount: string }>(
          `SELECT CASE WHEN b.status='paid' THEN 'paid' WHEN b.id IS NOT NULL THEN 'claimed'
        WHEN l.amount_minor<0 OR (NOT i.payout_held AND ${financialHold} AND l.available_at<=$2::timestamptz) THEN 'available' ELSE 'pending' END AS bucket,
        sum(l.amount_minor)::text AS amount FROM referral_commission_ledger l JOIN referral_invoice_balances i ON i.invoice_id=l.invoice_id
        LEFT JOIN referral_payout_entries e ON e.ledger_entry_id=l.id LEFT JOIN referral_payout_batches b ON b.id=e.batch_id
        WHERE l.partner_id=$1::uuid GROUP BY 1`,
          [partnerId, now]
        )
      ).rows;
      const values = new Map(rows.map((row) => [row.bucket, Number(row.amount)]));
      return ReferralBalanceSchema.parse({
        currency: "usd",
        pending_minor: values.get("pending") ?? 0,
        available_minor: values.get("available") ?? 0,
        claimed_minor: values.get("claimed") ?? 0,
        paid_minor: values.get("paid") ?? 0
      });
    },
    async listPartnerBalances(raw) {
      const input = z
        .object({
          now: z.string().datetime(),
          limit: z.number().int().min(1).max(100),
          before: z.uuid().optional()
        })
        .strict()
        .parse(raw);
      const rows = (
        await db.query<{ partner_id: string; code: string; bucket: string; amount: string }>(
          `WITH selected AS (
        SELECT p.id,p.code FROM referral_partners p WHERE ($1::uuid IS NULL OR p.id<$1)
          AND EXISTS(SELECT 1 FROM referral_commission_ledger l WHERE l.partner_id=p.id) ORDER BY p.id DESC LIMIT $3)
        SELECT p.id AS partner_id,p.code,CASE WHEN b.status='paid' THEN 'paid' WHEN b.id IS NOT NULL THEN 'claimed'
          WHEN l.amount_minor<0 OR (NOT i.payout_held AND ${financialHold} AND l.available_at<=$2::timestamptz) THEN 'available' ELSE 'pending' END AS bucket,
          sum(l.amount_minor)::text AS amount FROM selected p JOIN referral_commission_ledger l ON l.partner_id=p.id
          JOIN referral_invoice_balances i ON i.invoice_id=l.invoice_id LEFT JOIN referral_payout_entries e ON e.ledger_entry_id=l.id
          LEFT JOIN referral_payout_batches b ON b.id=e.batch_id GROUP BY p.id,p.code,bucket ORDER BY p.id DESC`,
          [input.before ?? null, input.now, input.limit]
        )
      ).rows;
      const partners = new Map<string, { code: string; amounts: Map<string, number> }>();
      for (const row of rows) {
        let partner = partners.get(row.partner_id);
        if (!partner) {
          partner = { code: row.code, amounts: new Map() };
          partners.set(row.partner_id, partner);
        }
        partner.amounts.set(row.bucket, Number(row.amount));
      }
      return [...partners].map(([partnerId, partner]) =>
        ReferralPartnerEarningsSchema.parse({
          partner_id: partnerId,
          code: partner.code,
          balance: {
            currency: "usd",
            pending_minor: partner.amounts.get("pending") ?? 0,
            available_minor: partner.amounts.get("available") ?? 0,
            claimed_minor: partner.amounts.get("claimed") ?? 0,
            paid_minor: partner.amounts.get("paid") ?? 0
          }
        })
      );
    },
    async claim(raw) {
      const input = z
        .object({
          partner_id: z.uuid(),
          claim_id: z.uuid(),
          operator_user_id: z.uuid(),
          now: z.string().datetime()
        })
        .strict()
        .parse(raw);
      return runInTransaction(db, async (tx) => {
        await tx.query(
          "SELECT pg_advisory_xact_lock_shared(hashtextextended('referral-financial-admission',0))",
          []
        );
        await lockPartner(tx, input.partner_id);
        const previous = (
          await tx.query<PayoutRow>(
            `SELECT ${payoutColumns} FROM referral_payout_batches WHERE id=$1`,
            [input.claim_id]
          )
        ).rows[0];
        if (previous) {
          const batch = payout(previous);
          if (batch.partner_id !== input.partner_id) throw new Error("payout_claim_conflict");
          return batch;
        }
        if (
          (
            await tx.query(
              "SELECT id FROM referral_payout_batches WHERE partner_id=$1 AND status IN ('claimed','uncertain')",
              [input.partner_id]
            )
          ).rows.length
        )
          throw new Error("payout_already_claimed");
        const entries = (
          await tx.query<{ id: string; amount_minor: string }>(
            `SELECT l.id,l.amount_minor::text FROM referral_commission_ledger l JOIN referral_invoice_balances i ON i.invoice_id=l.invoice_id
          WHERE l.partner_id=$1 AND NOT EXISTS(SELECT 1 FROM referral_payout_entries e WHERE e.ledger_entry_id=l.id)
          AND (l.amount_minor<0 OR (NOT i.payout_held AND ${financialHold} AND l.available_at<=$2::timestamptz)) ORDER BY l.available_at,l.id LIMIT 10001`,
            [input.partner_id, input.now]
          )
        ).rows;
        if (entries.length > 10000) throw new Error("payout_claim_too_large");
        const amount = entries.reduce((total, row) => total + BigInt(row.amount_minor), 0n);
        if (amount <= 0n) throw new Error("no_available_commission");
        if (amount > 1_000_000_000_000n) throw new Error("payout_claim_too_large");
        const batch = (
          await tx.query<PayoutRow>(
            `INSERT INTO referral_payout_batches(id,partner_id,currency,amount_minor,status,claimed_by,updated_by,claimed_at)
          VALUES($1,$2,'usd',$3,'claimed',$4,$4,$5) RETURNING ${payoutColumns}`,
            [input.claim_id, input.partner_id, amount.toString(), input.operator_user_id, input.now]
          )
        ).rows[0]!;
        await tx.query(
          "INSERT INTO referral_payout_entries(batch_id,ledger_entry_id) SELECT $1,unnest($2::uuid[])",
          [input.claim_id, entries.map((row) => row.id)]
        );
        return payout(batch);
      });
    },
    async markUncertain(raw) {
      const input = PayoutActorSchema.parse(raw);
      return runInTransaction(db, async (tx) => {
        const row = (
          await tx.query<PayoutRow>(
            `SELECT ${payoutColumns} FROM referral_payout_batches WHERE id=$1 FOR UPDATE`,
            [input.batch_id]
          )
        ).rows[0];
        if (!row) throw new Error("payout_not_found");
        if (row["status"] === "paid") throw new Error("payout_already_paid");
        const next = (
          await tx.query<PayoutRow>(
            `UPDATE referral_payout_batches SET status='uncertain',updated_by=$2 WHERE id=$1 RETURNING ${payoutColumns}`,
            [input.batch_id, input.operator_user_id]
          )
        ).rows[0]!;
        return payout(next);
      });
    },
    async recordPayment(raw) {
      const input = PayoutActorSchema.extend({
        external_reference: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .regex(/^[A-Za-z0-9][A-Za-z0-9_.:/ -]*$/)
      })
        .strict()
        .parse(raw);
      return runInTransaction(db, async (tx) => {
        const row = (
          await tx.query<PayoutRow>(
            `SELECT ${payoutColumns} FROM referral_payout_batches WHERE id=$1 FOR UPDATE`,
            [input.batch_id]
          )
        ).rows[0];
        if (!row) throw new Error("payout_not_found");
        if (row["status"] === "paid") {
          if (row["external_reference"] !== input.external_reference)
            throw new Error("payout_reference_conflict");
          return payout(row);
        }
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `referral-payout-reference:${input.external_reference}`
        ]);
        if (
          (
            await tx.query("SELECT id FROM referral_payout_batches WHERE external_reference=$1", [
              input.external_reference
            ])
          ).rows.length
        )
          throw new Error("payout_reference_conflict");
        return payout(
          (
            await tx.query<PayoutRow>(
              `UPDATE referral_payout_batches SET status='paid',external_reference=$2,paid_at=$3,updated_by=$4 WHERE id=$1 RETURNING ${payoutColumns}`,
              [input.batch_id, input.external_reference, input.now, input.operator_user_id]
            )
          ).rows[0]!
        );
      });
    },
    async listPayouts(raw) {
      const input = z
        .object({
          partner_id: z.uuid().optional(),
          limit: z.number().int().min(1).max(100),
          before: z.uuid().optional()
        })
        .strict()
        .parse(raw);
      const rows = await db.query<PayoutRow>(
        `SELECT ${payoutColumns} FROM referral_payout_batches b WHERE ($1::uuid IS NULL OR partner_id=$1)
        AND ($3::uuid IS NULL OR (claimed_at,id)<(SELECT claimed_at,id FROM referral_payout_batches WHERE id=$3 AND ($1::uuid IS NULL OR partner_id=$1))) ORDER BY claimed_at DESC,id DESC LIMIT $2`,
        [input.partner_id ?? null, input.limit, input.before ?? null]
      );
      return rows.rows.map(payout);
    }
  };
}
