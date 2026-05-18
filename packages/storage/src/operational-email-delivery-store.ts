import { randomUUID } from "node:crypto";

import type {
  MarkOperationalEmailDeliveryAttemptInput,
  MarkOperationalEmailDeliveryAttemptResult,
  OperationalEmailDeliveryKind,
  OperationalEmailDeliveryRecord,
  OperationalEmailDeliveryStore,
  OperationalEmailRecipientContext,
  Queryable
} from "./types.js";

const OPERATIONAL_EMAIL_RETRY_DELAYS_SECONDS = [1, 5, 30, 120, 600] as const;

function mapOperationalEmailDeliveryRow(row: {
  delivery_id: string;
  organization_id: string;
  project_id: string;
  kind: OperationalEmailDeliveryKind;
  dedupe_key: string;
  payload: Record<string, unknown>;
  status: OperationalEmailDeliveryRecord["status"];
  attempt_count: number;
  next_attempt_at: string | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}): OperationalEmailDeliveryRecord {
  return {
    delivery_id: row.delivery_id,
    organization_id: row.organization_id,
    project_id: row.project_id,
    kind: row.kind,
    dedupe_key: row.dedupe_key,
    payload: row.payload,
    status: row.status,
    attempt_count: row.attempt_count,
    next_attempt_at: row.next_attempt_at,
    last_error: row.last_error,
    delivered_at: row.delivered_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function createPostgresOperationalEmailDeliveryStore(db: Queryable): OperationalEmailDeliveryStore {
  return {
    async queueProjectOperationalEmailDelivery(input): Promise<{ delivery_id: string | null; created: boolean }> {
      const result = await db.query<{ delivery_id: string | null; created: boolean }>(
        `
          WITH scoped_project AS (
            SELECT p.id AS project_id, p.organization_id
            FROM projects p
            WHERE p.id = $2::uuid
            LIMIT 1
          ),
          queued AS (
            INSERT INTO operational_email_deliveries (
              id,
              organization_id,
              project_id,
              kind,
              dedupe_key,
              payload,
              status,
              attempt_count,
              next_attempt_at,
              last_error,
              delivered_at,
              created_at,
              updated_at
            )
            SELECT
              $1::uuid,
              scoped_project.organization_id,
              scoped_project.project_id,
              $3,
              $4,
              $5::jsonb,
              'pending',
              0,
              now(),
              NULL,
              NULL,
              now(),
              now()
            FROM scoped_project
            ON CONFLICT (organization_id, kind, dedupe_key)
            DO UPDATE
            SET
              project_id = EXCLUDED.project_id,
              payload = EXCLUDED.payload,
              status = 'pending',
              attempt_count = 0,
              next_attempt_at = now(),
              last_error = NULL,
              delivered_at = NULL,
              updated_at = now()
            WHERE operational_email_deliveries.status = 'failed'
            RETURNING id::text AS delivery_id, true AS created
          )
          SELECT delivery_id, created
          FROM queued

          UNION ALL

          SELECT oed.id::text AS delivery_id, false AS created
          FROM operational_email_deliveries oed
          JOIN scoped_project ON scoped_project.organization_id = oed.organization_id
          WHERE oed.kind = $3
            AND oed.dedupe_key = $4
            AND NOT EXISTS (SELECT 1 FROM queued)
          LIMIT 1
        `,
        [randomUUID(), input.project_id, input.kind, input.dedupe_key, JSON.stringify(input.payload)]
      );

      const row = result.rows[0];
      return row ?? { delivery_id: null, created: false };
    },

    async claimDueOperationalEmailDeliveries(limit): Promise<Array<{ delivery_id: string; attempt: number }>> {
      const result = await db.query<{ delivery_id: string; attempt: number }>(
        `
          WITH due AS (
            SELECT id, attempt_count
            FROM operational_email_deliveries
            WHERE
              (status = 'pending' AND attempt_count = 0)
              OR (status = 'retrying' AND next_attempt_at IS NOT NULL AND next_attempt_at <= now())
            ORDER BY COALESCE(next_attempt_at, created_at) ASC, created_at ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
          )
          UPDATE operational_email_deliveries oed
          SET
            status = 'retrying',
            next_attempt_at = now() + interval '30 seconds',
            updated_at = now()
          FROM due
          WHERE oed.id = due.id
          RETURNING oed.id::text AS delivery_id, due.attempt_count + 1 AS attempt
        `,
        [limit]
      );

      return result.rows;
    },

    async getOperationalEmailDelivery(input): Promise<OperationalEmailDeliveryRecord | null> {
      const result = await db.query<{
        delivery_id: string;
        organization_id: string;
        project_id: string;
        kind: OperationalEmailDeliveryKind;
        dedupe_key: string;
        payload: Record<string, unknown>;
        status: OperationalEmailDeliveryRecord["status"];
        attempt_count: number;
        next_attempt_at: string | null;
        last_error: string | null;
        delivered_at: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `
          SELECT
            id::text AS delivery_id,
            organization_id::text AS organization_id,
            project_id::text AS project_id,
            kind,
            dedupe_key,
            payload,
            status,
            attempt_count,
            next_attempt_at::text AS next_attempt_at,
            last_error,
            delivered_at::text AS delivered_at,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM operational_email_deliveries
          WHERE id = $1::uuid
          LIMIT 1
        `,
        [input.delivery_id]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapOperationalEmailDeliveryRow(row);
    },

    async resolveOperationalEmailRecipientContext(input): Promise<OperationalEmailRecipientContext | null> {
      const result = await db.query<OperationalEmailRecipientContext & Record<string, unknown>>(
        `
          SELECT
            o.name AS organization_name,
            p.name AS project_name,
            u.email AS recipient_email
          FROM projects p
          JOIN organizations o
            ON o.id = p.organization_id
          JOIN organization_members om
            ON om.organization_id = o.id
           AND om.role = 'owner'
          JOIN users u
            ON u.id = om.user_id
          WHERE p.organization_id = $1::uuid
            AND p.id = $2::uuid
          ORDER BY om.created_at ASC, om.user_id ASC
          LIMIT 1
        `,
        [input.organization_id, input.project_id]
      );

      return result.rows[0] ?? null;
    },

    async markOperationalEmailDeliveryAttempt(
      input: MarkOperationalEmailDeliveryAttemptInput
    ): Promise<MarkOperationalEmailDeliveryAttemptResult> {
      if (input.delivered) {
        await db.query(
          `
            UPDATE operational_email_deliveries
            SET
              status = 'delivered',
              attempt_count = $2,
              next_attempt_at = NULL,
              last_error = NULL,
              delivered_at = now(),
              updated_at = now()
            WHERE id = $1::uuid
          `,
          [input.delivery_id, input.attempt]
        );

        return {
          status: "delivered",
          next_attempt: null
        };
      }

      const retryDelay = OPERATIONAL_EMAIL_RETRY_DELAYS_SECONDS[input.attempt - 1];
      if (retryDelay !== undefined) {
        await db.query(
          `
            UPDATE operational_email_deliveries
            SET
              status = 'retrying',
              attempt_count = $2,
              next_attempt_at = now() + ($3::text || ' seconds')::interval,
              last_error = $4,
              updated_at = now()
            WHERE id = $1::uuid
          `,
          [input.delivery_id, input.attempt, retryDelay, input.error_message]
        );

        return {
          status: "retrying",
          next_attempt: input.attempt + 1
        };
      }

      await db.query(
        `
          UPDATE operational_email_deliveries
          SET
            status = 'failed',
            attempt_count = $2,
            next_attempt_at = NULL,
            last_error = $3,
            updated_at = now()
          WHERE id = $1::uuid
        `,
        [input.delivery_id, input.attempt, input.error_message]
      );

      return {
        status: "failed",
        next_attempt: null
      };
    }
  };
}
