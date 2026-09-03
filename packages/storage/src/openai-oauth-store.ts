import { randomUUID } from "node:crypto";

import {
  OPENAI_HOSTED_MCP_SCOPES,
  OPENAI_OIDC_SCOPES,
  type OpenAiGrantStatusInput
} from "../../auth/src/index.js";

import { hashOpenAiOidcProviderLookup } from "./openai-oidc-provider-adapter.js";
import type { Queryable } from "./types.js";

export interface OpenAiProviderGrantClaims {
  grantId: string;
  userId: string;
  organizationId: string;
}

export interface OpenAiOAuthCleanupResult {
  providerArtifacts: number;
  authorizationCodes: number;
  refreshTokens: number;
  grants: number;
}

export interface OpenAiOAuthConnectionRecord {
  grantId: string;
  clientId: string;
  clientName: "ChatGPT and Codex";
  organizationName: string;
  scopes: string[];
  consentedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface OpenAiOAuthStore {
  createGrant(input: {
    providerGrantId: string;
    userId: string;
    organizationId: string;
    clientId: string;
    resource: string;
    scopes: string[];
    consentedAt: string;
    expiresAt: string;
  }): Promise<string>;
  resolveProviderGrantClaims(
    providerGrantId: string
  ): Promise<OpenAiProviderGrantClaims | undefined>;
  isGrantActive(input: OpenAiGrantStatusInput): Promise<boolean>;
  listConnectionsForUser(input: {
    userId: string;
    organizationId: string;
  }): Promise<OpenAiOAuthConnectionRecord[]>;
  revokeGrant(grantId: string, reason: string): Promise<void>;
  revokeGrantByProviderId(providerGrantId: string, reason: string): Promise<boolean>;
  revokeConnectionForUser(input: {
    grantId: string;
    userId: string;
    organizationId: string;
  }): Promise<boolean>;
  cleanupExpiredCredentials(input: { limit: number }): Promise<OpenAiOAuthCleanupResult>;
}

const ALLOWED_SCOPES = new Set<string>([...OPENAI_OIDC_SCOPES, ...OPENAI_HOSTED_MCP_SCOPES]);
const REVOCATION_REASONS = new Set([
  "user_revoked",
  "operator_revoked",
  "membership_removed",
  "account_deleted",
  "refresh_reuse",
  "signing_key_response"
]);

function normalizeScopes(scopes: string[]): string[] {
  const normalized = [...new Set(scopes)].sort();
  if (
    normalized.length === 0 ||
    normalized.length !== scopes.length ||
    normalized.some((scope) => !ALLOWED_SCOPES.has(scope))
  ) {
    throw new Error("openai_oauth_scopes_invalid");
  }
  return normalized;
}

function requireCleanupLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("openai_oauth_cleanup_limit_invalid");
  }
  return limit;
}

function assertRevocationReason(reason: string): void {
  if (!REVOCATION_REASONS.has(reason)) {
    throw new Error("openai_oauth_revocation_reason_invalid");
  }
}

