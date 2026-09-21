import { z } from "zod";

import { SESSION_COOKIE_NAME } from "../../../packages/auth/src/index.js";
import {
  AlertListResponseSchema,
  AlertResponseSchema
} from "../../../packages/alert-client/src/index.js";
import { BillingSummaryResponseSchema } from "../../../packages/billing-client/src/index.js";
import {
  BundleV1Schema,
  CaptureRuleSuggestionsResponseSchema as SharedCaptureRuleSuggestionsResponseSchema,
  CaptureRuleCreateSchema as SharedCaptureRuleCreateSchema,
  CreateCaptureRuleFromSuggestionSchema as SharedCreateCaptureRuleFromSuggestionSchema,
  CaptureRuleResponseSchema as SharedCaptureRuleResponseSchema,
  CaptureRulesResponseSchema as SharedCaptureRulesResponseSchema,
  CaptureRuleUpdateSchema as SharedCaptureRuleUpdateSchema,
  CapturePolicyResponseSchema as SharedCapturePolicyResponseSchema,
  CapturePolicyUpdateSchema,
  AnalyticsEventEnvelopeSchema,
  AnalyticsSdkConfigSchema as SharedAnalyticsSdkConfigSchema,
  AnalyticsSettingsResponseSchema,
  AnalyticsSettingsUpdateSchema,
  EventEnvelopeSchema,
  ImprovementSettingsResponseSchema,
  ImprovementSettingsUpdateSchema,
  ResolvedCapturePolicySchema as SharedResolvedCapturePolicySchema
} from "../../../packages/shared-types/src/index.js";
import {
  DeletedProjectRecordSchema,
  ProjectCreateResponseSchema,
  ProjectDeleteResponseSchema,
  ProjectListResponseSchema
} from "../../../packages/project-management-client/src/index.js";
import {
  BulkIncidentResponseSchema,
  IncidentResponseSchema,
  IncidentsResponseSchema,
  ImprovementResponseSchema,
  ImprovementsResponseSchema,
  LogsResponseSchema,
  ReproductionResponseSchema,
  ServicesResponseSchema
} from "../../../packages/retrieval-client/src/index.js";
import {
  TokenCreateResponseSchema,
  TokenListResponseSchema
} from "../../../packages/token-management/src/index.js";
import {
  RetryWebhookDeliveryResponseSchema,
  WebhookCreateResponseSchema,
  WebhookDeliveriesResponseSchema,
  WebhookResponseSchema,
  WebhookTestResponseSchema,
  WebhookListResponseSchema
} from "../../../packages/webhook-client/src/index.js";
import {
  WeeklyReportChannelListResponseSchema,
  WeeklyReportChannelResponseSchema
} from "../../../packages/weekly-report-client/src/index.js";
import {
  AccountDeleteBodySchema,
  AccountDeleteRequestOtpBodySchema,
  AcceptInviteBodySchema,
  AvailabilityCheckCreateBodySchema,
  AvailabilityCheckTestBodySchema,
  AvailabilityCheckUpdateBodySchema,
  AlertsQuerySchema,
  BillingCheckoutBodySchema,
  BillingCheckoutConfirmBodySchema,
  BillingCapacityChangeBodySchema,
  BulkIncidentMutationBodySchema,
  CreateAlertBodySchema,
  CreateProjectTokenBodySchema,
  CreateProjectInviteBodySchema,
  CreateProjectBodySchema,
  CreateTokenBodySchema,
  CreateWebhookBodySchema,
  CreateWeeklyReportChannelBodySchema,
  GithubAuthCallbackQuerySchema,
  GithubDeviceClaimBodySchema,
  GithubDevicePollBodySchema,
  GithubDeviceStartBodySchema,
  GithubTokenExchangeBodySchema,
  ImprovementParamsSchema,
  ImprovementSnoozeBodySchema,
  ImprovementsQuerySchema,
  IncidentParamsSchema,
  IncidentsQuerySchema,
  LogsQuerySchema,
  MemberTokenParamsSchema,
  ProjectInviteParamsSchema,
  ProjectMemberParamsSchema,
  ProjectCaptureRuleParamsSchema,
  ProjectParamsSchema,
  ProjectImprovementParamsSchema,
  ProjectScopedQuerySchema,
  ProjectSlackDestinationDeleteParamsSchema,
  ProjectsQuerySchema,
  ProjectTokenParamsSchema,
  ProbeActivateBodySchema,
  ProbeDeactivateBodySchema,
  ProjectAvailabilityCheckParamsSchema,
  RequestEmailCodeBodySchema,
  ServicesQuerySchema,
  SlackAppCallbackQuerySchema,
  SlackAppInstallUrlQuerySchema,
  TokenListQuerySchema,
  UpdateAlertBodySchema,
  UpdateProjectMemberRoleBodySchema,
  UpdateProjectBodySchema,
  UpdateWebhookBodySchema,
  UpdateWeeklyReportChannelBodySchema,
  VerifyEmailCodeBodySchema,
  WebhookDeliveriesParamsSchema,
  WebhookDeliveriesQuerySchema,
  WebhookDeliveryRetryParamsSchema,
  WebhookParamsSchema,
  WebhooksQuerySchema,
  WebhookTestBodySchema,
  WeeklyReportChannelParamsSchema,
  WeeklyReportChannelsQuerySchema
} from "./schemas.js";

