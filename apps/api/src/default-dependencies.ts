import { Pool } from "pg";

import {
  createGitHubCliAuthService,
  createWebSessionAuthService,
  type AuthEmailSender
} from "../../../packages/auth/src/index.js";
import {
  getDefaultPreset,
  type CaptureRuleCreate,
  type CaptureRuleUpdate,
  type CapturePolicyUpdate,
  type ImprovementSettingsUpdate
} from "../../../packages/shared-types/src/index.js";
import {
  createSesEmailTransport,
  formatProductFromEmail
} from "../../../packages/email/src/index.js";
import { buildPostgresSslConfig } from "../../../packages/storage/src/postgres-ssl.js";
import {
  buildBundleRegenerationLeaseKey,
  buildUserAvatarObjectKey,
  createPostgresAccountStore,
  createPostgresAuditLogStore,
  createPostgresBillingStore,
  createPostgresBillingSyncStore,
  createPostgresAuthStore,
  createPostgresCapturePolicyStore,
  createPostgresCaptureRuleStore,
  createPostgresImprovementOpportunityStore,
  createPostgresImprovementSettingsStore,
  createPostgresGitHubMarketplaceStore,
  createPostgresGitHubStore,
  createPostgresOperationalEmailDeliveryStore,
  createIncidentLifecycleService,
  createMemberAuthService,
  createIngestionMetadataService,
  createIngestionPersistenceService,
  createRedisAuthRateLimiter,
  createRedisIngestionRateLimiter,
  createPostgresMetadataStore,
  createPostgresSlackDestinationStore,
  createPostgresWeeklyReportChannelStore,
  createPostgresWebhookDeliveryStore,
  createRedisIncidentFrequencyCounter,
  createRedisQueueClient,
  createS3ObjectStoreClient,
  deleteProjectObjects,
  type ObjectStoreClient,
  type Queryable,
  type QueueClient,
  type RedisQueueClient,
  type WebhookEventType
} from "../../../packages/storage/src/index.js";
import {
  createBillingManagement
} from "./billing-management.js";
import { createEnvBillingLinkProvider } from "./billing-links.js";
import type { CreateApiDependenciesInput, DefaultApiDependencies } from "./default-dependency-types.js";
import {
  buildAccountExportArtifacts,
  createAuthEmailSender,
  createBillingEmailService,
  createGithubOAuthConfigFromEnv,
  normalizeEmailForConfig,
  readBillingAdminEmailsFromEnv,
  readNonEmptyEnv,
  resolveEmailAssetBaseUrl
} from "./default-dependency-helpers.js";
import { createGitHubAppClientFromEnv } from "./github-app.js";
import { createStripeConfig } from "./stripe-config.js";
export {
  normalizeBillingPlan,
  readSubscriptionInvoiceLinePeriod,
  readUnixTimestampField,
  resolveStripeSubscriptionBillingPeriod
} from "./billing-management.js";
export {
  getBooleanField,
  getStringField,
  normalizeEmailForConfig,
  readCsvEnv,
  readNonEmptyEnv,
  stripTrailingSlash
} from "./default-dependency-helpers.js";
export type { BillingEmailContact, BillingEmailService } from "./default-dependency-helpers.js";

const BUNDLE_REGENERATION_LEASE_TTL_SECONDS = 30;

