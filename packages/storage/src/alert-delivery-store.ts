import { randomBytes, randomUUID } from "node:crypto";

import { getTierCapabilities } from "../../shared-types/src/index.js";
import { matchesSeverityLifecycleScope } from "./alert-lifecycle.js";

import type {
  AlertChannel,
  AlertConditionType,
  AlertDeliveryStore,
  AlertRuleForDelivery,
  AlertRuleRecord,
  Queryable
} from "./types.js";

const SEVERITY_RANK: Record<"low" | "medium" | "high" | "critical", number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

const MAX_COALESCED_ALERT_MEMBERS = 1000;
// A pre-migration delivery can have later members but no row for its original
// incident yet. Selecting it backfills that root and consumes one more slot.
const COALESCED_MEMBER_USAGE_SQL = `GREATEST(1,
  (SELECT count(*) FROM alert_delivery_members members
   WHERE members.delivery_id = alert_deliveries.id)
  + CASE WHEN EXISTS (
      SELECT 1 FROM incidents root_incident
      WHERE root_incident.id = alert_deliveries.incident_id
        AND root_incident.project_id = alert_deliveries.project_id
    ) AND NOT EXISTS (
      SELECT 1 FROM alert_delivery_members root_member
      WHERE root_member.delivery_id = alert_deliveries.id
        AND root_member.incident_id = alert_deliveries.incident_id
        AND root_member.condition_type = alert_deliveries.condition_type
        AND root_member.dedupe_key = alert_deliveries.dedupe_key
    ) THEN 1 ELSE 0 END)`;

