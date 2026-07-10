import {
  createAccountDeletionChallengeService,
  createGitHubCliAuthService,
  createWebSessionAuthService,
  type AuthEmailSender
} from "../../../packages/auth/src/index.js";
import {
  getDefaultPreset,
  type AnalyticsSettingsUpdate,
  type CaptureRuleCreate,
  type CaptureRuleUpdate,
  type CapturePolicyUpdate,
  type ImprovementSettingsUpdate
} from "../../../packages/shared-types/src/index.js";
import {
  buildBundleRegenerationLeaseKey,
  buildImprovementBundleRegenerationLeaseKey,
  buildUserAvatarObjectKey,
  createPostgresAvailabilityCheckStore,
  createPostgresAccountAnalyticsStore,
  createPostgresAccountStore,
  createPostgresAuditLogStore,
  createPostgresBillingStore,
  createPostgresBillingSyncStore,
  createPostgresIngestionRejectionDiagnosticStore,
  createPostgresAuthStore,
  createPostgresCapturePolicyStore,
  createPostgresCaptureRuleStore,
  createPostgresAnalyticsBundleGenerationStore,
  createPostgresAnalyticsJourneySampleStore,
  createPostgresAnalyticsMetricsStore,
  createPostgresAnalyticsOpportunityStore,
  createPostgresAnalyticsSettingsStore,
  createPostgresAnalyticsUsageStore,
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
  createPostgresSlackDestinationStore,
  createPostgresWeeklyReportChannelStore,
  createPostgresWebhookDeliveryStore,
  runInTransaction,
  deleteProjectObjects,
  executeAvailabilityCheck,
  validateAvailabilityCheckDefinition,
  type ObjectStoreClient,
  type QueueClient,
  type RedisQueueClient,
  type WebhookEventType
} from "../../../packages/storage/src/index.js";
import {
  createBillingManagement
} from "./billing-management.js";
import { createEnvBillingLinkProvider } from "./billing-links.js";
import { createDefaultGitHubManagement } from "./default-github-management.js";
import type { CreateApiDependenciesInput, DefaultApiDependencies } from "./default-dependency-types.js";
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

