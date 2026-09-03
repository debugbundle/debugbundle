import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

export const LATE_STORAGE_SCHEMA_MIGRATIONS = [
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
  }),
  defineStorageSchemaMigration({
    id: "202606050001_preserve_github_dispatch_history_when_rules_are_deleted",
    description:
      "Snapshot GitHub rule names onto deliveries and decouple delivery history from live rule rows.",
    statements: [
      "ALTER TABLE github_dispatch_deliveries ADD COLUMN IF NOT EXISTS rule_name text",
      `
        UPDATE github_dispatch_deliveries deliveries
        SET rule_name = rules.name
        FROM github_dispatch_rules rules
        WHERE deliveries.rule_id = rules.id
          AND deliveries.rule_name IS NULL
      `,
      "ALTER TABLE github_dispatch_deliveries ALTER COLUMN rule_name SET DEFAULT ''",
      "UPDATE github_dispatch_deliveries SET rule_name = '' WHERE rule_name IS NULL",
      "ALTER TABLE github_dispatch_deliveries ALTER COLUMN rule_name SET NOT NULL",
      "ALTER TABLE github_dispatch_deliveries DROP CONSTRAINT IF EXISTS github_dispatch_deliveries_rule_id_fkey"
    ]
  }),
  defineStorageSchemaMigration({
    id: "202606050002_add_durable_plan_cleanup_tasks",
    description:
      "Persist retryable external cleanup tasks for side effects that cannot be completed transactionally.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS plan_cleanup_tasks (
          id uuid PRIMARY KEY,
          organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          cleanup_type text NOT NULL
            CHECK (cleanup_type IN ('delete_improvement_bundle_objects')),
          attempt_count integer NOT NULL DEFAULT 0,
          last_error text,
          next_attempt_at timestamptz NOT NULL DEFAULT now(),
          completed_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (project_id, cleanup_type)
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS plan_cleanup_tasks_pending_idx
        ON plan_cleanup_tasks (completed_at, next_attempt_at, created_at)
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202606080001_add_capture_policy_client_error_path_rules",
    description: "Add path-scoped client error incident promotion rules to capture policies.",
    statements: [
      "ALTER TABLE capture_policies ADD COLUMN IF NOT EXISTS immediate_client_error_path_rules jsonb"
    ]
  }),
  defineStorageSchemaMigration({
    id: "202606100001_add_project_usage_counters",
    description: "Add durable project-level raw ingestion counters for project dashboard metrics.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS project_usage_counters (
          project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          period_starts_at timestamptz NOT NULL,
          raw_ingested_events integer NOT NULL DEFAULT 0,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (project_id, period_starts_at)
        )
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202606100002_add_account_deletion_challenges",
    description: "Add scoped OTP challenges for account deletion confirmation.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS account_deletion_challenges (
          id uuid PRIMARY KEY,
          organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          email text NOT NULL,
          code_hash text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          expires_at timestamptz NOT NULL,
          used_at timestamptz
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS account_deletion_challenges_scope_idx
        ON account_deletion_challenges (organization_id, user_id, lower(email), created_at DESC)
      `,
      `
        CREATE INDEX IF NOT EXISTS account_deletion_challenges_code_hash_idx
        ON account_deletion_challenges (code_hash)
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202606100003_add_account_analytics_and_payment_retention",
    description: "Add deletion-safe account analytics and payment retention ledgers.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS account_analytics_accounts (
          analytics_account_id uuid PRIMARY KEY,
          organization_id uuid UNIQUE,
          organization_id_hash text NOT NULL UNIQUE,
          created_at timestamptz NOT NULL,
          first_seen_at timestamptz NOT NULL,
          metrics_collection_started_at timestamptz NOT NULL,
          backfilled_from_retained_rows_at timestamptz,
          deleted_at timestamptz,
          initial_plan text,
          latest_known_plan text,
          latest_capacity_units integer,
          account_deleted boolean NOT NULL DEFAULT false,
          metrics_schema_version integer NOT NULL DEFAULT 1,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS account_metric_periods (
          analytics_account_id uuid NOT NULL REFERENCES account_analytics_accounts(analytics_account_id),
          period_grain text NOT NULL CHECK (period_grain IN ('day', 'month', 'year', 'lifetime')),
          period_starts_at timestamptz NOT NULL,
          metric_key text NOT NULL,
          metric_value bigint NOT NULL DEFAULT 0,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (analytics_account_id, period_grain, period_starts_at, metric_key)
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS account_metric_periods_grain_period_metric_idx
        ON account_metric_periods (period_grain, period_starts_at, metric_key)
      `,
      `
        CREATE INDEX IF NOT EXISTS account_metric_periods_account_grain_period_idx
        ON account_metric_periods (analytics_account_id, period_grain, period_starts_at)
      `,
      `
        CREATE TABLE IF NOT EXISTS account_metric_events (
          dedupe_key_hash text PRIMARY KEY,
          analytics_account_id uuid NOT NULL REFERENCES account_analytics_accounts(analytics_account_id),
          metric_source text NOT NULL,
          occurred_at timestamptz NOT NULL,
          recorded_at timestamptz NOT NULL DEFAULT now(),
          metric_deltas jsonb NOT NULL
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS account_payment_retention_records (
          id uuid PRIMARY KEY,
          analytics_account_id uuid NOT NULL REFERENCES account_analytics_accounts(analytics_account_id),
          organization_id_hash text NOT NULL,
          provider text NOT NULL,
          plan text,
          billing_state text,
          stripe_customer_id text,
          stripe_subscription_id text,
          billing_period_starts_at timestamptz,
          billing_period_ends_at timestamptz,
          additional_capacity_units integer,
          last_billing_event_id text,
          account_deleted_at timestamptz NOT NULL,
          recorded_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (analytics_account_id, provider)
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS account_payment_retention_records_provider_idx
        ON account_payment_retention_records (provider, account_deleted_at DESC)
      `,
      `
        CREATE TABLE IF NOT EXISTS account_payment_provider_events (
          provider_event_key text PRIMARY KEY,
          analytics_account_id uuid NOT NULL REFERENCES account_analytics_accounts(analytics_account_id),
          organization_id_hash text NOT NULL,
          provider text NOT NULL,
          provider_event_id text NOT NULL,
          provider_event_type text NOT NULL,
          processed_at timestamptz NOT NULL,
          account_deleted_at timestamptz NOT NULL,
          recorded_at timestamptz NOT NULL DEFAULT now()
        )
      `,
      `
        CREATE UNIQUE INDEX IF NOT EXISTS account_payment_provider_events_provider_event_key
        ON account_payment_provider_events (provider, provider_event_id)
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202606120001_add_session_auth_method",
    description: "Track the auth method used to create each browser session.",
    statements: [
      "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS auth_method text",
      "ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_auth_method_check",
      `
        ALTER TABLE sessions
        ADD CONSTRAINT sessions_auth_method_check
        CHECK (auth_method IS NULL OR auth_method IN ('email_code', 'github_oauth'))
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202606130001_retire_expired_project_invites",
    description:
      "Retire already-expired project invites so re-inviting the same email is unblocked.",
    statements: [
      `
        UPDATE project_invites
        SET canceled_at = expires_at
        WHERE accepted_at IS NULL
          AND canceled_at IS NULL
          AND expires_at <= now()
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202606140001_add_ingestion_rejection_diagnostics",
    description: "Track sanitized ingestion rejection diagnostics for operator breakdowns.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS ingestion_rejection_diagnostic_periods (
          analytics_account_id uuid NOT NULL REFERENCES account_analytics_accounts(analytics_account_id),
          period_starts_at timestamptz NOT NULL,
          rejection_reason text NOT NULL,
          project_id_text text NOT NULL DEFAULT '',
          service_name text NOT NULL DEFAULT '',
          service_environment text NOT NULL DEFAULT '',
          service_runtime text NOT NULL DEFAULT '',
          sdk_name text NOT NULL DEFAULT '',
          sdk_version text NOT NULL DEFAULT '',
          event_type text NOT NULL DEFAULT '',
          validation_code text NOT NULL DEFAULT '',
          validation_path text NOT NULL DEFAULT '',
          occurrences bigint NOT NULL DEFAULT 0,
          first_seen_at timestamptz NOT NULL,
          last_seen_at timestamptz NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (
            analytics_account_id,
            period_starts_at,
            rejection_reason,
            project_id_text,
            service_name,
            service_environment,
            service_runtime,
            sdk_name,
            sdk_version,
            event_type,
            validation_code,
            validation_path
          )
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS ingestion_rejection_diagnostic_periods_reason_period_idx
        ON ingestion_rejection_diagnostic_periods (
          rejection_reason,
          period_starts_at,
          last_seen_at DESC
        )
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202606170001_add_project_color_tags",
    description: "Add optional project color tags for project metadata and retrieval surfaces.",
    statements: [
      "ALTER TABLE projects ADD COLUMN IF NOT EXISTS color_tag text",
      "ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_color_tag_check",
      `
        ALTER TABLE projects
        ADD CONSTRAINT projects_color_tag_check
        CHECK (
          color_tag IN ('red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'slate')
          OR color_tag IS NULL
        )
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202606260001_add_alert_severity_lifecycle_scope",
    description:
      "Add lifecycle scope for severity-threshold alert rules so new incidents and regressions can notify independently.",
    statements: [
      "ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS severity_lifecycle_scope text",
      `
        UPDATE alert_rules
        SET severity_lifecycle_scope = 'both'
        WHERE condition_type = 'severity_threshold'
          AND severity_lifecycle_scope IS NULL
      `,
      `
        UPDATE alert_rules
        SET severity_lifecycle_scope = NULL
        WHERE condition_type <> 'severity_threshold'
          AND severity_lifecycle_scope IS NOT NULL
      `,
      "ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_severity_lifecycle_scope_check",
      `
        ALTER TABLE alert_rules
        ADD CONSTRAINT alert_rules_severity_lifecycle_scope_check CHECK (
          severity_lifecycle_scope IS NULL
          OR (
            condition_type = 'severity_threshold'
            AND severity_lifecycle_scope IN ('new_incident', 'incident_regressed', 'both')
          )
        )
      `
    ]
  })
] as const;
