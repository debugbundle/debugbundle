import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `CREATE TABLE semantic_analytics_funnel_facts (
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    report_key text NOT NULL CHECK (length(report_key) BETWEEN 1 AND 120),
    report_revision bigint NOT NULL CHECK (report_revision BETWEEN 1 AND 9007199254740991),
    event_id uuid NOT NULL,
    occurred_at timestamptz NOT NULL,
    fact jsonb NOT NULL CHECK (jsonb_typeof(fact)='object' AND octet_length(fact::text)<=16384),
    PRIMARY KEY(project_id,report_key,report_revision,event_id),
    FOREIGN KEY(project_id,report_key,report_revision)
      REFERENCES analytics_project_report_revisions(project_id,report_key,revision) ON DELETE CASCADE
  )`,
  `CREATE INDEX semantic_analytics_funnel_facts_project_occurred_idx
    ON semantic_analytics_funnel_facts(project_id,report_key,report_revision,occurred_at,event_id)`,
  `CREATE INDEX semantic_analytics_funnel_facts_expiry_idx
    ON semantic_analytics_funnel_facts(occurred_at,project_id)`
] as const;

export const SEMANTIC_ANALYTICS_FUNNEL_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280013_add_semantic_funnel_facts",
    description: "Retain protected project funnel facts compiled from verified durable events.",
    statements: STATEMENTS
  })
] as const;

export const SEMANTIC_ANALYTICS_FUNNEL_BOOTSTRAP_STATEMENTS = STATEMENTS;