function createPoolQueryable(pool: Pool): Queryable {
  return {
    query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) =>
      pool.query<Row>(sql, params),
    transaction: async <Result>(callback: (db: Queryable) => Promise<Result>) => {
      const client = await pool.connect();
      const tx: Queryable = {
        query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) =>
          client.query<Row>(sql, params)
      };

      try {
        await client.query("BEGIN", []);
        const result = await callback(tx);
        await client.query("COMMIT", []);
        return result;
      } catch (error) {
        await client.query("ROLLBACK", []).catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

export function createApiDependencies(input: CreateApiDependenciesInput): DefaultApiDependencies {
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
  const captureRuleStore = createPostgresCaptureRuleStore(input.db);
  const improvementOpportunityStore = createPostgresImprovementOpportunityStore(input.db);
  const improvementSettingsStore = createPostgresImprovementSettingsStore(input.db);
  const metadataStore = createPostgresMetadataStore(input.db);
  const githubStore = createPostgresGitHubStore(input.db);
  const githubMarketplaceStore = createPostgresGitHubMarketplaceStore(input.db);
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
  const webAuth = createWebSessionAuthService(
    webAuthStore,
    {
      ...(input.authEmails === undefined ? {} : { authEmails: input.authEmails }),
      ...(input.githubOAuth === undefined ? {} : { githubOAuth: input.githubOAuth })
    }
  );
  const githubCliAuth = createGitHubCliAuthService(authStore, {
    ...(input.githubOAuth === undefined ? {} : { githubOAuth: input.githubOAuth })
  });
  const operationalEmailDelivery = createPostgresOperationalEmailDeliveryStore(input.db);
  const webhookDelivery = createPostgresWebhookDeliveryStore(input.db);
  const incidentLifecycle = createIncidentLifecycleService({
    incidentStore: metadataStore,
    improvementStore: improvementOpportunityStore,
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
  const billingAdminEmails =
    input.billingAdminEmails === undefined
      ? null
      : new Set(input.billingAdminEmails.map(normalizeEmailForConfig).filter((email) => email.length > 0));
  const billingManagementServices = createBillingManagement({
    db: input.db,
    ...(input.stripeConfig === undefined ? {} : { stripeConfig: input.stripeConfig }),
    billingStore,
    billingSyncStore,
    billingLinks,
    ...(input.appBaseUrl === undefined ? {} : { appBaseUrl: input.appBaseUrl })
  });
  const { billingManagement } = billingManagementServices;
  const inviteEmails =
    authEmails === undefined
      ? undefined
      : {
          sendProjectInviteEmail: (request: Parameters<AuthEmailSender["sendProjectInviteEmail"]>[0]) =>
            authEmails.sendProjectInviteEmail(request)
        };

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
    billingManagement,
    ...(billingAdminEmails === null
      ? {}
      : {
          billingAdmin: {
            isOperatorAllowed: ({ email }: { email: string }) => billingAdminEmails.has(normalizeEmailForConfig(email)),
            overrideOrganizationBilling: (request) =>
              billingManagementServices.overrideOrganizationBilling(request)
          }
        }),
    projectCollaboration: {
      listMembersForProject: (input) => metadataStore.listMembersForProject!(input),
      listPendingInvitesForProject: (input) => metadataStore.listPendingInvitesForProject!(input),
      createInviteForProject: (input) => metadataStore.createInviteForProject!(input),
      cancelInviteForProject: (input) => metadataStore.cancelInviteForProject!(input),
      updateProjectMemberRole: (input) => metadataStore.updateProjectMemberRole!(input),
      removeProjectMember: (input) => metadataStore.removeProjectMember!(input),
      leaveProjectMembership: (input) => metadataStore.leaveProjectMembership!(input)
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

              const billingSummary = await billingManagementServices.getProjectedBillingSummary({
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

              const storedInstallation = await githubStore.upsertGitHubInstallationForOrganization({
                organization_id: requestInput.organization_id,
                installation_id: installation.installation_id,
                account_login: installation.account_login,
                account_type: installation.account_type,
                status: "active"
              });

              await githubMarketplaceStore.linkOrganizationToMarketplaceAccountByInstallationId({
                organization_id: requestInput.organization_id,
                installation_id: installation.installation_id
              });

              return storedInstallation;
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
              : (existingRecord?.immediate_client_error_statuses ?? null),
          immediate_client_error_path_rules:
            input.update.immediate_client_error_path_rules !== undefined
              ? input.update.immediate_client_error_path_rules
              : (existingRecord?.immediate_client_error_path_rules ?? null)
        });
        return record;
      }
    },
    captureRuleManagement: {
      listCaptureRulesForProject: (input: { organization_id: string; project_id: string }) => {
        void input.organization_id;
        return captureRuleStore.listCaptureRulesByProjectId(input.project_id);
      },
      listActiveCaptureRulesForProject: (input: { project_id: string; now: string }) =>
        captureRuleStore.listActiveCaptureRulesByProjectId(input),
      createCaptureRuleForProject: async (input: {
        organization_id: string;
        project_id: string;
        id: string;
        create: CaptureRuleCreate;
      }) => {
        const projects = await metadataStore.listProjectsForOrganization({
          organization_id: input.organization_id,
          now: new Date().toISOString(),
          limit: 1_000
        });
        const project = projects.find((candidate) => candidate.project_id === input.project_id);
        if (project === undefined) {
          return null;
        }

        return captureRuleStore.createCaptureRule({
          id: input.id,
          project_id: input.project_id,
          name: input.create.name,
          description: input.create.description,
          enabled: input.create.enabled,
          action: input.create.action,
          matcher: input.create.matcher,
          sample_rate: input.create.sample_rate,
          sample_event_class: input.create.sample_event_class,
          created_by_user_id: input.create.created_by_user_id,
          created_from_incident_id: input.create.created_from_incident_id,
          created_from_event_id: input.create.created_from_event_id,
          expires_at: input.create.expires_at
        });
      },
      updateCaptureRuleForProject: (input: {
        organization_id: string;
        project_id: string;
        rule_id: string;
        update: CaptureRuleUpdate;
      }) => {
        void input.organization_id;
        const update: {
          id: string;
          project_id: string;
          name?: string;
          description?: string | null;
          enabled?: boolean;
          action?: "demote" | "sample" | "drop";
          matcher?: CaptureRuleCreate["matcher"];
          sample_rate?: number | null;
          sample_event_class?: "preserve" | "context" | null;
          expires_at?: string | null;
        } = {
          id: input.rule_id,
          project_id: input.project_id
        };

        if (input.update.name !== undefined) {
          update.name = input.update.name;
        }
        if (input.update.description !== undefined) {
          update.description = input.update.description;
        }
        if (input.update.enabled !== undefined) {
          update.enabled = input.update.enabled;
        }
        if (input.update.action !== undefined) {
          update.action = input.update.action;
          if (input.update.action !== "sample") {
            update.sample_rate = null;
            update.sample_event_class = null;
          }
        }
        if (input.update.matcher !== undefined) {
          update.matcher = input.update.matcher;
        }
        if (input.update.sample_rate !== undefined) {
          update.sample_rate = input.update.sample_rate;
        }
        if (input.update.sample_event_class !== undefined) {
          update.sample_event_class = input.update.sample_event_class;
        }
        if (input.update.expires_at !== undefined) {
          update.expires_at = input.update.expires_at;
        }

        return captureRuleStore.updateCaptureRule(update);
      },
      deleteCaptureRuleForProject: (input: {
        organization_id: string;
        project_id: string;
        rule_id: string;
      }) => {
        void input.organization_id;
        return captureRuleStore.deleteCaptureRule({
          id: input.rule_id,
          project_id: input.project_id
        });
      },
      recordCaptureRuleMatch: (input: { project_id: string; rule_id: string; matched_at: string }) =>
        captureRuleStore.recordCaptureRuleMatch({
          id: input.rule_id,
          project_id: input.project_id,
          matched_at: input.matched_at
        })
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
      resolveIncidentsForOrganization: (input) => incidentLifecycle.resolveIncidentsForOrganization(input),
      reopenIncidentForOrganization: (input) => incidentLifecycle.reopenIncidentForOrganization(input),
      reopenIncidentsForOrganization: (input) => incidentLifecycle.reopenIncidentsForOrganization(input),
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

export function createApiDependenciesFromEnv(
  env: Record<string, string | undefined>
): DefaultApiDependencies & { close(): Promise<void> } {
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
  const db = createPoolQueryable(dbPool);

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
  const emailAssetBaseUrl = resolveEmailAssetBaseUrl(env);
  const authEmailSender =
    authEmails === undefined
      ? undefined
      : createAuthEmailSender({
          emailTransport: authEmails,
          appBaseUrl,
          ...(emailAssetBaseUrl === undefined ? {} : { emailAssetBaseUrl })
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
  const billingAdminEmails = readBillingAdminEmailsFromEnv(env);
  const reviewAccessSecret = readNonEmptyEnv(env, "REVIEW_ACCESS_SECRET");

  const authRateLimiter = createRedisAuthRateLimiter({
    redisUrl: env["REDIS_URL"] ?? "redis://localhost:6379"
  });
  const ingestionRateLimiter = createRedisIngestionRateLimiter({
    redisUrl: env["REDIS_URL"] ?? "redis://localhost:6379"
  });

  const dependencies = createApiDependencies({
    db,
    queue,
    objectStore,
    frequencyCounter,
    appBaseUrl,
    ...(authEmailSender === undefined ? {} : { authEmails: authEmailSender }),
    ...(billingEmails === undefined ? {} : { billingEmails }),
    ...(githubOAuth === undefined ? {} : { githubOAuth }),
    ...(githubAppClient === undefined ? {} : { githubAppClient }),
    ...(billingAdminEmails === undefined && reviewAccessSecret === undefined
      ? {}
      : { billingAdminEmails: billingAdminEmails ?? [] }),
    ...(stripeConfig === undefined ? {} : { stripeConfig }),
    ...(lifecycleWebhookFallbackTargetUrl === undefined ? {} : { lifecycleWebhookFallbackTargetUrl }),
    ...(lifecycleWebhookFallbackSigningSecret === undefined ? {} : { lifecycleWebhookFallbackSigningSecret }),
    authRateLimiter,
    ingestionRateLimiter
  });

  return {
    ...dependencies,
    async close(): Promise<void> {
      await authRateLimiter.close();
      await ingestionRateLimiter.close();
      await frequencyCounter.close();
      await queue.close();
      await dbPool.end();
    }
  };
}
