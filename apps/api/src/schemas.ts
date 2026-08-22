import { GITHUB_OAUTH_ISSUER } from "../../../packages/auth/src/index.js";
import {
  MAX_BILLING_ADDITIONAL_CAPACITY_UNITS,
  ProjectColorTagSchema
} from "../../../packages/shared-types/src/index.js";
import { z } from "zod";

// Providers may extend redirect query strings. Validate fields we consume and strip everything else.
function thirdPartyCallbackQuerySchema<Shape extends z.ZodRawShape>(
  shape: Shape
): z.ZodObject<Shape> {
  return z.object(shape).strip();
}

export const RequestedTrialPlanSchema = z.enum(["solo", "team"]);

export const IngestionRequestSchema = z
  .object({
    events: z.array(z.unknown())
  })
  .strict();

export const RequestEmailCodeBodySchema = z
  .object({
    email: z.string().email(),
    accepted_terms: z.literal(true),
    requested_trial_plan: RequestedTrialPlanSchema.optional()
  })
  .strict();

export const VerifyEmailCodeBodySchema = z
  .object({
    email: z.string().email(),
    code: z.string().regex(/^\d{6}$/, "otp_code_invalid"),
    requested_trial_plan: RequestedTrialPlanSchema.optional()
  })
  .strict();

export const ReviewAccessQuerySchema = z
  .object({
    token: z.string().min(1),
    next: z.string().min(1).optional()
  })
  .strict();

export const SendSystemEmailPreviewBodySchema = z
  .object({
    id: z.string().min(1)
  })
  .strict();

const AccountDeleteConfirmationTextSchema = z.string().min(1).max(64);

export const AccountDeleteBodySchema = z
  .object({
    confirmation_text: AccountDeleteConfirmationTextSchema,
    otp: z.string().regex(/^\d{6}$/, "otp_code_invalid")
  })
  .strict();

export const AccountDeleteRequestOtpBodySchema = z
  .object({
    confirmation_text: AccountDeleteConfirmationTextSchema
  })
  .strict();

export const AcceptInviteBodySchema = z
  .object({
    token: z.string().min(1)
  })
  .strict();

export const GithubAuthCallbackQuerySchema = thirdPartyCallbackQuerySchema({
  code: z.string().min(1),
  state: z.string().min(1),
  iss: z.literal(GITHUB_OAUTH_ISSUER).optional()
});

export const GithubMockAuthorizeQuerySchema = z
  .object({
    client_id: z.string().min(1).optional(),
    redirect_uri: z.string().url(),
    scope: z.string().min(1).optional(),
    state: z.string().min(1)
  })
  .strict();

export const GithubSignupStartQuerySchema = z
  .object({
    trial: RequestedTrialPlanSchema.optional()
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

export const GitHubAppCallbackQuerySchema = thirdPartyCallbackQuerySchema({
  installation_id: z.coerce.number().int().positive(),
  setup_action: z.enum(["install", "update", "request"]).optional(),
  state: z.string().min(1).optional()
});

export const GitHubAppInstallUrlQuerySchema = z
  .object({
    return_to: z.string().min(1).optional()
  })
  .strict();

export const SlackAppCallbackQuerySchema = thirdPartyCallbackQuerySchema({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional()
});

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

export const GitHubDispatchIncidentStatusSchema = z.enum([
  "new_only",
  "reopened_only",
  "new_or_reopened"
]);

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

export const GitHubDispatchDeliveryStatusSchema = z.enum([
  "pending",
  "retrying",
  "delivered",
  "failed",
  "skipped"
]);

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
    void new Intl.DateTimeFormat("en-US", { timeZone: value }).format(
      new Date("2026-03-15T00:00:00.000Z")
    );
    return true;
  } catch {
    return false;
  }
}

const WeeklyReportScheduleSchema = z
  .object({
    day_of_week: WeeklyReportScheduleDayOfWeekSchema,
    hour_of_day: z.coerce.number().int().min(0).max(23),
    timezone: z
      .string()
      .min(1)
      .refine((value) => isValidTimeZone(value), "invalid_timezone")
  })
  .strict();

