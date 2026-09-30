import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `CREATE TABLE analytics_project_identity_namespaces (
    project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    namespace_revision bigint NOT NULL CHECK (namespace_revision BETWEEN 1 AND 9007199254740991),
    key_fingerprint text NOT NULL CHECK (key_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
    activated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    revoked_at timestamptz,
    CHECK (revoked_at IS NULL OR revoked_at>=activated_at)
  )`,
  `CREATE TABLE analytics_project_identity_namespace_mutations (
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idempotency_key uuid NOT NULL,
    mutation_hash text NOT NULL CHECK (mutation_hash ~ '^[a-f0-9]{64}$'),
    result jsonb NOT NULL CHECK (jsonb_typeof(result)='object' AND octet_length(result::text)<=1024),
    applied_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(project_id,actor_user_id,idempotency_key)
  )`,
  `CREATE TABLE analytics_project_identity_contexts (
    context_id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    writer_id uuid NOT NULL REFERENCES analytics_writers(id) ON DELETE CASCADE,
    idempotency_key uuid NOT NULL,
    mutation_hash text NOT NULL CHECK (mutation_hash ~ '^[a-f0-9]{64}$'),
    scope_revision bigint NOT NULL CHECK (scope_revision BETWEEN 1 AND 9007199254740991),
    namespace_revision bigint NOT NULL CHECK (namespace_revision BETWEEN 1 AND 9007199254740991),
    producer_epoch uuid NOT NULL,
    binding_hash text NOT NULL CHECK (binding_hash ~ '^sha256:[a-f0-9]{64}$'),
    anonymous_id_hash text NOT NULL CHECK (anonymous_id_hash ~ '^sha256:[a-f0-9]{64}$'),
    user_id_hash text CHECK (user_id_hash IS NULL OR user_id_hash ~ '^sha256:[a-f0-9]{64}$'),
    account_id_hash text CHECK (account_id_hash IS NULL OR account_id_hash ~ '^sha256:[a-f0-9]{64}$'),
    privacy_mode text NOT NULL CHECK (privacy_mode IN ('standard','custom')),
    issued_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    associated_at timestamptz,
    association_idempotency_key uuid,
    association_hash text CHECK (association_hash IS NULL OR association_hash ~ '^[a-f0-9]{64}$'),
    revoked_at timestamptz,
    UNIQUE(writer_id,idempotency_key),
    CHECK (expires_at>issued_at AND expires_at<=issued_at+interval '5 minutes'),
    CHECK (account_id_hash IS NULL OR user_id_hash IS NOT NULL),
    CHECK (privacy_mode='custom' OR (user_id_hash IS NULL AND account_id_hash IS NULL)),
    CHECK ((associated_at IS NULL)=(association_idempotency_key IS NULL)),
    CHECK ((associated_at IS NULL)=(association_hash IS NULL))
  )`,
  `CREATE INDEX analytics_project_identity_contexts_expiry_idx
    ON analytics_project_identity_contexts(expires_at,project_id)`
] as const;

export const ANALYTICS_IDENTITY_CONTEXT_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280014_add_analytics_project_identity_contexts",
    description: "Retain project namespace state and short-lived relay identity contexts.",
    statements: STATEMENTS
  })
] as const;

export const ANALYTICS_IDENTITY_CONTEXT_BOOTSTRAP_STATEMENTS = STATEMENTS;
