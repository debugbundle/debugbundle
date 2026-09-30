import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS analytics_space_plans (
    space_id uuid PRIMARY KEY REFERENCES analytics_spaces(id) ON DELETE CASCADE,
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    space_revision bigint NOT NULL CHECK (space_revision BETWEEN 1 AND 9007199254740991),
    content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    catalog jsonb NOT NULL CHECK (jsonb_typeof(catalog)='array' AND jsonb_array_length(catalog)<=100 AND octet_length(catalog::text)<=262144),
    reports jsonb NOT NULL CHECK (jsonb_typeof(reports)='array' AND jsonb_array_length(reports)<=100 AND octet_length(reports::text)<=262144),
    source_catalog_revisions jsonb NOT NULL CHECK (jsonb_typeof(source_catalog_revisions)='array' AND jsonb_array_length(source_catalog_revisions)<=20),
    coverage jsonb NOT NULL CHECK (jsonb_typeof(coverage)='array' AND jsonb_array_length(coverage)<=100),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_space_plan_revisions (
    space_id uuid NOT NULL REFERENCES analytics_space_plans(space_id) ON DELETE CASCADE,
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    space_revision bigint NOT NULL CHECK (space_revision BETWEEN 1 AND 9007199254740991),
    actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    idempotency_key uuid NOT NULL,
    mutation_hash text NOT NULL CHECK (mutation_hash ~ '^[a-f0-9]{64}$'),
    review_hash text NOT NULL CHECK (review_hash ~ '^[a-f0-9]{64}$'),
    content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    catalog jsonb NOT NULL CHECK (jsonb_typeof(catalog)='array' AND jsonb_array_length(catalog)<=100 AND octet_length(catalog::text)<=262144),
    reports jsonb NOT NULL CHECK (jsonb_typeof(reports)='array' AND jsonb_array_length(reports)<=100 AND octet_length(reports::text)<=262144),
    source_catalog_revisions jsonb NOT NULL CHECK (jsonb_typeof(source_catalog_revisions)='array' AND jsonb_array_length(source_catalog_revisions)<=20),
    coverage jsonb NOT NULL CHECK (jsonb_typeof(coverage)='array' AND jsonb_array_length(coverage)<=100),
    applied_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(space_id,revision),
    UNIQUE(space_id,actor_user_id,idempotency_key)
  )`
] as const;

export const ANALYTICS_SPACE_PLAN_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280005_add_analytics_space_plans",
    description: "Add revisioned source-complete semantic space plan declarations.",
    statements: STATEMENTS
  })
] as const;

export const ANALYTICS_SPACE_PLAN_BOOTSTRAP_STATEMENTS = STATEMENTS.map((statement) =>
  statement.replaceAll(" IF NOT EXISTS", "")
);
