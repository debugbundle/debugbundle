import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { SESSION_COOKIE_NAME } from "../../../packages/auth/src/index.js";
import {
  AlertListResponseSchema,
  AlertResponseSchema,
} from "../../../packages/alert-client/src/index.js";
import {
  BillingSummaryResponseSchema,
} from "../../../packages/billing-client/src/index.js";
import {
  BundleV1Schema,
  CapturePolicyResponseSchema as SharedCapturePolicyResponseSchema,
  CapturePolicyUpdateSchema,
  EventEnvelopeSchema,
  ImprovementSettingsResponseSchema,
  ImprovementSettingsUpdateSchema,
  ResolvedCapturePolicySchema as SharedResolvedCapturePolicySchema,
} from "../../../packages/shared-types/src/index.js";
import {
  DeletedProjectRecordSchema,
  ProjectCreateResponseSchema,
  ProjectDeleteResponseSchema,
  ProjectListResponseSchema,
} from "../../../packages/project-management-client/src/index.js";
import {
  IncidentResponseSchema,
  IncidentsResponseSchema,
  ImprovementResponseSchema,
  ImprovementsResponseSchema,
  LogsResponseSchema,
  ReproductionResponseSchema,
  ServicesResponseSchema,
} from "../../../packages/retrieval-client/src/index.js";
import {
  TokenCreateResponseSchema,
  TokenListResponseSchema,
} from "../../../packages/token-management/src/index.js";
import {
  RetryWebhookDeliveryResponseSchema,
  WebhookCreateResponseSchema,
  WebhookDeliveriesResponseSchema,
  WebhookResponseSchema,
  WebhookTestResponseSchema,
  WebhookListResponseSchema,
} from "../../../packages/webhook-client/src/index.js";
import {
  WeeklyReportChannelListResponseSchema,
  WeeklyReportChannelResponseSchema,
} from "../../../packages/weekly-report-client/src/index.js";
import {
  AccountDeleteBodySchema,
  AcceptInviteBodySchema,
  AlertsQuerySchema,
  BillingCheckoutBodySchema,
  BillingCheckoutConfirmBodySchema,
  BillingCapacityChangeBodySchema,
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
  ProjectParamsSchema,
  ProjectImprovementParamsSchema,
  ProjectScopedQuerySchema,
  ProjectSlackDestinationDeleteParamsSchema,
  ProjectsQuerySchema,
  ProjectTokenParamsSchema,
  ProbeActivateBodySchema,
  ProbeDeactivateBodySchema,
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
  WeeklyReportChannelsQuerySchema,
} from "./schemas.js";

type JsonSchemaDocument = Record<string, unknown>;
type SecurityRequirement = Record<string, []>;

type SchemaComponent = {
  name: string;
  schema: unknown;
};

type SchemaSpec =
  | SchemaComponent
  | {
      oneOf: SchemaComponent[];
    };

type ResponseSpec = {
  description: string;
  schema?: SchemaSpec;
  headers?: Record<string, { description: string; schema: unknown }>;
};

type OperationSpec = {
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

const browserSessionSecurity: SecurityRequirement = { browserSession: [] };
const memberBearerTokenSecurity: SecurityRequirement = { memberBearerToken: [] };
const projectBearerTokenSecurity: SecurityRequirement = { projectBearerToken: [] };

const anyMemberAuth = [browserSessionSecurity, memberBearerTokenSecurity];
const browserSessionAuth = [browserSessionSecurity];
const memberBearerAuth = [memberBearerTokenSecurity];
const projectBearerAuth = [projectBearerTokenSecurity];

const ApiErrorSchema = z.object({ error: z.string() }).strict();
const SuccessResponseSchema = z.object({ success: z.boolean() }).strict();
const BillingLinkResponseSchema = z.object({ url: z.string().url() }).strict();
const BundleFailureStatusSchema = z.object({ status: z.literal("failed"), reason: z.string() }).strict();
const ProjectInviteMembershipSchema = z
  .object({
    project_id: z.string(),
    user_id: z.string(),
    role: z.enum(["owner", "admin", "member"]),
    membership_type: z.enum(["owner", "collaborator"]).optional(),
  })
  .strict();
const AcceptInviteResponseSchema = z.object({ membership: ProjectInviteMembershipSchema }).strict();
const WebSessionSchema = z
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
        github: z.boolean(),
      })
      .strict(),
  })
  .strict();
const SessionResponseSchema = z.object({ session: WebSessionSchema.nullable() }).strict();
const GithubDeviceStartResponseSchema = z
  .object({
    request_id: z.string().uuid(),
    user_code: z.string(),
    verification_uri: z.string().url(),
    interval_seconds: z.number().int().positive(),
    expires_at: z.string().datetime()
  })
  .strict();
const GithubDevicePollResponseSchema = z.discriminatedUnion("status", [
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
const AccountStoredArtifactSchema = z
  .object({
    key: z.string(),
    content: z.unknown(),
  })
  .strict();
const AccountExportResponseSchema = z
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
    project_github_repos: z.array(z.record(z.string(), z.unknown())),
    github_dispatch_rules: z.array(z.record(z.string(), z.unknown())),
    github_dispatch_deliveries: z.array(z.record(z.string(), z.unknown())),
    org_usage_counters: z.array(z.record(z.string(), z.unknown())),
    processed_billing_events: z.array(z.record(z.string(), z.unknown())),
    operational_email_deliveries: z.array(z.record(z.string(), z.unknown())),
    audit_logs: z.array(z.record(z.string(), z.unknown())),
    artifacts: z
      .object({
        raw_events: z.array(AccountStoredArtifactSchema),
        bundles: z.array(AccountStoredArtifactSchema),
        reproductions: z.array(AccountStoredArtifactSchema),
      })
      .strict(),
  })
  .strict();
