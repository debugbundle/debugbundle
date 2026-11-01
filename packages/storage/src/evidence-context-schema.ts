import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

export const EVIDENCE_CONTEXT_BOOTSTRAP_STATEMENTS = [
  `CREATE TABLE evidence_ingestion_receipts (
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_id uuid NOT NULL, occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL,
    payload_hash text NOT NULL CHECK (length(payload_hash) = 64),
    is_diagnostic boolean NOT NULL, expires_at timestamptz NOT NULL,
    PRIMARY KEY (project_id,event_id)
  )`,
  `CREATE INDEX evidence_ingestion_receipt_expiry_idx ON evidence_ingestion_receipts (expires_at,project_id,event_id)`,
  `CREATE TABLE evidence_context_events (
    event_id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    service_name text NOT NULL, environment text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('failure', 'resource_observation', 'recovery')),
    occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL,
    failure_hash text NOT NULL CHECK (length(failure_hash) = 64),
    scope_kind text NOT NULL CHECK (scope_kind IN ('page', 'operation')),
    scope_hash text NOT NULL CHECK (length(scope_hash) = 64),
    session_hash text, trace_hash text, attempt_hash text,
    expires_at timestamptz NOT NULL,
    is_retained boolean NOT NULL DEFAULT true,
    CHECK (scope_kind <> 'page' OR session_hash IS NOT NULL)
  )`,
  `CREATE INDEX evidence_context_scope_idx ON evidence_context_events (project_id, service_name, environment, failure_hash, scope_kind, scope_hash, occurred_at, event_id)`,
  `CREATE INDEX evidence_context_expiry_idx ON evidence_context_events (expires_at, event_id)`
] as const;

export const EVIDENCE_CONTEXT_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202610260001_add_typed_evidence_context",
    description:
      "Index scoped diagnostic context with immutable receipts and bounded retention; add independent context policy override",
    statements: [
      ...EVIDENCE_CONTEXT_BOOTSTRAP_STATEMENTS,
      "ALTER TABLE capture_policies ADD COLUMN capture_diagnostic_context boolean"
    ]
  })
];
