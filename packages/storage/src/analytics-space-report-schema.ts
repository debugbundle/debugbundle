import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS analytics_space_report_revisions (
    space_id uuid NOT NULL REFERENCES analytics_space_plans(space_id) ON DELETE CASCADE,
    report_key text NOT NULL CHECK (length(report_key) BETWEEN 1 AND 120),
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    definition jsonb NOT NULL CHECK (jsonb_typeof(definition)='object' AND octet_length(definition::text)<=262144),
    available_from timestamptz NOT NULL,
    PRIMARY KEY(space_id,report_key,revision)
  )`
] as const;

export const ANALYTICS_SPACE_REPORT_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280023_add_analytics_space_report_revisions",
    description: "Retain immutable prospective semantic space report definitions.",
    statements: STATEMENTS
  })
] as const;

export const ANALYTICS_SPACE_REPORT_BOOTSTRAP_STATEMENTS = STATEMENTS.map((statement) =>
  statement.replaceAll(" IF NOT EXISTS", "")
);
