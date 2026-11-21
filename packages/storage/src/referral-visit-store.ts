import type { ReferralVisit } from "../../referrals/src/referral-visit-receipts.js";
import type { Queryable } from "./types.js";

export async function recordReferralVisit(db: Queryable, visit: ReferralVisit): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO referral_link_visits (receipt_id, code_id, visited_at)
      SELECT $1, c.id, $3 FROM offer_codes c
      JOIN referral_partners p ON p.id=c.partner_id
      JOIN users u ON u.id=p.user_id
      WHERE c.code=$2 AND NOT c.blocked AND p.status='active' AND u.email_verified_at IS NOT NULL
      ON CONFLICT (receipt_id) DO NOTHING RETURNING receipt_id`,
    [visit.id, visit.code, new Date(visit.startedAt).toISOString()]
  );
  return result.rows.length > 0;
}
