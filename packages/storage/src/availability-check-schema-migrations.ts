import { createHash } from "node:crypto";

export interface AvailabilityCheckStorageSchemaMigration {
  id: string;
  description: string;
  statements: readonly string[];
  checksum: string;
}

function defineAvailabilityCheckStorageSchemaMigration(input: {
  id: string;
  description: string;
  statements: readonly string[];
}): AvailabilityCheckStorageSchemaMigration {
  return {
    ...input,
    checksum: createHash("sha256").update(JSON.stringify(input)).digest("hex")
  };
}

export const AVAILABILITY_CHECK_STORAGE_SCHEMA_MIGRATIONS = [
  defineAvailabilityCheckStorageSchemaMigration({
    id: "202606150001_add_availability_checks",
    description:
      "Add project-scoped availability checks, result history, and daily rollups.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS availability_checks (
          id uuid PRIMARY KEY,
          project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
          name text NOT NULL,
          url text NOT NULL,
          method text NOT NULL,
          expected_status_min integer NOT NULL DEFAULT 200,
          expected_status_max integer NOT NULL DEFAULT 399,
          timeout_ms integer NOT NULL DEFAULT 5000,
          interval_seconds integer NOT NULL,
          failure_threshold integer NOT NULL DEFAULT 3,
          recovery_threshold integer NOT NULL DEFAULT 2,
          environment text NOT NULL DEFAULT 'production',
          service_name text,
          enabled boolean NOT NULL DEFAULT true,
          status text NOT NULL DEFAULT 'unknown',
          consecutive_failures integer NOT NULL DEFAULT 0,
          consecutive_successes integer NOT NULL DEFAULT 0,
          linked_incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL,
          last_checked_at timestamptz,
          next_check_at timestamptz,
          claimed_at timestamptz,
          last_result_status text,
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
        ALTER TABLE availability_checks
        DROP CONSTRAINT IF EXISTS availability_checks_method_check
      `,
      `
        ALTER TABLE availability_checks
        ADD CONSTRAINT availability_checks_method_check
        CHECK (method IN ('GET', 'HEAD'))
      `,
      `
        ALTER TABLE availability_checks
        DROP CONSTRAINT IF EXISTS availability_checks_expected_status_min_check
      `,
      `
        ALTER TABLE availability_checks
        ADD CONSTRAINT availability_checks_expected_status_min_check
        CHECK (expected_status_min BETWEEN 100 AND 599)
      `,
      `
        ALTER TABLE availability_checks
        DROP CONSTRAINT IF EXISTS availability_checks_expected_status_max_check
      `,
      `
        ALTER TABLE availability_checks
        ADD CONSTRAINT availability_checks_expected_status_max_check
        CHECK (expected_status_max BETWEEN 100 AND 599)
      `,
      `
        ALTER TABLE availability_checks
        DROP CONSTRAINT IF EXISTS availability_checks_timeout_ms_check
      `,
      `
        ALTER TABLE availability_checks
        ADD CONSTRAINT availability_checks_timeout_ms_check
        CHECK (timeout_ms BETWEEN 500 AND 5000)
      `,
      `
        ALTER TABLE availability_checks
        DROP CONSTRAINT IF EXISTS availability_checks_interval_seconds_check
      `,
      `
        ALTER TABLE availability_checks
        ADD CONSTRAINT availability_checks_interval_seconds_check
        CHECK (interval_seconds >= 30)
      `,
      `
        ALTER TABLE availability_checks
        DROP CONSTRAINT IF EXISTS availability_checks_failure_threshold_check
      `,
      `
        ALTER TABLE availability_checks
        ADD CONSTRAINT availability_checks_failure_threshold_check
        CHECK (failure_threshold BETWEEN 1 AND 10)
      `,
      `
        ALTER TABLE availability_checks
        DROP CONSTRAINT IF EXISTS availability_checks_recovery_threshold_check
      `,
      `
        ALTER TABLE availability_checks
        ADD CONSTRAINT availability_checks_recovery_threshold_check
        CHECK (recovery_threshold BETWEEN 1 AND 10)
      `,
      `
        ALTER TABLE availability_checks
        DROP CONSTRAINT IF EXISTS availability_checks_status_check
      `,
      `
        ALTER TABLE availability_checks
        ADD CONSTRAINT availability_checks_status_check
        CHECK (status IN ('unknown', 'passing', 'failing'))
      `,
      `
        ALTER TABLE availability_checks
        DROP CONSTRAINT IF EXISTS availability_checks_last_result_status_check
      `,
      `
        ALTER TABLE availability_checks
        ADD CONSTRAINT availability_checks_last_result_status_check
        CHECK (
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
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS availability_checks_project_created_idx
        ON availability_checks (project_id, created_at DESC)
      `,
      `
        CREATE INDEX IF NOT EXISTS availability_checks_due_idx
        ON availability_checks (next_check_at, project_id)
      `,
      `
        CREATE INDEX IF NOT EXISTS availability_checks_claimed_idx
        ON availability_checks (claimed_at)
      `,
      `
        CREATE TABLE IF NOT EXISTS availability_check_results (
          id uuid PRIMARY KEY,
          check_id uuid NOT NULL REFERENCES availability_checks(id) ON DELETE CASCADE,
          project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          started_at timestamptz NOT NULL,
          completed_at timestamptz NOT NULL,
          duration_ms integer NOT NULL,
          status text NOT NULL,
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
        ALTER TABLE availability_check_results
        DROP CONSTRAINT IF EXISTS availability_check_results_status_check
      `,
      `
        ALTER TABLE availability_check_results
        ADD CONSTRAINT availability_check_results_status_check
        CHECK (
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
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS availability_check_results_check_started_idx
        ON availability_check_results (check_id, started_at DESC)
      `,
      `
        CREATE INDEX IF NOT EXISTS availability_check_results_project_started_idx
        ON availability_check_results (project_id, started_at DESC)
      `,
      `
        CREATE TABLE IF NOT EXISTS availability_check_daily_rollups (
          id uuid PRIMARY KEY,
          check_id uuid NOT NULL REFERENCES availability_checks(id) ON DELETE CASCADE,
          project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          day date NOT NULL,
          state text NOT NULL,
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
        ALTER TABLE availability_check_daily_rollups
        DROP CONSTRAINT IF EXISTS availability_check_daily_rollups_state_check
      `,
      `
        ALTER TABLE availability_check_daily_rollups
        ADD CONSTRAINT availability_check_daily_rollups_state_check
        CHECK (state IN ('unknown', 'operational', 'degraded', 'down', 'paused'))
      `,
      `
        CREATE INDEX IF NOT EXISTS availability_check_daily_rollups_project_day_idx
        ON availability_check_daily_rollups (project_id, day DESC)
      `
    ]
  })
] as const;
