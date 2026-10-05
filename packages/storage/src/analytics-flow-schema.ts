import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const statements = [
  `CREATE TABLE IF NOT EXISTS analytics_flow_definitions (
    id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    flow_key text NOT NULL, version integer NOT NULL DEFAULT 1, definition jsonb NOT NULL,
    archived_at timestamptz, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
    UNIQUE(project_id, flow_key)
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_flow_runs (
    id uuid PRIMARY KEY, flow_id uuid NOT NULL REFERENCES analytics_flow_definitions(id) ON DELETE CASCADE,
    version integer NOT NULL, context_hash text NOT NULL UNIQUE, origin text NOT NULL,
    start_index integer NOT NULL, last_index integer NOT NULL,
    source text NOT NULL DEFAULT 'unknown', campaign text NOT NULL DEFAULT '',
    started_at timestamptz NOT NULL, last_step_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
    CHECK (start_index BETWEEN 0 AND 7 AND last_index BETWEEN start_index AND 7),
    CHECK (expires_at > started_at AND expires_at <= started_at + interval '24 hours')
  )`,
  `CREATE INDEX IF NOT EXISTS analytics_flow_runs_expiry_idx ON analytics_flow_runs(expires_at, id)`,
  `CREATE TABLE IF NOT EXISTS analytics_flow_handoffs (
    id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES analytics_flow_runs(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE, step_index integer NOT NULL, expires_at timestamptz NOT NULL,
    redeemed_context_hash text, UNIQUE(run_id, step_index)
  )`,
  `CREATE INDEX IF NOT EXISTS analytics_flow_handoffs_expiry_idx ON analytics_flow_handoffs(expires_at, id)`,
  `CREATE TABLE IF NOT EXISTS analytics_flow_rollups (
    flow_id uuid NOT NULL REFERENCES analytics_flow_definitions(id) ON DELETE CASCADE,
    version integer NOT NULL, cohort_date date NOT NULL, step_index integer NOT NULL,
    source text NOT NULL, campaign text NOT NULL, reached bigint NOT NULL DEFAULT 0,
    unlinked bigint NOT NULL DEFAULT 0, elapsed_ms double precision NOT NULL DEFAULT 0,
    elapsed_count bigint NOT NULL DEFAULT 0,
    PRIMARY KEY(flow_id, version, cohort_date, step_index, source, campaign)
  )`,
  `CREATE INDEX IF NOT EXISTS analytics_flow_rollups_expiry_idx ON analytics_flow_rollups(cohort_date, flow_id)`
] as const;
export const ANALYTICS_FLOW_BOOTSTRAP_STATEMENTS = statements.map((statement) =>
  statement.replaceAll(" IF NOT EXISTS", "")
);
const migration = {
  id: "202610030001_add_public_analytics_flows",
  description: "Add customer project flow definitions, bounded continuity and aggregate reports.",
  statements
};
export const ANALYTICS_FLOW_SCHEMA_MIGRATIONS = [defineStorageSchemaMigration(migration)];
