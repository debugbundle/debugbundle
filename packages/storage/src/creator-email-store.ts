import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  CreatorEmailPayloadSchema,
  type CreatorEmailPayload
} from "../../referrals/src/creator-email-contracts.js";
import { queueCreatorEmail } from "./creator-email-events.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

/** UTC windows are sealed under the exclusive epoch lock; event writers take
 * its shared lock before any financial/user locks. Only committed events enter
 * a digest. Event assignment and the immutable mail snapshot commit together. */
export async function scheduleCreatorDigests(db: Queryable): Promise<number> {
  return runInTransaction(db, async (tx) => {
    await tx.query("SET LOCAL statement_timeout='10s'", []);
    await tx.query("SET LOCAL lock_timeout='1s'", []);
    const state = (
      await tx.query<{ digest_window_end: string; due: boolean }>(
        `SELECT digest_window_end::text,digest_window_end<=clock_timestamp() AS due
       FROM referral_creator_email_state WHERE id FOR UPDATE SKIP LOCKED`,
        []
      )
    ).rows[0];
    if (!state?.due) return 0;
    const end = new Date(state.digest_window_end).toISOString();
    const start = new Date(Date.parse(end) - 86400000).toISOString();
    const partners = (
      await tx.query<{ partner_id: string; user_id: string | null }>(
        `SELECT DISTINCT e.partner_id,p.user_id FROM referral_creator_email_events e
       JOIN referral_partners p ON p.id=e.partner_id
       WHERE NOT e.first_in_programme AND e.digest_id IS NULL AND e.created_at>=$1 AND e.created_at<$2
       ORDER BY e.partner_id LIMIT 50`,
        [start, end]
      )
    ).rows;
    for (const partner of partners) {
      const rows = (
        await tx.query<{
          programme_id: string;
          name: string;
          new_referrals: string;
          pending_commission_minor: string;
        }>(
          `SELECT programme_id,(array_agg(name ORDER BY created_at DESC,id DESC))[1] AS name,
         count(*)::text AS new_referrals,sum(commission_minor)::text AS pending_commission_minor
         FROM referral_creator_email_events WHERE partner_id=$1 AND NOT first_in_programme
         AND digest_id IS NULL AND created_at>=$2 AND created_at<$3 GROUP BY programme_id ORDER BY programme_id`,
          [partner.partner_id, start, end]
        )
      ).rows.map((r) => ({
        ...r,
        new_referrals: Number(r.new_referrals),
        pending_commission_minor: Number(r.pending_commission_minor)
      }));
      const payload: CreatorEmailPayload = {
        kind: "daily_digest",
        window_start: start,
        window_end: end,
        sections: rows.slice(0, 25),
        other_programmes: Math.max(0, rows.length - 25),
        total_referrals: rows.reduce((n, r) => n + r.new_referrals, 0),
        total_commission_minor: rows.reduce((n, r) => n + r.pending_commission_minor, 0)
      };
      const id = await queueCreatorEmail(tx, { ...partner, dedupe_key: end, payload });
      await tx.query(
        `UPDATE referral_creator_email_events SET digest_id=$4 WHERE partner_id=$1
        AND NOT first_in_programme AND digest_id IS NULL AND created_at>=$2 AND created_at<$3`,
        [partner.partner_id, start, end, id]
      );
    }
    if (partners.length < 50)
      await tx.query(
        "UPDATE referral_creator_email_state SET digest_window_end=digest_window_end+interval '1 day' WHERE id",
        []
      );
    return partners.length;
  });
}

