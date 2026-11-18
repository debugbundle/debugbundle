import { randomUUID } from "node:crypto";
import {
  CreatorEmailPayloadSchema,
  type CreatorEmailPayload
} from "../../referrals/src/creator-email-contracts.js";
import { calculateCollectedBaseCash } from "../../referrals/src/commission-policy.js";
import { OfferPolicySchema, type ProgrammeVersion } from "../../referrals/src/programme-policy.js";
import {
  ReferralReceiptSnapshotSchema,
  type ReferralReceiptSnapshot
} from "../../referrals/src/referral-ledger-contracts.js";
import type { Queryable } from "./types.js";

/** Acquire before user/partner/financial locks. The daily scheduler takes the
 * exclusive lock to seal a UTC window only after its event writers commit. */
export async function lockCreatorEmailEpoch(tx: Queryable): Promise<string> {
  const row = (
    await tx.query<{ started_at: string }>(
      "SELECT started_at::text FROM referral_creator_email_state WHERE id FOR SHARE",
      []
    )
  ).rows[0];
  if (!row) throw new Error("creator_email_schema_incomplete");
  return new Date(row.started_at).toISOString();
}
export async function queueCreatorEmail(
  tx: Queryable,
  input: {
    partner_id: string;
    user_id: string | null;
    dedupe_key: string;
    payload: CreatorEmailPayload;
  }
): Promise<string> {
  const payload = CreatorEmailPayloadSchema.parse(input.payload);
  const id = randomUUID();
  const row = (
    await tx.query<{ id: string }>(
      `INSERT INTO referral_creator_email_deliveries(id,partner_id,user_id,kind,dedupe_key,payload)
     VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(partner_id,kind,dedupe_key) DO NOTHING RETURNING id`,
      [id, input.partner_id, input.user_id, payload.kind, input.dedupe_key, JSON.stringify(payload)]
    )
  ).rows[0];
  if (row) return row.id;
  return (
    await tx.query<{ id: string }>(
      "SELECT id FROM referral_creator_email_deliveries WHERE partner_id=$1 AND kind=$2 AND dedupe_key=$3",
      [input.partner_id, payload.kind, input.dedupe_key]
    )
  ).rows[0]!.id;
}
export async function queueCreatorJoinEmail(
  tx: Queryable,
  input: { partner_id: string; user_id: string; code: string; version: ProgrammeVersion }
): Promise<void> {
  const { version } = input;
  await queueCreatorEmail(tx, {
    partner_id: input.partner_id,
    user_id: input.user_id,
    dedupe_key: version.version_id,
    payload: {
      kind: "joined",
      name: version.name,
      terms_version: version.policy.terms_version,
      code: input.code,
      commission_basis_points: version.policy.commission_basis_points,
      discount_basis_points: version.policy.discount_basis_points,
      commission_months: version.policy.commission_months
    }
  });
}
/** Only the receipt worker's final fenced transaction calls this, after verified
 * settlement. No visit, claim, trial, renewal or provider callback alone qualifies. */
export async function recordCreatorFirstPurchase(
  tx: Queryable,
  raw: ReferralReceiptSnapshot,
  epoch: string
): Promise<void> {
  const snapshot = ReferralReceiptSnapshotSchema.parse(raw);
  const row = (
    await tx.query<{
      attribution_id: string;
      partner_id: string;
      user_id: string | null;
      programme_id: string;
      version_id: string;
      name: string;
      policy: unknown;
      first_payment_id: string;
    }>(
      `SELECT a.id AS attribution_id,a.partner_id,p.user_id,v.programme_id,v.id AS version_id,v.name,v.policy,r.first_payment_id
      FROM referral_attributions a JOIN offer_claims c ON c.attribution_id=a.id
      JOIN offer_programme_versions v ON v.id=c.referral_version_id
      JOIN offer_creator_memberships m ON m.partner_id=a.partner_id AND m.version_id=v.id
      JOIN referral_partners p ON p.id=a.partner_id
      JOIN referral_commission_periods r ON r.attribution_id=a.id AND r.status='eligible'
      WHERE a.organization_external_id=$1 AND a.owner_identity_hash=$2`,
      [snapshot.organization_external_id, snapshot.owner_identity_hash]
    )
  ).rows[0];
  if (!row || row.user_id === null) return;
  const policy = OfferPolicySchema.parse(row.policy);
  if (policy.kind !== "referral") return;
  const invoice = snapshot.invoices.find((i) =>
    i.payments.some((p) => p.payment_id === row.first_payment_id)
  );
  const payment = invoice?.payments.find((p) => p.payment_id === row.first_payment_id);
  if (
    !invoice ||
    !payment ||
    Date.parse(payment.collected_at) < Date.parse(epoch) ||
    invoice.disputed ||
    invoice.reconciliation_hold
  )
    return;
  const cash = calculateCollectedBaseCash(
    {
      lines: invoice.lines,
      cash_collected_minor: invoice.payments.reduce((s, p) => s + p.cash_minor, 0),
      refunds: invoice.refunds
    },
    policy.eligible_plans
  );
  if (cash <= 0) return;
  // Same partner lock as settlement/join, so programme revisions cannot create
  // two first-purchase celebrations while different customers reconcile together.
  await tx.query("SELECT id FROM referral_partners WHERE id=$1 FOR UPDATE", [row.partner_id]);
  if (
    (
      await tx.query("SELECT id FROM referral_creator_email_events WHERE attribution_id=$1", [
        row.attribution_id
      ])
    ).rows.length
  )
    return;
  const first = !(
    await tx.query(
      "SELECT id FROM referral_creator_email_events WHERE partner_id=$1 AND programme_id=$2 AND first_in_programme",
      [row.partner_id, row.programme_id]
    )
  ).rows.length;
  const balance = (
    await tx.query<{ target_minor: string }>(
      "SELECT target_minor::text FROM referral_invoice_balances WHERE attribution_id=$1 AND invoice_id=$2 AND NOT payout_held",
      [row.attribution_id, invoice.invoice_id]
    )
  ).rows[0];
  if (!balance) return;
  const commission = Number(balance.target_minor);
  await tx.query(
    `INSERT INTO referral_creator_email_events(id,partner_id,programme_id,version_id,attribution_id,invoice_id,name,commission_minor,first_in_programme)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      randomUUID(),
      row.partner_id,
      row.programme_id,
      row.version_id,
      row.attribution_id,
      invoice.invoice_id,
      row.name,
      commission,
      first
    ]
  );
  if (first) {
    await queueCreatorEmail(tx, {
      partner_id: row.partner_id,
      user_id: row.user_id,
      dedupe_key: row.programme_id,
      payload: {
        kind: "first_purchase",
        window_start: payment.collected_at,
        window_end: snapshot.observed_at,
        sections: [
          {
            programme_id: row.programme_id,
            name: row.name,
            new_referrals: 1,
            pending_commission_minor: commission
          }
        ],
        total_referrals: 1,
        total_commission_minor: commission,
        other_programmes: 0
      }
    });
  }
}
