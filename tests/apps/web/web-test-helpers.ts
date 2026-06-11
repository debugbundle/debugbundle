import { getTierCapabilities } from "../../../packages/shared-types/src/index.js";

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

export interface ProjectRecord {
  project_id: string;
  organization_id: string;
  name: string;
  slug: string;
  environment_default: string;
  organization_plan: "free" | "solo" | "team";
  owner_user_id?: string;
  owner_email?: string;
  relationship?: "owned" | "shared";
  sharing_state?: "private" | "shared_by_you" | "shared_with_you";
  effective_role?: "owner" | "admin" | "member";
  shared_access_suspended?: boolean;
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

export interface ProjectTokenRecord {
  token_id: string;
  project_id: string;
  label: string;
  allowed_origins: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  plaintext?: string;
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

export interface ProjectMemberRecord {
  user_id: string;
  email: string;
  role: "owner" | "admin" | "member";
  membership_type: "owner" | "collaborator";
  created_at: string;
  avatar_url: string | null;
}

export interface ProjectInviteRecord {
  invite_id: string;
  project_id: string;
  email: string;
  role: "admin" | "member";
  invited_by_user_id: string;
  accepted_at: string | null;
  canceled_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface BillingUsageMetric {
  used: number;
  limit: number;
}

export interface BillingSummaryRecord {
  plan: "free" | "solo" | "team";
  billing_state:
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "incomplete"
    | "admin_override"
    | "trialing"
    | "trial_expired"
    | null;
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
  trial: {
    available: boolean;
    active: boolean;
    plan: "solo" | "team" | null;
    started_at: string | null;
    ends_at: string | null;
    used_at: string | null;
    converted_at: string | null;
    expired_at: string | null;
    days_remaining: number | null;
  };
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
  signing_secret?: string;
}

export interface WebhookDelivery {
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

export interface GitHubRepositoryRecord {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
}

export function createSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    session_id: "ses_123",
    user_id: "usr_123",
    email: "owen@example.com",
    email_verified_at: "2026-03-17T00:00:00.000Z",
    organization_id: "org_123",
    organization_plan: "team",
    role: "owner",
    created_at: "2026-03-17T00:00:00.000Z",
    expires_at: "2026-03-17T12:00:00.000Z",
    revoked_at: null,
    avatar_url: null,
    auth_methods: {
      email: true,
      github: false
    },
    csrf_token: "csrf-token-123",
    ...overrides
  };
}

export function createMemberTokenRecord(overrides: Partial<MemberTokenRecord> = {}): MemberTokenRecord {
  return {
    token_id: "tok_123",
    user_id: "usr_123",
    organization_id: "org_123",
    label: "Local MCP",
    created_at: "2026-03-17T00:00:00.000Z",
    last_used_at: null,
    revoked_at: null,
    expires_at: null,
    ...overrides
  };
}

export function createProject(
  overrides: Partial<Omit<ProjectRecord, "metrics">> & { metrics?: Partial<ProjectRecord["metrics"]> } = {}
): ProjectRecord {
  const defaultMetrics: ProjectRecord["metrics"] = {
    open_incidents: 3,
    regressed_incidents: 1,
    opened_incidents_today: 1,
    opened_incidents_month: 5,
    monthly_bundle_requests: 12,
    monthly_raw_ingested_events: 120,
    retained_bundles: 6,
    monthly_alert_deliveries: 4
  };

  return {
    project_id: "proj_123",
    organization_id: "org_123",
    owner_user_id: "usr_123",
    owner_email: "owner@example.com",
    relationship: "owned",
    sharing_state: "private",
    effective_role: "owner",
    name: "Main App",
    slug: "main-app",
    environment_default: "production",
    organization_plan: "free",
    ...overrides,
    metrics: {
      ...defaultMetrics,
      ...overrides.metrics
    },
    created_at: overrides.created_at ?? "2026-03-17T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-03-17T00:00:00.000Z"
  };
}

export function createProjectToken(overrides: Partial<ProjectTokenRecord> = {}): ProjectTokenRecord {
  return {
    token_id: "proj_tok_123",
    project_id: "proj_123",
    label: "Production ingest",
    allowed_origins: [],
    created_at: "2026-03-17T00:00:00.000Z",
    last_used_at: null,
    revoked_at: null,
    expires_at: null,
    ...overrides
  };
}

export function createIncident(overrides: Partial<IncidentRecord> = {}): IncidentRecord {
  return {
    incident_id: "inc_123",
    project_id: "proj_123",
    project_name: "Main App",
    service_id: "svc_123",
    service_name: "checkout-api",
    latest_deployment_id: null,
    environment: "production",
    fingerprint: "fp_123",
    fingerprint_version: "1",
    title: "TypeError in checkout handler",
    severity: "high",
    status: "open",
    first_seen_at: "2026-03-17T00:00:00.000Z",
    last_seen_at: "2026-03-17T00:05:00.000Z",
    occurrence_count: 7,
    spike_detected_at: null,
    resolved_at: null,
    regressed_at: null,
    matched_fields: ["error_type", "route_template", "top_3_frames"],
    ...overrides
  };
}

export function createProjectMember(overrides: Partial<ProjectMemberRecord> = {}): ProjectMemberRecord {
  return {
    user_id: "usr_123",
    email: "owen@example.com",
    role: "owner",
    membership_type: "owner",
    created_at: "2026-03-17T00:00:00.000Z",
    avatar_url: null,
    ...overrides
  };
}

export function createProjectInvite(overrides: Partial<ProjectInviteRecord> = {}): ProjectInviteRecord {
  return {
    invite_id: "pinv_123",
    project_id: "proj_123",
    email: "pending@example.com",
    role: "member",
    invited_by_user_id: "usr_123",
    accepted_at: null,
    canceled_at: null,
    expires_at: "2026-03-24T00:00:00.000Z",
    created_at: "2026-03-17T00:00:00.000Z",
    ...overrides
  };
}

export function createBillingSummary(overrides: Partial<BillingSummaryRecord> = {}): BillingSummaryRecord {
  const plan = overrides.plan ?? "free";
  const capabilities = getTierCapabilities(plan);
  const capacityUnits = overrides.capacity_units ?? {
    total: capabilities.included_capacity_units,
    included: capabilities.included_capacity_units,
    additional_purchased: 0,
    pending_reduction: null
  };

  return {
    plan,
    billing_state: null,
    stripe_customer_id: null,
    active_projects: 1,
    capacity_units: capacityUnits,
    usage_window: {
      starts_at: "2026-03-01T00:00:00.000Z",
      ends_at: "2026-04-01T00:00:00.000Z"
    },
    allowances: overrides.allowances ?? {
      monthly_bundle_requests: {
        used: 12,
        limit: capabilities.monthly_bundle_requests * capacityUnits.total
      },
      monthly_raw_ingested_events: {
        used: 120,
        limit: capabilities.monthly_raw_ingested_events * capacityUnits.total
      },
      retained_bundle_cap: {
        used: 6,
        limit: capabilities.retained_bundle_cap * capacityUnits.total
      },
      monthly_remote_activations: {
        used: 0,
        limit: capabilities.monthly_remote_activations * capacityUnits.total
      },
      monthly_alert_deliveries: {
        used: 4,
        limit: capabilities.monthly_alert_deliveries * capacityUnits.total
      },
      monthly_webhook_deliveries: {
        used: 8,
        limit: capabilities.monthly_webhook_deliveries * capacityUnits.total
      }
    },
    trial: {
      available: true,
      active: false,
      plan: null,
      started_at: null,
      ends_at: null,
      used_at: null,
      converted_at: null,
      expired_at: null,
      days_remaining: null
    },
    ...overrides
  };
}

export function createAlert(overrides: Partial<AlertRecord> = {}): AlertRecord {
  return {
    alert_id: "alert_123",
    project_id: "proj_123",
    created_by_user_id: "usr_123",
    service_id: null,
    channel: "email",
    condition_type: "new_incident",
    severity_min: null,
    cooldown_seconds: 0,
    config: { to: "owen@example.com" },
    is_enabled: true,
    created_at: "2026-03-17T00:00:00.000Z",
    updated_at: "2026-03-17T00:00:00.000Z",
    ...overrides
  };
}

export function createWebhook(overrides: Partial<WebhookRecord> = {}): WebhookRecord {
  return {
    webhook_id: "wh_123",
    project_id: "proj_123",
    created_by_user_id: "usr_123",
    url: "https://hooks.example.test/debugbundle",
    events: ["bundle.created"],
    filters: {},
    is_enabled: true,
    created_at: "2026-03-17T00:00:00.000Z",
    updated_at: "2026-03-17T00:00:00.000Z",
    ...overrides
  };
}

export function createGitHubInstallation(overrides: Partial<GitHubInstallationRecord> = {}): GitHubInstallationRecord {
  return {
    id: "ghi_123",
    installation_id: 123,
    account_login: "debugbundle",
    account_type: "Organization",
    status: "active",
    created_at: "2026-03-26T00:00:00.000Z",
    updated_at: "2026-03-26T00:00:00.000Z",
    ...overrides
  };
}

export function createProjectGitHubRepo(
  overrides: Partial<ProjectGitHubRepoRecord> = {}
): ProjectGitHubRepoRecord {
  return {
    id: "pgr_123",
    project_id: "proj_123",
    installation_id: "ghi_123",
    repo_owner: "debugbundle",
    repo_name: "app",
    default_branch: "main",
    created_at: "2026-03-26T00:00:00.000Z",
    updated_at: "2026-03-26T00:00:00.000Z",
    ...overrides
  };
}

export function createGitHubDispatchRule(
  overrides: Partial<GitHubDispatchRuleRecord> = {}
): GitHubDispatchRuleRecord {
  return {
    rule_id: "ghr_123",
    project_id: "proj_123",
    created_by_user_id: "usr_123",
    name: "High severity incidents",
    enabled: true,
    event_types: ["bundle.created", "bundle.reopened"],
    environments: ["production"],
    services: ["checkout-api"],
    severity_min: "high",
    bundle_type: "failure",
    incident_status: "new_or_reopened",
    cooldown_seconds: 300,
    created_at: "2026-03-26T00:00:00.000Z",
    updated_at: "2026-03-26T00:00:00.000Z",
    ...overrides
  };
}

export function createGitHubDispatchDelivery(
  overrides: Partial<GitHubDispatchDeliveryRecord> = {}
): GitHubDispatchDeliveryRecord {
  return {
    delivery_id: "gdd_123",
    rule_id: "ghr_123",
    rule_name: "High severity incidents",
    incident_id: "inc_123",
    improvement_id: null,
    target_title: "TypeError in checkout",
    status: "failed",
    attempt_count: 2,
    last_attempt_at: "2026-03-26T00:10:00.000Z",
    last_error: "Repository not found",
    github_status_code: 404,
    created_at: "2026-03-26T00:00:00.000Z",
    ...overrides
  };
}

export function createGitHubRepository(overrides: Partial<GitHubRepositoryRecord> = {}): GitHubRepositoryRecord {
  return {
    id: 1,
    owner: "debugbundle",
    name: "app",
    full_name: "debugbundle/app",
    default_branch: "main",
    private: true,
    ...overrides
  };
}

export function createWebhookDelivery(overrides: Partial<WebhookDelivery> = {}): WebhookDelivery {
  return {
    delivery_id: "del_123",
    event_type: "verification.passed",
    status: "delivered",
    attempt_count: 1,
    next_attempt_at: null,
    last_response_code: 200,
    last_attempted_at: "2026-03-17T00:00:05.000Z",
    last_error: null,
    ...overrides
  };
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

export function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}
