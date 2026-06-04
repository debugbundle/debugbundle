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
  name: string;
  slug: string;
  environment_default: string;
  organization_plan: "free" | "solo" | "team";
  metrics: {
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

export type CapturePreset = "minimal" | "balanced" | "investigative";

export type CaptureLogs = "off" | "error" | "warning" | "info";

export type CaptureRequestEvents = "off" | "failures_only" | "filtered" | "all";

export type CaptureBreadcrumbs = "local_only" | "exception_only" | "standalone";

export type CaptureProbeEvents = "buffer_only" | "standalone_when_activated";

export interface ProjectCapturePolicy {
  preset: CapturePreset;
  capture_logs: CaptureLogs;
  capture_request_events: CaptureRequestEvents;
  capture_breadcrumbs: CaptureBreadcrumbs;
  capture_probe_events: CaptureProbeEvents;
  immediate_client_error_statuses: number[];
}

export interface ProjectCapturePolicyOverrides {
  capture_logs: CaptureLogs | null;
  capture_request_events: CaptureRequestEvents | null;
  capture_breadcrumbs: CaptureBreadcrumbs | null;
  capture_probe_events: CaptureProbeEvents | null;
  immediate_client_error_statuses: number[] | null;
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