export function createPostgresOpenAiOAuthStore(
  db: Queryable,
  providerEncryptionKey: string
): OpenAiOAuthStore {
  return {
    async createGrant(input) {
      const id = randomUUID();
      const scopes = normalizeScopes(input.scopes);
      await db.query(
        `
          INSERT INTO oauth_authorization_grants (
            id,
            user_id,
            organization_id,
            client_id,
            resource,
            scopes,
            provider_grant_id_hash,
            consented_at,
            expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8::timestamptz, $9::timestamptz)
        `,
        [
          id,
          input.userId,
          input.organizationId,
          input.clientId,
          input.resource,
          scopes,
          hashOpenAiOidcProviderLookup(providerEncryptionKey, "grant", input.providerGrantId),
          input.consentedAt,
          input.expiresAt
        ]
      );
      return id;
    },

    async resolveProviderGrantClaims(providerGrantId) {
      const result = await db.query<
        {
          grant_id: string;
          user_id: string;
          organization_id: string;
        } & Record<string, unknown>
      >(
        `
          SELECT
            g.id::text AS grant_id,
            g.user_id::text AS user_id,
            g.organization_id::text AS organization_id
          FROM oauth_authorization_grants g
          JOIN organization_members om
            ON om.organization_id = g.organization_id
           AND om.user_id = g.user_id
          JOIN organizations o ON o.id = g.organization_id
          WHERE g.provider_grant_id_hash = $1
            AND g.revoked_at IS NULL
            AND g.expires_at > now()
            AND om.suspended_at IS NULL
            AND o.suspended_at IS NULL
          LIMIT 1
        `,
        [hashOpenAiOidcProviderLookup(providerEncryptionKey, "grant", providerGrantId)]
      );
      const row = result.rows[0];
      return row === undefined
        ? undefined
        : {
            grantId: row.grant_id,
            userId: row.user_id,
            organizationId: row.organization_id
          };
    },

    async isGrantActive(input) {
      const scopes = normalizeScopes(input.scopes);
      const result = await db.query<{ active: boolean } & Record<string, unknown>>(
        `
          SELECT true AS active
          FROM oauth_authorization_grants g
          JOIN organization_members om
            ON om.organization_id = g.organization_id
           AND om.user_id = g.user_id
          JOIN organizations o ON o.id = g.organization_id
          WHERE g.id = $1
            AND g.user_id = $2
            AND g.organization_id = $3
            AND g.client_id = $4
            AND g.resource = $5
            AND g.scopes @> $6::text[]
            AND g.revoked_at IS NULL
            AND g.expires_at > now()
            AND om.suspended_at IS NULL
            AND o.suspended_at IS NULL
          LIMIT 1
        `,
        [input.grantId, input.userId, input.organizationId, input.clientId, input.resource, scopes]
      );
      return result.rows[0]?.active === true;
    },

    async listConnectionsForUser(input) {
      const result = await db.query<
        {
          grant_id: string;
          client_id: string;
          organization_name: string;
          scopes: string[];
          consented_at: string;
          expires_at: string;
          revoked_at: string | null;
        } & Record<string, unknown>
      >(
        `
          SELECT
            g.id::text AS grant_id,
            g.client_id,
            o.name AS organization_name,
            g.scopes,
            g.consented_at::text AS consented_at,
            g.expires_at::text AS expires_at,
            g.revoked_at::text AS revoked_at
          FROM oauth_authorization_grants g
          JOIN organizations o ON o.id = g.organization_id
          WHERE g.user_id = $1
            AND g.organization_id = $2
          ORDER BY g.consented_at DESC, g.id DESC
          LIMIT 100
        `,
        [input.userId, input.organizationId]
      );
      return result.rows.map((row) => ({
        grantId: row.grant_id,
        clientId: row.client_id,
        clientName: "ChatGPT and Codex" as const,
        organizationName: row.organization_name,
        scopes: row.scopes,
        consentedAt: row.consented_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at
      }));
    },

    async revokeGrant(grantId, reason) {
      assertRevocationReason(reason);
      await db.query(
        `
          WITH revoked_grant AS (
            UPDATE oauth_authorization_grants
            SET
              revoked_at = COALESCE(revoked_at, now()),
              revocation_reason = COALESCE(revocation_reason, $2),
              updated_at = now()
            WHERE id = $1
            RETURNING id, provider_grant_id_hash
          ), revoked_refresh AS (
            UPDATE oauth_refresh_tokens
            SET
              revoked_at = COALESCE(revoked_at, now()),
              revocation_reason = COALESCE(revocation_reason, $2)
            WHERE grant_id IN (SELECT id FROM revoked_grant)
            RETURNING id
          )
          DELETE FROM oauth_provider_artifacts
          WHERE grant_id_hash IN (SELECT provider_grant_id_hash FROM revoked_grant)
        `,
        [grantId, reason]
      );
    },

    async revokeGrantByProviderId(providerGrantId, reason) {
      assertRevocationReason(reason);
      const result = await db.query<{ revoked: boolean } & Record<string, unknown>>(
        `
          WITH revoked_grant AS (
            UPDATE oauth_authorization_grants
            SET
              revoked_at = COALESCE(revoked_at, now()),
              revocation_reason = COALESCE(revocation_reason, $2),
              updated_at = now()
            WHERE provider_grant_id_hash = $1
            RETURNING id, provider_grant_id_hash
          ), revoked_refresh AS (
            UPDATE oauth_refresh_tokens
            SET
              revoked_at = COALESCE(revoked_at, now()),
              revocation_reason = COALESCE(revocation_reason, $2)
            WHERE grant_id IN (SELECT id FROM revoked_grant)
            RETURNING id
          ), revoked_provider AS (
            DELETE FROM oauth_provider_artifacts
            WHERE grant_id_hash IN (SELECT provider_grant_id_hash FROM revoked_grant)
            RETURNING provider_id_hash
          )
          SELECT EXISTS (SELECT 1 FROM revoked_grant) AS revoked
        `,
        [hashOpenAiOidcProviderLookup(providerEncryptionKey, "grant", providerGrantId), reason]
      );
      return result.rows[0]?.revoked === true;
    },

    async revokeConnectionForUser(input) {
      const result = await db.query<{ revoked: boolean } & Record<string, unknown>>(
        `
          WITH revoked_grant AS (
            UPDATE oauth_authorization_grants g
            SET
              revoked_at = COALESCE(g.revoked_at, now()),
              revocation_reason = COALESCE(g.revocation_reason, 'user_revoked'),
              updated_at = now()
            WHERE g.id = $1
              AND g.user_id = $2
              AND g.organization_id = $3
            RETURNING g.id, g.provider_grant_id_hash
          ), revoked_refresh AS (
            UPDATE oauth_refresh_tokens
            SET
              revoked_at = COALESCE(revoked_at, now()),
              revocation_reason = COALESCE(revocation_reason, 'user_revoked')
            WHERE grant_id IN (SELECT id FROM revoked_grant)
            RETURNING id
          ), revoked_provider AS (
            DELETE FROM oauth_provider_artifacts
            WHERE grant_id_hash IN (SELECT provider_grant_id_hash FROM revoked_grant)
            RETURNING provider_id_hash
          )
          SELECT EXISTS (SELECT 1 FROM revoked_grant) AS revoked
        `,
        [input.grantId, input.userId, input.organizationId]
      );
      return result.rows[0]?.revoked === true;
    },

    async cleanupExpiredCredentials(input) {
      const limit = requireCleanupLimit(input.limit);
      const providerArtifacts = await db.query<{ deleted: number }>(
        `
          DELETE FROM oauth_provider_artifacts target
          WHERE target.ctid IN (
            SELECT candidate.ctid
            FROM oauth_provider_artifacts candidate
            WHERE candidate.expires_at < now() - interval '24 hours'
            ORDER BY candidate.expires_at, candidate.model, candidate.provider_id_hash
            LIMIT $1
          )
          RETURNING 1 AS deleted
        `,
        [limit]
      );
      const authorizationCodes = await db.query<{ deleted: number }>(
        `
          DELETE FROM oauth_authorization_codes target
          WHERE target.ctid IN (
            SELECT candidate.ctid
            FROM oauth_authorization_codes candidate
            WHERE candidate.consumed_at < now() - interval '24 hours'
               OR candidate.expires_at < now() - interval '24 hours'
            ORDER BY candidate.expires_at, candidate.id
            LIMIT $1
          )
          RETURNING 1 AS deleted
        `,
        [limit]
      );
      const refreshTokens = await db.query<{ deleted: number }>(
        `
          DELETE FROM oauth_refresh_tokens target
          WHERE target.ctid IN (
            SELECT candidate.ctid
            FROM oauth_refresh_tokens candidate
            WHERE (candidate.used_at IS NOT NULL OR candidate.revoked_at IS NOT NULL)
              AND COALESCE(candidate.revoked_at, candidate.used_at, candidate.expires_at)
                < now() - interval '30 days'
            ORDER BY candidate.expires_at, candidate.id
            LIMIT $1
          )
          RETURNING 1 AS deleted
        `,
        [limit]
      );
      const grants = await db.query<{ deleted: number }>(
        `
          DELETE FROM oauth_authorization_grants target
          WHERE target.ctid IN (
            SELECT candidate.ctid
            FROM oauth_authorization_grants candidate
            WHERE candidate.revoked_at < now() - interval '90 days'
               OR candidate.expires_at < now() - interval '90 days'
            ORDER BY candidate.expires_at, candidate.id
            LIMIT $1
          )
          RETURNING 1 AS deleted
        `,
        [limit]
      );

      return {
        providerArtifacts: providerArtifacts.rows.length,
        authorizationCodes: authorizationCodes.rows.length,
        refreshTokens: refreshTokens.rows.length,
        grants: grants.rows.length
      };
    }
  };
}