const BUNDLE_REGENERATION_LEASE_TTL_SECONDS = 30;

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
    queue: input.queue
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
  const captureRuleStore = createPostgresCaptureRuleStore(input.db);
  const analyticsBundleGenerationStore = createPostgresAnalyticsBundleGenerationStore(input.db);
  const analyticsJourneySampleStore = createPostgresAnalyticsJourneySampleStore(input.db);
  const analyticsMetricsStore = createPostgresAnalyticsMetricsStore(input.db);
  const analyticsOpportunityStore = createPostgresAnalyticsOpportunityStore(input.db);
  const analyticsSettingsStore = createPostgresAnalyticsSettingsStore(input.db);
  const analyticsUsageStore = createPostgresAnalyticsUsageStore(input.db);
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
  const webAuth = createWebSessionAuthService(
    webAuthStore,
    {
      ...(input.authEmails === undefined ? {} : { authEmails: input.authEmails }),
      ...(input.githubOAuth === undefined ? {} : { githubOAuth: input.githubOAuth })
    }
  );
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
      : input.adminAnalyticsAccessEmails.map(normalizeEmailForConfig).filter((email) => email.length > 0);
  const adminAnalyticsAccessEmails =
    normalizedAdminAnalyticsAccessEmails.length === 0
      ? null
      : new Set(normalizedAdminAnalyticsAccessEmails);
  const billingAdminEmails =
    input.billingAdminEmails === undefined
      ? null
      : new Set(input.billingAdminEmails.map(normalizeEmailForConfig).filter((email) => email.length > 0));
  const billingManagementServices = createBillingManagement({
    db: input.db,
    ...(input.stripeConfig === undefined ? {} : { stripeConfig: input.stripeConfig }),
    billingStore,
    billingSyncStore,
    ...(accountAnalyticsStore === undefined ? {} : { accountAnalyticsStore }),
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
            getSummary: (request: { now: string }) => accountAnalyticsStore.getAdminAnalyticsSummary(request),
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
    ...(input.ingestionRateLimiter === undefined ? {} : { ingestionRateLimiter: input.ingestionRateLimiter }),
    ...(input.authRateLimiter === undefined ? {} : { authRateLimiter: input.authRateLimiter }),
    auditLogging: auditLogStore,
    memberAuth,
    webAuth,
    accountDeletionAuth,
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
        if (
          result !== null &&
          result !== "other_owned_organizations_exist" &&
          result !== "other_owned_projects_exist"
        ) {
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
    analyticsUsage: analyticsUsageStore,
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

        return runInTransaction(rootDb, async (tx) => {
          const txCaptureRuleStore = createPostgresCaptureRuleStore(tx);
          const created = await txCaptureRuleStore.createCaptureRule({
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

          if (created !== null && accountAnalyticsStore !== undefined) {
            await accountAnalyticsStore.withDb(tx).recordMetricDeltas({
              organization_id: input.organization_id,
              occurred_at: created.created_at,
              source: "capture_rule_created",
              dedupe_key: `capture_rule_created:${created.id}`,
              deltas: {
                capture_rules_created: 1
              }
            });
          }

          return created;
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
      deleteCaptureRuleForProject: async (input: {
        organization_id: string;
        project_id: string;
        rule_id: string;
      }) => {
        return runInTransaction(rootDb, async (tx) => {
          const txCaptureRuleStore = createPostgresCaptureRuleStore(tx);
          const deleted = await txCaptureRuleStore.deleteCaptureRule({
            id: input.rule_id,
            project_id: input.project_id
          });

          if (deleted && accountAnalyticsStore !== undefined) {
            await accountAnalyticsStore.withDb(tx).recordMetricDeltas({
              organization_id: input.organization_id,
              occurred_at: new Date().toISOString(),
              source: "capture_rule_deleted",
              dedupe_key: `capture_rule_deleted:${input.rule_id}`,
              deltas: {
                capture_rules_deleted: 1
              }
            });
          }

          return deleted;
        });
      },
      recordCaptureRuleMatch: (input: { project_id: string; rule_id: string; matched_at: string }) =>
        captureRuleStore.recordCaptureRuleMatch({
          id: input.rule_id,
          project_id: input.project_id,
          matched_at: input.matched_at
        })
    },
    analyticsSettingsManagement: {
      getAnalyticsSettingsForProject: (input: { organization_id: string; project_id: string }) => {
        void input.organization_id;
        return analyticsSettingsStore.getAnalyticsSettingsByProjectId(input.project_id);
      },
      updateAnalyticsSettingsForProject: (input: {
        organization_id: string;
        project_id: string;
        update: AnalyticsSettingsUpdate;
      }) => {
        void input.organization_id;
        return analyticsSettingsStore.updateAnalyticsSettings({
          project_id: input.project_id,
          update: input.update
        });
      }
    },
    analyticsMetrics: {
      getUsageSummaryForProject: (input) => {
        void input.organization_id;
        return analyticsMetricsStore.getUsageSummary(input);
      },
      getRouteMetricsForProject: (input) => {
        void input.organization_id;
        return analyticsMetricsStore.getRouteMetrics(input);
      },
      getJourneyPatternsForProject: (input) => {
        void input.organization_id;
        return analyticsMetricsStore.getJourneyPatterns(input);
      },
      getDeviceBreakdownForProject: (input) => {
        void input.organization_id;
        return analyticsMetricsStore.getDeviceBreakdown(input);
      },
      getReferrerMetricsForProject: (input) => {
        void input.organization_id;
        return analyticsMetricsStore.getReferrerMetrics(input);
      },
      getActionMetricsForProject: (input) => {
        void input.organization_id;
        return analyticsMetricsStore.getActionMetrics(input);
      },
      listFunnelsForProject: (input) => {
        void input.organization_id;
        return analyticsMetricsStore.listFunnels(input);
      },
      getFunnelAnalysisForProject: (input) => {
        void input.organization_id;
        return analyticsMetricsStore.getFunnelAnalysis(input);
      },
      getIncidentImpactForProject: (input) => {
        void input.organization_id;
        return analyticsMetricsStore.getIncidentImpact(input);
      }
    },
    analyticsJourneySamples: {
      listAnalyticsJourneySamplesForProject: (request) => {
        void request.organization_id;
        return analyticsJourneySampleStore.listAnalyticsJourneySamplesForProject(request);
      },
      getAnalyticsJourneySampleForProject: (request) => {
        void request.organization_id;
        return analyticsJourneySampleStore.getAnalyticsJourneySampleForProject(request);
      }
    },
    analyticsBundles: {
      listAnalyticsBundleGenerationsForProject: (request) => {
        void request.organization_id;
        return analyticsBundleGenerationStore.listAnalyticsBundleGenerationsForProject(request);
      },
      requestAnalyticsBundleGenerationForProject: async (request) => {
        void request.organization_id;
        const generation = await analyticsBundleGenerationStore.reserveAnalyticsBundleGeneration({
          project_id: request.project_id,
          requested_by_user_id: request.requested_by_user_id,
          analysis_kind: request.analysis_kind,
          analysis_spec: request.analysis_spec
        });

        if (generation.status === "pending" || generation.status === "running") {
          await input.queue.enqueue("build-analytics-bundle", {
            project_id: generation.project_id,
            generation_id: generation.generation_id,
            requested_at: new Date().toISOString(),
            trigger: "manual"
          });
        }

        return generation;
      },
      getAnalyticsBundleGenerationForProject: (input) => {
        void input.organization_id;
        return analyticsBundleGenerationStore.getAnalyticsBundleGenerationForProject(input);
      }
    },
    analyticsOpportunities: {
      listAnalyticsOpportunitiesForProject: (input) =>
        analyticsOpportunityStore.listAnalyticsOpportunitiesForProject(input),
      getAnalyticsOpportunityForProject: (input) =>
        analyticsOpportunityStore.getAnalyticsOpportunityForProject(input)
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
      listImprovementsForOrganization: (input) => improvementOpportunityStore.listImprovementsForOrganization(input),
      getImprovementForOrganization: (input) => improvementOpportunityStore.getImprovementForOrganization(input),
      resolveImprovementForOrganization: (input) => improvementOpportunityStore.resolveImprovementForOrganization(input),
      reopenImprovementForOrganization: (input) => improvementOpportunityStore.reopenImprovementForOrganization(input),
      snoozeImprovementForOrganization: (input) => improvementOpportunityStore.snoozeImprovementForOrganization!(input)
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
    improvementBundleRegeneration: {
      async requestRegeneration(regenerationInput) {
        const queueWithLease = input.queue as QueueClient &
          Partial<Pick<RedisQueueClient, "acquireLease" | "releaseLease">> & {
            enqueue(jobName: "build-improvement-bundle", payload: {
              project_id: string;
              opportunity_id: string;
              event_id: string;
              event_type?: "log_event" | "request_event";
              occurred_at: string;
              occurrence_count: number;
              trigger: "regeneration";
            }): Promise<void>;
          };
        const leaseKey = buildImprovementBundleRegenerationLeaseKey(regenerationInput.opportunity_id);

        if (queueWithLease.acquireLease !== undefined) {
          const acquired = await queueWithLease.acquireLease(leaseKey, BUNDLE_REGENERATION_LEASE_TTL_SECONDS);
          if (!acquired) {
            return true;
          }
        }

        const improvement = await improvementOpportunityStore.getImprovementForOrganization({
          organization_id: regenerationInput.organization_id,
          improvement_id: regenerationInput.opportunity_id
        });

        if (
          improvement === null ||
          improvement.project_id !== regenerationInput.project_id ||
          improvement.kind === "recurring_incident" ||
          improvement.kind === "post_deploy_regression"
        ) {
          await queueWithLease.releaseLease?.(leaseKey);
          return false;
        }

        const [source] = await improvementOpportunityStore.listImprovementEventReferences({
          opportunity_id: regenerationInput.opportunity_id,
          limit: 1
        });

        if (source === undefined) {
          await queueWithLease.releaseLease?.(leaseKey);
          return false;
        }

        if (source.event_type !== "log_event" && source.event_type !== "request_event") {
          await queueWithLease.releaseLease?.(leaseKey);
          return false;
        }

        try {
          await queueWithLease.enqueue("build-improvement-bundle", {
            project_id: regenerationInput.project_id,
            opportunity_id: regenerationInput.opportunity_id,
            event_id: source.event_id,
            event_type: source.event_type,
            occurred_at: source.occurred_at,
            occurrence_count: improvement.occurrence_count,
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
