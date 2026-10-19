import { randomUUID } from "node:crypto";
import type { Queryable } from "./types.js";
import { runInTransaction } from "./transaction.js";
import { preserveDailyNotificationUsage } from "./notification-daily-usage.js";
import type { DailyNotificationBatch } from "./notification-daily-store.js";

/** Serialize a recipient/schedule, then combine missed windows before issuing a fenced lease. */
export async function claimDailyNotification(
  db: Queryable,
  now: Date
): Promise<DailyNotificationBatch | null> {
  return runInTransaction(db, async (tx) => {
    const candidate = await tx.query<DailyNotificationBatch>(
      `SELECT b.* FROM notification_daily_batches b
      WHERE status = 'pending' AND next_attempt_at <= $1 AND (claimed_until IS NULL OR claimed_until <= $1)
      AND EXISTS(SELECT 1 FROM notification_daily_items d WHERE d.batch_id = b.id)
      ORDER BY next_attempt_at, id LIMIT 1`,
      [now.toISOString()]
    );
    const selected = candidate.rows[0];
    if (selected === undefined) return null;
    const scope = [selected.recipient, selected.schedule_time, selected.schedule_timezone];
    // No row locks are held while acquiring this group lock, so concurrent claimers cannot deadlock.
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      JSON.stringify(scope)
    ]);
    const batches = await tx.query<DailyNotificationBatch & { active: boolean; ready: boolean }>(
      `SELECT b.*, due_at::text AS due_at,
      COALESCE(claimed_until > $4, false) AS active, next_attempt_at <= $4 AS ready
      FROM notification_daily_batches b WHERE recipient = $1 AND schedule_time = $2 AND schedule_timezone = $3
      AND status = 'pending' AND (due_at <= $4 OR next_attempt_at <= $4 OR claimed_until > $4)
      ORDER BY next_attempt_at, id FOR UPDATE`,
      [...scope, now.toISOString()]
    );
    if (batches.rows.some((row) => row.active)) return null;
    const primary = batches.rows.find((row) => row.id === selected.id && row.ready);
    if (primary === undefined) return null;
    // Waking one future window must never pull other projects' future mail into an overdue send.
    const others =
      Date.parse(primary.due_at) > now.getTime()
        ? []
        : batches.rows
            .filter((row) => row.id !== primary.id && Date.parse(row.due_at) <= now.getTime())
            .map((row) => row.id);
    if (others.length > 0) {
      await preserveDailyNotificationUsage(tx, primary.id, others);
      await tx.query(
        "UPDATE notification_daily_items SET batch_id = $1 WHERE batch_id = ANY($2::uuid[])",
        [primary.id, others]
      );
      await tx.query(
        "UPDATE notification_daily_batches SET status = 'suppressed', claimed_until = NULL, last_error = 'notification_windows_coalesced' WHERE id = ANY($1::uuid[])",
        [others]
      );
    }
    const result = await tx.query<DailyNotificationBatch>(
      `UPDATE notification_daily_batches SET
      claim_token = $2, claimed_until = $3::timestamptz + interval '10 minutes', attempts = attempts + 1
      WHERE id = $1 AND status = 'pending' RETURNING id, recipient, schedule_time, schedule_timezone,
      due_at::text, next_attempt_at::text, claim_token, attempts`,
      [primary.id, randomUUID(), now.toISOString()]
    );
    return result.rows[0] ?? null;
  });
}
