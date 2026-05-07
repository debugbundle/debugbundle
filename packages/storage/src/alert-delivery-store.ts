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
  service_id: string | null;
  channel: AlertChannel;
  condition_type: AlertConditionType;
  severity_min: AlertRuleRecord["severity_min"];
  config: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}): AlertRuleRecord {
  return {
    alert_id: row.alert_id,
    project_id: row.project_id,
    service_id: row.service_id,
    channel: row.channel,
    condition_type: row.condition_type,
    severity_min: row.severity_min,
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
        service_id: string | null;
        channel: AlertChannel;
        condition_type: AlertConditionType;
        severity_min: AlertRuleRecord["severity_min"];
        config: Record<string, unknown>;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          SELECT
            ar.id AS alert_id,
            ar.project_id,
            ar.service_id,
            ar.channel,
            ar.condition_type,
            ar.severity_min,
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
            channel,
            status,
            payload,
            last_error,
            delivered_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8::jsonb, NULL, NULL, now(), now())
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
          input.channel,
          JSON.stringify(input.payload)
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
    }
  };
}
