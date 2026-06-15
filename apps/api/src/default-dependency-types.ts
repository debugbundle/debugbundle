import type {
  AccountDeletionChallengeService,
  AuthEmailSender,
  GitHubCliAuthService,
  GitHubOAuthConfig,
  WebSessionAuthService
} from "../../../packages/auth/src/index.js";
import type {
  IncidentFrequencyCounter,
  IngestionRateLimiter,
  AuthRateLimiter,
  ObjectStoreClient,
  ObjectStorePrefixDeleter,
  ObjectStoreReader,
  Queryable,
  QueueClient
} from "../../../packages/storage/src/index.js";
import type {
  createIngestionMetadataService,
  createIngestionPersistenceService,
  createMemberAuthService,
  createPostgresAvailabilityCheckStore,
  createPostgresAuditLogStore,
  createPostgresBillingSyncStore,
  createPostgresImprovementOpportunityStore,
  createPostgresMetadataStore,
  createPostgresOperationalEmailDeliveryStore,
  createPostgresSlackDestinationStore,
  createPostgresWebhookDeliveryStore,
  createPostgresWeeklyReportChannelStore
} from "../../../packages/storage/src/index.js";

import type { ApiDependencies } from "./api-types.js";
import type { GitHubAppClient } from "./github-app.js";
import type { StripeConfig } from "./stripe-config.js";
import type { BillingEmailService } from "./default-dependency-helpers.js";
import type { createBillingManagement } from "./billing-management.js";

export interface CreateApiDependenciesInput {
  objectStore: ObjectStoreClient & ObjectStoreReader & ObjectStorePrefixDeleter;
  queue: QueueClient;
  db: Queryable;
  analyticsHashSecret?: string;
  frequencyCounter?: IncidentFrequencyCounter;
  ingestionRateLimiter?: IngestionRateLimiter;
  authRateLimiter?: AuthRateLimiter;
  adminAnalyticsAccessEmails?: string[];
  billingAdminEmails?: string[];
  authEmails?: AuthEmailSender;
  billingEmails?: BillingEmailService;
  githubOAuth?: GitHubOAuthConfig;
  githubAppClient?: GitHubAppClient;
  stripeConfig?: StripeConfig;
  appBaseUrl?: string;
  lifecycleWebhookFallbackTargetUrl?: string;
  lifecycleWebhookFallbackSigningSecret?: string;
}

type MetadataStore = ReturnType<typeof createPostgresMetadataStore>;
type WebhookStore = ReturnType<typeof createPostgresWebhookDeliveryStore>;

export interface DefaultApiDependencies
  extends Omit<
    ApiDependencies,
    | "accountManagement"
    | "accountDeletionAuth"
    | "alertManagement"
    | "availabilityCheckManagement"
    | "auditLogging"
    | "billingEmails"
    | "billingManagement"
    | "bundleRegeneration"
    | "capturePolicyManagement"
    | "captureRuleManagement"
    | "githubCliAuth"
    | "improvementManagement"
    | "improvementSettingsManagement"
    | "incidentRetrieval"
    | "ingestionMetadata"
    | "ingestionPersistence"
    | "memberAuth"
    | "objectStoreReader"
    | "objectStoreWriter"
    | "operationalEmailDelivery"
    | "probeManagement"
    | "projectCollaboration"
    | "projectManagement"
    | "slackManagement"
    | "tokenManagement"
    | "webAuth"
    | "webhookDelivery"
    | "webhookManagement"
    | "webhookTesting"
    | "weeklyReportManagement"
  > {
  ingestionPersistence: ReturnType<typeof createIngestionPersistenceService>;
  ingestionMetadata: ReturnType<typeof createIngestionMetadataService>;
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
  accountDeletionAuth?: Pick<AccountDeletionChallengeService, "requestDeletionOtp" | "verifyDeletionOtp">;
  billingEmails?: BillingEmailService;
  tokenManagement: Pick<
    MetadataStore,
    | "listProjectTokensForOrganization"
    | "createProjectTokenForOrganization"
    | "revokeProjectTokenForOrganization"
    | "listMemberTokensForOrganization"
    | "createMemberTokenForOrganization"
    | "revokeMemberTokenForOrganization"
  >;
  projectManagement: Pick<
    MetadataStore,
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
  accountManagement: NonNullable<ApiDependencies["accountManagement"]>;
  billingManagement: ReturnType<typeof createBillingManagement>["billingManagement"];
  projectCollaboration: Pick<
    MetadataStore,
    | "listMembersForProject"
    | "listPendingInvitesForProject"
    | "createInviteForProject"
    | "cancelInviteForProject"
    | "updateProjectMemberRole"
    | "removeProjectMember"
    | "leaveProjectMembership"
  >;
  probeManagement: Pick<
    MetadataStore,
    | "listActiveProbesForProject"
    | "listActiveProbesForProjectInOrganization"
    | "createProbeActivationForProjectInOrganization"
    | "deactivateProbeActivationForProjectInOrganization"
  >;
  capturePolicyManagement: NonNullable<ApiDependencies["capturePolicyManagement"]>;
  captureRuleManagement: NonNullable<ApiDependencies["captureRuleManagement"]>;
  improvementSettingsManagement: NonNullable<ApiDependencies["improvementSettingsManagement"]>;
  improvementManagement: Pick<
    ReturnType<typeof createPostgresImprovementOpportunityStore>,
    | "listImprovementsForOrganization"
    | "getImprovementForOrganization"
    | "resolveImprovementForOrganization"
    | "reopenImprovementForOrganization"
    | "snoozeImprovementForOrganization"
  >;
  incidentRetrieval: Pick<
    MetadataStore,
    | "listIncidentsForOrganization"
    | "getIncidentForOrganization"
    | "resolveIncidentForOrganization"
    | "resolveIncidentsForOrganization"
    | "reopenIncidentForOrganization"
    | "reopenIncidentsForOrganization"
    | "getBundleFailureReasonForOrganization"
    | "getBundleSourceForOrganization"
    | "listServicesForOrganization"
    | "listIncidentLogsForOrganization"
  >;
  objectStoreReader: Pick<ObjectStoreReader, "getObject">;
  objectStoreWriter: Pick<ObjectStoreClient, "putObject">;
  bundleRegeneration: NonNullable<ApiDependencies["bundleRegeneration"]>;
  alertManagement: Pick<
    MetadataStore,
    "listAlertsForOrganization" | "createAlertForOrganization" | "updateAlertForOrganization" | "deleteAlertForOrganization"
  >;
  availabilityCheckManagement: ReturnType<typeof createPostgresAvailabilityCheckStore> & {
    testCheck: NonNullable<ApiDependencies["availabilityCheckManagement"]>["testCheck"];
  };
  slackManagement: ReturnType<typeof createPostgresSlackDestinationStore>;
  weeklyReportManagement: ReturnType<typeof createPostgresWeeklyReportChannelStore>;
  operationalEmailDelivery: ReturnType<typeof createPostgresOperationalEmailDeliveryStore>;
  webhookDelivery: WebhookStore;
  webhookTesting: NonNullable<ApiDependencies["webhookTesting"]>;
  webhookManagement: Pick<
    WebhookStore,
    | "listWebhooksForOrganization"
    | "createWebhookForOrganization"
    | "getWebhookForOrganization"
    | "updateWebhookForOrganization"
    | "deleteWebhookForOrganization"
  >;
  stripeConfig?: StripeConfig;
  billingSyncStore?: ReturnType<typeof createPostgresBillingSyncStore>;
}
