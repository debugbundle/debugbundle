import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  REFERRAL_TERMS_VERSION,
  ReferralCodeSchema,
  ReferralPartnerSchema,
  CustomerReferralSchema,
  ReferralClientSchema,
  ReferralError,
  type ReferralPartner,
  type CustomerReferral,
  type ReferralClient
} from "../../referrals/src/referral-contracts.js";
import type { Queryable } from "./types.js";
import { runInTransaction } from "./transaction.js";
import { isCurrentBillingOwner } from "./billing-owner.js";

const ActorSchema = z.object({ organization_id: z.uuid(), actor_user_id: z.uuid() });
const SaveAttributionSchema = ActorSchema.extend({
  code: ReferralCodeSchema,
  source: z.enum(["link", "manual"]),
  explicit_correction: z.boolean(),
  // These are trusted provider-adapter facts, never customer request fields.
  provider_customer_id_checked: z.string().min(1).max(255).nullable(),
  provider_previously_paid: z.boolean()
}).strict();
type SaveAttribution = z.infer<typeof SaveAttributionSchema>;
type Actor = z.infer<typeof ActorSchema>;
type PartnerRow = {
  partner_id: string;
  code: string;
  status: string;
  terms_version: string;
  commission_basis_points: number;
  accepted_at: string;
} & Record<string, unknown>;
type AttributionRow = {
  referral_id: string;
  partner_id: string;
  partner_code: string;
  source: string;
  reserved_checkout_attempt_id: string | null;
} & Record<string, unknown>;
const partnerColumns =
  "id AS partner_id,code,status,terms_version,commission_basis_points,accepted_at::text AS accepted_at";
const attributionColumns =
  "a.id AS referral_id,a.partner_id,p.code AS partner_code,a.source,a.reserved_checkout_attempt_id";
export interface ReferralStore {
  joinProgram(input: { user_id: string; terms_version: string }): Promise<ReferralPartner>;
  getPartner(input: { user_id: string }): Promise<ReferralPartner | null>;
  isActiveCode(code: string): Promise<boolean>;
  saveAttribution(input: SaveAttribution): Promise<CustomerReferral>;
  getAttribution(input: Actor): Promise<CustomerReferral | null>;
  listPartnerClients(input: {
    user_id: string;
    limit: number;
    before?: string;
  }): Promise<ReferralClient[]>;
}
function mapPartner(row: PartnerRow): ReferralPartner {
  return ReferralPartnerSchema.parse({
    ...row,
    accepted_at: new Date(row.accepted_at).toISOString()
  });
}
function mapAttribution(row: AttributionRow): CustomerReferral {
  return CustomerReferralSchema.parse({
    referral_id: row.referral_id,
    partner_code: row.partner_code,
    source: row.source,
    checkout_reserved: row.reserved_checkout_attempt_id !== null
  });
}
async function verifiedEmail(db: Queryable, userId: string, lock = false): Promise<string> {
  const row = (
    await db.query<{ email: string; email_verified_at: string | null }>(
      `SELECT email,email_verified_at::text FROM users WHERE id=$1::uuid${lock ? " FOR SHARE" : ""}`,
      [userId]
    )
  ).rows[0];
  if (!row) throw new ReferralError("forbidden");
  if (row.email_verified_at === null) throw new ReferralError("email_verification_required");
  return row.email;
}
async function lockCustomerOwner(
  db: Queryable,
  input: Actor,
  write: boolean
): Promise<{ customer_id: string | null; email: string }> {
  const row = (
    await db.query<{ customer_id: string | null }>(
      `SELECT stripe_customer_id AS customer_id FROM organizations WHERE id=$1::uuid AND suspended_at IS NULL FOR ${write ? "UPDATE" : "SHARE"}`,
      [input.organization_id]
    )
  ).rows[0];
  // Resolve membership after any lock wait, using a fresh statement snapshot.
  if (!row || !(await isCurrentBillingOwner(db, input.organization_id, input.actor_user_id)))
    throw new ReferralError("forbidden");
  return {
    customer_id: row.customer_id,
    email: await verifiedEmail(db, input.actor_user_id, true)
  };
}
function newCode(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  return Array.from(randomBytes(10), (value) => alphabet[value & 31]).join("");
}
/** Partner identity is independent of the selected workspace. Financial history
 * deliberately has no cascading account FK; it contains no plaintext email. */
