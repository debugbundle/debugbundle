import { randomUUID } from "node:crypto";
import { generateAgentToken, type AgentTokenContext } from "../../auth/src/index.js";
import { sanitizeTelemetry } from "../../redaction/src/index.js";
import type { Queryable } from "./migrations.js";

export interface AgentTokenRecord {
  token_id: string;
  issuer_user_id: string;
  organization_id: string;
  project_id: string;
  label: string;
  scope: "incident:read-minimized";
  policy_version: "telemetry-privacy-v1";
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface AgentTokenStore {
  resolveByTokenHash(tokenHash: string): Promise<AgentTokenContext | null>;
  list(input: { projectId: string; actorUserId: string }): Promise<AgentTokenRecord[] | null>;
  create(input: {
    projectId: string;
    actorUserId: string;
    label: string;
    expiresAt: string;
  }): Promise<(AgentTokenRecord & { plaintext: string }) | null>;
  revoke(input: {
    projectId: string;
    actorUserId: string;
    tokenId: string;
  }): Promise<AgentTokenRecord | null>;
}

const RECORD_COLUMNS = `
  at.id AS token_id, at.issuer_user_id, at.organization_id, at.project_id,
  at.label, at.scope, at.policy_version, at.created_at::text AS created_at,
  at.expires_at::text AS expires_at, at.revoked_at::text AS revoked_at
`;

/** Pure read: agent evidence access must not update usage or trigger domain work. */
export function createAgentTokenStore(db: Queryable): AgentTokenStore {
  return {
    async resolveByTokenHash(tokenHash) {
      const result = await db.query<AgentTokenContext & Record<string, unknown>>(
        `SELECT at.id AS token_id, at.issuer_user_id AS user_id, at.organization_id, at.project_id,
                at.scope, at.policy_version, at.revoked_at::text AS revoked_at,
                at.expires_at::text AS expires_at
         FROM agent_tokens at
         JOIN projects p ON p.id = at.project_id AND p.organization_id = at.organization_id
         JOIN organizations org ON org.id = p.organization_id AND org.suspended_at IS NULL
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = at.issuer_user_id
         WHERE at.token_hash = $1
           AND NOT EXISTS (SELECT 1 FROM organization_members suspended_member
             WHERE suspended_member.organization_id = p.organization_id
               AND suspended_member.user_id = at.issuer_user_id AND suspended_member.suspended_at IS NOT NULL)
           AND (
             (p.owner_user_id = at.issuer_user_id AND EXISTS (
               SELECT 1 FROM organization_members om
               WHERE om.organization_id = p.organization_id
                 AND om.user_id = at.issuer_user_id AND om.suspended_at IS NULL
             )) OR pm.user_id IS NOT NULL
           )
         LIMIT 1`,
        [tokenHash]
      );
      return result.rows[0] ?? null;
    },

    async list(input) {
      const result = await db.query<AgentTokenRecord & Record<string, unknown>>(
        `SELECT ${RECORD_COLUMNS}
         FROM projects p
         JOIN organizations org ON org.id = p.organization_id AND org.suspended_at IS NULL
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2::uuid
         LEFT JOIN agent_tokens at ON at.project_id = p.id
         WHERE p.id = $1::uuid
           AND NOT EXISTS (SELECT 1 FROM organization_members suspended_member
             WHERE suspended_member.organization_id = p.organization_id
               AND suspended_member.user_id = $2::uuid AND suspended_member.suspended_at IS NOT NULL)
           AND ((p.owner_user_id = $2::uuid AND EXISTS (
             SELECT 1 FROM organization_members om WHERE om.organization_id = p.organization_id
             AND om.user_id = $2::uuid AND om.suspended_at IS NULL
           )) OR pm.role = 'admin')
         ORDER BY at.created_at DESC LIMIT 101`,
        [input.projectId, input.actorUserId]
      );
      // The management adapter checks project access first; this query returns zero rows for
      // both a project with no tokens and an inaccessible project, never leaking a token.
      return result.rows.filter((row) => row.token_id !== null);
    },

    async create(input) {
      const sanitized = sanitizeTelemetry(input.label);
      if (
        !sanitized.ok ||
        typeof sanitized.value !== "string" ||
        sanitized.value.length < 1 ||
        sanitized.value.length > 120
      )
        throw new Error("agent_token_label_invalid");
      const generated = generateAgentToken();
      const result = await db.query<AgentTokenRecord & Record<string, unknown>>(
        `INSERT INTO agent_tokens (id, token_hash, issuer_user_id, organization_id, project_id, label,
                                   scope, policy_version, expires_at)
         SELECT $1::uuid, $2, $3::uuid, p.organization_id, p.id, $4,
                'incident:read-minimized', 'telemetry-privacy-v1', $5::timestamptz
         FROM projects p
         JOIN organizations org ON org.id = p.organization_id AND org.suspended_at IS NULL
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $3::uuid
         WHERE p.id = $6::uuid
           AND NOT EXISTS (SELECT 1 FROM organization_members suspended_member
             WHERE suspended_member.organization_id = p.organization_id
               AND suspended_member.user_id = $3::uuid AND suspended_member.suspended_at IS NOT NULL)
           AND ((p.owner_user_id = $3::uuid AND EXISTS (
             SELECT 1 FROM organization_members om WHERE om.organization_id = p.organization_id
             AND om.user_id = $3::uuid AND om.suspended_at IS NULL
           )) OR pm.role = 'admin')
         RETURNING id AS token_id, issuer_user_id, organization_id, project_id, label,
                   scope, policy_version, created_at::text AS created_at,
                   expires_at::text AS expires_at, revoked_at::text AS revoked_at`,
        [
          randomUUID(),
          generated.hash,
          input.actorUserId,
          sanitized.value,
          input.expiresAt,
          input.projectId
        ]
      );
      const record = result.rows[0];
      return record === undefined ? null : { ...record, plaintext: generated.plaintext };
    },

    async revoke(input) {
      const result = await db.query<AgentTokenRecord & Record<string, unknown>>(
        `UPDATE agent_tokens at SET revoked_at = now()
         FROM projects p
         JOIN organizations org ON org.id = p.organization_id AND org.suspended_at IS NULL
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2::uuid
         WHERE at.id = $3::uuid AND at.project_id = p.id AND p.id = $1::uuid
           AND at.revoked_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM organization_members suspended_member
             WHERE suspended_member.organization_id = p.organization_id
               AND suspended_member.user_id = $2::uuid AND suspended_member.suspended_at IS NOT NULL)
           AND ((p.owner_user_id = $2::uuid AND EXISTS (
             SELECT 1 FROM organization_members om WHERE om.organization_id = p.organization_id
             AND om.user_id = $2::uuid AND om.suspended_at IS NULL
           )) OR pm.role = 'admin')
         RETURNING at.id AS token_id, at.issuer_user_id, at.organization_id, at.project_id,
                   at.label, at.scope, at.policy_version, at.created_at::text AS created_at,
                   at.expires_at::text AS expires_at, at.revoked_at::text AS revoked_at`,
        [input.projectId, input.actorUserId, input.tokenId]
      );
      return result.rows[0] ?? null;
    }
  };
}
