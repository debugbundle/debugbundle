import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const statements = [
  `ALTER TABLE alert_deliveries ADD COLUMN IF NOT EXISTS coalescing_key text`,
  `CREATE INDEX IF NOT EXISTS alert_deliveries_coalescing_idx ON alert_deliveries (alert_id, coalescing_key, created_at) WHERE coalescing_key IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS browser_recovery_events (
    event_id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    service_name text NOT NULL,
    environment text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('resource', 'recovery')),
    occurred_at timestamptz NOT NULL,
    session_hash text,
    trace_hash text,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
    CHECK (session_hash IS NOT NULL OR trace_hash IS NOT NULL)
  )`,
  `CREATE INDEX IF NOT EXISTS browser_recovery_events_scope_idx ON browser_recovery_events (project_id, service_name, environment, kind, occurred_at)`,
  `CREATE INDEX IF NOT EXISTS browser_recovery_events_expiry_idx ON browser_recovery_events (expires_at)`
] as const;

export const BROWSER_RECOVERY_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609220001_add_browser_recovery_context",
    description:
      "Index browser recovery context and separate burst suppression from alert cooldown identity",
    statements
  })
];
export const BROWSER_RECOVERY_BOOTSTRAP_STATEMENTS = statements
  .filter((statement) => !statement.startsWith("ALTER TABLE"))
  .map((statement) => statement.replaceAll(" IF NOT EXISTS", ""));
