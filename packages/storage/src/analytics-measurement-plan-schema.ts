import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS analytics_project_plans (
    project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    catalog_revision bigint NOT NULL CHECK (catalog_revision BETWEEN 0 AND 9007199254740991),
    content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    catalog jsonb NOT NULL CHECK (jsonb_typeof(catalog)='array' AND jsonb_array_length(catalog)<=100 AND octet_length(catalog::text)<=262144),
    reports jsonb NOT NULL CHECK (jsonb_typeof(reports)='array' AND jsonb_array_length(reports)<=100 AND octet_length(reports::text)<=262144),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_project_plan_revisions (
    project_id uuid NOT NULL REFERENCES analytics_project_plans(project_id) ON DELETE CASCADE,
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    catalog_revision bigint NOT NULL CHECK (catalog_revision BETWEEN 0 AND 9007199254740991),
    actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    idempotency_key uuid NOT NULL,
    mutation_hash text NOT NULL CHECK (mutation_hash ~ '^[a-f0-9]{64}$'),
    review_hash text NOT NULL CHECK (review_hash ~ '^[a-f0-9]{64}$'),
    content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    capacity_limit integer NOT NULL CHECK (capacity_limit BETWEEN 0 AND 100),
    legacy_saved_funnels integer NOT NULL CHECK (legacy_saved_funnels BETWEEN 0 AND 100),
    catalog jsonb NOT NULL CHECK (jsonb_typeof(catalog)='array' AND jsonb_array_length(catalog)<=100 AND octet_length(catalog::text)<=262144),
    reports jsonb NOT NULL CHECK (jsonb_typeof(reports)='array' AND jsonb_array_length(reports)<=100 AND octet_length(reports::text)<=262144),
    applied_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(project_id,revision),
    UNIQUE(project_id,actor_user_id,idempotency_key)
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_project_report_revisions (
    project_id uuid NOT NULL REFERENCES analytics_project_plans(project_id) ON DELETE CASCADE,
    report_key text NOT NULL CHECK (length(report_key) BETWEEN 1 AND 120),
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    definition jsonb NOT NULL CHECK (jsonb_typeof(definition)='object' AND octet_length(definition::text)<=262144),
    available_from timestamptz NOT NULL,
    PRIMARY KEY(project_id,report_key,revision)
  )`
] as const;

export const ANALYTICS_MEASUREMENT_PLAN_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280004_add_analytics_project_plans",
    description: "Add revisioned semantic project plans and prospective report definitions.",
    statements: STATEMENTS
  })
] as const;

export const ANALYTICS_MEASUREMENT_PLAN_BOOTSTRAP_STATEMENTS = STATEMENTS.map((statement, index) =>
  (index < 2
    ? statement.replace(
        "    content_hash text NOT NULL",
        "    business_measurement_enabled boolean NOT NULL DEFAULT false,\n    content_hash text NOT NULL"
      )
    : statement
  ).replaceAll(" IF NOT EXISTS", "")
);
