export interface SessionRecord {
  session_id: string;
  user_id: string;
  email: string;
  email_verified_at: string | null;
  organization_id: string;
  organization_plan: "free" | "solo" | "team";
  role: "owner" | "member";
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  avatar_url: string | null;
  auth_methods: {
    email: boolean;
    github: boolean;
  };
  csrf_token: string;
}

export interface AdminAnalyticsTimeWindow {
  starts_at: string;
  ends_at: string;
}

export interface AdminAnalyticsSummary {
  generated_at: string;
  collection_started_at: string;
  windows: {
    today: AdminAnalyticsTimeWindow;
    this_week: AdminAnalyticsTimeWindow;
    this_month: AdminAnalyticsTimeWindow;
    this_year: AdminAnalyticsTimeWindow;
  };
  kpis: {
    active_accounts_today: number;
    active_accounts_this_week: number;
    active_accounts_this_month: number;
    new_accounts_today: number;
    new_accounts_this_week: number;
    new_accounts_this_month: number;
    deleted_accounts_this_month: number;
    active_accounts_total: number;
    deleted_accounts_total: number;
  };
  usage: {
    raw_events_accepted_this_month: number;
    billable_events_counted_this_month: number;
    incident_signal_events_this_month: number;
    context_signal_events_this_month: number;
    operational_signal_events_this_month: number;
    cloud_verification_events_this_month: number;
    local_verification_events_this_month: number;
  };
  incidents: {
    opened_this_month: number;
    resolved_this_month: number;
    reopened_this_month: number;
    regressed_this_month: number;
    occurrences_this_month: number;
    high_severity_occurrences_this_month: number;
    critical_severity_occurrences_this_month: number;
    auto_detected_spikes_this_month: number;
    resolution_rate_this_month: number;
  };
  bundles: {
    failure_created_this_month: number;
    failure_updated_this_month: number;
    failure_generation_failed_this_month: number;
    improvement_created_this_month: number;
    improvement_generation_failed_this_month: number;
    reproductions_created_this_month: number;
    reproductions_failed_this_month: number;
  };
  improvements: {
    opened_this_month: number;
    resolved_this_month: number;
    snoozed_this_month: number;
    resolution_rate_this_month: number;
    recurring_incident_opened_this_month: number;
    post_deploy_regression_opened_this_month: number;
    slow_request_opened_this_month: number;
    request_failure_opened_this_month: number;
    warning_log_opened_this_month: number;
  };
  billing: {
    trials_started_this_month: number;
    trials_converted_this_month: number;
    trials_expired_this_month: number;
    plan_upgrades_this_month: number;
    plan_downgrades_this_month: number;
    capacity_units_purchased_this_month: number;
    capacity_units_reduced_this_month: number;
  };
  health: {
    raw_events_rejected_this_month: number;
    malformed_rejections_this_month: number;
    rate_limited_rejections_this_month: number;
    quota_rejections_this_month: number;
    capture_policy_rejections_this_month: number;
    capture_rule_rejections_this_month: number;
    alert_deliveries_failed_this_month: number;
    webhook_deliveries_failed_this_month: number;
    weekly_reports_failed_this_month: number;
    github_dispatches_failed_this_month: number;
    webhooks_auto_disabled_this_month: number;
    operational_emails_sent_this_month: number;
    allowance_warning_emails_sent_this_month: number;
    allowance_limit_emails_sent_this_month: number;
  };
}

export interface AdminAnalyticsAccessStatus {
  status: "ready" | "email_auth_required";
}

export interface ImportedAccountAvatarRecord {
  source: "github" | "gravatar";
  avatar_url: string;
  updated_at: string;
}

export interface DeletedAccountRecord {
  deleted_at: string;
  organization_id: string;
  user_deleted: boolean;
}

export interface SentSystemEmailPreviewRecord {
  delivered: true;
  recipient_emails: string[];
  preview_id: string;
}

export interface MemberTokenRecord {
  token_id: string;
  user_id: string;
  organization_id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
}

export interface CreatedMemberToken extends MemberTokenRecord {
  plaintext?: string;
}

