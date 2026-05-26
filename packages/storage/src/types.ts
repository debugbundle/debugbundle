import type { NormalizedEvent } from "../../event-normalizer/src/index.js";
import type { CapturePreset, CaptureRuleEvaluationResult, EventClass, EventEnvelope, TierName } from "../../shared-types/src/index.js";
import type { IncidentReason } from "./incident-reason.js";

export interface ObjectStorePutInput {
  key: string;
  body: Buffer;
  contentType: string;
  contentEncoding?: string;
}

export interface ObjectStoreDeleteInput {
  key: string;
}

export interface ObjectStoreClient {
  putObject(input: ObjectStorePutInput): Promise<void>;
  deleteObject?(input: ObjectStoreDeleteInput): Promise<void>;
}

export interface ObjectStorePrefixDeleter {
  deleteObjectsByPrefix(prefix: string): Promise<void>;
}

export interface ObjectStoreReadInput {
  key: string;
}

export interface ObjectStoreReader {
  getObject(input: ObjectStoreReadInput): Promise<Buffer>;
}

export interface QueueClient {
  enqueue(jobName: "normalize-events", payload: NormalizeEventsJob): Promise<void>;
  enqueue(jobName: "group-incident", payload: GroupIncidentJob): Promise<void>;
  enqueue(jobName: "build-bundle", payload: BuildBundleJob): Promise<void>;
  enqueue(jobName: "build-reproduction", payload: BuildReproductionJob): Promise<void>;
  enqueue(jobName: "evaluate-alerts", payload: EvaluateAlertsJob): Promise<void>;
  enqueue(jobName: "deliver-alert-email-digest", payload: DeliverAlertEmailDigestJob): Promise<void>;
  enqueue(jobName: "deliver-webhook", payload: DeliverWebhookJob): Promise<void>;
  enqueue(jobName: "deliver-github-dispatch", payload: DeliverGitHubDispatchJob): Promise<void>;
  enqueue(jobName: "generate-weekly-report", payload: GenerateWeeklyReportJob): Promise<void>;
  enqueue(jobName: "cleanup-retention", payload: CleanupRetentionJob): Promise<void>;
}

export interface RedisQueueClient extends QueueClient {
  readJobQueue(jobName: "normalize-events" | "group-incident" | "build-bundle" | "build-reproduction" | "evaluate-alerts" | "deliver-alert-email-digest" | "deliver-webhook" | "deliver-github-dispatch" | "generate-weekly-report" | "cleanup-retention"): Promise<string[]>;
  clearJobQueue(jobName: "normalize-events" | "group-incident" | "build-bundle" | "build-reproduction" | "evaluate-alerts" | "deliver-alert-email-digest" | "deliver-webhook" | "deliver-github-dispatch" | "generate-weekly-report" | "cleanup-retention"): Promise<void>;
  acquireLease(key: string, ttlSeconds: number): Promise<boolean>;
  releaseLease(key: string): Promise<void>;
  dequeue(jobName: "normalize-events"): Promise<NormalizeEventsJob | null>;
  dequeue(jobName: "group-incident"): Promise<GroupIncidentJob | null>;
  dequeue(jobName: "build-bundle"): Promise<BuildBundleJob | null>;
  dequeue(jobName: "build-reproduction"): Promise<BuildReproductionJob | null>;
  dequeue(jobName: "evaluate-alerts"): Promise<EvaluateAlertsJob | null>;
  dequeue(jobName: "deliver-alert-email-digest"): Promise<DeliverAlertEmailDigestJob | null>;
  dequeue(jobName: "deliver-webhook"): Promise<DeliverWebhookJob | null>;
  dequeue(jobName: "deliver-github-dispatch"): Promise<DeliverGitHubDispatchJob | null>;
  dequeue(jobName: "generate-weekly-report"): Promise<GenerateWeeklyReportJob | null>;
  dequeue(jobName: "cleanup-retention"): Promise<CleanupRetentionJob | null>;
  close(): Promise<void>;
}

