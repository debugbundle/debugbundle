import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `CREATE TABLE project_object_erasure_tasks (
    project_id uuid PRIMARY KEY,
    prefix_index smallint NOT NULL DEFAULT 0 CHECK (prefix_index BETWEEN 0 AND 8),
    cursor_key text CHECK (cursor_key IS NULL OR octet_length(cursor_key) BETWEEN 1 AND 1024),
    scan_round smallint NOT NULL DEFAULT 0 CHECK (scan_round BETWEEN 0 AND 2),
    next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    lease_token uuid,
    lease_expires_at timestamptz,
    failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
    last_error_code text CHECK (last_error_code IS NULL OR last_error_code IN ('listing_failed','delete_failed','response_invalid')),
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '90 days',
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
    CHECK (expires_at > created_at)
  )`,
  `CREATE INDEX project_object_erasure_tasks_due_idx
    ON project_object_erasure_tasks(next_attempt_at,created_at,project_id)`,
  `CREATE FUNCTION record_project_object_erasure_task() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO project_object_erasure_tasks(project_id)
      VALUES(OLD.id)
      ON CONFLICT(project_id) DO NOTHING;
      RETURN OLD;
    END
    $$`,
  `CREATE TRIGGER project_object_erasure_enqueue
    BEFORE DELETE ON projects FOR EACH ROW
    EXECUTE FUNCTION record_project_object_erasure_task()`
] as const;

export const PROJECT_OBJECT_ERASURE_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280011_add_project_object_erasure_tasks",
    description: "Record project object erasure in the same transaction as project deletion.",
    statements: STATEMENTS
  })
] as const;

export const PROJECT_OBJECT_ERASURE_BOOTSTRAP_STATEMENTS = STATEMENTS;
