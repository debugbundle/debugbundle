import { z } from "zod";
import {
  PublicOfferCodeSchema,
  type ProgrammeVersion
} from "../../referrals/src/programme-policy.js";
import { mapOfferVersion, versionColumns } from "./offer-store-helpers.js";
import type { Queryable } from "./types.js";

export async function resolveOfferCode(
  db: Queryable,
  raw: string
): Promise<{
  code_id: string;
  code: string;
  partner_id: string | null;
  partner_user_id: string | null;
  version: ProgrammeVersion;
} | null> {
  const code = PublicOfferCodeSchema.parse(raw);
  const row = (
    await db.query(
      `SELECT c.id AS code_id,c.code,c.partner_id,p.user_id AS partner_user_id,${versionColumns}
    FROM offer_codes c LEFT JOIN referral_partners p ON p.id=c.partner_id
    LEFT JOIN users u ON u.id=p.user_id
    LEFT JOIN offer_creator_memberships m ON m.partner_id=p.id AND m.preferred
    JOIN offer_programme_versions v ON v.id=COALESCE(c.version_id,m.version_id)
    JOIN offer_programmes programme ON programme.id=v.programme_id AND programme.current_version_id=v.id
    WHERE c.code=$1 AND NOT c.blocked AND (c.kind='promotion' OR (p.status='active' AND u.email_verified_at IS NOT NULL))`,
      [code]
    )
  ).rows[0];
  if (!row) return null;
  const { code_id, partner_id, partner_user_id, code: canonical, ...version } = row;
  return {
    code_id: z.uuid().parse(code_id),
    code: PublicOfferCodeSchema.parse(canonical),
    partner_id: partner_id === null ? null : z.uuid().parse(partner_id),
    partner_user_id: partner_user_id === null ? null : z.uuid().parse(partner_user_id),
    version: mapOfferVersion(version)
  };
}
