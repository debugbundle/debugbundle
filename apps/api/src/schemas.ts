import { MAX_BILLING_ADDITIONAL_CAPACITY_UNITS } from "../../../packages/shared-types/src/index.js";
import { z } from "zod";

export const IngestionRequestSchema = z
  .object({
    events: z.array(z.unknown())
  })
  .strict();

export const RequestEmailCodeBodySchema = z
  .object({
    email: z.string().email(),
    accepted_terms: z.literal(true)
  })
  .strict();

export const VerifyEmailCodeBodySchema = z
  .object({
    email: z.string().email(),
    code: z.string().regex(/^\d{6}$/, "otp_code_invalid")
  })
  .strict();

export const AccountDeleteBodySchema = z
  .object({
    email: z.string().email()
  })
  .strict();

export const AcceptInviteBodySchema = z
  .object({
    token: z.string().min(1)
  })
  .strict();

export const GithubAuthCallbackQuerySchema = z
  .object({
    code: z.string().min(1),
    state: z.string().min(1)
  })
  .strict();

export const GithubMockAuthorizeQuerySchema = z
  .object({
    client_id: z.string().min(1).optional(),
    redirect_uri: z.string().url(),
    scope: z.string().min(1).optional(),
    state: z.string().min(1)
  })
  .strict();

export const GithubDeviceStartBodySchema = z
  .object({
    accepted_terms: z.literal(true)
  })
  .strict();

export const GithubDevicePollBodySchema = z
  .object({
    request_id: z.string().uuid()
  })
  .strict();

export const GithubDeviceClaimBodySchema = z
  .object({
    request_id: z.string().uuid(),
    label: z.string().min(1).max(120)
  })
  .strict();

export const GithubTokenExchangeBodySchema = z
  .object({
    github_access_token: z.string().min(1),
    label: z.string().min(1).max(120),
    accepted_terms: z.literal(true)
  })
  .strict();

export const GitHubAppCallbackQuerySchema = z
  .object({
    installation_id: z.coerce.number().int().positive(),
    setup_action: z.enum(["install", "update", "request"]).optional(),
    state: z.string().min(1).optional()
  })
  .passthrough();

export const GitHubAppInstallUrlQuerySchema = z
  .object({
    return_to: z.string().min(1).optional()
  })
  .strict();

export const SlackAppCallbackQuerySchema = z
  .object({
    code: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    error: z.string().min(1).optional()
  })
  .passthrough();

export const SlackAppInstallUrlQuerySchema = z
  .object({
    project_id: z.string().uuid(),
    return_to: z.string().min(1).optional()
  })
  .strict();

export const GitHubProjectRepoBodySchema = z
  .object({
    owner: z.string().min(1),
    repo: z.string().min(1)
  })
  .strict();

export const GitHubDispatchIncidentStatusSchema = z.enum(["new_only", "reopened_only", "new_or_reopened"]);

export const GitHubDispatchEventTypeSchema = z.enum([
  "bundle.created",
  "bundle.updated",
  "bundle.reopened",
  "bundle.resolved",
  "verification.passed",
  "verification.failed",
  "improvement_bundle.created",
  "incident.spike_detected"
]);

export const GitHubDispatchRuleBodySchema = z
  .object({
    name: z.string().min(1).max(200),
    event_types: z.array(GitHubDispatchEventTypeSchema).min(1),
    environments: z.array(z.string().min(1)).default([]),
    services: z.array(z.string().min(1)).default([]),
    severity_min: z.enum(["low", "medium", "high", "critical"]),
    bundle_type: z.enum(["failure", "improvement"]),
    incident_status: GitHubDispatchIncidentStatusSchema.default("new_or_reopened"),
    cooldown_seconds: z.coerce.number().int().min(0).max(86400).default(300),
    enabled: z.boolean().default(true)
  })
  .strict();

export const UpdateGitHubDispatchRuleBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    event_types: z.array(GitHubDispatchEventTypeSchema).min(1).optional(),
    environments: z.array(z.string().min(1)).optional(),
    services: z.array(z.string().min(1)).optional(),
    severity_min: z.enum(["low", "medium", "high", "critical"]).optional(),
    bundle_type: z.enum(["failure", "improvement"]).optional(),
    incident_status: GitHubDispatchIncidentStatusSchema.optional(),
    cooldown_seconds: z.coerce.number().int().min(0).max(86400).optional(),
    enabled: z.boolean().optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "update_requires_changes"
  });

export const GitHubDispatchRuleParamsSchema = z
  .object({
    id: z.string().uuid(),
    ruleId: z.string().uuid()
  })
  .strict();

export const GitHubDispatchDeliveryStatusSchema = z.enum(["pending", "retrying", "delivered", "failed"]);

export const GitHubDispatchDeliveriesQuerySchema = z
  .object({
    status: GitHubDispatchDeliveryStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();

export const GitHubDispatchDeliveryRetryParamsSchema = z
  .object({
    id: z.string().uuid(),
    deliveryId: z.string().uuid()
  })
  .strict();

export const WebhookDeliveriesParamsSchema = z
  .object({
    id: z.string().min(1)
  })
  .strict();

export const WebhookDeliveryRetryParamsSchema = z
  .object({
    id: z.string().uuid(),
    deliveryId: z.string().uuid()
  })
  .strict();

export const WebhookDeliveriesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();

export const WebhookEventTypeSchema = z.enum([
  "bundle.created",
  "bundle.updated",
  "bundle.reopened",
  "bundle.resolved",
  "verification.passed",
  "verification.failed",
  "improvement_bundle.created",
  "incident.spike_detected"
]);

export const AlertChannelSchema = z.enum(["email", "slack", "discord", "webhook"]);

export const WeeklyReportChannelSchema = z.enum(["email", "slack"]);

export const WeeklyReportScheduleDayOfWeekSchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
]);

function isValidTimeZone(value: string): boolean {
  try {
    void new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date("2026-03-15T00:00:00.000Z"));
    return true;
  } catch {
    return false;
  }
}

const WeeklyReportScheduleSchema = z
  .object({
    day_of_week: WeeklyReportScheduleDayOfWeekSchema,
    hour_of_day: z.coerce.number().int().min(0).max(23),
    timezone: z.string().min(1).refine((value) => isValidTimeZone(value), "invalid_timezone")
  })
  .strict();

const WeeklyReportEmailConfigSchema = z
  .object({
    to: z.array(z.string().email()).min(1)
  })
  .strict();

const WeeklyReportSlackConfigSchema = z.union([
  z
    .object({
      webhook_url: z.string().url().max(2000)
    })
    .strict(),
  z
    .object({
      slack_destination_id: z.string().uuid()
    })
    .strict()
]);

export const AlertConditionTypeSchema = z.enum([
  "new_incident",
  "incident_regressed",
  "error_spike",
  "severity_threshold",
  "regression_after_deploy"
]);

const AlertEmailConfigSchema = z
  .object({
    to: z.string().email()
  })
  .strict();

const AlertSlackConfigSchema = z.union([
  z
    .object({
      webhook_url: z.string().url().max(2000)
    })
    .strict(),
  z
    .object({
      slack_destination_id: z.string().uuid()
    })
    .strict()
]);

const AlertDiscordConfigSchema = z
  .object({
    webhook_url: z.string().url().max(2000)
  })
  .strict();

const AlertWebhookConfigSchema = z
  .object({
    target_url: z.string().url().max(2000)
  })
  .strict();

const WebhookFiltersSchema = z
  .object({
    environment: z.array(z.string().min(1)).optional(),
    service: z.array(z.string().min(1)).optional(),
    severity_min: z.enum(["low", "medium", "high", "critical"]).optional(),
    bundle_type: z.array(z.enum(["failure", "improvement"])).optional(),
    verification: z.boolean().optional()
  })
  .strict();

