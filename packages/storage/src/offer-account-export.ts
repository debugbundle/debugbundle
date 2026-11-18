import { z } from "zod";
import type { Queryable } from "./types.js";
export const OFFER_ACCOUNT_EXPORT_SECTIONS = [
  "creator_programmes",
  "creator_codes",
  "creator_payout_preferences",
  "creator_payout_instruction_history",
  "creator_email_history",
  "customer_offers",
  "offer_claim_history",
  "offer_signup_intents",
  "offer_early_purchase_grants"
] as const;
const sectionSchema = z.enum(OFFER_ACCOUNT_EXPORT_SECTIONS);
const projections = {
  creator_email_history: {
    from: "referral_creator_email_deliveries d JOIN referral_partners p ON p.id=d.partner_id",
    where: "p.user_id=$1 AND d.user_id=$1 AND d.created_at<=$3::timestamptz",
    id: "d.id",
    columns: "d.id,d.kind,d.status,d.attempt,d.reason,d.created_at,d.sent_at"
  },
  creator_payout_preferences: {
    from: "referral_payout_preferences s JOIN referral_partners p ON p.id=s.partner_id",
    where: "p.user_id=$1 AND s.updated_at<=$3::timestamptz",
    id: "s.programme_id",
    columns:
      "s.programme_id AS id,s.revision,s.method,s.country,s.currency,s.masked_destination,s.updated_at"
  },
  creator_payout_instruction_history: {
    from: "referral_payout_instructions s JOIN referral_payout_batches b ON b.id=s.batch_id JOIN referral_partners p ON p.id=b.partner_id",
    where: "p.user_id=$1 AND s.captured_at<=$3::timestamptz",
    id: "s.batch_id",
    columns:
      "s.batch_id AS id,s.programme_id,s.preference_revision,s.method,s.country,s.currency,s.masked_destination,s.captured_at"
  },
  creator_programmes: {
    from: "offer_creator_memberships m JOIN referral_partners p ON p.id=m.partner_id JOIN offer_programme_versions v ON v.id=m.version_id",
    where: "p.user_id=$1 AND m.accepted_at<=$3::timestamptz",
    id: "m.version_id",
    columns:
      "m.version_id AS id,m.partner_id,m.terms_version,m.accepted_at,m.preferred,v.name,v.public_description,v.policy"
  },
  creator_codes: {
    from: "offer_codes c JOIN referral_partners p ON p.id=c.partner_id",
    where: "p.user_id=$1 AND c.created_at<=$3::timestamptz",
    id: "c.id",
    columns: "c.id,c.code,c.kind,c.blocked,c.preferred,c.created_at"
  },
  customer_offers: {
    from: "offer_claims c JOIN offer_codes code ON code.id=c.code_id JOIN offer_programme_versions v ON v.id=c.version_id",
    where: "c.owner_user_id=$1 AND c.organization_id=$2 AND c.claimed_at<=$3::timestamptz",
    id: "c.id",
    columns:
      "c.id,code.code,c.source,c.performance,c.claimed_at,c.redeem_by,c.revoked_at,(c.checkout_attempt_id IS NOT NULL) AS checkout_reserved,(c.eligible_invoice_id IS NOT NULL) AS used,v.id AS version_id,v.name,v.policy"
  },
  offer_claim_history: {
    from: "offer_claim_history h JOIN offer_claims c ON c.id=h.claim_id JOIN offer_codes code ON code.id=h.code_id JOIN offer_programme_versions v ON v.id=h.version_id",
    where: "c.owner_user_id=$1 AND c.organization_id=$2 AND h.recorded_at<=$3::timestamptz",
    id: "h.id",
    columns:
      "h.id,h.claim_id,h.action,code.code,h.version_id,v.policy,h.recorded_at,CASE WHEN h.actor_user_id=$1 THEN 'customer' ELSE 'operator' END AS actor_type"
  },
  offer_signup_intents: {
    from: "offer_signup_intents i",
    where: "i.user_id=$1 AND i.organization_id=$2 AND i.created_at<=$3::timestamptz",
    id: "i.id",
    columns: "i.id,i.code,i.status,i.expires_at,i.created_at"
  },
  offer_early_purchase_grants: {
    from: "offer_early_purchase_grants g JOIN offer_claims c ON c.id=g.claim_id",
    where: "c.owner_user_id=$1 AND c.organization_id=$2 AND g.created_at<=$3::timestamptz",
    id: "g.id",
    columns:
      "g.id,g.claim_id,g.expires_at,g.revoked_at,g.created_at,(g.checkout_attempt_id IS NOT NULL) AS admitted_checkout"
  }
} as const;
export function isOfferExportSection(
  section: string
): section is (typeof OFFER_ACCOUNT_EXPORT_SECTIONS)[number] {
  return sectionSchema.safeParse(section).success;
}
/** Caller checks browser-Owner authority before and after egress. Static
 * projections deliberately exclude identity hashes, provider IDs, credentials,
 * other customers, operator reasons and temporary authorisation hashes. */
export async function readOfferAccountExport(
  db: Queryable,
  input: {
    section: (typeof OFFER_ACCOUNT_EXPORT_SECTIONS)[number];
    user_id: string;
    organization_id: string;
    as_of: string;
    after: string | null;
    limit: number;
  }
): Promise<{ items: Record<string, unknown>[]; next: string | null }> {
  if (input.after !== null && !z.uuid().safeParse(input.after).success)
    throw new Error("invalid_account_export_cursor");
  const config = projections[input.section];
  const rows = (
    await db.query(
      `SELECT ${config.columns} FROM ${config.from} WHERE ${config.where} AND $2::uuid IS NOT NULL AND ($4::uuid IS NULL OR ${config.id}>$4::uuid) ORDER BY ${config.id} LIMIT $5`,
      [input.user_id, input.organization_id, input.as_of, input.after, input.limit + 1]
    )
  ).rows;
  const items = rows
    .slice(0, input.limit)
    .map((row) => z.record(z.string(), z.unknown()).parse(JSON.parse(JSON.stringify(row))));
  return { items, next: rows.length > input.limit ? z.uuid().parse(items.at(-1)!["id"]) : null };
}
