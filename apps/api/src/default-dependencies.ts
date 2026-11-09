import { businessSalesReady } from "../../../packages/billing/src/business-sales-policy.js";
import { createReportAllowanceStore } from "../../../packages/storage/src/report-allowance-store.js";
import { createCaptureRuleManagement } from "../../../packages/storage/src/capture-rule-management.js";
import { createPostgresOrganizationManagementStore } from "../../../packages/storage/src/organization-management-store.js";
import { createNotificationPreferencesStore } from "../../../packages/storage/src/notification-preferences-store.js";
import { createServiceDefinitionStore } from "../../../packages/storage/src/service-definition-store.js";
import { createProjectMergeStore } from "../../../packages/storage/src/project-merge-store.js";
import { createEvidenceIngestionReceiptStore } from "../../../packages/storage/src/evidence-ingestion-receipt.js";
import { parsePublicStatusBaseUrl } from "../../../packages/shared-types/src/public-status.js";
import { createPublicStatusPageStore } from "../../../packages/storage/src/public-status-store.js";
import { createPostgresAnalyticsFlowStore } from "../../../packages/storage/src/analytics-flow-store.js";
import {
  countImprovementsForOrganization,
  countIncidentsForOrganization
} from "../../../packages/storage/src/incident-improvement-counts.js";
import {
  createAccountDeletionChallengeService,
  createGitHubCliAuthService,
  createWebSessionAuthService,
  type AuthEmailSender
} from "../../../packages/auth/src/index.js";
import {
  getDefaultPreset,
  type CapturePolicyUpdate,
  type ImprovementSettingsUpdate
} from "../../../packages/shared-types/src/index.js";
import {
  buildUserAvatarObjectKey,
  createAgentTokenStore,
  createPostgresAvailabilityCheckStore,
  createPostgresAccountAnalyticsStore,
  createPostgresAccountStore,
  createPostgresAuditLogStore,
  createPostgresBillingStore,
  createPostgresBillingSyncStore,
  createPostgresIngestionRejectionDiagnosticStore,
  createPostgresAuthStore,
  createPostgresCapturePolicyStore,
  createPostgresImprovementOpportunityStore,
  createPostgresImprovementSettingsStore,
  createPostgresGitHubMarketplaceStore,
  createPostgresGitHubStore,
  createPostgresOperationalEmailDeliveryStore,
  createIncidentLifecycleService,
  createMemberAuthService,
  createIngestionMetadataService,
  createIngestionPersistenceService,
  createPostgresMetadataStore,
  createPostgresAlertGroupInspectionStore,
  createPostgresSlackDestinationStore,
  createPostgresWeeklyReportChannelStore,
  createPostgresWebhookDeliveryStore,
  runInTransaction,
  deleteProjectObjects,
  executeAvailabilityCheck,
  validateAvailabilityCheckDefinition,
  type ObjectStoreClient,
  type WebhookEventType
} from "../../../packages/storage/src/index.js";
import { createBillingManagement } from "./billing-management.js";
import { createDefaultReferrals } from "./default-referrals.js";
import { createDefaultAnalyticsDependencies } from "./default-analytics-dependencies.js";
import { createOpenAiHostedReadDependencies } from "./openai-mcp-dependencies.js";
import { resolveCredentialServiceScopes } from "../../../packages/storage/src/project-ingestion-scope.js";
import { createEnvBillingLinkProvider } from "./billing-links.js";
import { createDefaultGitHubManagement } from "./default-github-management.js";
import { createDefaultRegenerationDependencies } from "./default-regeneration-dependencies.js";
import type {
  CreateApiDependenciesInput,
  DefaultApiDependencies
} from "./default-dependency-types.js";
import {
  buildAccountExportArtifacts,
  normalizeEmailForConfig
} from "./default-dependency-helpers.js";
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
  readAdminAnalyticsEmailsFromEnv,
  readCsvEnv,
  readNonEmptyEnv,
  stripTrailingSlash
} from "./default-dependency-helpers.js";
export type { BillingEmailContact, BillingEmailService } from "./default-dependency-helpers.js";

