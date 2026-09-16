export const STORAGE_BOOTSTRAP_INCIDENT_STATEMENTS = [
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
      resource_route text,
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
  `
] as const;
