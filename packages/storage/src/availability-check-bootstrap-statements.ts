export const AVAILABILITY_CHECK_BOOTSTRAP_STATEMENTS = [
  `
    CREATE TABLE availability_checks (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      name text NOT NULL,
      url text NOT NULL,
      method text NOT NULL CHECK (method IN ('GET', 'HEAD')),
      expected_status_min integer NOT NULL DEFAULT 200 CHECK (expected_status_min BETWEEN 100 AND 599),
      expected_status_max integer NOT NULL DEFAULT 399 CHECK (expected_status_max BETWEEN 100 AND 599),
      timeout_ms integer NOT NULL DEFAULT 2500 CHECK (timeout_ms BETWEEN 500 AND 5000),
      interval_seconds integer NOT NULL CHECK (interval_seconds >= 30),
      failure_threshold integer NOT NULL DEFAULT 3 CHECK (failure_threshold BETWEEN 1 AND 10),
      recovery_threshold integer NOT NULL DEFAULT 2 CHECK (recovery_threshold BETWEEN 1 AND 10),
      environment text NOT NULL DEFAULT 'production',
      service_name text,
      enabled boolean NOT NULL DEFAULT true,
      status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'passing', 'failing')),
      consecutive_failures integer NOT NULL DEFAULT 0,
      consecutive_successes integer NOT NULL DEFAULT 0,
      linked_incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL,
      last_checked_at timestamptz,
      next_check_at timestamptz,
      claimed_at timestamptz,
      last_result_status text CHECK (
        last_result_status IS NULL OR last_result_status IN (
          'success',
          'http_status_mismatch',
          'timeout',
          'dns_error',
          'tls_error',
          'connection_error',
          'redirect_blocked',
          'security_blocked',
          'internal_error'
        )
      ),
      last_result_http_status integer,
      last_result_error_kind text,
      last_result_error_message text,
      last_result_duration_ms integer,
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE INDEX availability_checks_project_created_idx
    ON availability_checks (project_id, created_at DESC)
  `,
  `
    CREATE INDEX availability_checks_due_idx
    ON availability_checks (next_check_at, project_id)
  `,
  `
    CREATE INDEX availability_checks_claimed_idx
    ON availability_checks (claimed_at)
  `,
  `
    CREATE TABLE availability_check_results (
      id uuid PRIMARY KEY,
      check_id uuid NOT NULL REFERENCES availability_checks(id) ON DELETE CASCADE,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      started_at timestamptz NOT NULL,
      completed_at timestamptz NOT NULL,
      duration_ms integer NOT NULL,
      status text NOT NULL CHECK (
        status IN (
          'success',
          'http_status_mismatch',
          'timeout',
          'dns_error',
          'tls_error',
          'connection_error',
          'redirect_blocked',
          'security_blocked',
          'internal_error'
        )
      ),
      http_status integer,
      error_kind text,
      error_message text,
      redirect_count integer NOT NULL DEFAULT 0,
      checked_url_host text NOT NULL,
      checked_url_path text NOT NULL,
      final_url text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE INDEX availability_check_results_check_started_idx
    ON availability_check_results (check_id, started_at DESC)
  `,
  `
    CREATE INDEX availability_check_results_project_started_idx
    ON availability_check_results (project_id, started_at DESC)
  `,
  `
    CREATE TABLE availability_check_daily_rollups (
      id uuid PRIMARY KEY,
      check_id uuid NOT NULL REFERENCES availability_checks(id) ON DELETE CASCADE,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      day date NOT NULL,
      state text NOT NULL CHECK (state IN ('unknown', 'operational', 'degraded', 'down', 'paused')),
      total_checks integer NOT NULL DEFAULT 0,
      successful_checks integer NOT NULL DEFAULT 0,
      failed_checks integer NOT NULL DEFAULT 0,
      degraded_checks integer NOT NULL DEFAULT 0,
      avg_duration_ms integer,
      first_checked_at timestamptz,
      last_checked_at timestamptz,
      downtime_seconds integer NOT NULL DEFAULT 0,
      incident_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (check_id, day)
    )
  `,
  `
    CREATE INDEX availability_check_daily_rollups_project_day_idx
    ON availability_check_daily_rollups (project_id, day DESC)
  `
] as const;
