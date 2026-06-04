import { createHash } from "node:crypto";

import { REQUIRED_API_TABLES, REQUIRED_WORKER_TABLES, type Queryable } from "./migrations.js";

export interface StorageSchemaMigration {
  id: string;
  description: string;
  statements: readonly string[];
  checksum: string;
}

export interface StorageMigrationResult {
  applied: string[];
  already_applied: string[];
}

type StorageMigrationLedgerReconcileStatus =
  | "already_present"
  | "seeded_current_schema"
  | "not_current_schema";

const STORAGE_MIGRATION_LEDGER_TABLE = "storage_migration_ledger";

function computeMigrationChecksum(input: {
  id: string;
  description: string;
  statements: readonly string[];
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function defineStorageSchemaMigration(input: {
  id: string;
  description: string;
  statements: readonly string[];
}): StorageSchemaMigration {
  return {
    ...input,
    checksum: computeMigrationChecksum(input)
  };
}

export const STORAGE_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202605050001_add_auth_suspension_columns",
    description: "Add organization and membership suspension timestamps used by auth gates.",
    statements: [
      "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS suspended_at timestamptz",
      "ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS suspended_at timestamptz"
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605120001_add_github_device_authorizations",
    description: "Add persisted GitHub CLI bootstrap state for device-flow login.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS github_device_authorizations (
          id uuid PRIMARY KEY,
          device_code text NOT NULL UNIQUE,
          user_code text NOT NULL,
          verification_uri text NOT NULL,
          interval_seconds integer NOT NULL,
          expires_at timestamptz NOT NULL,
          accepted_terms_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          completed_at timestamptz,
          claimed_at timestamptz,
          terminal_error text,
          user_id uuid REFERENCES users(id) ON DELETE SET NULL,
          organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS github_device_authorizations_user_code_idx
        ON github_device_authorizations (user_code, created_at DESC)
      `,
      `
        CREATE INDEX IF NOT EXISTS github_device_authorizations_expires_at_idx
        ON github_device_authorizations (expires_at)
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605130001_allow_synthetic_webhook_test_deliveries_without_incident_fk",
    description:
      "Allow webhook test deliveries to persist without requiring a backing incidents row.",
    statements: ["ALTER TABLE webhook_deliveries ALTER COLUMN incident_id DROP NOT NULL"]
  }),
  defineStorageSchemaMigration({
    id: "202605130002_add_slack_destinations",
    description: "Add reusable encrypted Slack alert destinations scoped to organizations.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS slack_destinations (
          id uuid PRIMARY KEY,
          organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          slack_team_id text NOT NULL,
          slack_team_name text,
          slack_channel_id text NOT NULL,
          slack_channel_name text,
          webhook_url_ciphertext text NOT NULL,
          installed_by_member_id uuid REFERENCES users(id) ON DELETE SET NULL,
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (organization_id, slack_team_id, slack_channel_id)
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS slack_destinations_org_active_idx
        ON slack_destinations (organization_id, is_active, created_at)
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605140001_add_capture_policy_immediate_client_error_statuses",
    description: "Add nullable immediate client error status overrides to capture policies.",
    statements: [
      "ALTER TABLE capture_policies ADD COLUMN IF NOT EXISTS immediate_client_error_statuses jsonb"
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605150001_add_user_avatar_columns",
    description: "Add cached user avatar metadata for GitHub and Gravatar profile images.",
    statements: [
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_source text",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_object_key text",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_content_type text",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_updated_at timestamptz"
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605170001_add_alert_email_digest_queue",
    description: "Add queued email alert digests and digest items for fixed-window alert batching.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS alert_email_digests (
          id uuid PRIMARY KEY,
          project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          recipient text NOT NULL,
          status text NOT NULL,
          next_attempt_at timestamptz,
          claimed_at timestamptz,
          last_error text,
          delivered_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `,
      `
        CREATE UNIQUE INDEX IF NOT EXISTS alert_email_digests_project_recipient_pending_idx
        ON alert_email_digests (project_id, recipient)
        WHERE status = 'pending' AND claimed_at IS NULL
      `,
      `
        CREATE INDEX IF NOT EXISTS alert_email_digests_status_next_attempt_idx
        ON alert_email_digests (status, next_attempt_at)
      `,
      `
        CREATE TABLE IF NOT EXISTS alert_email_digest_items (
          id uuid PRIMARY KEY,
          digest_id uuid NOT NULL REFERENCES alert_email_digests(id) ON DELETE CASCADE,
          alert_id uuid NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
          project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
          condition_type text NOT NULL,
          dedupe_key text NOT NULL,
          payload jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (alert_id, incident_id, dedupe_key)
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS alert_email_digest_items_digest_created_idx
        ON alert_email_digest_items (digest_id, created_at ASC)
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605180001_add_skipped_github_dispatch_status",
    description:
      "Allow GitHub dispatch delivery history to record rate-limited skips without retrying them.",
    statements: [
      "ALTER TABLE github_dispatch_deliveries DROP CONSTRAINT IF EXISTS github_dispatch_deliveries_status_check",
      "ALTER TABLE github_dispatch_deliveries ADD CONSTRAINT github_dispatch_deliveries_status_check CHECK (status IN ('pending', 'retrying', 'delivered', 'failed', 'skipped'))"
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605180002_add_project_improvement_settings",
    description: "Add project-level automated improvement settings columns.",
    statements: [
      "ALTER TABLE projects ADD COLUMN IF NOT EXISTS automated_improvement_bundles_enabled boolean NOT NULL DEFAULT true",
      "ALTER TABLE projects ADD COLUMN IF NOT EXISTS improvement_bundle_sensitivity text NOT NULL DEFAULT 'balanced'",
      `
        ALTER TABLE projects
        DROP CONSTRAINT IF EXISTS projects_improvement_bundle_sensitivity_check
      `,
      `
        ALTER TABLE projects
        ADD CONSTRAINT projects_improvement_bundle_sensitivity_check
        CHECK (improvement_bundle_sensitivity IN ('high_confidence', 'balanced', 'verbose'))
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605180003_add_improvement_opportunities_and_bundle_generation_shape",
    description:
      "Add hosted improvement opportunity storage and allow bundle generations to reference improvements directly.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS improvement_opportunities (
          id uuid PRIMARY KEY,
          project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          service_id uuid REFERENCES services(id) ON DELETE SET NULL,
          service_name text NOT NULL,
          environment text NOT NULL DEFAULT 'production',
          kind text NOT NULL,
          status text NOT NULL DEFAULT 'open',
          severity text NOT NULL,
          confidence numeric NOT NULL,
          fingerprint text NOT NULL,
          title text NOT NULL,
          summary text NOT NULL,
          occurrence_count integer NOT NULL DEFAULT 1,
          evidence jsonb NOT NULL,
          first_detected_at timestamptz NOT NULL,
          last_detected_at timestamptz NOT NULL,
          last_source_event_id uuid,
          related_incident_ids uuid[] NOT NULL DEFAULT '{}',
          bundle_generation_number integer NOT NULL DEFAULT 0,
          bundle_created_at timestamptz,
          bundle_updated_at timestamptz,
          bundle_source_event_id uuid,
          bundle_failure_reason text,
          resolved_at timestamptz,
          resolved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
          snoozed_until timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (project_id, fingerprint)
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS improvement_opportunities_project_status_detected_idx
        ON improvement_opportunities (project_id, status, last_detected_at DESC)
      `,
      `
        CREATE INDEX IF NOT EXISTS improvement_opportunities_project_kind_detected_idx
        ON improvement_opportunities (project_id, kind, last_detected_at DESC)
      `,
      `
        CREATE INDEX IF NOT EXISTS improvement_opportunities_project_service_env_idx
        ON improvement_opportunities (project_id, service_id, environment)
      `,
      `
        CREATE TABLE IF NOT EXISTS improvement_opportunity_events (
          improvement_opportunity_id uuid NOT NULL REFERENCES improvement_opportunities(id) ON DELETE CASCADE,
          event_id uuid NOT NULL,
          event_type text NOT NULL,
          occurred_at timestamptz NOT NULL,
          PRIMARY KEY (improvement_opportunity_id, event_id)
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS improvement_opportunity_events_detected_idx
        ON improvement_opportunity_events (improvement_opportunity_id, occurred_at DESC, event_id DESC)
      `,
      "ALTER TABLE bundle_generations ALTER COLUMN incident_id DROP NOT NULL",
      "ALTER TABLE bundle_generations ADD COLUMN IF NOT EXISTS improvement_opportunity_id uuid REFERENCES improvement_opportunities(id) ON DELETE CASCADE",
      "ALTER TABLE bundle_generations DROP CONSTRAINT IF EXISTS bundle_generations_incident_id_source_event_id_key",
      "DROP INDEX IF EXISTS bundle_generations_incident_source_idx",
      "DROP INDEX IF EXISTS bundle_generations_improvement_source_idx",
      `
        CREATE UNIQUE INDEX IF NOT EXISTS bundle_generations_incident_source_idx
        ON bundle_generations (incident_id, source_event_id)
        WHERE incident_id IS NOT NULL
      `,
      `
        CREATE UNIQUE INDEX IF NOT EXISTS bundle_generations_improvement_source_idx
        ON bundle_generations (improvement_opportunity_id, source_event_id)
        WHERE improvement_opportunity_id IS NOT NULL
      `,
      "DROP INDEX IF EXISTS bundle_generations_improvement_generation_idx",
      `
        CREATE INDEX IF NOT EXISTS bundle_generations_improvement_generation_idx
        ON bundle_generations (improvement_opportunity_id, generation_number DESC)
        WHERE improvement_opportunity_id IS NOT NULL
      `,
      "ALTER TABLE bundle_generations DROP CONSTRAINT IF EXISTS bundle_generations_owner_check",
      `
        ALTER TABLE bundle_generations
        ADD CONSTRAINT bundle_generations_owner_check CHECK (
          (incident_id IS NOT NULL AND improvement_opportunity_id IS NULL AND bundle_type = 'failure')
          OR (incident_id IS NULL AND improvement_opportunity_id IS NOT NULL AND bundle_type = 'improvement')
        )
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605180004_add_operational_email_deliveries",
    description: "Add durable operational email delivery queue with retries and dedupe.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS operational_email_deliveries (
          id uuid PRIMARY KEY,
          organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          kind text NOT NULL,
          dedupe_key text NOT NULL,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          status text NOT NULL DEFAULT 'pending',
          attempt_count integer NOT NULL DEFAULT 0,
          next_attempt_at timestamptz,
          last_error text,
          delivered_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (organization_id, kind, dedupe_key)
        )
      `,
      `
        ALTER TABLE operational_email_deliveries
        DROP CONSTRAINT IF EXISTS operational_email_deliveries_kind_check
      `,
      `
        ALTER TABLE operational_email_deliveries
        ADD CONSTRAINT operational_email_deliveries_kind_check
        CHECK (kind IN ('webhook_auto_disabled', 'allowance_warning_80', 'allowance_limit_reached', 'retention_rotation_notice'))
      `,
      `
        ALTER TABLE operational_email_deliveries
        DROP CONSTRAINT IF EXISTS operational_email_deliveries_status_check
      `,
      `
        ALTER TABLE operational_email_deliveries
        ADD CONSTRAINT operational_email_deliveries_status_check
        CHECK (status IN ('pending', 'retrying', 'delivered', 'failed'))
      `,
      `
        CREATE INDEX IF NOT EXISTS operational_email_deliveries_status_next_attempt_idx
        ON operational_email_deliveries (status, next_attempt_at, created_at)
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605180005_add_github_improvement_dispatch_targets",
    description:
      "Allow GitHub dispatch deliveries to target either incidents or hosted improvements.",
    statements: [
      "ALTER TABLE github_dispatch_deliveries ALTER COLUMN incident_id DROP NOT NULL",
      "ALTER TABLE github_dispatch_deliveries RENAME COLUMN incident_fingerprint TO target_fingerprint",
      "ALTER TABLE github_dispatch_deliveries ADD COLUMN IF NOT EXISTS improvement_opportunity_id uuid REFERENCES improvement_opportunities(id) ON DELETE CASCADE",
      "DROP INDEX IF EXISTS github_dispatch_deliveries_rule_dedupe_key_idx",
      `
        CREATE UNIQUE INDEX IF NOT EXISTS github_dispatch_deliveries_rule_dedupe_key_idx
        ON github_dispatch_deliveries (rule_id, target_fingerprint, dedupe_key)
      `,
      "ALTER TABLE github_dispatch_deliveries DROP CONSTRAINT IF EXISTS github_dispatch_deliveries_check",
      `
        ALTER TABLE github_dispatch_deliveries
        ADD CONSTRAINT github_dispatch_deliveries_check CHECK (
          (incident_id IS NOT NULL AND improvement_opportunity_id IS NULL)
          OR (incident_id IS NULL AND improvement_opportunity_id IS NOT NULL)
        )
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605180006_add_missing_bundle_and_creator_columns",
    description:
      "Backfill creator ownership columns and incident bundle tracking columns that existed only in bootstrap schema.",
    statements: [
      "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS bundle_generation_number integer NOT NULL DEFAULT 0",
      "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS bundle_created_at timestamptz",
      "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS bundle_updated_at timestamptz",
      "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS bundle_source_event_id uuid",
      "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS bundle_source_occurred_at timestamptz",
      "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS bundle_trigger text",
      "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS bundle_failure_reason text",
      "ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS created_by_user_id uuid",
      `
        UPDATE alert_rules ar
        SET created_by_user_id = p.owner_user_id
        FROM projects p
        WHERE ar.project_id = p.id
          AND ar.created_by_user_id IS NULL
      `,
      "ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_created_by_user_id_fkey",
      `
        ALTER TABLE alert_rules
        ADD CONSTRAINT alert_rules_created_by_user_id_fkey
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
      `,
      "ALTER TABLE alert_rules ALTER COLUMN created_by_user_id SET NOT NULL",
      "ALTER TABLE agent_webhooks ADD COLUMN IF NOT EXISTS created_by_user_id uuid",
      `
        UPDATE agent_webhooks aw
        SET created_by_user_id = p.owner_user_id
        FROM projects p
        WHERE aw.project_id = p.id
          AND aw.created_by_user_id IS NULL
      `,
      "ALTER TABLE agent_webhooks DROP CONSTRAINT IF EXISTS agent_webhooks_created_by_user_id_fkey",
      `
        ALTER TABLE agent_webhooks
        ADD CONSTRAINT agent_webhooks_created_by_user_id_fkey
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
      `,
      "ALTER TABLE agent_webhooks ALTER COLUMN created_by_user_id SET NOT NULL",
      "ALTER TABLE github_dispatch_rules ADD COLUMN IF NOT EXISTS created_by_user_id uuid",
      `
        UPDATE github_dispatch_rules gdr
        SET created_by_user_id = p.owner_user_id
        FROM projects p
        WHERE gdr.project_id = p.id
          AND gdr.created_by_user_id IS NULL
      `,
      "ALTER TABLE github_dispatch_rules DROP CONSTRAINT IF EXISTS github_dispatch_rules_created_by_user_id_fkey",
      `
        ALTER TABLE github_dispatch_rules
        ADD CONSTRAINT github_dispatch_rules_created_by_user_id_fkey
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
      `,
      "ALTER TABLE github_dispatch_rules ALTER COLUMN created_by_user_id SET NOT NULL"
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605200001_limit_weekly_report_email_channel_per_project",
    description: "Keep weekly email reports singular per project.",
    statements: [
      `
        DELETE FROM weekly_report_channels
        WHERE id IN (
          SELECT id
          FROM (
            SELECT
              id,
              row_number() OVER (PARTITION BY project_id ORDER BY created_at ASC, id ASC) AS row_number
            FROM weekly_report_channels
            WHERE channel = 'email'
          ) ranked
          WHERE ranked.row_number > 1
        )
      `,
      `
        CREATE UNIQUE INDEX IF NOT EXISTS weekly_report_channels_project_email_unique_idx
        ON weekly_report_channels (project_id)
        WHERE channel = 'email'
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605220001_add_project_token_allowed_origins",
    description: "Add optional browser-origin allowlists to project ingestion tokens.",
    statements: [
      "ALTER TABLE project_tokens ADD COLUMN IF NOT EXISTS allowed_origins jsonb NOT NULL DEFAULT '[]'::jsonb"
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605260001_fix_weekly_report_delivery_conflict_index",
    description:
      "Ensure weekly report delivery dedupe rows and partial unique index exist for conflict claims.",
    statements: [
      `
        DELETE FROM weekly_report_deliveries
        WHERE id IN (
          SELECT id
          FROM (
            SELECT
              id,
              row_number() OVER (
                PARTITION BY weekly_report_channel_id, window_start, window_end
                ORDER BY created_at ASC, id ASC
              ) AS row_number
            FROM weekly_report_deliveries
            WHERE weekly_report_channel_id IS NOT NULL
          ) ranked
          WHERE ranked.row_number > 1
        )
      `,
      `
        CREATE UNIQUE INDEX IF NOT EXISTS weekly_report_deliveries_channel_window_idx
        ON weekly_report_deliveries (weekly_report_channel_id, window_start, window_end)
        WHERE weekly_report_channel_id IS NOT NULL
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605260001_set_high_confidence_as_project_improvement_default",
    description:
      "Make high-confidence the default hosted improvement sensitivity for new projects.",
    statements: [
      "ALTER TABLE projects ALTER COLUMN improvement_bundle_sensitivity SET DEFAULT 'high_confidence'"
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605260002_add_capture_rules",
    description: "Add persisted project capture rules for dynamic demote/sample/drop handling.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS capture_rules (
          id uuid PRIMARY KEY,
          project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          name text NOT NULL,
          description text,
          enabled boolean NOT NULL DEFAULT true,
          action text NOT NULL,
          matcher jsonb NOT NULL,
          sample_rate double precision,
          sample_event_class text,
          created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
          created_from_incident_id text,
          created_from_event_id text,
          expires_at timestamptz,
          hit_count bigint NOT NULL DEFAULT 0,
          last_matched_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS capture_rules_project_enabled_idx
        ON capture_rules (project_id, enabled)
      `,
      `
        CREATE INDEX IF NOT EXISTS capture_rules_project_updated_idx
        ON capture_rules (project_id, updated_at DESC)
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202606020001_add_github_marketplace_tracking",
    description: "Add GitHub Marketplace purchase tracking tables and webhook idempotency ledger.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS processed_github_marketplace_events (
          delivery_id text PRIMARY KEY,
          event_name text NOT NULL,
          marketplace_account_id bigint,
          action text,
          processed_at timestamptz NOT NULL DEFAULT now()
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS processed_github_marketplace_events_account_idx
        ON processed_github_marketplace_events (marketplace_account_id, processed_at DESC)
      `,
      `
        CREATE TABLE IF NOT EXISTS github_marketplace_accounts (
          id uuid PRIMARY KEY,
          organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
          marketplace_account_id bigint NOT NULL UNIQUE,
          marketplace_account_login text NOT NULL,
          marketplace_account_type text NOT NULL CHECK (marketplace_account_type IN ('Organization', 'User')),
          marketplace_account_node_id text,
          marketplace_listing_plan_id bigint NOT NULL,
          marketplace_listing_plan_name text NOT NULL,
          marketplace_plan_price_model text,
          billing_cycle text CHECK (billing_cycle IN ('monthly', 'yearly')),
          unit_count integer,
          on_free_trial boolean NOT NULL DEFAULT false,
          free_trial_ends_on timestamptz,
          next_billing_date timestamptz,
          effective_date timestamptz NOT NULL,
          installation_id bigint,
          marketplace_purchase_status text NOT NULL
            CHECK (marketplace_purchase_status IN ('purchased', 'cancelled', 'pending_change', 'pending_change_cancelled', 'changed')),
          last_event_id text NOT NULL,
          last_event_action text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS github_marketplace_accounts_org_idx
        ON github_marketplace_accounts (organization_id, updated_at DESC)
      `,
      `
        CREATE UNIQUE INDEX IF NOT EXISTS github_marketplace_accounts_installation_idx
        ON github_marketplace_accounts (installation_id)
        WHERE installation_id IS NOT NULL
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202606030001_add_alert_notification_cooldowns_and_rule_window",
    description:
      "Add configurable alert cooldown windows and notification keys for cross-incident suppression.",
    statements: [
      "ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS cooldown_seconds integer",
      "UPDATE alert_rules SET cooldown_seconds = 0 WHERE cooldown_seconds IS NULL",
      "ALTER TABLE alert_rules ALTER COLUMN cooldown_seconds SET DEFAULT 0",
      "ALTER TABLE alert_rules ALTER COLUMN cooldown_seconds SET NOT NULL",
      "ALTER TABLE alert_deliveries ADD COLUMN IF NOT EXISTS notification_key text",
      "UPDATE alert_deliveries SET notification_key = dedupe_key WHERE notification_key IS NULL",
      "ALTER TABLE alert_deliveries ALTER COLUMN notification_key SET DEFAULT ''",
      "ALTER TABLE alert_deliveries ALTER COLUMN notification_key SET NOT NULL",
      `
        CREATE INDEX IF NOT EXISTS alert_deliveries_alert_notification_idx
        ON alert_deliveries (alert_id, notification_key, created_at DESC)
      `,
      "ALTER TABLE alert_email_digest_items ADD COLUMN IF NOT EXISTS notification_key text",
      "UPDATE alert_email_digest_items SET notification_key = dedupe_key WHERE notification_key IS NULL",
      "ALTER TABLE alert_email_digest_items ALTER COLUMN notification_key SET DEFAULT ''",
      "ALTER TABLE alert_email_digest_items ALTER COLUMN notification_key SET NOT NULL",
      `
        CREATE INDEX IF NOT EXISTS alert_email_digest_items_alert_notification_idx
        ON alert_email_digest_items (alert_id, notification_key, created_at DESC)
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202606040001_add_no_card_trial_billing_state",
    description: "Add organization no-card trial metadata and the lifecycle event ledger.",
    statements: [
      "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_plan text",
      "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_started_at timestamptz",
      "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz",
      "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_used_at timestamptz",
      "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_converted_at timestamptz",
      "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_expired_at timestamptz",
      "ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_trial_plan_check",
      `
        ALTER TABLE organizations
        ADD CONSTRAINT organizations_trial_plan_check
        CHECK (trial_plan IN ('solo', 'team') OR trial_plan IS NULL)
      `,
      "ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_trial_window_check",
      `
        ALTER TABLE organizations
        ADD CONSTRAINT organizations_trial_window_check
        CHECK (
          trial_started_at IS NULL
          OR trial_ends_at IS NULL
          OR trial_ends_at > trial_started_at
        )
      `,
      "ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_trial_started_requires_plan_check",
      `
        ALTER TABLE organizations
        ADD CONSTRAINT organizations_trial_started_requires_plan_check
        CHECK (
          trial_started_at IS NULL
          OR trial_plan IS NOT NULL
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS trial_lifecycle_events (
          id uuid PRIMARY KEY,
          organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          event_type text NOT NULL,
          dedupe_key text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (organization_id, event_type, dedupe_key)
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS trial_lifecycle_events_org_event_created_idx
        ON trial_lifecycle_events (organization_id, event_type, created_at DESC)
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202606040002_expand_operational_emails_for_trial_lifecycle",
    description:
      "Allow operational email deliveries without a project and add no-card trial email kinds.",
    statements: [
      "ALTER TABLE operational_email_deliveries ALTER COLUMN project_id DROP NOT NULL",
      "ALTER TABLE operational_email_deliveries DROP CONSTRAINT IF EXISTS operational_email_deliveries_kind_check",
      `
        ALTER TABLE operational_email_deliveries
        ADD CONSTRAINT operational_email_deliveries_kind_check
        CHECK (
          kind IN (
            'webhook_auto_disabled',
            'allowance_warning_80',
            'allowance_limit_reached',
            'retention_rotation_notice',
            'trial_started',
            'trial_ending_soon',
            'trial_expired',
            'trial_converted'
          )
        )
      `
    ]
  })
] as const;

function validateStorageSchemaMigrations(migrations: readonly StorageSchemaMigration[]): void {
  const ids = new Set<string>();
  let previousId = "";

  for (const migration of migrations) {
    if (!/^\d{12}_[a-z0-9_]+$/.test(migration.id)) {
      throw new Error(`storage_migration_invalid_id: ${migration.id}`);
    }

    if (ids.has(migration.id)) {
      throw new Error(`storage_migration_duplicate_id: ${migration.id}`);
    }

    if (previousId.length > 0 && migration.id <= previousId) {
      throw new Error(`storage_migration_order_invalid: ${migration.id}`);
    }

    if (migration.statements.length === 0) {
      throw new Error(`storage_migration_empty: ${migration.id}`);
    }

    for (const statement of migration.statements) {
      if (statement.trim().length === 0) {
        throw new Error(`storage_migration_statement_empty: ${migration.id}`);
      }
    }

    ids.add(migration.id);
    previousId = migration.id;
  }
}

const CURRENT_SCHEMA_SENTINEL_COLUMNS = [
  { table_name: "agent_webhooks", column_name: "created_by_user_id" },
  { table_name: "alert_rules", column_name: "created_by_user_id" },
  { table_name: "alert_rules", column_name: "cooldown_seconds" },
  { table_name: "capture_policies", column_name: "immediate_client_error_statuses" },
  { table_name: "github_dispatch_rules", column_name: "created_by_user_id" },
  { table_name: "github_dispatch_deliveries", column_name: "target_fingerprint" },
  { table_name: "incidents", column_name: "bundle_source_occurred_at" },
  { table_name: "incidents", column_name: "bundle_trigger" },
  { table_name: "organization_members", column_name: "suspended_at" },
  { table_name: "organizations", column_name: "suspended_at" },
  { table_name: "organizations", column_name: "trial_plan" },
  { table_name: "project_tokens", column_name: "allowed_origins" },
  { table_name: "projects", column_name: "improvement_bundle_sensitivity" },
  { table_name: "trial_lifecycle_events", column_name: "dedupe_key" },
  { table_name: "users", column_name: "avatar_source" }
] as const;

async function listRequiredStorageTables(db: Queryable): Promise<Set<string>> {
  const requiredTables = Array.from(new Set([...REQUIRED_API_TABLES, ...REQUIRED_WORKER_TABLES]));
  const rows = await db.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [requiredTables]
  );

  return new Set(rows.rows.map((row) => row.table_name));
}

async function listCurrentSchemaSentinelColumns(db: Queryable): Promise<Set<string>> {
  const tableNames = Array.from(
    new Set(
      CURRENT_SCHEMA_SENTINEL_COLUMNS.map((column) => column.table_name).concat(
        "github_dispatch_deliveries"
      )
    )
  );
  const rows = await db.query<{ table_name: string; column_name: string }>(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [tableNames]
  );

  return new Set(rows.rows.map((row) => `${row.table_name}.${row.column_name}`));
}

async function isCurrentStorageSchemaBaseline(db: Queryable): Promise<boolean> {
  const requiredTables = await listRequiredStorageTables(db);
  const expectedRequiredTables = new Set([...REQUIRED_API_TABLES, ...REQUIRED_WORKER_TABLES]);

  for (const tableName of expectedRequiredTables) {
    if (!requiredTables.has(tableName)) {
      return false;
    }
  }

  const sentinelColumns = await listCurrentSchemaSentinelColumns(db);
  for (const sentinel of CURRENT_SCHEMA_SENTINEL_COLUMNS) {
    if (!sentinelColumns.has(`${sentinel.table_name}.${sentinel.column_name}`)) {
      return false;
    }
  }

  if (sentinelColumns.has("github_dispatch_deliveries.incident_fingerprint")) {
    return false;
  }

  return true;
}

async function recordAppliedMigrations(
  db: Queryable,
  migrations: readonly StorageSchemaMigration[]
): Promise<void> {
  for (const migration of migrations) {
    await db.query(
      `
        INSERT INTO ${STORAGE_MIGRATION_LEDGER_TABLE} (id, description, checksum, applied_at)
        VALUES ($1, $2, $3, now())
      `,
      [migration.id, migration.description, migration.checksum]
    );
  }
}

async function reconcileMigrationLedgerInTransaction(
  db: Queryable,
  appliedChecksums: Map<string, string>
): Promise<StorageMigrationLedgerReconcileStatus> {
  if (appliedChecksums.size > 0) {
    return "already_present";
  }

  if (!(await isCurrentStorageSchemaBaseline(db))) {
    return "not_current_schema";
  }

  await recordAppliedMigrations(db, STORAGE_SCHEMA_MIGRATIONS);
  appliedChecksums.clear();
  for (const migration of STORAGE_SCHEMA_MIGRATIONS) {
    appliedChecksums.set(migration.id, migration.checksum);
  }
  return "seeded_current_schema";
}

async function ensureLegacyGitHubDispatchFingerprintCompatibility(
  db: Queryable,
  appliedChecksums: Map<string, string>
): Promise<void> {
  if (appliedChecksums.size > 0) {
    return;
  }

  const rows = await db.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'github_dispatch_deliveries'
        AND column_name IN ('incident_fingerprint', 'target_fingerprint')
    `,
    []
  );

  const columns = new Set(rows.rows.map((row) => row.column_name));
  if (!columns.has("target_fingerprint") || columns.has("incident_fingerprint")) {
    return;
  }

  await db.query(
    "ALTER TABLE github_dispatch_deliveries RENAME COLUMN target_fingerprint TO incident_fingerprint",
    []
  );
}

async function ensureMigrationLedger(db: Queryable): Promise<void> {
  await db.query(
    `
      CREATE TABLE IF NOT EXISTS ${STORAGE_MIGRATION_LEDGER_TABLE} (
        id text PRIMARY KEY,
        description text NOT NULL,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `,
    []
  );
}

async function readAppliedMigrations(db: Queryable): Promise<Map<string, string>> {
  const rows = await db.query<{ id: string; checksum: string }>(
    `
      SELECT id, checksum
      FROM ${STORAGE_MIGRATION_LEDGER_TABLE}
      WHERE id = ANY($1::text[])
      ORDER BY id ASC
    `,
    [STORAGE_SCHEMA_MIGRATIONS.map((migration) => migration.id)]
  );

  return new Map(rows.rows.map((row) => [row.id, row.checksum]));
}

export async function migrateStorageSchema(db: Queryable): Promise<StorageMigrationResult> {
  validateStorageSchemaMigrations(STORAGE_SCHEMA_MIGRATIONS);

  await db.query("BEGIN", []);

  try {
    await ensureMigrationLedger(db);
    const appliedChecksums = await readAppliedMigrations(db);
    const ledgerStatus = await reconcileMigrationLedgerInTransaction(db, appliedChecksums);
    const applied: string[] = [];
    const alreadyApplied: string[] = [];

    if (ledgerStatus === "seeded_current_schema") {
      await db.query("COMMIT", []);

      return {
        applied,
        already_applied: STORAGE_SCHEMA_MIGRATIONS.map((migration) => migration.id)
      };
    }

    await ensureLegacyGitHubDispatchFingerprintCompatibility(db, appliedChecksums);

    for (const migration of STORAGE_SCHEMA_MIGRATIONS) {
      const appliedChecksum = appliedChecksums.get(migration.id);
      if (appliedChecksum !== undefined) {
        if (appliedChecksum !== migration.checksum) {
          throw new Error(`storage_migration_checksum_mismatch: ${migration.id}`);
        }

        alreadyApplied.push(migration.id);
        continue;
      }

      for (const statement of migration.statements) {
        await db.query(statement, []);
      }

      await recordAppliedMigrations(db, [migration]);
      applied.push(migration.id);
    }

    await db.query("COMMIT", []);

    return {
      applied,
      already_applied: alreadyApplied
    };
  } catch (error) {
    try {
      await db.query("ROLLBACK", []);
    } catch (rollbackError) {
      const migrationError = error instanceof Error ? error.message : String(error);
      const rollbackMessage =
        rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      throw new Error(
        `storage_migration_rollback_failed: migration_error=${migrationError}; rollback_error=${rollbackMessage}`
      );
    }

    throw error;
  }
}

export async function seedStorageMigrationLedgerForCurrentSchema(
  db: Queryable
): Promise<StorageMigrationLedgerReconcileStatus> {
  validateStorageSchemaMigrations(STORAGE_SCHEMA_MIGRATIONS);

  await db.query("BEGIN", []);

  try {
    await ensureMigrationLedger(db);
    const appliedChecksums = await readAppliedMigrations(db);
    const status = await reconcileMigrationLedgerInTransaction(db, appliedChecksums);
    await db.query("COMMIT", []);
    return status;
  } catch (error) {
    try {
      await db.query("ROLLBACK", []);
    } catch (rollbackError) {
      const reconcileError = error instanceof Error ? error.message : String(error);
      const rollbackMessage =
        rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      throw new Error(
        `storage_migration_ledger_reconcile_rollback_failed: reconcile_error=${reconcileError}; rollback_error=${rollbackMessage}`
      );
    }

    throw error;
  }
}

export async function assertStorageSchemaMigrationsApplied(db: Queryable): Promise<void> {
  validateStorageSchemaMigrations(STORAGE_SCHEMA_MIGRATIONS);

  const ledgerResult = await db.query<{ relation_name: string | null }>(
    `SELECT to_regclass('public.${STORAGE_MIGRATION_LEDGER_TABLE}')::text AS relation_name`,
    []
  );

  if (
    ledgerResult.rows[0]?.relation_name === null ||
    ledgerResult.rows[0]?.relation_name === undefined
  ) {
    throw new Error(
      `storage_schema_missing_migrations: ${STORAGE_SCHEMA_MIGRATIONS.map((migration) => migration.id).join(",")}`
    );
  }

  const appliedChecksums = await readAppliedMigrations(db);
  const missing: string[] = [];

  for (const migration of STORAGE_SCHEMA_MIGRATIONS) {
    const appliedChecksum = appliedChecksums.get(migration.id);
    if (appliedChecksum === undefined) {
      missing.push(migration.id);
      continue;
    }

    if (appliedChecksum !== migration.checksum) {
      throw new Error(`storage_migration_checksum_mismatch: ${migration.id}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(`storage_schema_missing_migrations: ${missing.join(",")}`);
  }
}
