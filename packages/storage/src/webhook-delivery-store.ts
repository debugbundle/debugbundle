import { randomUUID } from "node:crypto";
import { createWebhookManagementStore } from "./webhook-management-store.js";

import type {
  CreateWebhookDeliveryIntentInput,
  DeliverWebhookJob,
  MarkWebhookDeliveryAttemptInput,
  MarkWebhookDeliveryAttemptResult,
  MatchingWebhook,
  MatchingWebhookInput,
  Queryable,
  WebhookDeliveryStatus,
  WebhookDeliveryIntent,
  WebhookDeliveryStore,
  WebhookEventType
} from "./types.js";

const WEBHOOK_DELIVERY_RETRY_DELAYS_SECONDS = [1, 5, 30, 120, 600] as const;
const WEBHOOK_CONSECUTIVE_FAILURE_DISABLE_THRESHOLD = 50;

const SEVERITY_RANK: Record<"low" | "medium" | "high" | "critical", number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

export function createPostgresWebhookDeliveryStore(db: Queryable): WebhookDeliveryStore {
  return {
    ...createWebhookManagementStore(db),
    async listMatchingWebhooks(input: MatchingWebhookInput): Promise<MatchingWebhook[]> {
      const result = await db.query<{
        webhook_id: string;
        target_url: string;
        signing_secret: string;
        filters: Record<string, unknown>;
        has_service_filter?: boolean;
      }>(
        `
          SELECT
            id AS webhook_id,
            url AS target_url,
            secret_hash AS signing_secret,
            CASE WHEN jsonb_typeof(filters->'service')='array' AND jsonb_array_length(filters->'service')>0
              THEN jsonb_set(filters,'{service}',to_jsonb(debugbundle_rule_service_names(COALESCE(filter_project_id,project_id),$1,filters->'service')))
              ELSE filters END AS filters,
            (jsonb_typeof(filters->'service')='array' AND jsonb_array_length(filters->'service')>0) AS has_service_filter
          FROM agent_webhooks
          WHERE project_id=ANY(debugbundle_project_origins(debugbundle_canonical_project($1::uuid)))
            AND $1::uuid=ANY(COALESCE(scope_origin_ids,ARRAY[project_id]))
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
          const values = environmentFilter.filter(
            (value): value is string => typeof value === "string"
          );
          if (values.length > 0 && !values.includes(input.environment)) {
            return false;
          }
        }

        const serviceFilter = filters["service"];
        if (row.has_service_filter && (!Array.isArray(serviceFilter) || serviceFilter.length === 0))
          return false;
        if (Array.isArray(serviceFilter) && serviceFilter.length > 0) {
          const values = serviceFilter.filter(
            (value): value is string => typeof value === "string"
          );
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
        if (
          Array.isArray(bundleTypeFilter) &&
          bundleTypeFilter.length > 0 &&
          input.bundle_type !== undefined
        ) {
          const values = bundleTypeFilter.filter(
            (value): value is string => typeof value === "string"
          );
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

    async createDeliveryIntent(
      input: CreateWebhookDeliveryIntentInput
    ): Promise<{ delivery_id: string }> {
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
    }): Promise<{
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
    } | null> {
      const scopedWebhook = await db.query<{ webhook_id: string }>(
        `
          SELECT aw.id AS webhook_id
          FROM agent_webhooks aw
          JOIN projects p ON p.id = debugbundle_canonical_project(aw.project_id)
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

    async markDeliveryAttempt(
      input: MarkWebhookDeliveryAttemptInput
    ): Promise<MarkWebhookDeliveryAttemptResult> {
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
              WITH management_scope AS MATERIALIZED (SELECT debugbundle_begin_project_rule_write((SELECT debugbundle_canonical_project(project_id) FROM agent_webhooks WHERE id=$1)))
              UPDATE agent_webhooks
              SET is_enabled = false,
                  updated_at = now()
              FROM management_scope WHERE id = $1
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
    }
  };
}
