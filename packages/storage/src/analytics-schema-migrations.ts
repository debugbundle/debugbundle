import { createHash } from "node:crypto";

export interface AnalyticsStorageSchemaMigration {
  id: string;
  description: string;
  statements: readonly string[];
  checksum: string;
}

function defineAnalyticsStorageSchemaMigration(input: {
  id: string;
  description: string;
  statements: readonly string[];
}): AnalyticsStorageSchemaMigration {
  return {
    ...input,
    checksum: createHash("sha256").update(JSON.stringify(input)).digest("hex")
  };
}

const analyticsAnalysisKindCheck =
  "('usage_summary', 'route_health', 'funnel_dropoff', 'journey_friction', 'feature_usage', 'incident_impact', 'deploy_comparison', 'conversion_path')";

export const ANALYTICS_STORAGE_SCHEMA_MIGRATIONS = [
  defineAnalyticsStorageSchemaMigration({
    id: "202607070001_add_analyticsbundle_storage",
    description:
      "Add aggregate-first AnalyticsBundle settings, rollups, journey samples, opportunities, and generation metadata.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS project_analytics_settings (
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
        CREATE TABLE IF NOT EXISTS analytics_ingestion_ledger (
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
        CREATE INDEX IF NOT EXISTS analytics_ingestion_ledger_project_occurred_idx
        ON analytics_ingestion_ledger (project_id, occurred_at DESC)
      `,
      `
        CREATE TABLE IF NOT EXISTS analytics_rollup_uniques (
          project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          rollup_kind text NOT NULL
            CHECK (
              rollup_kind IN (
                'session',
                'route_session',
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
        CREATE INDEX IF NOT EXISTS analytics_rollup_uniques_project_bucket_idx
        ON analytics_rollup_uniques (project_id, bucket_granularity, bucket_start DESC)
      `,
      `
        CREATE TABLE IF NOT EXISTS analytics_session_rollups (
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
        CREATE INDEX IF NOT EXISTS analytics_session_rollups_project_bucket_idx
        ON analytics_session_rollups (project_id, bucket_granularity, bucket_start DESC)
      `,
      `
        CREATE INDEX IF NOT EXISTS analytics_session_rollups_project_device_idx
        ON analytics_session_rollups (project_id, bucket_start DESC, device_type)
      `,
      `
        CREATE TABLE IF NOT EXISTS analytics_route_rollups (
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
        CREATE INDEX IF NOT EXISTS analytics_route_rollups_project_route_bucket_idx
        ON analytics_route_rollups (project_id, route_key, bucket_granularity, bucket_start DESC)
      `,
      `
        CREATE TABLE IF NOT EXISTS analytics_action_rollups (
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
        CREATE INDEX IF NOT EXISTS analytics_action_rollups_project_action_bucket_idx
        ON analytics_action_rollups (project_id, action_key, bucket_granularity, bucket_start DESC)
      `,
      `
        CREATE TABLE IF NOT EXISTS analytics_funnel_definitions (
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
        CREATE INDEX IF NOT EXISTS analytics_funnel_definitions_project_active_idx
        ON analytics_funnel_definitions (project_id, archived_at, updated_at DESC)
      `,
      `
        CREATE TABLE IF NOT EXISTS analytics_funnel_rollups (
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
        CREATE INDEX IF NOT EXISTS analytics_funnel_rollups_project_funnel_bucket_idx
        ON analytics_funnel_rollups (project_id, funnel_key, bucket_granularity, bucket_start DESC)
      `,
      `
        CREATE TABLE IF NOT EXISTS analytics_transition_rollups (
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
        CREATE INDEX IF NOT EXISTS analytics_transition_rollups_project_routes_bucket_idx
        ON analytics_transition_rollups (
          project_id,
          from_route_key,
          to_route_key,
          bucket_granularity,
          bucket_start DESC
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS analytics_journey_samples (
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
        CREATE INDEX IF NOT EXISTS analytics_journey_samples_project_expires_idx
        ON analytics_journey_samples (project_id, expires_at)
      `,
      `
        CREATE INDEX IF NOT EXISTS analytics_journey_samples_project_seen_idx
        ON analytics_journey_samples (project_id, last_seen_at DESC)
      `,
      `
        CREATE TABLE IF NOT EXISTS analytics_opportunities (
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
        CREATE INDEX IF NOT EXISTS analytics_opportunities_project_status_detected_idx
        ON analytics_opportunities (project_id, status, last_detected_at DESC)
      `,
      `
        CREATE INDEX IF NOT EXISTS analytics_opportunities_project_kind_detected_idx
        ON analytics_opportunities (project_id, kind, last_detected_at DESC)
      `,
      `
        CREATE TABLE IF NOT EXISTS analytics_bundle_generations (
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
        CREATE INDEX IF NOT EXISTS analytics_bundle_generations_status_created_idx
        ON analytics_bundle_generations (status, created_at)
      `,
      `
        CREATE INDEX IF NOT EXISTS analytics_bundle_generations_project_created_idx
        ON analytics_bundle_generations (project_id, created_at DESC)
      `
    ]
  }),
  defineAnalyticsStorageSchemaMigration({
    id: "202607080001_add_analytics_transition_unique_subjects",
    description:
      "Allow analytics transition rollups to track exact unique sessions in the aggregate unique-subject ledger.",
    statements: [
      `
        ALTER TABLE analytics_rollup_uniques
        DROP CONSTRAINT IF EXISTS analytics_rollup_uniques_rollup_kind_check
      `,
      `
        ALTER TABLE analytics_rollup_uniques
        ADD CONSTRAINT analytics_rollup_uniques_rollup_kind_check
        CHECK (
          rollup_kind IN (
            'session',
            'route_session',
            'transition_session',
            'action_session',
            'funnel_step_session',
            'funnel_completion_session'
          )
        )
      `
    ]
  }),
  defineAnalyticsStorageSchemaMigration({
    id: "202607090001_add_analytics_usage_counters",
    description:
      "Add durable organization-scoped analytics allowance counters for event, session, and AnalyticsBundle generation quota enforcement.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS analytics_usage_counters (
          organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          period_starts_at timestamptz NOT NULL,
          analytics_events integer NOT NULL DEFAULT 0,
          analytics_sessions integer NOT NULL DEFAULT 0,
          analytics_bundle_generations integer NOT NULL DEFAULT 0,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (organization_id, period_starts_at)
        )
      `
    ]
  }),
  defineAnalyticsStorageSchemaMigration({
    id: "202607090002_add_analytics_journey_sample_usage_counter",
    description:
      "Add durable retained journey sample allowance accounting to analytics usage counters.",
    statements: [
      `
        ALTER TABLE analytics_usage_counters
        ADD COLUMN IF NOT EXISTS analytics_journey_samples integer NOT NULL DEFAULT 0
      `
    ]
  }),
  defineAnalyticsStorageSchemaMigration({
    id: "202607090003_add_analytics_journey_sample_artifact_visibility",
    description:
      "Track whether retained journey sample metadata has a completed artifact before public reads expose it.",
    statements: [
      `
        ALTER TABLE analytics_journey_samples
        ADD COLUMN IF NOT EXISTS has_artifact boolean NOT NULL DEFAULT true
      `,
      `
        ALTER TABLE analytics_journey_samples
        ALTER COLUMN has_artifact SET DEFAULT false
      `
    ]
  }),
  defineAnalyticsStorageSchemaMigration({
    id: "202607100001_add_analytics_incident_correlation",
    description:
      "Add privacy-safe, idempotent analytics session correlation for incident impact and deploy-aware rollups.",
    statements: [
      `
        ALTER TABLE analytics_rollup_uniques
        ADD COLUMN IF NOT EXISTS trace_id_hash text
      `,
      `
        ALTER TABLE analytics_rollup_uniques
        ADD COLUMN IF NOT EXISTS deploy_id text
      `,
      `
        CREATE INDEX IF NOT EXISTS analytics_rollup_uniques_project_trace_bucket_idx
        ON analytics_rollup_uniques (project_id, trace_id_hash, bucket_start DESC)
        WHERE trace_id_hash IS NOT NULL
      `,
      `
        ALTER TABLE analytics_rollup_uniques
        DROP CONSTRAINT IF EXISTS analytics_rollup_uniques_rollup_kind_check
      `,
      `
        ALTER TABLE analytics_rollup_uniques
        ADD CONSTRAINT analytics_rollup_uniques_rollup_kind_check
        CHECK (
          rollup_kind IN (
            'session',
            'route_session',
            'incident_route_session',
            'transition_session',
            'action_session',
            'funnel_step_session',
            'funnel_completion_session'
          )
        ) NOT VALID
      `,
      `
        ALTER TABLE analytics_rollup_uniques
        VALIDATE CONSTRAINT analytics_rollup_uniques_rollup_kind_check
      `,
      `
        CREATE TABLE IF NOT EXISTS analytics_incident_correlations (
          project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
          event_id uuid NOT NULL,
          service text NOT NULL DEFAULT '',
          environment text NOT NULL DEFAULT 'production',
          occurred_at timestamptz NOT NULL,
          session_id_hash text,
          trace_id_hash text,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (incident_id, event_id),
          CHECK (session_id_hash IS NOT NULL OR trace_id_hash IS NOT NULL)
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS analytics_incident_correlations_project_session_idx
        ON analytics_incident_correlations (project_id, session_id_hash, occurred_at DESC)
        WHERE session_id_hash IS NOT NULL
      `,
      `
        CREATE INDEX IF NOT EXISTS analytics_incident_correlations_project_trace_idx
        ON analytics_incident_correlations (project_id, trace_id_hash, occurred_at DESC)
        WHERE trace_id_hash IS NOT NULL
      `,
      `
        CREATE TABLE IF NOT EXISTS analytics_incident_session_links (
          project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
          service text NOT NULL DEFAULT '',
          environment text NOT NULL DEFAULT 'production',
          bucket_start timestamptz NOT NULL,
          bucket_granularity text NOT NULL CHECK (bucket_granularity IN ('hour', 'day')),
          route_key text NOT NULL,
          dimension_hash text NOT NULL,
          subject_hash text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (
            incident_id,
            service,
            environment,
            bucket_start,
            bucket_granularity,
            route_key,
            dimension_hash,
            subject_hash
          )
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS analytics_incident_session_links_incident_bucket_idx
        ON analytics_incident_session_links (incident_id, bucket_granularity, bucket_start DESC)
      `
    ]
  }),
  defineAnalyticsStorageSchemaMigration({
    id: "202607100002_add_analytics_journey_sample_correlation_hash",
    description:
      "Store a project-scoped session subject hash on retained journey samples so incident-impact replay selection can require an exact affected-session match.",
    statements: [
      `
        ALTER TABLE analytics_journey_samples
        ADD COLUMN IF NOT EXISTS correlation_session_hash text
      `,
      `
        CREATE INDEX IF NOT EXISTS analytics_journey_samples_project_correlation_seen_idx
        ON analytics_journey_samples (
          project_id,
          correlation_session_hash,
          service,
          environment,
          last_seen_at DESC,
          id DESC
        )
        WHERE correlation_session_hash IS NOT NULL AND has_artifact = true
      `
    ]
  }),
  defineAnalyticsStorageSchemaMigration({
    id: "202607130001_expand_default_saved_funnel_capacity",
    description:
      "Replace the provisional three-funnel default with the current Solo and Team tier capacities.",
    statements: [
      `
        ALTER TABLE project_analytics_settings
        ALTER COLUMN max_saved_funnels SET DEFAULT 10
      `,
      `
        UPDATE project_analytics_settings settings
        SET
          max_saved_funnels = CASE organizations.plan
            WHEN 'team' THEN 50
            WHEN 'solo' THEN 10
            ELSE 0
          END,
          updated_at = now()
        FROM projects
        JOIN organizations ON organizations.id = projects.organization_id
        WHERE settings.project_id = projects.id
          AND settings.max_saved_funnels = 3
      `
    ]
  }),
  defineAnalyticsStorageSchemaMigration({
    id: "202607140001_enable_free_analytics_preview",
    description:
      "Expand existing Free project analytics settings to the included preview funnel capacity.",
    statements: [
      `
        UPDATE project_analytics_settings settings
        SET
          max_saved_funnels = 1,
          updated_at = now()
        FROM projects
        JOIN organizations ON organizations.id = projects.organization_id
        WHERE settings.project_id = projects.id
          AND organizations.plan = 'free'
          AND settings.max_saved_funnels = 0
      `
    ]
  }),
  defineAnalyticsStorageSchemaMigration({
    id: "202607140002_expand_custom_dimension_capacity",
    description:
      "Expand existing zero custom-dimension settings to the current hosted tier capacities.",
    statements: [
      `
        ALTER TABLE project_analytics_settings
        ALTER COLUMN max_custom_dimensions SET DEFAULT 3
      `,
      `
        UPDATE project_analytics_settings settings
        SET
          max_custom_dimensions = CASE organizations.plan
            WHEN 'team' THEN 8
            WHEN 'solo' THEN 3
            ELSE 1
          END,
          updated_at = now()
        FROM projects
        JOIN organizations ON organizations.id = projects.organization_id
        WHERE settings.project_id = projects.id
          AND settings.max_custom_dimensions = 0
      `
    ]
  }),
  defineAnalyticsStorageSchemaMigration({
    id: "202607160001_complete_analytics_session_metrics",
    description:
      "Track exact active and returning visitors, populate session outcomes, and prevent cross-dimension unique overcounting.",
    statements: [
      `
        ALTER TABLE analytics_ingestion_ledger
        ADD COLUMN IF NOT EXISTS raw_deleted_at timestamptz
      `,
      `
        CREATE TABLE IF NOT EXISTS analytics_usage_claims (
          organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          period_starts_at timestamptz NOT NULL,
          claim_key text NOT NULL,
          metric text NOT NULL CHECK (
            metric IN (
              'analytics_events',
              'analytics_sessions',
              'analytics_journey_samples',
              'analytics_bundle_generations'
            )
          ),
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (organization_id, period_starts_at, claim_key)
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS analytics_usage_claims_period_idx
        ON analytics_usage_claims (period_starts_at, organization_id)
      `,
      `
        ALTER TABLE analytics_session_rollups
        ADD COLUMN IF NOT EXISTS active_visitors bigint NOT NULL DEFAULT 0
          CHECK (active_visitors >= 0)
      `,
      `
        CREATE TABLE IF NOT EXISTS analytics_visitor_first_seen (
          project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          visitor_hash text NOT NULL,
          first_seen_at timestamptz NOT NULL,
          last_seen_at timestamptz NOT NULL,
          PRIMARY KEY (project_id, visitor_hash)
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS analytics_visitor_first_seen_project_last_seen_idx
        ON analytics_visitor_first_seen (project_id, last_seen_at DESC)
      `,
      `
        ALTER TABLE analytics_rollup_uniques
        DROP CONSTRAINT IF EXISTS analytics_rollup_uniques_rollup_kind_check
      `,
      `
        ALTER TABLE analytics_rollup_uniques
        ADD CONSTRAINT analytics_rollup_uniques_rollup_kind_check
        CHECK (
          rollup_kind IN (
            'session',
            'visitor',
            'new_visitor',
            'returning_visitor',
            'route_session',
            'incident_route_session',
            'transition_session',
            'action_session',
            'funnel_step_session',
            'funnel_completion_session'
          )
        ) NOT VALID
      `,
      `
        ALTER TABLE analytics_rollup_uniques
        VALIDATE CONSTRAINT analytics_rollup_uniques_rollup_kind_check
      `,
      `
        WITH ranked AS (
          SELECT
            ctid,
            row_number() OVER (
              PARTITION BY
                project_id,
                rollup_kind,
                service,
                environment,
                bucket_start,
                bucket_granularity,
                rollup_key,
                subject_hash
              ORDER BY created_at ASC, dimension_hash ASC
            ) AS duplicate_rank
          FROM analytics_rollup_uniques
        )
        DELETE FROM analytics_rollup_uniques uniques
        USING ranked
        WHERE uniques.ctid = ranked.ctid
          AND ranked.duplicate_rank > 1
      `,
      `
        ALTER TABLE analytics_rollup_uniques
        DROP CONSTRAINT IF EXISTS analytics_rollup_uniques_pkey
      `,
      `
        ALTER TABLE analytics_rollup_uniques
        ADD CONSTRAINT analytics_rollup_uniques_pkey PRIMARY KEY (
          project_id,
          rollup_kind,
          service,
          environment,
          bucket_start,
          bucket_granularity,
          rollup_key,
          subject_hash
        )
      `
    ]
  }),
  defineAnalyticsStorageSchemaMigration({
    id: "202607160002_add_analytics_hourly_retention",
    description: "Add explicit bounded hourly-rollup retention with hosted tier defaults.",
    statements: [
      `
        ALTER TABLE project_analytics_settings
        ADD COLUMN IF NOT EXISTS hourly_retention_days integer NOT NULL DEFAULT 30
          CHECK (hourly_retention_days BETWEEN 1 AND 365)
      `,
      `
        UPDATE project_analytics_settings settings
        SET
          hourly_retention_days = CASE organizations.plan
            WHEN 'team' THEN 90
            WHEN 'solo' THEN 30
            ELSE 7
          END,
          updated_at = now()
        FROM projects
        JOIN organizations ON organizations.id = projects.organization_id
        WHERE settings.project_id = projects.id
      `
    ]
  })
] as const;
