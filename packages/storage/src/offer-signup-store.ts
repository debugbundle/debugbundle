import { REFERRAL_TERMS_VERSION } from "../../referrals/src/referral-contracts.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PublicOfferCodeSchema } from "../../referrals/src/programme-policy.js";
import { OfferActorSchema, type OfferActor } from "./offer-store-helpers.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

export const SignupOfferHintSchema = z
  .object({ code: PublicOfferCodeSchema, expires_at: z.string().datetime() })
  .strict();
/** Local write in the same transaction as new-account creation. It performs no
 * programme/provider lookup and cannot attach a later visitor to an old account. */
export async function saveSignupOfferIntent(
  tx: Queryable,
  input: { organization_id: string; user_id: string; hint: z.infer<typeof SignupOfferHintSchema> }
): Promise<void> {
  const hint = SignupOfferHintSchema.parse(input.hint);
  if (Date.parse(hint.expires_at) <= Date.now()) return;
  await tx.query(
    `INSERT INTO offer_signup_intents(id,organization_id,user_id,code,expires_at)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,user_id) DO NOTHING`,
    [randomUUID(), input.organization_id, input.user_id, hint.code, hint.expires_at]
  );
}
export interface OfferSignupStore {
  nextDueActor(input: {
    new_programmes_enabled: boolean;
    legacy_enabled: boolean;
  }): Promise<OfferActor | null>;
  read(
    raw: OfferActor
  ): Promise<{ status: "pending" | "completed" | "rejected" | "expired"; code: string } | null>;
  take(raw: OfferActor): Promise<{ code: string; intent_id: string } | null>;
  complete(intentId: string, outcome: "completed" | "rejected" | "retry"): Promise<void>;
}
export function createOfferSignupStore(db: Queryable): OfferSignupStore {
  return {
    async nextDueActor(input) {
      const row = (
        await db.query<{ organization_id: string; actor_user_id: string }>(
          `SELECT i.organization_id,i.user_id AS actor_user_id FROM offer_signup_intents i
 JOIN users u ON u.id=i.user_id AND u.email_verified_at IS NOT NULL
 JOIN organizations o ON o.id=i.organization_id AND o.suspended_at IS NULL
 JOIN organization_members m ON m.organization_id=o.id AND m.user_id=u.id AND m.role='owner' AND m.suspended_at IS NULL
 WHERE i.status='pending' AND i.expires_at>clock_timestamp() AND i.attempts<8 AND i.next_attempt_at<=clock_timestamp()
 AND ($1::boolean OR ($2::boolean AND EXISTS(SELECT 1 FROM referral_partners p JOIN users partner ON partner.id=p.user_id AND partner.email_verified_at IS NOT NULL WHERE p.code=i.code AND p.status='active' AND p.terms_version=$3 AND NOT EXISTS(SELECT 1 FROM offer_codes code WHERE code.code=p.code AND code.blocked) AND NOT EXISTS(SELECT 1 FROM offer_creator_memberships membership WHERE membership.partner_id=p.id))))
 ORDER BY i.next_attempt_at,i.id LIMIT 1`,
          [input.new_programmes_enabled, input.legacy_enabled, REFERRAL_TERMS_VERSION]
        )
      ).rows[0];
      return row ?? null;
    },
    async read(
      raw: OfferActor
    ): Promise<{ status: "pending" | "completed" | "rejected" | "expired"; code: string } | null> {
      const input = OfferActorSchema.parse(raw);
      return (
        (
          await db.query<{
            status: "pending" | "completed" | "rejected" | "expired";
            code: string;
          }>(
            "SELECT status,code FROM offer_signup_intents WHERE organization_id=$1 AND user_id=$2",
            [input.organization_id, input.actor_user_id]
          )
        ).rows[0] ?? null
      );
    },
    async take(raw: OfferActor): Promise<{ code: string; intent_id: string } | null> {
      const input = OfferActorSchema.parse(raw);
      return runInTransaction(db, async (tx) => {
        await tx.query(
          `UPDATE offer_signup_intents SET status='expired' WHERE organization_id=$1 AND user_id=$2 AND status='pending' AND expires_at<=clock_timestamp()`,
          [input.organization_id, input.actor_user_id]
        );
        const row = (
          await tx.query<{ id: string; code: string; attempts: number }>(
            `SELECT id,code,attempts FROM offer_signup_intents
          WHERE organization_id=$1 AND user_id=$2 AND status='pending' AND attempts<8 AND next_attempt_at<=clock_timestamp()
          FOR UPDATE SKIP LOCKED`,
            [input.organization_id, input.actor_user_id]
          )
        ).rows[0];
        if (!row) return null;
        await tx.query(
          "UPDATE offer_signup_intents SET attempts=attempts+1,next_attempt_at=now()+make_interval(secs=>$2) WHERE id=$1",
          [row.id, Math.min(3600, 15 * 2 ** row.attempts)]
        );
        return { code: row.code, intent_id: row.id };
      });
    },
    async complete(intentId: string, outcome: "completed" | "rejected" | "retry"): Promise<void> {
      z.uuid().parse(intentId);
      await db.query(
        `UPDATE offer_signup_intents SET status=CASE WHEN $2='retry' AND attempts<8 THEN 'pending'
        WHEN $2='retry' THEN 'rejected' ELSE $2 END WHERE id=$1 AND status='pending'`,
        [intentId, outcome]
      );
    }
  };
}