export {
  z,
  SESSION_COOKIE_NAME,
  AlertListResponseSchema,
  AlertResponseSchema,
  BillingSummaryResponseSchema,
  BundleV1Schema,
  SharedCaptureRuleSuggestionsResponseSchema,
  SharedCaptureRuleCreateSchema,
  SharedCreateCaptureRuleFromSuggestionSchema,
  SharedCaptureRuleResponseSchema,
  SharedCaptureRulesResponseSchema,
  SharedCaptureRuleUpdateSchema,
  SharedCapturePolicyResponseSchema,
  CapturePolicyUpdateSchema,
  AnalyticsEventEnvelopeSchema,
  SharedAnalyticsSdkConfigSchema,
  AnalyticsSettingsResponseSchema,
  AnalyticsSettingsUpdateSchema,
  EventEnvelopeSchema,
  ImprovementSettingsResponseSchema,
  ImprovementSettingsUpdateSchema,
  SharedResolvedCapturePolicySchema,
  DeletedProjectRecordSchema,
  ProjectCreateResponseSchema,
  ProjectDeleteResponseSchema,
  ProjectListResponseSchema,
  BulkIncidentResponseSchema,
  IncidentResponseSchema,
  IncidentsResponseSchema,
  ImprovementResponseSchema,
  ImprovementsResponseSchema,
  LogsResponseSchema,
  ReproductionResponseSchema,
  ServicesResponseSchema,
  TokenCreateResponseSchema,
  TokenListResponseSchema,
  RetryWebhookDeliveryResponseSchema,
  WebhookCreateResponseSchema,
  WebhookDeliveriesResponseSchema,
  WebhookResponseSchema,
  WebhookTestResponseSchema,
  WebhookListResponseSchema,
  WeeklyReportChannelListResponseSchema,
  WeeklyReportChannelResponseSchema,
  AccountDeleteBodySchema,
  AccountDeleteRequestOtpBodySchema,
  AcceptInviteBodySchema,
  AvailabilityCheckCreateBodySchema,
  AvailabilityCheckTestBodySchema,
  AvailabilityCheckUpdateBodySchema,
  AlertsQuerySchema,
  BillingCheckoutBodySchema,
  BillingCheckoutConfirmBodySchema,
  BillingCapacityChangeBodySchema,
  BulkIncidentMutationBodySchema,
  CreateAlertBodySchema,
  CreateProjectTokenBodySchema,
  CreateProjectInviteBodySchema,
  CreateProjectBodySchema,
  CreateTokenBodySchema,
  CreateWebhookBodySchema,
  CreateWeeklyReportChannelBodySchema,
  GithubAuthCallbackQuerySchema,
  GithubDeviceClaimBodySchema,
  GithubDevicePollBodySchema,
  GithubDeviceStartBodySchema,
  GithubTokenExchangeBodySchema,
  ImprovementParamsSchema,
  ImprovementSnoozeBodySchema,
  ImprovementsQuerySchema,
  IncidentParamsSchema,
  IncidentsQuerySchema,
  LogsQuerySchema,
  MemberTokenParamsSchema,
  ProjectInviteParamsSchema,
  ProjectMemberParamsSchema,
  ProjectCaptureRuleParamsSchema,
  ProjectParamsSchema,
  ProjectImprovementParamsSchema,
  ProjectScopedQuerySchema,
  ProjectSlackDestinationDeleteParamsSchema,
  ProjectsQuerySchema,
  ProjectTokenParamsSchema,
  ProbeActivateBodySchema,
  ProbeDeactivateBodySchema,
  ProjectAvailabilityCheckParamsSchema,
  RequestEmailCodeBodySchema,
  ServicesQuerySchema,
  SlackAppCallbackQuerySchema,
  SlackAppInstallUrlQuerySchema,
  TokenListQuerySchema,
  UpdateAlertBodySchema,
  UpdateProjectMemberRoleBodySchema,
  UpdateProjectBodySchema,
  UpdateWebhookBodySchema,
  UpdateWeeklyReportChannelBodySchema,
  VerifyEmailCodeBodySchema,
  WebhookDeliveriesParamsSchema,
  WebhookDeliveriesQuerySchema,
  WebhookDeliveryRetryParamsSchema,
  WebhookParamsSchema,
  WebhooksQuerySchema,
  WebhookTestBodySchema,
  WeeklyReportChannelParamsSchema,
  WeeklyReportChannelsQuerySchema
};

