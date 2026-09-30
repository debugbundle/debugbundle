import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS analytics_project_catalogs (
    project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    catalog_revision bigint NOT NULL CHECK (catalog_revision BETWEEN 0 AND 9007199254740991),
    content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    entries jsonb NOT NULL CHECK (jsonb_typeof(entries)='array' AND jsonb_array_length(entries)<=100 AND octet_length(entries::text)<=262144),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_project_catalog_revisions (
    project_id uuid NOT NULL REFERENCES analytics_project_catalogs(project_id) ON DELETE CASCADE,
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    catalog_revision bigint NOT NULL CHECK (catalog_revision BETWEEN 0 AND 9007199254740991),
    actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    idempotency_key uuid NOT NULL,
    mutation_hash text NOT NULL CHECK (mutation_hash ~ '^[a-f0-9]{64}$'),
    content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    entries jsonb NOT NULL CHECK (jsonb_typeof(entries)='array' AND jsonb_array_length(entries)<=100 AND octet_length(entries::text)<=262144),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(project_id,revision),
    UNIQUE(project_id,actor_user_id,idempotency_key)
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_project_catalog_entry_revisions (
    project_id uuid NOT NULL REFERENCES analytics_project_catalogs(project_id) ON DELETE CASCADE,
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    entry jsonb NOT NULL CHECK (jsonb_typeof(entry)='object' AND octet_length(entry::text)<=262144),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(project_id,name,revision)
  )`
] as const;

export const ANALYTICS_PROJECT_CATALOG_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280003_add_analytics_project_catalogs",
    description:
      "Add immutable project semantic catalog revisions and idempotent management history.",
    statements: STATEMENTS
  })
] as const;

export const ANALYTICS_PROJECT_CATALOG_BOOTSTRAP_STATEMENTS = STATEMENTS.map((statement) =>
  statement.replaceAll(" IF NOT EXISTS", "")
);