export type CreatorEmailClaim = {
  id: string;
  token: string;
  attempt: number;
  payload: CreatorEmailPayload;
};
export interface CreatorEmailStore {
  schedule(): Promise<number>;
  claim(): Promise<CreatorEmailClaim | null>;
  start(claim: CreatorEmailClaim): Promise<string | null>;
  finish(
    claim: CreatorEmailClaim,
    result: { state: "sent" | "rejected" | "uncertain"; provider_message_id?: string | null }
  ): Promise<void>;
}
export function createCreatorEmailStore(db: Queryable): CreatorEmailStore {
  return {
    schedule: () => scheduleCreatorDigests(db),
    async claim(): Promise<CreatorEmailClaim | null> {
      return runInTransaction(db, async (tx) => {
        await tx.query(
          `WITH stale AS (SELECT id FROM referral_creator_email_deliveries
          WHERE status IN ('claimed','sending') AND lease_until<=clock_timestamp()
          ORDER BY lease_until,id LIMIT 100 FOR UPDATE SKIP LOCKED)
          UPDATE referral_creator_email_deliveries d SET status=CASE WHEN d.status='sending' THEN 'uncertain' ELSE 'queued' END,
          reason=CASE WHEN d.status='sending' THEN 'send_acknowledgement_missing' ELSE 'claim_expired' END,
          token=NULL,lease_until=NULL FROM stale WHERE d.id=stale.id`,
          []
        );
        await tx.query(
          `WITH expired AS (SELECT id FROM referral_creator_email_deliveries
          WHERE status='queued' AND (created_at<clock_timestamp()-interval '7 days'
            OR (kind='daily_digest' AND (payload->>'window_end')::timestamptz<clock_timestamp()-interval '24 hours'))
          LIMIT 100 FOR UPDATE SKIP LOCKED)
          UPDATE referral_creator_email_deliveries d SET status='skipped',reason='notification_expired'
          FROM expired WHERE d.id=expired.id`,
          []
        );
        const token = randomUUID();
        const row = (
          await tx.query<{ id: string; token: string; attempt: number; payload: unknown }>(
            `WITH due AS (SELECT id FROM referral_creator_email_deliveries WHERE status='queued' AND next_attempt_at<=clock_timestamp()
           ORDER BY CASE kind WHEN 'joined' THEN 0 WHEN 'first_purchase' THEN 1 ELSE 2 END,created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED)
           UPDATE referral_creator_email_deliveries d SET status='claimed',token=$1,attempt=attempt+1,lease_until=clock_timestamp()+interval '2 minutes'
           FROM due WHERE d.id=due.id RETURNING d.id,d.token,d.attempt,d.payload`,
            [token]
          )
        ).rows[0];
        if (!row) return null;
        const parsed = CreatorEmailPayloadSchema.safeParse(row.payload);
        if (!parsed.success) {
          await tx.query(
            "UPDATE referral_creator_email_deliveries SET status='failed',reason='invalid_payload',token=NULL,lease_until=NULL WHERE id=$1",
            [row.id]
          );
          return null;
        }
        return { ...row, payload: parsed.data };
      });
    },
    async start(claim: CreatorEmailClaim): Promise<string | null> {
      z.uuid().parse(claim.id);
      z.uuid().parse(claim.token);
      return runInTransaction(db, async (tx) => {
        const row = (
          await tx.query<{ email: string; user_id: string; fresh: boolean }>(
            `SELECT u.email,u.id AS user_id,
             (d.kind<>'daily_digest' OR EXISTS(SELECT 1 FROM referral_creator_email_events e
               WHERE e.digest_id=d.id AND e.created_at>=clock_timestamp()-interval '24 hours')) AS fresh
             FROM referral_creator_email_deliveries d
           JOIN referral_partners p ON p.id=d.partner_id AND p.user_id=d.user_id
           JOIN users u ON u.id=d.user_id AND u.email_verified_at IS NOT NULL
           WHERE d.id=$1 AND d.token=$2 AND d.status='claimed' AND d.lease_until>clock_timestamp()
           FOR SHARE OF u,p`,
            [claim.id, claim.token]
          )
        ).rows[0];
        if (!row || !z.email().safeParse(row.email).success) {
          await tx.query(
            "UPDATE referral_creator_email_deliveries SET status='skipped',reason='recipient_unavailable',token=NULL,lease_until=NULL WHERE id=$1 AND token=$2 AND status='claimed'",
            [claim.id, claim.token]
          );
          return null;
        }
        if (!row.fresh) {
          await tx.query(
            "UPDATE referral_creator_email_deliveries SET status='skipped',reason='no_recent_referrals',token=NULL,lease_until=NULL WHERE id=$1 AND token=$2 AND status='claimed'",
            [claim.id, claim.token]
          );
          return null;
        }
        const sent = await tx.query(
          `UPDATE referral_creator_email_deliveries SET status='sending',lease_until=clock_timestamp()+interval '2 minutes'
          WHERE id=$1 AND token=$2 AND status='claimed' AND lease_until>clock_timestamp() RETURNING id`,
          [claim.id, claim.token]
        );
        return sent.rows.length ? row.email : null;
      });
    },
    async finish(
      claim: CreatorEmailClaim,
      result: { state: "sent" | "rejected" | "uncertain"; provider_message_id?: string | null }
    ): Promise<void> {
      const provider = z
        .string()
        .regex(/^[A-Za-z0-9:_-]{1,255}$/)
        .nullish()
        .parse(result.provider_message_id);
      await db.query(
        `UPDATE referral_creator_email_deliveries SET
        status=CASE WHEN $3='sent' THEN 'sent' WHEN $3='uncertain' THEN 'uncertain' WHEN attempt>=5 THEN 'failed' ELSE 'queued' END,
        reason=CASE WHEN $3='sent' THEN NULL ELSE $3 END,
        sent_at=CASE WHEN $3='sent' THEN clock_timestamp() ELSE NULL END,provider_message_id=$4,
        next_attempt_at=clock_timestamp()+make_interval(secs=>LEAST(3600,30*power(4,LEAST(attempt-1,4)))::integer),
        token=NULL,lease_until=NULL WHERE id=$1 AND token=$2 AND status='sending'`,
        [claim.id, claim.token, result.state, provider ?? null]
      );
    }
  };
}