export interface ProjectRecord {
  project_id: string;
  organization_id: string;
  owner_user_id?: string;
  owner_email?: string;
  relationship?: "owned" | "shared";
  sharing_state?: "private" | "shared_by_you" | "shared_with_you";
  effective_role?: "owner" | "admin" | "member";
  shared_access_suspended?: boolean;
  name: string;
  slug: string;
  environment_default: string;
  organization_plan: "free" | "solo" | "team";
  metrics: {
    open_incidents: number;
    regressed_incidents: number;
    opened_incidents_today: number;
    opened_incidents_month: number;
    monthly_bundle_requests: number;
    monthly_raw_ingested_events: number;
    retained_bundles: number;
    monthly_alert_deliveries: number;
  };
  created_at: string;
  updated_at: string;
}

export interface DeletedProjectRecord {
  project_id: string;
  organization_id: string;
  owner_user_id?: string;
  owner_email?: string;
  relationship?: "owned" | "shared";
  sharing_state?: "private" | "shared_by_you" | "shared_with_you";
  effective_role?: "owner" | "admin" | "member";
  shared_access_suspended?: boolean;
  name: string;
  slug: string;
  environment_default: string;
  organization_plan: "free" | "solo" | "team";
  created_at: string;
  updated_at: string;
}

export interface ProjectTokenRecord {
  token_id: string;
  project_id: string;
  label: string;
  allowed_origins: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
}

export interface CreatedProjectToken extends ProjectTokenRecord {
  plaintext?: string;
}

export interface ProbeActivationRecord {
  activation_id: string;
  label_pattern: string;
  service: string;
  environment: string;
  expires_at: string;
  trigger_expires_at: string;
}

export interface CreatedProbeActivation {
  activation: ProbeActivationRecord;
  trigger_token: string;
}

export type AvailabilityCheckMethod = "GET" | "HEAD";

export type AvailabilityCheckResultStatus =
  | "success"
  | "http_status_mismatch"
  | "timeout"
  | "dns_error"
  | "tls_error"
  | "connection_error"
  | "redirect_blocked"
  | "security_blocked"
  | "internal_error";

export type AvailabilityCheckHealthStatus = "unknown" | "passing" | "failing" | "paused";

export interface AvailabilityCheckLimits {
  max_checks_per_project: number;
  min_interval_seconds: number;
}