export function createApiDependencies(input: CreateApiDependenciesInput): DefaultApiDependencies {
  const rootDb = input.db;
  const accountAnalyticsStore =
    input.analyticsHashSecret === undefined
      ? undefined
      : createPostgresAccountAnalyticsStore({
          db: input.db,
          analyticsHashSecret: input.analyticsHashSecret
        });
  const ingestionRejectionDiagnosticStore =
    accountAnalyticsStore === undefined
      ? undefined
      : createPostgresIngestionRejectionDiagnosticStore({
          db: input.db
        });
  const ingestionPersistence = createIngestionPersistenceService({
    objectStore: input.objectStore,
    queue: input.queue,
    evidenceReceipts: createEvidenceIngestionReceiptStore(input.db)
  });

  const accountStore = createPostgresAccountStore(input.db, {
    ...(accountAnalyticsStore === undefined ? {} : { accountAnalyticsStore })
  });
  const auditLogStore = createPostgresAuditLogStore(input.db);
  const authStore = createPostgresAuthStore(input.db, {
    ...(accountAnalyticsStore === undefined ? {} : { accountAnalyticsStore })
  });
  const billingStore = createPostgresBillingStore(input.db, {
    ...(accountAnalyticsStore === undefined ? {} : { accountAnalyticsStore })
  });
  const billingSyncStore = createPostgresBillingSyncStore(input.db, {
    ...(accountAnalyticsStore === undefined ? {} : { accountAnalyticsStore })
  });
  const capturePolicyStore = createPostgresCapturePolicyStore(input.db);
  const improvementOpportunityStore = createPostgresImprovementOpportunityStore(input.db, {
    ...(accountAnalyticsStore === undefined ? {} : { accountAnalyticsStore })
  });
  const improvementSettingsStore = createPostgresImprovementSettingsStore(input.db);
  const availabilityCheckStore = createPostgresAvailabilityCheckStore(input.db);
  const metadataStore = createPostgresMetadataStore(input.db, {
    ...(accountAnalyticsStore === undefined ? {} : { accountAnalyticsStore })
  });
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
  const webAuth = createWebSessionAuthService(webAuthStore, {
    ...(input.authEmails === undefined ? {} : { authEmails: input.authEmails }),
    ...(input.githubOAuth === undefined ? {} : { githubOAuth: input.githubOAuth })
  });
  const accountDeletionAuth = createAccountDeletionChallengeService(authStore, {
    ...(input.authEmails === undefined ? {} : { authEmails: input.authEmails })
  });
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
    ...(accountAnalyticsStore === undefined ? {} : { accountAnalyticsStore }),
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
      actor_role?: "owner" | "admin" | "member" | "viewer";
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
      ? createIngestionMetadataService(metadataStore, {
          ...(accountAnalyticsStore === undefined
            ? {}
            : {
                accountAnalyticsStore,
                resolveOrganizationIdForProject: async (projectId: string) => {
                  const result = await input.db.query<{ organization_id: string }>(
                    `
                      SELECT organization_id::text AS organization_id
                      FROM projects
                      WHERE id = $1::uuid
                      LIMIT 1
                    `,
                    [projectId]
                  );

                  return result.rows[0]?.organization_id ?? null;
                }
              })
        })
      : createIngestionMetadataService(metadataStore, {
          frequencyCounter: input.frequencyCounter,
          ...(accountAnalyticsStore === undefined
            ? {}
            : {
                accountAnalyticsStore,
                resolveOrganizationIdForProject: async (projectId: string) => {
                  const result = await input.db.query<{ organization_id: string }>(
                    `
                      SELECT organization_id::text AS organization_id
                      FROM projects
                      WHERE id = $1::uuid
                      LIMIT 1
                    `,
                    [projectId]
                  );

                  return result.rows[0]?.organization_id ?? null;
                }
              })
        });
  const authEmails = input.authEmails;
  const normalizedAdminAnalyticsAccessEmails =
    input.adminAnalyticsAccessEmails === undefined
      ? []
      : input.adminAnalyticsAccessEmails
          .map(normalizeEmailForConfig)
          .filter((email) => email.length > 0);
  const adminAnalyticsAccessEmails =
    normalizedAdminAnalyticsAccessEmails.length === 0
      ? null
      : new Set(normalizedAdminAnalyticsAccessEmails);
  const billingAdminEmails =
    input.billingAdminEmails === undefined
      ? null
      : new Set(
          input.billingAdminEmails.map(normalizeEmailForConfig).filter((email) => email.length > 0)
        );
  const billingStripeConfig =
    input.stripeConfig === undefined
      ? undefined
      : {
          ...input.stripeConfig,
          businessSalesEnabled: businessSalesReady({
            launch: input.stripeConfig.businessSalesEnabled === true,
            reports: input.smartReportConfig?.enabled === true,
            ai: Boolean(input.smartReportConfig?.model && input.smartReportConfig.profile)
          })
        };
  const billingManagementServices = createBillingManagement({
    db: input.db,
    ...(billingStripeConfig === undefined ? {} : { stripeConfig: billingStripeConfig }),
    billingStore,
    billingSyncStore,
    ...(accountAnalyticsStore === undefined ? {} : { accountAnalyticsStore }),
    billingLinks,
    ...(input.appBaseUrl === undefined ? {} : { appBaseUrl: input.appBaseUrl })
  });
  const { billingManagement } = billingManagementServices;
  const referrals = createDefaultReferrals({
    db: input.db,
    ...(input.billingAdminEmails === undefined ? {} : { operatorEmails: input.billingAdminEmails }),
    ...(input.referralConfig === undefined ? {} : { config: input.referralConfig }),
    ...(input.stripeConfig === undefined ? {} : { stripeConfig: input.stripeConfig })
  });
  const inviteEmails =
    authEmails === undefined
      ? undefined
      : {
          sendProjectInviteEmail: (
            request: Parameters<AuthEmailSender["sendProjectInviteEmail"]>[0]
          ) => authEmails.sendProjectInviteEmail(request)
        };

  return {
    ...(referrals === undefined ? {} : { referrals }),
    notificationPreferences: createNotificationPreferencesStore(input.db),
    organizationManagement: createPostgresOrganizationManagementStore(input.db),
    reportGenerationEnabled: input.smartReportConfig?.enabled === true,
    reportDefinitions: createReportDefinitionStore(input.db),
    reportAllowance: createReportAllowanceStore(input.db),
    reportContent: createReportContentStore(input.db, input.objectStore),
    reportPdf: createReportPdfStore(input.db, input.objectStore),
    reportEmail: createReportEmailStore(input.db, input.objectStore),
    reportDashboardBaseUrl: input.appBaseUrl ?? "https://app.debugbundle.com",
    reportRuns: {
      admission: createReportRunAdmissionStore(input.db, {
        profile: input.smartReportConfig?.profile ?? null,
        ...(input.smartReportConfig === undefined
          ? {}
          : { monthly_budget_nano_usd: input.smartReportConfig.monthly_budget_nano_usd })
      }),
      management: createReportRunManagementStore(input.db)
    },
    ...(authEmails?.sendOrganizationAccessEmail === undefined
      ? {}
      : { organizationEmails: { send: authEmails.sendOrganizationAccessEmail.bind(authEmails) } }),
    serviceDefinitions: createServiceDefinitionStore(input.db),
    projectMerges: createProjectMergeStore(input.db, {
      enabled: input.projectMergesEnabled === true
    }),
    publicStatusPages: createPublicStatusPageStore(input.db),
    publicStatusTrustProxy: input.publicStatusTrustProxy ?? false,
    publicStatusBaseUrl: parsePublicStatusBaseUrl(
      input.publicStatusBaseUrl?.trim() ||
        `${(input.appBaseUrl ?? "https://app.debugbundle.com").replace(/\/+$/, "")}/status`
    ).toString(),
    analyticsFlows: createPostgresAnalyticsFlowStore(input.db),
    ingestionPersistence,
    ingestionMetadata: {
      ...ingestionMetadata,
      resolveCredentialServiceScopes: (request) => resolveCredentialServiceScopes(input.db, request)
    },
    ...(accountAnalyticsStore === undefined ? {} : { accountAnalytics: accountAnalyticsStore }),
    ...(ingestionRejectionDiagnosticStore === undefined
      ? {}
      : { ingestionRejectionDiagnostics: ingestionRejectionDiagnosticStore }),
    ...(accountAnalyticsStore === undefined || adminAnalyticsAccessEmails === null
      ? {}
      : {
          adminAnalytics: {
            isOperatorAllowed: ({ email }: { email: string }) =>
              adminAnalyticsAccessEmails.has(normalizeEmailForConfig(email)),
            getSummary: (request: { now: string }) =>
              accountAnalyticsStore.getAdminAnalyticsSummary(request),
            getMalformedRejectionBreakdown: (request: { now: string; limit: number }) =>
              ingestionRejectionDiagnosticStore?.getMalformedRejectionBreakdown(request) ??
              Promise.resolve({
                generated_at: request.now,
                window: { starts_at: request.now, ends_at: request.now },
                total_malformed_rejections_this_month: 0,
                top_sources: [],
                top_validation_failures: []
              })
          }
        }),
    ...(input.ingestionRateLimiter === undefined
      ? {}
      : { ingestionRateLimiter: input.ingestionRateLimiter }),
    ...(input.authRateLimiter === undefined ? {} : { authRateLimiter: input.authRateLimiter }),
    auditLogging: auditLogStore,
    memberAuth,
    agentTokens: createAgentTokenStore(input.db),
    agentReads: createOpenAiHostedReadDependencies({
      db: input.db,
      objectStoreReader: input.objectStore
    }),
    agentDashboardBaseUrl: input.appBaseUrl ?? "https://app.debugbundle.com",
    webAuth,
    accountDeletionAuth,
    githubCliAuth,
    ...(inviteEmails === undefined ? {} : { inviteEmails }),
    ...(input.billingEmails === undefined ? {} : { billingEmails: input.billingEmails }),
    tokenManagement: {
      listProjectTokensForOrganization: (input) =>
        metadataStore.listProjectTokensForOrganization(input),
      createProjectTokenForOrganization: (input) =>
        metadataStore.createProjectTokenForOrganization(input),
      revokeProjectTokenForOrganization: (input) =>
        metadataStore.revokeProjectTokenForOrganization(input),
      listMemberTokensForOrganization: (input) =>
        metadataStore.listMemberTokensForOrganization(input),
      createMemberTokenForOrganization: (input) =>
        metadataStore.createMemberTokenForOrganization(input),
      revokeMemberTokenForOrganization: (input) =>
        metadataStore.revokeMemberTokenForOrganization(input)
    },
    projectManagement: {
      resolveProjectAccessForUser: (input) => metadataStore.resolveProjectAccessForUser!(input),
      listProjectsForUser: (input) => metadataStore.listProjectsForUser!(input),
      createProjectForUser: (input) => metadataStore.createProjectForUser!(input),
      updateProjectForUser: (input) => metadataStore.updateProjectForUser!(input),
      deleteProjectForUser: async (deleteInput) => {
        const result = await metadataStore.deleteProjectForUser!(deleteInput);
        if (result !== null) {
          await Promise.all(
            (result.storage_origin_ids ?? [deleteInput.project_id]).map((origin) =>
              deleteProjectObjects(input.objectStore, origin).catch(() => undefined)
            )
          );
        }
        if (result === null) return null;
        const { storage_origin_ids: _origins, ...project } = result;
        void _origins;
        return project;
      },
      listProjectsForOrganization: (input) => metadataStore.listProjectsForOrganization(input),
      createProjectForOrganization: (input) => metadataStore.createProjectForOrganization(input),
      updateProjectForOrganization: (input) => metadataStore.updateProjectForOrganization(input),
      deleteProjectForOrganization: async (deleteInput) => {
        const result = await metadataStore.deleteProjectForOrganization(deleteInput);
        if (result !== null) {
          await Promise.all(
            (result.storage_origin_ids ?? [deleteInput.project_id]).map((origin) =>
              deleteProjectObjects(input.objectStore, origin).catch(() => undefined)
            )
          );
        }
        if (result === null) return null;
        const { storage_origin_ids: _origins, ...project } = result;
        void _origins;
        return project;
      }
    },
    accountManagement: {
      exportBusinessAccountSection: (exportInput) =>
        createBusinessAccountExportStore(input.db).read(exportInput),
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
          business_data_exports: businessAccountExportManifest(),
          artifacts: await buildAccountExportArtifacts(input.objectStore, result)
        };
      },
      deleteAccountForOrganization: async (deleteInput: {
        organization_id: string;
        user_id: string;
        deleted_at: string;
      }) => {
        const result = await accountStore.deleteAccountForOrganization(deleteInput);
        if (
          result !== null &&
          result !== "other_owned_organizations_exist" &&
          result !== "other_owned_projects_exist"
        ) {
          await Promise.all(
            result.deleted_project_ids.map((projectId) =>
              deleteProjectObjects(input.objectStore, projectId).catch(() => undefined)
            )
          );
          if (result.user_deleted && input.objectStore.deleteObject !== undefined) {
            await input.objectStore
              .deleteObject({
                key: buildUserAvatarObjectKey(deleteInput.user_id)
              })
              .catch(() => undefined);
          }
        }

        return result;
      },
      getUserAvatar: (request) => accountStore.getUserAvatar(request),
      saveUserAvatar: (request) => accountStore.saveUserAvatar(request)
    },
    billingManagement,
    ...createDefaultAnalyticsDependencies({ db: input.db, queue: input.queue }),
    ...(billingAdminEmails === null
      ? {}
      : {
          billingAdmin: {
            isOperatorAllowed: ({ email }: { email: string }) =>
              billingAdminEmails.has(normalizeEmailForConfig(email)),
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
          githubManagement: createDefaultGitHubManagement({
            db: input.db,
            githubAppClient,
            githubStore,
            githubMarketplaceStore,
            metadataStore,
            billingManagementServices,
            ...(accountAnalyticsStore === undefined ? {} : { accountAnalyticsStore })
          })
        }),
    probeManagement: {
      listActiveProbesForProject: (input) => metadataStore.listActiveProbesForProject(input),
      listActiveProbesForProjectInOrganization: (input) =>
        metadataStore.listActiveProbesForProjectInOrganization(input),
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
        const existingRecord = await capturePolicyStore.getCapturePolicyByProjectId(
          input.project_id
        );
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

        return runInTransaction(rootDb, async (tx) => {
          const txCapturePolicyStore = createPostgresCapturePolicyStore(tx);
          const record = await txCapturePolicyStore.upsertCapturePolicy({
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
            capture_diagnostic_context:
              input.update.capture_diagnostic_context !== undefined
                ? input.update.capture_diagnostic_context
                : (existingRecord?.capture_diagnostic_context ?? null),
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

          if (accountAnalyticsStore !== undefined) {
            await accountAnalyticsStore.withDb(tx).recordMetricDeltas({
              organization_id: input.organization_id,
              occurred_at: record.updated_at,
              source: "capture_policy_update",
              dedupe_key: `capture_policy_update:${input.project_id}:${record.updated_at}`,
              deltas: {
                capture_policy_updates: 1
              }
            });
          }

          return record;
        });
      }
    },
    captureRuleManagement: createCaptureRuleManagement(rootDb, {
      ...(accountAnalyticsStore ? { accountAnalyticsStore } : {})
    }),
    improvementSettingsManagement: {
      getImprovementSettingsForProject: (input: {
        organization_id: string;
        project_id: string;
      }) => {
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
          update.automated_improvement_bundles_enabled =
            input.update.automated_improvement_bundles_enabled;
        }
        if (input.update.improvement_bundle_sensitivity !== undefined) {
          update.improvement_bundle_sensitivity = input.update.improvement_bundle_sensitivity;
        }

        return improvementSettingsStore.updateImprovementSettings(update);
      }
    },
    availabilityCheckManagement: {
      ...availabilityCheckStore,
      createCheckForProjectInOrganization: async (request) => {
        const validated = await validateAvailabilityCheckDefinition(request);
        return await availabilityCheckStore.createCheckForProjectInOrganization({
          ...request,
          url: validated.normalized_url
        });
      },
      updateCheckForProjectInOrganization: async (request) => {
        if (request.url === undefined) {
          return await availabilityCheckStore.updateCheckForProjectInOrganization(request);
        }

        const validated = await validateAvailabilityCheckDefinition({
          url: request.url,
          method: request.method ?? "GET",
          expected_status_min: request.expected_status_min ?? 200,
          expected_status_max: request.expected_status_max ?? 399,
          timeout_ms: request.timeout_ms ?? 2500
        });
        return await availabilityCheckStore.updateCheckForProjectInOrganization({
          ...request,
          url: validated.normalized_url
        });
      },
      testCheck: async (request) => {
        const validated = await validateAvailabilityCheckDefinition(request);
        const result = await executeAvailabilityCheck({
          ...request,
          url: validated.normalized_url
        });

        return {
          normalized_url: validated.normalized_url,
          result
        };
      }
    },
    improvementManagement: {
      listImprovementsForOrganization: (input) =>
        improvementOpportunityStore.listImprovementsForOrganization(input),
      countImprovementsForOrganization: (request) =>
        countImprovementsForOrganization(input.db, request),
      getImprovementForOrganization: (input) =>
        improvementOpportunityStore.getImprovementForOrganization(input),
      resolveImprovementForOrganization: (input) =>
        improvementOpportunityStore.resolveImprovementForOrganization(input),
      reopenImprovementForOrganization: (input) =>
        improvementOpportunityStore.reopenImprovementForOrganization(input),
      snoozeImprovementForOrganization: (input) =>
        improvementOpportunityStore.snoozeImprovementForOrganization!(input)
    },
    incidentRetrieval: {
      listIncidentsForOrganization: (input) => metadataStore.listIncidentsForOrganization(input),
      countIncidentsForOrganization: (request) => countIncidentsForOrganization(input.db, request),
      getIncidentForOrganization: (input) => metadataStore.getIncidentForOrganization(input),
      resolveIncidentForOrganization: (input) =>
        incidentLifecycle.resolveIncidentForOrganization(input),
      resolveIncidentsForOrganization: (input) =>
        incidentLifecycle.resolveIncidentsForOrganization(input),
      reopenIncidentForOrganization: (input) =>
        incidentLifecycle.reopenIncidentForOrganization(input),
      reopenIncidentsForOrganization: (input) =>
        incidentLifecycle.reopenIncidentsForOrganization(input),
      getBundleFailureReasonForOrganization: (input) =>
        metadataStore.getBundleFailureReasonForOrganization!(input),
      getBundleSourceForOrganization: (input) =>
        metadataStore.getBundleSourceForOrganization!(input),
      listServicesForOrganization: (input) => metadataStore.listServicesForOrganization!(input),
      listIncidentLogsForOrganization: (input) =>
        metadataStore.listIncidentLogsForOrganization(input)
    },
    objectStoreReader: {
      getObject: (request) => input.objectStore.getObject(request)
    },
    objectStoreWriter: {
      putObject: (request: Parameters<ObjectStoreClient["putObject"]>[0]) =>
        input.objectStore.putObject(request)
    },
    ...createDefaultRegenerationDependencies({
      db: input.db,
      queue: input.queue,
      metadataStore,
      improvementOpportunityStore
    }),
    alertManagement: {
      listAlertsForOrganization: (input) => metadataStore.listAlertsForOrganization(input),
      createAlertForOrganization: (input) => metadataStore.createAlertForOrganization(input),
      updateAlertForOrganization: (input) => metadataStore.updateAlertForOrganization(input),
      deleteAlertForOrganization: (input) => metadataStore.deleteAlertForOrganization(input)
    },
    alertGroupInspection: createPostgresAlertGroupInspectionStore(input.db),
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
    ...(input.stripeConfig !== undefined
      ? {
          stripeConfig: input.stripeConfig,
          billingSyncStore
        }
      : {})
  };
}
import { createReportDefinitionStore } from "../../../packages/storage/src/report-definition-store.js";
import { createReportRunAdmissionStore } from "../../../packages/storage/src/report-run-admission.js";
import { createReportRunManagementStore } from "../../../packages/storage/src/report-run-management.js";
import { createReportContentStore } from "../../../packages/storage/src/report-content-store.js";
import { createReportPdfStore } from "../../../packages/storage/src/report-pdf-store.js";
import { createReportEmailStore } from "../../../packages/storage/src/report-email-store.js";
import {
  createBusinessAccountExportStore,
  businessAccountExportManifest
} from "../../../packages/storage/src/business-account-export.js";