export type JsonSchemaDocument = Record<string, unknown>;
export type SecurityRequirement = Record<string, []>;

export type SchemaComponent = {
  name: string;
  schema: unknown;
};

export type SchemaSpec =
  | SchemaComponent
  | {
      oneOf: SchemaComponent[];
    };

export type ResponseSpec = {
  description: string;
  schema?: SchemaSpec;
  headers?: Record<string, { description: string; schema: unknown }>;
};

export type OperationSpec = {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  operationId: string;
  summary: string;
  tags: string[];
  security?: SecurityRequirement[];
  params?: unknown;
  query?: unknown;
  requestBody?: SchemaComponent;
  responses: Record<string, ResponseSpec>;
};

export const browserSessionSecurity: SecurityRequirement = { browserSession: [] };
export const memberBearerTokenSecurity: SecurityRequirement = { memberBearerToken: [] };
export const projectBearerTokenSecurity: SecurityRequirement = { projectBearerToken: [] };

export const anyMemberAuth = [browserSessionSecurity, memberBearerTokenSecurity];
export const browserSessionAuth = [browserSessionSecurity];
export const memberBearerAuth = [memberBearerTokenSecurity];
export const projectBearerAuth = [projectBearerTokenSecurity];

export const ApiErrorSchema = z.object({ error: z.string() }).strict();
export const SuccessResponseSchema = z.object({ success: z.boolean() }).strict();
export const BillingLinkResponseSchema = z.object({ url: z.string().url() }).strict();
export const BundleFailureStatusSchema = z
  .object({ status: z.literal("failed"), reason: z.string() })
  .strict();
export const ProjectInviteMembershipSchema = z
  .object({
    project_id: z.string(),
    user_id: z.string(),
    role: z.enum(["owner", "admin", "member"]),
    membership_type: z.enum(["owner", "collaborator"]).optional()
  })
  .strict();
export const AcceptInviteResponseSchema = z
  .object({ membership: ProjectInviteMembershipSchema })
  .strict();
