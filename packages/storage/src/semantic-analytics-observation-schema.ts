import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS semantic_analytics_catalog_observations (
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    catalog_revision bigint NOT NULL CHECK (catalog_revision BETWEEN 1 AND 9007199254740991),
    event_name text NOT NULL CHECK (length(event_name) BETWEEN 1 AND 120),
    event_revision bigint NOT NULL CHECK (event_revision BETWEEN 1 AND 9007199254740991),
    producer_kind text NOT NULL CHECK (producer_kind IN ('browser','mobile','server')),
    observed_on date NOT NULL,
    accepted_count bigint NOT NULL CHECK (accepted_count BETWEEN 1 AND 9223372036854775807),
    first_occurred_at timestamptz NOT NULL,
    last_occurred_at timestamptz NOT NULL,
    last_accepted_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(project_id,catalog_revision,event_name,event_revision,producer_kind,observed_on),
    CHECK (last_occurred_at>=first_occurred_at)
  )`,
  `CREATE INDEX IF NOT EXISTS semantic_analytics_catalog_observations_project_date_idx
   ON semantic_analytics_catalog_observations(project_id,observed_on,event_name)`
] as const;

export const SEMANTIC_ANALYTICS_OBSERVATION_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280007_add_semantic_catalog_observations",
    description: "Add bounded aggregate observed-source coverage for accepted semantic events.",
    statements: STATEMENTS
  })
] as const;

export const SEMANTIC_ANALYTICS_OBSERVATION_BOOTSTRAP_STATEMENTS = STATEMENTS.map((statement) =>
  statement.replaceAll(" IF NOT EXISTS", "")
);
