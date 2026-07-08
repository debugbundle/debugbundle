import type { ProjectColorTag, TierName } from "../../shared-types/src/index.js";
import type { DeliverGitHubDispatchJob, DeliverWebhookJob } from "./queue-types.js";
import type {
  AccountDataExportRecord,
  AccountDeletionBlockedReason,
  CreateProjectInviteResult,
  DeletedAccountRecord,
  DeletedProjectRecord,
  DeleteWebhookResult,
  LeaveProjectMembershipResult,
  MemberTokenRecord,
  ProjectInviteRecord,
  ProjectMemberRecord,
  ProjectRecord,
  ProjectTokenRecord,
  RemoveProjectMemberResult,
  UpdateProjectMemberRoleResult,
  WebhookEventType,
  WebhookFilters,
  WebhookRecord
} from "./types.js";

export interface WeeklyReportTopSpikingIncident {
  incident_id: string;
  title: string;
  occurrence_count: number;
  spike_detected_at: string;
}

export interface WeeklyProjectReportSummary {
  project_id: string;
  project_name: string;
  window_start: string;
  window_end: string;
  bundle_counts: {
    failure: number;
    improvement: number;
  };
  new_incidents: number;
  resolved_incidents: number;
  opened_incidents_resolved: number;
  regressions: number;
  top_spiking_incidents: WeeklyReportTopSpikingIncident[];
}

export interface WeeklyReportingStore {
  listProjectsWithWeeklyActivity(input: {
    window_start: string;
    window_end: string;
    limit: number;
  }): Promise<string[]>;
  getWeeklyProjectReport(input: {
    project_id: string;
    window_start: string;
    window_end: string;
  }): Promise<WeeklyProjectReportSummary | null>;
}

export type WeeklyReportChannel = "email" | "slack";

export type WeeklyReportScheduleDayOfWeek =
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
    day_of_week: WeeklyReportScheduleDayOfWeek;
    hour_of_day: number;
    timezone: string;
  };
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeleteWeeklyReportChannelResult {
  channel_id: string;
}

export interface WeeklyReportChannelStore {
  listWeeklyReportChannelsForOrganization(input: {
    organization_id: string;
    project_id: string;
    limit: number;
  }): Promise<WeeklyReportChannelRecord[] | null>;
  createWeeklyReportChannelForOrganization(input: {
    organization_id: string;
    project_id: string;
    channel: WeeklyReportChannel;
    config: Record<string, unknown>;
    schedule: {
      day_of_week: WeeklyReportScheduleDayOfWeek;
      hour_of_day: number;
      timezone: string;
    };
    is_enabled: boolean;
  }): Promise<WeeklyReportChannelRecord | "email_channel_exists" | null>;
  updateWeeklyReportChannelForOrganization(input: {
    organization_id: string;
    channel_id: string;
    config?: Record<string, unknown>;
    schedule?: {
      day_of_week: WeeklyReportScheduleDayOfWeek;
      hour_of_day: number;
      timezone: string;
    };
    is_enabled?: boolean;
  }): Promise<WeeklyReportChannelRecord | null>;
  deleteWeeklyReportChannelForOrganization(input: {
    organization_id: string;
    channel_id: string;
  }): Promise<DeleteWeeklyReportChannelResult | null>;
  listEnabledWeeklyReportChannels(input: { limit: number }): Promise<WeeklyReportChannelRecord[]>;
  getWeeklyReportChannelById(input: { channel_id: string }): Promise<WeeklyReportChannelRecord | null>;
}

export interface WeeklyReportDeliveryStore {
  claimWeeklyReportDelivery(input: {
    weekly_report_channel_id: string;
    project_id: string;
    window_start: string;
    window_end: string;
    channel: WeeklyReportChannel;
  }): Promise<{ delivery_id: string; created: boolean }>;
  markWeeklyReportDeliveryResult(input: {
    delivery_id: string;
    delivered: boolean;
    error_message: string | null;
  }): Promise<{ status: "delivered" | "failed" }>;
}

export type OperationalEmailDeliveryKind =
  | "webhook_auto_disabled"
  | "allowance_warning_80"
  | "allowance_limit_reached"
  | "retention_rotation_notice";

export type OperationalEmailDeliveryStatus = "pending" | "retrying" | "delivered" | "failed";

