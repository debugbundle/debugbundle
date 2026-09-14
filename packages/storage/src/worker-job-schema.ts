import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

export const WORKER_JOB_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS worker_jobs (
    id text PRIMARY KEY,
    job_name text NOT NULL,
    project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
    payload jsonb,
    depends_on text REFERENCES worker_jobs(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    operator_retries integer NOT NULL DEFAULT 0 CHECK (operator_retries >= 0),
    available_at timestamptz NOT NULL DEFAULT now(),
    lease_token uuid,
    lease_expires_at timestamptz,
    last_error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
    CHECK ((status = 'running') = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
    CHECK (payload IS NULL OR jsonb_typeof(payload) = 'object')
  )`,
  `CREATE INDEX IF NOT EXISTS worker_jobs_pending_idx ON worker_jobs(job_name, available_at, created_at, id) WHERE status = 'pending'`,
  `CREATE INDEX IF NOT EXISTS worker_jobs_running_idx ON worker_jobs(lease_expires_at) WHERE status = 'running'`,
  `CREATE INDEX IF NOT EXISTS worker_jobs_expiry_idx ON worker_jobs(expires_at)`,
  `CREATE INDEX IF NOT EXISTS worker_jobs_project_idx ON worker_jobs(project_id)`,
  `CREATE INDEX IF NOT EXISTS worker_jobs_dependency_idx ON worker_jobs(depends_on) WHERE depends_on IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS worker_jobs_status_idx ON worker_jobs(status, created_at) WHERE status IN ('pending', 'running', 'failed')`
] as const;

export const WORKER_JOB_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609130001_add_durable_worker_jobs",
    description: "Persist worker handoffs, bounded retries, and fenced processing leases",
    statements: WORKER_JOB_SCHEMA_STATEMENTS
  })
];

// Bootstrap only creates an empty schema; upgrades use the forward migration above.
export const WORKER_JOB_BOOTSTRAP_STATEMENTS = WORKER_JOB_SCHEMA_STATEMENTS.map((statement) =>
  statement.replaceAll(" IF NOT EXISTS", "")
);
