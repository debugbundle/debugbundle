import { randomUUID } from "node:crypto";

import type {
  AlertChannel,
  AlertConditionType,
  AlertDeliveryStore,
  AlertRuleRecord,
  Queryable
} from "./types.js";

const SEVERITY_RANK: Record<"low" | "medium" | "high" | "critical", number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

function mapAlertRuleRow(row: {
  alert_id: string;
  project_id: string;
  created_by_user_id: string;
  service_id: string | null;
  channel: AlertChannel;
  condition_type: AlertConditionType;
  severity_min: AlertRuleRecord["severity_min"];
  cooldown_seconds: number;
  config: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}): AlertRuleRecord {
  return {
    alert_id: row.alert_id,
    project_id: row.project_id,
    created_by_user_id: row.created_by_user_id,
    service_id: row.service_id,
    channel: row.channel,
    condition_type: row.condition_type,
    severity_min: row.severity_min,
    cooldown_seconds: Number(row.cooldown_seconds),
    config: row.config,
    is_enabled: row.is_enabled,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function createPostgresAlertDeliveryStore(db: Queryable): AlertDeliveryStore {
  return {
    async listMatchingAlerts(input: {
      project_id: string;
      condition_type: AlertConditionType;
      service_name: string;
      environment: string;
      severity: "low" | "medium" | "high" | "critical";
    }): Promise<AlertRuleRecord[]> {
      const result = await db.query<{
        alert_id: string;
        project_id: string;
        created_by_user_id: string;
        service_id: string | null;
        channel: AlertChannel;
        condition_type: AlertConditionType;
        severity_min: AlertRuleRecord["severity_min"];
        cooldown_seconds: number;
        config: Record<string, unknown>;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          SELECT
            ar.id AS alert_id,
            ar.project_id,
            ar.created_by_user_id,
            ar.service_id,
            ar.channel,
            ar.condition_type,
            ar.severity_min,
            ar.cooldown_seconds,
            ar.config,
            ar.is_enabled,
            ar.created_at::text AS created_at,
            ar.updated_at::text AS updated_at
          FROM alert_rules ar
          LEFT JOIN services s ON s.id = ar.service_id
          WHERE ar.project_id = $1
            AND ar.is_enabled = true
            AND ar.condition_type = $2
            AND (ar.service_id IS NULL OR (s.name = $3 AND s.environment = $4))
          ORDER BY ar.created_at DESC, ar.id DESC
        `,
        [input.project_id, input.condition_type, input.service_name, input.environment]
      );

      return result.rows
        .map(mapAlertRuleRow)
        .filter(
          (alert) =>
            alert.severity_min === null || SEVERITY_RANK[input.severity] >= SEVERITY_RANK[alert.severity_min]
        );
    },

    async createAlertDeliveryIntent(input: {
      alert_id: string;
      project_id: string;
      incident_id: string;
      condition_type: AlertConditionType;
      dedupe_key: string;
      notification_key: string;
      cooldown_seconds: number;
      channel: AlertChannel;
      payload: Record<string, unknown>;
    }): Promise<{ delivery_id: string | null; created: boolean }> {
      const result = await db.query<{ delivery_id: string }>(
        `
          INSERT INTO alert_deliveries (
            id,
            alert_id,
            project_id,
            incident_id,
            condition_type,
            dedupe_key,
            notification_key,
            channel,
            status,
            payload,
            last_error,
            delivered_at,
            created_at,
            updated_at
          )
          SELECT
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::uuid,
            $5,
            $6,
            $7,
            $8,
            'pending',
            $9::jsonb,
            NULL,
            NULL,
            now(),
            now()
          FROM (
            SELECT pg_advisory_xact_lock(hashtext(($2::uuid)::text), hashtext($7))
          ) lock_row
          WHERE $10 <= 0
            OR NOT EXISTS (
              SELECT 1
              FROM (
                SELECT COALESCE(delivered_at, created_at) AS notified_at
                FROM alert_deliveries
                WHERE alert_id = $2::uuid
                  AND notification_key = $7
                  AND status IN ('pending', 'delivered')
                UNION ALL
                SELECT
                  CASE
                    WHEN digests.status = 'delivered'
                      THEN COALESCE(digests.delivered_at, items.created_at)
                    ELSE items.created_at
                  END AS notified_at
                FROM alert_email_digest_items items
                INNER JOIN alert_email_digests digests
                  ON digests.id = items.digest_id
                WHERE items.alert_id = $2::uuid
                  AND items.notification_key = $7
                  AND digests.status IN ('pending', 'delivered')
              ) recent_notifications
              WHERE recent_notifications.notified_at >= now() - make_interval(secs => $10)
            )
          ON CONFLICT (alert_id, incident_id, dedupe_key) DO NOTHING
          RETURNING id AS delivery_id
        `,
        [
          randomUUID(),
          input.alert_id,
          input.project_id,
          input.incident_id,
          input.condition_type,
          input.dedupe_key,
          input.notification_key,
          input.channel,
          JSON.stringify(input.payload),
          input.cooldown_seconds
        ]
      );

      const created = result.rows[0];
      return created === undefined
        ? { delivery_id: null, created: false }
        : { delivery_id: created.delivery_id, created: true };
    },

    async markAlertDeliveryResult(input: {
      delivery_id: string;
      delivered: boolean;
      error_message: string | null;
    }): Promise<{ status: "delivered" | "failed" }> {
      const status = input.delivered ? "delivered" : "failed";
      const result = await db.query<{ status: "delivered" | "failed" }>(
        `
          UPDATE alert_deliveries
          SET
            status = $2,
            last_error = $3,
            delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END,
            updated_at = now()
          WHERE id = $1
          RETURNING status
        `,
        [input.delivery_id, status, input.error_message]
      );

      return result.rows[0] ?? { status };
    },

    async queueAlertEmailDigestItem(input): Promise<{
      digest_id: string | null;
      created: boolean;
      created_digest: boolean;
    }> {
      const result = await db.query<{
        digest_id: string | null;
        created: boolean;
        created_digest: boolean;
      }>(
        `
          WITH cooldown_lock AS (
            SELECT pg_advisory_xact_lock(hashtext(($5::uuid)::text), hashtext($9))
          ),
          upserted_digest AS (
            INSERT INTO alert_email_digests (
              id,
              project_id,
              recipient,
              status,
              next_attempt_at,
              claimed_at,
              last_error,
              delivered_at,
              created_at,
              updated_at
            )
            SELECT
              $1::uuid,
              $2::uuid,
              $3,
              'pending',
              now() + make_interval(secs => $4),
              NULL,
              NULL,
              NULL,
              now(),
              now()
            FROM cooldown_lock
            WHERE $12::boolean = true
            ON CONFLICT (project_id, recipient) WHERE status = 'pending' AND claimed_at IS NULL
            DO UPDATE SET
              updated_at = now()
            RETURNING id, xmax = 0 AS created_digest
          ),
          selected_digest AS (
            SELECT id, created_digest
            FROM upserted_digest
            UNION ALL
            SELECT id, false AS created_digest
            FROM alert_email_digests
            WHERE project_id = $2::uuid
              AND recipient = $3
              AND status = 'pending'
              AND claimed_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM upserted_digest)
            LIMIT 1
          ),
          inserted_item AS (
            INSERT INTO alert_email_digest_items (
              id,
              digest_id,
              alert_id,
              project_id,
              incident_id,
              condition_type,
              dedupe_key,
              notification_key,
              payload,
              created_at
            )
            SELECT $13::uuid, selected_digest.id, $5::uuid, $2::uuid, $6::uuid, $7, $8, $9, $10::jsonb, now()
            FROM selected_digest
            WHERE $11 <= 0
              OR NOT EXISTS (
                SELECT 1
                FROM (
                  SELECT COALESCE(delivered_at, created_at) AS notified_at
                  FROM alert_deliveries
                  WHERE alert_id = $5::uuid
                    AND notification_key = $9
                    AND status IN ('pending', 'delivered')
                  UNION ALL
                  SELECT
                    CASE
                      WHEN digests.status = 'delivered'
                        THEN COALESCE(digests.delivered_at, items.created_at)
                      ELSE items.created_at
                    END AS notified_at
                  FROM alert_email_digest_items items
                  INNER JOIN alert_email_digests digests
                    ON digests.id = items.digest_id
                  WHERE items.alert_id = $5::uuid
                    AND items.notification_key = $9
                    AND digests.status IN ('pending', 'delivered')
                ) recent_notifications
                WHERE recent_notifications.notified_at >= now() - make_interval(secs => $11)
              )
            ON CONFLICT (alert_id, incident_id, dedupe_key) DO NOTHING
            RETURNING id, digest_id
          ),
          deleted_empty_digest AS (
            DELETE FROM alert_email_digests
            WHERE id IN (
              SELECT selected_digest.id
              FROM selected_digest
              WHERE selected_digest.created_digest = true
            )
              AND NOT EXISTS (SELECT 1 FROM inserted_item)
            RETURNING id
          )
          SELECT
            CASE
              WHEN EXISTS (SELECT 1 FROM inserted_item) THEN selected_digest.id::text
              ELSE NULL
            END AS digest_id,
            EXISTS (SELECT 1 FROM inserted_item) AS created,
            selected_digest.created_digest
              AND EXISTS (SELECT 1 FROM inserted_item)
              AND NOT EXISTS (SELECT 1 FROM deleted_empty_digest) AS created_digest
          FROM selected_digest
          UNION ALL
          SELECT NULL AS digest_id, false AS created, false AS created_digest
          WHERE NOT EXISTS (SELECT 1 FROM selected_digest)
          LIMIT 1
        `,
        [
          randomUUID(),
          input.project_id,
          input.recipient,
          input.aggregation_window_seconds,
          input.alert_id,
          input.incident_id,
          input.condition_type,
          input.dedupe_key,
          input.notification_key,
          JSON.stringify(input.payload),
          input.cooldown_seconds,
          input.allow_new_digest,
          randomUUID()
        ]
      );

      const queued = result.rows[0];
      return queued ?? { digest_id: null, created: false, created_digest: false };
    },

    async claimDueAlertEmailDigests(limit: number): Promise<Array<{ digest_id: string }>> {
      const result = await db.query<{ digest_id: string }>(
        `
          WITH due AS (
            SELECT id
            FROM alert_email_digests
            WHERE status = 'pending'
              AND claimed_at IS NULL
              AND next_attempt_at IS NOT NULL
              AND next_attempt_at <= now()
            ORDER BY next_attempt_at ASC, created_at ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
          )
          UPDATE alert_email_digests digests
          SET
            claimed_at = now(),
            updated_at = now()
          FROM due
          WHERE digests.id = due.id
          RETURNING digests.id::text AS digest_id
        `,
        [limit]
      );

      return result.rows;
    },

    async getAlertEmailDigest(digestId: string): Promise<{
      digest: {
        digest_id: string;
        project_id: string;
        recipient: string;
        status: "pending" | "delivered" | "failed";
        next_attempt_at: string | null;
        claimed_at: string | null;
        last_error: string | null;
        delivered_at: string | null;
        created_at: string;
        updated_at: string;
      };
      items: Array<{
        item_id: string;
        digest_id: string;
        alert_id: string;
        project_id: string;
        incident_id: string;
        condition_type: AlertConditionType;
        dedupe_key: string;
        notification_key: string;
        payload: Record<string, unknown>;
        created_at: string;
      }>;
    } | null> {
      const digestResult = await db.query<{
        digest_id: string;
        project_id: string;
        recipient: string;
        status: "pending" | "delivered" | "failed";
        next_attempt_at: string | null;
        claimed_at: string | null;
        last_error: string | null;
        delivered_at: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `
          SELECT
            id::text AS digest_id,
            project_id::text AS project_id,
            recipient,
            status,
            next_attempt_at::text AS next_attempt_at,
            claimed_at::text AS claimed_at,
            last_error,
            delivered_at::text AS delivered_at,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM alert_email_digests
          WHERE id = $1
          LIMIT 1
        `,
        [digestId]
      );

      const digest = digestResult.rows[0];
      if (digest === undefined) {
        return null;
      }

      const itemResult = await db.query<{
        item_id: string;
        digest_id: string;
        alert_id: string;
        project_id: string;
        incident_id: string;
        condition_type: AlertConditionType;
        dedupe_key: string;
        notification_key: string;
        payload: Record<string, unknown>;
        created_at: string;
      }>(
        `
          SELECT
            id::text AS item_id,
            digest_id::text AS digest_id,
            alert_id::text AS alert_id,
            project_id::text AS project_id,
            incident_id::text AS incident_id,
            condition_type,
            dedupe_key,
            notification_key,
            payload,
            created_at::text AS created_at
          FROM alert_email_digest_items
          WHERE digest_id = $1
          ORDER BY created_at ASC, id ASC
        `,
        [digestId]
      );

      return {
        digest,
        items: itemResult.rows
      };
    },

    async markAlertEmailDigestResult(input: {
      digest_id: string;
      delivered: boolean;
      error_message: string | null;
    }): Promise<{ status: "delivered" | "failed" }> {
      const status = input.delivered ? "delivered" : "failed";
      const result = await db.query<{ status: "delivered" | "failed" }>(
        `
          UPDATE alert_email_digests
          SET
            status = $2,
            claimed_at = NULL,
            last_error = $3,
            delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END,
            updated_at = now()
          WHERE id = $1
          RETURNING status
        `,
        [input.digest_id, status, input.error_message]
      );

      return result.rows[0] ?? { status };
    }
  };
}
