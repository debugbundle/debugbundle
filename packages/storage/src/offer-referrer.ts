import { REFERRAL_TERMS_VERSION } from "../../referrals/src/referral-contracts.js";
import {
  programmeAcceptsClaims,
  type ProgrammeVersion
} from "../../referrals/src/programme-policy.js";
import { resolveOfferCode } from "./offer-code-resolver.js";
import type { Queryable } from "./types.js";

export interface OfferReferrer {
  code_id: string;
  partner_id: string;
  partner_user_id: string;
  version: ProgrammeVersion | null;
}
/** Resolve attribution separately from the selected discount. Null version keeps
 * the original Business-only legacy commission contract, never a new agreement. */
export async function resolveOfferReferrer(
  db: Queryable,
  code: string
): Promise<OfferReferrer | null> {
  const versioned = await resolveOfferCode(db, code);
  if (versioned)
    return versioned.partner_id &&
      versioned.partner_user_id &&
      versioned.version.policy.kind === "referral" &&
      programmeAcceptsClaims(
        versioned.version.policy,
        versioned.version.state,
        versioned.version.claims_count,
        Date.now()
      )
      ? {
          ...versioned,
          partner_id: versioned.partner_id,
          partner_user_id: versioned.partner_user_id
        }
      : null;
  const row = (
    await db.query<{ code_id: string; partner_id: string; partner_user_id: string }>(
      `SELECT c.id AS code_id,p.id AS partner_id,p.user_id AS partner_user_id
      FROM offer_codes c JOIN referral_partners p ON p.id=c.partner_id JOIN users u ON u.id=p.user_id
      WHERE c.code=$1 AND c.kind='legacy' AND NOT c.blocked AND p.status='active' AND p.terms_version=$2 AND u.email_verified_at IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM offer_creator_memberships m WHERE m.partner_id=p.id)`,
      [code, REFERRAL_TERMS_VERSION]
    )
  ).rows[0];
  return row ? { ...row, version: null } : null;
}
