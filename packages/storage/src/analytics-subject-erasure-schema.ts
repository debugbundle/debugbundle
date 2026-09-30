import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `CREATE TABLE analytics_project_subject_erasures (
    task_id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    writer_id uuid NOT NULL,
    idempotency_key uuid NOT NULL,
    mutation_hash text NOT NULL CHECK (mutation_hash ~ '^[a-f0-9]{64}$'),
    namespace_revision bigint NOT NULL CHECK (namespace_revision BETWEEN 1 AND 9007199254740991),
    subject_kind text NOT NULL CHECK (subject_kind IN ('anonymous','user','account')),
    subject_ref text NOT NULL CHECK (subject_ref ~ '^sha256:[a-f0-9]{64}$'),
    cutoff_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','complete')),
    next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    lease_token uuid,
    lease_expires_at timestamptz,
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
    completed_at timestamptz,
    UNIQUE(project_id,writer_id,idempotency_key),
    CHECK ((lease_token IS NULL)=(lease_expires_at IS NULL)),
    CHECK ((status='complete')=(completed_at IS NOT NULL))
  )`,
  `CREATE INDEX analytics_project_subject_erasures_lookup_idx
   ON analytics_project_subject_erasures(
     project_id,namespace_revision,subject_kind,subject_ref,cutoff_at)`,
  `CREATE INDEX analytics_project_subject_erasures_due_idx
   ON analytics_project_subject_erasures(next_attempt_at,task_id)
   WHERE status='pending'`
] as const;

export const ANALYTICS_SUBJECT_ERASURE_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280021_add_analytics_subject_erasure_tasks",
    description: "Persist project-subject erasure cutoffs and leased deletion tasks.",
    statements: STATEMENTS
  })
] as const;

export const ANALYTICS_SUBJECT_ERASURE_BOOTSTRAP_STATEMENTS = STATEMENTS;