export interface OperationalEmailDeliveryRecord {
  delivery_id: string;
  organization_id: string;
  project_id: string;
  kind: OperationalEmailDeliveryKind;
  dedupe_key: string;
  payload: Record<string, unknown>;
  status: OperationalEmailDeliveryStatus;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OperationalEmailRecipientContext {
  organization_name: string;
  project_name: string;
  recipient_email: string;
}

export interface MarkOperationalEmailDeliveryAttemptInput {
  delivery_id: string;
  attempt: number;
  delivered: boolean;
  error_message: string | null;
}

export interface MarkOperationalEmailDeliveryAttemptResult {
  status: "retrying" | "delivered" | "failed";
  next_attempt: number | null;
}

export interface OperationalEmailDeliveryStore {
  queueProjectOperationalEmailDelivery(input: {
    project_id: string;
    kind: OperationalEmailDeliveryKind;
    dedupe_key: string;
    payload: Record<string, unknown>;
  }): Promise<{ delivery_id: string | null; created: boolean }>;
  claimDueOperationalEmailDeliveries(limit: number): Promise<Array<{ delivery_id: string; attempt: number }>>;
  getOperationalEmailDelivery(input: { delivery_id: string }): Promise<OperationalEmailDeliveryRecord | null>;
  resolveOperationalEmailRecipientContext(input: {
    organization_id: string;
    project_id: string;
  }): Promise<OperationalEmailRecipientContext | null>;
  markOperationalEmailDeliveryAttempt(
    input: MarkOperationalEmailDeliveryAttemptInput
  ): Promise<MarkOperationalEmailDeliveryAttemptResult>;
}

export interface TokenManagementStore {
  listProjectTokensForOrganization(input: {
    organization_id: string;
    project_id: string;
    limit: number;
  }): Promise<ProjectTokenRecord[] | null>;
  createProjectTokenForOrganization(input: {
    organization_id: string;
    project_id: string;
    label: string;
    allowed_origins: string[];
    token_hash: string;
  }): Promise<ProjectTokenRecord | null>;
  revokeProjectTokenForOrganization(input: {
    organization_id: string;
    project_id: string;
    token_id: string;
    revoked_at: string;
  }): Promise<ProjectTokenRecord | null>;
  listMemberTokensForOrganization(input: {
    organization_id: string;
    user_id: string;
    limit: number;
  }): Promise<MemberTokenRecord[]>;
  createMemberTokenForOrganization(input: {
    organization_id: string;
    user_id: string;
    label: string;
    token_hash: string;
  }): Promise<MemberTokenRecord>;
  revokeMemberTokenForOrganization(input: {
    organization_id: string;
    user_id: string;
    token_id: string;
    revoked_at: string;
  }): Promise<MemberTokenRecord | null>;
}

export interface ProjectManagementStore {
  listProjectsForUser?(input: {
    user_id: string;
    now: string;
    limit: number;
  }): Promise<ProjectRecord[]>;
  createProjectForUser?(input: {
    user_id: string;
    organization_id: string;
    name: string;
    slug: string;
    environment_default: string;
    color_tag?: ProjectColorTag | null;
    weekly_report_timezone: string;
  }): Promise<ProjectRecord | null>;
  updateProjectForUser?(input: {
    user_id: string;
    project_id: string;
    name?: string;
    slug?: string;
    environment_default?: string;
    color_tag?: ProjectColorTag | null;
  }): Promise<ProjectRecord | "slug_taken" | null>;
  deleteProjectForUser?(input: {
    user_id: string;
    project_id: string;
  }): Promise<DeletedProjectRecord | null>;
  listProjectsForOrganization(input: {
    organization_id: string;
    now: string;
    limit: number;
  }): Promise<ProjectRecord[]>;
  createProjectForOrganization(input: {
    organization_id: string;
    name: string;
    slug: string;
    environment_default: string;
    color_tag?: ProjectColorTag | null;
    weekly_report_timezone?: string;
  }): Promise<ProjectRecord | null>;
  updateProjectForOrganization(input: {
    organization_id: string;
    project_id: string;
    name?: string;
    slug?: string;
    environment_default?: string;
    color_tag?: ProjectColorTag | null;
  }): Promise<ProjectRecord | "slug_taken" | null>;
  deleteProjectForOrganization(input: {
    organization_id: string;
    project_id: string;
  }): Promise<DeletedProjectRecord | null>;
}

export interface AccountLifecycleStore {
  exportAccountForOrganization(input: {
    organization_id: string;
    user_id: string;
    exported_at: string;
  }): Promise<AccountDataExportRecord | null>;
  deleteAccountForOrganization(input: {
    organization_id: string;
    user_id: string;
    deleted_at: string;
  }): Promise<DeletedAccountRecord | AccountDeletionBlockedReason | null>;
  getUserAvatar(input: {
    user_id: string;
  }): Promise<UserAvatarRecord | null>;
  saveUserAvatar(input: {
    user_id: string;
    source: "github" | "gravatar";
    object_key: string;
    content_type: string;
    updated_at: string;
  }): Promise<UserAvatarRecord | null>;
}

export interface UserAvatarRecord {
  user_id: string;
  source: "github" | "gravatar";
  object_key: string;
  content_type: string;
  updated_at: string;
}

export interface GitHubInstallationRecord extends Record<string, unknown> {
  id: string;
  installation_id: number;
  account_login: string;
  account_type: "Organization" | "User";
  status: "active" | "suspended" | "removed";
  created_at: string;
  updated_at: string;
}

export interface GitHubMarketplaceAccountRecord extends Record<string, unknown> {
  id: string;
  organization_id: string | null;
  marketplace_account_id: number;
  marketplace_account_login: string;
  marketplace_account_type: "Organization" | "User";
  marketplace_account_node_id: string | null;
  marketplace_listing_plan_id: number;
  marketplace_listing_plan_name: string;
  marketplace_plan_price_model: string | null;
  billing_cycle: "monthly" | "yearly" | null;
  unit_count: number | null;
  on_free_trial: boolean;
  free_trial_ends_on: string | null;
  next_billing_date: string | null;
  effective_date: string;
  installation_id: number | null;
  marketplace_purchase_status: "purchased" | "cancelled" | "pending_change" | "pending_change_cancelled" | "changed";
  last_event_id: string;
  last_event_action: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubRepositoryRecord extends Record<string, unknown> {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
}

export interface ProjectGitHubRepoRecord extends Record<string, unknown> {
  id: string;
  project_id: string;
  installation_id: string;
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubDispatchRuleRecord extends Record<string, unknown> {
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

export interface GitHubDispatchDeliveryRecord extends Record<string, unknown> {
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

export interface MatchingGitHubDispatchRule {
  rule_id: string;
  rule_name: string;
  installation_id: number;
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  cooldown_seconds: number;
}

export interface GitHubDispatchDeliveryIntent {
  delivery_id: string;
  rule_id: string;
  project_id: string;
  incident_id: string | null;
  improvement_id: string | null;
  installation_id: number;
  repo_owner: string;
  repo_name: string;
  status: "pending" | "retrying" | "delivered" | "failed" | "skipped";
  attempt_count: number;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  github_status_code: number | null;
  dispatch_payload: Record<string, unknown>;
}

export interface MarkGitHubDispatchDeliveryAttemptInput {
  delivery_id: string;
  attempt: number;
  delivered: boolean;
  error_message: string | null;
  github_status_code: number | null;
  retry_after_seconds?: number | null;
}

export interface MarkGitHubDispatchDeliveryAttemptResult {
  status: "retrying" | "delivered" | "failed";
  next_attempt: number | null;
}

export interface GitHubStore {
  getGitHubInstallationForOrganization(input: {
    organization_id: string;
  }): Promise<GitHubInstallationRecord | null>;
  upsertGitHubInstallationForOrganization(input: {
    organization_id: string;
    installation_id: number;
    account_login: string;
    account_type: "Organization" | "User";
    status: "active" | "suspended" | "removed";
  }): Promise<GitHubInstallationRecord>;
  updateGitHubInstallationStatus(input: {
    installation_id: number;
    account_login?: string;
    account_type?: "Organization" | "User";
    status: "active" | "suspended" | "removed";
  }): Promise<GitHubInstallationRecord | null>;
  deleteGitHubInstallationForOrganization(input: {
    organization_id: string;
  }): Promise<boolean>;
  getProjectGitHubRepoForOrganization(input: {
    organization_id: string;
    project_id: string;
  }): Promise<ProjectGitHubRepoRecord | null>;
  upsertProjectGitHubRepoForOrganization(input: {
    organization_id: string;
    project_id: string;
    installation_id: string;
    repo_owner: string;
    repo_name: string;
    default_branch: string;
  }): Promise<ProjectGitHubRepoRecord | null>;
  deleteProjectGitHubRepoForOrganization(input: {
    organization_id: string;
    project_id: string;
  }): Promise<boolean>;
  listProjectGitHubRulesForOrganization(input: {
    organization_id: string;
    project_id: string;
  }): Promise<GitHubDispatchRuleRecord[] | null>;
  getProjectGitHubRuleForOrganization(input: {
    organization_id: string;
    project_id: string;
    rule_id: string;
  }): Promise<GitHubDispatchRuleRecord | null>;
  createProjectGitHubRuleForOrganization(input: {
    organization_id: string;
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
  }): Promise<GitHubDispatchRuleRecord | null>;
  updateProjectGitHubRuleForOrganization(input: {
    organization_id: string;
    project_id: string;
    rule_id: string;
    actor_user_id?: string;
    actor_role?: "owner" | "admin" | "member";
    name?: string;
    enabled?: boolean;
    event_types?: string[];
    environments?: string[];
    services?: string[];
    severity_min?: "low" | "medium" | "high" | "critical" | null;
    bundle_type?: "failure" | "improvement" | null;
    incident_status?: "new_only" | "reopened_only" | "new_or_reopened";
    cooldown_seconds?: number;
  }): Promise<GitHubDispatchRuleRecord | null>;
  deleteProjectGitHubRuleForOrganization(input: {
    organization_id: string;
    project_id: string;
    rule_id: string;
    actor_user_id?: string;
    actor_role?: "owner" | "admin" | "member";
  }): Promise<boolean>;
  listProjectGitHubDeliveriesForOrganization(input: {
    organization_id: string;
    project_id: string;
    status?: "pending" | "retrying" | "delivered" | "failed" | "skipped";
    limit: number;
  }): Promise<GitHubDispatchDeliveryRecord[]>;
  retryProjectGitHubDeliveryForOrganization(input: {
    organization_id: string;
    project_id: string;
    delivery_id: string;
    actor_user_id?: string;
    actor_role?: "owner" | "admin" | "member";
  }): Promise<GitHubDispatchDeliveryRecord | null>;
  listMatchingGitHubDispatchRules(input: {
    project_id: string;
    event_type: "bundle.created" | "bundle.updated" | "bundle.reopened" | "improvement_bundle.created" | "incident.spike_detected";
    environment: string;
    service_name: string;
    severity: "low" | "medium" | "high" | "critical";
    bundle_type: "failure" | "improvement";
    incident_status: "new_only" | "reopened_only" | "new_or_reopened";
  }): Promise<MatchingGitHubDispatchRule[]>;
  hasRecentGitHubDispatch(input: {
    rule_id: string;
    incident_fingerprint: string;
    cooldown_seconds: number;
  }): Promise<boolean>;
  countProjectGitHubDispatchesSince(input: {
    project_id: string;
    since: string;
  }): Promise<number>;
  countInstallationGitHubDispatchesSince(input: {
    installation_id: number;
    since: string;
  }): Promise<number>;
  createGitHubDispatchDeliveryIntent(input: {
    rule_id: string;
    rule_name: string;
    project_id: string;
    incident_id: string | null;
    improvement_id: string | null;
    target_fingerprint: string;
    dedupe_key: string;
    installation_id: number;
    repo_owner: string;
    repo_name: string;
    dispatch_payload: Record<string, unknown>;
  }): Promise<{ delivery_id: string; created: boolean }>;
  createSkippedGitHubDispatchDelivery(input: {
    rule_id: string;
    rule_name: string;
    project_id: string;
    incident_id: string | null;
    improvement_id: string | null;
    target_fingerprint: string;
    dedupe_key: string;
    installation_id: number;
    repo_owner: string;
    repo_name: string;
    reason: "project_hourly_rate_limited" | "installation_hourly_rate_limited";
    dispatch_payload: Record<string, unknown>;
  }): Promise<{ delivery_id: string; created: boolean }>;
  claimDueGitHubDispatchDeliveries(limit: number): Promise<DeliverGitHubDispatchJob[]>;
  getGitHubDispatchDeliveryIntent(deliveryId: string): Promise<GitHubDispatchDeliveryIntent | null>;
  markGitHubDispatchDeliveryAttempt(input: MarkGitHubDispatchDeliveryAttemptInput): Promise<MarkGitHubDispatchDeliveryAttemptResult>;
}

export interface GitHubMarketplaceAccountUpsertInput {
  organization_id: string | null;
  marketplace_account_id: number;
  marketplace_account_login: string;
  marketplace_account_type: "Organization" | "User";
  marketplace_account_node_id: string | null;
  marketplace_listing_plan_id: number;
  marketplace_listing_plan_name: string;
  marketplace_plan_price_model: string | null;
  billing_cycle: "monthly" | "yearly" | null;
  unit_count: number | null;
  on_free_trial: boolean;
  free_trial_ends_on: string | null;
  next_billing_date: string | null;
  effective_date: string;
  installation_id: number | null;
  marketplace_purchase_status: "purchased" | "cancelled" | "pending_change" | "pending_change_cancelled" | "changed";
  last_event_id: string;
  last_event_action: string;
}

export interface GitHubMarketplaceStore {
  isEventProcessed(delivery_id: string): Promise<boolean>;
  markEventProcessed(input: {
    delivery_id: string;
    event_name: string;
    marketplace_account_id: number | null;
    action: string | null;
  }): Promise<void>;
  upsertMarketplaceAccount(input: GitHubMarketplaceAccountUpsertInput): Promise<GitHubMarketplaceAccountRecord>;
  linkOrganizationToMarketplaceAccountByInstallationId(input: {
    organization_id: string;
    installation_id: number;
  }): Promise<GitHubMarketplaceAccountRecord | null>;
}

export interface ProjectCollaborationStore {
  listMembersForProject?(input: {
    project_id: string;
    user_id: string;
  }): Promise<{ owner_plan: TierName; members: ProjectMemberRecord[] } | null>;
  listPendingInvitesForProject?(input: {
    project_id: string;
    user_id: string;
    now: string;
  }): Promise<ProjectInviteRecord[] | null>;
  createInviteForProject?(input: {
    project_id: string;
    user_id: string;
    email: string;
    role: "admin" | "member";
    invited_by_user_id: string;
    invite_token_hash: string;
    expires_at: string;
  }): Promise<CreateProjectInviteResult | null>;
  cancelInviteForProject?(input: {
    project_id: string;
    user_id: string;
    invite_id: string;
  }): Promise<ProjectInviteRecord | null>;
  acceptProjectInviteForUser?(input: {
    invite_token_hash: string;
    user_id: string;
    email: string;
    accepted_at: string;
  }): Promise<
    | {
        kind: "accepted";
        membership: ProjectMemberRecord & { project_id: string };
      }
    | {
        kind: "invalid_token" | "email_mismatch" | "shared_access_suspended";
      }
  >;
  updateProjectMemberRole?(input: {
    project_id: string;
    actor_user_id: string;
    user_id: string;
    role: "admin" | "member";
  }): Promise<UpdateProjectMemberRoleResult | null>;
  removeProjectMember?(input: {
    project_id: string;
    actor_user_id: string;
    user_id: string;
  }): Promise<RemoveProjectMemberResult | null>;
  leaveProjectMembership?(input: {
    project_id: string;
    user_id: string;
  }): Promise<LeaveProjectMembershipResult | null>;
}

export interface CreateWebhookDeliveryIntentInput {
  webhook_id: string;
  project_id: string;
  incident_id: string | null;
  event_type: WebhookEventType;
  occurred_at: string;
  target_url: string;
  signing_secret: string;
  payload: Record<string, unknown>;
}

export interface CreateWebhookTestDeliveryInput {
  organization_id: string;
  project_id?: string;
  webhook_id: string;
  event_type: WebhookEventType;
  actor_user_id?: string;
  actor_role?: "owner" | "admin" | "member";
}

export interface CreateWebhookTestDeliveryResult {
  delivery_id: string;
  event_type: WebhookEventType;
}

export type WebhookDeliveryStatus = "pending" | "retrying" | "delivered" | "failed" | "disabled";

export interface MatchingWebhookInput {
  project_id: string;
  event_type: WebhookEventType;
  environment: string;
  service_name: string;
  severity: "low" | "medium" | "high" | "critical";
  bundle_type?: "failure" | "improvement";
  is_verification?: boolean;
}

export interface MatchingWebhook {
  webhook_id: string;
  target_url: string;
  signing_secret: string;
}

export interface WebhookDeliveryIntent {
  delivery_id: string;
  webhook_id: string;
  project_id: string;
  incident_id: string | null;
  event_type: WebhookEventType;
  status: WebhookDeliveryStatus;
  attempt_count: number;
  occurred_at: string;
  target_url: string;
  next_attempt_at: string | null;
  last_response_code: number | null;
  last_attempted_at: string | null;
  last_error: string | null;
  payload: Record<string, unknown>;
  signing_secret: string;
}

export interface MarkWebhookDeliveryAttemptInput {
  delivery_id: string;
  attempt: number;
  delivered: boolean;
  error_message: string | null;
  response_code: number | null;
}

export interface MarkWebhookDeliveryAttemptResult {
  status: "retrying" | "delivered" | "failed";
  next_attempt: number | null;
  webhook_disabled?: boolean;
  webhook_id?: string;
}

export interface WebhookDeliveryStore {
  listWebhooksForOrganization(input: {
    organization_id: string;
    project_id: string;
    limit: number;
  }): Promise<WebhookRecord[] | null>;
  createWebhookForOrganization(input: {
    organization_id: string;
    project_id: string;
    created_by_user_id: string;
    url: string;
    signing_secret: string;
    events: WebhookEventType[];
    filters: WebhookFilters;
    is_enabled: boolean;
  }): Promise<WebhookRecord | null>;
  getWebhookForOrganization(input: {
    organization_id: string;
    project_id?: string;
    webhook_id: string;
  }): Promise<WebhookRecord | null>;
  updateWebhookForOrganization(input: {
    organization_id: string;
    webhook_id: string;
    project_id?: string;
    actor_user_id?: string;
    actor_role?: "owner" | "admin" | "member";
    url?: string;
    events?: WebhookEventType[];
    filters?: WebhookFilters;
    is_enabled?: boolean;
  }): Promise<WebhookRecord | null>;
  deleteWebhookForOrganization(input: {
    organization_id: string;
    webhook_id: string;
    project_id?: string;
    actor_user_id?: string;
    actor_role?: "owner" | "admin" | "member";
  }): Promise<DeleteWebhookResult | null>;
  listMatchingWebhooks(input: MatchingWebhookInput): Promise<MatchingWebhook[]>;
  createDeliveryIntent(input: CreateWebhookDeliveryIntentInput): Promise<{ delivery_id: string }>;
  createTestDeliveryForOrganization(input: CreateWebhookTestDeliveryInput): Promise<CreateWebhookTestDeliveryResult | null>;
  getDeliveryIntent(deliveryId: string): Promise<WebhookDeliveryIntent | null>;
  claimDueDeliveries(limit: number): Promise<DeliverWebhookJob[]>;
  markDeliveryAttempt(input: MarkWebhookDeliveryAttemptInput): Promise<MarkWebhookDeliveryAttemptResult>;
  listDeliveriesForWebhook(webhookId: string, limit: number): Promise<Array<{
    delivery_id: string;
    event_type: WebhookEventType;
    status: WebhookDeliveryStatus;
    attempt_count: number;
    next_attempt_at: string | null;
    last_response_code: number | null;
    last_attempted_at: string | null;
    last_error: string | null;
  }>>;
  listDeliveriesForWebhookInOrganization(input: {
    webhookId: string;
    organizationId: string;
    limit: number;
  }): Promise<
    | {
        deliveries: Array<{
          delivery_id: string;
          event_type: WebhookEventType;
          status: WebhookDeliveryStatus;
          attempt_count: number;
          next_attempt_at: string | null;
          last_response_code: number | null;
          last_attempted_at: string | null;
          last_error: string | null;
        }>;
      }
    | null
  >;
  retryDeliveryForOrganization(input: {
    organization_id: string;
    project_id?: string;
    webhook_id: string;
    delivery_id: string;
    actor_user_id?: string;
    actor_role?: "owner" | "admin" | "member";
  }): Promise<{ delivery_id: string; event_type: WebhookEventType } | null>;
}

