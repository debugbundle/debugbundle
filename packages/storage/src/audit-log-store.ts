import { randomUUID } from "node:crypto";

import type { AuditLogRecord, AuditLogStore, Queryable } from "./types.js";

type AuditLogRow = {
  audit_log_id: string;
  organization_id: string | null;
  actor_user_id: string | null;
  actor_type: "anonymous" | "browser_session" | "member_token" | "system";
  action: string;
  target_type: string;
  target_id: string | null;
  status: "success" | "failure";
  ip_address: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
};

function mapAuditLogRow(row: AuditLogRow): AuditLogRecord {
  return {
    audit_log_id: row.audit_log_id,
    organization_id: row.organization_id,
    actor_user_id: row.actor_user_id,
    actor_type: row.actor_type,
    action: row.action,
    target_type: row.target_type,
    target_id: row.target_id,
    status: row.status,
    ip_address: row.ip_address,
    metadata: row.metadata,
    occurred_at: row.occurred_at,
    created_at: row.created_at
  };
}

export function createPostgresAuditLogStore(db: Queryable): AuditLogStore {
  return {
    async createAuditLog(input) {
      const result = await db.query<AuditLogRow>(
        `
          INSERT INTO audit_logs (
            id,
            organization_id,
            actor_user_id,
            actor_type,
            action,
            target_type,
            target_id,
            status,
            ip_address,
            metadata,
            occurred_at,
            created_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10::jsonb,
            $11::timestamptz,
            now()
          )
          RETURNING
            id AS audit_log_id,
            organization_id,
            actor_user_id,
            actor_type,
            action,
            target_type,
            target_id,
            status,
            ip_address,
            metadata,
            occurred_at::text AS occurred_at,
            created_at::text AS created_at
        `,
        [
          randomUUID(),
          input.organization_id,
          input.actor_user_id,
          input.actor_type,
          input.action,
          input.target_type,
          input.target_id,
          input.status,
          input.ip_address,
          JSON.stringify(input.metadata ?? {}),
          input.occurred_at
        ]
      );

      const row = result.rows[0];
      if (row === undefined) {
        throw new Error("audit_log_insert_failed");
      }

      return mapAuditLogRow(row);
    }
  };
}