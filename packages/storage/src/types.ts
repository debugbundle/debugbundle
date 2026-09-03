import type { NormalizedEvent } from "../../event-normalizer/src/index.js";
import type {
  CapturePreset,
  CaptureRuleEvaluationResult,
  EventClass,
  EventEnvelope,
  ImmediateClientErrorPathRule,
  ProjectColorTag,
  TierName
} from "../../shared-types/src/index.js";
import type {
  AlertManagementStore,
  RecordIncidentEventRetentionInput,
  RecordIncidentEventRetentionResult
} from "./alert-types.js";
import type { IncidentReason } from "./incident-reason.js";
import type {
  ProjectCollaborationStore,
  ProjectManagementStore,
  TokenManagementStore,
  WeeklyReportingStore
} from "./operations-types.js";
import type { BuildBundleJob } from "./queue-types.js";

export type {
  AlertChannel,
  AlertConditionType,
  AlertDeliveryRecord,
  AlertDeliveryStore,
  AlertEmailDigestItemRecord,
  AlertEmailDigestRecord,
  AlertManagementStore,
  AlertRuleRecord,
  CreateAlertDeliveryIntentInput,
  DeleteAlertResult,
  DemotedIncidentEventReference,
  MarkAlertDeliveryResultInput,
  QueueAlertEmailDigestItemInput,
  RecordIncidentEventRetentionInput,
  RecordIncidentEventRetentionResult
} from "./alert-types.js";

export type {
  AccountLifecycleStore,
  CreateWebhookDeliveryIntentInput,
  CreateWebhookTestDeliveryInput,
  CreateWebhookTestDeliveryResult,
  DeleteWeeklyReportChannelResult,
  GitHubDispatchDeliveryIntent,
  GitHubDispatchDeliveryRecord,
  GitHubDispatchRuleRecord,
  GitHubInstallationRecord,
  GitHubMarketplaceAccountRecord,
  GitHubMarketplaceAccountUpsertInput,
  GitHubMarketplaceStore,
  GitHubRepositoryRecord,
  GitHubStore,
  MarkGitHubDispatchDeliveryAttemptInput,
  MarkGitHubDispatchDeliveryAttemptResult,
  MarkOperationalEmailDeliveryAttemptInput,
  MarkOperationalEmailDeliveryAttemptResult,
  MarkWebhookDeliveryAttemptInput,
  MarkWebhookDeliveryAttemptResult,
  MatchingGitHubDispatchRule,
  MatchingWebhook,
  MatchingWebhookInput,
  OperationalEmailDeliveryKind,
  OperationalEmailDeliveryRecord,
  OperationalEmailDeliveryStatus,
  OperationalEmailDeliveryStore,
  OperationalEmailRecipientContext,
  ProjectCollaborationStore,
  ProjectGitHubRepoRecord,
  ProjectManagementStore,
  TokenManagementStore,
  UserAvatarRecord,
  WebhookDeliveryIntent,
  WebhookDeliveryStatus,
  WebhookDeliveryStore,
  WeeklyProjectReportSummary,
  WeeklyReportChannel,
  WeeklyReportChannelRecord,
  WeeklyReportChannelStore,
  WeeklyReportDeliveryStore,
  WeeklyReportScheduleDayOfWeek,
  WeeklyReportTopSpikingIncident,
  WeeklyReportingStore
} from "./operations-types.js";

export type {
  BuildBundleJob,
  BuildReproductionJob,
  ClaimedRedisJob,
  CleanupRetentionJob,
  CreateRedisQueueClientInput,
  DeliverAlertEmailDigestJob,
  DeliverGitHubDispatchJob,
  DeliverWebhookJob,
  EvaluateAnalyticsOpportunitiesJob,
  EvaluateAlertsJob,
  GenerateWeeklyReportJob,
  GroupIncidentJob,
  NormalizeEventsJob,
  QueueClient,
  RedisQueueClient,
  RedisQueueJobName
} from "./queue-types.js";

export type {
  ObjectStoreClient,
  ObjectStoreDeleteInput,
  ObjectStorePrefixDeleter,
  ObjectStorePutInput,
  ObjectStoreReader,
  ObjectStoreReadInput
} from "./object-store-types.js";
export type {
  AuthRateLimiter,
  IngestionRateLimiter,
  IngestionRateLimitResult,
  OpenAiCoordinationService
} from "./rate-limiter-types.js";
export type {
  RetentionAnalyticsBundleGenerationReference,
  RetentionAnalyticsJourneySampleReference,
  RetentionAnalyticsRawEventReference,
  RetentionAnalyticsRollupPruneResult,
  RetentionExpiredIncidentReference,
  RetentionRawEventReference,
  RetentionStore
} from "./retention-types.js";

