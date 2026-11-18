import { randomUUID } from "node:crypto";
import type { WebSessionAuthStore, WebSessionRecord } from "../../auth/src/index.js";
import type { Queryable } from "./types.js";

function mapSessionRow(row: Record<string, unknown>): WebSessionRecord {
  const sessionAuthMethod = row["session_auth_method"];

  return {
    session_id: String(row["session_id"]),
    user_id: String(row["user_id"]),
    email: String(row["email"]),
    email_verified_at: (row["email_verified_at"] as string | null) ?? null,
    organization_id: String(row["organization_id"]),
    role: row["role"] === "owner" ? "owner" : row["role"] === "admin" ? "admin" : "member",
    created_at: String(row["created_at"]),
    expires_at: String(row["expires_at"]),
    revoked_at: (row["revoked_at"] as string | null) ?? null,
    session_auth_method:
      sessionAuthMethod === "email_code" || sessionAuthMethod === "github_oauth"
        ? sessionAuthMethod
        : null,
    has_email_auth: row["has_email_auth"] === true,
    has_github_oauth: row["has_github_oauth"] === true,
    avatar_object_key: (row["avatar_object_key"] as string | null) ?? null
  };
}

export function createPostgresAuthSessionStore(
  db: Queryable
): Pick<
  WebSessionAuthStore,
  | "createSession"
  | "resolveSessionByTokenHash"
  | "revokeSessionByTokenHash"
  | "revokeOtherSessionsForUser"
  | "renewSessionByTokenHash"
> {
  return {
    async createSession(input) {
      const result = await db.query<Record<string, unknown>>(
        `
          WITH active_membership AS (
            SELECT om.organization_id
            FROM organization_members om
            JOIN organizations org ON org.id = om.organization_id
            WHERE om.user_id = $2
              AND om.organization_id = $3
              AND om.suspended_at IS NULL
              AND org.suspended_at IS NULL
            LIMIT 1
          ),
          inserted AS (
            INSERT INTO sessions (
              id,
              user_id,
              organization_id,
              session_token_hash,
              expires_at,
              created_at,
              auth_method
            )
            SELECT $1, $2, organization_id, $4, $5::timestamptz, now(), $6
            FROM active_membership
            RETURNING id, user_id, organization_id, created_at, expires_at, revoked_at, auth_method
          )
          SELECT
            inserted.id AS session_id,
            inserted.user_id,
            u.email,
            u.email_verified_at::text AS email_verified_at,
            inserted.organization_id,
            om.role,
            inserted.created_at::text AS created_at,
            inserted.expires_at::text AS expires_at,
            inserted.revoked_at::text AS revoked_at,
            inserted.auth_method AS session_auth_method,
            true AS has_email_auth,
            u.avatar_object_key,
            EXISTS (
              SELECT 1
              FROM oauth_identities oi
              WHERE oi.user_id = inserted.user_id
                AND oi.provider = 'github'
            ) AS has_github_oauth
          FROM inserted
          JOIN users u ON u.id = inserted.user_id
          JOIN organization_members om
            ON om.user_id = inserted.user_id
           AND om.organization_id = inserted.organization_id
          JOIN organizations org ON org.id = inserted.organization_id
          WHERE om.suspended_at IS NULL
            AND org.suspended_at IS NULL
          LIMIT 1
        `,
        [
          randomUUID(),
          input.user_id,
          input.organization_id,
          input.session_token_hash,
          input.expires_at,
          input.auth_method
        ]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapSessionRow(row);
    },

    async resolveSessionByTokenHash(sessionTokenHash) {
      const result = await db.query<Record<string, unknown>>(
        `
          SELECT
            s.id AS session_id,
            s.user_id,
            u.email,
            u.email_verified_at::text AS email_verified_at,
            s.organization_id,
            om.role,
            s.created_at::text AS created_at,
            s.expires_at::text AS expires_at,
            s.revoked_at::text AS revoked_at,
            s.auth_method AS session_auth_method,
            true AS has_email_auth,
            u.avatar_object_key,
            EXISTS (
              SELECT 1
              FROM oauth_identities oi
              WHERE oi.user_id = s.user_id
                AND oi.provider = 'github'
            ) AS has_github_oauth
          FROM sessions s
          JOIN users u ON u.id = s.user_id
          JOIN organization_members om
            ON om.user_id = s.user_id
           AND om.organization_id = s.organization_id
          JOIN organizations org ON org.id = s.organization_id
          WHERE s.session_token_hash = $1
            AND om.suspended_at IS NULL
            AND org.suspended_at IS NULL
          LIMIT 1
        `,
        [sessionTokenHash]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapSessionRow(row);
    },

    async revokeSessionByTokenHash(input) {
      const result = await db.query<Record<string, unknown>>(
        `
          UPDATE sessions
          SET revoked_at = $2::timestamptz
          WHERE session_token_hash = $1
            AND revoked_at IS NULL
          RETURNING id AS session_id
        `,
        [input.session_token_hash, input.revoked_at]
      );

      return result.rows[0] !== undefined;
    },

    async revokeOtherSessionsForUser(input) {
      const result = await db.query<Record<string, unknown>>(
        `
          UPDATE sessions
          SET revoked_at = $3::timestamptz
          WHERE user_id = $1
            AND session_token_hash <> $2
            AND revoked_at IS NULL
          RETURNING id AS session_id
        `,
        [input.user_id, input.except_session_token_hash, input.revoked_at]
      );

      return result.rowCount ?? result.rows.length;
    },

    async renewSessionByTokenHash(input) {
      // The row update serializes renewal with logout and other tabs. Never reset
      // creation/revocation or shorten a newer activity deadline with an older request.
      const result = await db.query<Record<string, unknown>>(
        `
        UPDATE sessions s
        SET expires_at = LEAST(
          s.created_at + $4 * interval '1 millisecond',
          GREATEST(s.expires_at, $2::timestamptz + $3 * interval '1 millisecond')
        )
        WHERE s.session_token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > $2::timestamptz
          AND s.created_at <= $2::timestamptz
          AND s.created_at + $4 * interval '1 millisecond' > $2::timestamptz
          AND EXISTS (
            SELECT 1 FROM organization_members om
            JOIN organizations org ON org.id = om.organization_id
            WHERE om.user_id = s.user_id AND om.organization_id = s.organization_id
              AND om.suspended_at IS NULL AND org.suspended_at IS NULL
          )
        RETURNING s.id AS session_id, s.expires_at::text,
          (s.created_at + $4 * interval '1 millisecond')::text AS absolute_expires_at
      `,
        [input.session_token_hash, input.now, input.idle_lifetime_ms, input.absolute_lifetime_ms]
      );
      const row = result.rows[0];
      return row === undefined
        ? null
        : {
            session_id: String(row["session_id"]),
            expires_at: new Date(String(row["expires_at"])).toISOString(),
            absolute_expires_at: new Date(String(row["absolute_expires_at"])).toISOString()
          };
    }
  };
}
