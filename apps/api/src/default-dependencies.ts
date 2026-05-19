import { gunzipSync } from "node:zlib";

import { Pool } from "pg";
import type Stripe from "stripe";

import {
  createGitHubCliAuthService,
  createGitHubOAuthClient,
  createWebSessionAuthService,
  type AuthEmailSender,
  type GitHubCliAuthService,
  type GitHubOAuthConfig,
  type WebSessionAuthService
} from "../../../packages/auth/src/index.js";
import {
  getDefaultPreset,
  type CapturePolicyUpdate,
  type ImprovementSettingsUpdate
} from "../../../packages/shared-types/src/index.js";
import {
  createSesEmailTransport,
  formatProductFromEmail,
  renderEmailAuthCodeEmail,
  renderProjectInviteEmail,
  type EmailMessage,
  type EmailTransport
} from "../../../packages/email/src/index.js";
import { buildPostgresSslConfig } from "../../../packages/storage/src/postgres-ssl.js";
import {
  buildBundleObjectKey,
  buildBundleRegenerationLeaseKey,
  buildImprovementBundleObjectKey,
  buildRawEventObjectKey,
  buildReproductionObjectKey,
  buildUserAvatarObjectKey,
  createPostgresAccountStore,
  type BillingSummaryRecord,
  createPostgresAuditLogStore,
  createPostgresBillingStore,
  createPostgresBillingSyncStore,
  createPostgresAuthStore,
  createPostgresCapturePolicyStore,
  createPostgresImprovementOpportunityStore,
  createPostgresImprovementSettingsStore,
  createPostgresGitHubStore,
  createPostgresOperationalEmailDeliveryStore,
  createIncidentLifecycleService,
  createMemberAuthService,
  createIngestionMetadataService,
  createIngestionPersistenceService,
  createRedisAuthRateLimiter,
  createRedisIngestionRateLimiter,
  type AuthRateLimiter,
  type IncidentFrequencyCounter,
  type IngestionRateLimiter,
  createPostgresMetadataStore,
  createPostgresSlackDestinationStore,
  createPostgresWeeklyReportChannelStore,
  createPostgresWebhookDeliveryStore,
  createRedisIncidentFrequencyCounter,
  createRedisQueueClient,
  createS3ObjectStoreClient,
  deleteProjectObjects,
  type ObjectStoreClient,
  type ObjectStorePrefixDeleter,
  type ObjectStoreReader,
  type Queryable,
  type QueueClient,
  type RedisQueueClient,
  type WebhookEventType
} from "../../../packages/storage/src/index.js";
import {
  buildSchedulePhasesForReduction,
  buildSubscriptionItemsForQuantity,
  loadStripeBillingSubscriptionState,
  projectBillingSummary
} from "./billing-slot-management.js";
import { createEnvBillingLinkProvider } from "./billing-links.js";
import { createGitHubAppClientFromEnv, type GitHubAppClient } from "./github-app.js";
import {
  createStripeConfig,
  deriveBillingState,
  derivePlanFromSubscriptionItems,
  isEntitlementEligible,
  type StripeConfig
} from "./stripe-config.js";

export interface CreateApiDependenciesInput {
  objectStore: ObjectStoreClient & ObjectStoreReader & ObjectStorePrefixDeleter;
  queue: QueueClient;
  db: Queryable;
  frequencyCounter?: IncidentFrequencyCounter;
  ingestionRateLimiter?: IngestionRateLimiter;
  authRateLimiter?: AuthRateLimiter;
  signupEmailAllowlist?: string[];
  authEmails?: AuthEmailSender;
  billingEmails?: BillingEmailService;
  githubOAuth?: GitHubOAuthConfig;
  githubAppClient?: GitHubAppClient;
  stripeConfig?: StripeConfig;
  lifecycleWebhookFallbackTargetUrl?: string;
  lifecycleWebhookFallbackSigningSecret?: string;
}

export interface BillingEmailContact {
  organizationName: string;
  recipientEmail: string;
}

export interface BillingEmailService {
  managementUrl?: string;
  getBillingContactForOrganization(input: { organization_id: string }): Promise<BillingEmailContact | null>;
  send(message: EmailMessage): Promise<void>;
}

export function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

const BILLING_SUMMARY_STRIPE_PROJECTION_TIMEOUT_MS = 2_500;

export function readNonEmptyEnv(env: Record<string, string | undefined>, key: string): string | undefined {
  const value = env[key];
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readCsvEnv(env: Record<string, string | undefined>, key: string): string[] | undefined {
  const value = readNonEmptyEnv(env, key);
  if (value === undefined) {
    return undefined;
  }

  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return entries.length > 0 ? entries : undefined;
}

const DEV_GITHUB_MOCK_CODE = "debugbundle-dev-mock-code";
const DEV_GITHUB_MOCK_USER_ID = "debugbundle-dev-mock-user";
const DEV_GITHUB_MOCK_EMAIL = "dev@debugbundle.local";
const BUNDLE_REGENERATION_LEASE_TTL_SECONDS = 30;

export function normalizeBillingPlan(plan: string | null | undefined): "free" | "solo" | "team" {
  if (plan === "solo" || plan === "team") {
    return plan;
  }

  return "free";
}

export function getStringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === "string" ? value : null;
}

export function getBooleanField(record: Record<string, unknown>, field: string): boolean {
  return record[field] === true;
}

export function readUnixTimestampField(source: unknown, key: string): number | null {
  if (typeof source !== "object" || source === null) {
    return null;
  }

  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}

export function readSubscriptionInvoiceLinePeriod(source: unknown): { start: number | null; end: number | null } {
  if (typeof source !== "object" || source === null) {
    return { start: null, end: null };
  }

  const lines = (source as Record<string, unknown>)["lines"];
  if (typeof lines !== "object" || lines === null) {
    return { start: null, end: null };
  }

  const data = (lines as Record<string, unknown>)["data"];
  if (!Array.isArray(data)) {
    return { start: null, end: null };
  }

  for (const line of data) {
    if (typeof line !== "object" || line === null) {
      continue;
    }

    const period = (line as Record<string, unknown>)["period"];
    if (typeof period !== "object" || period === null) {
      continue;
    }

    const start = readUnixTimestampField(period, "start");
    const end = readUnixTimestampField(period, "end");
    if (start !== null || end !== null) {
      return { start, end };
    }
  }

  return { start: null, end: null };
}

export function resolveStripeSubscriptionBillingPeriod(subscription: Stripe.Subscription): {
  starts_at: string | null;
  ends_at: string | null;
} {
  const currentPeriodStart = readUnixTimestampField(subscription, "current_period_start");
  const currentPeriodEnd = readUnixTimestampField(subscription, "current_period_end");
  const latestInvoice = typeof subscription.latest_invoice !== "string" && subscription.latest_invoice !== null
    ? subscription.latest_invoice
    : null;
  const latestInvoiceLinePeriod = readSubscriptionInvoiceLinePeriod(latestInvoice);
  const latestInvoicePeriodStart = readUnixTimestampField(latestInvoice, "period_start");
  const latestInvoicePeriodEnd = readUnixTimestampField(latestInvoice, "period_end");

  let startsAt = currentPeriodStart !== null ? new Date(currentPeriodStart * 1000).toISOString() : null;
  let endsAt = currentPeriodEnd !== null ? new Date(currentPeriodEnd * 1000).toISOString() : null;

  if (startsAt === null) {
    if (latestInvoiceLinePeriod.start !== null) {
      startsAt = new Date(latestInvoiceLinePeriod.start * 1000).toISOString();
    } else if (latestInvoicePeriodStart !== null) {
      startsAt = new Date(latestInvoicePeriodStart * 1000).toISOString();
    }
  }

  if (endsAt === null) {
    if (latestInvoiceLinePeriod.end !== null) {
      endsAt = new Date(latestInvoiceLinePeriod.end * 1000).toISOString();
    } else if (latestInvoicePeriodEnd !== null) {
      endsAt = new Date(latestInvoicePeriodEnd * 1000).toISOString();
    }
  }

  if (startsAt !== null && endsAt !== null && startsAt >= endsAt) {
    return { starts_at: null, ends_at: null };
  }

  return { starts_at: startsAt, ends_at: endsAt };
}

