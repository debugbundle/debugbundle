export const STORAGE_BOOTSTRAP_ACCOUNT_ANALYTICS_STATEMENTS = [
  `
    CREATE TABLE account_analytics_accounts (
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
    CREATE TABLE account_metric_periods (
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
    CREATE INDEX account_metric_periods_grain_period_metric_idx
    ON account_metric_periods (period_grain, period_starts_at, metric_key)
  `,
  `
    CREATE INDEX account_metric_periods_account_grain_period_idx
    ON account_metric_periods (analytics_account_id, period_grain, period_starts_at)
  `,
  `
    CREATE TABLE account_metric_events (
      dedupe_key_hash text PRIMARY KEY,
      analytics_account_id uuid NOT NULL REFERENCES account_analytics_accounts(analytics_account_id),
      metric_source text NOT NULL,
      occurred_at timestamptz NOT NULL,
      recorded_at timestamptz NOT NULL DEFAULT now(),
      metric_deltas jsonb NOT NULL
    )
  `,
  `
    CREATE TABLE ingestion_rejection_diagnostic_periods (
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
    CREATE INDEX ingestion_rejection_diagnostic_periods_reason_period_idx
    ON ingestion_rejection_diagnostic_periods (rejection_reason, period_starts_at, last_seen_at DESC)
  `,
  `
    CREATE TABLE account_payment_retention_records (
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
    CREATE INDEX account_payment_retention_records_provider_idx
    ON account_payment_retention_records (provider, account_deleted_at DESC)
  `,
  `
    CREATE TABLE account_payment_provider_events (
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
    CREATE UNIQUE INDEX account_payment_provider_events_provider_event_key
    ON account_payment_provider_events (provider, provider_event_id)
  `
] as const;
