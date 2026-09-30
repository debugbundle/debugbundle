import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS semantic_analytics_orphan_sweep_state (
    id smallint PRIMARY KEY CHECK (id=1),
    last_key text CHECK (last_key IS NULL OR (length(last_key) BETWEEN 1 AND 512 AND last_key LIKE 'semantic-events/%')),
    version bigint NOT NULL DEFAULT 0 CHECK (version BETWEEN 0 AND 9007199254740991),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`
] as const;

export const SEMANTIC_ANALYTICS_ORPHAN_SWEEP_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280008_add_semantic_orphan_sweep_state",
    description: "Add bounded resumable semantic raw-object orphan sweep progress.",
    statements: STATEMENTS
  })
] as const;

export const SEMANTIC_ANALYTICS_ORPHAN_SWEEP_BOOTSTRAP_STATEMENTS = STATEMENTS.map((statement) =>
  statement.replaceAll(" IF NOT EXISTS", "")
);
