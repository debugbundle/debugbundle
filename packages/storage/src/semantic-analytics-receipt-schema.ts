import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS semantic_analytics_receipts (
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_id uuid NOT NULL,
    content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[a-f0-9]{64}$'),
    operation_id text CHECK (operation_id IS NULL OR operation_id ~ '^sha256:[a-f0-9]{64}$'),
    raw_object_key text NOT NULL CHECK (length(raw_object_key) BETWEEN 1 AND 512),
    worker_job_id text NOT NULL CHECK (worker_job_id ~ '^[a-f0-9]{64}$'),
    principal text NOT NULL CHECK (principal IN ('server_writer','project_token','relay')),
    authority text NOT NULL CHECK (authority IN ('server_authoritative','client_observed')),
    scope jsonb NOT NULL CHECK (jsonb_typeof(scope)='object' AND octet_length(scope::text)<=512),
    scope_revision bigint NOT NULL CHECK (scope_revision BETWEEN 1 AND 9007199254740991),
    catalog_revision bigint NOT NULL CHECK (catalog_revision BETWEEN 1 AND 9007199254740991),
    identity_scope jsonb CHECK (identity_scope IS NULL OR (jsonb_typeof(identity_scope)='object' AND octet_length(identity_scope::text)<=512)),
    identity_verification text CHECK (identity_verification IS NULL OR identity_verification IN ('project_anonymous','first_party_association','server_namespace')),
    namespace_revision bigint CHECK (namespace_revision IS NULL OR namespace_revision BETWEEN 1 AND 9007199254740991),
    accepted_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL CHECK (expires_at > accepted_at AND expires_at <= accepted_at + interval '90 days'),
    PRIMARY KEY(project_id,event_id)
  )`,
  `CREATE INDEX IF NOT EXISTS semantic_analytics_receipts_expiry_idx ON semantic_analytics_receipts(expires_at)`,
  `CREATE TABLE IF NOT EXISTS semantic_analytics_operations (
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    namespace_scope_kind text NOT NULL CHECK (namespace_scope_kind IN ('project','space')),
    namespace_scope_id uuid NOT NULL,
    namespace_revision bigint NOT NULL CHECK (namespace_revision BETWEEN 0 AND 9007199254740991),
    operation_kind text NOT NULL CHECK (length(operation_kind) BETWEEN 1 AND 120),
    operation_id text NOT NULL CHECK (operation_id ~ '^sha256:[a-f0-9]{64}$'),
    first_event_id uuid NOT NULL,
    first_content_hash text NOT NULL CHECK (first_content_hash ~ '^sha256:[a-f0-9]{64}$'),
    accepted_at timestamptz NOT NULL,
    UNIQUE(project_id,namespace_scope_kind,namespace_scope_id,namespace_revision,operation_kind,operation_id)
  )`,
  `CREATE TABLE IF NOT EXISTS semantic_analytics_pending_objects (
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_id uuid NOT NULL,
    content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[a-f0-9]{64}$'),
    raw_object_key text NOT NULL CHECK (length(raw_object_key) BETWEEN 1 AND 512),
    status text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','deleting')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(project_id,event_id,content_hash)
  )`,
  `CREATE INDEX IF NOT EXISTS semantic_analytics_pending_cleanup_idx
   ON semantic_analytics_pending_objects(status,updated_at,project_id,event_id)`
] as const;

export const SEMANTIC_ANALYTICS_RECEIPT_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280006_add_semantic_analytics_receipts",
    description: "Add separate durable semantic event receipts and financial operation identities.",
    statements: STATEMENTS
  })
] as const;

export const SEMANTIC_ANALYTICS_RECEIPT_BOOTSTRAP_STATEMENTS = STATEMENTS.map((statement) => {
  const clean = statement.replaceAll(" IF NOT EXISTS", "");
  if (!clean.startsWith("CREATE TABLE semantic_analytics_receipts")) return clean;
  return clean.replace(
    "    accepted_at timestamptz NOT NULL,",
    `    occurred_at timestamptz NOT NULL,
    raw_status text NOT NULL DEFAULT 'active' CHECK (raw_status IN ('active','deleting','deleted')),
    raw_retention_outcome text CHECK (raw_retention_outcome IS NULL OR raw_retention_outcome IN ('job_completed','lost','erased')),
    raw_deleted_at timestamptz,
    raw_delete_retry_at timestamptz,
    identity_context_id uuid,
    identity_writer_id uuid,
    identity_producer_epoch uuid,
    CONSTRAINT semantic_analytics_receipts_identity_context_check CHECK (
      (identity_context_id IS NULL AND identity_writer_id IS NULL)
      OR (identity_context_id IS NOT NULL AND identity_writer_id IS NOT NULL
          AND principal='relay' AND identity_scope IS NOT NULL)
      OR (identity_context_id IS NULL AND identity_writer_id IS NOT NULL
          AND identity_producer_epoch IS NULL AND principal='server_writer'
          AND identity_verification='server_namespace' AND identity_scope IS NOT NULL)
    ),
    CONSTRAINT semantic_analytics_receipts_identity_epoch_check CHECK (
      identity_producer_epoch IS NULL OR
      (identity_context_id IS NOT NULL AND identity_writer_id IS NOT NULL)
    ),
    CONSTRAINT semantic_analytics_receipts_raw_state_check CHECK (
      (raw_status='active' AND raw_retention_outcome IS NULL AND raw_deleted_at IS NULL AND raw_delete_retry_at IS NULL)
      OR (raw_status='deleting' AND raw_retention_outcome IS NOT NULL AND raw_deleted_at IS NULL)
      OR (raw_status='deleted' AND raw_retention_outcome IS NOT NULL AND raw_deleted_at IS NOT NULL AND raw_delete_retry_at IS NULL)
    ),
    accepted_at timestamptz NOT NULL,`
  );
});
