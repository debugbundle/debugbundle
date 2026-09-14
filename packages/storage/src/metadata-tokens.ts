import { randomUUID } from "node:crypto";
import type {
  MemberTokenRecord,
  PostgresMetadataStore,
  ProjectTokenRecord,
  Queryable
} from "./types.js";

export function createMetadataTokens(
  db: Queryable
): Pick<
  PostgresMetadataStore,
  | "listProjectTokensForOrganization"
  | "createProjectTokenForOrganization"
  | "revokeProjectTokenForOrganization"
  | "listMemberTokensForOrganization"
  | "createMemberTokenForOrganization"
  | "revokeMemberTokenForOrganization"
> {
  return {
    async listProjectTokensForOrganization(input): Promise<ProjectTokenRecord[] | null> {
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

      const result = await db.query<ProjectTokenRecord & Record<string, unknown>>(
        `
          SELECT
            id AS token_id,
            project_id,
            label,
            COALESCE(allowed_origins, '[]'::jsonb) AS allowed_origins,
            created_at::text AS created_at,
            last_used_at::text AS last_used_at,
            revoked_at::text AS revoked_at,
            expires_at::text AS expires_at
          FROM project_tokens
          WHERE project_id = $1
            AND revoked_at IS NULL
          ORDER BY created_at DESC
          LIMIT $2
        `,
        [input.project_id, input.limit]
      );

      return result.rows;
    },

    async createProjectTokenForOrganization(input): Promise<ProjectTokenRecord | null> {
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

      const result = await db.query<ProjectTokenRecord & Record<string, unknown>>(
        `
          INSERT INTO project_tokens (id, project_id, token_hash, label, allowed_origins, created_at)
          VALUES ($1, $2, $3, $4, $5::jsonb, now())
          RETURNING
            id AS token_id,
            project_id,
            label,
            COALESCE(allowed_origins, '[]'::jsonb) AS allowed_origins,
            created_at::text AS created_at,
            last_used_at::text AS last_used_at,
            revoked_at::text AS revoked_at,
            expires_at::text AS expires_at
        `,
        [
          randomUUID(),
          input.project_id,
          input.token_hash,
          input.label,
          JSON.stringify(input.allowed_origins)
        ]
      );

      return result.rows[0] ?? null;
    },

    async revokeProjectTokenForOrganization(input): Promise<ProjectTokenRecord | null> {
      const result = await db.query<ProjectTokenRecord & Record<string, unknown>>(
        `
          UPDATE project_tokens pt
          SET revoked_at = $1
          FROM projects p
          WHERE pt.id = $2
            AND pt.project_id = $3
            AND p.id = pt.project_id
            AND p.organization_id = $4
            AND pt.revoked_at IS NULL
          RETURNING
            pt.id AS token_id,
            pt.project_id,
            pt.label,
            COALESCE(pt.allowed_origins, '[]'::jsonb) AS allowed_origins,
            pt.created_at::text AS created_at,
            pt.last_used_at::text AS last_used_at,
            pt.revoked_at::text AS revoked_at,
            pt.expires_at::text AS expires_at
        `,
        [input.revoked_at, input.token_id, input.project_id, input.organization_id]
      );

      return result.rows[0] ?? null;
    },

    async listMemberTokensForOrganization(input): Promise<MemberTokenRecord[]> {
      const result = await db.query<MemberTokenRecord & Record<string, unknown>>(
        `
          SELECT
            id AS token_id,
            user_id,
            organization_id,
            label,
            created_at::text AS created_at,
            last_used_at::text AS last_used_at,
            revoked_at::text AS revoked_at,
            expires_at::text AS expires_at
          FROM member_tokens
          WHERE organization_id = $1
            AND user_id = $2
            AND revoked_at IS NULL
          ORDER BY created_at DESC
          LIMIT $3
        `,
        [input.organization_id, input.user_id, input.limit]
      );

      return result.rows;
    },

    async createMemberTokenForOrganization(input): Promise<MemberTokenRecord> {
      const result = await db.query<MemberTokenRecord & Record<string, unknown>>(
        `
          INSERT INTO member_tokens (id, user_id, organization_id, token_hash, label, created_at)
          VALUES ($1, $2, $3, $4, $5, now())
          RETURNING
            id AS token_id,
            user_id,
            organization_id,
            label,
            created_at::text AS created_at,
            last_used_at::text AS last_used_at,
            revoked_at::text AS revoked_at,
            expires_at::text AS expires_at
        `,
        [randomUUID(), input.user_id, input.organization_id, input.token_hash, input.label]
      );

      const created = result.rows[0];
      if (created === undefined) {
        throw new Error("member_token_insert_failed");
      }

      return created;
    },

    async revokeMemberTokenForOrganization(input): Promise<MemberTokenRecord | null> {
      const result = await db.query<MemberTokenRecord & Record<string, unknown>>(
        `
          UPDATE member_tokens
          SET revoked_at = $1
          WHERE id = $2
            AND organization_id = $3
            AND user_id = $4
            AND revoked_at IS NULL
          RETURNING
            id AS token_id,
            user_id,
            organization_id,
            label,
            created_at::text AS created_at,
            last_used_at::text AS last_used_at,
            revoked_at::text AS revoked_at,
            expires_at::text AS expires_at
        `,
        [input.revoked_at, input.token_id, input.organization_id, input.user_id]
      );

      return result.rows[0] ?? null;
    }
  };
}
