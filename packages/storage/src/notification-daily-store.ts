import { claimDailyNotification } from "./notification-daily-claims.js";
import { preserveDailyNotificationUsage } from "./notification-daily-usage.js";
import { alertNotificationHistorySql } from "./alert-notification-history.js";
import { randomUUID } from "node:crypto";
import {
  nextDailyNotificationAt,
  type NotificationSchedule
} from "../../shared-types/src/notification-preferences.js";
import type { Queryable } from "./types.js";
import { runInTransaction } from "./transaction.js";
import type { AlertEmailDigestItemRecord } from "./alert-types.js";

export interface DailyNotificationBatch extends Record<string, unknown> {
  id: string;
  recipient: string;
  schedule_time: string;
  schedule_timezone: string;
  due_at: string;
  claim_token: string;
  attempts: number;
  next_attempt_at?: string;
}
export interface DailyNotificationItem extends Record<string, unknown> {
  incident_id: string;
  project_id: string;
  project_name: string;
  occurred_at: string;
  condition_type: string;
  summary: string;
  service_name: string;
  environment: string;
  severity: string;
}
export interface NotificationDailyStore {
  listLegacyDigestItems(
    digestId: string,
    after: string | null
  ): Promise<Array<AlertEmailDigestItemRecord & { alert_ids: string[] }>>;
  enqueue(input: {
    alert_id: string;
    incident_id: string;
    project_id: string;
    recipient: string;
    occurred_at: string;
    schedule: NotificationSchedule;
    now?: Date;
    allow_new_delivery?: boolean;
    billable?: boolean;
    notification_key?: string;
    cooldown_seconds?: number;
  }): Promise<{ created_delivery: boolean; allowance_exhausted?: boolean }>;
  claim(now?: Date): Promise<DailyNotificationBatch | null>;
  renew(batch: DailyNotificationBatch, now?: Date): Promise<boolean>;
  listItems(batch: DailyNotificationBatch, after: string | null): Promise<DailyNotificationItem[]>;
  policyRevision(batch: DailyNotificationBatch): Promise<string>;
  defer(batch: DailyNotificationBatch, now?: Date, until?: Date): Promise<void>;
  complete(batch: DailyNotificationBatch, sent: boolean): Promise<void>;
  reschedule(
    batch: DailyNotificationBatch,
    incidentId: string,
    schedule: NotificationSchedule,
    now?: Date,
    sendAt?: Date,
    leaseAt?: Date
  ): Promise<void>;
  fail(batch: DailyNotificationBatch, now?: Date): Promise<void>;
  cleanup(): Promise<void>;
}

async function findWritableDailyBatch(
  tx: Queryable,
  recipient: string,
  schedule: NotificationSchedule,
  due: string
): Promise<string | undefined> {
  const result = await tx.query<{ id: string }>(
    `INSERT INTO notification_daily_batches
    (id, recipient, schedule_time, schedule_timezone, due_at, next_attempt_at)
    VALUES($1, lower($2), $3, $4, $5, $5)
    ON CONFLICT(recipient, schedule_time, schedule_timezone, due_at)
    DO UPDATE SET recipient = EXCLUDED.recipient
    WHERE notification_daily_batches.status = 'pending'
      AND (notification_daily_batches.claimed_until IS NULL
        OR notification_daily_batches.due_at > notification_daily_batches.claimed_until - interval '10 minutes')
    RETURNING id`,
    [randomUUID(), recipient, schedule.time, schedule.timezone, due]
  );
  // Claims and renewals grant ten minutes. A lease taken before the deadline only
  // rechecks policy and defers; due/closed windows already have a fixed payload.
  return result.rows[0]?.id;
}