function mapAlertRuleRow(row: {
  alert_id: string;
  project_id: string;
  created_by_user_id: string;
  service_id: string | null;
  channel: AlertChannel;
  condition_type: AlertConditionType;
  severity_min: AlertRuleRecord["severity_min"];
  severity_lifecycle_scope: AlertRuleRecord["severity_lifecycle_scope"];
  cooldown_seconds: number;
  config: Record<string, unknown>;
  signing_secret: string | null;
  webhook_payload_version: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}): AlertRuleForDelivery {
  return {
    alert_id: row.alert_id,
    project_id: row.project_id,
    created_by_user_id: row.created_by_user_id,
    service_id: row.service_id,
    channel: row.channel,
    condition_type: row.condition_type,
    severity_min: row.severity_min,
    severity_lifecycle_scope: row.severity_lifecycle_scope,
    cooldown_seconds: Number(row.cooldown_seconds),
    config: row.config,
    signing_secret: row.signing_secret,
    webhook_payload_version: row.webhook_payload_version,
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
      lifecycle_event?: "new_incident" | "incident_regressed";
    }): Promise<AlertRuleForDelivery[]> {
      const result = await db.query<{
        alert_id: string;
        project_id: string;
        created_by_user_id: string;
        service_id: string | null;
        organization_plan: string;
        channel: AlertChannel;
        condition_type: AlertConditionType;
        severity_min: AlertRuleRecord["severity_min"];
        severity_lifecycle_scope: AlertRuleRecord["severity_lifecycle_scope"];
        cooldown_seconds: number;
        config: Record<string, unknown>;
        signing_secret: string | null;
  webhook_payload_version: number;
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
            COALESCE(o.plan, 'free') AS organization_plan,
            ar.channel,
            ar.condition_type,
            ar.severity_min,
            ar.severity_lifecycle_scope,
            ar.cooldown_seconds,
            ar.config,
            ar.signing_secret,
            ar.webhook_payload_version,
            ar.is_enabled,
            ar.created_at::text AS created_at,
            ar.updated_at::text AS updated_at
          FROM alert_rules ar
          JOIN projects p ON p.id = ar.project_id
          JOIN organizations o ON o.id = p.organization_id
          LEFT JOIN services s ON s.id = ar.service_id
          WHERE ar.project_id = $1
            AND ar.is_enabled = true
            AND ar.condition_type = $2
            AND (ar.service_id IS NULL OR (s.name = $3 AND s.environment = $4))
          ORDER BY ar.created_at DESC, ar.id DESC
        `,
        [input.project_id, input.condition_type, input.service_name, input.environment]
      );

      const alerts = result.rows
        .filter((row) => row.channel !== "slack" || getTierCapabilities(row.organization_plan).slack_integration)
        .map(mapAlertRuleRow)
        .filter((alert) =>
          alert.condition_type !== "severity_threshold" ||
          matchesSeverityLifecycleScope({
            scope: alert.severity_lifecycle_scope,
            lifecycleEvent: input.lifecycle_event
          })
        )
        .filter(
          (alert) =>
            alert.severity_min === null || SEVERITY_RANK[input.severity] >= SEVERITY_RANK[alert.severity_min]
        );
      // Upgrade eligible legacy rules lazily with independent CSPRNG keys. The
      // atomic COALESCE keeps concurrent evaluators on the same persisted key.
      // Legacy response/body shapes remain unchanged; rotation reveals a new key.
      const signedAlerts: AlertRuleForDelivery[] = [];
      for (const alert of alerts) {
        if (alert.channel === "webhook" && !alert.signing_secret) {
          const upgraded = await db.query<{ signing_secret: string }>(
            `UPDATE alert_rules SET signing_secret = COALESCE(NULLIF(signing_secret, ''), $3)
             WHERE id = $1 AND project_id = $2 AND channel = 'webhook' AND is_enabled = true
             RETURNING signing_secret`,
            [alert.alert_id, alert.project_id, `dbundle_asec_${randomBytes(32).toString("base64url")}`]
          );
          const secret = upgraded.rows[0]?.signing_secret;
          if (!secret) continue; // Deleted/disabled rules must not send unsigned.
          alert.signing_secret = secret;
        }
        signedAlerts.push(alert);
      }
      return signedAlerts;
    },

    async createAlertDeliveryIntent(input: {
      evaluation_job_id?: string | null;
      coalescing_key?: string;
      coalescing_window_seconds?: number;
      allow_new_delivery?: boolean;
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
      if (db.transaction !== undefined) {
        return db.transaction(async (tx) => {
          // Acquire before the INSERT statement takes its READ COMMITTED snapshot.
          // An advisory lock inside that INSERT cannot see a concurrent winner.
          for (const key of [input.notification_key, input.coalescing_key].filter((key): key is string => key !== undefined).sort()) {
            await tx.query("SELECT pg_advisory_xact_lock(hashtext(($1::uuid)::text), hashtext($2))", [input.alert_id, key]);
          }
          return createPostgresAlertDeliveryStore({ query: (sql, params) => tx.query(sql, params) })
            .createAlertDeliveryIntent(input);
        });
      }
      const result = await db.query<{ delivery_id: string; created: boolean }>(
        `
          WITH created_delivery AS (
          INSERT INTO alert_deliveries (
            id,
            alert_id,
            project_id,
            incident_id,
            condition_type,
            dedupe_key,
            notification_key,
            coalescing_key,
            evaluation_job_id,
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
            $11,
            $16,
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
          JOIN alert_rules scoped_rule
            ON scoped_rule.id = $2::uuid AND scoped_rule.project_id = $3::uuid
          JOIN incidents scoped_incident
            ON scoped_incident.id = $4::uuid AND scoped_incident.project_id = $3::uuid
          WHERE $15::boolean AND ($10 <= 0
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
          ) AND ($11::text IS NULL OR NOT EXISTS (
            -- The key contains the capture-time bucket; delivery lag must not reopen it.
            SELECT 1 FROM alert_deliveries
            WHERE alert_id = $2::uuid
              AND coalescing_key = $11
              AND condition_type = $5
              AND dedupe_key = $6
              AND status IN ('pending', 'delivered', 'failed')
              AND ${COALESCED_MEMBER_USAGE_SQL} < $13
          )) AND NOT EXISTS (
            SELECT 1 FROM alert_delivery_members prior_member
            JOIN alert_deliveries prior_delivery ON prior_delivery.id = prior_member.delivery_id
            WHERE prior_delivery.alert_id = $2::uuid
              AND prior_delivery.project_id = $3::uuid
              AND prior_delivery.coalescing_key IS NOT DISTINCT FROM $11::text
              AND prior_member.incident_id = $4::uuid
              AND prior_member.condition_type = $5
              AND prior_member.dedupe_key = $6
          )
          ON CONFLICT (alert_id, incident_id, dedupe_key) DO NOTHING
          RETURNING id AS delivery_id
          ), member_delivery AS (
            SELECT delivery_id, 0 AS preference FROM created_delivery
            UNION ALL
            SELECT id AS delivery_id, 1 AS preference FROM alert_deliveries
            WHERE alert_id = $2::uuid AND project_id = $3::uuid
              AND incident_id = $4::uuid AND dedupe_key = $6
            UNION ALL
            SELECT prior_member.delivery_id, 1 AS preference
            FROM alert_delivery_members prior_member
            JOIN alert_deliveries prior_delivery ON prior_delivery.id = prior_member.delivery_id
            WHERE prior_delivery.alert_id = $2::uuid
              AND prior_delivery.project_id = $3::uuid
              AND prior_delivery.coalescing_key IS NOT DISTINCT FROM $11::text
              AND prior_member.incident_id = $4::uuid
              AND prior_member.condition_type = $5
              AND prior_member.dedupe_key = $6
            UNION ALL
            SELECT id AS delivery_id, 2 AS preference FROM alert_deliveries
            WHERE $11::text IS NOT NULL
              AND alert_id = $2::uuid
              AND project_id = $3::uuid
              AND coalescing_key = $11
              AND condition_type = $5
              AND dedupe_key = $6
              AND status IN ('pending', 'delivered', 'failed')
              AND ${COALESCED_MEMBER_USAGE_SQL} < $13
          ), selected_delivery AS (
            SELECT delivery_id FROM member_delivery ORDER BY preference LIMIT 1
          ), recorded_legacy_root AS (
            INSERT INTO alert_delivery_members (
              id, delivery_id, incident_id, condition_type, dedupe_key, created_at
            )
            SELECT $14::uuid, delivery.id, delivery.incident_id,
              delivery.condition_type, delivery.dedupe_key, delivery.created_at
            FROM selected_delivery
            JOIN alert_deliveries delivery ON delivery.id = selected_delivery.delivery_id
            JOIN incidents root_incident ON root_incident.id = delivery.incident_id
              AND root_incident.project_id = delivery.project_id
            WHERE NOT EXISTS (SELECT 1 FROM created_delivery)
              AND delivery.incident_id <> $4::uuid
              AND (SELECT count(*) FROM alert_delivery_members members
                   WHERE members.delivery_id = delivery.id) < $13
            ON CONFLICT (delivery_id, incident_id, condition_type, dedupe_key) DO NOTHING
            RETURNING id
          ), recorded_member AS (
            INSERT INTO alert_delivery_members (
              id, delivery_id, incident_id, condition_type, dedupe_key, created_at
            )
            SELECT $12::uuid, selected_delivery.delivery_id, $4::uuid, $5, $6, now()
            FROM selected_delivery CROSS JOIN (SELECT count(*) FROM recorded_legacy_root) root_backfill
            WHERE EXISTS (
              SELECT 1 FROM incidents scoped_incident
              WHERE scoped_incident.id = $4::uuid AND scoped_incident.project_id = $3::uuid
            )
            ON CONFLICT (delivery_id, incident_id, condition_type, dedupe_key) DO NOTHING
            RETURNING id
          )
          SELECT delivery_id, true AS created FROM created_delivery
          UNION ALL
          SELECT id AS delivery_id, false AS created FROM alert_deliveries
          WHERE NOT EXISTS (SELECT 1 FROM created_delivery)
            AND alert_id = $2::uuid AND project_id = $3::uuid
            AND incident_id = $4::uuid AND condition_type = $5
            AND dedupe_key = $6
            AND coalescing_key IS NOT DISTINCT FROM $11::text
            -- Only the durable job that created the intent may retry its send.
            -- Later occurrences can share every incident-level key while owning
            -- independent jobs, even when their captured timestamps are equal.
            AND $16::text IS NOT NULL AND evaluation_job_id = $16
            AND status IN ('pending', 'failed')
          LIMIT 1
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
          input.cooldown_seconds,
          input.coalescing_key ?? null,
          randomUUID(),
          MAX_COALESCED_ALERT_MEMBERS,
          randomUUID(),
          input.allow_new_delivery ?? true,
          input.evaluation_job_id ?? null
        ]
      );

      const created = result.rows[0];
      return created === undefined
        ? { delivery_id: null, created: false }
        : { delivery_id: created.delivery_id, created: created.created };
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
      if (db.transaction !== undefined) {
        return db.transaction(async (tx) => {
          await tx.query("SELECT pg_advisory_xact_lock(hashtext(($1::uuid)::text), hashtext($2))", [input.alert_id, input.notification_key]);
          return createPostgresAlertDeliveryStore({ query: (sql, params) => tx.query(sql, params) })
            .queueAlertEmailDigestItem(input);
        });
      }
      const result = await db.query<{
        digest_id: string | null;
        created: boolean;
        created_digest: boolean;
      }>(
        `
          WITH cooldown_lock AS (
            SELECT pg_advisory_xact_lock(hashtext(($5::uuid)::text), hashtext($9))
          ),
          scoped_source AS (
            SELECT 1
            FROM alert_rules scoped_rule
            JOIN incidents scoped_incident
              ON scoped_incident.id = $6::uuid AND scoped_incident.project_id = $2::uuid
            WHERE scoped_rule.id = $5::uuid AND scoped_rule.project_id = $2::uuid
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
            FROM cooldown_lock CROSS JOIN scoped_source
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
              AND EXISTS (SELECT 1 FROM scoped_source)
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
              AND (claimed_at IS NULL OR claimed_at < now() - interval '10 minutes')
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
      total_incident_count: number;
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
        total_incident_count?: number;
        condition_types?: AlertConditionType[];
      }>(
        `
          WITH scoped_items AS (
            SELECT items.*
            FROM alert_email_digest_items items
            JOIN alert_email_digests digest ON digest.id = items.digest_id
              AND digest.project_id = items.project_id
            JOIN incidents incident ON incident.id = items.incident_id
              AND incident.project_id = digest.project_id
            JOIN alert_rules scoped_rule ON scoped_rule.id = items.alert_id
              AND scoped_rule.project_id = digest.project_id
            WHERE items.digest_id = $1::uuid
          ), incident_matches AS (
            SELECT incident_id, array_agg(DISTINCT condition_type ORDER BY condition_type) AS condition_types
            FROM scoped_items
            GROUP BY incident_id
          ), representatives AS (
            SELECT DISTINCT ON (items.incident_id)
              items.id, items.digest_id, items.alert_id, items.project_id, items.incident_id,
              items.condition_type, items.dedupe_key, items.notification_key, items.payload,
              items.created_at
            FROM scoped_items items
            ORDER BY items.incident_id, CASE items.payload->>'severity'
              WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
              items.created_at ASC, items.id ASC
          )
          SELECT
            items.id::text AS item_id,
            items.digest_id::text AS digest_id,
            items.alert_id::text AS alert_id,
            items.project_id::text AS project_id,
            items.incident_id::text AS incident_id,
            items.condition_type,
            items.dedupe_key,
            items.notification_key,
            items.payload,
            items.created_at::text AS created_at,
            incident_matches.condition_types,
            (SELECT count(*)::int FROM incident_matches) AS total_incident_count
          FROM representatives items
          INNER JOIN incident_matches ON incident_matches.incident_id = items.incident_id
          ORDER BY CASE items.payload->>'severity'
            WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
            items.created_at ASC, items.id ASC
          LIMIT 25
        `,
        [digestId]
      );

      return {
        digest,
        total_incident_count: Number(itemResult.rows[0]?.total_incident_count ?? 0),
        items: itemResult.rows.map((row) => {
          const item = { ...row };
          delete item.total_incident_count;
          return item;
        })
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