async function readStoredJsonArtifact(
  objectStoreReader: Pick<ObjectStoreReader, "getObject">,
  key: string,
): Promise<{ key: string; content: unknown }> {
  try {
    const compressed = await objectStoreReader.getObject({ key });

    try {
      return {
        key,
        content: JSON.parse(gunzipSync(compressed).toString("utf8")),
      };
    } catch {
      return {
        key,
        content: { error: "artifact_invalid" },
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      key,
      content: { error: message === "s3_object_not_found" ? "artifact_not_found" : "artifact_unavailable" },
    };
  }
}

async function buildAccountExportArtifacts(
  objectStoreReader: Pick<ObjectStoreReader, "getObject">,
  exportData: {
    incidents: Record<string, unknown>[];
    incident_events: Record<string, unknown>[];
    improvement_opportunities: Record<string, unknown>[];
    improvement_opportunity_events: Record<string, unknown>[];
  },
): Promise<{
  raw_events: Array<{ key: string; content: unknown }>;
  bundles: Array<{ key: string; content: unknown }>;
  reproductions: Array<{ key: string; content: unknown }>;
}> {
  const rawEventRefs = new Set(exportData.incident_events.flatMap((record) => {
    if (!getBooleanField(record, "is_sampled")) {
      return [];
    }

    const projectId = getStringField(record, "project_id");
    const eventId = getStringField(record, "event_id");
    const occurredAt = getStringField(record, "occurred_at");
    if (projectId === null || eventId === null || occurredAt === null) {
      return [];
    }

    return [
      buildRawEventObjectKey({
        projectId,
        eventId,
        occurredAt: new Date(occurredAt),
      }),
    ];
  }));

  for (const record of exportData.improvement_opportunity_events) {
    const projectId = getStringField(record, "project_id");
    const eventId = getStringField(record, "event_id");
    const occurredAt = getStringField(record, "occurred_at");
    if (projectId === null || eventId === null || occurredAt === null) {
      continue;
    }

    rawEventRefs.add(
      buildRawEventObjectKey({
        projectId,
        eventId,
        occurredAt: new Date(occurredAt),
      }),
    );
  }

  const incidentRefs = exportData.incidents.flatMap((record) => {
    const projectId = getStringField(record, "project_id");
    const incidentId = getStringField(record, "incident_id");
    if (projectId === null || incidentId === null) {
      return [];
    }

    return [
      {
        bundleKey: buildBundleObjectKey(projectId, incidentId),
        reproductionKey: buildReproductionObjectKey(projectId, incidentId),
      },
    ];
  });

  const improvementBundleRefs = exportData.improvement_opportunities.flatMap((record) => {
    const projectId = getStringField(record, "project_id");
    const opportunityId = getStringField(record, "improvement_opportunity_id");
    const generationNumber = Number(record["bundle_generation_number"] ?? 0);
    if (projectId === null || opportunityId === null || generationNumber <= 0) {
      return [];
    }

    return [buildImprovementBundleObjectKey(projectId, opportunityId)];
  });

  const raw_events = await Promise.all([...rawEventRefs].map((key) => readStoredJsonArtifact(objectStoreReader, key)));
  const bundles = await Promise.all([
    ...incidentRefs.map((record) => readStoredJsonArtifact(objectStoreReader, record.bundleKey)),
    ...improvementBundleRefs.map((key) => readStoredJsonArtifact(objectStoreReader, key)),
  ]);
  const reproductions = await Promise.all(
    incidentRefs.map((record) => readStoredJsonArtifact(objectStoreReader, record.reproductionKey)),
  );

  return { raw_events, bundles, reproductions };
}

function createGithubOAuthConfigFromEnv(env: Record<string, string | undefined>): GitHubOAuthConfig | undefined {
  const appBaseUrl = readNonEmptyEnv(env, "APP_BASE_URL");
  const githubClientId = readNonEmptyEnv(env, "GITHUB_CLIENT_ID");
  const githubClientSecret = readNonEmptyEnv(env, "GITHUB_CLIENT_SECRET");
  const githubOauthCallbackUrl = readNonEmptyEnv(env, "GITHUB_OAUTH_CALLBACK_URL");
  const githubOauthStateSecret = readNonEmptyEnv(env, "GITHUB_OAUTH_STATE_SECRET");
  const hasRealGithubConfig =
    githubClientId !== undefined &&
    githubClientSecret !== undefined &&
    githubOauthCallbackUrl !== undefined &&
    githubOauthStateSecret !== undefined &&
    appBaseUrl !== undefined;

  if (hasRealGithubConfig) {
    return {
      clientId: githubClientId,
      callbackUrl: githubOauthCallbackUrl,
      appRedirectUrl: `${stripTrailingSlash(appBaseUrl)}${"/auth/github/callback"}`,
      stateSecret: githubOauthStateSecret,
      client: createGitHubOAuthClient({
        clientId: githubClientId,
        clientSecret: githubClientSecret,
        callbackUrl: githubOauthCallbackUrl
      })
    };
  }

  if (env["DEV_GITHUB_MOCK_LOGIN"] !== "true" || appBaseUrl === undefined) {
    return undefined;
  }

  const normalizedAppBaseUrl = stripTrailingSlash(appBaseUrl);

  return {
    clientId: "debugbundle-dev-mock-github",
    callbackUrl: githubOauthCallbackUrl ?? `${normalizedAppBaseUrl}/v1/auth/github/callback`,
    appRedirectUrl: `${normalizedAppBaseUrl}/auth/github/callback`,
    authorizeUrl: `${normalizedAppBaseUrl}/v1/auth/github/mock-authorize`,
    stateSecret: githubOauthStateSecret ?? "debugbundle-dev-mock-github-state-secret",
    client: {
      exchangeCodeForIdentity: ({ code }) => {
        if (code !== DEV_GITHUB_MOCK_CODE) {
          return Promise.resolve(null);
        }

        return Promise.resolve({
          github_user_id: DEV_GITHUB_MOCK_USER_ID,
          email: env["DEV_GITHUB_MOCK_EMAIL"] ?? DEV_GITHUB_MOCK_EMAIL
        });
      },
      resolveIdentityFromAccessToken: ({ access_token }) => {
        if (access_token !== DEV_GITHUB_MOCK_CODE) {
          return Promise.resolve({
            ok: false as const,
            error: "token_invalid" as const
          });
        }

        return Promise.resolve({
          ok: true as const,
          identity: {
            github_user_id: DEV_GITHUB_MOCK_USER_ID,
            email: env["DEV_GITHUB_MOCK_EMAIL"] ?? DEV_GITHUB_MOCK_EMAIL
          }
        });
      },
      beginDeviceAuthorization: () =>
        Promise.resolve({
          ok: true as const,
          device_code: DEV_GITHUB_MOCK_CODE,
          user_code: "MOCK-CODE",
          verification_uri: `${normalizedAppBaseUrl}/v1/auth/github/mock-authorize`,
          expires_in: 900,
          interval: 5
        }),
      pollDeviceAuthorization: ({ device_code }) => {
        if (device_code !== DEV_GITHUB_MOCK_CODE) {
          return Promise.resolve({
            status: "provider_error" as const
          });
        }

        return Promise.resolve({
          status: "approved" as const,
          identity: {
            github_user_id: DEV_GITHUB_MOCK_USER_ID,
            email: env["DEV_GITHUB_MOCK_EMAIL"] ?? DEV_GITHUB_MOCK_EMAIL
          }
        });
      }
    }
  };
}

function readSignupEmailAllowlistFromEnv(env: Record<string, string | undefined>): string[] | undefined {
  return readCsvEnv(env, "AUTH_SIGNUP_ALLOWED_EMAILS");
}

function createAuthEmailSender(input: { emailTransport: EmailTransport; appBaseUrl: string }): AuthEmailSender {
  const baseUrl = stripTrailingSlash(input.appBaseUrl);

  return {
    async sendEmailAuthCode({ email, code, expires_in_minutes }): Promise<void> {
      const rendered = renderEmailAuthCodeEmail({
        code,
        expiresInMinutes: expires_in_minutes,
        appUrl: `${baseUrl}/login`
      });
      await input.emailTransport.send({
        to: [email],
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html
      });
    },

    async sendProjectInviteEmail({ email, token, inviter_name }): Promise<void> {
      const rendered = renderProjectInviteEmail({
        acceptUrl: `${baseUrl}/invite?token=${encodeURIComponent(token)}`,
        inviterName: inviter_name
      });
      await input.emailTransport.send({
        to: [email],
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html
      });
    }
  };
}

function createBillingEmailService(input: {
  db: Queryable;
  emailTransport: EmailTransport;
  appBaseUrl: string;
}): BillingEmailService {
  const managementUrl = `${stripTrailingSlash(input.appBaseUrl)}/billing`;

  return {
    managementUrl,
    async getBillingContactForOrganization(request: { organization_id: string }): Promise<BillingEmailContact | null> {
      const result = await input.db.query<{
        organization_name: string;
        recipient_email: string;
      }>(
        `
          SELECT
            o.name AS organization_name,
            u.email AS recipient_email
          FROM organizations o
          JOIN organization_members om
            ON om.organization_id = o.id
           AND om.role = 'owner'
          JOIN users u
            ON u.id = om.user_id
          WHERE o.id = $1
          ORDER BY om.created_at ASC, om.user_id ASC
          LIMIT 1
        `,
        [request.organization_id]
      );

      const row = result.rows[0];
      if (row === undefined) {
        return null;
      }

      return {
        organizationName: row.organization_name,
        recipientEmail: row.recipient_email
      };
    },
    async send(message: EmailMessage): Promise<void> {
      await input.emailTransport.send(message);
    }
  };
}

export function createApiDependencies(input: CreateApiDependenciesInput): {
  ingestionPersistence: ReturnType<typeof createIngestionPersistenceService>;
  ingestionMetadata: ReturnType<typeof createIngestionMetadataService>;
  ingestionRateLimiter?: IngestionRateLimiter;
  authRateLimiter?: AuthRateLimiter;
  auditLogging: ReturnType<typeof createPostgresAuditLogStore>;
  memberAuth: ReturnType<typeof createMemberAuthService>;
  webAuth: Pick<
    WebSessionAuthService,
    | "requestEmailCode"
    | "verifyEmailCode"
    | "beginGithubAuth"
    | "completeGithubAuth"
    | "acceptInviteForSession"
    | "resolveSessionByToken"
    | "revokeSessionByToken"
  >;
  githubCliAuth: Pick<
    GitHubCliAuthService,
    "beginDeviceAuth" | "pollDeviceAuth" | "claimDeviceAuth" | "exchangeGitHubAccessToken"
  >;
  inviteEmails?: Pick<AuthEmailSender, "sendProjectInviteEmail">;
  billingEmails?: BillingEmailService;
  tokenManagement: Pick<
    ReturnType<typeof createPostgresMetadataStore>,
    | "listProjectTokensForOrganization"
    | "createProjectTokenForOrganization"
    | "revokeProjectTokenForOrganization"
    | "listMemberTokensForOrganization"
    | "createMemberTokenForOrganization"
    | "revokeMemberTokenForOrganization"
  >;
  projectManagement: Pick<
    ReturnType<typeof createPostgresMetadataStore>,
    | "resolveProjectAccessForUser"
    | "listProjectsForUser"
    | "createProjectForUser"
    | "updateProjectForUser"
    | "deleteProjectForUser"
    | "listProjectsForOrganization"
    | "createProjectForOrganization"
    | "updateProjectForOrganization"
    | "deleteProjectForOrganization"
  >;
  billingManagement: {
    getBillingSummaryForOrganization: ReturnType<typeof createPostgresBillingStore>["getBillingSummaryForOrganization"];
    getBillingSummaryForProject: ReturnType<typeof createPostgresBillingStore>["getBillingSummaryForProject"];
    incrementOrgUsageCounter: ReturnType<typeof createPostgresBillingStore>["incrementOrgUsageCounter"];
    createCheckoutLink(input: {
      organization_id: string;
      billing_email: string;
      current_plan: "free" | "solo" | "team";
      target_plan: "solo" | "team";
    }): Promise<{ url: string } | null>;
    confirmCheckoutSession(input: {
      organization_id: string;
      session_id: string;
      now: string;
    }): Promise<BillingSummaryRecord | "billing_not_configured" | "billing_not_found" | "checkout_session_not_found" | "checkout_not_complete" | "billing_service_error">;
    createPortalLink(input: {
      organization_id: string;
      current_plan: "solo" | "team";
    }): Promise<{ url: string } | null>;
    increaseCapacity(input: {
      organization_id: string;
      target_additional_capacity_units: number;
      now: string;
    }): Promise<BillingSummaryRecord | "billing_not_configured" | "billing_not_found" | "no_active_subscription" | "invalid_target_quantity" | "pending_capacity_reduction_exists">;
    scheduleCapacityReduction(input: {
      organization_id: string;
      target_additional_capacity_units: number;
      now: string;
    }): Promise<BillingSummaryRecord | "billing_not_configured" | "billing_not_found" | "no_active_subscription" | "invalid_target_quantity">;
    cancelCapacityReduction(input: {
      organization_id: string;
      now: string;
    }): Promise<BillingSummaryRecord | "billing_not_configured" | "billing_not_found" | "no_active_subscription" | "capacity_reduction_not_found">;
  };
  projectCollaboration: Pick<
    ReturnType<typeof createPostgresMetadataStore>,
    | "listMembersForProject"
    | "listPendingInvitesForProject"
    | "createInviteForProject"
    | "cancelInviteForProject"
    | "updateProjectMemberRole"
    | "removeProjectMember"
  >;
  githubManagement?: {
    getInstallUrl(): Promise<string>;
    getInstallationForOrganization(input: { organization_id: string }): Promise<import("../../../packages/storage/src/index.js").GitHubInstallationRecord | null>;
    disconnectInstallationForOrganization(input: { organization_id: string }): Promise<boolean>;
    listRepositoriesForOrganization(input: {
      organization_id: string;
    }): Promise<import("../../../packages/storage/src/index.js").GitHubRepositoryRecord[] | "installation_not_found" | "installation_suspended" | "installation_removed">;
    getProjectRepoForOrganization(input: {
      organization_id: string;
      project_id: string;
    }): Promise<import("../../../packages/storage/src/index.js").ProjectGitHubRepoRecord | null>;
    listProjectDeliveriesForOrganization(input: {
      organization_id: string;
      project_id: string;
      status?: "pending" | "retrying" | "delivered" | "failed" | "skipped";
      limit: number;
    }): Promise<import("../../../packages/storage/src/index.js").GitHubDispatchDeliveryRecord[]>;
    retryProjectDeliveryForOrganization(input: {
      organization_id: string;
      project_id: string;
      delivery_id: string;
    }): Promise<import("../../../packages/storage/src/index.js").GitHubDispatchDeliveryRecord | "delivery_not_found" | "repo_not_found" | "installation_not_found" | "installation_suspended" | "installation_removed">;
    listProjectRulesForOrganization(input: {
      organization_id: string;
      project_id: string;
    }): Promise<import("../../../packages/storage/src/index.js").GitHubDispatchRuleRecord[] | null>;
    getProjectRuleForOrganization(input: {
      organization_id: string;
      project_id: string;
      rule_id: string;
    }): Promise<import("../../../packages/storage/src/index.js").GitHubDispatchRuleRecord | null>;
    createProjectRuleForOrganization(input: {
      organization_id: string;
      project_id: string;
      name: string;
      enabled: boolean;
      event_types: string[];
      environments: string[];
      services: string[];
      severity_min: "low" | "medium" | "high" | "critical";
      bundle_type: "failure" | "improvement";
      incident_status: "new_only" | "reopened_only" | "new_or_reopened";
      cooldown_seconds: number;
    }): Promise<import("../../../packages/storage/src/index.js").GitHubDispatchRuleRecord | "project_not_found" | "repo_not_found" | "rule_limit_reached">;
    updateProjectRuleForOrganization(input: {
      organization_id: string;
      project_id: string;
      rule_id: string;
      name?: string;
      enabled?: boolean;
      event_types?: string[];
      environments?: string[];
      services?: string[];
      severity_min?: "low" | "medium" | "high" | "critical";
      bundle_type?: "failure" | "improvement";
      incident_status?: "new_only" | "reopened_only" | "new_or_reopened";
      cooldown_seconds?: number;
    }): Promise<import("../../../packages/storage/src/index.js").GitHubDispatchRuleRecord | "rule_not_found">;
    deleteProjectRuleForOrganization(input: {
      organization_id: string;
      project_id: string;
      rule_id: string;
    }): Promise<boolean>;
    setProjectRepoForOrganization(input: {
      organization_id: string;
      project_id: string;
      created_by_user_id: string;
      owner: string;
      repo: string;
    }): Promise<import("../../../packages/storage/src/index.js").ProjectGitHubRepoRecord | "installation_not_found" | "installation_suspended" | "installation_removed" | "project_not_found" | "repo_not_found">;
    removeProjectRepoForOrganization(input: {
      organization_id: string;
      project_id: string;
    }): Promise<boolean>;
    completeGithubInstallationForOrganization(input: {
      organization_id: string;
      installation_id: number;
    }): Promise<import("../../../packages/storage/src/index.js").GitHubInstallationRecord | "github_not_configured">;
    verifyWebhookSignature(input: { rawBody: Buffer; signature: string }): boolean;
    processWebhook(input: { eventName: string; payload: Record<string, unknown> }): Promise<void>;
  };
  probeManagement: Pick<
    ReturnType<typeof createPostgresMetadataStore>,
    | "listActiveProbesForProject"
    | "listActiveProbesForProjectInOrganization"
    | "createProbeActivationForProjectInOrganization"
    | "deactivateProbeActivationForProjectInOrganization"
  >;
  capturePolicyManagement: {
    getCapturePolicyForProject(input: {
      organization_id: string;
      project_id: string;
    }): Promise<ReturnType<typeof createPostgresCapturePolicyStore>["getCapturePolicyByProjectId"] extends (...args: never[]) => Promise<infer TResult> ? TResult : never>;
    upsertCapturePolicyForProject(input: {
      organization_id: string;
      project_id: string;
      update: CapturePolicyUpdate;
    }): Promise<
      | (ReturnType<typeof createPostgresCapturePolicyStore>["upsertCapturePolicy"] extends (...args: never[]) => Promise<infer TResult>
        ? TResult
        : never)
      | null
    >;
  };
  improvementSettingsManagement: {
    getImprovementSettingsForProject(input: {
      organization_id: string;
      project_id: string;
    }): Promise<
      ReturnType<typeof createPostgresImprovementSettingsStore>["getImprovementSettingsByProjectId"] extends (
        ...args: never[]
      ) => Promise<infer TResult>
        ? TResult
        : never
    >;
    updateImprovementSettingsForProject(input: {
      organization_id: string;
      project_id: string;
      update: ImprovementSettingsUpdate;
    }): Promise<
      | (ReturnType<typeof createPostgresImprovementSettingsStore>["updateImprovementSettings"] extends (
          ...args: never[]
        ) => Promise<infer TResult>
          ? TResult
          : never)
      | null
    >;
  };
  improvementManagement: Pick<
    ReturnType<typeof createPostgresImprovementOpportunityStore>,
    | "listImprovementsForOrganization"
    | "getImprovementForOrganization"
    | "resolveImprovementForOrganization"
    | "reopenImprovementForOrganization"
  >;
  incidentRetrieval: Pick<
    ReturnType<typeof createPostgresMetadataStore>,
    | "listIncidentsForOrganization"
    | "getIncidentForOrganization"
    | "resolveIncidentForOrganization"
    | "reopenIncidentForOrganization"
    | "getBundleFailureReasonForOrganization"
    | "getBundleSourceForOrganization"
    | "listServicesForOrganization"
    | "listIncidentLogsForOrganization"
  >;
  objectStoreReader: Pick<ObjectStoreReader, "getObject">;
  objectStoreWriter: Pick<ObjectStoreClient, "putObject">;
  bundleRegeneration: {
    requestRegeneration(input: {
      organization_id: string;
      project_id: string;
      incident_id: string;
    }): Promise<boolean>;
  };
  alertManagement: Pick<
    ReturnType<typeof createPostgresMetadataStore>,
    "listAlertsForOrganization" | "createAlertForOrganization" | "updateAlertForOrganization" | "deleteAlertForOrganization"
  >;
  slackManagement: ReturnType<typeof createPostgresSlackDestinationStore>;
  weeklyReportManagement: ReturnType<typeof createPostgresWeeklyReportChannelStore>;
  operationalEmailDelivery: ReturnType<typeof createPostgresOperationalEmailDeliveryStore>;
  webhookDelivery: ReturnType<typeof createPostgresWebhookDeliveryStore>;
  webhookTesting: {
    triggerTestDelivery(input: {
      organization_id: string;
      project_id?: string;
      webhook_id: string;
      event_type: WebhookEventType;
      actor_user_id?: string;
      actor_role?: "owner" | "admin" | "member";
    }): Promise<{ delivery_id: string; event_type: WebhookEventType } | null>;
  };
  webhookManagement: Pick<
    ReturnType<typeof createPostgresWebhookDeliveryStore>,
    | "listWebhooksForOrganization"
    | "createWebhookForOrganization"
    | "getWebhookForOrganization"
    | "updateWebhookForOrganization"
    | "deleteWebhookForOrganization"
  >;
  accountManagement: {
    exportAccountForOrganization(input: {
      organization_id: string;
      user_id: string;
      exported_at: string;
    }): Promise<import("../../../packages/storage/src/index.js").AccountDataExportRecord | null>;
    deleteAccountForOrganization(input: {
      organization_id: string;
      user_id: string;
      deleted_at: string;
    }): Promise<import("../../../packages/storage/src/index.js").DeletedAccountRecord | "other_owned_organizations_exist" | null>;
    getUserAvatar(input: {
      user_id: string;
    }): Promise<import("../../../packages/storage/src/index.js").UserAvatarRecord | null>;
    saveUserAvatar(input: {
      user_id: string;
      source: "github" | "gravatar";
      object_key: string;
      content_type: string;
      updated_at: string;
    }): Promise<import("../../../packages/storage/src/index.js").UserAvatarRecord | null>;
  };
} {
  const ingestionPersistence = createIngestionPersistenceService({
    objectStore: input.objectStore,
    queue: input.queue
  });

  const accountStore = createPostgresAccountStore(input.db);
  const auditLogStore = createPostgresAuditLogStore(input.db);
  const authStore = createPostgresAuthStore(input.db);
  const billingStore = createPostgresBillingStore(input.db);
  const billingSyncStore = createPostgresBillingSyncStore(input.db);
  const capturePolicyStore = createPostgresCapturePolicyStore(input.db);
  const improvementOpportunityStore = createPostgresImprovementOpportunityStore(input.db);
  const improvementSettingsStore = createPostgresImprovementSettingsStore(input.db);
  const metadataStore = createPostgresMetadataStore(input.db);
  const githubStore = createPostgresGitHubStore(input.db);
  const slackDestinationStore = createPostgresSlackDestinationStore(input.db);
  const weeklyReportChannelStore = createPostgresWeeklyReportChannelStore(input.db);
  const billingLinks = createEnvBillingLinkProvider();
  const githubAppClient = input.githubAppClient;
  const memberAuth = createMemberAuthService(metadataStore);
  const webAuthStore = {
    ...authStore,
    acceptProjectInvite: (request: {
      invite_token_hash: string;
      user_id: string;
      email: string;
      accepted_at: string;
    }) => metadataStore.acceptProjectInviteForUser!(request)
  };
  const signupEmailAllowlist = input.signupEmailAllowlist;
  const webAuth = createWebSessionAuthService(
    webAuthStore,
    {
      ...(signupEmailAllowlist === undefined ? {} : { signupEmailAllowlist }),
      ...(input.authEmails === undefined ? {} : { authEmails: input.authEmails }),
      ...(input.githubOAuth === undefined ? {} : { githubOAuth: input.githubOAuth })
    }
  );
  const githubCliAuth = createGitHubCliAuthService(authStore, {
    ...(signupEmailAllowlist === undefined ? {} : { signupEmailAllowlist }),
    ...(input.githubOAuth === undefined ? {} : { githubOAuth: input.githubOAuth })
  });
  const operationalEmailDelivery = createPostgresOperationalEmailDeliveryStore(input.db);
  const webhookDelivery = createPostgresWebhookDeliveryStore(input.db);
  const incidentLifecycle = createIncidentLifecycleService({
    incidentStore: metadataStore,
    webhookDeliveryStore: webhookDelivery,
    fallbackTargetUrl: input.lifecycleWebhookFallbackTargetUrl ?? null,
    fallbackSigningSecret: input.lifecycleWebhookFallbackSigningSecret ?? null,
    billingStore,
    operationalEmailDeliveryStore: operationalEmailDelivery
  });
  const webhookTesting = {
    triggerTestDelivery: async (request: {
      organization_id: string;
      project_id?: string;
      webhook_id: string;
      event_type: WebhookEventType;
      actor_user_id?: string;
      actor_role?: "owner" | "admin" | "member";
    }) => {
      const delivery = await webhookDelivery.createTestDeliveryForOrganization(request);
      if (delivery === null) {
        return null;
      }

      await input.queue.enqueue("deliver-webhook", {
        delivery_id: delivery.delivery_id,
        attempt: 1
      });

      return delivery;
    }
  };
  const ingestionMetadata =
    input.frequencyCounter === undefined
      ? createIngestionMetadataService(metadataStore)
      : createIngestionMetadataService(metadataStore, { frequencyCounter: input.frequencyCounter });
  const authEmails = input.authEmails;
  const inviteEmails =
    authEmails === undefined
      ? undefined
      : {
          sendProjectInviteEmail: (request: Parameters<AuthEmailSender["sendProjectInviteEmail"]>[0]) =>
            authEmails.sendProjectInviteEmail(request)
        };

  async function getOrganizationBillingState(organizationId: string): Promise<{
    plan: "free" | "solo" | "team";
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
  } | null> {
    const result = await input.db.query<{
      plan: string | null;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
    }>(
      `
        SELECT
          plan,
          stripe_customer_id,
          to_jsonb(organizations) ->> 'stripe_subscription_id' AS stripe_subscription_id
        FROM organizations
        WHERE id = $1
        LIMIT 1
      `,
      [organizationId]
    );

    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }

    return {
      plan: normalizeBillingPlan(row.plan),
      stripe_customer_id: row.stripe_customer_id ?? null,
      stripe_subscription_id: row.stripe_subscription_id ?? null
    };
  }

  async function getProjectedBillingSummary(inputValue: {
    organization_id: string;
    now: string;
  }): Promise<BillingSummaryRecord | null> {
    const summary = await billingStore.getBillingSummaryForOrganization(inputValue);
    if (summary === null || input.stripeConfig === undefined || summary.plan === "free") {
      return summary;
    }

    const organizationBillingState = await getOrganizationBillingState(inputValue.organization_id);
    if (organizationBillingState === null || organizationBillingState.stripe_subscription_id === null) {
      return summary;
    }

    try {
      const stripeState = await loadStripeBillingSubscriptionState({
        stripeConfig: input.stripeConfig,
        subscriptionId: organizationBillingState.stripe_subscription_id,
        fallbackPlan: organizationBillingState.plan,
        fallbackEffectiveAt: summary.usage_window.ends_at,
        timeoutMs: BILLING_SUMMARY_STRIPE_PROJECTION_TIMEOUT_MS
      });

      return projectBillingSummary({
        summary,
        plan: stripeState.plan,
        additionalPurchased: stripeState.additionalPurchased,
        pendingReduction: stripeState.pendingReduction
      });
    } catch {
      return summary;
    }
  }

  async function loadCapacityManagementContext(inputValue: {
    organization_id: string;
    now: string;
  }): Promise<
    | {
        summary: BillingSummaryRecord;
        organizationBillingState: {
          plan: "free" | "solo" | "team";
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
        };
        stripeState: Awaited<ReturnType<typeof loadStripeBillingSubscriptionState>>;
      }
    | "billing_not_configured"
    | "billing_not_found"
    | "no_active_subscription"
  > {
    const summary = await billingStore.getBillingSummaryForOrganization(inputValue);
    if (summary === null) {
      return "billing_not_found";
    }

    const organizationBillingState = await getOrganizationBillingState(inputValue.organization_id);
    if (organizationBillingState === null) {
      return "billing_not_found";
    }

    if (input.stripeConfig === undefined) {
      return "billing_not_configured";
    }

    if (organizationBillingState.plan === "free" || organizationBillingState.stripe_subscription_id === null) {
      return "no_active_subscription";
    }

    const stripeState = await loadStripeBillingSubscriptionState({
      stripeConfig: input.stripeConfig,
      subscriptionId: organizationBillingState.stripe_subscription_id,
      fallbackPlan: organizationBillingState.plan,
      fallbackEffectiveAt: summary.usage_window.ends_at
    });

    return {
      summary: projectBillingSummary({
        summary,
        plan: stripeState.plan,
        additionalPurchased: stripeState.additionalPurchased,
        pendingReduction: stripeState.pendingReduction
      }),
      organizationBillingState,
      stripeState
    };
  }

  return {
    ingestionPersistence,
    ingestionMetadata,
    ...(input.ingestionRateLimiter === undefined ? {} : { ingestionRateLimiter: input.ingestionRateLimiter }),
    ...(input.authRateLimiter === undefined ? {} : { authRateLimiter: input.authRateLimiter }),
    auditLogging: auditLogStore,
    memberAuth,
    webAuth,
    githubCliAuth,
    ...(inviteEmails === undefined ? {} : { inviteEmails }),
    ...(input.billingEmails === undefined ? {} : { billingEmails: input.billingEmails }),
    tokenManagement: {
      listProjectTokensForOrganization: (input) => metadataStore.listProjectTokensForOrganization(input),
      createProjectTokenForOrganization: (input) => metadataStore.createProjectTokenForOrganization(input),
      revokeProjectTokenForOrganization: (input) => metadataStore.revokeProjectTokenForOrganization(input),
      listMemberTokensForOrganization: (input) => metadataStore.listMemberTokensForOrganization(input),
      createMemberTokenForOrganization: (input) => metadataStore.createMemberTokenForOrganization(input),
      revokeMemberTokenForOrganization: (input) => metadataStore.revokeMemberTokenForOrganization(input)
    },
    projectManagement: {
      resolveProjectAccessForUser: (input) => metadataStore.resolveProjectAccessForUser!(input),
      listProjectsForUser: (input) => metadataStore.listProjectsForUser!(input),
      createProjectForUser: (input) => metadataStore.createProjectForUser!(input),
      updateProjectForUser: (input) => metadataStore.updateProjectForUser!(input),
      deleteProjectForUser: async (deleteInput) => {
        const result = await metadataStore.deleteProjectForUser!(deleteInput);
        if (result !== null) {
          await deleteProjectObjects(input.objectStore, deleteInput.project_id).catch(() => undefined);
        }
        return result;
      },
      listProjectsForOrganization: (input) => metadataStore.listProjectsForOrganization(input),
      createProjectForOrganization: (input) => metadataStore.createProjectForOrganization(input),
      updateProjectForOrganization: (input) => metadataStore.updateProjectForOrganization(input),
      deleteProjectForOrganization: async (deleteInput) => {
        const result = await metadataStore.deleteProjectForOrganization(deleteInput);
        if (result !== null) {
          await deleteProjectObjects(input.objectStore, deleteInput.project_id).catch(() => undefined);
        }
        return result;
      }
    },
    accountManagement: {
      exportAccountForOrganization: async (exportInput: {
        organization_id: string;
        user_id: string;
        exported_at: string;
      }) => {
        const result = await accountStore.exportAccountForOrganization(exportInput);
        if (result === null) {
          return null;
        }

        return {
          ...result,
          artifacts: await buildAccountExportArtifacts(input.objectStore, result),
        };
      },
      deleteAccountForOrganization: async (deleteInput: {
        organization_id: string;
        user_id: string;
        deleted_at: string;
      }) => {
        const result = await accountStore.deleteAccountForOrganization(deleteInput);
        if (result !== null && result !== "other_owned_organizations_exist") {
          await Promise.all(
            result.deleted_project_ids.map((projectId) => deleteProjectObjects(input.objectStore, projectId).catch(() => undefined)),
          );
          if (result.user_deleted && input.objectStore.deleteObject !== undefined) {
            await input.objectStore.deleteObject({
              key: buildUserAvatarObjectKey(deleteInput.user_id)
            }).catch(() => undefined);
          }
        }

        return result;
      },
      getUserAvatar: (request) => accountStore.getUserAvatar(request),
      saveUserAvatar: (request) => accountStore.saveUserAvatar(request),
    },
    billingManagement: {
      getBillingSummaryForOrganization: (input) => getProjectedBillingSummary(input),
      getBillingSummaryForProject: (input) => billingStore.getBillingSummaryForProject(input),
      incrementOrgUsageCounter: (input) => billingStore.incrementOrgUsageCounter(input),
      createCheckoutLink: async (checkoutInput: {
        organization_id: string;
        billing_email: string;
        current_plan: "free" | "solo" | "team";
        target_plan: "solo" | "team";
      }) => {
        // Prefer dynamic Stripe Checkout Sessions when Stripe is configured
        if (input.stripeConfig !== undefined) {
          const stripe = input.stripeConfig;
          const priceId = checkoutInput.target_plan === "solo" ? stripe.soloPriceId : stripe.teamPriceId;

          // Check if the org already has a Stripe customer
          const orgResult = await input.db.query<{ stripe_customer_id: string | null }>(
            `SELECT stripe_customer_id FROM organizations WHERE id = $1 LIMIT 1`,
            [checkoutInput.organization_id]
          );
          const existingCustomerId = orgResult.rows[0]?.stripe_customer_id ?? null;

          const sessionParams: Record<string, unknown> = {
            mode: "subscription",
            client_reference_id: checkoutInput.organization_id,
            metadata: { organization_id: checkoutInput.organization_id },
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${process.env["APP_BASE_URL"] ?? "http://localhost:3000"}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env["APP_BASE_URL"] ?? "http://localhost:3000"}/billing?checkout=canceled`,
            allow_promotion_codes: true,
            subscription_data: {
              metadata: { organization_id: checkoutInput.organization_id }
            }
          };

          if (existingCustomerId !== null) {
            sessionParams["customer"] = existingCustomerId;
          } else {
            sessionParams["customer_email"] = checkoutInput.billing_email;
          }

          try {
            const session = await stripe.client.checkout.sessions.create(sessionParams as Parameters<typeof stripe.client.checkout.sessions.create>[0]);
            return session.url ? { url: session.url } : null;
          } catch {
            return null;
          }
        }

        // Fallback to static URLs for development
        const url = billingLinks.createCheckoutUrl({ target_plan: checkoutInput.target_plan });
        return Promise.resolve(url === null ? null : { url });
      },
      confirmCheckoutSession: async (confirmInput) => {
        if (input.stripeConfig === undefined) {
          return "billing_not_configured";
        }

        let session: Stripe.Checkout.Session;
        try {
          session = await input.stripeConfig.client.checkout.sessions.retrieve(confirmInput.session_id, {
            expand: ["subscription", "subscription.items.data", "subscription.latest_invoice"]
          });
        } catch {
          return "checkout_session_not_found";
        }

        const sessionOrganizationId = session.client_reference_id ?? session.metadata?.["organization_id"] ?? null;
        if (sessionOrganizationId !== confirmInput.organization_id) {
          return "checkout_session_not_found";
        }

        if (session.status !== "complete") {
          return "checkout_not_complete";
        }

        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (subscriptionId === undefined) {
          return "checkout_not_complete";
        }

        let subscription: Stripe.Subscription;
        try {
          if (typeof session.subscription === "string") {
            subscription = await input.stripeConfig.client.subscriptions.retrieve(subscriptionId, {
              expand: ["items.data", "latest_invoice"]
            });
          } else if (session.subscription !== null) {
            subscription = session.subscription;
          } else {
            return "checkout_not_complete";
          }
        } catch {
          return "billing_service_error";
        }

        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        if (customerId === undefined) {
          return "checkout_not_complete";
        }

        const { plan, extraCapacityQuantity } = derivePlanFromSubscriptionItems(
          subscription.items.data,
          input.stripeConfig.priceMap
        );
        const billingState = deriveBillingState(subscription.status);
        const effectivePlan = isEntitlementEligible(billingState, "plan") ? plan : "free";
        const effectiveExtraCapacity = isEntitlementEligible(billingState, "extra_capacity") ? extraCapacityQuantity : 0;
        const period = effectivePlan === "free"
          ? { starts_at: null, ends_at: null }
          : resolveStripeSubscriptionBillingPeriod(subscription);

        try {
          await billingSyncStore.linkStripeCustomer(confirmInput.organization_id, customerId, subscription.id);
          await billingSyncStore.updateEntitlements({
            organization_id: confirmInput.organization_id,
            plan: effectivePlan,
            additional_capacity_units: effectiveExtraCapacity,
            billing_state: billingState,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
            billing_period_starts_at: period.starts_at,
            billing_period_ends_at: period.ends_at,
            last_billing_sync_at: confirmInput.now,
            last_billing_event_id: `checkout_session:${session.id}`
          });
        } catch {
          return "billing_service_error";
        }

        const billing = await getProjectedBillingSummary({
          organization_id: confirmInput.organization_id,
          now: confirmInput.now
        });

        return billing ?? "billing_not_found";
      },
      createPortalLink: async (portalInput: {
        organization_id: string;
        current_plan: "solo" | "team";
      }) => {
        if (input.stripeConfig !== undefined) {
          // Look up the Stripe customer ID
          const orgResult = await input.db.query<{ stripe_customer_id: string | null }>(
            `SELECT stripe_customer_id FROM organizations WHERE id = $1 LIMIT 1`,
            [portalInput.organization_id]
          );
          const customerId = orgResult.rows[0]?.stripe_customer_id;
          if (customerId === undefined || customerId === null) {
            return null;
          }

          try {
            const session = await input.stripeConfig.client.billingPortal.sessions.create({
              customer: customerId,
              return_url: `${process.env["APP_BASE_URL"] ?? "http://localhost:3000"}/billing`
            });
            return { url: session.url };
          } catch {
            return null;
          }
        }

        // Fallback to static URLs for development
        void portalInput;
        const url = billingLinks.createPortalUrl();
        return Promise.resolve(url === null ? null : { url });
      },
      increaseCapacity: async (capacityInput) => {
        let context: Awaited<ReturnType<typeof loadCapacityManagementContext>>;

        try {
          context = await loadCapacityManagementContext(capacityInput);
        } catch {
          return "billing_not_configured";
        }

        if (typeof context === "string") {
          return context;
        }

        if (capacityInput.target_additional_capacity_units <= context.stripeState.additionalPurchased) {
          return "invalid_target_quantity";
        }

        if (context.stripeState.pendingReduction !== null) {
          return "pending_capacity_reduction_exists";
        }

        try {
          await input.stripeConfig!.client.subscriptions.update(context.stripeState.subscription.id, {
            items: buildSubscriptionItemsForQuantity({
              subscription: context.stripeState.subscription,
              stripeConfig: input.stripeConfig!,
              targetAdditionalPurchased: capacityInput.target_additional_capacity_units,
              plan: context.stripeState.plan
            }),
            proration_behavior: "always_invoice"
          });
        } catch {
          return "billing_not_configured";
        }

        return projectBillingSummary({
          summary: context.summary,
          plan: context.stripeState.plan,
          additionalPurchased: capacityInput.target_additional_capacity_units,
          pendingReduction: null
        });
      },
      scheduleCapacityReduction: async (capacityInput) => {
        let context: Awaited<ReturnType<typeof loadCapacityManagementContext>>;

        try {
          context = await loadCapacityManagementContext(capacityInput);
        } catch {
          return "billing_not_configured";
        }

        if (typeof context === "string") {
          return context;
        }

        if (
          capacityInput.target_additional_capacity_units < 0 ||
          capacityInput.target_additional_capacity_units >= context.stripeState.additionalPurchased
        ) {
          return "invalid_target_quantity";
        }

        const pendingReduction = {
          additional_purchased: capacityInput.target_additional_capacity_units,
          total: context.summary.capacity_units.included + capacityInput.target_additional_capacity_units,
          effective_at: context.summary.usage_window.ends_at
        };

        try {
          const scheduleId =
            context.stripeState.schedule?.id ??
            (
              await input.stripeConfig!.client.subscriptionSchedules.create({
                from_subscription: context.stripeState.subscription.id
              })
            ).id;

          await input.stripeConfig!.client.subscriptionSchedules.update(scheduleId, {
            end_behavior: "release",
            proration_behavior: "none",
            phases: buildSchedulePhasesForReduction({
              subscription: context.stripeState.subscription,
              stripeConfig: input.stripeConfig!,
              summary: context.summary,
              targetAdditionalPurchased: capacityInput.target_additional_capacity_units,
              plan: context.stripeState.plan
            })
          });
        } catch {
          return "billing_not_configured";
        }

        return projectBillingSummary({
          summary: context.summary,
          plan: context.stripeState.plan,
          additionalPurchased: context.stripeState.additionalPurchased,
          pendingReduction
        });
      },
      cancelCapacityReduction: async (capacityInput) => {
        let context: Awaited<ReturnType<typeof loadCapacityManagementContext>>;

        try {
          context = await loadCapacityManagementContext(capacityInput);
        } catch {
          return "billing_not_configured";
        }

        if (typeof context === "string") {
          return context;
        }

        if (context.stripeState.schedule === null || context.stripeState.pendingReduction === null) {
          return "capacity_reduction_not_found";
        }

        try {
          await input.stripeConfig!.client.subscriptionSchedules.release(context.stripeState.schedule.id);
        } catch {
          return "billing_not_configured";
        }

        return projectBillingSummary({
          summary: context.summary,
          plan: context.stripeState.plan,
          additionalPurchased: context.stripeState.additionalPurchased,
          pendingReduction: null
        });
      }
    },
    projectCollaboration: {
      listMembersForProject: (input) => metadataStore.listMembersForProject!(input),
      listPendingInvitesForProject: (input) => metadataStore.listPendingInvitesForProject!(input),
      createInviteForProject: (input) => metadataStore.createInviteForProject!(input),
      cancelInviteForProject: (input) => metadataStore.cancelInviteForProject!(input),
      updateProjectMemberRole: (input) => metadataStore.updateProjectMemberRole!(input),
      removeProjectMember: (input) => metadataStore.removeProjectMember!(input)
    },
    ...(githubAppClient === undefined
      ? {}
      : {
          githubManagement: {
            getInstallUrl: () => githubAppClient.getInstallUrl(),
            getInstallationForOrganization: (input) => githubStore.getGitHubInstallationForOrganization(input),
            disconnectInstallationForOrganization: (input) => githubStore.deleteGitHubInstallationForOrganization(input),
            async listRepositoriesForOrganization(requestInput) {
              const installation = await githubStore.getGitHubInstallationForOrganization({
                organization_id: requestInput.organization_id
              });
              if (installation === null) {
                return "installation_not_found";
              }
              if (installation.status === "suspended") {
                return "installation_suspended";
              }
              if (installation.status === "removed") {
                return "installation_removed";
              }

              return githubAppClient.listRepositories({ installationId: installation.installation_id });
            },
            getProjectRepoForOrganization: (input) => githubStore.getProjectGitHubRepoForOrganization(input),
            async listProjectDeliveriesForOrganization(requestInput: {
              organization_id: string;
              project_id: string;
              status?: "pending" | "retrying" | "delivered" | "failed" | "skipped";
              limit: number;
            }) {
              return githubStore.listProjectGitHubDeliveriesForOrganization(requestInput);
            },
            async retryProjectDeliveryForOrganization(requestInput: {
              organization_id: string;
              project_id: string;
              delivery_id: string;
              actor_user_id?: string;
              actor_role?: "owner" | "admin" | "member";
            }) {
              const installation = await githubStore.getGitHubInstallationForOrganization({
                organization_id: requestInput.organization_id
              });
              if (installation === null) {
                return "installation_not_found";
              }
              if (installation.status === "suspended") {
                return "installation_suspended";
              }
              if (installation.status === "removed") {
                return "installation_removed";
              }

              const repo = await githubStore.getProjectGitHubRepoForOrganization({
                organization_id: requestInput.organization_id,
                project_id: requestInput.project_id
              });
              if (repo === null) {
                return "repo_not_found";
              }

              const retried = await githubStore.retryProjectGitHubDeliveryForOrganization(requestInput);
              return retried ?? "delivery_not_found";
            },
            listProjectRulesForOrganization: (requestInput: { organization_id: string; project_id: string }) =>
              githubStore.listProjectGitHubRulesForOrganization(requestInput),
            getProjectRuleForOrganization: (requestInput: {
              organization_id: string;
              project_id: string;
              rule_id: string;
            }) => githubStore.getProjectGitHubRuleForOrganization(requestInput),
            async createProjectRuleForOrganization(requestInput: {
              organization_id: string;
              project_id: string;
              created_by_user_id: string;
              name: string;
              enabled: boolean;
              event_types: string[];
              environments: string[];
              services: string[];
              severity_min: "low" | "medium" | "high" | "critical";
              bundle_type: "failure" | "improvement";
              incident_status: "new_only" | "reopened_only" | "new_or_reopened";
              cooldown_seconds: number;
            }) {
              const repo = await githubStore.getProjectGitHubRepoForOrganization({
                organization_id: requestInput.organization_id,
                project_id: requestInput.project_id
              });
              if (repo === null) {
                const scopedProject = await metadataStore.listProjectsForOrganization({
                  organization_id: requestInput.organization_id,
                  now: new Date().toISOString(),
                  limit: 1_000
                });

                return scopedProject.some((project) => project.project_id === requestInput.project_id)
                  ? "repo_not_found"
                  : "project_not_found";
              }

              const billingSummary = await getProjectedBillingSummary({
                organization_id: requestInput.organization_id,
                now: new Date().toISOString()
              });
              const ruleLimit = billingSummary?.plan === "team" ? 20 : 3;
              const existingRules =
                (await githubStore.listProjectGitHubRulesForOrganization({
                  organization_id: requestInput.organization_id,
                  project_id: requestInput.project_id
                })) ?? [];
              if (existingRules.length >= ruleLimit) {
                return "rule_limit_reached";
              }

              const created = await githubStore.createProjectGitHubRuleForOrganization(requestInput);
              return created ?? "project_not_found";
            },
            async updateProjectRuleForOrganization(requestInput: {
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
              severity_min?: "low" | "medium" | "high" | "critical";
              bundle_type?: "failure" | "improvement";
              incident_status?: "new_only" | "reopened_only" | "new_or_reopened";
              cooldown_seconds?: number;
            }) {
              const updated = await githubStore.updateProjectGitHubRuleForOrganization(requestInput);
              return updated ?? "rule_not_found";
            },
            deleteProjectRuleForOrganization: (requestInput: {
              organization_id: string;
              project_id: string;
              rule_id: string;
              actor_user_id?: string;
              actor_role?: "owner" | "admin" | "member";
            }) => githubStore.deleteProjectGitHubRuleForOrganization(requestInput),
            async setProjectRepoForOrganization(requestInput) {
              const installation = await githubStore.getGitHubInstallationForOrganization({
                organization_id: requestInput.organization_id
              });
              if (installation === null) {
                return "installation_not_found";
              }
              if (installation.status === "suspended") {
                return "installation_suspended";
              }
              if (installation.status === "removed") {
                return "installation_removed";
              }

              const repositories = await githubAppClient.listRepositories({ installationId: installation.installation_id });
              const repository = repositories.find(
                (candidate) => candidate.owner === requestInput.owner && candidate.name === requestInput.repo
              );
              if (repository === undefined) {
                return "repo_not_found";
              }

              const stored = await githubStore.upsertProjectGitHubRepoForOrganization({
                organization_id: requestInput.organization_id,
                project_id: requestInput.project_id,
                installation_id: installation.id,
                repo_owner: repository.owner,
                repo_name: repository.name,
                default_branch: repository.default_branch
              });

              if (stored === null) {
                return "project_not_found";
              }

              const existingRules = await githubStore.listProjectGitHubRulesForOrganization({
                organization_id: requestInput.organization_id,
                project_id: requestInput.project_id
              });
              if (existingRules === null || existingRules.length === 0) {
                await githubStore.createProjectGitHubRuleForOrganization({
                  organization_id: requestInput.organization_id,
                  project_id: requestInput.project_id,
                  created_by_user_id: requestInput.created_by_user_id,
                  name: "Default triage rule",
                  enabled: true,
                  event_types: ["bundle.created", "bundle.reopened"],
                  environments: [],
                  services: [],
                  severity_min: "high",
                  bundle_type: null,
                  incident_status: "new_or_reopened",
                  cooldown_seconds: 300
                });
              }

              return stored;
            },
            removeProjectRepoForOrganization: (input) => githubStore.deleteProjectGitHubRepoForOrganization(input),
            async completeGithubInstallationForOrganization(requestInput) {
              const installation = await githubAppClient.getInstallation({ installationId: requestInput.installation_id });

              return githubStore.upsertGitHubInstallationForOrganization({
                organization_id: requestInput.organization_id,
                installation_id: installation.installation_id,
                account_login: installation.account_login,
                account_type: installation.account_type,
                status: "active"
              });
            },
            verifyWebhookSignature: (input) => githubAppClient.verifyWebhookSignature(input),
            async processWebhook(input) {
              if (input.eventName !== "installation") {
                return;
              }

              const installation =
                typeof input.payload["installation"] === "object" && input.payload["installation"] !== null
                  ? (input.payload["installation"] as Record<string, unknown>)
                  : null;
              const installationId = installation?.["id"];
              if (typeof installationId !== "number") {
                return;
              }

              const action = input.payload["action"];
              const nextStatus =
                action === "deleted"
                  ? "removed"
                  : action === "suspend"
                    ? "suspended"
                    : action === "unsuspend" || action === "created"
                      ? "active"
                      : null;
              if (nextStatus === null) {
                return;
              }

              const account =
                typeof installation?.["account"] === "object" && installation["account"] !== null
                  ? (installation["account"] as Record<string, unknown>)
                  : null;

              await githubStore.updateGitHubInstallationStatus({
                installation_id: installationId,
                status: nextStatus,
                ...(typeof account?.["login"] === "string" ? { account_login: account["login"] } : {}),
                ...(account?.["type"] === "Organization" || account?.["type"] === "User"
                  ? { account_type: account["type"] }
                  : {})
              });
            }
          }
        }),
    probeManagement: {
      listActiveProbesForProject: (input) => metadataStore.listActiveProbesForProject(input),
      listActiveProbesForProjectInOrganization: (input) => metadataStore.listActiveProbesForProjectInOrganization(input),
      createProbeActivationForProjectInOrganization: (input) =>
        metadataStore.createProbeActivationForProjectInOrganization(input),
      deactivateProbeActivationForProjectInOrganization: (input) =>
        metadataStore.deactivateProbeActivationForProjectInOrganization(input)
    },
    capturePolicyManagement: {
      getCapturePolicyForProject: (input: { organization_id: string; project_id: string }) => {
        void input.organization_id;
        return capturePolicyStore.getCapturePolicyByProjectId(input.project_id);
      },
      upsertCapturePolicyForProject: async (input: {
        organization_id: string;
        project_id: string;
        update: CapturePolicyUpdate;
      }) => {
        const existingRecord = await capturePolicyStore.getCapturePolicyByProjectId(input.project_id);
        let preset = existingRecord?.preset;

        if (preset === undefined) {
          const projects = await metadataStore.listProjectsForOrganization({
            organization_id: input.organization_id,
            now: new Date().toISOString(),
            limit: 1_000
          });
          const project = projects.find((candidate) => candidate.project_id === input.project_id);
          if (project === undefined) {
            return null;
          }

          preset = getDefaultPreset(project.organization_plan);
        }

        const record = await capturePolicyStore.upsertCapturePolicy({
          project_id: input.project_id,
          preset: input.update.preset ?? preset,
          capture_logs:
            input.update.capture_logs !== undefined
              ? input.update.capture_logs
              : (existingRecord?.capture_logs ?? null),
          capture_request_events:
            input.update.capture_request_events !== undefined
              ? input.update.capture_request_events
              : (existingRecord?.capture_request_events ?? null),
          capture_breadcrumbs:
            input.update.capture_breadcrumbs !== undefined
              ? input.update.capture_breadcrumbs
              : (existingRecord?.capture_breadcrumbs ?? null),
          capture_probe_events:
            input.update.capture_probe_events !== undefined
              ? input.update.capture_probe_events
              : (existingRecord?.capture_probe_events ?? null),
          immediate_client_error_statuses:
            input.update.immediate_client_error_statuses !== undefined
              ? input.update.immediate_client_error_statuses
              : (existingRecord?.immediate_client_error_statuses ?? null)
        });
        return record;
      }
    },
    improvementSettingsManagement: {
      getImprovementSettingsForProject: (input: { organization_id: string; project_id: string }) => {
        void input.organization_id;
        return improvementSettingsStore.getImprovementSettingsByProjectId(input.project_id);
      },
      updateImprovementSettingsForProject: (input: {
        organization_id: string;
        project_id: string;
        update: ImprovementSettingsUpdate;
      }) => {
        void input.organization_id;
        const update: {
          project_id: string;
          automated_improvement_bundles_enabled?: boolean;
          improvement_bundle_sensitivity?: "high_confidence" | "balanced" | "verbose";
        } = {
          project_id: input.project_id
        };

        if (input.update.automated_improvement_bundles_enabled !== undefined) {
          update.automated_improvement_bundles_enabled = input.update.automated_improvement_bundles_enabled;
        }
        if (input.update.improvement_bundle_sensitivity !== undefined) {
          update.improvement_bundle_sensitivity = input.update.improvement_bundle_sensitivity;
        }

        return improvementSettingsStore.updateImprovementSettings(update);
      }
    },
    improvementManagement: {
      listImprovementsForOrganization: (input) => improvementOpportunityStore.listImprovementsForOrganization(input),
      getImprovementForOrganization: (input) => improvementOpportunityStore.getImprovementForOrganization(input),
      resolveImprovementForOrganization: (input) => improvementOpportunityStore.resolveImprovementForOrganization(input),
      reopenImprovementForOrganization: (input) => improvementOpportunityStore.reopenImprovementForOrganization(input)
    },
    incidentRetrieval: {
      listIncidentsForOrganization: (input) => metadataStore.listIncidentsForOrganization(input),
      getIncidentForOrganization: (input) => metadataStore.getIncidentForOrganization(input),
      resolveIncidentForOrganization: (input) => incidentLifecycle.resolveIncidentForOrganization(input),
      reopenIncidentForOrganization: (input) => incidentLifecycle.reopenIncidentForOrganization(input),
      getBundleFailureReasonForOrganization: (input) => metadataStore.getBundleFailureReasonForOrganization!(input),
      getBundleSourceForOrganization: (input) => metadataStore.getBundleSourceForOrganization!(input),
      listServicesForOrganization: (input) => metadataStore.listServicesForOrganization!(input),
      listIncidentLogsForOrganization: (input) => metadataStore.listIncidentLogsForOrganization(input)
    },
    objectStoreReader: {
      getObject: (request) => input.objectStore.getObject(request)
    },
    objectStoreWriter: {
      putObject: (request: Parameters<ObjectStoreClient["putObject"]>[0]) => input.objectStore.putObject(request)
    },
    bundleRegeneration: {
      async requestRegeneration(regenerationInput) {
        const queueWithLease = input.queue as QueueClient & Partial<Pick<RedisQueueClient, "acquireLease" | "releaseLease">>;
        const leaseKey = buildBundleRegenerationLeaseKey(regenerationInput.incident_id);

        if (queueWithLease.acquireLease !== undefined) {
          const acquired = await queueWithLease.acquireLease(leaseKey, BUNDLE_REGENERATION_LEASE_TTL_SECONDS);
          if (!acquired) {
            return false;
          }
        }

        const source = await metadataStore.getBundleSourceForOrganization!({
          organization_id: regenerationInput.organization_id,
          incident_id: regenerationInput.incident_id
        });

        if (source === null) {
          await queueWithLease.releaseLease?.(leaseKey);
          return false;
        }

        try {
          await metadataStore.markBundleGenerationFailure!({
            incident_id: regenerationInput.incident_id,
            reason: null
          });

          await input.queue.enqueue("build-bundle", {
            project_id: regenerationInput.project_id,
            incident_id: regenerationInput.incident_id,
            event_id: source.event_id,
            occurred_at: source.occurred_at,
            occurrence_count: source.occurrence_count,
            trigger: "regeneration"
          });
        } catch (error) {
          await queueWithLease.releaseLease?.(leaseKey);
          throw error;
        }

        return true;
      }
    },
    alertManagement: {
      listAlertsForOrganization: (input) => metadataStore.listAlertsForOrganization(input),
      createAlertForOrganization: (input) => metadataStore.createAlertForOrganization(input),
      updateAlertForOrganization: (input) => metadataStore.updateAlertForOrganization(input),
      deleteAlertForOrganization: (input) => metadataStore.deleteAlertForOrganization(input)
    },
    slackManagement: slackDestinationStore,
    weeklyReportManagement: weeklyReportChannelStore,
    operationalEmailDelivery,
    webhookDelivery,
    webhookTesting,
    webhookManagement: {
      listWebhooksForOrganization: (input) => webhookDelivery.listWebhooksForOrganization(input),
      createWebhookForOrganization: (input) => webhookDelivery.createWebhookForOrganization(input),
      getWebhookForOrganization: (input) => webhookDelivery.getWebhookForOrganization(input),
      updateWebhookForOrganization: (input) => webhookDelivery.updateWebhookForOrganization(input),
      deleteWebhookForOrganization: (input) => webhookDelivery.deleteWebhookForOrganization(input)
    },
    ...(input.stripeConfig !== undefined ? {
      stripeConfig: input.stripeConfig,
      billingSyncStore
    } : {})
  };
}

export function createApiDependenciesFromEnv(env: Record<string, string | undefined>): {
  ingestionPersistence: ReturnType<typeof createIngestionPersistenceService>;
  ingestionMetadata: ReturnType<typeof createIngestionMetadataService>;
  ingestionRateLimiter?: IngestionRateLimiter;
  auditLogging: ReturnType<typeof createPostgresAuditLogStore>;
  memberAuth: ReturnType<typeof createMemberAuthService>;
  webAuth: Pick<
    WebSessionAuthService,
    | "requestEmailCode"
    | "verifyEmailCode"
    | "beginGithubAuth"
    | "completeGithubAuth"
    | "acceptInviteForSession"
    | "resolveSessionByToken"
    | "revokeSessionByToken"
  >;
  githubCliAuth: Pick<
    GitHubCliAuthService,
    "beginDeviceAuth" | "pollDeviceAuth" | "claimDeviceAuth" | "exchangeGitHubAccessToken"
  >;
  inviteEmails?: Pick<AuthEmailSender, "sendProjectInviteEmail">;
  billingEmails?: BillingEmailService;
  tokenManagement: Pick<
    ReturnType<typeof createPostgresMetadataStore>,
    | "listProjectTokensForOrganization"
    | "createProjectTokenForOrganization"
    | "revokeProjectTokenForOrganization"
    | "listMemberTokensForOrganization"
    | "createMemberTokenForOrganization"
    | "revokeMemberTokenForOrganization"
  >;
  projectManagement: Pick<
    ReturnType<typeof createPostgresMetadataStore>,
    "listProjectsForOrganization" | "createProjectForOrganization" | "updateProjectForOrganization" | "deleteProjectForOrganization"
  >;
  billingManagement: {
    getBillingSummaryForOrganization: ReturnType<typeof createPostgresBillingStore>["getBillingSummaryForOrganization"];
    getBillingSummaryForProject: ReturnType<typeof createPostgresBillingStore>["getBillingSummaryForProject"];
    incrementOrgUsageCounter: ReturnType<typeof createPostgresBillingStore>["incrementOrgUsageCounter"];
    createCheckoutLink(input: {
      organization_id: string;
      billing_email: string;
      current_plan: "free" | "solo" | "team";
      target_plan: "solo" | "team";
    }): Promise<{ url: string } | null>;
    createPortalLink(input: {
      organization_id: string;
      current_plan: "solo" | "team";
    }): Promise<{ url: string } | null>;
    increaseCapacity(input: {
      organization_id: string;
      target_additional_capacity_units: number;
      now: string;
    }): Promise<BillingSummaryRecord | "billing_not_configured" | "billing_not_found" | "no_active_subscription" | "invalid_target_quantity" | "pending_capacity_reduction_exists">;
    scheduleCapacityReduction(input: {
      organization_id: string;
      target_additional_capacity_units: number;
      now: string;
    }): Promise<BillingSummaryRecord | "billing_not_configured" | "billing_not_found" | "no_active_subscription" | "invalid_target_quantity">;
    cancelCapacityReduction(input: {
      organization_id: string;
      now: string;
    }): Promise<BillingSummaryRecord | "billing_not_configured" | "billing_not_found" | "no_active_subscription" | "capacity_reduction_not_found">;
  };
  probeManagement: Pick<
    ReturnType<typeof createPostgresMetadataStore>,
    | "listActiveProbesForProject"
    | "listActiveProbesForProjectInOrganization"
    | "createProbeActivationForProjectInOrganization"
    | "deactivateProbeActivationForProjectInOrganization"
  >;
  incidentRetrieval: Pick<
    ReturnType<typeof createPostgresMetadataStore>,
    | "listIncidentsForOrganization"
    | "getIncidentForOrganization"
    | "resolveIncidentForOrganization"
    | "reopenIncidentForOrganization"
    | "getBundleFailureReasonForOrganization"
    | "getBundleSourceForOrganization"
    | "listServicesForOrganization"
    | "listIncidentLogsForOrganization"
  >;
  objectStoreReader: Pick<ObjectStoreReader, "getObject">;
  bundleRegeneration: {
    requestRegeneration(input: {
      organization_id: string;
      project_id: string;
      incident_id: string;
    }): Promise<boolean>;
  };
  alertManagement: Pick<
    ReturnType<typeof createPostgresMetadataStore>,
    "listAlertsForOrganization" | "createAlertForOrganization" | "updateAlertForOrganization" | "deleteAlertForOrganization"
  >;
  slackManagement: ReturnType<typeof createPostgresSlackDestinationStore>;
  weeklyReportManagement: ReturnType<typeof createPostgresWeeklyReportChannelStore>;
  operationalEmailDelivery: ReturnType<typeof createPostgresOperationalEmailDeliveryStore>;
  webhookDelivery: ReturnType<typeof createPostgresWebhookDeliveryStore>;
  webhookTesting: {
    triggerTestDelivery(input: {
      organization_id: string;
      project_id?: string;
      webhook_id: string;
      event_type: WebhookEventType;
      actor_user_id?: string;
      actor_role?: "owner" | "admin" | "member";
    }): Promise<{ delivery_id: string; event_type: WebhookEventType } | null>;
  };
  webhookManagement: Pick<
    ReturnType<typeof createPostgresWebhookDeliveryStore>,
    | "listWebhooksForOrganization"
    | "createWebhookForOrganization"
    | "getWebhookForOrganization"
    | "updateWebhookForOrganization"
    | "deleteWebhookForOrganization"
  >;
} {
  const githubOAuth = createGithubOAuthConfigFromEnv(env);
  const dbSsl = buildPostgresSslConfig(env["DB_SSL_MODE"]);
  const dbPool = new Pool({
    host: env["DB_HOST"] ?? "localhost",
    port: Number(env["DB_PORT"] ?? "5432"),
    user: env["DB_USER"] ?? "debugbundle",
    password: env["DB_PASSWORD"] ?? "debugbundle",
    database: env["DB_NAME"] ?? "debugbundle",
    ...(dbSsl === undefined ? {} : { ssl: dbSsl })
  });

  const queue = createRedisQueueClient({
    redisUrl: env["REDIS_URL"] ?? "redis://localhost:6379"
  });

  const frequencyCounter = createRedisIncidentFrequencyCounter({
    redisUrl: env["REDIS_URL"] ?? "redis://localhost:6379",
    snapshotStore: {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => dbPool.query<Row>(sql, params)
    }
  });

  const objectStore = createS3ObjectStoreClient({
    endpoint: env["S3_ENDPOINT"] ?? "http://localhost:4566",
    region: env["S3_REGION"] ?? "us-east-1",
    bucket: env["S3_BUCKET"] ?? "debugbundle-raw-events",
    accessKeyId: env["AWS_ACCESS_KEY_ID"] ?? "test",
    secretAccessKey: env["AWS_SECRET_ACCESS_KEY"] ?? "test",
    forcePathStyle: true
  });
  const authEmails =
    env["SES_FROM_EMAIL"] !== undefined
      ? createSesEmailTransport({
          region: env["SES_REGION"] ?? env["S3_REGION"] ?? "us-east-1",
          fromEmail: formatProductFromEmail(env["SES_FROM_EMAIL"]),
          ...(env["AWS_ACCESS_KEY_ID"] === undefined || env["AWS_SECRET_ACCESS_KEY"] === undefined
            ? {}
            : {
                accessKeyId: env["AWS_ACCESS_KEY_ID"],
                secretAccessKey: env["AWS_SECRET_ACCESS_KEY"]
              }),
          timeoutMs: Number(env["AUTH_EMAIL_TIMEOUT_MS"] ?? env["WEEKLY_REPORT_EMAIL_TIMEOUT_MS"] ?? "10000")
        })
      : undefined;

  const appBaseUrl = env["APP_BASE_URL"] ?? "http://localhost:3000";
  const authEmailSender =
    authEmails === undefined
      ? undefined
      : createAuthEmailSender({
          emailTransport: authEmails,
          appBaseUrl
        });
  const billingEmails =
    authEmails === undefined
      ? undefined
      : createBillingEmailService({
          db: {
            query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => dbPool.query<Row>(sql, params)
          },
          emailTransport: authEmails,
          appBaseUrl
        });

  const stripeConfig = createStripeConfig(env) ?? undefined;
  const githubAppClient = createGitHubAppClientFromEnv(env);
  const lifecycleWebhookFallbackTargetUrl = readNonEmptyEnv(env, "LIFECYCLE_WEBHOOK_TARGET_URL");
  const lifecycleWebhookFallbackSigningSecret = readNonEmptyEnv(env, "LIFECYCLE_WEBHOOK_SECRET");
  const signupEmailAllowlist = readSignupEmailAllowlistFromEnv(env);

  const dependencies = createApiDependencies({
    db: {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => dbPool.query<Row>(sql, params)
    },
    queue,
    objectStore,
    frequencyCounter,
    ...(authEmailSender === undefined ? {} : { authEmails: authEmailSender }),
    ...(billingEmails === undefined ? {} : { billingEmails }),
    ...(githubOAuth === undefined ? {} : { githubOAuth }),
    ...(githubAppClient === undefined ? {} : { githubAppClient }),
    ...(signupEmailAllowlist === undefined ? {} : { signupEmailAllowlist }),
    ...(stripeConfig === undefined ? {} : { stripeConfig }),
    ...(lifecycleWebhookFallbackTargetUrl === undefined ? {} : { lifecycleWebhookFallbackTargetUrl }),
    ...(lifecycleWebhookFallbackSigningSecret === undefined ? {} : { lifecycleWebhookFallbackSigningSecret }),
    authRateLimiter: createRedisAuthRateLimiter({
      redisUrl: env["REDIS_URL"] ?? "redis://localhost:6379"
    }),
    ingestionRateLimiter: createRedisIngestionRateLimiter({
      redisUrl: env["REDIS_URL"] ?? "redis://localhost:6379"
    })
  });

  return dependencies;
}