export function createNotificationDailyStore(db: Queryable): NotificationDailyStore {
  return {
    async listLegacyDigestItems(
      digestId: string,
      after: string | null
    ): Promise<Array<AlertEmailDigestItemRecord & { alert_ids: string[] }>> {
      const result = await db.query<AlertEmailDigestItemRecord & { alert_ids: string[] }>(
        `WITH scoped AS (
        SELECT d.* FROM alert_email_digest_items d JOIN alert_email_digests b ON b.id = d.digest_id AND b.project_id = d.project_id
        JOIN incidents i ON i.id = d.incident_id AND i.project_id = d.project_id
        JOIN alert_rules a ON a.id = d.alert_id AND a.project_id = d.project_id
        WHERE d.digest_id = $1 AND ($2::uuid IS NULL OR d.incident_id > $2) AND a.is_enabled
        AND a.channel = 'email' AND lower(a.config->>'to') = lower(b.recipient)
      ), groups AS (
        SELECT incident_id, array_agg(DISTINCT alert_id) AS alert_ids, array_agg(DISTINCT condition_type) AS condition_types
        FROM scoped GROUP BY incident_id ORDER BY incident_id LIMIT 250
      ) SELECT DISTINCT ON(d.incident_id) d.id AS item_id, d.digest_id, d.alert_id, d.project_id, d.incident_id,
        d.condition_type, d.dedupe_key, d.notification_key, d.payload, d.created_at::text, g.alert_ids, g.condition_types
        FROM scoped d JOIN groups g ON g.incident_id = d.incident_id ORDER BY d.incident_id, d.created_at, d.id`,
        [digestId, after]
      );
      return result.rows;
    },
    async enqueue(input: {
      alert_id: string;
      incident_id: string;
      project_id: string;
      recipient: string;
      occurred_at: string;
      schedule: NotificationSchedule;
      now?: Date;
      allow_new_delivery?: boolean;
      billable?: boolean;
      notification_key?: string;
      cooldown_seconds?: number;
    }): Promise<{ created_delivery: boolean; allowance_exhausted?: boolean }> {
      const now = input.now ?? new Date();
      const due = nextDailyNotificationAt(input.schedule, now);
      return runInTransaction(db, async (tx) => {
        const notificationKey = input.notification_key ?? input.incident_id;
        await tx.query("SELECT pg_advisory_xact_lock(hashtext(($1::uuid)::text), hashtext($2))", [
          input.alert_id,
          notificationKey
        ]);
        // Only metadata references are retained; current incident state is read at delivery.
        let batchId = await findWritableDailyBatch(tx, input.recipient, input.schedule, due);
        // Admission may wait across the deadline while another worker sends this window.
        if (batchId === undefined)
          batchId = await findWritableDailyBatch(
            tx,
            input.recipient,
            input.schedule,
            nextDailyNotificationAt(input.schedule, new Date(due))
          );
        if (batchId === undefined) throw new Error("notification_batch_not_created");
        const existing = await tx.query<{ present: boolean; billable: boolean }>(
          `SELECT EXISTS(SELECT 1 FROM notification_daily_allowance_usage WHERE batch_id = $1 AND project_id = $2) AS present,
            EXISTS(SELECT 1 FROM notification_daily_allowance_usage WHERE batch_id = $1 AND project_id = $2 AND billable) AS billable`,
          [batchId, input.project_id]
        );
        const hasDelivery = existing.rows[0]?.present === true;
        if (!hasDelivery && input.allow_new_delivery === false)
          return { created_delivery: false, allowance_exhausted: true };
        // Appending to a converted short digest preserves its already-accounted status.
        const inserted = await tx.query<{ id: string }>(
          `INSERT INTO notification_daily_items(id, batch_id, project_id, alert_id, incident_id, episode_at, occurred_at, notification_key, billable, recipient_user_id)
          SELECT $1, $2, i.project_id, a.id, i.id, COALESCE(i.regressed_at, i.first_seen_at), $6, $10, $8,
            (SELECT u.id FROM users u JOIN projects p ON p.id = i.project_id
              WHERE lower(u.email) = lower($7) AND (p.owner_user_id = u.id OR EXISTS(
                SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = u.id)) LIMIT 1)
          FROM incidents i JOIN alert_rules a ON a.id = $3 AND a.project_id = i.project_id
          WHERE i.id = $4 AND i.project_id = $5 AND i.status <> 'resolved' AND a.is_enabled AND $6::timestamptz >= $9::timestamptz - interval '30 days'
          AND a.channel = 'email' AND lower(a.config->>'to') = lower($7)
          AND ($11 <= 0 OR $12::boolean OR NOT EXISTS(
            SELECT 1 FROM (${alertNotificationHistorySql("$3", "$10")}) recent
            WHERE recent.notified_at >= $9::timestamptz - make_interval(secs => $11)))
          AND NOT EXISTS(SELECT 1 FROM notification_daily_items sent JOIN notification_daily_batches delivered ON delivered.id = sent.batch_id
            WHERE sent.incident_id = i.id AND sent.episode_at = COALESCE(i.regressed_at, i.first_seen_at)
            AND delivered.recipient = lower($7) AND delivered.status = 'delivered')
          ON CONFLICT(alert_id, incident_id, episode_at) DO NOTHING RETURNING id`,
          [
            randomUUID(),
            batchId,
            input.alert_id,
            input.incident_id,
            input.project_id,
            input.occurred_at,
            input.recipient,
            hasDelivery ? existing.rows[0]?.billable === true : (input.billable ?? true),
            now.toISOString(),
            notificationKey,
            input.cooldown_seconds ?? 0,
            input.billable === false
          ]
        );
        if (inserted.rows.length > 0 && !hasDelivery) {
          await tx.query(
            `INSERT INTO notification_daily_allowance_usage(batch_id, project_id, billable)
            VALUES($1, $2, $3) ON CONFLICT(batch_id, project_id) DO NOTHING`,
            [batchId, input.project_id, input.billable !== false]
          );
          // Validate the first contribution from each project before waiting for its
          // schedule; a concurrent policy update may have preceded this transaction.
          await tx.query(
            "UPDATE notification_daily_batches SET next_attempt_at = LEAST(next_attempt_at, $2) WHERE id = $1",
            [batchId, now.toISOString()]
          );
        }
        return {
          created_delivery: inserted.rows.length > 0 && !hasDelivery && input.billable !== false
        };
      });
    },
    claim: (now = new Date()) => claimDailyNotification(db, now),
    async renew(batch: DailyNotificationBatch, now = new Date()): Promise<boolean> {
      const result = await db.query<{ id: string }>(
        `UPDATE notification_daily_batches SET claimed_until = $3::timestamptz + interval '10 minutes'
        WHERE id = $1 AND claim_token = $2 AND status = 'pending' AND claimed_until > $3 RETURNING id`,
        [batch.id, batch.claim_token, now.toISOString()]
      );
      return result.rows.length === 1;
    },
    async listItems(
      batch: DailyNotificationBatch,
      after: string | null
    ): Promise<DailyNotificationItem[]> {
      const result = await db.query<DailyNotificationItem>(
        `SELECT DISTINCT ON(i.id) i.id AS incident_id,
        i.project_id, p.name AS project_name, d.occurred_at::text, a.condition_type,
        i.title AS summary, COALESCE(s.name, 'unknown') AS service_name, i.environment, i.severity
        FROM notification_daily_items d JOIN notification_daily_batches b ON b.id = d.batch_id
        JOIN incidents i ON i.id = d.incident_id AND i.project_id = d.project_id
        JOIN projects p ON p.id = i.project_id JOIN alert_rules a ON a.id = d.alert_id AND a.project_id = p.id
        LEFT JOIN services s ON s.id = i.service_id
        WHERE b.id = $1 AND b.claim_token = $2 AND b.status = 'pending'
        AND i.status <> 'resolved' AND a.is_enabled AND a.channel = 'email'
        AND lower(a.config->>'to') = b.recipient
        AND NOT EXISTS(SELECT 1 FROM notification_daily_items sent JOIN notification_daily_batches delivered ON delivered.id = sent.batch_id
          WHERE sent.incident_id = d.incident_id AND sent.episode_at = d.episode_at
          AND delivered.recipient = b.recipient AND delivered.status = 'delivered')
        AND (d.recipient_user_id IS NULL OR EXISTS(SELECT 1 FROM users u WHERE u.id = d.recipient_user_id
          AND lower(u.email) = b.recipient AND (p.owner_user_id = u.id OR EXISTS(
            SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = u.id))))
        AND ($3::uuid IS NULL OR i.id > $3)
        ORDER BY i.id, d.occurred_at DESC, d.id LIMIT 250`,
        [batch.id, batch.claim_token, after]
      );
      return result.rows;
    },
    async policyRevision(batch: DailyNotificationBatch): Promise<string> {
      const result = await db.query<{ revision: string }>(
        `SELECT md5(COALESCE(string_agg(n.id::text || n.preferences::text, '|' ORDER BY n.id), '')) AS revision
        FROM notification_preferences n WHERE (n.project_id IS NULL OR n.project_id IN (
          SELECT project_id FROM notification_daily_items WHERE batch_id = $1)) AND (
          n.user_id IN (SELECT id FROM users WHERE lower(email) = lower($2)) OR n.organization_id IN (
            SELECT p.organization_id FROM projects p JOIN notification_daily_items d ON d.project_id = p.id WHERE d.batch_id = $1))`,
        [batch.id, batch.recipient]
      );
      return result.rows[0]?.revision ?? "";
    },
    async defer(batch: DailyNotificationBatch, now = new Date(), until?: Date): Promise<void> {
      // Policy changes are not provider failures. Preserve their scheduling anchor
      // and a newer wake-up that arrived while this worker was preparing the batch.
      await db.query(
        `UPDATE notification_daily_batches SET claimed_until = NULL, attempts = GREATEST(0, attempts - 1),
        next_attempt_at = CASE WHEN $4::timestamptz IS NOT NULL AND next_attempt_at = $5::timestamptz
          THEN $4::timestamptz ELSE LEAST(next_attempt_at, $3::timestamptz) END
        WHERE id = $1 AND claim_token = $2 AND status = 'pending'`,
        [
          batch.id,
          batch.claim_token,
          now.toISOString(),
          until?.toISOString() ?? null,
          batch.next_attempt_at ?? null
        ]
      );
    },
    async complete(batch: DailyNotificationBatch, sent: boolean): Promise<void> {
      await db.query(
        `UPDATE notification_daily_batches SET status = $3, delivered_at = CASE WHEN $3 = 'delivered' THEN now() ELSE NULL END,
        claimed_until = NULL, last_error = NULL WHERE id = $1 AND claim_token = $2 AND status = 'pending'`,
        [batch.id, batch.claim_token, sent ? "delivered" : "suppressed"]
      );
    },
    async reschedule(
      batch: DailyNotificationBatch,
      incidentId: string,
      schedule: NotificationSchedule,
      now = new Date(),
      sendAt?: Date,
      leaseAt = now
    ): Promise<void> {
      await runInTransaction(db, async (tx) => {
        // Claims and cross-schedule moves share ordered group locks. Validate and
        // lock the source before creating target rows, so an expired worker cannot
        // leave accounting aliases or move items owned by its replacement.
        const scopes = [
          [batch.recipient, batch.schedule_time, batch.schedule_timezone],
          [batch.recipient, schedule.time, schedule.timezone]
        ].map((scope) => JSON.stringify(scope));
        for (const scope of [...new Set(scopes)].sort())
          await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [scope]);
        const live = await tx.query(
          `SELECT id FROM notification_daily_batches WHERE id=$1 AND claim_token=$2
          AND status='pending' AND claimed_until > $3 FOR UPDATE`,
          [batch.id, batch.claim_token, leaseAt.toISOString()]
        );
        if (live.rows.length === 0) return;
        let id = await findWritableDailyBatch(
          tx,
          batch.recipient,
          schedule,
          sendAt?.toISOString() ?? nextDailyNotificationAt(schedule, now)
        );
        // A completed or in-flight window has a fixed email payload. Keep late
        // schedule moves for the next day instead of silently marking them sent.
        if (id === undefined)
          id = await findWritableDailyBatch(
            tx,
            batch.recipient,
            schedule,
            nextDailyNotificationAt(schedule, leaseAt)
          );
        if (id === undefined) throw new Error("notification_reschedule_failed");
        await preserveDailyNotificationUsage(tx, id, [batch.id], incidentId);
        await tx.query(
          `UPDATE notification_daily_items SET batch_id = $4 WHERE batch_id = $1 AND incident_id = $3
          AND EXISTS(SELECT 1 FROM notification_daily_batches WHERE id = $1 AND claim_token = $2 AND status = 'pending')`,
          [batch.id, batch.claim_token, incidentId, id]
        );
      });
    },
    async fail(batch: DailyNotificationBatch, now = new Date()): Promise<void> {
      // Persist a fixed error code, never provider exception text or payloads.
      await db.query(
        `UPDATE notification_daily_batches SET status = CASE WHEN attempts >= 8 THEN 'failed' ELSE 'pending' END,
        next_attempt_at = $3::timestamptz + LEAST(3600, power(2, LEAST(attempts, 12)) * 30) * interval '1 second',
        claimed_until = NULL, last_error = 'notification_email_transport_failed'
        WHERE id = $1 AND claim_token = $2 AND status = 'pending'`,
        [batch.id, batch.claim_token, now.toISOString()]
      );
    },
    async cleanup(): Promise<void> {
      await db.query(
        `DELETE FROM notification_daily_batches WHERE id IN (
        SELECT id FROM notification_daily_batches WHERE created_at < now() - interval '30 days'
        AND (claimed_until IS NULL OR claimed_until < now()) ORDER BY created_at LIMIT 500)`,
        []
      );
    }
  };
}
