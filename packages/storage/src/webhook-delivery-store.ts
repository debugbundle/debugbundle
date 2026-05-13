import { randomUUID } from "node:crypto";

import type {
  CreateWebhookDeliveryIntentInput,
  CreateWebhookTestDeliveryResult,
  DeleteWebhookResult,
  DeliverWebhookJob,
  MarkWebhookDeliveryAttemptInput,
  MarkWebhookDeliveryAttemptResult,
  MatchingWebhook,
  MatchingWebhookInput,
  Queryable,
  WebhookDeliveryStatus,
  WebhookFilters,
  WebhookDeliveryIntent,
  WebhookDeliveryStore,
  WebhookEventType,
  WebhookRecord,
} from "./types.js";

const WEBHOOK_DELIVERY_RETRY_DELAYS_SECONDS = [1, 5, 30, 120, 600] as const;
const WEBHOOK_CONSECUTIVE_FAILURE_DISABLE_THRESHOLD = 50;

const SEVERITY_RANK: Record<"low" | "medium" | "high" | "critical", number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

function mapWebhookRow(row: {
  webhook_id: string;
  project_id: string;
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
    url: row.url,
    events: row.events as WebhookRecord["events"],
    filters: row.filters as WebhookFilters,
    is_enabled: row.is_enabled,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function createPostgresWebhookDeliveryStore(db: Queryable): WebhookDeliveryStore {
  return {
    async listWebhooksForOrganization(input): Promise<WebhookRecord[] | null> {
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
        webhook_id: string;
        project_id: string;
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
            url,
            events,
            filters,
            is_enabled,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM agent_webhooks
          WHERE project_id = $1
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
        webhook_id: string;
        project_id: string;
        url: string;
        events: string[];
        filters: Record<string, unknown>;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          INSERT INTO agent_webhooks (
            id,
            project_id,
            url,
            secret_hash,
            events,
            filters,
            is_enabled,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5::text[], $6::jsonb, $7, now(), now())
          RETURNING
            id AS webhook_id,
            project_id,
            url,
            events,
            filters,
            is_enabled,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [randomUUID(), input.project_id, input.url, input.signing_secret, input.events, JSON.stringify(input.filters), input.is_enabled]
      );

      const created = result.rows[0];
      return created === undefined ? null : mapWebhookRow(created);
    },

    async getWebhookForOrganization(input): Promise<WebhookRecord | null> {
      const result = await db.query<{
        webhook_id: string;
        project_id: string;
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
            aw.url,
            aw.events,
            aw.filters,
            aw.is_enabled,
            aw.created_at::text AS created_at,
            aw.updated_at::text AS updated_at
          FROM agent_webhooks aw
          JOIN projects p ON p.id = aw.project_id
          WHERE aw.id = $1
            AND p.organization_id = $2
          LIMIT 1
        `,
        [input.webhook_id, input.organization_id]
      );

      const record = result.rows[0];
      return record === undefined ? null : mapWebhookRow(record);
    },

    async updateWebhookForOrganization(input): Promise<WebhookRecord | null> {
      const result = await db.query<{
        webhook_id: string;
        project_id: string;
        url: string;
        events: string[];
        filters: Record<string, unknown>;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          UPDATE agent_webhooks aw
          SET
            url = COALESCE($3, aw.url),
            events = COALESCE($4::text[], aw.events),
            filters = COALESCE($5::jsonb, aw.filters),
            is_enabled = COALESCE($6::boolean, aw.is_enabled),
            updated_at = now()
          FROM projects p
          WHERE aw.id = $1
            AND p.id = aw.project_id
            AND p.organization_id = $2
          RETURNING
            aw.id AS webhook_id,
            aw.project_id,
            aw.url,
            aw.events,
            aw.filters,
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
          input.is_enabled ?? null
        ]
      );

      const updated = result.rows[0];
      return updated === undefined ? null : mapWebhookRow(updated);
    },

    async deleteWebhookForOrganization(input): Promise<DeleteWebhookResult | null> {
      const result = await db.query<{ webhook_id: string }>(
        `
          DELETE FROM agent_webhooks aw
          USING projects p
          WHERE aw.id = $1
            AND p.id = aw.project_id
            AND p.organization_id = $2
          RETURNING aw.id AS webhook_id
        `,
        [input.webhook_id, input.organization_id]
      );

      return result.rows[0] ?? null;
    },

    async listMatchingWebhooks(input: MatchingWebhookInput): Promise<MatchingWebhook[]> {
      const result = await db.query<{
        webhook_id: string;
        target_url: string;
        signing_secret: string;
        filters: Record<string, unknown>;
      }>(
        `
          SELECT
            id AS webhook_id,
            url AS target_url,
            secret_hash AS signing_secret,
            filters
          FROM agent_webhooks
          WHERE project_id = $1
            AND is_enabled = true
            AND ($2 = ANY(events))
        `,
        [input.project_id, input.event_type]
      );

      const eventSeverityRank = SEVERITY_RANK[input.severity];

      return result.rows.filter((row) => {
        const filters = row.filters;
        const environmentFilter = filters["environment"];
        if (Array.isArray(environmentFilter) && environmentFilter.length > 0) {
          const values = environmentFilter.filter((value): value is string => typeof value === "string");
          if (values.length > 0 && !values.includes(input.environment)) {
            return false;
          }
        }

        const serviceFilter = filters["service"];
        if (Array.isArray(serviceFilter) && serviceFilter.length > 0) {
          const values = serviceFilter.filter((value): value is string => typeof value === "string");
          if (values.length > 0 && !values.includes(input.service_name)) {
            return false;
          }
        }

        const severityMin = filters["severity_min"];
        if (typeof severityMin === "string" && severityMin in SEVERITY_RANK) {
          if (eventSeverityRank < SEVERITY_RANK[severityMin as keyof typeof SEVERITY_RANK]) {
            return false;
          }
        }

        const bundleTypeFilter = filters["bundle_type"];
        if (Array.isArray(bundleTypeFilter) && bundleTypeFilter.length > 0 && input.bundle_type !== undefined) {
          const values = bundleTypeFilter.filter((value): value is string => typeof value === "string");
          if (values.length > 0 && !values.includes(input.bundle_type)) {
            return false;
          }
        }

        const verificationFilter = filters["verification"];
        if (typeof verificationFilter === "boolean" && input.is_verification !== undefined) {
          if (verificationFilter !== input.is_verification) {
            return false;
          }
        }

        return true;
      });
    },

    async createDeliveryIntent(input: CreateWebhookDeliveryIntentInput): Promise<{ delivery_id: string }> {
      const deliveryId = randomUUID();

      await db.query(
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
            payload,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 0, $8::timestamptz, $9::jsonb, now(), now())
        `,
        [
          deliveryId,
          input.webhook_id,
          input.project_id,
          input.incident_id,
          input.event_type,
          input.target_url,
          input.signing_secret,
          input.occurred_at,
          JSON.stringify(input.payload)
        ]
      );

      return {
        delivery_id: deliveryId
      };
    },

    async createTestDeliveryForOrganization(input): Promise<CreateWebhookTestDeliveryResult | null> {
      const scopedWebhook = await db.query<{
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
          JOIN projects p ON p.id = aw.project_id
          WHERE aw.id = $1
            AND p.organization_id = $2
          LIMIT 1
        `,
        [input.webhook_id, input.organization_id]
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

      await db.query(
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
    },

    async getDeliveryIntent(deliveryId: string): Promise<WebhookDeliveryIntent | null> {
      const result = await db.query<{
        delivery_id: string;
        webhook_id: string;
        project_id: string;
        incident_id: string | null;
        event_type: WebhookEventType;
        status: WebhookDeliveryStatus;
        attempt_count: number;
        occurred_at: string;
        target_url: string;
        next_attempt_at: string | null;
        last_response_code: number | null;
        last_attempted_at: string | null;
        last_error: string | null;
        payload: Record<string, unknown>;
        signing_secret: string;
      }>(
        `
          SELECT
            id AS delivery_id,
            webhook_id,
            project_id,
            incident_id,
            event_type,
            status,
            attempt_count,
            occurred_at::text AS occurred_at,
            target_url,
            next_attempt_at::text AS next_attempt_at,
            last_response_code,
            last_attempted_at::text AS last_attempted_at,
            last_error,
            payload,
            signing_secret
          FROM webhook_deliveries
          WHERE id = $1
          LIMIT 1
        `,
        [deliveryId]
      );

      return result.rows[0] ?? null;
    },

    async claimDueDeliveries(limit: number): Promise<DeliverWebhookJob[]> {
      const result = await db.query<{ delivery_id: string; attempt: number }>(
        `
          WITH due AS (
            SELECT id, attempt_count
            FROM webhook_deliveries
            WHERE
              (status = 'pending' AND attempt_count = 0)
              OR (status = 'retrying' AND next_attempt_at IS NOT NULL AND next_attempt_at <= now())
            ORDER BY created_at ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
          )
          UPDATE webhook_deliveries wd
          SET
            status = 'retrying',
            next_attempt_at = now() + interval '30 seconds',
            updated_at = now()
          FROM due
          WHERE wd.id = due.id
          RETURNING wd.id AS delivery_id, due.attempt_count + 1 AS attempt
        `,
        [limit]
      );

      return result.rows;
    },

    async listDeliveriesForWebhook(
      webhookId: string,
      limit: number
    ): Promise<
      Array<{
        delivery_id: string;
        event_type: WebhookEventType;
        status: WebhookDeliveryStatus;
        attempt_count: number;
        next_attempt_at: string | null;
        last_response_code: number | null;
        last_attempted_at: string | null;
        last_error: string | null;
      }>
    > {
      const result = await db.query<{
        delivery_id: string;
        event_type: WebhookEventType;
        status: WebhookDeliveryStatus;
        attempt_count: number;
        next_attempt_at: string | null;
        last_response_code: number | null;
        last_attempted_at: string | null;
        last_error: string | null;
      }>(
        `
          SELECT
            id AS delivery_id,
            event_type,
            status,
            attempt_count,
            next_attempt_at::text AS next_attempt_at,
            last_response_code,
            last_attempted_at::text AS last_attempted_at,
            last_error
          FROM webhook_deliveries
          WHERE webhook_id = $1
          ORDER BY created_at DESC
          LIMIT $2
        `,
        [webhookId, limit]
      );

      return result.rows;
    },

    async listDeliveriesForWebhookInOrganization(input: {
      webhookId: string;
      organizationId: string;
      limit: number;
    }): Promise<
      | {
          deliveries: Array<{
            delivery_id: string;
            event_type: WebhookEventType;
            status: WebhookDeliveryStatus;
            attempt_count: number;
            next_attempt_at: string | null;
            last_response_code: number | null;
            last_attempted_at: string | null;
            last_error: string | null;
          }>;
        }
      | null
    > {
      const scopedWebhook = await db.query<{ webhook_id: string }>(
        `
          SELECT aw.id AS webhook_id
          FROM agent_webhooks aw
          JOIN projects p ON p.id = aw.project_id
          WHERE aw.id = $1
            AND p.organization_id = $2
          LIMIT 1
        `,
        [input.webhookId, input.organizationId]
      );

      if (scopedWebhook.rows[0] === undefined) {
        return null;
      }

      const deliveriesResult = await db.query<{
        delivery_id: string;
        event_type: WebhookEventType;
        status: WebhookDeliveryStatus;
        attempt_count: number;
        next_attempt_at: string | null;
        last_response_code: number | null;
        last_attempted_at: string | null;
        last_error: string | null;
      }>(
        `
          SELECT
            id AS delivery_id,
            event_type,
            status,
            attempt_count,
            next_attempt_at::text AS next_attempt_at,
            last_response_code,
            last_attempted_at::text AS last_attempted_at,
            last_error
          FROM webhook_deliveries
          WHERE webhook_id = $1
          ORDER BY created_at DESC
          LIMIT $2
        `,
        [input.webhookId, input.limit]
      );

      return { deliveries: deliveriesResult.rows };
    },

    async markDeliveryAttempt(input: MarkWebhookDeliveryAttemptInput): Promise<MarkWebhookDeliveryAttemptResult> {
      if (input.delivered) {
        await db.query(
          `
            UPDATE webhook_deliveries
            SET status = 'delivered',
                attempt_count = $2,
                next_attempt_at = NULL,
                last_error = NULL,
                last_response_code = $3,
                last_attempted_at = now(),
                updated_at = now()
            WHERE id = $1
          `,
          [input.delivery_id, input.attempt, input.response_code]
        );

        return {
          status: "delivered",
          next_attempt: null
        };
      }

      const retryDelay = WEBHOOK_DELIVERY_RETRY_DELAYS_SECONDS[input.attempt - 1];
      if (retryDelay !== undefined) {
        await db.query(
          `
            UPDATE webhook_deliveries
            SET status = 'retrying',
                attempt_count = $2,
                next_attempt_at = now() + ($3::text || ' seconds')::interval,
                last_error = $4,
                last_response_code = $5,
                last_attempted_at = now(),
                updated_at = now()
            WHERE id = $1
          `,
          [input.delivery_id, input.attempt, retryDelay, input.error_message, input.response_code]
        );

        return {
          status: "retrying",
          next_attempt: input.attempt + 1
        };
      }

      const failedResult = await db.query<{ webhook_id: string }>(
        `
          UPDATE webhook_deliveries
          SET status = 'failed',
              attempt_count = $2,
              next_attempt_at = NULL,
              last_error = $3,
              last_response_code = $4,
              last_attempted_at = now(),
              updated_at = now()
          WHERE id = $1
          RETURNING webhook_id
        `,
        [input.delivery_id, input.attempt, input.error_message, input.response_code]
      );

      const webhookId = failedResult.rows[0]?.webhook_id;
      if (webhookId !== undefined) {
        const statuses = await db.query<{ status: WebhookDeliveryStatus }>(
          `
            SELECT status
            FROM webhook_deliveries
            WHERE webhook_id = $1
              AND last_attempted_at IS NOT NULL
            ORDER BY last_attempted_at DESC, updated_at DESC
            LIMIT $2
          `,
          [webhookId, WEBHOOK_CONSECUTIVE_FAILURE_DISABLE_THRESHOLD]
        );

        let failureStreak = 0;
        for (const row of statuses.rows) {
          if (row.status !== "failed") {
            break;
          }
          failureStreak += 1;
        }

        if (failureStreak >= WEBHOOK_CONSECUTIVE_FAILURE_DISABLE_THRESHOLD) {
          await db.query(
            `
              UPDATE agent_webhooks
              SET is_enabled = false,
                  updated_at = now()
              WHERE id = $1
                AND is_enabled = true
            `,
            [webhookId]
          );

          await db.query(
            `
              UPDATE webhook_deliveries
              SET status = 'disabled',
                  next_attempt_at = NULL,
                  updated_at = now()
              WHERE webhook_id = $1
                AND status IN ('pending', 'retrying')
            `,
            [webhookId]
          );

          return {
            status: "failed",
            next_attempt: null,
            webhook_disabled: true,
            webhook_id: webhookId
          };
        }
      }

      return {
        status: "failed",
        next_attempt: null
      };
    },

    async retryDeliveryForOrganization(input: {
      organization_id: string;
      webhook_id: string;
      delivery_id: string;
    }): Promise<{ delivery_id: string; event_type: WebhookEventType } | null> {
      const scopedWebhook = await db.query<{ webhook_id: string }>(
        `
          SELECT aw.id AS webhook_id
          FROM agent_webhooks aw
          JOIN projects p ON p.id = aw.project_id
          WHERE aw.id = $1
            AND p.organization_id = $2
            AND aw.is_enabled = true
          LIMIT 1
        `,
        [input.webhook_id, input.organization_id]
      );

      if (scopedWebhook.rows[0] === undefined) {
        return null;
      }

      const result = await db.query<{ delivery_id: string; event_type: WebhookEventType }>(
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
    }
  };
}
