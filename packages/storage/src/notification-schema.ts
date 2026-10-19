import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
const statements = [
  `CREATE TABLE IF NOT EXISTS notification_preferences (
    id uuid PRIMARY KEY,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
    project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
    preferences jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((user_id IS NULL) <> (organization_id IS NULL)),
    UNIQUE NULLS NOT DISTINCT(user_id, organization_id, project_id)
  )`,
  `CREATE TABLE IF NOT EXISTS notification_daily_batches (
    id uuid PRIMARY KEY, recipient text NOT NULL,
    schedule_time text NOT NULL, schedule_timezone text NOT NULL, due_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','suppressed','failed')),
    claim_token uuid, claimed_until timestamptz, attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL, last_error text, delivered_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(recipient, schedule_time, schedule_timezone, due_at)
  )`,
  `CREATE INDEX IF NOT EXISTS notification_daily_due_idx ON notification_daily_batches(next_attempt_at)
    WHERE status = 'pending'`,
  `CREATE TABLE IF NOT EXISTS notification_daily_items (
    id uuid PRIMARY KEY, batch_id uuid NOT NULL REFERENCES notification_daily_batches(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    alert_id uuid NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    recipient_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    episode_at timestamptz NOT NULL, occurred_at timestamptz NOT NULL, billable boolean NOT NULL DEFAULT true,
    notification_key text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(alert_id, incident_id, episode_at)
  )`,
  `CREATE INDEX IF NOT EXISTS notification_daily_items_batch_idx ON notification_daily_items(batch_id, incident_id)`,
  `CREATE INDEX IF NOT EXISTS notification_daily_items_cooldown_idx ON notification_daily_items(alert_id, notification_key, created_at)`,
  // Foreign-key cleanup and recipient/episode deduplication must not scan every retained item.
  `CREATE INDEX IF NOT EXISTS notification_daily_items_incident_idx ON notification_daily_items(incident_id, episode_at)`,
  `CREATE INDEX IF NOT EXISTS notification_daily_items_project_idx ON notification_daily_items(project_id, batch_id)`,
  `CREATE INDEX IF NOT EXISTS notification_daily_items_user_idx ON notification_daily_items(recipient_user_id) WHERE recipient_user_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS notification_daily_retention_idx ON notification_daily_batches(created_at)`,
  `CREATE INDEX IF NOT EXISTS notification_preferences_organization_idx ON notification_preferences(organization_id, project_id) WHERE organization_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS notification_preferences_project_idx ON notification_preferences(project_id) WHERE project_id IS NOT NULL`,
  // Allowance admissions survive queue/incident retention without storing recipients or telemetry.
  `CREATE TABLE IF NOT EXISTS notification_daily_allowance_usage (
    batch_id uuid NOT NULL,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    billable boolean NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(batch_id, project_id)
  )`,
  `CREATE INDEX IF NOT EXISTS notification_daily_allowance_project_idx ON notification_daily_allowance_usage(project_id, created_at)`
];
export const NOTIFICATION_BOOTSTRAP_STATEMENTS = statements.map((s) =>
  s.replaceAll(" IF NOT EXISTS", "")
);
export const NOTIFICATION_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202610180001_add_notification_preferences",
    description: "Add scoped notification policies and durable daily incident digest references.",
    statements
  })
];
