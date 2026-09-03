import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

export const EARLY_STORAGE_SCHEMA_MIGRATIONS = [
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
  })
] as const;
