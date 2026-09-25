import { randomBytes, randomUUID } from "node:crypto";
import {
  defaultSeverityLifecycleScopeForCondition,
  normalizeSeverityLifecycleScopeForCondition
} from "./alert-lifecycle.js";
import type {
  AlertRuleRecord,
  DeleteAlertResult,
  PostgresMetadataStore,
  Queryable
} from "./types.js";
import {
  mapAlertRuleRow,
  mapOptionalRow,
  optionalFieldValue,
  optionalJsonFieldValue
} from "./metadata-shared.js";

export function createMetadataAlerts(
  db: Queryable
): Pick<
  PostgresMetadataStore,
  | "listAlertsForOrganization"
  | "createAlertForOrganization"
  | "updateAlertForOrganization"
  | "deleteAlertForOrganization"
> {
  return {
    async listAlertsForOrganization(input): Promise<AlertRuleRecord[] | null> {
      const scopedProject = await db.query<{ id: string }>(
        `
          SELECT id
          FROM projects
          WHERE id = $1
            AND organization_id = $2
          LIMIT 1
        `,
        [input.project_id, input.organization_id]
      );

      if (scopedProject.rows[0] === undefined) {
        return null;
      }

      const result = await db.query<{
        alert_id: string;
        project_id: string;
        created_by_user_id: string;
        service_id: string | null;
        channel: AlertRuleRecord["channel"];
        condition_type: AlertRuleRecord["condition_type"];
        severity_min: AlertRuleRecord["severity_min"];
        severity_lifecycle_scope: AlertRuleRecord["severity_lifecycle_scope"];
        cooldown_seconds: number;
        config: Record<string, unknown>;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          SELECT
            id AS alert_id,
            project_id,
            created_by_user_id,
            service_id,
            channel,
            condition_type,
            severity_min,
            severity_lifecycle_scope,
            cooldown_seconds,
            config,
            is_enabled,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM alert_rules
          WHERE project_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT $2
        `,
        [input.project_id, input.limit]
      );

      return result.rows.map(mapAlertRuleRow);
    },

    async createAlertForOrganization(input): Promise<AlertRuleRecord | null> {
      const scopedProject = await db.query<{ id: string }>(
        `
          SELECT p.id
          FROM projects p
          LEFT JOIN services s ON s.id = $3::uuid
          WHERE p.id = $1
            AND p.organization_id = $2
            AND ($3::uuid IS NULL OR s.project_id = p.id)
          LIMIT 1
        `,
        [input.project_id, input.organization_id, input.service_id ?? null]
      );

      if (scopedProject.rows[0] === undefined) {
        return null;
      }

      const severityLifecycleScope = normalizeSeverityLifecycleScopeForCondition({
        conditionType: input.condition_type,
        scope: input.severity_lifecycle_scope
      });

      const result = await db.query<{
        alert_id: string;
        project_id: string;
        created_by_user_id: string;
        service_id: string | null;
        channel: AlertRuleRecord["channel"];
        condition_type: AlertRuleRecord["condition_type"];
        severity_min: AlertRuleRecord["severity_min"];
        severity_lifecycle_scope: AlertRuleRecord["severity_lifecycle_scope"];
        cooldown_seconds: number;
        config: Record<string, unknown>;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          INSERT INTO alert_rules (
            id,
            project_id,
            created_by_user_id,
            service_id,
            channel,
            condition_type,
            severity_min,
            severity_lifecycle_scope,
            cooldown_seconds,
            config,
            signing_secret,
            webhook_payload_version,
            is_enabled,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10::jsonb, $11, $13, $12, now(), now())
          RETURNING
            id AS alert_id,
            project_id,
            created_by_user_id,
            service_id,
            channel,
            condition_type,
            severity_min,
            severity_lifecycle_scope,
            cooldown_seconds,
            config,
            is_enabled,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          randomUUID(),
          input.project_id,
          input.created_by_user_id,
          input.service_id ?? null,
          input.channel,
          input.condition_type,
          input.severity_min ?? null,
          severityLifecycleScope,
          input.cooldown_seconds,
          JSON.stringify(input.config),
          input.channel === "webhook" ? input.signing_secret ?? `dbundle_asec_${randomBytes(32).toString("base64url")}` : null,
          input.is_enabled,
          input.channel === "webhook" && input.signing_secret !== undefined ? 1 : 0
        ]
      );

      return mapOptionalRow(result.rows[0], mapAlertRuleRow);
    },

    async updateAlertForOrganization(input): Promise<AlertRuleRecord | null> {
      const hasServiceId = Object.prototype.hasOwnProperty.call(input, "service_id");
      const hasSeverityMin = Object.prototype.hasOwnProperty.call(input, "severity_min");
      const hasSeverityLifecycleScope = Object.prototype.hasOwnProperty.call(
        input,
        "severity_lifecycle_scope"
      );
      const hasCooldownSeconds = Object.prototype.hasOwnProperty.call(input, "cooldown_seconds");
      const hasConfig = Object.prototype.hasOwnProperty.call(input, "config");
      const nextSeverityLifecycleScope = hasSeverityLifecycleScope
        ? input.severity_lifecycle_scope
        : input.condition_type === undefined
          ? undefined
          : defaultSeverityLifecycleScopeForCondition(input.condition_type);

      const result = await db.query<{
        alert_id: string;
        project_id: string;
        created_by_user_id: string;
        service_id: string | null;
        channel: AlertRuleRecord["channel"];
        condition_type: AlertRuleRecord["condition_type"];
        severity_min: AlertRuleRecord["severity_min"];
        severity_lifecycle_scope: AlertRuleRecord["severity_lifecycle_scope"];
        cooldown_seconds: number;
        config: Record<string, unknown>;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          UPDATE alert_rules ar
          SET
            service_id = CASE WHEN $3::boolean THEN $4::uuid ELSE ar.service_id END,
            channel = COALESCE($5, ar.channel),
            condition_type = COALESCE($6, ar.condition_type),
            severity_min = CASE WHEN $7::boolean THEN $8 ELSE ar.severity_min END,
            severity_lifecycle_scope = CASE
              WHEN COALESCE($6, ar.condition_type) <> 'severity_threshold' THEN NULL
              WHEN $9::boolean THEN COALESCE($10::text, 'both')
              ELSE ar.severity_lifecycle_scope
            END,
            cooldown_seconds = CASE WHEN $11::boolean THEN $12 ELSE ar.cooldown_seconds END,
            config = CASE WHEN $13::boolean THEN COALESCE($14::jsonb, '{}'::jsonb) ELSE ar.config END,
            signing_secret = CASE
              WHEN COALESCE($5::text, ar.channel) <> 'webhook' THEN NULL
              ELSE COALESCE($19::text, NULLIF(ar.signing_secret, ''), $20::text)
            END,
            webhook_payload_version = CASE
              WHEN COALESCE($5::text, ar.channel) <> 'webhook' THEN 0
              WHEN $19::text IS NOT NULL THEN 1
              ELSE ar.webhook_payload_version
            END,
            is_enabled = COALESCE($15::boolean, ar.is_enabled),
            updated_at = now()
          FROM projects p
          LEFT JOIN services s ON s.id = $4::uuid
          WHERE ar.id = $1
            AND p.id = ar.project_id
            AND p.organization_id = $2
            AND ($16::uuid IS NULL OR ar.project_id = $16::uuid)
            AND (
              $17::uuid IS NULL
              OR $18::text IN ('owner', 'admin')
              OR ar.created_by_user_id = $17::uuid
            )
            AND ($4::uuid IS NULL OR $3::boolean = false OR s.project_id = ar.project_id)
            AND ($19::text IS NULL OR COALESCE($5::text, ar.channel) = 'webhook')
          RETURNING
            ar.id AS alert_id,
            ar.project_id,
            ar.created_by_user_id,
            ar.service_id,
            ar.channel,
            ar.condition_type,
            ar.severity_min,
            ar.severity_lifecycle_scope,
            ar.cooldown_seconds,
            ar.config,
            ar.is_enabled,
            ar.created_at::text AS created_at,
            ar.updated_at::text AS updated_at
        `,
        [
          input.alert_id,
          input.organization_id,
          hasServiceId,
          optionalFieldValue(hasServiceId, input.service_id),
          input.channel ?? null,
          input.condition_type ?? null,
          hasSeverityMin,
          optionalFieldValue(hasSeverityMin, input.severity_min),
          hasSeverityLifecycleScope || input.condition_type !== undefined,
          nextSeverityLifecycleScope ?? null,
          hasCooldownSeconds,
          input.cooldown_seconds ?? 0,
          hasConfig,
          optionalJsonFieldValue(hasConfig, input.config),
          input.is_enabled ?? null,
          input.project_id ?? null,
          input.actor_user_id ?? null,
          input.actor_role ?? null,
          input.signing_secret ?? null,
          `dbundle_asec_${randomBytes(32).toString("base64url")}`
        ]
      );

      return mapOptionalRow(result.rows[0], mapAlertRuleRow);
    },

    async deleteAlertForOrganization(input): Promise<DeleteAlertResult | null> {
      const result = await db.query<DeleteAlertResult & Record<string, unknown>>(
        `
          DELETE FROM alert_rules ar
          USING projects p
          WHERE ar.id = $1
            AND p.id = ar.project_id
            AND p.organization_id = $2
            AND ($3::uuid IS NULL OR ar.project_id = $3::uuid)
            AND (
              $4::uuid IS NULL
              OR $5::text IN ('owner', 'admin')
              OR ar.created_by_user_id = $4::uuid
            )
          RETURNING ar.id AS alert_id
        `,
        [
          input.alert_id,
          input.organization_id,
          input.project_id ?? null,
          input.actor_user_id ?? null,
          input.actor_role ?? null
        ]
      );

      return result.rows[0] ?? null;
    }
  };
}