export const WebSessionSchema = z
  .object({
    session_id: z.string(),
    user_id: z.string(),
    email: z.string().email(),
    email_verified_at: z.string().datetime().nullable(),
    organization_id: z.string(),
    organization_plan: z.enum(["free", "solo", "team"]),
    role: z.enum(["owner", "member"]),
    created_at: z.string().datetime(),
    expires_at: z.string().datetime(),
    revoked_at: z.string().datetime().nullable(),
    avatar_url: z.string().min(1).nullable(),
    csrf_token: z.string(),
    auth_methods: z
      .object({
        email: z.boolean(),
        github: z.boolean()
      })
      .strict()
  })
  .strict();
export const SessionResponseSchema = z.object({ session: WebSessionSchema.nullable() }).strict();
export const GithubDeviceStartResponseSchema = z
  .object({
    request_id: z.string().uuid(),
    user_code: z.string(),
    verification_uri: z.string().url(),
    interval_seconds: z.number().int().positive(),
    expires_at: z.string().datetime()
  })
  .strict();
export const GithubDevicePollResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("pending"),
      interval_seconds: z.number().int().positive(),
      expires_at: z.string().datetime()
    })
    .strict(),
  z
    .object({
      status: z.enum(["approved", "claimed"]),
      expires_at: z.string().datetime()
    })
    .strict(),
  z
    .object({
      status: z.enum(["denied", "expired", "rejected"]),
      reason: z.string(),
      expires_at: z.string().datetime()
    })
    .strict()
]);
export const AccountStoredArtifactSchema = z
  .object({
    key: z.string(),
    content: z.unknown()
  })
  .strict();
export const AccountExportResponseSchema = z
  .object({
    export_version: z.literal(1),
    exported_at: z.string().datetime(),
    user: z.record(z.string(), z.unknown()),
    organization: z.record(z.string(), z.unknown()),
    members: z.array(z.record(z.string(), z.unknown())),
    project_members: z.array(z.record(z.string(), z.unknown())),
    project_invites: z.array(z.record(z.string(), z.unknown())),
    member_tokens: z.array(z.record(z.string(), z.unknown())),
    projects: z.array(z.record(z.string(), z.unknown())),
    slack_destinations: z.array(z.record(z.string(), z.unknown())),
    project_tokens: z.array(z.record(z.string(), z.unknown())),
    probe_activations: z.array(z.record(z.string(), z.unknown())),
    capture_policies: z.array(z.record(z.string(), z.unknown())),
    services: z.array(z.record(z.string(), z.unknown())),
    deployments: z.array(z.record(z.string(), z.unknown())),
    processed_events: z.array(z.record(z.string(), z.unknown())),
    improvement_opportunities: z.array(z.record(z.string(), z.unknown())),
    improvement_opportunity_events: z.array(z.record(z.string(), z.unknown())),
    incidents: z.array(z.record(z.string(), z.unknown())),
    incident_events: z.array(z.record(z.string(), z.unknown())),
    bundle_generations: z.array(z.record(z.string(), z.unknown())),
    alert_rules: z.array(z.record(z.string(), z.unknown())),
    alert_deliveries: z.array(z.record(z.string(), z.unknown())),
    alert_email_digests: z.array(z.record(z.string(), z.unknown())),
    alert_email_digest_items: z.array(z.record(z.string(), z.unknown())),
    weekly_report_channels: z.array(z.record(z.string(), z.unknown())),
    weekly_report_deliveries: z.array(z.record(z.string(), z.unknown())),
    agent_webhooks: z.array(z.record(z.string(), z.unknown())),
    webhook_deliveries: z.array(z.record(z.string(), z.unknown())),
    github_installations: z.array(z.record(z.string(), z.unknown())),
    github_marketplace_accounts: z.array(z.record(z.string(), z.unknown())),
    project_github_repos: z.array(z.record(z.string(), z.unknown())),
    github_dispatch_rules: z.array(z.record(z.string(), z.unknown())),
    github_dispatch_deliveries: z.array(z.record(z.string(), z.unknown())),
    org_usage_counters: z.array(z.record(z.string(), z.unknown())),
    processed_billing_events: z.array(z.record(z.string(), z.unknown())),
    processed_github_marketplace_events: z.array(z.record(z.string(), z.unknown())),
    plan_cleanup_tasks: z.array(z.record(z.string(), z.unknown())),
    operational_email_deliveries: z.array(z.record(z.string(), z.unknown())),
    audit_logs: z.array(z.record(z.string(), z.unknown())),
    artifacts: z
      .object({
        raw_events: z.array(AccountStoredArtifactSchema),
        bundles: z.array(AccountStoredArtifactSchema),
        reproductions: z.array(AccountStoredArtifactSchema)
      })
      .strict()
  })
  .strict();
