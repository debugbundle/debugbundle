export const STORAGE_BOOTSTRAP_STATEMENTS = [
  `
    CREATE TABLE users (
      id uuid PRIMARY KEY,
      email text NOT NULL UNIQUE,
      accepted_terms_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      email_verified_at timestamptz,
      avatar_source text,
      avatar_object_key text,
      avatar_content_type text,
      avatar_updated_at timestamptz
    )
  `,
  `
    CREATE TABLE organizations (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      slug text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      suspended_at timestamptz,
      plan text NOT NULL DEFAULT 'free',
      stripe_customer_id text,
      additional_capacity_units integer NOT NULL DEFAULT 0,
      stripe_subscription_id text,
      billing_state text,
      billing_period_ends_at timestamptz,
      last_billing_sync_at timestamptz,
      last_billing_event_id text,
      billing_period_starts_at timestamptz,
      trial_plan text CHECK (trial_plan IN ('solo', 'team') OR trial_plan IS NULL),
      trial_started_at timestamptz,
      trial_ends_at timestamptz,
      trial_used_at timestamptz,
      trial_converted_at timestamptz,
      trial_expired_at timestamptz,
      CONSTRAINT organizations_trial_window_check CHECK (
        trial_started_at IS NULL
        OR trial_ends_at IS NULL
        OR trial_ends_at > trial_started_at
      ),
      CONSTRAINT organizations_trial_started_requires_plan_check CHECK (
        trial_started_at IS NULL
        OR trial_plan IS NOT NULL
      )
    )
  `,
  `
    CREATE UNIQUE INDEX organizations_stripe_customer_id_key
    ON organizations (stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL
  `,
  `
    CREATE TABLE projects (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name text NOT NULL,
      slug text NOT NULL,
      environment_default text NOT NULL DEFAULT 'production',
      automated_improvement_bundles_enabled boolean NOT NULL DEFAULT true,
      improvement_bundle_sensitivity text NOT NULL DEFAULT 'high_confidence'
        CHECK (improvement_bundle_sensitivity IN ('high_confidence', 'balanced', 'verbose')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      plan text NOT NULL DEFAULT 'free'
    )
  `,
  `
    CREATE UNIQUE INDEX projects_organization_id_slug_key
    ON projects (organization_id, slug)
  `,
  `
    CREATE TABLE services (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name text NOT NULL,
      runtime text,
      framework text,
      environment text NOT NULL DEFAULT 'production',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (project_id, name, environment)
    )
  `,
  `
    CREATE TABLE project_tokens (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      token_hash text UNIQUE NOT NULL,
      label text NOT NULL,
      allowed_origins jsonb NOT NULL DEFAULT '[]'::jsonb,
      last_used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz,
      expires_at timestamptz
    )
  `,
  `
    CREATE TABLE member_tokens (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL,
      organization_id uuid NOT NULL,
      token_hash text UNIQUE NOT NULL,
      label text NOT NULL,
      last_used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz,
      expires_at timestamptz
    )
  `,
  `
    CREATE INDEX member_tokens_org_idx
    ON member_tokens (organization_id)
  `,
  `
    CREATE TABLE audit_logs (
      id uuid PRIMARY KEY,
      organization_id uuid,
      actor_user_id uuid,
      actor_type text NOT NULL,
      action text NOT NULL,
      target_type text NOT NULL,
      target_id text,
      status text NOT NULL,
      ip_address text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      occurred_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE INDEX audit_logs_organization_occurred_at_idx
    ON audit_logs (organization_id, occurred_at DESC, created_at DESC)
  `,
  `
    CREATE INDEX audit_logs_action_occurred_at_idx
    ON audit_logs (action, occurred_at DESC, created_at DESC)
  `,
  `
    CREATE TABLE organization_members (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role text NOT NULL DEFAULT 'member',
      suspended_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, user_id)
    )
  `,
  `
    CREATE INDEX organization_members_org_idx
    ON organization_members (organization_id)
  `,
  `
    CREATE INDEX organization_members_user_idx
    ON organization_members (user_id)
  `,
  `
    CREATE TABLE sessions (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      session_token_hash text UNIQUE NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz
    )
  `,
  `
    CREATE INDEX sessions_token_hash_idx
    ON sessions (session_token_hash)
  `,
  `
    CREATE INDEX sessions_user_org_idx
    ON sessions (user_id, organization_id)
  `,
  `
    CREATE TABLE email_auth_challenges (
      id uuid PRIMARY KEY,
      email text NOT NULL,
      code_hash text NOT NULL,
      accepted_terms_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    )
  `,
  `
    CREATE INDEX email_auth_challenges_email_idx
    ON email_auth_challenges (lower(email), created_at DESC)
  `,
  `
    CREATE INDEX email_auth_challenges_code_hash_idx
    ON email_auth_challenges (code_hash)
  `,
  `
    CREATE TABLE account_deletion_challenges (
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
    CREATE INDEX account_deletion_challenges_scope_idx
    ON account_deletion_challenges (organization_id, user_id, lower(email), created_at DESC)
  `,
  `
    CREATE INDEX account_deletion_challenges_code_hash_idx
    ON account_deletion_challenges (code_hash)
  `,
  `
    CREATE TABLE github_device_authorizations (
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
    CREATE INDEX github_device_authorizations_user_code_idx
    ON github_device_authorizations (user_code, created_at DESC)
  `,
  `
    CREATE INDEX github_device_authorizations_expires_at_idx
    ON github_device_authorizations (expires_at)
  `,
  `
    CREATE TABLE project_members (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role text NOT NULL,
      invited_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (project_id, user_id)
    )
  `,
  `
    CREATE INDEX project_members_project_id_idx
    ON project_members (project_id, created_at DESC)
  `,
  `
    CREATE INDEX project_members_user_id_idx
    ON project_members (user_id, created_at DESC)
  `,
  `
    CREATE TABLE project_invites (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      email text NOT NULL,
      role text NOT NULL,
      invited_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      invite_token_hash text NOT NULL,
      accepted_at timestamptz,
      canceled_at timestamptz,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE INDEX project_invites_project_id_idx
    ON project_invites (project_id, created_at DESC)
  `,
  `
    CREATE UNIQUE INDEX project_invites_pending_project_email_key
    ON project_invites (project_id, lower(email))
    WHERE accepted_at IS NULL AND canceled_at IS NULL
  `,
  `
    CREATE UNIQUE INDEX project_invites_invite_token_hash_key
    ON project_invites (invite_token_hash)
  `,
  `
    CREATE TABLE oauth_identities (
      id uuid PRIMARY KEY,
      provider text NOT NULL,
      provider_user_id text NOT NULL,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (provider, provider_user_id)
    )
  `,
  `
    CREATE INDEX oauth_identities_user_id_idx
    ON oauth_identities (user_id, provider)
  `,
  `
    CREATE TABLE probe_activations (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_by_member_id uuid NOT NULL,
      label_pattern text NOT NULL,
      service text NOT NULL DEFAULT '*',
      environment text NOT NULL DEFAULT '*',
      trigger_expires_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      deactivated_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE INDEX probe_activations_project_active_idx
    ON probe_activations (project_id, expires_at DESC)
    WHERE deactivated_at IS NULL
  `,
  `
    CREATE TABLE capture_policies (
      project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      preset text NOT NULL DEFAULT 'minimal',
      capture_logs text,
      capture_request_events text,
      capture_breadcrumbs text,
      capture_probe_events text,
      immediate_client_error_statuses jsonb,
      immediate_client_error_path_rules jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE capture_rules (
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
    CREATE INDEX capture_rules_project_enabled_idx
    ON capture_rules (project_id, enabled)
  `,
  `
    CREATE INDEX capture_rules_project_updated_idx
    ON capture_rules (project_id, updated_at DESC)
  `,
  `
    CREATE TABLE deployments (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      service_id uuid REFERENCES services(id) ON DELETE SET NULL,
      environment text NOT NULL,
      source_event_id uuid UNIQUE NOT NULL,
      commit_sha text,
      version text,
      branch text,
      deployed_at timestamptz NOT NULL,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE INDEX deployments_project_service_env_deployed_idx
    ON deployments (project_id, service_id, environment, deployed_at DESC)
  `,
  `
    CREATE TABLE incidents (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      service_id uuid REFERENCES services(id) ON DELETE SET NULL,
      environment text NOT NULL DEFAULT 'production',
      fingerprint text NOT NULL,
      fingerprint_version text NOT NULL DEFAULT 'v1',
      title text NOT NULL,
      severity text NOT NULL,
      status text NOT NULL DEFAULT 'open',
      first_seen_at timestamptz NOT NULL,
      last_seen_at timestamptz NOT NULL,
      occurrence_count integer NOT NULL DEFAULT 1,
      matched_fields text[],
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      regressed_at timestamptz,
      spike_detected_at timestamptz,
      frequency_occurrences_1m integer,
      frequency_occurrences_5m integer,
      frequency_occurrences_1h integer,
      frequency_occurrences_24h integer,
      frequency_baseline_1h_per_5m double precision,
      frequency_spike_ratio_5m_to_1h double precision,
      frequency_has_sufficient_baseline boolean,
      frequency_is_spiking boolean,
      frequency_snapshot_at timestamptz,
      latest_deployment_id uuid REFERENCES deployments(id) ON DELETE SET NULL,
      bundle_generation_number integer NOT NULL DEFAULT 0,
      bundle_created_at timestamptz,
      bundle_updated_at timestamptz,
      bundle_source_event_id uuid,
      bundle_source_occurred_at timestamptz,
      bundle_trigger text,
      bundle_failure_reason text,
      resolved_at timestamptz,
      resolved_by_member_id uuid REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (project_id, environment, service_id, fingerprint)
    )
  `,
  `
    CREATE TABLE processed_events (
      event_id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      event_type text NOT NULL,
      fingerprint text NOT NULL,
      normalized_message text NOT NULL,
      processed_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE improvement_opportunities (
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
    CREATE INDEX improvement_opportunities_project_status_detected_idx
    ON improvement_opportunities (project_id, status, last_detected_at DESC)
  `,
  `
    CREATE INDEX improvement_opportunities_project_kind_detected_idx
    ON improvement_opportunities (project_id, kind, last_detected_at DESC)
  `,
  `
    CREATE INDEX improvement_opportunities_project_service_env_idx
    ON improvement_opportunities (project_id, service_id, environment)
  `,
  `
    CREATE TABLE improvement_opportunity_events (
      improvement_opportunity_id uuid NOT NULL REFERENCES improvement_opportunities(id) ON DELETE CASCADE,
      event_id uuid NOT NULL,
      event_type text NOT NULL,
      occurred_at timestamptz NOT NULL,
      PRIMARY KEY (improvement_opportunity_id, event_id)
    )
  `,
  `
    CREATE INDEX improvement_opportunity_events_detected_idx
    ON improvement_opportunity_events (improvement_opportunity_id, occurred_at DESC, event_id DESC)
  `,
  `
    CREATE TABLE bundle_generations (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      incident_id uuid REFERENCES incidents(id) ON DELETE CASCADE,
      improvement_opportunity_id uuid REFERENCES improvement_opportunities(id) ON DELETE CASCADE,
      bundle_type text NOT NULL,
      generation_number integer NOT NULL,
      source_event_id uuid NOT NULL,
      source_occurred_at timestamptz NOT NULL,
      trigger text NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CHECK (
        (incident_id IS NOT NULL AND improvement_opportunity_id IS NULL AND bundle_type = 'failure')
        OR (incident_id IS NULL AND improvement_opportunity_id IS NOT NULL AND bundle_type = 'improvement')
      )
    )
  `,
  `
    CREATE UNIQUE INDEX bundle_generations_incident_source_idx
    ON bundle_generations (incident_id, source_event_id)
    WHERE incident_id IS NOT NULL
  `,
  `
    CREATE UNIQUE INDEX bundle_generations_improvement_source_idx
    ON bundle_generations (improvement_opportunity_id, source_event_id)
    WHERE improvement_opportunity_id IS NOT NULL
  `,
  `
    CREATE INDEX bundle_generations_project_created_idx
    ON bundle_generations (project_id, created_at DESC, bundle_type)
  `,
  `
    CREATE INDEX bundle_generations_incident_generation_idx
    ON bundle_generations (incident_id, generation_number DESC)
  `,
  `
    CREATE INDEX bundle_generations_improvement_generation_idx
    ON bundle_generations (improvement_opportunity_id, generation_number DESC)
    WHERE improvement_opportunity_id IS NOT NULL
  `,
  `
    CREATE TABLE incident_events (
      incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      event_id uuid NOT NULL,
      event_type text NOT NULL,
      event_class text NOT NULL DEFAULT 'context_signal',
      occurred_at timestamptz NOT NULL,
      is_sampled boolean NOT NULL DEFAULT false,
      level text,
      retain_first boolean NOT NULL DEFAULT false,
      retain_latest boolean NOT NULL DEFAULT false,
      retain_after_deploy boolean NOT NULL DEFAULT false,
      retain_highest_severity boolean NOT NULL DEFAULT false,
      retain_deploy_metadata boolean NOT NULL DEFAULT false,
      severity_rank integer NOT NULL DEFAULT 0,
      PRIMARY KEY (incident_id, event_id)
    )
  `,
  `
    CREATE INDEX incident_events_incident_occurred_event_idx
    ON incident_events (incident_id, occurred_at DESC, event_id DESC)
  `,
  `
    CREATE INDEX incident_events_incident_level_occurred_event_idx
    ON incident_events (incident_id, level, occurred_at DESC, event_id DESC)
  `,
  `
    CREATE INDEX incident_events_incident_sampled_idx
    ON incident_events (incident_id, is_sampled, occurred_at ASC, event_id ASC)
  `,
  `
    CREATE TABLE weekly_report_channels (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      channel text NOT NULL,
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      schedule_day_of_week text NOT NULL,
      schedule_hour_of_day integer NOT NULL,
      schedule_timezone text NOT NULL,
      is_enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE INDEX weekly_report_channels_project_created_idx
    ON weekly_report_channels (project_id, created_at ASC)
  `,
  `
    CREATE UNIQUE INDEX weekly_report_channels_project_email_unique_idx
    ON weekly_report_channels (project_id)
    WHERE channel = 'email'
  `,
  `
    CREATE TABLE weekly_report_deliveries (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      weekly_report_channel_id uuid REFERENCES weekly_report_channels(id) ON DELETE CASCADE,
      window_start timestamptz NOT NULL,
      window_end timestamptz NOT NULL,
      channel text NOT NULL,
      status text NOT NULL,
      last_error text,
      delivered_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE INDEX weekly_report_deliveries_project_window_idx
    ON weekly_report_deliveries (project_id, window_end DESC, channel)
  `,
  `
    CREATE UNIQUE INDEX weekly_report_deliveries_channel_window_idx
    ON weekly_report_deliveries (weekly_report_channel_id, window_start, window_end)
    WHERE weekly_report_channel_id IS NOT NULL
  `,
  `
    CREATE INDEX weekly_report_deliveries_channel_idx
    ON weekly_report_deliveries (weekly_report_channel_id, window_end DESC)
  `,
  `
    CREATE TABLE alert_rules (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service_id uuid REFERENCES services(id) ON DELETE CASCADE,
      channel text NOT NULL,
      condition_type text NOT NULL,
      severity_min text,
      cooldown_seconds integer NOT NULL DEFAULT 0,
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      is_enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE INDEX alert_rules_project_enabled_idx
    ON alert_rules (project_id, is_enabled)
  `,
  `
    CREATE TABLE slack_destinations (
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
    CREATE INDEX slack_destinations_org_active_idx
    ON slack_destinations (organization_id, is_active, created_at)
  `,
  `
    CREATE TABLE alert_deliveries (
      id uuid PRIMARY KEY,
      alert_id uuid NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      condition_type text NOT NULL,
      dedupe_key text NOT NULL,
      notification_key text NOT NULL DEFAULT '',
      channel text NOT NULL,
      status text NOT NULL,
      payload jsonb NOT NULL,
      last_error text,
      delivered_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (alert_id, incident_id, dedupe_key)
    )
  `,
  `
    CREATE INDEX alert_deliveries_project_status_idx
    ON alert_deliveries (project_id, status, created_at DESC)
  `,
  `
    CREATE INDEX alert_deliveries_alert_notification_idx
    ON alert_deliveries (alert_id, notification_key, created_at DESC)
  `,
  `
    CREATE TABLE alert_email_digests (
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
    CREATE UNIQUE INDEX alert_email_digests_project_recipient_pending_idx
    ON alert_email_digests (project_id, recipient)
    WHERE status = 'pending' AND claimed_at IS NULL
  `,
  `
    CREATE INDEX alert_email_digests_status_next_attempt_idx
    ON alert_email_digests (status, next_attempt_at)
  `,
  `
    CREATE TABLE alert_email_digest_items (
      id uuid PRIMARY KEY,
      digest_id uuid NOT NULL REFERENCES alert_email_digests(id) ON DELETE CASCADE,
      alert_id uuid NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      condition_type text NOT NULL,
      dedupe_key text NOT NULL,
      notification_key text NOT NULL DEFAULT '',
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (alert_id, incident_id, dedupe_key)
    )
  `,
  `
    CREATE INDEX alert_email_digest_items_digest_created_idx
    ON alert_email_digest_items (digest_id, created_at ASC)
  `,
  `
    CREATE INDEX alert_email_digest_items_alert_notification_idx
    ON alert_email_digest_items (alert_id, notification_key, created_at DESC)
  `,
  `
    CREATE TABLE agent_webhooks (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url text NOT NULL,
      secret_hash text NOT NULL,
      events text[] NOT NULL,
      filters jsonb NOT NULL DEFAULT '{}'::jsonb,
      is_enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE INDEX agent_webhooks_project_enabled_idx
    ON agent_webhooks (project_id, is_enabled)
  `,
  `
    CREATE TABLE webhook_deliveries (
      id uuid PRIMARY KEY,
      webhook_id uuid REFERENCES agent_webhooks(id) ON DELETE CASCADE,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      incident_id uuid REFERENCES incidents(id) ON DELETE CASCADE,
      event_type text NOT NULL,
      target_url text NOT NULL,
      signing_secret text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      attempt_count integer NOT NULL DEFAULT 0,
      occurred_at timestamptz NOT NULL,
      next_attempt_at timestamptz,
      last_response_code integer,
      last_attempted_at timestamptz,
      last_error text,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE INDEX webhook_deliveries_status_next_attempt_idx
    ON webhook_deliveries (status, next_attempt_at)
  `,
  `
    CREATE TABLE processed_billing_events (
      event_id text PRIMARY KEY,
      event_type text NOT NULL,
      organization_id uuid,
      processed_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE processed_github_marketplace_events (
      delivery_id text PRIMARY KEY,
      event_name text NOT NULL,
      marketplace_account_id bigint,
      action text,
      processed_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE INDEX processed_github_marketplace_events_account_idx
    ON processed_github_marketplace_events (marketplace_account_id, processed_at DESC)
  `,
  `
    CREATE TABLE github_installations (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      installation_id bigint NOT NULL UNIQUE,
      account_login text NOT NULL,
      account_type text NOT NULL CHECK (account_type IN ('Organization', 'User')),
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'removed')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id)
    )
  `,
  `
    CREATE INDEX github_installations_status_idx
    ON github_installations (status)
  `,
  `
    CREATE TABLE github_marketplace_accounts (
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
    CREATE INDEX github_marketplace_accounts_org_idx
    ON github_marketplace_accounts (organization_id, updated_at DESC)
  `,
  `
    CREATE UNIQUE INDEX github_marketplace_accounts_installation_idx
    ON github_marketplace_accounts (installation_id)
    WHERE installation_id IS NOT NULL
  `,
  `
    CREATE TABLE project_github_repos (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
      installation_id uuid NOT NULL REFERENCES github_installations(id) ON DELETE CASCADE,
      repo_owner text NOT NULL,
      repo_name text NOT NULL,
      default_branch text NOT NULL DEFAULT 'main',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE github_dispatch_rules (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name text NOT NULL,
      enabled boolean NOT NULL DEFAULT true,
      event_types text[] NOT NULL,
      environments text[],
      services text[],
      severity_min text CHECK (severity_min IN ('low', 'medium', 'high', 'critical')),
      bundle_type text CHECK (bundle_type IN ('failure', 'improvement')),
      incident_status text NOT NULL DEFAULT 'new_or_reopened'
        CHECK (incident_status IN ('new_only', 'reopened_only', 'new_or_reopened')),
      cooldown_seconds integer NOT NULL DEFAULT 300,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE INDEX github_dispatch_rules_project_enabled_idx
    ON github_dispatch_rules (project_id, enabled)
  `,
  `
    CREATE TABLE github_dispatch_deliveries (
      id uuid PRIMARY KEY,
      rule_id uuid NOT NULL,
      rule_name text NOT NULL,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      incident_id uuid REFERENCES incidents(id) ON DELETE CASCADE,
      improvement_opportunity_id uuid REFERENCES improvement_opportunities(id) ON DELETE CASCADE,
      target_fingerprint text NOT NULL,
      installation_id bigint NOT NULL,
      repo_owner text NOT NULL,
      repo_name text NOT NULL,
      status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'retrying', 'delivered', 'failed', 'skipped')),
      attempt_count integer NOT NULL DEFAULT 0,
      next_attempt_at timestamptz,
      last_attempt_at timestamptz,
      last_error text,
      github_status_code integer,
      dispatch_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      dedupe_key text NOT NULL,
      CHECK (
        (incident_id IS NOT NULL AND improvement_opportunity_id IS NULL)
        OR (incident_id IS NULL AND improvement_opportunity_id IS NOT NULL)
      )
    )
  `,
  `
    CREATE INDEX github_dispatch_deliveries_status_next_attempt_idx
    ON github_dispatch_deliveries (status, next_attempt_at)
  `,
  `
    CREATE UNIQUE INDEX github_dispatch_deliveries_rule_dedupe_key_idx
    ON github_dispatch_deliveries (rule_id, target_fingerprint, dedupe_key)
  `,
  `
    CREATE TABLE org_usage_counters (
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      period_starts_at timestamptz NOT NULL,
      raw_ingested_events integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (organization_id, period_starts_at)
    )
  `,
  `
    CREATE TABLE project_usage_counters (
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      period_starts_at timestamptz NOT NULL,
      raw_ingested_events integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (project_id, period_starts_at)
    )
  `,
  `
    CREATE TABLE operational_email_deliveries (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
      kind text NOT NULL
        CHECK (kind IN (
          'webhook_auto_disabled',
          'allowance_warning_80',
          'allowance_limit_reached',
          'retention_rotation_notice',
          'trial_started',
          'trial_ending_soon',
          'trial_expired',
          'trial_converted'
        )),
      dedupe_key text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'retrying', 'delivered', 'failed')),
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
    CREATE INDEX operational_email_deliveries_status_next_attempt_idx
    ON operational_email_deliveries (status, next_attempt_at, created_at)
  `,
  `
    CREATE TABLE trial_lifecycle_events (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      event_type text NOT NULL,
      dedupe_key text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, event_type, dedupe_key)
    )
  `,
  `
    CREATE INDEX trial_lifecycle_events_org_event_created_idx
    ON trial_lifecycle_events (organization_id, event_type, created_at DESC)
  `,
  `
    CREATE TABLE plan_cleanup_tasks (
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
    CREATE INDEX plan_cleanup_tasks_pending_idx
    ON plan_cleanup_tasks (completed_at, next_attempt_at, created_at)
  `
] as const;