const AccountDeletionResponseSchema = z
  .object({
    account: z
      .object({
        deleted_at: z.string().datetime(),
        organization_id: z.string(),
        deleted_project_ids: z.array(z.string()),
        user_deleted: z.boolean(),
        deleted_member_token_count: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
const SlackDestinationSchema = z
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
    updated_at: z.string().datetime(),
  })
  .strict();
const SlackInstallUrlResponseSchema = z
  .object({
    install_url: z.string().url(),
  })
  .strict();
const SlackDestinationListResponseSchema = z
  .object({
    destinations: z.array(SlackDestinationSchema),
  })
  .strict();
const SlackDestinationTestResponseSchema = z
  .object({
    delivered: z.literal(true),
  })
  .strict();
const ProjectMemberSchema = z
  .object({
    user_id: z.string(),
    email: z.string().email(),
    role: z.enum(["owner", "admin", "member"]),
    membership_type: z.enum(["owner", "collaborator"]),
    avatar_url: z.string().min(1).nullable(),
    created_at: z.string().datetime(),
  })
  .strict();
const AccountAvatarImportResponseSchema = z
  .object({
    avatar: z
      .object({
        source: z.enum(["github", "gravatar"]),
        avatar_url: z.string().min(1),
        updated_at: z.string().datetime(),
      })
      .strict(),
  })
  .strict();
const ProjectInviteSchema = z
  .object({
    invite_id: z.string().uuid(),
    project_id: z.string(),
    email: z.string().email(),
    role: z.enum(["admin", "member"]),
    invited_by_user_id: z.string(),
    accepted_at: z.string().datetime().nullable(),
    canceled_at: z.string().datetime().nullable(),
    expires_at: z.string().datetime(),
    created_at: z.string().datetime(),
  })
  .strict();
const ProjectMemberListResponseSchema = z.object({ members: z.array(ProjectMemberSchema) }).strict();
const ProjectMemberResponseSchema = z.object({ member: ProjectMemberSchema }).strict();
const ProjectInviteListResponseSchema = z.object({ invites: z.array(ProjectInviteSchema) }).strict();
const ProjectInviteResponseSchema = z.object({ invite: ProjectInviteSchema }).strict();
const ProjectUpdateResponseSchema = z.object({ project: DeletedProjectRecordSchema.extend({ metrics: z.object({
  monthly_bundle_requests: z.number().int().nonnegative(),
  monthly_raw_ingested_events: z.number().int().nonnegative(),
  retained_bundles: z.number().int().nonnegative(),
  monthly_alert_deliveries: z.number().int().nonnegative(),
}).strict() }) }).strict();
const ProbeActivationSchema = z
  .object({
    activation_id: z.string().uuid(),
    label_pattern: z.string(),
    service: z.string(),
    environment: z.string(),
    expires_at: z.string().datetime(),
    trigger_expires_at: z.string().datetime(),
  })
  .strict();
const ProbeActivationResponseSchema = z
  .object({
    activation: ProbeActivationSchema,
    trigger_token: z.string(),
  })
  .strict();
const ProbeActivationListResponseSchema = z.object({ activations: z.array(ProbeActivationSchema) }).strict();
const ProbeDeactivationResponseSchema = z
  .object({
    deactivated: z.object({ activation_id: z.string().uuid(), deactivated_at: z.string().datetime() }).strict(),
  })
  .strict();
const ResolvedCapturePolicySchema = SharedResolvedCapturePolicySchema;
const CapturePolicyResponseSchema = SharedCapturePolicyResponseSchema;
const SdkConfigResponseSchema = z
  .object({
    probes_enabled: z.boolean(),
    remote_probes_enabled: z.boolean(),
    active_probes: z.array(ProbeActivationSchema),
    poll_interval_ms: z.number().int().nonnegative(),
    capture_policy: ResolvedCapturePolicySchema,
    trigger_token_key: z.string().optional(),
  })
  .strict();
const IngestionErrorSchema = z.object({ index: z.number().int(), reason: z.string() }).strict();
const IngestionAcceptedResponseSchema = z
  .object({
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    errors: z.array(IngestionErrorSchema),
    retry_after_ms: z.number().int().positive().optional(),
    probe_directives: z
      .object({
        active_probes: z.array(ProbeActivationSchema),
      })
      .optional(),
  })
  .strict();
const OpenApiIngestionRequestSchema = z.object({ events: z.array(EventEnvelopeSchema) }).strict();
const HealthResponseSchema = z.object({ status: z.literal("ok"), version: z.string(), uptime: z.number() }).strict();
const ReadyResponseSchema = z.object({ status: z.literal("ready") }).strict();
const NotReadyResponseSchema = z.object({ status: z.literal("not_ready"), reason: z.string() }).strict();
const LiveResponseSchema = z.object({ status: z.literal("live") }).strict();

function component(name: string, schema: unknown): SchemaComponent {
  return { name, schema };
}

function toJsonSchema(schema: unknown): JsonSchemaDocument {
  const document = zodToJsonSchema(schema as never, {
    target: "jsonSchema2019-09",
    $refStrategy: "none",
    definitionPath: "$defs",
  }) as JsonSchemaDocument;

  delete document["$schema"];
  return document;
}

function buildParameters(schema: unknown, location: "path" | "query"): Array<Record<string, unknown>> {
  const jsonSchema = toJsonSchema(schema) as {
    properties?: Record<string, JsonSchemaDocument>;
    required?: string[];
  };
  const required = new Set(jsonSchema.required ?? []);

  return Object.entries(jsonSchema.properties ?? {}).map(([name, propertySchema]) => ({
    name,
    in: location,
    required: location === "path" ? true : required.has(name),
    schema: propertySchema,
  }));
}

function resolveSchemaSpec(
  schema: SchemaSpec,
  components: Map<string, JsonSchemaDocument>
): JsonSchemaDocument {
  if ("oneOf" in schema) {
    return {
      oneOf: schema.oneOf.map((entry) => resolveSchemaSpec(entry, components)),
    };
  }

  if (!components.has(schema.name)) {
    components.set(schema.name, toJsonSchema(schema.schema));
  }

  return { $ref: `#/components/schemas/${schema.name}` };
}

function buildPublicApiOperations(): OperationSpec[] {
  const apiError = component("ApiError", ApiErrorSchema);
  const successResponse = component("SuccessResponse", SuccessResponseSchema);
  const sessionResponse = component("SessionResponse", SessionResponseSchema);
  const githubDeviceStartResponse = component("GithubDeviceStartResponse", GithubDeviceStartResponseSchema);
  const githubDevicePollResponse = component("GithubDevicePollResponse", GithubDevicePollResponseSchema);
  const acceptInviteResponse = component("AcceptInviteResponse", AcceptInviteResponseSchema);
  const accountExportResponse = component("AccountExportResponse", AccountExportResponseSchema);
  const accountDeletionResponse = component("AccountDeletionResponse", AccountDeletionResponseSchema);
  const avatarImageResponse = component("AvatarImageResponse", z.string());
  const ingestionRequest = component("IngestionRequest", OpenApiIngestionRequestSchema);
  const ingestionResponse = component("IngestionAcceptedResponse", IngestionAcceptedResponseSchema);
  const incidentListResponse = component("IncidentListResponse", IncidentsResponseSchema);
  const incidentResponse = component("IncidentResponse", IncidentResponseSchema);
  const improvementListResponse = component("ImprovementListResponse", ImprovementsResponseSchema);
  const improvementResponse = component("ImprovementResponse", ImprovementResponseSchema);
  const improvementSnoozeBody = component("ImprovementSnoozeBody", ImprovementSnoozeBodySchema);
  const bundleResponse = component("BundleDocument", BundleV1Schema);
  const bundlePending = component("PendingStatus", z.object({ status: z.literal("pending") }).strict());
  const bundleFailed = component("BundleFailedStatus", BundleFailureStatusSchema);
  const reproductionResponse = component("ReproductionResponse", ReproductionResponseSchema);
  const logsResponse = component("LogsResponse", LogsResponseSchema);
  const servicesResponse = component("ServicesResponse", ServicesResponseSchema);
  const memberListResponse = component("ProjectMemberListResponse", ProjectMemberListResponseSchema);
  const inviteListResponse = component("ProjectInviteListResponse", ProjectInviteListResponseSchema);
  const inviteResponse = component("ProjectInviteResponse", ProjectInviteResponseSchema);
  const memberResponse = component("ProjectMemberResponse", ProjectMemberResponseSchema);
  const projectListResponse = component("ProjectListResponse", ProjectListResponseSchema);
  const projectCreateResponse = component("ProjectCreateResponse", ProjectCreateResponseSchema);
  const projectUpdateResponse = component("ProjectUpdateResponse", ProjectUpdateResponseSchema);
  const projectDeleteResponse = component("ProjectDeleteResponse", ProjectDeleteResponseSchema);
  const slackInstallUrlResponse = component("SlackInstallUrlResponse", SlackInstallUrlResponseSchema);
  const slackDestinationListResponse = component("SlackDestinationListResponse", SlackDestinationListResponseSchema);
  const slackDestinationTestResponse = component("SlackDestinationTestResponse", SlackDestinationTestResponseSchema);
  const billingSummaryResponse = component("BillingSummaryResponse", BillingSummaryResponseSchema);
  const billingLinkResponse = component("BillingLinkResponse", BillingLinkResponseSchema);
  const tokenListResponse = component("TokenListResponse", TokenListResponseSchema);
  const tokenResponse = component("TokenResponse", TokenCreateResponseSchema);
  const alertsResponse = component("AlertListResponse", AlertListResponseSchema);
  const alertResponse = component("AlertResponse", AlertResponseSchema);
  const weeklyReportChannelsResponse = component("WeeklyReportChannelListResponse", WeeklyReportChannelListResponseSchema);
  const weeklyReportChannelResponse = component("WeeklyReportChannelResponse", WeeklyReportChannelResponseSchema);
  const webhookListResponse = component("WebhookListResponse", WebhookListResponseSchema);
  const webhookResponse = component("WebhookResponse", WebhookResponseSchema);
  const webhookCreateResponse = component("WebhookCreateResponse", WebhookCreateResponseSchema);
  const webhookDeliveriesResponse = component("WebhookDeliveriesResponse", WebhookDeliveriesResponseSchema);
  const webhookTestResponse = component("WebhookTestResponse", WebhookTestResponseSchema);
  const webhookRetryResponse = component("WebhookRetryResponse", RetryWebhookDeliveryResponseSchema);
  const probeActivationResponse = component("ProbeActivationResponse", ProbeActivationResponseSchema);
  const probeActivationListResponse = component("ProbeActivationListResponse", ProbeActivationListResponseSchema);
  const probeDeactivationResponse = component("ProbeDeactivationResponse", ProbeDeactivationResponseSchema);
  const capturePolicyUpdate = component("CapturePolicyUpdate", CapturePolicyUpdateSchema);
  const capturePolicyResponse = component("CapturePolicyResponse", CapturePolicyResponseSchema);
  const improvementSettingsUpdate = component("ImprovementSettingsUpdate", ImprovementSettingsUpdateSchema);
  const improvementSettingsResponse = component("ImprovementSettingsResponse", ImprovementSettingsResponseSchema);
  const sdkConfigResponse = component("SdkConfigResponse", SdkConfigResponseSchema);
  const healthResponse = component("HealthResponse", HealthResponseSchema);
  const readyResponse = component("ReadyResponse", ReadyResponseSchema);
  const notReadyResponse = component("NotReadyResponse", NotReadyResponseSchema);
  const liveResponse = component("LiveResponse", LiveResponseSchema);

  return [
    {
      method: "get",
      path: "/health",
      operationId: "getHealth",
      summary: "Get service health",
      tags: ["System"],
      responses: { "200": { description: "Current health status.", schema: healthResponse } },
    },
    {
      method: "get",
      path: "/ready",
      operationId: "getReadiness",
      summary: "Get readiness status",
      tags: ["System"],
      responses: {
        "200": { description: "Current readiness status.", schema: readyResponse },
        "503": { description: "A required runtime dependency is unavailable.", schema: notReadyResponse }
      },
    },
    {
      method: "get",
      path: "/live",
      operationId: "getLiveness",
      summary: "Get liveness status",
      tags: ["System"],
      responses: { "200": { description: "Current liveness status.", schema: liveResponse } },
    },
    {
      method: "post",
      path: "/v1/auth/request-code",
      operationId: "requestEmailCode",
      summary: "Request a one-time email code",
      tags: ["Auth"],
      requestBody: component("RequestEmailCodeBody", RequestEmailCodeBodySchema),
      responses: {
        "200": { description: "Email code request accepted.", schema: successResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "429": { description: "Too many auth attempts from this IP.", schema: apiError },
        "503": { description: "Auth is not configured.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/auth/verify-code",
      operationId: "verifyEmailCode",
      summary: "Verify a one-time email code and create a browser session",
      tags: ["Auth"],
      requestBody: component("VerifyEmailCodeBody", VerifyEmailCodeBodySchema),
      responses: {
        "200": { description: "Browser session created.", schema: sessionResponse },
        "400": { description: "Invalid code or request body.", schema: apiError },
        "429": { description: "Too many auth attempts from this IP.", schema: apiError },
        "503": { description: "Auth is not configured.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/auth/github/start",
      operationId: "startGithubLogin",
      summary: "Start GitHub OAuth",
      tags: ["Auth"],
      responses: {
        "302": {
          description: "Redirects to GitHub authorization.",
          headers: {
            Location: { description: "GitHub authorization URL.", schema: z.string().url() },
          },
        },
        "503": { description: "Auth is not configured.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/auth/github/callback",
      operationId: "completeGithubLogin",
      summary: "Complete GitHub OAuth",
      tags: ["Auth"],
      query: GithubAuthCallbackQuerySchema,
      responses: {
        "302": {
          description: "Redirects back to the application callback URL.",
          headers: {
            Location: { description: "Application redirect URL.", schema: z.string().url() },
          },
        },
        "400": { description: "Invalid callback query.", schema: apiError },
        "503": { description: "Auth is not configured.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/auth/github/device/start",
      operationId: "startGithubDeviceLogin",
      summary: "Start GitHub device login",
      tags: ["Auth"],
      requestBody: component("GithubDeviceStartBody", GithubDeviceStartBodySchema),
      responses: {
        "200": { description: "GitHub device authorization created.", schema: githubDeviceStartResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "429": { description: "Too many auth attempts from this IP.", schema: apiError },
        "503": { description: "GitHub device auth is unavailable.", schema: apiError }
      }
    },
    {
      method: "post",
      path: "/v1/auth/github/device/poll",
      operationId: "pollGithubDeviceLogin",
      summary: "Poll GitHub device login status",
      tags: ["Auth"],
      requestBody: component("GithubDevicePollBody", GithubDevicePollBodySchema),
      responses: {
        "200": { description: "Current GitHub device authorization status.", schema: githubDevicePollResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "404": { description: "Device authorization request was not found.", schema: apiError },
        "429": { description: "Too many auth attempts from this IP.", schema: apiError },
        "503": { description: "GitHub device auth is unavailable.", schema: apiError }
      }
    },
    {
      method: "post",
      path: "/v1/auth/github/device/claim",
      operationId: "claimGithubDeviceLogin",
      summary: "Claim the member token issued by GitHub device login",
      tags: ["Auth"],
      requestBody: component("GithubDeviceClaimBody", GithubDeviceClaimBodySchema),
      responses: {
        "200": { description: "Member token issued.", schema: tokenResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "404": { description: "Device authorization request was not found.", schema: apiError },
        "409": { description: "Device authorization is not claimable.", schema: apiError },
        "429": { description: "Too many auth attempts from this IP.", schema: apiError },
        "503": { description: "GitHub device auth is unavailable.", schema: apiError }
      }
    },
    {
      method: "post",
      path: "/v1/auth/github/token/exchange",
      operationId: "exchangeGithubAccessToken",
      summary: "Exchange a GitHub access token for a DebugBundle member token",
      tags: ["Auth"],
      requestBody: component("GithubTokenExchangeBody", GithubTokenExchangeBodySchema),
      responses: {
        "200": { description: "Member token issued.", schema: tokenResponse },
        "400": { description: "Invalid request body or missing GitHub email.", schema: apiError },
        "401": { description: "GitHub access token is invalid.", schema: apiError },
        "403": { description: "GitHub identity cannot bootstrap this account.", schema: apiError },
        "429": { description: "Too many auth attempts from this IP.", schema: apiError },
        "503": { description: "GitHub auth is unavailable.", schema: apiError }
      }
    },
    {
      method: "get",
      path: "/v1/auth/session",
      operationId: "getSession",
      summary: "Resolve the current browser session",
      tags: ["Auth"],
      security: browserSessionAuth,
      responses: {
        "200": { description: "Current browser session or null when signed out.", schema: sessionResponse },
        "503": { description: "Auth is not configured.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/auth/logout",
      operationId: "logout",
      summary: "Revoke the current browser session",
      tags: ["Auth"],
      security: browserSessionAuth,
      responses: {
        "200": { description: "Browser session revoked.", schema: successResponse },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "503": { description: "Auth is not configured.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/auth/project-invite/accept",
      operationId: "acceptInvite",
      summary: "Accept a project invite",
      tags: ["Auth"],
      security: browserSessionAuth,
      requestBody: component("AcceptInviteBody", AcceptInviteBodySchema),
      responses: {
        "200": { description: "Invite accepted.", schema: acceptInviteResponse },
        "400": { description: "Invalid invite token or payload.", schema: apiError },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "403": { description: "Invite email does not match the signed-in account.", schema: apiError },
        "503": { description: "Auth is not configured.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/account/export",
      operationId: "exportAccount",
      summary: "Export retained organization account data",
      tags: ["Account"],
      security: browserSessionAuth,
      responses: {
        "200": { description: "Account export JSON attachment.", schema: accountExportResponse },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "403": { description: "Owner access is required.", schema: apiError },
        "404": { description: "Account export was not available.", schema: apiError },
        "503": { description: "Account management is not configured.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/account/avatar",
      operationId: "getAccountAvatar",
      summary: "Get the current account avatar image",
      tags: ["Account"],
      security: browserSessionAuth,
      responses: {
        "200": { description: "Avatar image bytes.", schema: avatarImageResponse },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "404": { description: "Avatar was not found.", schema: apiError },
        "503": { description: "Account management is not configured.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/account/avatar/import-gravatar",
      operationId: "importAccountAvatarFromGravatar",
      summary: "Import and cache a Gravatar avatar for the signed-in account",
      tags: ["Account"],
      security: browserSessionAuth,
      responses: {
        "200": { description: "Avatar imported and cached.", schema: component("AccountAvatarImportResponse", AccountAvatarImportResponseSchema) },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "404": { description: "No Gravatar image was found.", schema: apiError },
        "502": { description: "Avatar import failed.", schema: apiError },
        "503": { description: "Account management is not configured.", schema: apiError },
      },
    },
    {
      method: "delete",
      path: "/v1/account",
      operationId: "deleteAccount",
      summary: "Delete the current organization account",
      tags: ["Account"],
      security: browserSessionAuth,
      requestBody: component("AccountDeleteBody", AccountDeleteBodySchema),
      responses: {
        "200": { description: "Account deleted.", schema: accountDeletionResponse },
        "400": { description: "Invalid confirmation payload.", schema: apiError },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "403": { description: "Owner access is required.", schema: apiError },
        "404": { description: "Account was not found.", schema: apiError },
        "409": { description: "Other owner-scoped organizations still exist.", schema: apiError },
        "503": { description: "Account management is not configured.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/events",
      operationId: "ingestEvents",
      summary: "Ingest batched events",
      tags: ["Ingestion"],
      security: projectBearerAuth,
      requestBody: ingestionRequest,
      responses: {
        "202": { description: "Events accepted for processing.", schema: ingestionResponse },
        "400": { description: "Malformed ingestion payload.", schema: ingestionResponse },
        "401": { description: "Project token is invalid.", schema: ingestionResponse },
        "429": {
          description: "Rate limit or monthly ingestion quota exceeded.",
          schema: ingestionResponse,
          headers: {
            "Retry-After": { description: "Seconds until the caller should retry.", schema: z.string() },
          },
        },
      },
    },
    {
      method: "get",
      path: "/v1/incidents",
      operationId: "listIncidents",
      summary: "List incidents",
      tags: ["Incidents"],
      security: memberBearerAuth,
      query: IncidentsQuerySchema,
      responses: {
        "200": { description: "Incident list.", schema: incidentListResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/incidents/{id}",
      operationId: "getIncident",
      summary: "Get a single incident",
      tags: ["Incidents"],
      security: memberBearerAuth,
      params: IncidentParamsSchema,
      responses: {
        "200": { description: "Incident details.", schema: incidentResponse },
        "400": { description: "Invalid incident id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Incident was not found.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/incidents/{id}/resolve",
      operationId: "resolveIncident",
      summary: "Resolve an incident",
      tags: ["Incidents"],
      security: memberBearerAuth,
      params: IncidentParamsSchema,
      responses: {
        "200": { description: "Resolved incident details.", schema: incidentResponse },
        "400": { description: "Invalid incident id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Incident was not found.", schema: apiError },
        "500": { description: "Incident resolution is unavailable.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/incidents/{id}/reopen",
      operationId: "reopenIncident",
      summary: "Reopen an incident",
      tags: ["Incidents"],
      security: memberBearerAuth,
      params: IncidentParamsSchema,
      responses: {
        "200": { description: "Reopened incident details.", schema: incidentResponse },
        "400": { description: "Invalid incident id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Incident was not found.", schema: apiError },
        "500": { description: "Incident reopen is unavailable.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/incidents/{id}/bundle",
      operationId: "getBundle",
      summary: "Get the generated bundle for an incident",
      tags: ["Incidents"],
      security: memberBearerAuth,
      params: IncidentParamsSchema,
      responses: {
        "200": {
          description: "Bundle document or a generation status.",
          schema: { oneOf: [bundleResponse, bundlePending, bundleFailed] },
        },
        "400": { description: "Invalid incident id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Incident was not found.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/incidents/{id}/reproduction",
      operationId: "getReproduction",
      summary: "Get the reproduction artifact for an incident",
      tags: ["Incidents"],
      security: memberBearerAuth,
      params: IncidentParamsSchema,
      responses: {
        "200": { description: "Reproduction artifact or a pending status.", schema: reproductionResponse },
        "400": { description: "Invalid incident id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Incident or reproduction artifact was not found.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/improvements",
      operationId: "listImprovements",
      summary: "List hosted improvement opportunities",
      tags: ["Improvements"],
      security: memberBearerAuth,
      query: ImprovementsQuerySchema,
      responses: {
        "200": { description: "Improvement opportunity list.", schema: improvementListResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Improvement management is unavailable.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/improvements/{id}",
      operationId: "getImprovement",
      summary: "Get a hosted improvement opportunity",
      tags: ["Improvements"],
      security: memberBearerAuth,
      params: ImprovementParamsSchema,
      responses: {
        "200": { description: "Improvement opportunity details.", schema: improvementResponse },
        "400": { description: "Invalid improvement id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Improvement opportunity was not found.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/improvements/{id}/resolve",
      operationId: "resolveImprovement",
      summary: "Resolve a hosted improvement opportunity",
      tags: ["Improvements"],
      security: memberBearerAuth,
      params: ImprovementParamsSchema,
      responses: {
        "200": { description: "Resolved improvement opportunity.", schema: improvementResponse },
        "400": { description: "Invalid improvement id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Improvement opportunity was not found or resolution is unavailable.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/improvements/{id}/reopen",
      operationId: "reopenImprovement",
      summary: "Reopen a hosted improvement opportunity",
      tags: ["Improvements"],
      security: memberBearerAuth,
      params: ImprovementParamsSchema,
      responses: {
        "200": { description: "Reopened improvement opportunity.", schema: improvementResponse },
        "400": { description: "Invalid improvement id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Improvement opportunity was not found or reopen is unavailable.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/improvements/{id}/snooze",
      operationId: "snoozeImprovement",
      summary: "Snooze a hosted improvement opportunity",
      tags: ["Improvements"],
      security: memberBearerAuth,
      params: ImprovementParamsSchema,
      requestBody: improvementSnoozeBody,
      responses: {
        "200": { description: "Snoozed improvement opportunity.", schema: improvementResponse },
        "400": { description: "Invalid improvement id or snooze timestamp.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Improvement opportunity was not found or snooze is unavailable.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/projects/{id}/improvements/{improvementId}/bundle",
      operationId: "getImprovementBundle",
      summary: "Get the hosted bundle for an improvement opportunity",
      tags: ["Improvements"],
      security: anyMemberAuth,
      params: ProjectImprovementParamsSchema,
      responses: {
        "200": {
          description: "Improvement bundle document or generation status.",
          schema: { oneOf: [bundleResponse, bundlePending, bundleFailed] },
        },
        "400": { description: "Invalid project or improvement id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project or improvement opportunity was not found.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/logs",
      operationId: "getLogs",
      summary: "Query incident logs",
      tags: ["Incidents"],
      security: memberBearerAuth,
      query: LogsQuerySchema,
      responses: {
        "200": { description: "Incident logs.", schema: logsResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/services",
      operationId: "listServices",
      summary: "List services for a project",
      tags: ["Services"],
      security: memberBearerAuth,
      query: ServicesQuerySchema,
      responses: {
        "200": { description: "Project services.", schema: servicesResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError },
        "500": { description: "Service retrieval is unavailable.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/projects/{id}/members",
      operationId: "listProjectMembers",
      summary: "List project members",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      responses: {
        "200": { description: "Project members.", schema: memberListResponse },
        "400": { description: "Invalid project id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found or collaboration is unavailable.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/projects/{id}/invites",
      operationId: "listProjectInvites",
      summary: "List pending project invites",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      responses: {
        "200": { description: "Pending project invites.", schema: inviteListResponse },
        "400": { description: "Invalid project id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found or collaboration is unavailable.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/projects/{id}/members/{userId}/avatar",
      operationId: "getProjectMemberAvatar",
      summary: "Get a cached project member avatar image",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectMemberParamsSchema,
      responses: {
        "200": { description: "Avatar image bytes.", schema: avatarImageResponse },
        "400": { description: "Invalid member id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project, member, or avatar was not found.", schema: apiError },
        "503": { description: "Account management is not configured.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/projects/{id}/invite",
      operationId: "inviteProjectMember",
      summary: "Invite a project member",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      requestBody: component("CreateProjectInviteBody", CreateProjectInviteBodySchema),
      responses: {
        "201": { description: "Invite created.", schema: inviteResponse },
        "400": { description: "Invalid project id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Admin or owner access and verified email are required.", schema: apiError },
        "404": { description: "Project was not found or collaboration is unavailable.", schema: apiError },
        "409": { description: "Member or invite already exists, or collaborator limits were reached.", schema: apiError },
        "500": { description: "Unexpected invite creation failure.", schema: apiError },
      },
    },
    {
      method: "delete",
      path: "/v1/projects/{id}/invites/{inviteId}",
      operationId: "cancelProjectInvite",
      summary: "Cancel a project invite",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectInviteParamsSchema,
      responses: {
        "200": { description: "Invite cancelled.", schema: inviteResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Admin or owner access and verified email are required.", schema: apiError },
        "404": { description: "Invite was not found.", schema: apiError },
      },
    },
    {
      method: "patch",
      path: "/v1/projects/{id}/members/{userId}",
      operationId: "updateProjectMemberRole",
      summary: "Update a project member role",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectMemberParamsSchema,
      requestBody: component("UpdateProjectMemberRoleBody", UpdateProjectMemberRoleBodySchema),
      responses: {
        "200": { description: "Updated project member.", schema: memberResponse },
        "400": { description: "Invalid member id or payload.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Admin or owner access is required.", schema: apiError },
        "404": { description: "Member was not found.", schema: apiError },
        "409": { description: "Owner role cannot be changed.", schema: apiError },
      },
    },
    {
      method: "delete",
      path: "/v1/projects/{id}/members/{userId}",
      operationId: "removeProjectMember",
      summary: "Remove a project member",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectMemberParamsSchema,
      responses: {
        "200": { description: "Removed project member.", schema: memberResponse },
        "400": { description: "Invalid member id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Admin or owner access is required.", schema: apiError },
        "404": { description: "Member was not found.", schema: apiError },
        "409": { description: "Owner cannot be removed.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/projects",
      operationId: "listProjects",
      summary: "List projects",
      tags: ["Projects"],
      security: anyMemberAuth,
      query: ProjectsQuerySchema,
      responses: {
        "200": { description: "Projects for the caller organization.", schema: projectListResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Projects are unavailable.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/projects",
      operationId: "createProject",
      summary: "Create a project",
      tags: ["Projects"],
      security: anyMemberAuth,
      requestBody: component("CreateProjectBody", CreateProjectBodySchema),
      responses: {
        "201": { description: "Project created.", schema: projectCreateResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access is required.", schema: apiError },
        "404": { description: "Projects are unavailable.", schema: apiError },
        "409": { description: "Project slug already exists.", schema: apiError },
      },
    },
    {
      method: "patch",
      path: "/v1/projects/{id}",
      operationId: "updateProject",
      summary: "Update a project",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      requestBody: component("UpdateProjectBody", UpdateProjectBodySchema),
      responses: {
        "200": { description: "Updated project.", schema: projectUpdateResponse },
        "400": { description: "Invalid project id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access is required.", schema: apiError },
        "404": { description: "Project was not found or projects are unavailable.", schema: apiError },
        "409": { description: "Project slug is already in use.", schema: apiError },
      },
    },
    {
      method: "delete",
      path: "/v1/projects/{id}",
      operationId: "deleteProject",
      summary: "Delete a project",
      tags: ["Projects"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      responses: {
        "200": { description: "Deleted project.", schema: projectDeleteResponse },
        "400": { description: "Invalid project id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access is required.", schema: apiError },
        "404": { description: "Project was not found or projects are unavailable.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/slack/app/install-url",
      operationId: "getSlackAppInstallUrl",
      summary: "Create a Slack OAuth install URL",
      tags: ["Slack"],
      security: anyMemberAuth,
      query: SlackAppInstallUrlQuerySchema,
      responses: {
        "200": { description: "Slack OAuth install URL.", schema: slackInstallUrlResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access or Team tier is required.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError },
        "503": { description: "Slack integration is not configured.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/slack/app/callback",
      operationId: "completeSlackAppInstall",
      summary: "Complete the Slack OAuth install flow",
      tags: ["Slack"],
      query: SlackAppCallbackQuerySchema,
      responses: {
        "302": { description: "Redirects back to the application after Slack OAuth completes or is cancelled." },
      },
    },
    {
      method: "get",
      path: "/v1/projects/{id}/slack/destinations",
      operationId: "listProjectSlackDestinations",
      summary: "List reusable Slack destinations for a project organization",
      tags: ["Slack"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      responses: {
        "200": { description: "Reusable Slack destinations.", schema: slackDestinationListResponse },
        "400": { description: "Invalid project id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Team tier is required.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError },
        "503": { description: "Slack integration is not configured.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/projects/{id}/slack/destinations/{destinationId}/test",
      operationId: "testProjectSlackDestination",
      summary: "Send a test message to a reusable Slack destination",
      tags: ["Slack"],
      security: anyMemberAuth,
      params: ProjectSlackDestinationDeleteParamsSchema,
      responses: {
        "200": { description: "Slack destination test delivered.", schema: slackDestinationTestResponse },
        "400": { description: "Invalid project id or Slack destination id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access or Team tier is required.", schema: apiError },
        "404": { description: "Project or Slack destination was not found.", schema: apiError },
        "502": { description: "Slack delivery failed.", schema: apiError },
        "503": { description: "Slack integration is not configured.", schema: apiError },
      },
    },
    {
      method: "delete",
      path: "/v1/projects/{id}/slack/destinations/{destinationId}",
      operationId: "deleteProjectSlackDestination",
      summary: "Delete a reusable Slack destination",
      tags: ["Slack"],
      security: anyMemberAuth,
      params: ProjectSlackDestinationDeleteParamsSchema,
      responses: {
        "204": { description: "Slack destination deleted." },
        "400": { description: "Invalid project id or Slack destination id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access or Team tier is required.", schema: apiError },
        "404": { description: "Slack destination was not found.", schema: apiError },
        "409": { description: "Slack destination is still referenced by an alert rule or weekly report.", schema: apiError },
        "503": { description: "Slack integration is not configured.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/billing",
      operationId: "getBillingSummary",
      summary: "Get the billing summary",
      tags: ["Billing"],
      security: anyMemberAuth,
      responses: {
        "200": { description: "Billing summary.", schema: billingSummaryResponse },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access is required.", schema: apiError },
        "404": { description: "Billing was not found or is unavailable.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/billing/checkout",
      operationId: "createBillingCheckout",
      summary: "Create a Stripe checkout link",
      tags: ["Billing"],
      security: browserSessionAuth,
      requestBody: component("BillingCheckoutBody", BillingCheckoutBodySchema),
      responses: {
        "200": { description: "Hosted checkout URL.", schema: billingLinkResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "403": { description: "Owner access or a verified email is required.", schema: apiError },
        "404": { description: "Billing was not found or is unavailable.", schema: apiError },
        "409": { description: "Requested plan change is invalid.", schema: apiError },
        "503": { description: "Billing is not configured.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/billing/checkout/confirm",
      operationId: "confirmBillingCheckout",
      summary: "Confirm a returned Stripe checkout session",
      tags: ["Billing"],
      security: browserSessionAuth,
      requestBody: component("BillingCheckoutConfirmBody", BillingCheckoutConfirmBodySchema),
      responses: {
        "200": { description: "Updated billing summary.", schema: billingSummaryResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "403": { description: "Owner access is required.", schema: apiError },
        "404": { description: "Billing or checkout session was not found.", schema: apiError },
        "409": { description: "Checkout session is not complete.", schema: apiError },
        "503": { description: "Billing confirmation is unavailable.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/billing/portal",
      operationId: "createBillingPortal",
      summary: "Create a Stripe customer portal link",
      tags: ["Billing"],
      security: browserSessionAuth,
      responses: {
        "200": { description: "Hosted billing portal URL.", schema: billingLinkResponse },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "403": { description: "Owner access or a verified email is required.", schema: apiError },
        "404": { description: "Billing was not found or is unavailable.", schema: apiError },
        "409": { description: "No active subscription exists.", schema: apiError },
        "503": { description: "Billing is not configured.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/billing/capacity/increase",
      operationId: "increaseCapacity",
      summary: "Increase capacity immediately",
      tags: ["Billing"],
      security: anyMemberAuth,
      requestBody: component("BillingCapacityBody", BillingCapacityChangeBodySchema),
      responses: {
        "200": { description: "Updated billing summary.", schema: billingSummaryResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access or a verified email is required.", schema: apiError },
        "404": { description: "Billing was not found or is unavailable.", schema: apiError },
        "409": { description: "Requested capacity change is invalid.", schema: apiError },
        "503": { description: "Billing is not configured.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/billing/capacity/scheduled-reduction",
      operationId: "scheduleCapacityReduction",
      summary: "Schedule a capacity reduction",
      tags: ["Billing"],
      security: anyMemberAuth,
      requestBody: component("BillingCapacityBody", BillingCapacityChangeBodySchema),
      responses: {
        "200": { description: "Updated billing summary.", schema: billingSummaryResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access or a verified email is required.", schema: apiError },
        "404": { description: "Billing was not found or is unavailable.", schema: apiError },
        "409": { description: "Requested capacity reduction is invalid.", schema: apiError },
        "503": { description: "Billing is not configured.", schema: apiError },
      },
    },
    {
      method: "delete",
      path: "/v1/billing/capacity/scheduled-reduction",
      operationId: "cancelCapacityReduction",
      summary: "Cancel a scheduled capacity reduction",
      tags: ["Billing"],
      security: anyMemberAuth,
      responses: {
        "200": { description: "Updated billing summary.", schema: billingSummaryResponse },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access or a verified email is required.", schema: apiError },
        "404": { description: "Billing was not found or is unavailable.", schema: apiError },
        "409": { description: "No scheduled reduction exists.", schema: apiError },
        "503": { description: "Billing is not configured.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/projects/{id}/tokens",
      operationId: "listProjectTokens",
      summary: "List project tokens",
      tags: ["Tokens"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      query: TokenListQuerySchema,
      responses: {
        "200": { description: "Project tokens.", schema: tokenListResponse },
        "400": { description: "Invalid project id or query parameters.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/projects/{id}/tokens",
      operationId: "createProjectToken",
      summary: "Create a project token",
      tags: ["Tokens"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      requestBody: component("CreateProjectTokenBody", CreateProjectTokenBodySchema),
      responses: {
        "201": { description: "Project token created.", schema: tokenResponse },
        "400": { description: "Invalid project id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner or admin project access is required.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/projects/{id}/tokens/{tokenId}/revoke",
      operationId: "revokeProjectToken",
      summary: "Revoke a project token",
      tags: ["Tokens"],
      security: anyMemberAuth,
      params: ProjectTokenParamsSchema,
      responses: {
        "200": { description: "Revoked project token.", schema: tokenResponse },
        "400": { description: "Invalid token id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner or admin project access is required.", schema: apiError },
        "404": { description: "Token was not found.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/member/tokens",
      operationId: "listMemberTokens",
      summary: "List member tokens",
      tags: ["Tokens"],
      security: anyMemberAuth,
      query: TokenListQuerySchema,
      responses: {
        "200": { description: "Member tokens.", schema: tokenListResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/member/tokens",
      operationId: "createMemberToken",
      summary: "Create a member token",
      tags: ["Tokens"],
      security: anyMemberAuth,
      requestBody: component("CreateTokenBody", CreateTokenBodySchema),
      responses: {
        "201": { description: "Member token created.", schema: tokenResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Verified email is required before creating the first member token.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/member/tokens/{tokenId}/revoke",
      operationId: "revokeMemberToken",
      summary: "Revoke a member token",
      tags: ["Tokens"],
      security: anyMemberAuth,
      params: MemberTokenParamsSchema,
      responses: {
        "200": { description: "Revoked member token.", schema: tokenResponse },
        "400": { description: "Invalid token id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Token was not found.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/alerts",
      operationId: "listAlerts",
      summary: "List alert rules",
      tags: ["Alerts"],
      security: anyMemberAuth,
      query: AlertsQuerySchema,
      responses: {
        "200": { description: "Alert rules.", schema: alertsResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/alerts",
      operationId: "createAlert",
      summary: "Create an alert rule",
      tags: ["Alerts"],
      security: anyMemberAuth,
      requestBody: component("CreateAlertBody", CreateAlertBodySchema),
      responses: {
        "201": { description: "Alert rule created.", schema: alertResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError },
      },
    },
    {
      method: "patch",
      path: "/v1/alerts/{id}",
      operationId: "updateAlert",
      summary: "Update an alert rule",
      tags: ["Alerts"],
      security: anyMemberAuth,
      params: component("AlertPathParams", z.object({ id: z.string().uuid() }).strict()).schema,
      requestBody: component("UpdateAlertBody", UpdateAlertBodySchema),
      responses: {
        "200": { description: "Updated alert rule.", schema: alertResponse },
        "400": { description: "Invalid alert id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Alert was not found.", schema: apiError },
      },
    },
    {
      method: "delete",
      path: "/v1/alerts/{id}",
      operationId: "deleteAlert",
      summary: "Delete an alert rule",
      tags: ["Alerts"],
      security: anyMemberAuth,
      params: component("AlertPathParams", z.object({ id: z.string().uuid() }).strict()).schema,
      responses: {
        "204": { description: "Alert rule deleted." },
        "400": { description: "Invalid alert id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Alert was not found.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/weekly-report-channels",
      operationId: "listWeeklyReportChannels",
      summary: "List weekly report channels",
      tags: ["Weekly Reports"],
      security: anyMemberAuth,
      query: WeeklyReportChannelsQuerySchema,
      responses: {
        "200": { description: "Weekly report channels.", schema: weeklyReportChannelsResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/weekly-report-channels",
      operationId: "createWeeklyReportChannel",
      summary: "Create a weekly report channel",
      tags: ["Weekly Reports"],
      security: anyMemberAuth,
      requestBody: component("CreateWeeklyReportChannelBody", CreateWeeklyReportChannelBodySchema),
      responses: {
        "201": { description: "Weekly report channel created.", schema: weeklyReportChannelResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Team tier is required for connected Slack destinations.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError },
        "503": { description: "Slack integration is not configured.", schema: apiError },
      },
    },
    {
      method: "patch",
      path: "/v1/weekly-report-channels/{id}",
      operationId: "updateWeeklyReportChannel",
      summary: "Update a weekly report channel",
      tags: ["Weekly Reports"],
      security: anyMemberAuth,
      params: WeeklyReportChannelParamsSchema,
      requestBody: component("UpdateWeeklyReportChannelBody", UpdateWeeklyReportChannelBodySchema),
      responses: {
        "200": { description: "Updated weekly report channel.", schema: weeklyReportChannelResponse },
        "400": { description: "Invalid channel id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Weekly report channel was not found.", schema: apiError },
        "403": { description: "Team tier is required for connected Slack destinations.", schema: apiError },
        "503": { description: "Slack integration is not configured.", schema: apiError },
      },
    },
    {
      method: "delete",
      path: "/v1/weekly-report-channels/{id}",
      operationId: "deleteWeeklyReportChannel",
      summary: "Delete a weekly report channel",
      tags: ["Weekly Reports"],
      security: anyMemberAuth,
      params: WeeklyReportChannelParamsSchema,
      responses: {
        "204": { description: "Weekly report channel deleted." },
        "400": { description: "Invalid channel id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Weekly report channel was not found.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/webhooks",
      operationId: "listWebhooks",
      summary: "List webhooks",
      tags: ["Webhooks"],
      security: anyMemberAuth,
      query: WebhooksQuerySchema,
      responses: {
        "200": { description: "Webhooks for a project.", schema: webhookListResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/webhooks",
      operationId: "createWebhook",
      summary: "Create a webhook",
      tags: ["Webhooks"],
      security: anyMemberAuth,
      requestBody: component("CreateWebhookBody", CreateWebhookBodySchema),
      responses: {
        "201": { description: "Webhook created.", schema: webhookCreateResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/webhooks/{id}",
      operationId: "getWebhook",
      summary: "Get a webhook",
      tags: ["Webhooks"],
      security: anyMemberAuth,
      params: WebhookParamsSchema,
      responses: {
        "200": { description: "Webhook details.", schema: webhookResponse },
        "400": { description: "Invalid webhook id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Webhook was not found.", schema: apiError },
      },
    },
    {
      method: "patch",
      path: "/v1/webhooks/{id}",
      operationId: "updateWebhook",
      summary: "Update a webhook",
      tags: ["Webhooks"],
      security: anyMemberAuth,
      params: WebhookParamsSchema,
      requestBody: component("UpdateWebhookBody", UpdateWebhookBodySchema),
      responses: {
        "200": { description: "Updated webhook.", schema: webhookResponse },
        "400": { description: "Invalid webhook id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Webhook was not found.", schema: apiError },
      },
    },
    {
      method: "delete",
      path: "/v1/webhooks/{id}",
      operationId: "deleteWebhook",
      summary: "Delete a webhook",
      tags: ["Webhooks"],
      security: anyMemberAuth,
      params: WebhookParamsSchema,
      responses: {
        "204": { description: "Webhook deleted." },
        "400": { description: "Invalid webhook id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Webhook was not found.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/webhooks/{id}/test",
      operationId: "testWebhook",
      summary: "Queue a synthetic webhook delivery",
      tags: ["Webhooks"],
      security: anyMemberAuth,
      params: WebhookParamsSchema,
      requestBody: component("WebhookTestBody", WebhookTestBodySchema),
      responses: {
        "200": { description: "Synthetic delivery queued.", schema: webhookTestResponse },
        "400": { description: "Invalid webhook id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Webhook was not found.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/webhooks/{id}/deliveries",
      operationId: "listWebhookDeliveries",
      summary: "List webhook deliveries",
      tags: ["Webhooks"],
      security: anyMemberAuth,
      params: WebhookDeliveriesParamsSchema,
      query: WebhookDeliveriesQuerySchema.merge(ProjectScopedQuerySchema),
      responses: {
        "200": { description: "Webhook deliveries.", schema: webhookDeliveriesResponse },
        "400": { description: "Invalid webhook id or query parameters.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Webhook was not found.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/webhooks/{id}/deliveries/{deliveryId}/retry",
      operationId: "retryWebhookDelivery",
      summary: "Retry a webhook delivery",
      tags: ["Webhooks"],
      security: anyMemberAuth,
      params: WebhookDeliveryRetryParamsSchema,
      responses: {
        "200": { description: "Webhook delivery reset for retrying.", schema: webhookRetryResponse },
        "400": { description: "Invalid webhook or delivery id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Webhook or delivery was not found.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/projects/{id}/probes/activate",
      operationId: "activateProbes",
      summary: "Activate remote probes",
      tags: ["Probes"],
      security: memberBearerAuth,
      params: ProjectParamsSchema,
      requestBody: component("ProbeActivateBody", ProbeActivateBodySchema),
      responses: {
        "201": { description: "Probe activation created.", schema: probeActivationResponse },
        "400": { description: "Invalid project id or request body.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "403": { description: "Remote probes are not available for the caller tier.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError },
        "409": { description: "Concurrent activation limit reached.", schema: apiError },
        "429": {
          description: "Monthly remote activation quota exceeded.",
          schema: apiError,
          headers: {
            "Retry-After": { description: "Seconds until the caller should retry.", schema: z.string() },
          },
        },
      },
    },
    {
      method: "get",
      path: "/v1/projects/{id}/probes",
      operationId: "listActiveProbes",
      summary: "List active remote probes",
      tags: ["Probes"],
      security: memberBearerAuth,
      params: ProjectParamsSchema,
      responses: {
        "200": { description: "Active probe activations.", schema: probeActivationListResponse },
        "400": { description: "Invalid project id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "403": { description: "Remote probes are not available for the caller tier.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError },
      },
    },
    {
      method: "post",
      path: "/v1/projects/{id}/probes/deactivate",
      operationId: "deactivateProbes",
      summary: "Deactivate a remote probe",
      tags: ["Probes"],
      security: memberBearerAuth,
      params: ProjectParamsSchema,
      requestBody: component("ProbeDeactivateBody", ProbeDeactivateBodySchema),
      responses: {
        "200": { description: "Probe activation deactivated.", schema: probeDeactivationResponse },
        "400": { description: "Invalid project id or request body.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "403": { description: "Remote probes are not available for the caller tier.", schema: apiError },
        "404": { description: "Activation was not found.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/projects/{id}/capture-policy",
      operationId: "getCapturePolicy",
      summary: "Get the resolved capture policy for a project",
      tags: ["Capture Policy"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      responses: {
        "200": { description: "Resolved capture policy.", schema: capturePolicyResponse },
        "400": { description: "Invalid project id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError },
      },
    },
    {
      method: "patch",
      path: "/v1/projects/{id}/capture-policy",
      operationId: "updateCapturePolicy",
      summary: "Update the capture policy for a project",
      tags: ["Capture Policy"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      requestBody: capturePolicyUpdate,
      responses: {
        "200": { description: "Updated resolved capture policy.", schema: capturePolicyResponse },
        "400": { description: "Invalid project id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access is required.", schema: apiError },
        "404": { description: "Project was not found or capture policy is unavailable.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/projects/{id}/improvement-settings",
      operationId: "getImprovementSettings",
      summary: "Get automated improvement settings for a project",
      tags: ["Improvements"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      responses: {
        "200": { description: "Automated improvement settings.", schema: improvementSettingsResponse },
        "400": { description: "Invalid project id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError },
      },
    },
    {
      method: "patch",
      path: "/v1/projects/{id}/improvement-settings",
      operationId: "updateImprovementSettings",
      summary: "Update automated improvement settings for a project",
      tags: ["Improvements"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      requestBody: improvementSettingsUpdate,
      responses: {
        "200": { description: "Updated automated improvement settings.", schema: improvementSettingsResponse },
        "400": { description: "Invalid project id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner/admin access or an eligible paid tier is required.", schema: apiError },
        "404": { description: "Project was not found or improvement settings are unavailable.", schema: apiError },
      },
    },
    {
      method: "get",
      path: "/v1/sdk/config",
      operationId: "getSdkConfig",
      summary: "Get SDK config for a project token",
      tags: ["SDK"],
      security: projectBearerAuth,
      responses: {
        "200": { description: "SDK config payload.", schema: sdkConfigResponse },
        "304": { description: "SDK config has not changed since the provided ETag." },
        "401": { description: "Project token is invalid.", schema: apiError },
      },
    },
  ];
}

export function buildPublicOpenApiSpec(): Record<string, unknown> {
  const components = new Map<string, JsonSchemaDocument>();
  const operations = buildPublicApiOperations();
  const paths: Record<string, Record<string, unknown>> = {};

  for (const operation of operations) {
    const pathItem = (paths[operation.path] ??= {});
    const parameters = [
      ...(operation.params === undefined ? [] : buildParameters(operation.params, "path")),
      ...(operation.query === undefined ? [] : buildParameters(operation.query, "query")),
    ];

    pathItem[operation.method] = {
      operationId: operation.operationId,
      summary: operation.summary,
      tags: operation.tags,
      ...(operation.security === undefined ? {} : { security: operation.security }),
      ...(parameters.length === 0 ? {} : { parameters }),
      ...(operation.requestBody === undefined
        ? {}
        : {
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: resolveSchemaSpec(operation.requestBody, components),
                },
              },
            },
          }),
      responses: Object.fromEntries(
        Object.entries(operation.responses).map(([statusCode, response]) => [
          statusCode,
          {
            description: response.description,
            ...(response.headers === undefined
              ? {}
              : {
                  headers: Object.fromEntries(
                    Object.entries(response.headers).map(([headerName, header]) => [
                      headerName,
                      {
                        description: header.description,
                        schema: toJsonSchema(header.schema),
                      },
                    ])
                  ),
                }),
            ...(response.schema === undefined
              ? {}
              : {
                  content: {
                    "application/json": {
                      schema: resolveSchemaSpec(response.schema, components),
                    },
                  },
                }),
          },
        ])
      ),
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "DebugBundle HTTP API",
      version: "v1",
      description: "Source-backed OpenAPI description for the public DebugBundle HTTP API.",
    },
    servers: [
      { url: "https://api.debugbundle.com", description: "DebugBundle Cloud API" },
    ],
    tags: Array.from(new Set(operations.flatMap((operation) => operation.tags))).map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        browserSession: {
          type: "apiKey",
          in: "cookie",
          name: SESSION_COOKIE_NAME,
          description: "Browser session cookie for interactive authenticated routes.",
        },
        memberBearerToken: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Opaque member token",
          description: "Bearer member token used by the CLI, MCP, and automation.",
        },
        projectBearerToken: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Opaque project token",
          description: "Bearer project token used by ingestion and SDK config routes.",
        },
      },
      schemas: Object.fromEntries(components.entries()),
    },
  };
}
