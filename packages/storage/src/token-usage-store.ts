import type { Queryable, ResolveMemberResult, ResolveProjectResult } from "./types.js";

// Ingestion authenticates frequently, so keep the dashboard timestamp useful without
// producing a new Postgres row version for every accepted event batch.
const LAST_USED_WRITE_INTERVAL = "5 minutes";

export async function resolveProjectTokenAndRecordUsage(
  db: Queryable,
  tokenHash: string
): Promise<ResolveProjectResult | null> {
  const result = await db.query<ResolveProjectResult & Record<string, unknown>>(
    `
      WITH resolved_token AS MATERIALIZED (
        SELECT
          pt.id AS token_id,
          pt.project_id,
          p.organization_id,
          COALESCE(o.plan, 'free') AS organization_plan,
          COALESCE(pt.allowed_origins, '[]'::jsonb) AS allowed_origins,
          pt.revoked_at,
          pt.expires_at
        FROM project_tokens pt
        JOIN projects p ON p.id = pt.project_id
        JOIN organizations o ON o.id = p.organization_id
        WHERE pt.token_hash = $1
          AND o.suspended_at IS NULL
        LIMIT 1
      ),
      touched_token AS (
        UPDATE project_tokens
        SET last_used_at = now()
        FROM resolved_token
        WHERE project_tokens.id = resolved_token.token_id
          AND resolved_token.revoked_at IS NULL
          AND (resolved_token.expires_at IS NULL OR resolved_token.expires_at > now())
          AND (
            project_tokens.last_used_at IS NULL
            OR project_tokens.last_used_at < now() - $2::interval
          )
        RETURNING project_tokens.id
      )
      SELECT
        resolved_token.project_id,
        resolved_token.organization_id,
        resolved_token.organization_plan,
        resolved_token.allowed_origins,
        resolved_token.revoked_at::text AS revoked_at,
        resolved_token.expires_at::text AS expires_at
      FROM resolved_token
      LEFT JOIN touched_token ON touched_token.id = resolved_token.token_id
      LIMIT 1
    `,
    [tokenHash, LAST_USED_WRITE_INTERVAL]
  );

  return result.rows[0] ?? null;
}

export async function resolveMemberTokenAndRecordUsage(
  db: Queryable,
  tokenHash: string
): Promise<ResolveMemberResult | null> {
  const result = await db.query<ResolveMemberResult & Record<string, unknown>>(
    `
      WITH resolved_token AS MATERIALIZED (
        SELECT
          mt.id AS token_id,
          mt.user_id AS member_id,
          mt.organization_id,
          u.email,
          om.role,
          mt.revoked_at,
          mt.expires_at
        FROM member_tokens mt
        JOIN users u
          ON u.id = mt.user_id
        JOIN organization_members om
          ON om.organization_id = mt.organization_id
         AND om.user_id = mt.user_id
        JOIN organizations org ON org.id = mt.organization_id
        WHERE mt.token_hash = $1
          AND om.suspended_at IS NULL
          AND org.suspended_at IS NULL
        LIMIT 1
      ),
      touched_token AS (
        UPDATE member_tokens
        SET last_used_at = now()
        FROM resolved_token
        WHERE member_tokens.id = resolved_token.token_id
          AND resolved_token.revoked_at IS NULL
          AND (resolved_token.expires_at IS NULL OR resolved_token.expires_at > now())
          AND (
            member_tokens.last_used_at IS NULL
            OR member_tokens.last_used_at < now() - $2::interval
          )
        RETURNING member_tokens.id
      )
      SELECT
        resolved_token.member_id,
        resolved_token.organization_id,
        resolved_token.email,
        resolved_token.role,
        resolved_token.revoked_at::text AS revoked_at,
        resolved_token.expires_at::text AS expires_at
      FROM resolved_token
      LEFT JOIN touched_token ON touched_token.id = resolved_token.token_id
      LIMIT 1
    `,
    [tokenHash, LAST_USED_WRITE_INTERVAL]
  );

  return result.rows[0] ?? null;
}
