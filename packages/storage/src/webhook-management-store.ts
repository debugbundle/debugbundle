import { runInTransaction } from "./transaction.js";
import { randomUUID } from "node:crypto";
import { ruleActorAllowedSql } from "./project-rule-access.js";
import type {
  CreateWebhookTestDeliveryResult,
  DeleteWebhookResult,
  Queryable,
  WebhookFilters,
  WebhookRecord,
  WebhookDeliveryStore,
  WebhookEventType
} from "./types.js";

function mapWebhookRow(row: {
  webhook_id: string;
  project_id: string;
  created_by_user_id: string;
  url: string;
  events: string[];
  filters: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}): WebhookRecord {
  return {
    webhook_id: row.webhook_id,
    project_id: row.project_id,
    created_by_user_id: row.created_by_user_id,
    url: row.url,
    events: row.events as WebhookRecord["events"],
    filters: row.filters as WebhookFilters,
    is_enabled: row.is_enabled,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function createWebhookManagementStore(
  db: Queryable
): Pick<
  WebhookDeliveryStore,
  | "listWebhooksForOrganization"
  | "createWebhookForOrganization"
  | "getWebhookForOrganization"
  | "updateWebhookForOrganization"
  | "deleteWebhookForOrganization"
  | "createTestDeliveryForOrganization"
  | "retryDeliveryForOrganization"
> {
  return {
    async listWebhooksForOrganization(input): Promise<WebhookRecord[] | null> {
      const scopedProject = await db.query<{ id: string }>(
        `
          SELECT id
          FROM projects
          WHERE id = debugbundle_canonical_project($1::uuid)
            AND organization_id = $2
          LIMIT 1
        `,
        [input.project_id, input.organization_id]
      );

      if (scopedProject.rows[0] === undefined) {
        return null;
      }

      const result = await db.query<{
        webhook_id: string;
        project_id: string;
        created_by_user_id: string;
        url: string;
        events: string[];
        filters: Record<string, unknown>;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          SELECT
            id AS webhook_id,
            project_id,
            created_by_user_id,
            url,
            events,
            debugbundle_rule_view_filters($1,COALESCE(filter_project_id,project_id),filters) AS filters,
            is_enabled,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM agent_webhooks
          WHERE project_id=ANY(debugbundle_project_origins($1::uuid))
          ORDER BY created_at DESC
          LIMIT $2
        `,
        [input.project_id, input.limit]
      );

      return result.rows.map(mapWebhookRow);
    },

    async createWebhookForOrganization(input): Promise<WebhookRecord | null> {
      const scopedProject = await db.query<{ id: string }>(
        `
          SELECT id
          FROM projects
          WHERE id = debugbundle_canonical_project($1::uuid)
            AND organization_id = $2
          LIMIT 1
        `,
        [input.project_id, input.organization_id]
      );

      if (scopedProject.rows[0] === undefined) {
        return null;
      }

      const result = await db.query<{
        webhook_id: string;
        project_id: string;
        created_by_user_id: string;
        url: string;
        events: string[];
        filters: Record<string, unknown>;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          WITH management_scope AS MATERIALIZED (SELECT debugbundle_begin_project_rule_write($2::uuid))
          INSERT INTO agent_webhooks (
            id,
            project_id,
            created_by_user_id,
            url,
            secret_hash,
            events,
            filters,
            is_enabled,
            created_at,
            updated_at
          )
          SELECT $1::uuid, $2::uuid, $3::uuid, $4, $5, $6::text[], $7::jsonb, $8, now(), now() FROM management_scope
          WHERE ${ruleActorAllowedSql("$2::uuid", "$3::uuid", "$3::uuid")}
          RETURNING
            id AS webhook_id,
            project_id,
            created_by_user_id,
            url,
            events,
            filters,
            is_enabled,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          randomUUID(),
          input.project_id,
          input.created_by_user_id,
          input.url,
          input.signing_secret,
          input.events,
          JSON.stringify(input.filters),
          input.is_enabled
        ]
      );

      const created = result.rows[0];
      return created === undefined ? null : mapWebhookRow(created);
    },

    async getWebhookForOrganization(input): Promise<WebhookRecord | null> {
      const result = await db.query<{
        webhook_id: string;
        project_id: string;
        created_by_user_id: string;
        url: string;
        events: string[];
        filters: Record<string, unknown>;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          SELECT
            aw.id AS webhook_id,
            aw.project_id,
            aw.created_by_user_id,
            aw.url,
            aw.events,
            debugbundle_rule_view_filters(COALESCE($3::uuid,p.id),COALESCE(aw.filter_project_id,aw.project_id),aw.filters) AS filters,
            aw.is_enabled,
            aw.created_at::text AS created_at,
            aw.updated_at::text AS updated_at
          FROM agent_webhooks aw
          JOIN projects p ON p.id = debugbundle_canonical_project(aw.project_id)
          WHERE aw.id = $1
            AND p.organization_id = $2
            AND ($3::uuid IS NULL OR aw.project_id=ANY(debugbundle_project_origins($3::uuid)))
          LIMIT 1
        `,
        [input.webhook_id, input.organization_id, input.project_id ?? null]
      );

      const record = result.rows[0];
      return record === undefined ? null : mapWebhookRow(record);
    },

    async updateWebhookForOrganization(input): Promise<WebhookRecord | null> {
      const result = await db.query<{
        webhook_id: string;
        project_id: string;
        created_by_user_id: string;
        url: string;
        events: string[];
        filters: Record<string, unknown>;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          WITH management_scope AS MATERIALIZED (SELECT debugbundle_begin_project_rule_write(COALESCE($7::uuid,(SELECT debugbundle_canonical_project(project_id) FROM agent_webhooks WHERE id=$1))))
          UPDATE agent_webhooks aw
          SET
            url = COALESCE($3, aw.url),
            scope_origin_ids=CASE WHEN $9::boolean THEN debugbundle_project_origins(p.id) ELSE aw.scope_origin_ids END,
            events = COALESCE($4::text[], aw.events),
            filters = COALESCE($5::jsonb, aw.filters),
            filter_project_id=CASE WHEN $5::jsonb IS NOT NULL THEN COALESCE($7::uuid,p.id) ELSE aw.filter_project_id END,
            is_enabled = COALESCE($6::boolean, aw.is_enabled),
            updated_at = now()
          FROM management_scope CROSS JOIN projects p
          WHERE aw.id = $1
            AND p.id = debugbundle_canonical_project(aw.project_id)
            AND p.organization_id = $2
            AND ($7::uuid IS NULL OR aw.project_id=ANY(debugbundle_project_origins($7::uuid)))
            AND ${ruleActorAllowedSql("p.id", "$8::uuid", "aw.created_by_user_id")}
          RETURNING
            aw.id AS webhook_id,
            aw.project_id,
            aw.created_by_user_id,
            aw.url,
            aw.events,
            debugbundle_rule_view_filters(COALESCE($7::uuid,p.id),COALESCE(aw.filter_project_id,aw.project_id),aw.filters) AS filters,
            aw.is_enabled,
            aw.created_at::text AS created_at,
            aw.updated_at::text AS updated_at
        `,
        [
          input.webhook_id,
          input.organization_id,
          input.url ?? null,
          input.events ?? null,
          input.filters === undefined ? null : JSON.stringify(input.filters),
          input.is_enabled ?? null,
          input.project_id ?? null,
          input.actor_user_id ?? null,
          input.project_scope === "current_project"
        ]
      );

      const updated = result.rows[0];
      return updated === undefined ? null : mapWebhookRow(updated);
    },

    async deleteWebhookForOrganization(input): Promise<DeleteWebhookResult | null> {
      const result = await db.query<{ webhook_id: string }>(
        `
          WITH management_scope AS MATERIALIZED (SELECT debugbundle_begin_project_rule_write(COALESCE($3::uuid,(SELECT debugbundle_canonical_project(project_id) FROM agent_webhooks WHERE id=$1))))
          DELETE FROM agent_webhooks aw
          USING management_scope,projects p
          WHERE aw.id = $1
            AND p.id = debugbundle_canonical_project(aw.project_id)
            AND p.organization_id = $2
            AND ($3::uuid IS NULL OR aw.project_id=ANY(debugbundle_project_origins($3::uuid)))
            AND ${ruleActorAllowedSql("p.id", "$4::uuid", "aw.created_by_user_id")}
          RETURNING aw.id AS webhook_id
        `,
        [
          input.webhook_id,
          input.organization_id,
          input.project_id ?? null,
          input.actor_user_id ?? null
        ]
      );

      return result.rows[0] ?? null;
    },

    async createTestDeliveryForOrganization(
      input
    ): Promise<CreateWebhookTestDeliveryResult | null> {
      return runInTransaction(db, async (tx) => {
        await tx.query(
          `SELECT debugbundle_begin_project_rule_write(COALESCE($3::uuid,(SELECT debugbundle_canonical_project(aw.project_id) FROM agent_webhooks aw JOIN projects p ON p.id=debugbundle_canonical_project(aw.project_id) WHERE aw.id=$1 AND p.organization_id=$2)))`,
          [input.webhook_id, input.organization_id, input.project_id ?? null]
        );
        const scopedWebhook = await tx.query<{
          webhook_id: string;
          project_id: string;
          target_url: string;
          signing_secret: string;
        }>(
          `
          SELECT
            aw.id AS webhook_id,
            aw.project_id,
            aw.url AS target_url,
            aw.secret_hash AS signing_secret
          FROM agent_webhooks aw
          JOIN projects p ON p.id = debugbundle_canonical_project(aw.project_id)
          WHERE aw.id = $1
            AND p.organization_id = $2
            AND ($3::uuid IS NULL OR aw.project_id=ANY(debugbundle_project_origins($3::uuid)))
            AND ${ruleActorAllowedSql("p.id", "$4::uuid", "aw.created_by_user_id")}
          LIMIT 1
          FOR SHARE OF aw
        `,
          [
            input.webhook_id,
            input.organization_id,
            input.project_id ?? null,
            input.actor_user_id ?? null
          ]
        );

        const webhook = scopedWebhook.rows[0];
        if (webhook === undefined) {
          return null;
        }

        const deliveryId = randomUUID();
        const payloadIncidentId = randomUUID();
        const occurredAt = new Date().toISOString();
        const payload = {
          delivery_id: deliveryId,
          event: input.event_type,
          event_type: input.event_type,
          occurred_at: occurredAt,
          project_id: webhook.project_id,
          webhook_id: webhook.webhook_id,
          incident_id: payloadIncidentId,
          test: true,
          data: {
            message: "Synthetic webhook test delivery"
          }
        } satisfies Record<string, unknown>;

        await tx.query(
          `
          INSERT INTO webhook_deliveries (
            id,
            webhook_id,
            project_id,
            incident_id,
            event_type,
            target_url,
            signing_secret,
            status,
            attempt_count,
            occurred_at,
            next_attempt_at,
            payload,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            'retrying',
            0,
            $8::timestamptz,
            now() + interval '30 seconds',
            $9::jsonb,
            now(),
            now()
          )
        `,
          [
            deliveryId,
            webhook.webhook_id,
            webhook.project_id,
            null,
            input.event_type,
            webhook.target_url,
            webhook.signing_secret,
            occurredAt,
            JSON.stringify(payload)
          ]
        );

        return {
          delivery_id: deliveryId,
          event_type: input.event_type
        };
      });
    },

    async retryDeliveryForOrganization(input: {
      organization_id: string;
      project_id?: string;
      webhook_id: string;
      delivery_id: string;
      actor_user_id?: string;
      actor_role?: "owner" | "admin" | "member" | "viewer";
    }): Promise<{ delivery_id: string; event_type: WebhookEventType } | null> {
      return runInTransaction(db, async (tx) => {
        await tx.query(
          `SELECT debugbundle_begin_project_rule_write(COALESCE($3::uuid,(SELECT debugbundle_canonical_project(aw.project_id) FROM agent_webhooks aw JOIN projects p ON p.id=debugbundle_canonical_project(aw.project_id) WHERE aw.id=$1 AND p.organization_id=$2)))`,
          [input.webhook_id, input.organization_id, input.project_id ?? null]
        );
        const scopedWebhook = await tx.query<{ webhook_id: string }>(
          `
          SELECT aw.id AS webhook_id
          FROM agent_webhooks aw
          JOIN projects p ON p.id = debugbundle_canonical_project(aw.project_id)
          WHERE aw.id = $1
            AND p.organization_id = $2
            AND ($3::uuid IS NULL OR aw.project_id=ANY(debugbundle_project_origins($3::uuid)))
            AND aw.is_enabled = true
            AND ${ruleActorAllowedSql("p.id", "$4::uuid", "aw.created_by_user_id")}
          LIMIT 1
          FOR SHARE OF aw
        `,
          [
            input.webhook_id,
            input.organization_id,
            input.project_id ?? null,
            input.actor_user_id ?? null
          ]
        );

        if (scopedWebhook.rows[0] === undefined) {
          return null;
        }

        const result = await tx.query<{ delivery_id: string; event_type: WebhookEventType }>(
          `
          UPDATE webhook_deliveries
          SET status = 'retrying',
              attempt_count = 0,
              next_attempt_at = now(),
              last_error = NULL,
              updated_at = now()
          WHERE id = $1
            AND webhook_id = $2
            AND status IN ('failed', 'disabled')
          RETURNING id AS delivery_id, event_type
        `,
          [input.delivery_id, input.webhook_id]
        );

        return result.rows[0] ?? null;
      });
    }
  };
}