const WeeklyReportEmailConfigSchema = z
  .object({
    to: z.array(z.string().email()).min(1).max(3)
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
export const AlertSeverityLifecycleScopeSchema = z.enum(["new_incident", "incident_regressed", "both"]);

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
  severity_lifecycle_scope: AlertSeverityLifecycleScopeSchema.optional(),
  cooldown_seconds: z.coerce.number().int().min(0).max(604800).default(0),
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
  severity_lifecycle_scope: AlertSeverityLifecycleScopeSchema.nullable().optional(),
  cooldown_seconds: z.coerce.number().int().min(0).max(604800).optional(),
  is_enabled: z.boolean().optional()
} as const;

export const UpdateAlertBodySchema = z
  .union([
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
  .refine(
    (value) =>
      !Object.prototype.hasOwnProperty.call(value, "config") || value.channel !== undefined,
    {
      message: "channel_required_for_config"
    }
  );

export const IncidentsQuerySchema = z
  .object({
    project_id: z.string().uuid().optional(),
    environment: z.string().min(1).optional(),
    service: z.string().min(1).optional(),
    status: z.enum(["active", "open", "resolved", "regressed"]).optional(),
    severity: z.enum(["low", "medium", "high", "critical"]).optional(),
    first_seen_after: z.string().datetime().optional(),
    attention_after: z.string().datetime().optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();

export const ImprovementsQuerySchema = z
  .object({
    project_id: z.string().uuid().optional(),
    environment: z.string().min(1).optional(),
    service: z.string().min(1).optional(),
    status: z.enum(["open", "resolved", "snoozed"]).optional(),
    severity: z.enum(["low", "medium", "high", "critical"]).optional(),
    kind: z
      .enum([
        "warning_hotspot",
        "slow_request",
        "request_failure_pattern",
        "recurring_incident",
        "post_deploy_regression"
      ])
      .optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();

export const BulkIncidentMutationBodySchema = z
  .object({
    incident_ids: z.array(z.string().uuid()).min(1).max(1000)
  })
  .strict();

export const IncidentsCursorSchema = z
  .object({
    last_seen_at: z.string().datetime(),
    incident_id: z.string().uuid()
  })
  .strict();

export const ImprovementsCursorSchema = z
  .object({
    last_detected_at: z.string().datetime(),
    improvement_id: z.string().min(1)
  })
  .strict();

export const ImprovementSnoozeBodySchema = z
  .object({
    snoozed_until: z.string().datetime()
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
    id: z.string().uuid()
  })
  .strict();

export const ImprovementParamsSchema = z
  .object({
    id: z.string().min(1)
  })
  .strict();

export const ProjectParamsSchema = z
  .object({
    id: z.string().uuid()
  })
  .strict();

export const ProjectCaptureRuleParamsSchema = z
  .object({
    id: z.string().uuid(),
    ruleId: z.string().uuid()
  })
  .strict();

export const ProjectAvailabilityCheckParamsSchema = z
  .object({
    id: z.string().uuid(),
    checkId: z.string().uuid()
  })
  .strict();

export const ProjectImprovementParamsSchema = z
  .object({
    id: z.string().uuid(),
    improvementId: z.string().min(1)
  })
  .strict();

export const ProjectScopedQuerySchema = z
  .object({
    project_id: z.string().uuid()
  })
  .strict();

export const OptionalProjectScopedQuerySchema = z
  .object({
    project_id: z.string().uuid().optional()
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
    ttl_seconds: z.coerce.number().int().min(60).max(3600),
    trigger_ttl_seconds: z.coerce.number().int().min(60).max(86400).optional()
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

const AvailabilityCheckBodyShape = {
  name: z.string().min(1).max(120),
  url: z.string().url(),
  method: z.enum(["GET", "HEAD"]).default("GET"),
  expected_status_min: z.coerce.number().int().min(100).max(599).default(200),
  expected_status_max: z.coerce.number().int().min(100).max(599).default(399),
  timeout_ms: z.coerce.number().int().min(500).max(5000).default(2500),
  interval_seconds: z.coerce.number().int().min(30).max(86400),
  failure_threshold: z.coerce.number().int().min(1).max(10).default(3),
  recovery_threshold: z.coerce.number().int().min(1).max(10).default(2),
  environment: z.string().min(1).max(50).optional(),
  service_name: z.string().min(1).max(120).nullable().optional(),
  enabled: z.boolean().default(true)
} as const;

const AvailabilityCheckBodyBaseObjectSchema = z
  .object({
    ...AvailabilityCheckBodyShape
  })
  .strict();

const AvailabilityCheckBodyBaseSchema = AvailabilityCheckBodyBaseObjectSchema.refine(
  (value) => value.expected_status_min <= value.expected_status_max,
  {
    message: "expected_status_range_invalid"
  }
);

export const AvailabilityCheckCreateBodySchema = AvailabilityCheckBodyBaseSchema;

export const AvailabilityCheckUpdateBodySchema = z
  .object({
    ...AvailabilityCheckBodyShape
  })
  .partial()
  .strict()
  .refine((value: Record<string, unknown>) => Object.keys(value).length > 0, {
    message: "update_requires_changes"
  })
  .refine(
    (value) =>
      value.expected_status_min === undefined ||
      value.expected_status_max === undefined ||
      value.expected_status_min <= value.expected_status_max,
    {
      message: "expected_status_range_invalid"
    }
  );

export const AvailabilityCheckTestBodySchema = z
  .object({
    url: z.string().url(),
    method: z.enum(["GET", "HEAD"]).default("GET"),
    expected_status_min: z.coerce.number().int().min(100).max(599).default(200),
    expected_status_max: z.coerce.number().int().min(100).max(599).default(399),
    timeout_ms: z.coerce.number().int().min(500).max(5000).default(2500)
  })
  .strict()
  .refine((value) => value.expected_status_min <= value.expected_status_max, {
    message: "expected_status_range_invalid"
  });

export const ProjectsQuerySchema = TokenListQuerySchema;

export const BillingCheckoutBodySchema = z
  .object({
    target_plan: RequestedTrialPlanSchema
  })
  .strict();

export const BillingTrialStartBodySchema = z
  .object({
    target_plan: RequestedTrialPlanSchema
  })
  .strict();

export const BillingCheckoutConfirmBodySchema = z
  .object({
    session_id: z.string().min(1).max(255)
  })
  .strict();

export const BillingCapacityChangeBodySchema = z
  .object({
    target_additional_capacity_units: z.coerce
      .number()
      .int()
      .min(0)
      .max(MAX_BILLING_ADDITIONAL_CAPACITY_UNITS)
  })
  .strict();

export const AdminBillingOverrideBodySchema = z
  .object({
    organization_id: z.string().uuid().optional(),
    plan: z.enum(["free", "solo", "team"]),
    additional_capacity_units: z.coerce
      .number()
      .int()
      .min(0)
      .max(MAX_BILLING_ADDITIONAL_CAPACITY_UNITS),
    reason: z.string().min(3).max(500)
  })
  .strict();

export const CreateProjectBodySchema = z
  .object({
    name: z.string().min(1).max(120),
    slug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    environment_default: z.string().min(1).max(50).default("production"),
    color_tag: ProjectColorTagSchema.nullable().default(null),
    weekly_report_timezone: z
      .string()
      .min(1)
      .default("UTC")
      .refine((value) => isValidTimeZone(value), "invalid_timezone")
  })
  .strict();

export const UpdateProjectBodySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    slug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    environment_default: z.string().min(1).max(50).optional(),
    color_tag: ProjectColorTagSchema.nullable().optional()
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

export const CreateProjectTokenBodySchema = z
  .object({
    label: z.string().min(1).max(120),
    allowed_origins: z.array(z.string().min(1).max(2048)).max(20).optional()
  })
  .strict();

export const LogsQuerySchema = z
  .object({
    incident_id: z.string().uuid(),
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