export interface NormalizeEventsJob {
  project_id: string;
  event_id: string;
  object_key: string;
  capture_preset?: CapturePreset;
  immediate_client_error_statuses?: number[];
  capture_rule?: CaptureRuleEvaluationResult;
}

export interface GroupIncidentJob {
  project_id: string;
  event_id: string;
  event_type: EventEnvelope["event_type"];
  event_class: EventClass;
  incident_trigger?: "request_anomaly";
  service_name: string;
  environment: string;
  fingerprint: string;
  fingerprint_version?: string;
  normalized_message: string;
  matched_fields?: string[];
  occurred_at: string;
  severity: "low" | "medium" | "high" | "critical";
  deploy_metadata?: {
    commit_sha: string;
    version: string;
    branch: string;
    deployed_at: string;
  };
}

export interface BuildBundleJob {
  project_id: string;
  incident_id: string;
  event_id: string;
  occurred_at: string;
  occurrence_count: number;
  trigger:
    | "occurrence_threshold"
    | "regression_reopen"
    | "deploy_metadata"
    | "new_context_type"
    | "reproduction_confidence_change"
    | "regeneration";
}

export interface BuildReproductionJob {
  project_id: string;
  incident_id: string;
  bundle_key: string;
  bundle_version: number;
  occurred_at: string;
}

export interface EvaluateAlertsJob {
  project_id: string;
  incident_id: string;
  condition_type: AlertConditionType;
  dedupe_key: string;
  occurred_at: string;
  summary?: string;
  service_name: string;
  environment: string;
  severity: "low" | "medium" | "high" | "critical";
  regression_deploy?: RegressionDeployCorrelation | null;
}

export interface DeliverAlertEmailDigestJob {
  digest_id: string;
}

export interface DeliverWebhookJob {
  delivery_id: string;
  attempt: number;
}

export interface DeliverGitHubDispatchJob {
  delivery_id: string;
  attempt: number;
}

export interface GenerateWeeklyReportJob {
  delivery_id: string;
  weekly_report_channel_id: string;
  project_id: string;
  delivery_ids?: string[];
  weekly_report_channel_ids?: string[];
  project_ids?: string[];
  window_start: string;
  window_end: string;
}

export interface CleanupRetentionJob {
  scheduled_at: string;
}

export interface RetentionRawEventReference {
  project_id: string;
  event_id: string;
  occurred_at: string;
}

export interface RetentionExpiredIncidentReference {
  project_id: string;
  incident_id: string;
}

export interface IngestionPersistenceService {
  persistAndEnqueue(
    event: EventEnvelope,
    projectId: string,
    options?: { capturePreset?: CapturePreset; immediateClientErrorStatuses?: number[]; captureRule?: CaptureRuleEvaluationResult }
  ): Promise<{ object_key: string }>;
}

export interface IngestionRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retry_after_ms: number;
}

export interface IngestionRateLimiter {
  claimEvents(input: {
    token_hash: string;
    project_id: string;
    event_count: number;
    limit: number;
    now?: string;
  }): Promise<IngestionRateLimitResult>;
}

export interface AuthRateLimiter {
  claimRequest(input: {
    ip: string;
    subject?: string;
    bucket?: string;
    limit: number;
    now?: string;
  }): Promise<IngestionRateLimitResult>;
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
  name: string;
  slug: string;
  environment_default: string;
  organization_plan: string;
  metrics: {
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
  organization_id: string;
  owner_user_id: string;
  owner_email: string;
  relationship: "owned" | "shared";
  sharing_state: "private" | "shared_by_you" | "shared_with_you";
  effective_role: "owner" | "admin" | "member";
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
  project_github_repos: Record<string, unknown>[];
  github_dispatch_rules: Record<string, unknown>[];
  github_dispatch_deliveries: Record<string, unknown>[];
  org_usage_counters: Record<string, unknown>[];
  processed_billing_events: Record<string, unknown>[];
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
  listActiveProbesForProject(input: { project_id: string; now: string }): Promise<ProbeActivationRecord[]>;
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
  }): Promise<{ organization_plan: TierName; activation: ProbeActivationRecord; trigger_token: string; concurrent_limit_exceeded?: boolean } | null>;
  deactivateProbeActivationForProjectInOrganization(input: {
    organization_id: string;
    project_id: string;
    activation_id: string;
    deactivated_at: string;
  }): Promise<{ organization_plan: TierName; deactivated: { activation_id: string; deactivated_at: string } } | null>;
}

