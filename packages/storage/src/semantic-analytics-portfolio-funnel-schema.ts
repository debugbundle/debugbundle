import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `CREATE TABLE semantic_analytics_portfolio_funnel_facts (
    space_id uuid NOT NULL REFERENCES analytics_spaces(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    report_key text NOT NULL CHECK (length(report_key) BETWEEN 1 AND 120),
    report_revision bigint NOT NULL CHECK (report_revision BETWEEN 1 AND 9007199254740991),
    event_id uuid NOT NULL,
    occurred_at timestamptz NOT NULL,
    source_catalog_revision bigint NOT NULL CHECK (source_catalog_revision BETWEEN 1 AND 9007199254740991),
    source_entry_revision bigint NOT NULL CHECK (source_entry_revision BETWEEN 1 AND 9007199254740991),
    fact jsonb NOT NULL CHECK (jsonb_typeof(fact)='object' AND octet_length(fact::text)<=16384),
    PRIMARY KEY(space_id,project_id,report_key,report_revision,event_id),
    FOREIGN KEY(space_id,report_key,report_revision)
      REFERENCES analytics_space_report_revisions(space_id,report_key,revision) ON DELETE CASCADE
  )`,
  `CREATE INDEX semantic_analytics_portfolio_funnel_facts_source_idx
    ON semantic_analytics_portfolio_funnel_facts(space_id,project_id,report_key,report_revision,occurred_at,event_id)`,
  `CREATE INDEX semantic_analytics_portfolio_funnel_facts_expiry_idx
    ON semantic_analytics_portfolio_funnel_facts(occurred_at,project_id)`
] as const;

export const SEMANTIC_ANALYTICS_PORTFOLIO_FUNNEL_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280024_add_semantic_portfolio_funnel_facts",
    description: "Retain source-bound protected portfolio funnel evidence.",
    statements: STATEMENTS
  })
] as const;

export const SEMANTIC_ANALYTICS_PORTFOLIO_FUNNEL_BOOTSTRAP_STATEMENTS = STATEMENTS;
