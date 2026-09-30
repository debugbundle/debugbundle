import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const CREATE_TABLE = `CREATE TABLE semantic_analytics_loss_days (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  occurred_on date NOT NULL,
  lost_count bigint NOT NULL CHECK (lost_count BETWEEN 1 AND 9223372036854775807),
  first_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,occurred_on),
  CHECK (last_recorded_at>=first_recorded_at)
)`;
const CREATE_EXPIRY_INDEX = `CREATE INDEX semantic_analytics_loss_days_expiry_idx
  ON semantic_analytics_loss_days(occurred_on,project_id)`;

export const SEMANTIC_ANALYTICS_LOSS_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280012_add_semantic_analytics_loss_days",
    description: "Retain project/day evidence of semantic jobs lost before projection.",
    statements: [
      CREATE_TABLE,
      `INSERT INTO semantic_analytics_loss_days(project_id,occurred_on,lost_count)
       SELECT project_id,(occurred_at AT TIME ZONE 'UTC')::date,count(*)::bigint
       FROM semantic_analytics_receipts WHERE raw_retention_outcome='lost'
       GROUP BY project_id,(occurred_at AT TIME ZONE 'UTC')::date`,
      CREATE_EXPIRY_INDEX
    ]
  })
] as const;

export const SEMANTIC_ANALYTICS_LOSS_BOOTSTRAP_STATEMENTS = [
  CREATE_TABLE,
  CREATE_EXPIRY_INDEX
] as const;