export type AlertChannel = "email" | "slack" | "discord" | "webhook";

export type AlertConditionType =
  | "new_incident"
  | "incident_regressed"
  | "error_spike"
  | "severity_threshold"
  | "regression_after_deploy";

export interface AlertRuleRecord extends Record<string, unknown> {
  alert_id: string;
  project_id: string;
  created_by_user_id: string;
  service_id: string | null;
  channel: AlertChannel;
  condition_type: AlertConditionType;
  severity_min: "low" | "medium" | "high" | "critical" | null;
  config: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeleteAlertResult {
  alert_id: string;
}

export interface AlertManagementStore {
  listAlertsForOrganization(input: {
    organization_id: string;
    project_id: string;
    limit: number;
  }): Promise<AlertRuleRecord[] | null>;
  createAlertForOrganization(input: {
    organization_id: string;
    project_id: string;
    created_by_user_id: string;
    service_id?: string | null;
    channel: AlertChannel;
    condition_type: AlertConditionType;
    severity_min?: "low" | "medium" | "high" | "critical" | null;
    config: Record<string, unknown>;
    is_enabled: boolean;
  }): Promise<AlertRuleRecord | null>;
  updateAlertForOrganization(input: {
    organization_id: string;
    alert_id: string;
    project_id?: string;
    actor_user_id?: string;
    actor_role?: "owner" | "admin" | "member";
    service_id?: string | null;
    channel?: AlertChannel;
    condition_type?: AlertConditionType;
    severity_min?: "low" | "medium" | "high" | "critical" | null;
    config?: Record<string, unknown>;
    is_enabled?: boolean;
  }): Promise<AlertRuleRecord | null>;
  deleteAlertForOrganization(input: {
    organization_id: string;
    project_id?: string;
    alert_id: string;
    actor_user_id?: string;
    actor_role?: "owner" | "admin" | "member";
  }): Promise<DeleteAlertResult | null>;
}

export interface DemotedIncidentEventReference {
  event_id: string;
  occurred_at: string;
}

export interface RecordIncidentEventRetentionInput {
  incident_id: string;
  event_id: string;
  event_type: EventEnvelope["event_type"];
  event_class?: EventClass;
  occurred_at: string;
  occurrence_count: number;
  severity: "low" | "medium" | "high" | "critical";
  level?: string | null;
}

export interface RecordIncidentEventRetentionResult {
  is_sampled: boolean;
  demoted_event_references: DemotedIncidentEventReference[];
}

export interface AlertDeliveryRecord extends Record<string, unknown> {
  delivery_id: string;
  alert_id: string;
  project_id: string;
  incident_id: string;
  condition_type: AlertConditionType;
  dedupe_key: string;
  channel: AlertChannel;
  status: "pending" | "delivered" | "failed";
  payload: Record<string, unknown>;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertEmailDigestRecord extends Record<string, unknown> {
  digest_id: string;
  project_id: string;
  recipient: string;
  status: "pending" | "delivered" | "failed";
  next_attempt_at: string | null;
  claimed_at: string | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertEmailDigestItemRecord extends Record<string, unknown> {
  item_id: string;
  digest_id: string;
  alert_id: string;
  project_id: string;
  incident_id: string;
  condition_type: AlertConditionType;
  dedupe_key: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface CreateAlertDeliveryIntentInput {
  alert_id: string;
  project_id: string;
  incident_id: string;
  condition_type: AlertConditionType;
  dedupe_key: string;
  channel: AlertChannel;
  payload: Record<string, unknown>;
}

export interface MarkAlertDeliveryResultInput {
  delivery_id: string;
  delivered: boolean;
  error_message: string | null;
}

export interface QueueAlertEmailDigestItemInput {
  alert_id: string;
  project_id: string;
  incident_id: string;
  condition_type: AlertConditionType;
  dedupe_key: string;
  recipient: string;
  payload: Record<string, unknown>;
  aggregation_window_seconds: number;
  allow_new_digest: boolean;
}

export interface AlertDeliveryStore {
  listMatchingAlerts(input: {
    project_id: string;
    condition_type: AlertConditionType;
    service_name: string;
    environment: string;
    severity: "low" | "medium" | "high" | "critical";
  }): Promise<AlertRuleRecord[]>;
  createAlertDeliveryIntent(input: CreateAlertDeliveryIntentInput): Promise<{ delivery_id: string | null; created: boolean }>;
  markAlertDeliveryResult(input: MarkAlertDeliveryResultInput): Promise<{ status: "delivered" | "failed" }>;
  queueAlertEmailDigestItem(input: QueueAlertEmailDigestItemInput): Promise<{
    digest_id: string | null;
    created: boolean;
    created_digest: boolean;
  }>;
  claimDueAlertEmailDigests(limit: number): Promise<DeliverAlertEmailDigestJob[]>;
  getAlertEmailDigest(digestId: string): Promise<{
    digest: AlertEmailDigestRecord;
    items: AlertEmailDigestItemRecord[];
  } | null>;
  markAlertEmailDigestResult(input: {
    digest_id: string;
    delivered: boolean;
    error_message: string | null;
  }): Promise<{ status: "delivered" | "failed" }>;
}

export interface PostgresMetadataStore
  extends MetadataStore,
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

export interface ImprovementRetrievalRecord extends Record<string, unknown> {
  improvement_id: string;
  project_id: string;
  project_name: string;
  project_slug: string;
  service_id: string | null;
  service_name: string;
  service_runtime: string | null;
  service_framework: string | null;
  environment: string;
  kind: "warning_hotspot" | "slow_request" | "request_failure_pattern" | "recurring_incident" | "post_deploy_regression";
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
  resolved_by_member_id: string;
  resolved_at: string;
}

export interface ReopenIncidentForOrganizationInput {
  organization_id: string;
  incident_id: string;
}

export interface ResolveImprovementForOrganizationInput {
  organization_id: string;
  improvement_id: string;
  resolved_by_member_id: string;
  resolved_at: string;
}

export interface ReopenImprovementForOrganizationInput {
  organization_id: string;
  improvement_id: string;
}

export interface SnoozeImprovementForOrganizationInput {
  organization_id: string;
  improvement_id: string;
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
    project_id?: string;
    environment?: string;
    service?: string;
    status?: "open" | "resolved" | "regressed";
    severity?: "low" | "medium" | "high" | "critical";
    cursor?: IncidentsCursor;
    limit: number;
  }): Promise<IncidentRetrievalRecord[]>;
  getIncidentForOrganization(input: { organization_id: string; incident_id: string }): Promise<IncidentRetrievalRecord | null>;
  resolveIncidentForOrganization(input: ResolveIncidentForOrganizationInput): Promise<IncidentRetrievalRecord | null>;
  reopenIncidentForOrganization(input: ReopenIncidentForOrganizationInput): Promise<IncidentRetrievalRecord | null>;
  listServicesForOrganization?(input: {
    organization_id: string;
    project_id: string;
    limit: number;
  }): Promise<ServiceRetrievalRecord[] | null>;
  listIncidentLogsForOrganization(input: {
    organization_id: string;
    incident_id: string;
    limit: number;
    level?: string;
    cursor?: IncidentLogsCursor;
  }): Promise<IncidentLogRecord[]>;
  getBundleFailureReasonForOrganization?(input: { organization_id: string; incident_id: string }): Promise<string | null>;
  getBundleSourceForOrganization?(input: { organization_id: string; incident_id: string }): Promise<{
    event_id: string;
    occurred_at: string;
    occurrence_count: number;
    trigger: string;
  } | null>;
  upsertIncident(input: UpsertIncidentInput): Promise<UpsertIncidentResult>;
  insertIncidentEvent(input: InsertIncidentEventInput): Promise<void>;
  recordIncidentEventRetention(input: RecordIncidentEventRetentionInput): Promise<RecordIncidentEventRetentionResult>;
  markIncidentSpiking(input: MarkIncidentSpikingInput): Promise<boolean>;
}

export interface ImprovementRetrievalStore {
  listImprovementsForOrganization(input: {
    organization_id: string;
    project_id?: string;
    environment?: string;
    service?: string;
    status?: "open" | "resolved" | "snoozed";
    severity?: "low" | "medium" | "high" | "critical";
    kind?: "warning_hotspot" | "slow_request" | "request_failure_pattern" | "recurring_incident" | "post_deploy_regression";
    cursor?: ImprovementsCursor;
    limit: number;
  }): Promise<ImprovementRetrievalRecord[]>;
  getImprovementForOrganization(input: {
    organization_id: string;
    improvement_id: string;
  }): Promise<ImprovementRetrievalRecord | null>;
  resolveImprovementForOrganization(input: ResolveImprovementForOrganizationInput): Promise<ImprovementRetrievalRecord | null>;
  reopenImprovementForOrganization(input: ReopenImprovementForOrganizationInput): Promise<ImprovementRetrievalRecord | null>;
  snoozeImprovementForOrganization?(input: SnoozeImprovementForOrganizationInput): Promise<ImprovementRetrievalRecord | null>;
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

export interface RetentionStore {
  listExpiredSampledRawEvents(input: { now: string; limit: number }): Promise<RetentionRawEventReference[]>;
  markRawEventsExpired(input: { references: RetentionRawEventReference[] }): Promise<void>;
  listExpiredIncidents(input: { now: string; limit: number }): Promise<RetentionExpiredIncidentReference[]>;
  deleteExpiredIncidents(input: { references: RetentionExpiredIncidentReference[] }): Promise<void>;
}

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
  getBundleBuildContext(input: { project_id: string; incident_id: string }): Promise<BundleBuildContext | null>;
  hasBundleGenerationForSourceEvent?(input: { incident_id: string; event_id: string }): Promise<boolean>;
  markBundleGenerationFailure?(input: { incident_id: string; reason: string | null }): Promise<void>;
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
    weekly_report_timezone: string;
  }): Promise<ProjectRecord | null>;
  updateProjectForUser?(input: {
    user_id: string;
    project_id: string;
    name?: string;
    slug?: string;
    environment_default?: string;
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
    weekly_report_timezone?: string;
  }): Promise<ProjectRecord | null>;
  updateProjectForOrganization(input: {
    organization_id: string;
    project_id: string;
    name?: string;
    slug?: string;
    environment_default?: string;
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
  }): Promise<DeletedAccountRecord | "other_owned_organizations_exist" | null>;
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
        kind: "invalid_token" | "email_mismatch";
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
  recordOccurrence(input: { incident_id: string; event_id: string; occurred_at: string }): Promise<IncidentFrequencySnapshot>;
}

export interface RequestAnomalyCounter {
  recordObservation(input: { anomaly_key: string; event_id: string; occurred_at: string }): Promise<IncidentFrequencySnapshot>;
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
  query<Row extends Record<string, unknown>>(sql: string, params: unknown[]): Promise<QueryResult<Row>>;
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
  resolveIncidentForOrganization(input: ResolveIncidentForOrganizationInput): Promise<IncidentRetrievalRecord | null>;
  reopenIncidentForOrganization(input: ReopenIncidentForOrganizationInput): Promise<IncidentRetrievalRecord | null>;
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

export interface CreateRedisQueueClientInput {
  redisUrl: string;
  snapshotStore?: Queryable;
  frequencySnapshotIntervalSeconds?: number;
}