export const AccountDeletionResponseSchema = z
  .object({
    account: z
      .object({
        deleted_at: z.string().datetime(),
        organization_id: z.string(),
        deleted_project_ids: z.array(z.string()),
        user_deleted: z.boolean(),
        deleted_member_token_count: z.number().int().nonnegative()
      })
      .strict()
  })
  .strict();
export const SlackDestinationSchema = z
  .object({
    slack_destination_id: z.string().uuid(),
    organization_id: z.string().uuid(),
    slack_team_id: z.string().min(1),
    slack_team_name: z.string().nullable(),
    slack_channel_id: z.string().min(1),
    slack_channel_name: z.string().nullable(),
    installed_by_member_id: z.string().uuid().nullable(),
    is_active: z.boolean(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime()
  })
  .strict();
export const SlackInstallUrlResponseSchema = z
  .object({
    install_url: z.string().url()
  })
  .strict();
export const SlackDestinationListResponseSchema = z
  .object({
    destinations: z.array(SlackDestinationSchema)
  })
  .strict();
export const SlackDestinationTestResponseSchema = z
  .object({
    delivered: z.literal(true)
  })
  .strict();
export const ProjectMemberSchema = z
  .object({
    user_id: z.string(),
    email: z.string().email(),
    role: z.enum(["owner", "admin", "member"]),
    membership_type: z.enum(["owner", "collaborator"]),
    avatar_url: z.string().min(1).nullable(),
    created_at: z.string().datetime()
  })
  .strict();
export const AccountAvatarImportResponseSchema = z
  .object({
    avatar: z
      .object({
        source: z.enum(["github", "gravatar"]),
        avatar_url: z.string().min(1),
        updated_at: z.string().datetime()
      })
      .strict()
  })
  .strict();
export const ProjectInviteSchema = z
  .object({
    invite_id: z.string().uuid(),
    project_id: z.string(),
    email: z.string().email(),
    role: z.enum(["admin", "member"]),
    invited_by_user_id: z.string(),
    accepted_at: z.string().datetime().nullable(),
    canceled_at: z.string().datetime().nullable(),
    expires_at: z.string().datetime(),
    created_at: z.string().datetime()
  })
  .strict();
export const ProjectMemberListResponseSchema = z
  .object({ members: z.array(ProjectMemberSchema) })
  .strict();
export const ProjectMemberResponseSchema = z.object({ member: ProjectMemberSchema }).strict();
export const ProjectInviteListResponseSchema = z
  .object({ invites: z.array(ProjectInviteSchema) })
  .strict();
export const ProjectInviteResponseSchema = z.object({ invite: ProjectInviteSchema }).strict();
export const ProjectUpdateResponseSchema = z
  .object({
    project: DeletedProjectRecordSchema.extend({
      metrics: z
        .object({
          open_incidents: z.number().int().nonnegative(),
          regressed_incidents: z.number().int().nonnegative(),
          attention_incidents_today: z.number().int().nonnegative(),
          opened_incidents_today: z.number().int().nonnegative(),
          opened_incidents_month: z.number().int().nonnegative(),
          monthly_bundle_requests: z.number().int().nonnegative(),
          monthly_raw_ingested_events: z.number().int().nonnegative(),
          retained_bundles: z.number().int().nonnegative(),
          monthly_alert_deliveries: z.number().int().nonnegative()
        })
        .strict()
    })
  })
  .strict();
export const ProbeActivationSchema = z
  .object({
    activation_id: z.string().uuid(),
    label_pattern: z.string(),
    service: z.string(),
    environment: z.string(),
    expires_at: z.string().datetime(),
    trigger_expires_at: z.string().datetime()
  })
  .strict();
export const ProbeActivationResponseSchema = z
  .object({
    activation: ProbeActivationSchema,
    trigger_token: z.string()
  })
  .strict();
export const ProbeActivationListResponseSchema = z
  .object({ activations: z.array(ProbeActivationSchema) })
  .strict();
export const ProbeDeactivationResponseSchema = z
  .object({
    deactivated: z
      .object({ activation_id: z.string().uuid(), deactivated_at: z.string().datetime() })
      .strict()
  })
  .strict();
export const CaptureRuleResponseSchema = SharedCaptureRuleResponseSchema;
export const CaptureRulesResponseSchema = SharedCaptureRulesResponseSchema;
export const ResolvedCapturePolicySchema = SharedResolvedCapturePolicySchema;
export const CapturePolicyResponseSchema = SharedCapturePolicyResponseSchema;
export const SdkConfigResponseSchema = z
  .object({
    probes_enabled: z.boolean(),
    remote_probes_enabled: z.boolean(),
    active_probes: z.array(ProbeActivationSchema),
    poll_interval_ms: z.number().int().nonnegative(),
    analytics: SharedAnalyticsSdkConfigSchema.optional(),
    capture_policy: ResolvedCapturePolicySchema,
    capture_rules: z.array(CaptureRuleResponseSchema.shape.rule),
    trigger_token_key: z.string().optional()
  })
  .strict();
export const IngestionErrorSchema = z
  .object({ index: z.number().int(), reason: z.string() })
  .strict();
export const IngestionAcceptedResponseSchema = z
  .object({
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    errors: z.array(IngestionErrorSchema),
    retry_after_ms: z.number().int().positive().optional(),
    probe_directives: z
      .object({
        active_probes: z.array(ProbeActivationSchema)
      })
      .optional()
  })
  .strict();
export const OpenApiIngestionRequestSchema = z
  .object({
    events: z.array(z.union([EventEnvelopeSchema, AnalyticsEventEnvelopeSchema]))
  })
  .strict();
export const HealthResponseSchema = z
  .object({ status: z.literal("ok"), version: z.string(), uptime: z.number() })
  .strict();
export const ReadyResponseSchema = z.object({ status: z.literal("ready") }).strict();
export const NotReadyResponseSchema = z
  .object({ status: z.literal("not_ready"), reason: z.string() })
  .strict();
export const LiveResponseSchema = z.object({ status: z.literal("live") }).strict();
export const AvailabilityCheckResultStatusSchema = z.enum([
  "success",
  "http_status_mismatch",
  "timeout",
  "dns_error",
  "tls_error",
  "connection_error",
  "redirect_blocked",
  "security_blocked",
  "internal_error"
]);
export const AvailabilityCheckHealthStatusSchema = z.enum([
  "unknown",
  "passing",
  "failing",
  "paused"
]);
export const AvailabilityIncidentStatusSchema = z.enum(["open", "resolved", "regressed"]);
export const AvailabilityCheckLimitsSchema = z
  .object({
    max_checks_per_project: z.number().int().nonnegative(),
    max_monitored_projects_per_organization: z.number().int().nonnegative(),
    max_active_checks_per_organization: z.number().int().nonnegative(),
    min_interval_seconds: z.number().int().positive(),
    recommended_failure_threshold: z.number().int().min(1).max(10)
  })
  .strict();
export const AvailabilityCheckRecordSchema = z
  .object({
    check_id: z.string().uuid(),
    project_id: z.string().uuid(),
    name: z.string(),
    url: z.string().url(),
    method: z.enum(["GET", "HEAD"]),
    expected_status_min: z.number().int().min(100).max(599),
    expected_status_max: z.number().int().min(100).max(599),
    timeout_ms: z.number().int().min(500).max(5000),
    interval_seconds: z.number().int().min(30),
    failure_threshold: z.number().int().min(1).max(10),
    recovery_threshold: z.number().int().min(1).max(10),
    environment: z.string(),
    service_name: z.string().nullable(),
    enabled: z.boolean(),
    status: AvailabilityCheckHealthStatusSchema,
    paused_reason: z.string().nullable(),
    organization_plan: z.enum(["free", "solo", "team"]),
    consecutive_failures: z.number().int().nonnegative(),
    consecutive_successes: z.number().int().nonnegative(),
    linked_incident_id: z.string().uuid().nullable(),
    linked_incident_status: AvailabilityIncidentStatusSchema.nullable(),
    last_checked_at: z.string().datetime().nullable(),
    next_check_at: z.string().datetime().nullable(),
    last_result_status: AvailabilityCheckResultStatusSchema.nullable(),
    last_result_http_status: z.number().int().nullable(),
    last_result_error_kind: z.string().nullable(),
    last_result_error_message: z.string().nullable(),
    last_result_duration_ms: z.number().int().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime()
  })
  .strict();
export const AvailabilityCheckResultRecordSchema = z
  .object({
    result_id: z.string().uuid(),
    check_id: z.string().uuid(),
    project_id: z.string().uuid(),
    started_at: z.string().datetime(),
    completed_at: z.string().datetime(),
    duration_ms: z.number().int().nonnegative(),
    status: AvailabilityCheckResultStatusSchema,
    http_status: z.number().int().nullable(),
    error_kind: z.string().nullable(),
    error_message: z.string().nullable(),
    redirect_count: z.number().int().nonnegative(),
    checked_url_host: z.string(),
    final_url: z.string().url()
  })
  .strict();
export const AvailabilityCheckDailyRollupRecordSchema = z
  .object({
    check_id: z.string().uuid(),
    project_id: z.string().uuid(),
    day: z.string(),
    state: z.enum(["unknown", "operational", "degraded", "down", "paused"]),
    total_checks: z.number().int().nonnegative(),
    successful_checks: z.number().int().nonnegative(),
    failed_checks: z.number().int().nonnegative(),
    degraded_checks: z.number().int().nonnegative(),
    avg_duration_ms: z.number().int().nullable(),
    first_checked_at: z.string().datetime().nullable(),
    last_checked_at: z.string().datetime().nullable(),
    downtime_seconds: z.number().int().nonnegative(),
    incident_ids: z.array(z.string().uuid())
  })
  .strict();
export const AvailabilityCheckListResponseSchema = z
  .object({
    checks: z.array(AvailabilityCheckRecordSchema),
    limits: AvailabilityCheckLimitsSchema
  })
  .strict();
export const AvailabilityCheckResponseSchema = z
  .object({
    check: AvailabilityCheckRecordSchema,
    limits: AvailabilityCheckLimitsSchema
  })
  .strict();
export const AvailabilityCheckMutationResponseSchema = z
  .object({
    check: AvailabilityCheckRecordSchema
  })
  .strict();
export const AvailabilityCheckDeleteResponseSchema = z
  .object({
    deleted: z.literal(true)
  })
  .strict();
export const AvailabilityCheckResultsResponseSchema = z
  .object({
    results: z.array(AvailabilityCheckResultRecordSchema)
  })
  .strict();
export const AvailabilityCheckDailyRollupsResponseSchema = z
  .object({
    rollups: z.array(AvailabilityCheckDailyRollupRecordSchema)
  })
  .strict();
export const AvailabilityCheckTestResponseSchema = z
  .object({
    normalized_url: z.string().url(),
    result: z
      .object({
        status: AvailabilityCheckResultStatusSchema,
        http_status: z.number().int().nullable(),
        duration_ms: z.number().int().nonnegative(),
        error_kind: z.string().nullable(),
        error_message: z.string().nullable(),
        checked_url_host: z.string(),
        checked_url_path: z.string(),
        checked_url_query: z.record(z.string(), z.string()),
        final_url: z.string().url(),
        redirect_count: z.number().int().nonnegative()
      })
      .strict()
  })
  .strict();

export function component(name: string, schema: unknown): SchemaComponent {
  return { name, schema };
}