export interface AvailabilityCheckRecord {
  check_id: string;
  project_id: string;
  name: string;
  url: string;
  method: AvailabilityCheckMethod;
  expected_status_min: number;
  expected_status_max: number;
  timeout_ms: number;
  interval_seconds: number;
  failure_threshold: number;
  recovery_threshold: number;
  environment: string;
  service_name: string | null;
  enabled: boolean;
  status: AvailabilityCheckHealthStatus;
  paused_reason: string | null;
  organization_plan: "free" | "solo" | "team";
  consecutive_failures: number;
  consecutive_successes: number;
  linked_incident_id: string | null;
  last_checked_at: string | null;
  next_check_at: string | null;
  last_result_status: AvailabilityCheckResultStatus | null;
  last_result_http_status: number | null;
  last_result_error_kind: string | null;
  last_result_error_message: string | null;
  last_result_duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface AvailabilityCheckResultRecord {
  result_id: string;
  check_id: string;
  project_id: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  status: AvailabilityCheckResultStatus;
  http_status: number | null;
  error_kind: string | null;
  error_message: string | null;
  redirect_count: number;
  checked_url_host: string;
  final_url: string;
}

export interface AvailabilityCheckDailyRollupRecord {
  check_id: string;
  project_id: string;
  day: string;
  state: "unknown" | "operational" | "degraded" | "down" | "paused";
  total_checks: number;
  successful_checks: number;
  failed_checks: number;
  degraded_checks: number;
  avg_duration_ms: number | null;
  first_checked_at: string | null;
  last_checked_at: string | null;
  downtime_seconds: number;
  incident_ids: string[];
}

export interface AvailabilityCheckTestResult {
  normalized_url: string;
  result: {
    status: AvailabilityCheckResultStatus;
    http_status: number | null;
    duration_ms: number;
    error_kind: string | null;
    error_message: string | null;
    checked_url_host: string;
    checked_url_path: string;
    checked_url_query: Record<string, string>;
    final_url: string;
    redirect_count: number;
  };
}

export type CapturePreset = "minimal" | "balanced" | "investigative";

export type CaptureLogs = "off" | "error" | "warning" | "info";

export type CaptureRequestEvents = "off" | "failures_only" | "filtered" | "all";

export type CaptureBreadcrumbs = "local_only" | "exception_only" | "standalone";

export type CaptureProbeEvents = "buffer_only" | "standalone_when_activated";

export interface ImmediateClientErrorPathRule {
  status_code: number;
  path_pattern: string;
  methods: Array<"GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS">;
}

export interface ProjectCapturePolicy {
  preset: CapturePreset;
  capture_logs: CaptureLogs;
  capture_request_events: CaptureRequestEvents;
  capture_breadcrumbs: CaptureBreadcrumbs;
  capture_probe_events: CaptureProbeEvents;
  immediate_client_error_statuses: number[];
  immediate_client_error_path_rules: ImmediateClientErrorPathRule[];
}

export interface ProjectCapturePolicyOverrides {
  capture_logs: CaptureLogs | null;
  capture_request_events: CaptureRequestEvents | null;
  capture_breadcrumbs: CaptureBreadcrumbs | null;
  capture_probe_events: CaptureProbeEvents | null;
  immediate_client_error_statuses: number[] | null;
  immediate_client_error_path_rules: ImmediateClientErrorPathRule[] | null;
}

export interface ProjectCapturePolicyResponse {
  access_mode: "manage" | "preview";
  policy: ProjectCapturePolicy;
  overrides: ProjectCapturePolicyOverrides;
}

export interface ProjectCapturePolicyUpdate {
  preset?: CapturePreset;
  capture_logs?: CaptureLogs | null;
  capture_request_events?: CaptureRequestEvents | null;
  capture_breadcrumbs?: CaptureBreadcrumbs | null;
  capture_probe_events?: CaptureProbeEvents | null;
  immediate_client_error_statuses?: number[] | null;
  immediate_client_error_path_rules?: ImmediateClientErrorPathRule[] | null;
}

export type ImprovementBundleSensitivity = "high_confidence" | "balanced" | "verbose";

export interface ProjectImprovementSettings {
  automated_improvement_bundles_enabled: boolean;
  improvement_bundle_sensitivity: ImprovementBundleSensitivity;
}

export interface ProjectImprovementSettingsResponse {
  access_mode: "manage" | "preview";
  cloud_automation_available: boolean;
  settings: ProjectImprovementSettings;
}

export interface ProjectImprovementSettingsUpdate {
  automated_improvement_bundles_enabled?: boolean;
  improvement_bundle_sensitivity?: ImprovementBundleSensitivity;
}

export interface IncidentRecord {
  incident_id: string;
  project_id: string;
  project_name: string;
  service_id: string;
  service_name: string | null;
  latest_deployment_id: string | null;
  environment: string;
  fingerprint: string;
  fingerprint_version: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "resolved" | "regressed";
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  spike_detected_at: string | null;
  resolved_at?: string | null;
  regressed_at: string | null;
  matched_fields: string[];
}

export interface ImprovementRecord {
  improvement_id: string;
  project_id: string;
  project_name: string;
  project_slug: string;
  service_id: string | null;
  service_name: string;
  service_runtime: string | null;
  service_framework: string | null;
  environment: string;
  kind:
    | "warning_hotspot"
    | "slow_request"
    | "request_failure_pattern"
    | "recurring_incident"
    | "post_deploy_regression";
  status: "open" | "resolved" | "snoozed";
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  fingerprint: string;
  title: string;
  summary: string;
  occurrence_count: number;
  evidence: Record<string, unknown>;
  related_incident_ids: string[];
  first_detected_at: string;
  last_detected_at: string;
  resolved_at: string | null;
  snoozed_until: string | null;
  bundle_generation_number: number;
  bundle_created_at: string | null;
  bundle_updated_at: string | null;
  bundle_failure_reason: string | null;
}

export interface ServiceRecord {
  service_id: string;
  project_id: string;
  name: string;
  runtime: string | null;
  framework: string | null;
  environment: string;
}

export interface BillingUsageMetric {
  used: number;
  limit: number;
}

export type BillingState =
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "admin_override"
  | "trialing"
  | "trial_expired"
  | null;

export type BillingTrialPlan = "solo" | "team";

export interface BillingTrialSummary {
  available: boolean;
  active: boolean;
  plan: BillingTrialPlan | null;
  started_at: string | null;
  ends_at: string | null;
  used_at: string | null;
  converted_at: string | null;
  expired_at: string | null;
  days_remaining: number | null;
}

export interface BillingSummaryRecord {
  plan: "free" | "solo" | "team";
  billing_state: BillingState;
  stripe_customer_id: string | null;
  active_projects: number;
  capacity_units: {
    total: number;
    included: number;
    additional_purchased: number;
    pending_reduction: {
      additional_purchased: number;
      total: number;
      effective_at: string;
    } | null;
  };
  usage_window: {
    starts_at: string;
    ends_at: string;
  };
  allowances: {
    monthly_bundle_requests: BillingUsageMetric;
    monthly_raw_ingested_events: BillingUsageMetric;
    retained_bundle_cap: BillingUsageMetric;
    monthly_remote_activations: BillingUsageMetric;
    monthly_alert_deliveries: BillingUsageMetric;
    monthly_webhook_deliveries: BillingUsageMetric;
  };
  trial: BillingTrialSummary;
}

export type AlertChannel = "email" | "slack" | "discord" | "webhook";

export type AlertConditionType =
  | "new_incident"
  | "incident_regressed"
  | "error_spike"
  | "severity_threshold"
  | "regression_after_deploy";

export interface AlertRecord {
  alert_id: string;
  project_id: string;
  created_by_user_id: string;
  service_id: string | null;
  channel: AlertChannel;
  condition_type: AlertConditionType;
  severity_min: "low" | "medium" | "high" | "critical" | null;
  cooldown_seconds: number;
  config: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type WeeklyReportChannel = "email" | "slack";

export type WeeklyReportDayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface WeeklyReportChannelRecord {
  channel_id: string;
  project_id: string;
  channel: WeeklyReportChannel;
  config: Record<string, unknown>;
  schedule: {
    day_of_week: WeeklyReportDayOfWeek;
    hour_of_day: number;
    timezone: string;
  };
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type WebhookEventType =
  | "bundle.created"
  | "bundle.updated"
  | "bundle.reopened"
  | "bundle.resolved"
  | "verification.passed"
  | "verification.failed"
  | "improvement_bundle.created"
  | "incident.spike_detected";

export interface WebhookRecord {
  webhook_id: string;
  project_id: string;
  created_by_user_id: string;
  url: string;
  events: WebhookEventType[];
  filters: {
    environment?: string[];
    service?: string[];
    severity_min?: "low" | "medium" | "high" | "critical";
    bundle_type?: Array<"failure" | "improvement">;
    verification?: boolean;
  };
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatedWebhookRecord extends WebhookRecord {
  signing_secret?: string;
}

export interface WebhookDeliveryRecord {
  delivery_id: string;
  event_type: WebhookEventType;
  status: "pending" | "retrying" | "delivered" | "failed" | "disabled";
  attempt_count: number;
  next_attempt_at: string | null;
  last_response_code: number | null;
  last_attempted_at: string | null;
  last_error: string | null;
}

export interface GitHubInstallationRecord {
  id: string;
  installation_id: number;
  account_login: string;
  account_type: "Organization" | "User";
  status: "active" | "suspended" | "removed";
  created_at: string;
  updated_at: string;
}

export interface GitHubRepositoryRecord {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
}

export interface ProjectGitHubRepoRecord {
  id: string;
  project_id: string;
  installation_id: string;
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubDispatchRuleRecord {
  rule_id: string;
  project_id: string;
  created_by_user_id: string;
  name: string;
  enabled: boolean;
  event_types: string[];
  environments: string[];
  services: string[];
  severity_min: "low" | "medium" | "high" | "critical" | null;
  bundle_type: "failure" | "improvement" | null;
  incident_status: "new_only" | "reopened_only" | "new_or_reopened";
  cooldown_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface GitHubDispatchDeliveryRecord {
  delivery_id: string;
  rule_id: string;
  rule_name: string;
  incident_id: string | null;
  improvement_id: string | null;
  target_title: string;
  status: "pending" | "retrying" | "delivered" | "failed" | "skipped";
  attempt_count: number;
  last_attempt_at: string | null;
  last_error: string | null;
  github_status_code: number | null;
  created_at: string;
}
