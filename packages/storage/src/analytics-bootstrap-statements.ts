const analyticsAnalysisKindCheck =
  "('usage_summary', 'route_health', 'funnel_dropoff', 'journey_friction', 'feature_usage', 'incident_impact', 'deploy_comparison', 'conversion_path')";

export const ANALYTICS_BOOTSTRAP_STATEMENTS = [
  `
    CREATE TABLE project_analytics_settings (
      project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      enabled boolean NOT NULL DEFAULT false,
      privacy_mode text NOT NULL DEFAULT 'strict'
        CHECK (privacy_mode IN ('strict', 'standard', 'custom')),
      consent_required boolean NOT NULL DEFAULT false,
      capture_page_views boolean NOT NULL DEFAULT true,
      capture_route_changes boolean NOT NULL DEFAULT true,
      capture_actions boolean NOT NULL DEFAULT false,
      capture_friction_signals boolean NOT NULL DEFAULT true,
      journey_sample_rate numeric NOT NULL DEFAULT 0
        CHECK (journey_sample_rate >= 0 AND journey_sample_rate <= 1),
      raw_retention_days integer NOT NULL DEFAULT 1 CHECK (raw_retention_days BETWEEN 1 AND 30),
      sample_retention_days integer NOT NULL DEFAULT 7 CHECK (sample_retention_days BETWEEN 1 AND 365),
      aggregate_retention_months integer NOT NULL DEFAULT 12
        CHECK (aggregate_retention_months BETWEEN 1 AND 120),
      max_saved_funnels integer NOT NULL DEFAULT 3 CHECK (max_saved_funnels BETWEEN 0 AND 100),
      max_custom_dimensions integer NOT NULL DEFAULT 0 CHECK (max_custom_dimensions BETWEEN 0 AND 20),
      approved_custom_dimensions jsonb NOT NULL DEFAULT '[]'::jsonb
        CHECK (
          jsonb_typeof(approved_custom_dimensions) = 'array'
          AND jsonb_array_length(approved_custom_dimensions) <= max_custom_dimensions
        ),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE analytics_ingestion_ledger (
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      event_id uuid NOT NULL,
      occurred_at timestamptz NOT NULL,
      accepted_at timestamptz NOT NULL DEFAULT now(),
      dedupe_key text NOT NULL,
      PRIMARY KEY (project_id, event_id),
      UNIQUE (project_id, dedupe_key)
    )
  `,
  `
    CREATE INDEX analytics_ingestion_ledger_project_occurred_idx
    ON analytics_ingestion_ledger (project_id, occurred_at DESC)
  `,
  `
    CREATE TABLE analytics_usage_counters (
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      period_starts_at timestamptz NOT NULL,
      analytics_events integer NOT NULL DEFAULT 0,
      analytics_sessions integer NOT NULL DEFAULT 0,
      analytics_bundle_generations integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (organization_id, period_starts_at)
    )
  `,
  `
    CREATE TABLE analytics_rollup_uniques (
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      rollup_kind text NOT NULL
        CHECK (
          rollup_kind IN (
            'session',
            'route_session',
            'transition_session',
            'action_session',
            'funnel_step_session',
            'funnel_completion_session'
          )
        ),
      service text NOT NULL DEFAULT '',
      environment text NOT NULL DEFAULT 'production',
      bucket_start timestamptz NOT NULL,
      bucket_granularity text NOT NULL CHECK (bucket_granularity IN ('hour', 'day')),
      rollup_key text NOT NULL,
      dimension_hash text NOT NULL,
      subject_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (
        project_id,
        rollup_kind,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        rollup_key,
        dimension_hash,
        subject_hash
      )
    )
  `,
  `
    CREATE INDEX analytics_rollup_uniques_project_bucket_idx
    ON analytics_rollup_uniques (project_id, bucket_granularity, bucket_start DESC)
  `,
  `
    CREATE TABLE analytics_session_rollups (
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      service text NOT NULL DEFAULT '',
      environment text NOT NULL DEFAULT 'production',
      bucket_start timestamptz NOT NULL,
      bucket_granularity text NOT NULL CHECK (bucket_granularity IN ('hour', 'day')),
      dimension_hash text NOT NULL,
      dimensions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dimensions) = 'object'),
      device_type text NOT NULL DEFAULT 'unknown',
      browser_family text,
      os_family text,
      language text,
      country_code text,
      auth_state text NOT NULL DEFAULT 'unknown',
      sessions bigint NOT NULL DEFAULT 0 CHECK (sessions >= 0),
      new_visitors bigint NOT NULL DEFAULT 0 CHECK (new_visitors >= 0),
      returning_visitors bigint NOT NULL DEFAULT 0 CHECK (returning_visitors >= 0),
      bounces bigint NOT NULL DEFAULT 0 CHECK (bounces >= 0),
      exits bigint NOT NULL DEFAULT 0 CHECK (exits >= 0),
      total_duration_ms bigint NOT NULL DEFAULT 0 CHECK (total_duration_ms >= 0),
      total_pageviews bigint NOT NULL DEFAULT 0 CHECK (total_pageviews >= 0),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        dimension_hash
      )
    )
  `,
  `
    CREATE INDEX analytics_session_rollups_project_bucket_idx
    ON analytics_session_rollups (project_id, bucket_granularity, bucket_start DESC)
  `,
  `
    CREATE INDEX analytics_session_rollups_project_device_idx
    ON analytics_session_rollups (project_id, bucket_start DESC, device_type)
  `,
  `
    CREATE TABLE analytics_route_rollups (
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      service text NOT NULL DEFAULT '',
      environment text NOT NULL DEFAULT 'production',
      bucket_start timestamptz NOT NULL,
      bucket_granularity text NOT NULL CHECK (bucket_granularity IN ('hour', 'day')),
      route_key text NOT NULL,
      dimension_hash text NOT NULL,
      dimensions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dimensions) = 'object'),
      device_type text NOT NULL DEFAULT 'unknown',
      browser_family text,
      os_family text,
      language text,
      country_code text,
      auth_state text NOT NULL DEFAULT 'unknown',
      pageviews bigint NOT NULL DEFAULT 0 CHECK (pageviews >= 0),
      unique_sessions bigint NOT NULL DEFAULT 0 CHECK (unique_sessions >= 0),
      entrances bigint NOT NULL DEFAULT 0 CHECK (entrances >= 0),
      exits bigint NOT NULL DEFAULT 0 CHECK (exits >= 0),
      bounces bigint NOT NULL DEFAULT 0 CHECK (bounces >= 0),
      duration_bucket_counts jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(duration_bucket_counts) = 'object'),
      linked_incident_sessions bigint NOT NULL DEFAULT 0 CHECK (linked_incident_sessions >= 0),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        route_key,
        dimension_hash
      )
    )
  `,
  `
    CREATE INDEX analytics_route_rollups_project_route_bucket_idx
    ON analytics_route_rollups (project_id, route_key, bucket_granularity, bucket_start DESC)
  `,
  `
    CREATE TABLE analytics_action_rollups (
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      service text NOT NULL DEFAULT '',
      environment text NOT NULL DEFAULT 'production',
      bucket_start timestamptz NOT NULL,
      bucket_granularity text NOT NULL CHECK (bucket_granularity IN ('hour', 'day')),
      action_key text NOT NULL,
      route_key text NOT NULL DEFAULT '',
      dimension_hash text NOT NULL,
      dimensions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dimensions) = 'object'),
      device_type text NOT NULL DEFAULT 'unknown',
      browser_family text,
      os_family text,
      language text,
      country_code text,
      auth_state text NOT NULL DEFAULT 'unknown',
      event_count bigint NOT NULL DEFAULT 0 CHECK (event_count >= 0),
      unique_sessions bigint NOT NULL DEFAULT 0 CHECK (unique_sessions >= 0),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        action_key,
        route_key,
        dimension_hash
      )
    )
  `,
  `
    CREATE INDEX analytics_action_rollups_project_action_bucket_idx
    ON analytics_action_rollups (project_id, action_key, bucket_granularity, bucket_start DESC)
  `,
  `
    CREATE TABLE analytics_funnel_definitions (
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      funnel_key text NOT NULL,
      display_name text NOT NULL,
      steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(steps) = 'array'),
      created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      archived_at timestamptz,
      PRIMARY KEY (project_id, funnel_key)
    )
  `,
  `
    CREATE INDEX analytics_funnel_definitions_project_active_idx
    ON analytics_funnel_definitions (project_id, archived_at, updated_at DESC)
  `,
  `
    CREATE TABLE analytics_funnel_rollups (
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      service text NOT NULL DEFAULT '',
      environment text NOT NULL DEFAULT 'production',
      bucket_start timestamptz NOT NULL,
      bucket_granularity text NOT NULL CHECK (bucket_granularity IN ('hour', 'day')),
      funnel_key text NOT NULL,
      step_key text NOT NULL,
      step_order integer NOT NULL DEFAULT 0 CHECK (step_order >= 0),
      dimension_hash text NOT NULL,
      dimensions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dimensions) = 'object'),
      device_type text NOT NULL DEFAULT 'unknown',
      browser_family text,
      os_family text,
      language text,
      country_code text,
      auth_state text NOT NULL DEFAULT 'unknown',
      sessions_entered bigint NOT NULL DEFAULT 0 CHECK (sessions_entered >= 0),
      sessions_completed bigint NOT NULL DEFAULT 0 CHECK (sessions_completed >= 0),
      dropoffs bigint NOT NULL DEFAULT 0 CHECK (dropoffs >= 0),
      duration_bucket_counts jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(duration_bucket_counts) = 'object'),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        funnel_key,
        step_key,
        dimension_hash
      )
    )
  `,
  `
    CREATE INDEX analytics_funnel_rollups_project_funnel_bucket_idx
    ON analytics_funnel_rollups (project_id, funnel_key, bucket_granularity, bucket_start DESC)
  `,
  `
    CREATE TABLE analytics_transition_rollups (
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      service text NOT NULL DEFAULT '',
      environment text NOT NULL DEFAULT 'production',
      bucket_start timestamptz NOT NULL,
      bucket_granularity text NOT NULL CHECK (bucket_granularity IN ('hour', 'day')),
      from_route_key text NOT NULL,
      to_route_key text NOT NULL,
      dimension_hash text NOT NULL,
      dimensions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dimensions) = 'object'),
      device_type text NOT NULL DEFAULT 'unknown',
      browser_family text,
      os_family text,
      language text,
      country_code text,
      auth_state text NOT NULL DEFAULT 'unknown',
      transition_count bigint NOT NULL DEFAULT 0 CHECK (transition_count >= 0),
      unique_sessions bigint NOT NULL DEFAULT 0 CHECK (unique_sessions >= 0),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        from_route_key,
        to_route_key,
        dimension_hash
      )
    )
  `,
  `
    CREATE INDEX analytics_transition_rollups_project_routes_bucket_idx
    ON analytics_transition_rollups (
      project_id,
      from_route_key,
      to_route_key,
      bucket_granularity,
      bucket_start DESC
    )
  `,
  `
    CREATE TABLE analytics_journey_samples (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      service text NOT NULL DEFAULT '',
      environment text NOT NULL DEFAULT 'production',
      session_id_hash text NOT NULL,
      visitor_id_hash text,
      analysis_tags text[] NOT NULL DEFAULT '{}'::text[],
      first_seen_at timestamptz NOT NULL,
      last_seen_at timestamptz NOT NULL,
      dimensions_summary jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(dimensions_summary) = 'object'),
      s3_object_key text NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (project_id, s3_object_key)
    )
  `,
  `
    CREATE INDEX analytics_journey_samples_project_expires_idx
    ON analytics_journey_samples (project_id, expires_at)
  `,
  `
    CREATE INDEX analytics_journey_samples_project_seen_idx
    ON analytics_journey_samples (project_id, last_seen_at DESC)
  `,
  `
    CREATE TABLE analytics_opportunities (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      service text,
      environment text,
      kind text NOT NULL CHECK (kind IN ${analyticsAnalysisKindCheck}),
      status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'snoozed')),
      severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
      confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      fingerprint text NOT NULL,
      title text NOT NULL,
      summary text NOT NULL,
      evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
      related_incident_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
      related_deploy_ids text[] NOT NULL DEFAULT '{}'::text[],
      first_detected_at timestamptz NOT NULL,
      last_detected_at timestamptz NOT NULL,
      resolved_at timestamptz,
      snoozed_until timestamptz,
      bundle_status text NOT NULL DEFAULT 'not_requested'
        CHECK (bundle_status IN ('not_requested', 'pending', 'running', 'completed', 'failed')),
      bundle_object_key text,
      bundle_failure_reason text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (project_id, fingerprint)
    )
  `,
  `
    CREATE INDEX analytics_opportunities_project_status_detected_idx
    ON analytics_opportunities (project_id, status, last_detected_at DESC)
  `,
  `
    CREATE INDEX analytics_opportunities_project_kind_detected_idx
    ON analytics_opportunities (project_id, kind, last_detected_at DESC)
  `,
  `
    CREATE TABLE analytics_bundle_generations (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      opportunity_id uuid REFERENCES analytics_opportunities(id) ON DELETE SET NULL,
      requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      analysis_kind text NOT NULL CHECK (analysis_kind IN ${analyticsAnalysisKindCheck}),
      analysis_spec jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(analysis_spec) = 'object'),
      input_fingerprint text NOT NULL,
      status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
      object_key text,
      failure_reason text,
      created_at timestamptz NOT NULL DEFAULT now(),
      claimed_at timestamptz,
      completed_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (project_id, input_fingerprint)
    )
  `,
  `
    CREATE INDEX analytics_bundle_generations_status_created_idx
    ON analytics_bundle_generations (status, created_at)
  `,
  `
    CREATE INDEX analytics_bundle_generations_project_created_idx
    ON analytics_bundle_generations (project_id, created_at DESC)
  `
] as const;
