import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `CREATE TABLE analytics_project_identity_revocations (
    context_id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    writer_id uuid NOT NULL,
    producer_epoch uuid NOT NULL,
    binding_hash text NOT NULL CHECK (binding_hash ~ '^sha256:[a-f0-9]{64}$'),
    revoked_at timestamptz NOT NULL
  )`,
  `CREATE INDEX analytics_project_identity_revocations_project_date_idx
    ON analytics_project_identity_revocations(project_id,revoked_at)`,
  `INSERT INTO analytics_project_identity_revocations(
     context_id,project_id,writer_id,producer_epoch,binding_hash,revoked_at)
   SELECT context_id,project_id,writer_id,producer_epoch,binding_hash,revoked_at
   FROM analytics_project_identity_contexts WHERE revoked_at IS NOT NULL`
] as const;

export const ANALYTICS_IDENTITY_REVOCATION_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280016_add_analytics_project_identity_revocations",
    description: "Retain minimal identity revocation fences after short-lived contexts expire.",
    statements: STATEMENTS
  })
] as const;

export const ANALYTICS_IDENTITY_REVOCATION_BOOTSTRAP_STATEMENTS = STATEMENTS.slice(0, 2);
