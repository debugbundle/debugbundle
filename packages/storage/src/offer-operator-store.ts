import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  OfferDelegationIssueSchema,
  OfferOperatorActionSchema,
  isOfferOperatorAllowed,
  type OfferOperatorAction
} from "../../referrals/src/offer-operator-contracts.js";
import { ProgrammeError } from "../../referrals/src/programme-policy.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

const hash = (proof: string): string => createHash("sha256").update(proof).digest("hex");
/** Delegation is supplemental to a live unrestricted member credential and the
 * issuing email-authenticated session. It grants only named offer operations. */
export interface OfferOperatorStore {
  isAllowed(this: void, email: string): boolean;
  issue(
    raw: z.infer<typeof OfferDelegationIssueSchema> & { user_id: string; session_id: string }
  ): Promise<{ proof: string; expires_at: string; actions: OfferOperatorAction[] }>;
  authorize(raw: {
    bearer_token: string;
    proof: string;
    action: OfferOperatorAction;
  }): Promise<{ user_id: string; organization_id: string } | null>;
  revoke(input: { user_id: string; proof: string }): Promise<void>;
}
export function createOfferOperatorStore(
  db: Queryable,
  allowedEmails: readonly string[]
): OfferOperatorStore {
  const allowed = new Set(allowedEmails.map((e) => e.trim().toLowerCase()));
  return {
    isAllowed: (email: string) => isOfferOperatorAllowed(email, allowed),
    async issue(
      raw: z.infer<typeof OfferDelegationIssueSchema> & { user_id: string; session_id: string }
    ) {
      const input = OfferDelegationIssueSchema.extend({
        user_id: z.uuid(),
        session_id: z.uuid()
      }).parse(raw);
      return runInTransaction(db, async (tx) => {
        const row = (
          await tx.query<{ email: string }>(
            `SELECT u.email FROM users u JOIN sessions s ON s.user_id=u.id
          JOIN member_tokens t ON t.user_id=u.id AND t.organization_id=s.organization_id
          JOIN organizations o ON o.id=s.organization_id AND o.suspended_at IS NULL
          JOIN organization_members m ON m.organization_id=o.id AND m.user_id=u.id AND m.suspended_at IS NULL
          WHERE u.id=$1 AND u.email_verified_at IS NOT NULL
          AND s.id=$2 AND s.auth_method='email_code' AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
          AND t.id=$3 AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at>clock_timestamp()) AND t.scope_policy IS NULL FOR SHARE OF u,s,t,o,m`,
            [input.user_id, input.session_id, input.member_token_id]
          )
        ).rows[0];
        if (!row || !isOfferOperatorAllowed(row.email, allowed))
          throw new ProgrammeError("operator_authorization_required");
        const proof = randomBytes(32).toString("base64url"),
          expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
        await tx.query(
          "INSERT INTO offer_operator_delegations(proof_hash,user_id,member_token_id,session_id,actions,expires_at) VALUES($1,$2,$3,$4,$5::jsonb,$6)",
          [
            hash(proof),
            input.user_id,
            input.member_token_id,
            input.session_id,
            JSON.stringify(input.actions),
            expiresAt
          ]
        );
        return { proof, expires_at: expiresAt, actions: input.actions };
      });
    },
    async authorize(raw: {
      bearer_token: string;
      proof: string;
      action: OfferOperatorAction;
    }): Promise<{ user_id: string; organization_id: string } | null> {
      const input = z
        .object({
          bearer_token: z.string().min(1).max(4096),
          proof: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
          action: OfferOperatorActionSchema
        })
        .strict()
        .safeParse(raw);
      if (!input.success) return null;
      const row = (
        await db.query<{ user_id: string; organization_id: string; email: string }>(
          `SELECT d.user_id,s.organization_id,u.email
        FROM offer_operator_delegations d JOIN member_tokens t ON t.id=d.member_token_id AND t.user_id=d.user_id
        JOIN sessions s ON s.id=d.session_id AND s.user_id=d.user_id JOIN users u ON u.id=d.user_id
        JOIN organizations o ON o.id=s.organization_id JOIN organization_members m ON m.organization_id=o.id AND m.user_id=d.user_id
        WHERE d.proof_hash=$1 AND t.token_hash=$2 AND d.revoked_at IS NULL AND d.expires_at>clock_timestamp()
        AND d.actions ? $3 AND t.organization_id=s.organization_id AND t.scope_policy IS NULL AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at>clock_timestamp())
        AND s.auth_method='email_code' AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND u.email_verified_at IS NOT NULL
        AND m.suspended_at IS NULL AND o.suspended_at IS NULL`,
          [hash(input.data.proof), hash(input.data.bearer_token), input.data.action]
        )
      ).rows[0];
      return row && isOfferOperatorAllowed(row.email, allowed)
        ? { user_id: row.user_id, organization_id: row.organization_id }
        : null;
    },
    async revoke(input: { user_id: string; proof: string }): Promise<void> {
      z.uuid().parse(input.user_id);
      z.string()
        .regex(/^[A-Za-z0-9_-]{43}$/)
        .parse(input.proof);
      await db.query(
        "UPDATE offer_operator_delegations SET revoked_at=COALESCE(revoked_at,now()) WHERE proof_hash=$1 AND user_id=$2",
        [hash(input.proof), input.user_id]
      );
    }
  };
}