export function createReferralStore(
  db: Queryable,
  options: { identityHashSecret: string }
): ReferralStore {
  const secret = z.string().min(32).max(4096).parse(options.identityHashSecret);
  const identityHash = (email: string): string =>
    createHmac("sha256", secret)
      .update(`referral-customer:v1:${email.trim().toLowerCase()}`)
      .digest("hex");
  return {
    async joinProgram(raw) {
      const input = z
        .object({ user_id: z.uuid(), terms_version: z.string().max(100) })
        .strict()
        .parse(raw);
      if (input.terms_version !== REFERRAL_TERMS_VERSION) throw new ReferralError("terms_mismatch");
      return runInTransaction(db, async (tx) => {
        await tx.query("SELECT id FROM users WHERE id=$1::uuid FOR UPDATE", [input.user_id]);
        await verifiedEmail(tx, input.user_id);
        const existing = (
          await tx.query<PartnerRow>(
            `SELECT ${partnerColumns} FROM referral_partners WHERE user_id=$1::uuid`,
            [input.user_id]
          )
        ).rows[0];
        if (existing) return mapPartner(existing);
        for (let attempt = 0; attempt < 3; attempt++) {
          const row = (
            await tx.query<PartnerRow>(
              `INSERT INTO referral_partners(id,user_id,code,terms_version,commission_basis_points,identity_hash)
            VALUES($1,$2,$3,$4,5000,$5) ON CONFLICT DO NOTHING RETURNING ${partnerColumns}`,
              [
                randomUUID(),
                input.user_id,
                newCode(),
                REFERRAL_TERMS_VERSION,
                createHmac("sha256", secret)
                  .update(
                    `referral-partner:v1:${(await verifiedEmail(tx, input.user_id)).trim().toLowerCase()}`
                  )
                  .digest("hex")
              ]
            )
          ).rows[0];
          if (row) return mapPartner(row);
        }
        throw new ReferralError("program_unavailable");
      });
    },
    async getPartner(raw) {
      const input = z.object({ user_id: z.uuid() }).strict().parse(raw);
      await verifiedEmail(db, input.user_id);
      const row = (
        await db.query<PartnerRow>(
          `SELECT ${partnerColumns} FROM referral_partners WHERE user_id=$1::uuid
        AND EXISTS(SELECT 1 FROM users WHERE id=$1::uuid AND email_verified_at IS NOT NULL)`,
          [input.user_id]
        )
      ).rows[0];
      return row ? mapPartner(row) : null;
    },
    async isActiveCode(raw) {
      const code = ReferralCodeSchema.safeParse(raw);
      if (!code.success) return false;
      return (
        (
          await db.query(
            `SELECT p.id FROM referral_partners p JOIN users u ON u.id=p.user_id
        WHERE p.code=$1 AND p.status='active' AND u.email_verified_at IS NOT NULL`,
            [code.data]
          )
        ).rows.length === 1
      );
    },
    async getAttribution(raw) {
      const input = ActorSchema.strict().parse(raw);
      return runInTransaction(db, async (tx) => {
        await lockCustomerOwner(tx, input, false);
        const row = (
          await tx.query<AttributionRow>(
            `SELECT ${attributionColumns} FROM referral_attributions a JOIN referral_partners p ON p.id=a.partner_id
          WHERE a.organization_id=$1::uuid`,
            [input.organization_id]
          )
        ).rows[0];
        return row ? mapAttribution(row) : null;
      });
    },
    async saveAttribution(raw) {
      const input = SaveAttributionSchema.parse(raw);
      return runInTransaction(db, async (tx) => {
        const owner = await lockCustomerOwner(tx, input, true);
        if (owner.customer_id !== input.provider_customer_id_checked)
          throw new ReferralError("billing_state_changed");
        const partner = (
          await tx.query<{ id: string; user_id: string }>(
            `SELECT p.id,p.user_id FROM referral_partners p JOIN users u ON u.id=p.user_id
          WHERE p.code=$1 AND p.status='active' AND u.email_verified_at IS NOT NULL`,
            [input.code]
          )
        ).rows[0];
        if (!partner) throw new ReferralError("invalid_referral_code");
        if (partner.user_id === input.actor_user_id) throw new ReferralError("referral_self_claim");
        const current = (
          await tx.query<AttributionRow>(
            `SELECT ${attributionColumns} FROM referral_attributions a JOIN referral_partners p ON p.id=a.partner_id
          WHERE a.organization_id=$1::uuid FOR UPDATE OF a`,
            [input.organization_id]
          )
        ).rows[0];
        if (current?.partner_id === partner.id) return mapAttribution(current);
        const reserved =
          current?.reserved_checkout_attempt_id != null ||
          (
            await tx.query(
              "SELECT id FROM billing_checkout_attempts WHERE organization_id=$1::uuid",
              [input.organization_id]
            )
          ).rows.length > 0;
        if (reserved) throw new ReferralError("attribution_frozen");
        const hash = identityHash(owner.email);
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `referral-benefit:${hash}`
        ]);
        if (
          (
            await tx.query(
              "SELECT attribution_id FROM referral_invoice_benefits WHERE owner_identity_hash=$1 AND attribution_id IS DISTINCT FROM $2::uuid",
              [hash, current?.referral_id ?? null]
            )
          ).rows.length
        )
          throw new ReferralError("ineligible_customer");
        const previous = await tx.query(
          "SELECT organization_external_id FROM billing_customer_history WHERE organization_external_id=$1::uuid OR owner_identity_hash=$2 LIMIT 1",
          [input.organization_id, hash]
        );
        if (input.provider_previously_paid || previous.rows.length)
          throw new ReferralError("ineligible_customer");
        if (current && !input.explicit_correction)
          throw new ReferralError("attribution_change_requires_confirmation");
        const id = current?.referral_id ?? randomUUID();
        await tx.query(
          `INSERT INTO referral_attributions(id,partner_id,organization_id,organization_external_id,owner_identity_hash,source)
          VALUES($1,$2,$3,$3,$4,$5) ON CONFLICT(organization_external_id) DO UPDATE
          SET partner_id=EXCLUDED.partner_id,owner_identity_hash=EXCLUDED.owner_identity_hash,source=EXCLUDED.source,updated_at=now()`,
          [id, partner.id, input.organization_id, hash, input.source]
        );
        return CustomerReferralSchema.parse({
          referral_id: id,
          partner_code: input.code,
          source: input.source,
          checkout_reserved: false
        });
      });
    },
    async listPartnerClients(raw) {
      const input = z
        .object({
          user_id: z.uuid(),
          limit: z.number().int().min(1).max(100),
          before: z.uuid().optional()
        })
        .strict()
        .parse(raw);
      await verifiedEmail(db, input.user_id);
      const result = await db.query<{ client_id: string; created_at: string; status: string }>(
        `SELECT a.id AS client_id,a.created_at::text,CASE
          WHEN period.attribution_id IS NULL THEN 'awaiting_purchase'
          WHEN period.status='ineligible' THEN 'ineligible'
          WHEN (((period.first_paid_service_starts_at AT TIME ZONE 'UTC')+interval '12 months') AT TIME ZONE 'UTC')<=now() THEN 'commission_period_ended'
          ELSE 'commission_period_active' END AS status
        FROM referral_attributions a JOIN referral_partners p ON p.id=a.partner_id JOIN users u ON u.id=p.user_id
        LEFT JOIN referral_commission_periods period ON period.attribution_id=a.id
        WHERE p.user_id=$1::uuid AND u.email_verified_at IS NOT NULL AND ($3::uuid IS NULL OR (a.created_at,a.id)<(
          SELECT cursor.created_at,cursor.id FROM referral_attributions cursor WHERE cursor.id=$3::uuid AND cursor.partner_id=p.id))
        ORDER BY a.created_at DESC,a.id DESC LIMIT $2`,
        [input.user_id, input.limit, input.before ?? null]
      );
      return result.rows.map((row) =>
        ReferralClientSchema.parse({
          ...row,
          created_at: new Date(row.created_at).toISOString()
        })
      );
    }
  };
}
