import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

export const OPENAI_OAUTH_STORAGE_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202608300001_add_openai_oauth_records",
    description:
      "Add bounded OAuth credentials and durable oidc-provider adapter records for hosted MCP.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS oauth_authorization_grants (
          id uuid PRIMARY KEY,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          client_id text NOT NULL,
          resource text NOT NULL CHECK (resource = 'https://mcp.debugbundle.com'),
          scopes text[] NOT NULL CHECK (array_length(scopes, 1) > 0),
          provider_grant_id_hash text NOT NULL UNIQUE,
          consented_at timestamptz NOT NULL,
          expires_at timestamptz NOT NULL,
          revoked_at timestamptz,
          revocation_reason text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS oauth_authorization_grants_active_lookup_idx
        ON oauth_authorization_grants (user_id, organization_id, client_id, resource)
      `,
      `
        CREATE INDEX IF NOT EXISTS oauth_authorization_grants_expires_idx
        ON oauth_authorization_grants (expires_at, id)
      `,
      `
        CREATE INDEX IF NOT EXISTS oauth_authorization_grants_revoked_idx
        ON oauth_authorization_grants (revoked_at, id)
      `,
      `
        CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
          id uuid PRIMARY KEY,
          grant_id uuid NOT NULL REFERENCES oauth_authorization_grants(id) ON DELETE CASCADE,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          code_hash text NOT NULL UNIQUE,
          client_id text NOT NULL,
          redirect_uri text NOT NULL,
          resource text NOT NULL CHECK (resource = 'https://mcp.debugbundle.com'),
          scopes text[] NOT NULL CHECK (array_length(scopes, 1) > 0),
          code_challenge text NOT NULL,
          code_challenge_method text NOT NULL CHECK (code_challenge_method = 'S256'),
          issued_at timestamptz NOT NULL DEFAULT now(),
          expires_at timestamptz NOT NULL,
          consumed_at timestamptz
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS oauth_authorization_codes_expires_idx
        ON oauth_authorization_codes (expires_at, id)
      `,
      `
        CREATE INDEX IF NOT EXISTS oauth_authorization_codes_consumed_idx
        ON oauth_authorization_codes (consumed_at, id)
      `,
      `
        CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
          id uuid PRIMARY KEY,
          grant_id uuid NOT NULL REFERENCES oauth_authorization_grants(id) ON DELETE CASCADE,
          family_id uuid NOT NULL,
          parent_token_id uuid REFERENCES oauth_refresh_tokens(id) ON DELETE SET NULL,
          replacement_token_id uuid REFERENCES oauth_refresh_tokens(id) ON DELETE SET NULL,
          token_hash text NOT NULL UNIQUE,
          client_id text NOT NULL,
          resource text NOT NULL CHECK (resource = 'https://mcp.debugbundle.com'),
          scopes text[] NOT NULL CHECK (array_length(scopes, 1) > 0),
          issued_at timestamptz NOT NULL DEFAULT now(),
          expires_at timestamptz NOT NULL,
          used_at timestamptz,
          revoked_at timestamptz,
          revocation_reason text,
          reuse_detected_at timestamptz
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_family_idx
        ON oauth_refresh_tokens (grant_id, family_id, issued_at DESC)
      `,
      `
        CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_expires_idx
        ON oauth_refresh_tokens (expires_at, id)
      `,
      `
        CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_revoked_idx
        ON oauth_refresh_tokens (revoked_at, id)
      `,
      `
        CREATE UNIQUE INDEX IF NOT EXISTS oauth_refresh_tokens_one_current_family_idx
        ON oauth_refresh_tokens (family_id)
        WHERE used_at IS NULL AND revoked_at IS NULL
      `,
      `
        CREATE TABLE IF NOT EXISTS oauth_provider_artifacts (
          model text NOT NULL,
          provider_id_hash text NOT NULL,
          payload jsonb NOT NULL,
          grant_id_hash text,
          session_uid_hash text,
          user_code_hash text,
          expires_at timestamptz NOT NULL,
          consumed_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (model, provider_id_hash)
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS oauth_provider_artifacts_grant_idx
        ON oauth_provider_artifacts (grant_id_hash, expires_at)
        WHERE grant_id_hash IS NOT NULL
      `,
      `
        CREATE UNIQUE INDEX IF NOT EXISTS oauth_provider_artifacts_session_uid_idx
        ON oauth_provider_artifacts (session_uid_hash)
        WHERE session_uid_hash IS NOT NULL
      `,
      `
        CREATE UNIQUE INDEX IF NOT EXISTS oauth_provider_artifacts_user_code_idx
        ON oauth_provider_artifacts (user_code_hash)
        WHERE user_code_hash IS NOT NULL
      `,
      `
        CREATE INDEX IF NOT EXISTS oauth_provider_artifacts_expires_idx
        ON oauth_provider_artifacts (expires_at, model, provider_id_hash)
      `
    ]
  })
] as const;
