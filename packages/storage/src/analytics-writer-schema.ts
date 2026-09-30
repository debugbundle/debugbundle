import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS analytics_writer_state (
    project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991)
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_writers (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES analytics_writer_state(project_id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    issuer_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    kind text NOT NULL CHECK (kind IN ('server','relay')),
    display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
    token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    UNIQUE(id,project_id),
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '31536000 seconds'),
    CHECK (revoked_at IS NULL OR revoked_at >= created_at)
  )`,
  `CREATE INDEX IF NOT EXISTS analytics_writers_project_idx ON analytics_writers(project_id,created_at,id)`,
  `CREATE TABLE IF NOT EXISTS analytics_writer_mutations (
    project_id uuid NOT NULL REFERENCES analytics_writer_state(project_id) ON DELETE CASCADE,
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    idempotency_key uuid NOT NULL,
    mutation_hash text NOT NULL CHECK (mutation_hash ~ '^[a-f0-9]{64}$'),
    action text NOT NULL CHECK (action IN ('create','revoke')),
    writer_id uuid NOT NULL,
    result jsonb NOT NULL CHECK (jsonb_typeof(result)='object' AND octet_length(result::text) <= 8192),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(project_id,revision),
    UNIQUE(project_id,actor_user_id,idempotency_key),
    FOREIGN KEY(writer_id,project_id) REFERENCES analytics_writers(id,project_id) ON DELETE CASCADE
  )`
] as const;

export const ANALYTICS_WRITER_STORAGE_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280002_add_analytics_writers",
    description:
      "Add distinct analytics server/relay credentials and revisioned one-time-secret management receipts.",
    statements: STATEMENTS
  })
] as const;

export const ANALYTICS_WRITER_BOOTSTRAP_STATEMENTS = STATEMENTS.map((statement) =>
  statement.replaceAll(" IF NOT EXISTS", "")
);