export const WebhooksQuerySchema = z
  .object({
    project_id: z.string().uuid(),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();

export const WebhookParamsSchema = z
  .object({
    id: z.string().uuid()
  })
  .strict();

export const CreateWebhookBodySchema = z
  .object({
    project_id: z.string().uuid(),
    url: z.string().url().max(2000),
    events: z.array(WebhookEventTypeSchema).min(1),
    filters: WebhookFiltersSchema.default({}),
    is_enabled: z.boolean().default(true)
  })
  .strict();

export const UpdateWebhookBodySchema = z
  .object({
    url: z.string().url().max(2000).optional(),
    events: z.array(WebhookEventTypeSchema).min(1).optional(),
    filters: WebhookFiltersSchema.optional(),
    is_enabled: z.boolean().optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "update_requires_changes"
  });

export const WebhookTestBodySchema = z
  .object({
    event_type: WebhookEventTypeSchema.default("verification.passed")
  })
  .strict();

export const AlertsQuerySchema = z
  .object({
    project_id: z.string().uuid(),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();

export const WeeklyReportChannelsQuerySchema = z
  .object({
    project_id: z.string().uuid(),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();

export const WeeklyReportChannelParamsSchema = z
  .object({
    id: z.string().min(1)
  })
  .strict();

export const CreateWeeklyReportChannelBodySchema = z.discriminatedUnion("channel", [
  z
    .object({
      project_id: z.string().uuid(),
      channel: z.literal("email"),
      config: WeeklyReportEmailConfigSchema,
      schedule: WeeklyReportScheduleSchema,
      is_enabled: z.boolean().default(true)
    })
    .strict(),
  z
    .object({
      project_id: z.string().uuid(),
      channel: z.literal("slack"),
      config: WeeklyReportSlackConfigSchema,
      schedule: WeeklyReportScheduleSchema,
      is_enabled: z.boolean().default(true)
    })
    .strict()
]);

export const UpdateWeeklyReportChannelBodySchema = z
  .object({
    config: z.union([WeeklyReportEmailConfigSchema, WeeklyReportSlackConfigSchema]).optional(),
    schedule: WeeklyReportScheduleSchema.optional(),
    is_enabled: z.boolean().optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "update_requires_changes"
  });

export const AlertParamsSchema = z
  .object({
    id: z.string().uuid()
  })
  .strict();

export const ProjectSlackDestinationDeleteParamsSchema = z
  .object({
    id: z.string().uuid(),
    destinationId: z.string().uuid()
  })
  .strict();

const BaseCreateAlertBodySchema = {
  project_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  condition_type: AlertConditionTypeSchema,
  severity_min: z.enum(["low", "medium", "high", "critical"]).optional(),
  is_enabled: z.boolean().default(true)
} as const;

export const CreateAlertBodySchema = z.discriminatedUnion("channel", [
  z
    .object({
      ...BaseCreateAlertBodySchema,
      channel: z.literal("email"),
      config: AlertEmailConfigSchema
    })
    .strict(),
  z
    .object({
      ...BaseCreateAlertBodySchema,
      channel: z.literal("slack"),
      config: AlertSlackConfigSchema
    })
    .strict(),
  z
    .object({
      ...BaseCreateAlertBodySchema,
      channel: z.literal("discord"),
      config: AlertDiscordConfigSchema
    })
    .strict(),
  z
    .object({
      ...BaseCreateAlertBodySchema,
      channel: z.literal("webhook"),
      config: AlertWebhookConfigSchema
    })
    .strict()
]);

const BaseUpdateAlertBodySchema = {
  service_id: z.string().uuid().nullable().optional(),
  condition_type: AlertConditionTypeSchema.optional(),
  severity_min: z.enum(["low", "medium", "high", "critical"]).nullable().optional(),
  is_enabled: z.boolean().optional()
} as const;

export const UpdateAlertBodySchema = z.union([
  z
    .object({
      ...BaseUpdateAlertBodySchema,
      channel: z.literal("email"),
      config: AlertEmailConfigSchema.nullable().optional()
    })
    .strict(),
  z
    .object({
      ...BaseUpdateAlertBodySchema,
      channel: z.literal("slack"),
      config: AlertSlackConfigSchema.nullable().optional()
    })
    .strict(),
  z
    .object({
      ...BaseUpdateAlertBodySchema,
      channel: z.literal("discord"),
      config: AlertDiscordConfigSchema.nullable().optional()
    })
    .strict(),
  z
    .object({
      ...BaseUpdateAlertBodySchema,
      channel: z.literal("webhook"),
      config: AlertWebhookConfigSchema.nullable().optional()
    })
    .strict(),
  z
    .object({
      ...BaseUpdateAlertBodySchema,
      channel: AlertChannelSchema.optional()
    })
    .strict()
])
  .refine((value) => Object.keys(value).length > 0, {
    message: "update_requires_changes"
  })
  .refine((value) => !Object.prototype.hasOwnProperty.call(value, "config") || value.channel !== undefined, {
    message: "channel_required_for_config"
  });

export const IncidentsQuerySchema = z
  .object({
    project_id: z.string().uuid().optional(),
    environment: z.string().min(1).optional(),
    service: z.string().min(1).optional(),
    status: z.enum(["open", "resolved", "regressed"]).optional(),
    severity: z.enum(["low", "medium", "high", "critical"]).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();

export const IncidentsCursorSchema = z
  .object({
    last_seen_at: z.string().datetime(),
    incident_id: z.string().min(1)
  })
  .strict();

export const ServicesQuerySchema = z
  .object({
    project_id: z.string().uuid(),
    limit: z.coerce.number().int().min(1).max(100).default(100)
  })
  .strict();

export const IncidentParamsSchema = z
  .object({
    id: z.string().min(1)
  })
  .strict();

export const ProjectParamsSchema = z
  .object({
    id: z.string().uuid()
  })
  .strict();

export const ProjectMemberParamsSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid()
  })
  .strict();

export const ProjectInviteParamsSchema = z
  .object({
    id: z.string().uuid(),
    inviteId: z.string().uuid()
  })
  .strict();

export const ProbeActivateBodySchema = z
  .object({
    label_pattern: z.string().min(1).max(200),
    service: z.string().min(1).max(200).default("*"),
    environment: z.string().min(1).max(200).default("*"),
    ttl_seconds: z.coerce.number().int().min(60).max(3600).default(3600),
    trigger_ttl_seconds: z.coerce.number().int().min(60).max(86400).default(86400)
  })
  .strict();

export const ProbeDeactivateBodySchema = z
  .object({
    activation_id: z.string().uuid()
  })
  .strict();

export const ProjectTokenParamsSchema = z
  .object({
    id: z.string().uuid(),
    tokenId: z.string().uuid()
  })
  .strict();

export const MemberTokenParamsSchema = z
  .object({
    tokenId: z.string().uuid()
  })
  .strict();

export const TokenListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();

export const ProjectsQuerySchema = TokenListQuerySchema;

export const BillingCheckoutBodySchema = z
  .object({
    target_plan: z.enum(["solo", "team"])
  })
  .strict();

export const BillingCheckoutConfirmBodySchema = z
  .object({
    session_id: z.string().min(1).max(255)
  })
  .strict();

export const BillingCapacityChangeBodySchema = z
  .object({
    target_additional_capacity_units: z.coerce.number().int().min(0).max(MAX_BILLING_ADDITIONAL_CAPACITY_UNITS)
  })
  .strict();

export const CreateProjectBodySchema = z
  .object({
    name: z.string().min(1).max(120),
    slug: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    environment_default: z.string().min(1).max(50).default("production")
  })
  .strict();

export const UpdateProjectBodySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    slug: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
    environment_default: z.string().min(1).max(50).optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "update_requires_changes"
  });

export const CreateProjectInviteBodySchema = z
  .object({
    email: z.string().email(),
    role: z.enum(["admin", "member"]).default("member")
  })
  .strict();

export const UpdateProjectMemberRoleBodySchema = z
  .object({
    role: z.enum(["admin", "member"])
  })
  .strict();

export const CreateTokenBodySchema = z
  .object({
    label: z.string().min(1).max(120)
  })
  .strict();

export const LogsQuerySchema = z
  .object({
    incident_id: z.string().min(1),
    level: z.string().min(1).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();

export const LogsCursorSchema = z
  .object({
    occurred_at: z.string().datetime(),
    event_id: z.string().uuid()
  })
  .strict();