export interface IngestionPersistenceService {
  persistAndEnqueue(
    event: EventEnvelope,
    projectId: string,
    options?: {
      capturePreset?: CapturePreset;
      immediateClientErrorStatuses?: number[];
      immediateClientErrorPathRules?: ImmediateClientErrorPathRule[];
      captureRule?: CaptureRuleEvaluationResult;
    }
  ): Promise<{ object_key: string }>;
}

export interface ResolveProjectResult {
  project_id: string;
  organization_id?: string;
  organization_plan?: string;
  allowed_origins?: string[] | null;
  revoked_at?: string | null;
  expires_at?: string | null;
}

export interface ProbeActivationRecord {
  activation_id: string;
  label_pattern: string;
  service: string;
  environment: string;
  expires_at: string;
  trigger_expires_at: string;
}

export interface ProbeActivationCreateRecord {
  activation: ProbeActivationRecord;
  trigger_token: string;
}

export interface ResolveMemberResult {
  member_id: string;
  organization_id: string;
  email?: string;
  role?: "owner" | "member";
  revoked_at?: string | null;
  expires_at?: string | null;
}

export interface ProjectRecord {
  project_id: string;
  organization_id: string;
  owner_user_id: string;
  owner_email: string;
  relationship: "owned" | "shared";
  sharing_state: "private" | "shared_by_you" | "shared_with_you";
  effective_role: "owner" | "admin" | "member";
  shared_access_suspended?: boolean;
  name: string;
  slug: string;
  environment_default: string;
  color_tag: ProjectColorTag | null;
  organization_plan: string;
  metrics: {
    open_incidents: number;
    regressed_incidents: number;
    attention_incidents_today: number;
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

export type DeletedProjectRecord = Omit<ProjectRecord, "metrics">;

export interface ProjectAccessRecord {
  project_id: string;
  project_name?: string;
  organization_id: string;
  owner_user_id: string;
  owner_email: string;
  relationship: "owned" | "shared";
  sharing_state: "private" | "shared_by_you" | "shared_with_you";
  effective_role: "owner" | "admin" | "member";
  shared_access_suspended: boolean;
  organization_plan: TierName;
}

export interface AccountStoredArtifactRecord extends Record<string, unknown> {
  key: string;
  content: unknown;
}

export interface AccountDataExportRecord extends Record<string, unknown> {
  export_version: 1;
  exported_at: string;
  user: Record<string, unknown>;
  organization: Record<string, unknown>;
  members: Record<string, unknown>[];
  project_members: Record<string, unknown>[];
  project_invites: Record<string, unknown>[];
  member_tokens: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  project_tokens: Record<string, unknown>[];
  probe_activations: Record<string, unknown>[];
  capture_policies: Record<string, unknown>[];
  services: Record<string, unknown>[];
  deployments: Record<string, unknown>[];
  processed_events: Record<string, unknown>[];
  improvement_opportunities: Record<string, unknown>[];
  improvement_opportunity_events: Record<string, unknown>[];
  incidents: Record<string, unknown>[];
  incident_events: Record<string, unknown>[];
  bundle_generations: Record<string, unknown>[];
  alert_rules: Record<string, unknown>[];
  slack_destinations: Record<string, unknown>[];
  alert_deliveries: Record<string, unknown>[];
  alert_email_digests: Record<string, unknown>[];
  alert_email_digest_items: Record<string, unknown>[];
  weekly_report_channels: Record<string, unknown>[];
  weekly_report_deliveries: Record<string, unknown>[];
  agent_webhooks: Record<string, unknown>[];
  webhook_deliveries: Record<string, unknown>[];
  github_installations: Record<string, unknown>[];
  github_marketplace_accounts: Record<string, unknown>[];
  project_github_repos: Record<string, unknown>[];
  github_dispatch_rules: Record<string, unknown>[];
  github_dispatch_deliveries: Record<string, unknown>[];
  org_usage_counters: Record<string, unknown>[];
  processed_billing_events: Record<string, unknown>[];
  processed_github_marketplace_events: Record<string, unknown>[];
  plan_cleanup_tasks: Record<string, unknown>[];
  operational_email_deliveries: Record<string, unknown>[];
  audit_logs: Record<string, unknown>[];
  artifacts: {
    raw_events: AccountStoredArtifactRecord[];
    bundles: AccountStoredArtifactRecord[];
    reproductions: AccountStoredArtifactRecord[];
  };
}

export interface DeletedAccountRecord extends Record<string, unknown> {
  deleted_at: string;
  organization_id: string;
  deleted_project_ids: string[];
  user_deleted: boolean;
  deleted_member_token_count: number;
}

export type AccountDeletionBlockedReason =
  | "other_owned_organizations_exist"
  | "other_owned_projects_exist";

export interface ProjectMemberRecord {
  user_id: string;
  email: string;
  role: "owner" | "admin" | "member";
  membership_type: "owner" | "collaborator";
  created_at: string;
  avatar_object_key?: string | null;
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

export type CreateProjectInviteResult =
  | {
      kind: "created";
      owner_plan: TierName;
      invite: ProjectInviteRecord;
    }
  | {
      kind: "member_exists" | "invite_exists" | "upgrade_required" | "collaborator_limit_reached";
      owner_plan: TierName;
    };

export type RemoveProjectMemberResult =
  | {
      kind: "removed";
      member: ProjectMemberRecord;
    }
  | {
      kind: "owner_removal_forbidden";
      member: ProjectMemberRecord;
    };

export type LeaveProjectMembershipResult =
  | {
      kind: "left";
      member: ProjectMemberRecord;
    }
  | {
      kind: "owner_leave_forbidden";
      member: ProjectMemberRecord;
    };

export type UpdateProjectMemberRoleResult =
  | {
      kind: "updated";
      member: ProjectMemberRecord;
    }
  | {
      kind: "owner_role_change_forbidden";
      member: ProjectMemberRecord;
    };

export interface ProbeManagementStore {
  listActiveProbesForProject(input: {
    project_id: string;
    now: string;
  }): Promise<ProbeActivationRecord[]>;
  listActiveProbesForProjectInOrganization(input: {
    organization_id: string;
    project_id: string;
    now: string;
  }): Promise<{ organization_plan: TierName; activations: ProbeActivationRecord[] } | null>;
  createProbeActivationForProjectInOrganization(input: {
    organization_id: string;
    project_id: string;
    created_by_member_id: string;
    label_pattern: string;
    service: string;
    environment: string;
    expires_at: string;
    trigger_expires_at: string;
  }): Promise<{
    organization_plan: TierName;
    activation: ProbeActivationRecord;
    trigger_token: string;
    concurrent_limit_exceeded?: boolean;
  } | null>;
  deactivateProbeActivationForProjectInOrganization(input: {
    organization_id: string;
    project_id: string;
    activation_id: string;
    deactivated_at: string;
  }): Promise<{
    organization_plan: TierName;
    deactivated: { activation_id: string; deactivated_at: string };
  } | null>;
}
export interface PostgresMetadataStore
  extends
    MetadataStore,
    TokenManagementStore,
    ProjectManagementStore,
    ProjectCollaborationStore,
    ProbeManagementStore,
    AlertManagementStore,
    BundleBuildContextStore,
    WeeklyReportingStore {}

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

export type AuditLogActorType = "anonymous" | "browser_session" | "member_token" | "system";

export type AuditLogStatus = "success" | "failure";

export interface AuditLogRecord {
  audit_log_id: string;
  organization_id: string | null;
  actor_user_id: string | null;
  actor_type: AuditLogActorType;
  action: string;
  target_type: string;
  target_id: string | null;
  status: AuditLogStatus;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}

export interface AuditLogStore {
  createAuditLog(input: {
    organization_id: string | null;
    actor_user_id: string | null;
    actor_type: AuditLogActorType;
    action: string;
    target_type: string;
    target_id: string | null;
    status: AuditLogStatus;
    ip_address: string | null;
    metadata?: Record<string, unknown>;
    occurred_at: string;
  }): Promise<AuditLogRecord>;
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

export interface WebhookFilters extends Record<string, unknown> {
  environment?: string[];
  service?: string[];
  severity_min?: "low" | "medium" | "high" | "critical";
  bundle_type?: Array<"failure" | "improvement">;
  verification?: boolean;
}

export interface WebhookRecord extends Record<string, unknown> {
  webhook_id: string;
  project_id: string;
  created_by_user_id: string;
  url: string;
  events: WebhookEventType[];
  filters: WebhookFilters;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeleteWebhookResult {
  webhook_id: string;
}

export interface UpsertIncidentInput {
  event_id: string;
  event_type?: EventEnvelope["event_type"];
  project_id: string;
  service_name: string;
  environment: string;
  fingerprint: string;
  fingerprint_version: string;
  matched_fields?: string[];
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  occurred_at: string;
  deploy_metadata?: {
    commit_sha: string;
    version: string;
    branch: string;
    deployed_at: string;
  };
}

export interface RegressionDeployCorrelation {
  deployment_id: string;
  commit_sha: string | null;
  version: string | null;
  branch: string | null;
  deployed_at: string;
  minutes_since_deploy: number;
}

export interface UpsertIncidentResult {
  incident_id: string;
  matched_fields: string[];
  status: "open" | "resolved" | "regressed";
  regressed_now: boolean;
  occurrence_count: number;
  duplicate_event?: boolean;
  new_context_type_added?: boolean;
  reproduction_confidence_changed?: boolean;
  regression_deploy?: RegressionDeployCorrelation | null;
}

export interface IncidentRetrievalRecord extends Record<string, unknown> {
  incident_id: string;
  project_id: string;
  project_name: string;
  project_color_tag: ProjectColorTag | null;
  service_id: string | null;
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
  incident_reason?: IncidentReason;
}

export type IncidentRetrievalStatusFilter = "active" | IncidentRetrievalRecord["status"];

export interface ImprovementRetrievalRecord extends Record<string, unknown> {
  improvement_id: string;
  project_id: string;
  project_name: string;
  project_color_tag: ProjectColorTag | null;
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

export interface ResolveIncidentForOrganizationInput {
  organization_id: string;
  incident_id: string;
  user_id?: string;
  resolved_by_member_id: string;
  resolved_at: string;
}

export interface ResolveIncidentsForOrganizationInput {
  organization_id: string;
  incident_ids: string[];
  user_id?: string;
  resolved_by_member_id: string;
  resolved_at: string;
}

export interface ReopenIncidentForOrganizationInput {
  organization_id: string;
  incident_id: string;
  user_id?: string;
}

export interface ReopenIncidentsForOrganizationInput {
  organization_id: string;
  incident_ids: string[];
  user_id?: string;
}

export interface ResolveImprovementForOrganizationInput {
  organization_id: string;
  improvement_id: string;
  user_id?: string;
  resolved_by_member_id: string;
  resolved_at: string;
}

export interface ReopenImprovementForOrganizationInput {
  organization_id: string;
  improvement_id: string;
  user_id?: string;
}

export interface SnoozeImprovementForOrganizationInput {
  organization_id: string;
  improvement_id: string;
  user_id?: string;
  snoozed_until: string;
}

export interface ServiceRetrievalRecord extends Record<string, unknown> {
  service_id: string;
  project_id: string;
  name: string;
  runtime: string | null;
  framework: string | null;
  environment: string;
}

export interface IncidentLogRecord extends Record<string, unknown> {
  event_id: string;
  event_type: EventEnvelope["event_type"];
  occurred_at: string;
  is_sampled: boolean;
  level: string | null;
}

export interface IncidentLogsCursor {
  occurred_at: string;
  event_id: string;
}

export interface IncidentsCursor {
  last_seen_at: string;
  incident_id: string;
}

export interface ImprovementsCursor {
  last_detected_at: string;
  improvement_id: string;
}

export interface MarkIncidentSpikingInput {
  incident_id: string;
  detected_at: string;
}

export interface InsertIncidentEventInput {
  incident_id: string;
  event_id: string;
  event_type: EventEnvelope["event_type"];
  event_class?: EventClass;
  occurred_at: string;
  is_sampled: boolean;
  level?: string | null;
}

export interface MetadataStore {
  resolveProjectByTokenHash(tokenHash: string): Promise<ResolveProjectResult | null>;
  resolveMemberByTokenHash(tokenHash: string): Promise<ResolveMemberResult | null>;
  resolveProjectAccessForUser?(input: {
    user_id: string;
    project_id: string;
  }): Promise<ProjectAccessRecord | null>;
  listIncidentsForOrganization(input: {
    organization_id: string;
    user_id?: string;
    project_id?: string;
    environment?: string;
    service?: string;
    status?: IncidentRetrievalStatusFilter;
    severity?: "low" | "medium" | "high" | "critical";
    first_seen_after?: string;
    attention_after?: string;
    cursor?: IncidentsCursor;
    limit: number;
  }): Promise<IncidentRetrievalRecord[]>;
  getIncidentForOrganization(input: {
    organization_id: string;
    incident_id: string;
    user_id?: string;
  }): Promise<IncidentRetrievalRecord | null>;
  resolveIncidentForOrganization(
    input: ResolveIncidentForOrganizationInput
  ): Promise<IncidentRetrievalRecord | null>;
  resolveIncidentsForOrganization(
    input: ResolveIncidentsForOrganizationInput
  ): Promise<IncidentRetrievalRecord[]>;
  reopenIncidentForOrganization(
    input: ReopenIncidentForOrganizationInput
  ): Promise<IncidentRetrievalRecord | null>;
  reopenIncidentsForOrganization(
    input: ReopenIncidentsForOrganizationInput
  ): Promise<IncidentRetrievalRecord[]>;
  listServicesForOrganization?(input: {
    organization_id: string;
    user_id?: string;
    project_id: string;
    limit: number;
  }): Promise<ServiceRetrievalRecord[] | null>;
  listIncidentLogsForOrganization(input: {
    organization_id: string;
    user_id?: string;
    incident_id: string;
    limit: number;
    level?: string;
    cursor?: IncidentLogsCursor;
  }): Promise<IncidentLogRecord[]>;
  getBundleFailureReasonForOrganization?(input: {
    organization_id: string;
    incident_id: string;
  }): Promise<string | null>;
  getBundleSourceForOrganization?(input: {
    organization_id: string;
    incident_id: string;
  }): Promise<{
    event_id: string;
    occurred_at: string;
    occurrence_count: number;
    trigger: string;
  } | null>;
  upsertIncident(input: UpsertIncidentInput): Promise<UpsertIncidentResult>;
  insertIncidentEvent(input: InsertIncidentEventInput): Promise<void>;
  recordIncidentEventRetention(
    input: RecordIncidentEventRetentionInput
  ): Promise<RecordIncidentEventRetentionResult>;
  markIncidentSpiking(input: MarkIncidentSpikingInput): Promise<boolean>;
}

export interface ImprovementRetrievalStore {
  listImprovementsForOrganization(input: {
    organization_id: string;
    user_id?: string;
    project_id?: string;
    environment?: string;
    service?: string;
    status?: "open" | "resolved" | "snoozed";
    severity?: "low" | "medium" | "high" | "critical";
    kind?:
      | "warning_hotspot"
      | "slow_request"
      | "request_failure_pattern"
      | "recurring_incident"
      | "post_deploy_regression";
    cursor?: ImprovementsCursor;
    limit: number;
  }): Promise<ImprovementRetrievalRecord[]>;
  getImprovementForOrganization(input: {
    organization_id: string;
    improvement_id: string;
    user_id?: string;
  }): Promise<ImprovementRetrievalRecord | null>;
  resolveImprovementForOrganization(
    input: ResolveImprovementForOrganizationInput
  ): Promise<ImprovementRetrievalRecord | null>;
  reopenImprovementForOrganization(
    input: ReopenImprovementForOrganizationInput
  ): Promise<ImprovementRetrievalRecord | null>;
  snoozeImprovementForOrganization?(
    input: SnoozeImprovementForOrganizationInput
  ): Promise<ImprovementRetrievalRecord | null>;
}

export type RetainedBundleOwnerReference =
  | {
      owner_type: "incident";
      project_id: string;
      incident_id: string;
      improvement_opportunity_id: null;
    }
  | {
      owner_type: "improvement";
      project_id: string;
      incident_id: null;
      improvement_opportunity_id: string;
    };

export interface BundleBuildContext {
  incident_id: string;
  project_id: string;
  service_id: string | null;
  service_name: string;
  service_runtime: string | null;
  service_framework: string | null;
  environment: string;
  fingerprint: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  source_event_types: EventEnvelope["event_type"][];
}

export interface IncidentEventReference {
  event_id: string;
  event_type: EventEnvelope["event_type"];
  occurred_at: string;
}

export interface ProbeEventCandidateReference {
  event_id: string;
  occurred_at: string;
}

export interface LogEventCandidateReference {
  event_id: string;
  occurred_at: string;
}

export interface BundleBuildContextStore {
  getBundleBuildContext(input: {
    project_id: string;
    incident_id: string;
  }): Promise<BundleBuildContext | null>;
  hasBundleGenerationForSourceEvent?(input: {
    incident_id: string;
    event_id: string;
  }): Promise<boolean>;
  markBundleGenerationFailure?(input: {
    incident_id: string;
    reason: string | null;
  }): Promise<void>;
  pruneRetainedBundleOwnersForProject?(input: {
    project_id: string;
    retained_bundle_limit: number;
  }): Promise<RetainedBundleOwnerReference[]>;
  reserveBundleGeneration(input: {
    incident_id: string;
    event_id: string;
    occurred_at: string;
    trigger: BuildBundleJob["trigger"];
  }): Promise<{
    generation_number: number;
    created_at: string;
    updated_at: string;
    source_event_id: string;
    source_occurred_at: string;
    trigger: BuildBundleJob["trigger"];
  }>;
  listIncidentEventReferences(input: { incident_id: string }): Promise<IncidentEventReference[]>;
  listProbeEventCandidatesForServiceWindow(input: {
    project_id: string;
    service_name: string;
    environment: string;
    window_start: string;
    window_end: string;
  }): Promise<ProbeEventCandidateReference[]>;
  listLogEventCandidatesForServiceWindow(input: {
    project_id: string;
    service_name: string;
    environment: string;
    window_start: string;
    window_end: string;
  }): Promise<LogEventCandidateReference[]>;
}
export interface IncidentFrequencySnapshot {
  occurrences_1m: number;
  occurrences_5m: number;
  occurrences_1h: number;
  occurrences_24h: number;
  baseline_1h_per_5m: number;
  spike_ratio_5m_to_1h: number;
  has_sufficient_baseline: boolean;
  is_spiking: boolean;
}

export interface IncidentFrequencyCounter {
  recordOccurrence(input: {
    incident_id: string;
    event_id: string;
    occurred_at: string;
  }): Promise<IncidentFrequencySnapshot>;
}

export interface RequestAnomalyCounter {
  recordObservation(input: {
    anomaly_key: string;
    event_id: string;
    occurred_at: string;
  }): Promise<IncidentFrequencySnapshot>;
}

export interface FrequencySnapshotStore {
  persistIncidentFrequencySnapshot(input: {
    incident_id: string;
    occurred_at: string;
    occurrences_1m: number;
    occurrences_5m: number;
    occurrences_1h: number;
    occurrences_24h: number;
    baseline_1h_per_5m: number;
    spike_ratio_5m_to_1h: number;
    has_sufficient_baseline: boolean;
    is_spiking: boolean;
  }): Promise<void>;
}

export interface QueryResult<Row> {
  rows: Row[];
  rowCount?: number | null;
}

export interface Queryable {
  query<Row extends Record<string, unknown>>(
    sql: string,
    params: unknown[]
  ): Promise<QueryResult<Row>>;
  transaction?<Result>(callback: (db: Queryable) => Promise<Result>): Promise<Result>;
}

export interface PersistEventMetadataInput {
  projectId: string;
  event: EventEnvelope;
  normalizedEvent: NormalizedEvent;
  fingerprint: string;
}

export interface IngestionMetadataService {
  resolveProjectByTokenHash(tokenHash: string): Promise<ResolveProjectResult | null>;
  resolveProjectFromToken(token: string): Promise<ResolveProjectResult | null>;
  persistEventMetadata(input: PersistEventMetadataInput): Promise<UpsertIncidentResult>;
}

export interface MemberAuthService {
  resolveMemberByTokenHash(tokenHash: string): Promise<ResolveMemberResult | null>;
  resolveMemberFromToken(token: string): Promise<ResolveMemberResult | null>;
}

export interface IncidentLifecycleService {
  resolveIncidentForOrganization(
    input: ResolveIncidentForOrganizationInput
  ): Promise<IncidentRetrievalRecord | null>;
  resolveIncidentsForOrganization(
    input: ResolveIncidentsForOrganizationInput
  ): Promise<IncidentRetrievalRecord[]>;
  reopenIncidentForOrganization(
    input: ReopenIncidentForOrganizationInput
  ): Promise<IncidentRetrievalRecord | null>;
  reopenIncidentsForOrganization(
    input: ReopenIncidentsForOrganizationInput
  ): Promise<IncidentRetrievalRecord[]>;
}

export interface BuildRawEventObjectKeyInput {
  projectId: string;
  eventId: string;
  occurredAt: Date;
}

export interface CreateS3ObjectStoreClientInput {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}
