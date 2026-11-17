import { z } from "zod";
import {
  OfferCodeInventoryQuerySchema,
  OfferClaimInventoryQuerySchema,
  OfferGrantInventoryQuerySchema,
  OfferCodeInventoryRecordSchema,
  OfferClaimInventoryRecordSchema,
  OfferGrantInventoryRecordSchema
} from "../../referrals/src/offer-inventory-contracts.js";
import type { Queryable } from "./types.js";
export interface OfferInventoryStore {
  codes(
    input: z.input<typeof OfferCodeInventoryQuerySchema>
  ): Promise<z.infer<typeof OfferCodeInventoryRecordSchema>[]>;
  claims(
    input: z.input<typeof OfferClaimInventoryQuerySchema>
  ): Promise<z.infer<typeof OfferClaimInventoryRecordSchema>[]>;
  grants(
    input: z.input<typeof OfferGrantInventoryQuerySchema>
  ): Promise<z.infer<typeof OfferGrantInventoryRecordSchema>[]>;
}
const iso = (value: unknown): string =>
  new Date(z.union([z.string(), z.date()]).parse(value)).toISOString();
/** Paged operator projections contain only programme-support data. No emails,
 * financial identity hashes, provider IDs or credential material are selected. */
export function createOfferInventoryStore(db: Queryable): OfferInventoryStore {
  return {
    async codes(raw) {
      const input = OfferCodeInventoryQuerySchema.parse(raw);
      const rows = (
        await db.query(
          `SELECT c.id AS code_id,c.code,c.kind,c.partner_id,COALESCE(c.version_id,m.version_id) AS version_id,c.blocked,c.preferred,c.created_at
  FROM offer_codes c LEFT JOIN offer_creator_memberships m ON m.partner_id=c.partner_id AND m.preferred
  WHERE ($1::text IS NULL OR c.code=$1) AND ($2::uuid IS NULL OR c.partner_id=$2) AND ($3::uuid IS NULL OR (c.created_at,c.id)<(SELECT created_at,id FROM offer_codes WHERE id=$3)) ORDER BY c.created_at DESC,c.id DESC LIMIT $4`,
          [input.code ?? null, input.partner_id ?? null, input.before ?? null, input.limit]
        )
      ).rows;
      return rows.map((row) =>
        OfferCodeInventoryRecordSchema.parse({ ...row, created_at: iso(row["created_at"]) })
      );
    },
    async claims(raw) {
      const input = OfferClaimInventoryQuerySchema.parse(raw);
      const rows = (
        await db.query(
          `SELECT c.id AS claim_id,code.code,refcode.code AS referral_code,c.organization_external_id AS organization_id,c.version_id,(c.attribution_id IS NOT NULL AND c.referral_version_id IS NULL) AS legacy_referral,
  CASE WHEN c.eligible_invoice_id IS NOT NULL THEN 'used' WHEN c.revoked_at IS NOT NULL THEN 'revoked' WHEN c.checkout_attempt_id IS NOT NULL THEN 'reserved' WHEN c.redeem_by<=clock_timestamp() THEN 'expired' ELSE 'saved' END AS status,c.claimed_at,c.redeem_by
  FROM offer_claims c JOIN offer_codes code ON code.id=c.code_id LEFT JOIN offer_codes refcode ON refcode.id=c.referral_code_id
  WHERE ($1::text IS NULL OR code.code=$1 OR refcode.code=$1) AND ($2::uuid IS NULL OR c.organization_external_id=$2) AND ($3::uuid IS NULL OR c.version_id=$3) AND ($4::uuid IS NULL OR (c.claimed_at,c.id)<(SELECT claimed_at,id FROM offer_claims WHERE id=$4)) ORDER BY c.claimed_at DESC,c.id DESC LIMIT $5`,
          [
            input.code ?? null,
            input.organization_id ?? null,
            input.version_id ?? null,
            input.before ?? null,
            input.limit
          ]
        )
      ).rows;
      return rows.map((row) =>
        OfferClaimInventoryRecordSchema.parse({
          ...row,
          claimed_at: iso(row["claimed_at"]),
          redeem_by: row["redeem_by"] === null ? null : iso(row["redeem_by"])
        })
      );
    },
    async grants(raw) {
      const input = OfferGrantInventoryQuerySchema.parse(raw);
      const rows = (
        await db.query(
          `SELECT g.id AS grant_id,g.claim_id,code.code,c.organization_external_id AS organization_id,g.operator_user_id,g.reason,g.created_at,g.expires_at,g.revoked_at,(g.checkout_attempt_id IS NOT NULL) AS admitted_checkout
  FROM offer_early_purchase_grants g JOIN offer_claims c ON c.id=g.claim_id JOIN offer_codes code ON code.id=c.code_id
  WHERE ($1::uuid IS NULL OR g.claim_id=$1) AND ($2::uuid IS NULL OR (g.created_at,g.id)<(SELECT created_at,id FROM offer_early_purchase_grants WHERE id=$2)) ORDER BY g.created_at DESC,g.id DESC LIMIT $3`,
          [input.claim_id ?? null, input.before ?? null, input.limit]
        )
      ).rows;
      return rows.map((row) =>
        OfferGrantInventoryRecordSchema.parse({
          ...row,
          created_at: iso(row["created_at"]),
          expires_at: iso(row["expires_at"]),
          revoked_at: row["revoked_at"] === null ? null : iso(row["revoked_at"])
        })
      );
    }
  };
}
