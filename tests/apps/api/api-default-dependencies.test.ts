import { gzipSync } from "node:zlib";

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  poolQueryMock,
  poolConfigSpy,
  createRedisIncidentFrequencyCounterMock,
  createRedisAuthRateLimiterMock,
  createRedisIngestionRateLimiterMock,
  createRedisQueueClientMock,
  createS3ObjectStoreClientMock,
  createPostgresAccountStoreMock,
  createPostgresAuditLogStoreMock,
  createPostgresAccountAnalyticsStoreMock,
  createPostgresAuthStoreMock,
  createPostgresBillingStoreMock,
  createPostgresBillingSyncStoreMock,
  createPostgresAnalyticsMetricsStoreMock,
  createPostgresAnalyticsSettingsStoreMock,
  createPostgresCapturePolicyStoreMock,
  createPostgresCaptureRuleStoreMock,
  createPostgresAvailabilityCheckStoreMock,
  createPostgresImprovementOpportunityStoreMock,
  createPostgresImprovementSettingsStoreMock,
  createMemberAuthServiceMock,
  createGitHubOAuthClientMock,
  createGitHubCliAuthServiceMock,
  createAccountDeletionChallengeServiceMock,
  createWebSessionAuthServiceMock,
  createIngestionPersistenceServiceMock,
  createPostgresMetadataStoreMock,
  createPostgresSlackDestinationStoreMock,
  createPostgresOperationalEmailDeliveryStoreMock,
  createPostgresWeeklyReportChannelStoreMock,
  createPostgresWebhookDeliveryStoreMock,
  createPostgresGitHubStoreMock,
  createPostgresGitHubMarketplaceStoreMock,
  createPostgresIngestionRejectionDiagnosticStoreMock,
  createIngestionMetadataServiceMock,
  createIncidentLifecycleServiceMock,
  createSesEmailTransportMock,
  executeAvailabilityCheckMock,
  validateAvailabilityCheckDefinitionMock,
  renderAccountDeletionOtpEmailMock,
  renderEmailAuthCodeEmailMock,
  renderProjectInviteEmailMock,
  recordPlanDowngradeCleanupAuditMock,
  emailTransportSendMock
} = vi.hoisted(() => ({
  poolQueryMock: vi.fn(),
  poolConfigSpy: vi.fn(),
  createRedisIncidentFrequencyCounterMock: vi.fn(),
  createRedisAuthRateLimiterMock: vi.fn(),
  createRedisIngestionRateLimiterMock: vi.fn(),
  createRedisQueueClientMock: vi.fn(),
  createS3ObjectStoreClientMock: vi.fn(),
  createPostgresAccountStoreMock: vi.fn(),
  createPostgresAuditLogStoreMock: vi.fn(),
  createPostgresAccountAnalyticsStoreMock: vi.fn(),
  createPostgresAuthStoreMock: vi.fn(),
  createPostgresBillingStoreMock: vi.fn(),
  createPostgresBillingSyncStoreMock: vi.fn(),
  createPostgresAnalyticsMetricsStoreMock: vi.fn(),
  createPostgresAnalyticsSettingsStoreMock: vi.fn(),
  createPostgresCapturePolicyStoreMock: vi.fn(),
  createPostgresCaptureRuleStoreMock: vi.fn(),
  createPostgresAvailabilityCheckStoreMock: vi.fn(),
  createPostgresImprovementOpportunityStoreMock: vi.fn(),
  createPostgresImprovementSettingsStoreMock: vi.fn(),
  createMemberAuthServiceMock: vi.fn(),
  createGitHubOAuthClientMock: vi.fn(),
  createGitHubCliAuthServiceMock: vi.fn(),
  createAccountDeletionChallengeServiceMock: vi.fn(),
  createWebSessionAuthServiceMock: vi.fn(),
  createIngestionPersistenceServiceMock: vi.fn(),
  createPostgresMetadataStoreMock: vi.fn(),
  createPostgresSlackDestinationStoreMock: vi.fn(),
  createPostgresOperationalEmailDeliveryStoreMock: vi.fn(),
  createPostgresWeeklyReportChannelStoreMock: vi.fn(),
  createPostgresWebhookDeliveryStoreMock: vi.fn(),
  createPostgresGitHubStoreMock: vi.fn(),
  createPostgresGitHubMarketplaceStoreMock: vi.fn(),
  createPostgresIngestionRejectionDiagnosticStoreMock: vi.fn(),
  createIngestionMetadataServiceMock: vi.fn(),
  createIncidentLifecycleServiceMock: vi.fn(),
  createSesEmailTransportMock: vi.fn(),
  executeAvailabilityCheckMock: vi.fn(),
  validateAvailabilityCheckDefinitionMock: vi.fn(),
  renderAccountDeletionOtpEmailMock: vi.fn(),
  renderEmailAuthCodeEmailMock: vi.fn(),
  renderProjectInviteEmailMock: vi.fn(),
  recordPlanDowngradeCleanupAuditMock: vi.fn(),
  emailTransportSendMock: vi.fn()
}));

vi.mock("pg", () => {
  return {
    Pool: class {
      constructor(config: unknown) {
        poolConfigSpy(config);
      }
      query = poolQueryMock;
    }
  };
});

vi.mock("../../../packages/storage/src/index.js", () => ({
  buildRawEventObjectKey: ({ projectId, eventId }: { projectId: string; eventId: string }) => `events/${projectId}/${eventId}.json.gz`,
  buildBundleObjectKey: (projectId: string, incidentId: string) => `bundles/${projectId}/${incidentId}.json.gz`,
  buildImprovementBundleObjectKey: (projectId: string, opportunityId: string) =>
    `improvement-bundles/${projectId}/${opportunityId}.json.gz`,
  buildReproductionObjectKey: (projectId: string, incidentId: string) => `reproductions/${projectId}/${incidentId}.json.gz`,
  buildBundleRegenerationLeaseKey: (incidentId: string) => `leases:bundle-regeneration:${incidentId}`,
  buildImprovementBundleRegenerationLeaseKey: (opportunityId: string) =>
    `leases:improvement-bundle-regeneration:${opportunityId}`,
  buildUserAvatarObjectKey: (userId: string) => `avatars/users/${userId}/profile`,
  deleteProjectObjects: async (
    objectStore: { deleteObjectsByPrefix(prefix: string): Promise<void> },
    projectId: string
  ): Promise<void> => {
    await objectStore.deleteObjectsByPrefix(`raw-events/${projectId}/`);
    await objectStore.deleteObjectsByPrefix(`bundles/${projectId}/`);
    await objectStore.deleteObjectsByPrefix(`improvement-bundles/${projectId}/`);
    await objectStore.deleteObjectsByPrefix(`reproductions/${projectId}/`);
  },
  executeAvailabilityCheck: executeAvailabilityCheckMock,
  validateAvailabilityCheckDefinition: validateAvailabilityCheckDefinitionMock,
  createRedisQueueClient: createRedisQueueClientMock,
  createRedisIncidentFrequencyCounter: createRedisIncidentFrequencyCounterMock,
  createRedisAuthRateLimiter: createRedisAuthRateLimiterMock,
  createRedisIngestionRateLimiter: createRedisIngestionRateLimiterMock,
  createS3ObjectStoreClient: createS3ObjectStoreClientMock,
  createPostgresAccountStore: createPostgresAccountStoreMock,
  createPostgresAuditLogStore: createPostgresAuditLogStoreMock,
  createPostgresAccountAnalyticsStore: createPostgresAccountAnalyticsStoreMock,
  createPostgresAuthStore: createPostgresAuthStoreMock,
  createPostgresBillingStore: createPostgresBillingStoreMock,
  createPostgresAnalyticsMetricsStore: createPostgresAnalyticsMetricsStoreMock,
  createPostgresAnalyticsSettingsStore: createPostgresAnalyticsSettingsStoreMock,
  createPostgresCapturePolicyStore: createPostgresCapturePolicyStoreMock,
  createPostgresAvailabilityCheckStore: createPostgresAvailabilityCheckStoreMock,
  createMemberAuthService: createMemberAuthServiceMock,
  createIngestionPersistenceService: createIngestionPersistenceServiceMock,
  createPostgresMetadataStore: createPostgresMetadataStoreMock,
  createPostgresSlackDestinationStore: createPostgresSlackDestinationStoreMock,
  createPostgresOperationalEmailDeliveryStore: createPostgresOperationalEmailDeliveryStoreMock,
  createPostgresWeeklyReportChannelStore: createPostgresWeeklyReportChannelStoreMock,
  createPostgresWebhookDeliveryStore: createPostgresWebhookDeliveryStoreMock,
  createPostgresGitHubStore: createPostgresGitHubStoreMock,
  createPostgresGitHubMarketplaceStore: createPostgresGitHubMarketplaceStoreMock,
  createPostgresIngestionRejectionDiagnosticStore: createPostgresIngestionRejectionDiagnosticStoreMock,
  createIngestionMetadataService: createIngestionMetadataServiceMock,
  createIncidentLifecycleService: createIncidentLifecycleServiceMock,
  createPostgresBillingSyncStore: createPostgresBillingSyncStoreMock,
  createOrganizationPlanCleanupService: () => ({
    cleanupOrganizationForPlan: async () => ({})
  }),
  isPlanDowngrade: (previousPlan: string, targetPlan: string) => {
    const rank: Record<string, number> = { free: 0, solo: 1, team: 2 };
    return (rank[targetPlan] ?? 0) < (rank[previousPlan] ?? 0);
  },
  normalizePlanForDowngradeAudit: (plan: string | null | undefined) =>
    plan === "solo" || plan === "team" ? plan : "free",
  recordPlanDowngradeCleanupAudit: recordPlanDowngradeCleanupAuditMock,
  runInTransaction: async <Result>(
    db: { query(sql: string, params: unknown[]): Promise<unknown> },
    callback: (tx: { query(sql: string, params: unknown[]): Promise<unknown> }) => Promise<Result>
  ): Promise<Result> => {
    await db.query("BEGIN", []);
    try {
      const result = await callback(db);
      await db.query("COMMIT", []);
      return result;
    } catch (error) {
      await db.query("ROLLBACK", []).catch(() => undefined);
      throw error;
    }
  },
  createPostgresImprovementOpportunityStore: createPostgresImprovementOpportunityStoreMock,
  createPostgresImprovementSettingsStore: createPostgresImprovementSettingsStoreMock,
  createPostgresCaptureRuleStore: createPostgresCaptureRuleStoreMock,
}));

vi.mock("../../../packages/auth/src/index.js", () => ({
  createGitHubOAuthClient: createGitHubOAuthClientMock,
  createGitHubCliAuthService: createGitHubCliAuthServiceMock,
  createAccountDeletionChallengeService: createAccountDeletionChallengeServiceMock,
  createWebSessionAuthService: createWebSessionAuthServiceMock
}));

vi.mock("../../../packages/email/src/index.js", () => ({
  buildEmailBrandMarkUrl: (baseUrl: string | null | undefined) =>
    baseUrl === undefined || baseUrl === null || baseUrl.trim().length === 0
      ? undefined
      : `${baseUrl.replace(/\/+$/, "")}/email/debugbundle-mark.png`,
  createSesEmailTransport: createSesEmailTransportMock,
  formatProductFromEmail: (fromEmail: string) => `DebugBundle <${fromEmail}>`,
  renderAccountDeletionOtpEmail: renderAccountDeletionOtpEmailMock,
  renderEmailAuthCodeEmail: renderEmailAuthCodeEmailMock,
  renderProjectInviteEmail: renderProjectInviteEmailMock
}));

import {
  createApiDependencies,
  getBooleanField,
  getStringField,
  normalizeEmailForConfig,
  normalizeBillingPlan,
  readCsvEnv,
  readSubscriptionInvoiceLinePeriod,
  readUnixTimestampField,
  resolveStripeSubscriptionBillingPeriod
} from "../../../apps/api/src/default-dependencies.ts";
import { createApiDependenciesFromEnv } from "../../../apps/api/src/default-dependencies-env.js";
import { createBillingManagement } from "../../../apps/api/src/billing-management.ts";

describe("api default dependencies", () => {
  beforeEach(() => {
    poolQueryMock.mockReset();
    poolConfigSpy.mockReset();
    createRedisIncidentFrequencyCounterMock.mockReset();
    createRedisAuthRateLimiterMock.mockReset();
    createRedisIngestionRateLimiterMock.mockReset();
    createRedisQueueClientMock.mockReset();
    createS3ObjectStoreClientMock.mockReset();
    createPostgresAuditLogStoreMock.mockReset();
    createPostgresAccountAnalyticsStoreMock.mockReset();
    createPostgresAuthStoreMock.mockReset();
    createPostgresBillingStoreMock.mockReset();
    createPostgresBillingSyncStoreMock.mockReset();
    createPostgresAnalyticsMetricsStoreMock.mockReset();
    createPostgresAnalyticsSettingsStoreMock.mockReset();
    createPostgresCapturePolicyStoreMock.mockReset();
    createPostgresCaptureRuleStoreMock.mockReset();
    createPostgresAvailabilityCheckStoreMock.mockReset();
    createPostgresImprovementOpportunityStoreMock.mockReset();
    createPostgresImprovementSettingsStoreMock.mockReset();
    createMemberAuthServiceMock.mockReset();
    createGitHubOAuthClientMock.mockReset();
    createGitHubCliAuthServiceMock.mockReset();
    createAccountDeletionChallengeServiceMock.mockReset();
    createWebSessionAuthServiceMock.mockReset();
    createIngestionPersistenceServiceMock.mockReset();
    createPostgresMetadataStoreMock.mockReset();
    createPostgresSlackDestinationStoreMock.mockReset();
    createPostgresOperationalEmailDeliveryStoreMock.mockReset();
    createPostgresWeeklyReportChannelStoreMock.mockReset();
    createPostgresWebhookDeliveryStoreMock.mockReset();
    createPostgresGitHubMarketplaceStoreMock.mockReset();
    createPostgresIngestionRejectionDiagnosticStoreMock.mockReset();
    createIngestionMetadataServiceMock.mockReset();
    createIncidentLifecycleServiceMock.mockReset();
    createSesEmailTransportMock.mockReset();
    executeAvailabilityCheckMock.mockReset();
    validateAvailabilityCheckDefinitionMock.mockReset();
    renderAccountDeletionOtpEmailMock.mockReset();
    renderEmailAuthCodeEmailMock.mockReset();
    renderProjectInviteEmailMock.mockReset();
    recordPlanDowngradeCleanupAuditMock.mockReset();
    emailTransportSendMock.mockReset();
    recordPlanDowngradeCleanupAuditMock.mockResolvedValue(undefined);
    validateAvailabilityCheckDefinitionMock.mockResolvedValue({
      normalized_url: "https://app.example.com/health"
    });
    executeAvailabilityCheckMock.mockResolvedValue({
      status: "success",
      http_status: 200,
      duration_ms: 100,
      error_kind: null,
      error_message: null,
      checked_url_host: "app.example.com",
      checked_url_path: "/health",
      checked_url_query: {},
      final_url: "https://app.example.com/health",
      redirect_count: 0
    });

    createRedisQueueClientMock.mockReturnValue({ enqueue: vi.fn() });
    createRedisIncidentFrequencyCounterMock.mockReturnValue({ recordOccurrence: vi.fn(), close: vi.fn() });
    createRedisAuthRateLimiterMock.mockReturnValue({ claimRequest: vi.fn(), close: vi.fn() });
    createRedisIngestionRateLimiterMock.mockReturnValue({ claimEvents: vi.fn(), close: vi.fn() });
    createS3ObjectStoreClientMock.mockReturnValue({ putObject: vi.fn(), getObject: vi.fn() });
    createPostgresAuditLogStoreMock.mockReturnValue({ createAuditLog: vi.fn() });
    createPostgresAccountAnalyticsStoreMock.mockReturnValue({
      getAdminAnalyticsSummary: vi.fn()
    });
    createPostgresAuthStoreMock.mockReturnValue({
      createUserAccount: vi.fn(),
      createSession: vi.fn(),
      resolveSessionByTokenHash: vi.fn(),
      revokeSessionByTokenHash: vi.fn(),
      replaceEmailAuthChallenge: vi.fn(),
      consumeEmailAuthChallenge: vi.fn(),
      markUserEmailVerified: vi.fn(),
      acceptProjectInvite: vi.fn(),
      upsertGitHubUserAccount: vi.fn()
    });
    createPostgresBillingStoreMock.mockReturnValue({
      getBillingSummaryForOrganization: vi.fn(),
      getBillingSummaryForProject: vi.fn()
    });
    createPostgresBillingSyncStoreMock.mockReturnValue({
      isEventProcessed: vi.fn(),
      markEventProcessed: vi.fn(),
      updateEntitlements: vi.fn(),
      resolveOrganizationByStripeCustomerId: vi.fn(),
      linkStripeCustomer: vi.fn(),
      revokeEntitlements: vi.fn(),
      updateBillingState: vi.fn()
    });
    createPostgresAnalyticsMetricsStoreMock.mockReturnValue({
      getUsageSummary: vi.fn(),
      getRouteMetrics: vi.fn(),
      getJourneyPatterns: vi.fn(),
      getDeviceBreakdown: vi.fn(),
      getReferrerMetrics: vi.fn(),
      getFunnelAnalysis: vi.fn()
    });
    createPostgresAnalyticsSettingsStoreMock.mockReturnValue({
      getAnalyticsSettingsByProjectId: vi.fn(),
      updateAnalyticsSettings: vi.fn()
    });
    createPostgresCapturePolicyStoreMock.mockReturnValue({
      getCapturePolicyByProjectId: vi.fn(),
      upsertCapturePolicy: vi.fn(),
      createDefaultCapturePolicy: vi.fn()
    });
    createPostgresCaptureRuleStoreMock.mockReturnValue({
      listCaptureRulesByProjectId: vi.fn(),
      listActiveCaptureRulesByProjectId: vi.fn(),
      createCaptureRule: vi.fn(),
      updateCaptureRule: vi.fn(),
      deleteCaptureRule: vi.fn(),
      recordCaptureRuleMatch: vi.fn()
    });
    createPostgresAvailabilityCheckStoreMock.mockReturnValue({
      listChecksForProjectInOrganization: vi.fn(),
      getCheckForProjectInOrganization: vi.fn(),
      createCheckForProjectInOrganization: vi.fn(),
      updateCheckForProjectInOrganization: vi.fn(),
      deleteCheckForProjectInOrganization: vi.fn(),
      listResultsForCheckInOrganization: vi.fn(),
      listDailyRollupsForCheckInOrganization: vi.fn(),
      claimNextDueCheck: vi.fn(),
      recordCheckExecution: vi.fn(),
      linkIncidentToCheck: vi.fn(),
      appendIncidentToDailyRollup: vi.fn(),
      purgeExpiredResults: vi.fn(),
      purgeExpiredDailyRollups: vi.fn()
    });
    createPostgresImprovementOpportunityStoreMock.mockReturnValue({
      listImprovementsForOrganization: vi.fn(),
      getImprovementForOrganization: vi.fn(),
      resolveImprovementForOrganization: vi.fn(),
      reopenImprovementForOrganization: vi.fn(),
      snoozeImprovementForOrganization: vi.fn()
    });
    createPostgresImprovementSettingsStoreMock.mockReturnValue({
      getImprovementSettingsForProject: vi.fn(),
      updateImprovementSettingsForProject: vi.fn()
    });
    createMemberAuthServiceMock.mockReturnValue({ resolveMemberByTokenHash: vi.fn() });
    createGitHubOAuthClientMock.mockReturnValue({
      exchangeCodeForIdentity: vi.fn(),
      resolveIdentityFromAccessToken: vi.fn(),
      beginDeviceAuthorization: vi.fn(),
      pollDeviceAuthorization: vi.fn()
    });
    createGitHubCliAuthServiceMock.mockReturnValue({
      beginDeviceAuth: vi.fn(),
      pollDeviceAuth: vi.fn(),
      claimDeviceAuth: vi.fn(),
      exchangeGitHubAccessToken: vi.fn()
    });
    createAccountDeletionChallengeServiceMock.mockReturnValue({
      requestDeletionOtp: vi.fn(),
      verifyDeletionOtp: vi.fn()
    });
    createWebSessionAuthServiceMock.mockReturnValue({
      requestEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      beginGithubAuth: vi.fn(),
      completeGithubAuth: vi.fn(),
      acceptInviteForSession: vi.fn(),
      resolveSessionByToken: vi.fn(),
      revokeSessionByToken: vi.fn()
    });
    createSesEmailTransportMock.mockReturnValue({ send: emailTransportSendMock });
    renderAccountDeletionOtpEmailMock.mockReturnValue({
      subject: "Your DebugBundle account deletion code",
      text: "654321",
      html: "<b>654321</b>"
    });
    renderEmailAuthCodeEmailMock.mockReturnValue({ subject: "Your DebugBundle code", text: "123456", html: "<b>123456</b>" });
    renderProjectInviteEmailMock.mockReturnValue({ subject: "Invite", text: "invite-text", html: "invite-html" });
    createIngestionPersistenceServiceMock.mockReturnValue({ persistAndEnqueue: vi.fn() });
    createPostgresMetadataStoreMock.mockReturnValue({
      listProjectsForOrganization: vi.fn(),
      createProjectForOrganization: vi.fn(),
      updateProjectForOrganization: vi.fn(),
      deleteProjectForOrganization: vi.fn(),
      listIncidentsForOrganization: vi.fn(),
      getIncidentForOrganization: vi.fn(),
      getBundleFailureReasonForOrganization: vi.fn(),
      getBundleSourceForOrganization: vi.fn(),
      markBundleGenerationFailure: vi.fn(),
      listIncidentLogsForOrganization: vi.fn(),
      listServicesForOrganization: vi.fn(),
      listAlertsForOrganization: vi.fn(),
      createAlertForOrganization: vi.fn(),
      updateAlertForOrganization: vi.fn(),
      deleteAlertForOrganization: vi.fn(),
      listProjectTokensForOrganization: vi.fn(),
      createProjectTokenForOrganization: vi.fn(),
      revokeProjectTokenForOrganization: vi.fn(),
      listMemberTokensForOrganization: vi.fn(),
      createMemberTokenForOrganization: vi.fn(),
      revokeMemberTokenForOrganization: vi.fn(),
      listActiveProbesForProject: vi.fn(),
      listActiveProbesForProjectInOrganization: vi.fn(),
      createProbeActivationForProjectInOrganization: vi.fn(),
      deactivateProbeActivationForProjectInOrganization: vi.fn()
    });
    createPostgresSlackDestinationStoreMock.mockReturnValue({});
    createPostgresOperationalEmailDeliveryStoreMock.mockReturnValue({
      listPendingDeliveries: vi.fn(),
      createDelivery: vi.fn(),
      markDeliveryAttempt: vi.fn(),
      markDeliverySucceeded: vi.fn(),
      markDeliveryFailed: vi.fn()
    });
    createPostgresWeeklyReportChannelStoreMock.mockReturnValue({
      listWeeklyReportChannelsForOrganization: vi.fn(),
      createWeeklyReportChannelForOrganization: vi.fn(),
      updateWeeklyReportChannelForOrganization: vi.fn(),
      deleteWeeklyReportChannelForOrganization: vi.fn(),
      listEnabledWeeklyReportChannels: vi.fn(),
      getWeeklyReportChannelById: vi.fn()
    });
    createPostgresWebhookDeliveryStoreMock.mockReturnValue({
      listDeliveriesForWebhookInOrganization: vi.fn(),
      listWebhooksForOrganization: vi.fn(),
      createWebhookForOrganization: vi.fn(),
      getWebhookForOrganization: vi.fn(),
      updateWebhookForOrganization: vi.fn(),
      deleteWebhookForOrganization: vi.fn(),
      createTestDeliveryForOrganization: vi.fn().mockResolvedValue({
        delivery_id: "del_123",
        event_type: "verification.passed"
      })
    });
    createPostgresGitHubMarketplaceStoreMock.mockReturnValue({
      isEventProcessed: vi.fn(),
      markEventProcessed: vi.fn(),
      upsertMarketplaceAccount: vi.fn(),
      linkOrganizationToMarketplaceAccountByInstallationId: vi.fn()
    });
    createIngestionMetadataServiceMock.mockReturnValue({
      resolveProjectByTokenHash: vi.fn(),
      persistEventMetadata: vi.fn()
    });
  });

  it("normalizes env csv values and billing plans", () => {
    expect(readCsvEnv({ CORS_ORIGINS: undefined }, "CORS_ORIGINS")).toBeUndefined();
    expect(readCsvEnv({ CORS_ORIGINS: " , https://app.test ,, https://admin.test " }, "CORS_ORIGINS")).toEqual([
      "https://app.test",
      "https://admin.test"
    ]);
    expect(readCsvEnv({ CORS_ORIGINS: " , , " }, "CORS_ORIGINS")).toBeUndefined();

    expect(normalizeEmailForConfig(" Owen@Example.COM ")).toBe("owen@example.com");
    expect(normalizeBillingPlan("solo")).toBe("solo");
    expect(normalizeBillingPlan("team")).toBe("team");
    expect(normalizeBillingPlan("anything-else")).toBe("free");
    expect(normalizeBillingPlan(null)).toBe("free");
  });

  it("reads string, boolean, and unix timestamp fields safely", () => {
    expect(getStringField({ customer_id: "cus_123" }, "customer_id")).toBe("cus_123");
    expect(getStringField({ customer_id: 42 }, "customer_id")).toBeNull();
    expect(getBooleanField({ email_verification_required: true }, "email_verification_required")).toBe(true);
    expect(getBooleanField({ email_verification_required: "true" }, "email_verification_required")).toBe(false);

    expect(readUnixTimestampField(null, "start")).toBeNull();
    expect(readUnixTimestampField({ start: "123" }, "start")).toBeNull();
    expect(readUnixTimestampField({ start: 123 }, "start")).toBe(123);
  });

  it("reads invoice line periods and resolves stripe billing windows from fallback fields", () => {
    expect(readSubscriptionInvoiceLinePeriod(null)).toEqual({ start: null, end: null });
    expect(readSubscriptionInvoiceLinePeriod({ lines: null })).toEqual({ start: null, end: null });
    expect(readSubscriptionInvoiceLinePeriod({ lines: { data: null } })).toEqual({ start: null, end: null });
    expect(readSubscriptionInvoiceLinePeriod({ lines: { data: [{ period: null }] } })).toEqual({ start: null, end: null });
    expect(readSubscriptionInvoiceLinePeriod({ lines: { data: [{ period: { start: 100, end: 200 } }] } })).toEqual({
      start: 100,
      end: 200
    });

    expect(
      resolveStripeSubscriptionBillingPeriod({
        current_period_start: null,
        current_period_end: null,
        latest_invoice: {
          lines: {
            data: [
              {
                period: {
                  start: 1710000000,
                  end: 1712592000
                }
              }
            ]
          },
          period_start: null,
          period_end: null
        }
      } as never)
    ).toEqual({
      starts_at: new Date(1710000000 * 1000).toISOString(),
      ends_at: new Date(1712592000 * 1000).toISOString()
    });

    expect(
      resolveStripeSubscriptionBillingPeriod({
        current_period_start: null,
        current_period_end: null,
        latest_invoice: {
          lines: {
            data: [
              {
                period: {
                  start: null,
                  end: null
                }
              }
            ]
          },
          period_start: 1710000000,
          period_end: 1712592000
        }
      } as never)
    ).toEqual({
      starts_at: new Date(1710000000 * 1000).toISOString(),
      ends_at: new Date(1712592000 * 1000).toISOString()
    });

    expect(
      resolveStripeSubscriptionBillingPeriod({
        current_period_start: 1712592000,
        current_period_end: 1710000000,
        latest_invoice: "in_123"
      } as never)
    ).toEqual({ starts_at: null, ends_at: null });
  });

  it("overrides organization billing through the billing management service", async () => {
    const summary = {
      organization_id: "org_123",
      plan: "solo",
      billing_state: "admin_override",
      stripe_customer_id: null,
      active_projects: 1,
      capacity_units: {
        total: 3,
        included: 3,
        additional_purchased: 0,
        pending_reduction: null
      },
      usage_window: {
        starts_at: "2026-06-01T00:00:00.000Z",
        ends_at: "2026-07-01T00:00:00.000Z"
      },
      allowances: {
        monthly_bundle_requests: { used: 0, limit: 1000 },
        monthly_raw_ingested_events: { used: 0, limit: 10000 },
        retained_bundle_cap: { used: 0, limit: 100 },
        monthly_remote_activations: { used: 0, limit: 10 },
        monthly_alert_deliveries: { used: 0, limit: 100 },
        monthly_webhook_deliveries: { used: 0, limit: 100 }
      },
      trial: {
        available: false,
        active: false,
        plan: null,
        started_at: null,
        ends_at: null,
        used_at: null,
        converted_at: null,
        expired_at: null,
        days_remaining: null
      }
    };
    let previousPlanIndex = 0;
    const previousPlans = ["team", "solo"];
    const db = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT") && sql.includes("additional_capacity_units")) {
          const plan = previousPlans[previousPlanIndex] ?? "free";
          previousPlanIndex += 1;
          return { rows: [{ plan, additional_capacity_units: 0 }] };
        }

        if (sql.includes("UPDATE organizations")) {
          return { rows: [{ id: "org_123" }] };
        }

        return { rows: [], rowCount: 0 };
      })
    };
    const billingStore = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(summary)
    };
    const service = createBillingManagement({
      db,
      billingStore: billingStore as never,
      billingSyncStore: {} as never,
      billingLinks: {
        createCheckoutUrl: vi.fn().mockReturnValue(null),
        createPortalUrl: vi.fn().mockReturnValue(null)
      }
    });

    await expect(
      service.overrideOrganizationBilling({
        organization_id: "org_123",
        plan: "solo",
        additional_capacity_units: 999,
        now: "2026-06-04T12:00:00.000Z"
      })
    ).resolves.toBe(summary);
    await expect(
      service.overrideOrganizationBilling({
        organization_id: "org_123",
        plan: "free",
        additional_capacity_units: 5,
        now: "2026-06-04T12:00:01.000Z"
      })
    ).resolves.toBe(summary);

    expect(db.query).toHaveBeenCalledWith("BEGIN", []);
    expect(db.query).toHaveBeenCalledWith("COMMIT", []);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE organizations"), [
      "org_123",
      "solo",
      99,
      "2026-06-04T12:00:00.000Z",
      "admin_override:2026-06-04T12:00:00.000Z"
    ]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE organizations"), [
      "org_123",
      "free",
      0,
      "2026-06-04T12:00:01.000Z",
      "admin_override:2026-06-04T12:00:01.000Z"
    ]);
    expect(recordPlanDowngradeCleanupAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        previous_plan: "team",
        target_plan: "solo",
        trigger_source: "admin_override",
        occurred_at: "2026-06-04T12:00:00.000Z"
      })
    );
    expect(recordPlanDowngradeCleanupAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        previous_plan: "solo",
        target_plan: "free",
        trigger_source: "admin_override",
        occurred_at: "2026-06-04T12:00:01.000Z"
      })
    );
  });

  it("returns billing_not_found when admin billing override cannot update or reload", async () => {
    const db = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        if (sql.includes("UPDATE organizations") && params[0] === "org_123") {
          return { rows: [{ id: "org_123" }] };
        }

        return { rows: [] };
      })
    };
    const billingStore = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(null)
    };
    const service = createBillingManagement({
      db,
      billingStore: billingStore as never,
      billingSyncStore: {} as never,
      billingLinks: {
        createCheckoutUrl: vi.fn().mockReturnValue(null),
        createPortalUrl: vi.fn().mockReturnValue(null)
      }
    });

    await expect(
      service.overrideOrganizationBilling({
        organization_id: "missing",
        plan: "team",
        additional_capacity_units: 1,
        now: "2026-06-04T12:00:00.000Z"
      })
    ).resolves.toBe("billing_not_found");
    await expect(
      service.overrideOrganizationBilling({
        organization_id: "org_123",
        plan: "team",
        additional_capacity_units: 1,
        now: "2026-06-04T12:00:01.000Z"
      })
    ).resolves.toBe("billing_not_found");
  });

  it("should compose ingestion services from object store, queue, and db", async (): Promise<void> => {
    const objectStore = {
      putObject: vi.fn(),
      getObject: vi.fn(),
      deleteObjectsByPrefix: vi.fn()
    };
    const queue = {
      enqueue: vi.fn()
    };
    const db = {
      query: vi.fn()
    };

    const deps = createApiDependencies({
      objectStore,
      queue,
      db
    });

    expect(createIngestionPersistenceServiceMock).toHaveBeenCalledWith({ objectStore, queue });
    expect(createPostgresMetadataStoreMock).toHaveBeenCalledWith(db, {});
    expect(createPostgresAuthStoreMock).toHaveBeenCalledWith(db, {});
    expect(createPostgresWeeklyReportChannelStoreMock).toHaveBeenCalledWith(db);
    expect(createMemberAuthServiceMock).toHaveBeenCalledWith(expect.anything());
    expect(createWebSessionAuthServiceMock).toHaveBeenCalledWith(expect.anything(), expect.any(Object));
    expect(createPostgresWebhookDeliveryStoreMock).toHaveBeenCalledWith(db);
    expect(createIngestionMetadataServiceMock).toHaveBeenCalledWith(expect.anything(), {});
    expect(typeof deps.ingestionPersistence.persistAndEnqueue).toBe("function");
    expect(typeof deps.ingestionMetadata.resolveProjectByTokenHash).toBe("function");
    expect(typeof deps.ingestionMetadata.persistEventMetadata).toBe("function");
    expect(deps.ingestionRateLimiter).toBeUndefined();
    expect(deps.authRateLimiter).toBeUndefined();
    expect(typeof deps.memberAuth.resolveMemberByTokenHash).toBe("function");
    expect(typeof deps.webAuth.requestEmailCode).toBe("function");
    expect(typeof deps.webAuth.verifyEmailCode).toBe("function");
    expect(typeof deps.webAuth.beginGithubAuth).toBe("function");
    expect(typeof deps.webAuth.completeGithubAuth).toBe("function");
    expect(typeof deps.webAuth.acceptInviteForSession).toBe("function");
    expect(typeof deps.webAuth.resolveSessionByToken).toBe("function");
    expect(typeof deps.webAuth.revokeSessionByToken).toBe("function");
    expect(deps.inviteEmails).toBeUndefined();
    expect(typeof deps.tokenManagement.listProjectTokensForOrganization).toBe("function");
    expect(typeof deps.tokenManagement.createProjectTokenForOrganization).toBe("function");
    expect(typeof deps.tokenManagement.revokeProjectTokenForOrganization).toBe("function");
    expect(typeof deps.tokenManagement.listMemberTokensForOrganization).toBe("function");
    expect(typeof deps.tokenManagement.createMemberTokenForOrganization).toBe("function");
    expect(typeof deps.tokenManagement.revokeMemberTokenForOrganization).toBe("function");
    expect(typeof deps.probeManagement.listActiveProbesForProject).toBe("function");
    expect(typeof deps.probeManagement.listActiveProbesForProjectInOrganization).toBe("function");
    expect(typeof deps.probeManagement.createProbeActivationForProjectInOrganization).toBe("function");
    expect(typeof deps.probeManagement.deactivateProbeActivationForProjectInOrganization).toBe("function");
    expect(typeof deps.captureRuleManagement.listCaptureRulesForProject).toBe("function");
    expect(typeof deps.captureRuleManagement.listActiveCaptureRulesForProject).toBe("function");
    expect(typeof deps.captureRuleManagement.createCaptureRuleForProject).toBe("function");
    expect(typeof deps.captureRuleManagement.updateCaptureRuleForProject).toBe("function");
    expect(typeof deps.captureRuleManagement.deleteCaptureRuleForProject).toBe("function");
    expect(typeof deps.captureRuleManagement.recordCaptureRuleMatch).toBe("function");
    expect(typeof deps.analyticsSettingsManagement.getAnalyticsSettingsForProject).toBe("function");
    expect(typeof deps.analyticsSettingsManagement.updateAnalyticsSettingsForProject).toBe("function");
    expect(typeof deps.analyticsMetrics.getUsageSummaryForProject).toBe("function");
    expect(typeof deps.analyticsMetrics.getRouteMetricsForProject).toBe("function");
    expect(typeof deps.analyticsMetrics.getJourneyPatternsForProject).toBe("function");
    expect(typeof deps.analyticsMetrics.getDeviceBreakdownForProject).toBe("function");
    expect(typeof deps.analyticsMetrics.getReferrerMetricsForProject).toBe("function");
    expect(typeof deps.analyticsMetrics.getFunnelAnalysisForProject).toBe("function");
    expect(typeof deps.projectManagement.listProjectsForOrganization).toBe("function");
    expect(typeof deps.projectManagement.createProjectForOrganization).toBe("function");
    expect(typeof deps.projectManagement.updateProjectForOrganization).toBe("function");
    expect(typeof deps.billingManagement.getBillingSummaryForOrganization).toBe("function");
    expect(typeof deps.billingManagement.getBillingSummaryForProject).toBe("function");
    expect(typeof deps.billingManagement.increaseCapacity).toBe("function");
    expect(typeof deps.billingManagement.scheduleCapacityReduction).toBe("function");
    expect(typeof deps.billingManagement.cancelCapacityReduction).toBe("function");
    expect(typeof deps.incidentRetrieval.listIncidentsForOrganization).toBe("function");
    expect(typeof deps.incidentRetrieval.getIncidentForOrganization).toBe("function");
    expect(typeof deps.incidentRetrieval.listIncidentLogsForOrganization).toBe("function");
    expect(typeof deps.incidentRetrieval.listServicesForOrganization).toBe("function");
    expect(typeof deps.improvementManagement?.listImprovementsForOrganization).toBe("function");
    expect(typeof deps.improvementManagement?.getImprovementForOrganization).toBe("function");
    expect(typeof deps.improvementManagement?.resolveImprovementForOrganization).toBe("function");
    expect(typeof deps.improvementManagement?.reopenImprovementForOrganization).toBe("function");
    expect(typeof deps.improvementManagement?.snoozeImprovementForOrganization).toBe("function");
    expect(typeof deps.objectStoreReader.getObject).toBe("function");
    expect(typeof deps.bundleRegeneration.requestRegeneration).toBe("function");
    expect(typeof deps.alertManagement.listAlertsForOrganization).toBe("function");
    expect(typeof deps.alertManagement.createAlertForOrganization).toBe("function");
    expect(typeof deps.alertManagement.updateAlertForOrganization).toBe("function");
    expect(typeof deps.alertManagement.deleteAlertForOrganization).toBe("function");
    expect(typeof deps.weeklyReportManagement.listWeeklyReportChannelsForOrganization).toBe("function");
    expect(typeof deps.weeklyReportManagement.createWeeklyReportChannelForOrganization).toBe("function");
    expect(typeof deps.weeklyReportManagement.updateWeeklyReportChannelForOrganization).toBe("function");
    expect(typeof deps.weeklyReportManagement.deleteWeeklyReportChannelForOrganization).toBe("function");
    expect(typeof deps.webhookDelivery.listDeliveriesForWebhookInOrganization).toBe("function");
    expect(typeof deps.webhookTesting.triggerTestDelivery).toBe("function");

    void deps.incidentRetrieval.listIncidentsForOrganization({ organization_id: "org_123", limit: 5 });
    void deps.incidentRetrieval.getIncidentForOrganization({ organization_id: "org_123", incident_id: "inc_123" });
    void deps.incidentRetrieval.listIncidentLogsForOrganization({
      organization_id: "org_123",
      incident_id: "inc_123",
      level: "error",
      cursor: {
        occurred_at: "2026-03-11T00:10:00.000Z",
        event_id: "550e8400-e29b-41d4-a716-446655440000"
      },
      limit: 5
    });
    void deps.incidentRetrieval.listServicesForOrganization!({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 10
    });
    void deps.improvementManagement?.listImprovementsForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      status: "open",
      limit: 10
    });
    void deps.improvementManagement?.getImprovementForOrganization({
      organization_id: "org_123",
      improvement_id: "imp_123"
    });
    void deps.improvementManagement?.resolveImprovementForOrganization?.({
      organization_id: "org_123",
      improvement_id: "imp_123",
      resolved_by_member_id: "usr_123",
      resolved_at: "2026-03-11T00:00:00.000Z"
    });
    void deps.improvementManagement?.reopenImprovementForOrganization?.({
      organization_id: "org_123",
      improvement_id: "imp_123"
    });
    void deps.improvementManagement?.snoozeImprovementForOrganization?.({
      organization_id: "org_123",
      improvement_id: "imp_123",
      snoozed_until: "2026-03-18T00:00:00.000Z"
    });
    void deps.tokenManagement.listProjectTokensForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 10
    });
    void deps.tokenManagement.createProjectTokenForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      label: "ci",
      allowed_origins: [],
      token_hash: "hash_proj"
    });
    void deps.tokenManagement.revokeProjectTokenForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      token_id: "tok_123",
      revoked_at: "2026-03-11T00:00:00.000Z"
    });
    void deps.tokenManagement.listMemberTokensForOrganization({
      organization_id: "org_123",
      user_id: "usr_123",
      limit: 10
    });
    void deps.tokenManagement.createMemberTokenForOrganization({
      organization_id: "org_123",
      user_id: "usr_123",
      label: "cli",
      token_hash: "hash_mem"
    });
    void deps.tokenManagement.revokeMemberTokenForOrganization({
      organization_id: "org_123",
      user_id: "usr_123",
      token_id: "tok_456",
      revoked_at: "2026-03-11T00:00:00.000Z"
    });
    void deps.probeManagement.listActiveProbesForProject({
      project_id: "proj_123",
      now: "2026-03-11T00:00:00.000Z"
    });
    void deps.probeManagement.listActiveProbesForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      now: "2026-03-11T00:00:00.000Z"
    });
    void deps.probeManagement.createProbeActivationForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_member_id: "usr_123",
      label_pattern: "checkout.*",
      service: "*",
      environment: "*",
      expires_at: "2026-03-11T01:00:00.000Z",
      trigger_expires_at: "2026-03-12T01:00:00.000Z"
    });
    void deps.probeManagement.deactivateProbeActivationForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      activation_id: "act_123",
      deactivated_at: "2026-03-11T00:30:00.000Z"
    });
    void deps.projectManagement.listProjectsForOrganization({
      organization_id: "org_123",
      now: "2026-03-19T00:00:00.000Z",
      limit: 10
    });
    void deps.projectManagement.createProjectForOrganization({
      organization_id: "org_123",
      name: "Main App",
      slug: "main-app",
      environment_default: "production"
    });
    void deps.projectManagement.updateProjectForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      name: "Main App API"
    });
    void deps.webAuth.requestEmailCode({
      email: "owen@example.com",
      accepted_terms_at: "2026-03-17T00:00:00.000Z"
    });
    void deps.webAuth.verifyEmailCode({
      email: "owen@example.com",
      code: "123456"
    });
    void deps.webAuth.beginGithubAuth({ now: new Date("2026-03-17T00:00:00.000Z") });
    void deps.webAuth.completeGithubAuth({
      code: "oauth-code",
      state: "oauth-state-token",
      stateCookieValue: "oauth-state-token"
    });
    void deps.webAuth.resolveSessionByToken("session-secret");
    void deps.webAuth.revokeSessionByToken("session-secret");
    void deps.objectStoreReader.getObject({ key: "bundles/proj_123/inc_123/bundle.json.gz" });
    void deps.alertManagement.listAlertsForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 10
    });
    void deps.alertManagement.createAlertForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      channel: "email",
      condition_type: "new_incident",
      cooldown_seconds: 0,
      config: { to: "owner@example.com" },
      is_enabled: true
    });
    void deps.alertManagement.updateAlertForOrganization({
      organization_id: "org_123",
      alert_id: "alt_123",
      is_enabled: false
    });
    void deps.alertManagement.deleteAlertForOrganization({
      organization_id: "org_123",
      alert_id: "alt_123"
    });
    void deps.weeklyReportManagement.listWeeklyReportChannelsForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 10
    });
    void deps.weeklyReportManagement.createWeeklyReportChannelForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      channel: "email",
      config: { to: ["team@example.com"] },
      schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
      is_enabled: true
    });
    void deps.weeklyReportManagement.updateWeeklyReportChannelForOrganization({
      organization_id: "org_123",
      channel_id: "wr_123",
      is_enabled: false
    });
    void deps.weeklyReportManagement.deleteWeeklyReportChannelForOrganization({
      organization_id: "org_123",
      channel_id: "wr_123"
    });
    void deps.webhookManagement.listWebhooksForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 10
    });
    void deps.webhookManagement.createWebhookForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      url: "https://hooks.example.test/debugbundle",
      signing_secret: "secret_123",
      events: ["bundle.created"],
      filters: {},
      is_enabled: true
    });
    void deps.webhookManagement.getWebhookForOrganization({
      organization_id: "org_123",
      webhook_id: "wh_123"
    });
    void deps.webhookManagement.updateWebhookForOrganization({
      organization_id: "org_123",
      webhook_id: "wh_123",
      is_enabled: false
    });
    void deps.webhookManagement.deleteWebhookForOrganization({
      organization_id: "org_123",
      webhook_id: "wh_123"
    });
    await deps.webhookTesting.triggerTestDelivery({
      organization_id: "org_123",
      webhook_id: "wh_123",
      event_type: "verification.passed"
    });

    const metadataStore = createPostgresMetadataStoreMock.mock.results[0]?.value as {
      listIncidentsForOrganization: ReturnType<typeof vi.fn>;
      getIncidentForOrganization: ReturnType<typeof vi.fn>;
      listIncidentLogsForOrganization: ReturnType<typeof vi.fn>;
      listServicesForOrganization: ReturnType<typeof vi.fn>;
      listAlertsForOrganization: ReturnType<typeof vi.fn>;
      createAlertForOrganization: ReturnType<typeof vi.fn>;
      updateAlertForOrganization: ReturnType<typeof vi.fn>;
      deleteAlertForOrganization: ReturnType<typeof vi.fn>;
      listProjectTokensForOrganization: ReturnType<typeof vi.fn>;
      createProjectTokenForOrganization: ReturnType<typeof vi.fn>;
      revokeProjectTokenForOrganization: ReturnType<typeof vi.fn>;
      listMemberTokensForOrganization: ReturnType<typeof vi.fn>;
      createMemberTokenForOrganization: ReturnType<typeof vi.fn>;
      revokeMemberTokenForOrganization: ReturnType<typeof vi.fn>;
      listActiveProbesForProject: ReturnType<typeof vi.fn>;
      listActiveProbesForProjectInOrganization: ReturnType<typeof vi.fn>;
      createProbeActivationForProjectInOrganization: ReturnType<typeof vi.fn>;
      deactivateProbeActivationForProjectInOrganization: ReturnType<typeof vi.fn>;
      listProjectsForOrganization: ReturnType<typeof vi.fn>;
      createProjectForOrganization: ReturnType<typeof vi.fn>;
      updateProjectForOrganization: ReturnType<typeof vi.fn>;
    };
    const improvementOpportunityStore = createPostgresImprovementOpportunityStoreMock.mock.results[0]?.value as {
      listImprovementsForOrganization: ReturnType<typeof vi.fn>;
      getImprovementForOrganization: ReturnType<typeof vi.fn>;
      resolveImprovementForOrganization: ReturnType<typeof vi.fn>;
      reopenImprovementForOrganization: ReturnType<typeof vi.fn>;
      snoozeImprovementForOrganization: ReturnType<typeof vi.fn>;
    };
    const webhookStore = createPostgresWebhookDeliveryStoreMock.mock.results[0]?.value as {
      createTestDeliveryForOrganization: ReturnType<typeof vi.fn>;
    };

    expect(metadataStore.listIncidentsForOrganization).toHaveBeenCalledWith({ organization_id: "org_123", limit: 5 });
    expect(metadataStore.getIncidentForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      incident_id: "inc_123"
    });
    expect(metadataStore.listIncidentLogsForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      incident_id: "inc_123",
      level: "error",
      cursor: {
        occurred_at: "2026-03-11T00:10:00.000Z",
        event_id: "550e8400-e29b-41d4-a716-446655440000"
      },
      limit: 5
    });
    expect(metadataStore.listServicesForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 10
    });
    expect(improvementOpportunityStore.listImprovementsForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "proj_123",
      status: "open",
      limit: 10
    });
    expect(improvementOpportunityStore.getImprovementForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      improvement_id: "imp_123"
    });
    expect(improvementOpportunityStore.resolveImprovementForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      improvement_id: "imp_123",
      resolved_by_member_id: "usr_123",
      resolved_at: "2026-03-11T00:00:00.000Z"
    });
    expect(improvementOpportunityStore.reopenImprovementForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      improvement_id: "imp_123"
    });
    expect(improvementOpportunityStore.snoozeImprovementForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      improvement_id: "imp_123",
      snoozed_until: "2026-03-18T00:00:00.000Z"
    });
    expect(metadataStore.listProjectTokensForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 10
    });
    expect(metadataStore.createProjectTokenForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "proj_123",
      label: "ci",
      allowed_origins: [],
      token_hash: "hash_proj"
    });
    expect(metadataStore.revokeProjectTokenForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "proj_123",
      token_id: "tok_123",
      revoked_at: "2026-03-11T00:00:00.000Z"
    });
    expect(metadataStore.listMemberTokensForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      user_id: "usr_123",
      limit: 10
    });
    expect(metadataStore.createMemberTokenForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      user_id: "usr_123",
      label: "cli",
      token_hash: "hash_mem"
    });
    expect(metadataStore.revokeMemberTokenForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      user_id: "usr_123",
      token_id: "tok_456",
      revoked_at: "2026-03-11T00:00:00.000Z"
    });
    expect(metadataStore.listActiveProbesForProject).toHaveBeenCalledWith({
      project_id: "proj_123",
      now: "2026-03-11T00:00:00.000Z"
    });
    expect(metadataStore.listActiveProbesForProjectInOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "proj_123",
      now: "2026-03-11T00:00:00.000Z"
    });
    expect(metadataStore.createProbeActivationForProjectInOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_member_id: "usr_123",
      label_pattern: "checkout.*",
      service: "*",
      environment: "*",
      expires_at: "2026-03-11T01:00:00.000Z",
      trigger_expires_at: "2026-03-12T01:00:00.000Z"
    });
    expect(metadataStore.deactivateProbeActivationForProjectInOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "proj_123",
      activation_id: "act_123",
      deactivated_at: "2026-03-11T00:30:00.000Z"
    });
    expect(metadataStore.listProjectsForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      now: "2026-03-19T00:00:00.000Z",
      limit: 10
    });
    expect(metadataStore.createProjectForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      name: "Main App",
      slug: "main-app",
      environment_default: "production"
    });
    expect(metadataStore.updateProjectForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "proj_123",
      name: "Main App API"
    });
    expect(objectStore.getObject).toHaveBeenCalledWith({ key: "bundles/proj_123/inc_123/bundle.json.gz" });
    expect(metadataStore.listAlertsForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 10
    });
    expect(metadataStore.createAlertForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      channel: "email",
      condition_type: "new_incident",
      config: { to: "owner@example.com" },
      cooldown_seconds: 0,
      is_enabled: true
    });
    expect(metadataStore.updateAlertForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      alert_id: "alt_123",
      is_enabled: false
    });
    expect(metadataStore.deleteAlertForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      alert_id: "alt_123"
    });
    expect(typeof deps.weeklyReportManagement.listWeeklyReportChannelsForOrganization).toBe("function");
    expect(typeof deps.webhookManagement.listWebhooksForOrganization).toBe("function");
    expect(webhookStore.createTestDeliveryForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      webhook_id: "wh_123",
      event_type: "verification.passed"
    });
    expect(queue.enqueue).toHaveBeenCalledWith("deliver-webhook", {
      delivery_id: "del_123",
      attempt: 1
    });
  });

  it("should validate and normalize saved availability-check targets through default dependencies", async (): Promise<void> => {
    validateAvailabilityCheckDefinitionMock
      .mockResolvedValueOnce({ normalized_url: "https://app.example.com/health" })
      .mockResolvedValueOnce({ normalized_url: "https://checkout.example.com/health" });

    const deps = createApiDependencies({
      objectStore: {
        putObject: vi.fn(),
        getObject: vi.fn(),
        deleteObjectsByPrefix: vi.fn()
      },
      queue: {
        enqueue: vi.fn()
      },
      db: {
        query: vi.fn()
      }
    });
    const availabilityCheckStore = createPostgresAvailabilityCheckStoreMock.mock.results[0]?.value as {
      createCheckForProjectInOrganization: ReturnType<typeof vi.fn>;
      updateCheckForProjectInOrganization: ReturnType<typeof vi.fn>;
    };

    await deps.availabilityCheckManagement.createCheckForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      name: "Primary app",
      url: "https://app.example.com/health?token=secret",
      method: "GET",
      expected_status_min: 200,
      expected_status_max: 399,
      timeout_ms: 5000,
      interval_seconds: 60,
      failure_threshold: 3,
      recovery_threshold: 2,
      enabled: true,
      now: "2026-06-15T10:00:00.000Z"
    });
    await deps.availabilityCheckManagement.updateCheckForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      check_id: "chk_123",
      url: "https://checkout.example.com/health?token=secret",
      now: "2026-06-15T10:01:00.000Z"
    });

    expect(validateAvailabilityCheckDefinitionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://app.example.com/health?token=secret",
        method: "GET"
      })
    );
    expect(validateAvailabilityCheckDefinitionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://checkout.example.com/health?token=secret",
        method: "GET"
      })
    );
    expect(availabilityCheckStore.createCheckForProjectInOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://app.example.com/health"
      })
    );
    expect(availabilityCheckStore.updateCheckForProjectInOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://checkout.example.com/health"
      })
    );
  });

  it("should prefill checkout email for first-time Stripe customers", async (): Promise<void> => {
    const checkoutCreate = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.test/session_123" });
    const db = {
      query: vi.fn().mockResolvedValue({ rows: [{ stripe_customer_id: null }] })
    };
    const deps = createApiDependencies({
      objectStore: {
        putObject: vi.fn(),
        getObject: vi.fn(),
        deleteObjectsByPrefix: vi.fn()
      },
      queue: {
        enqueue: vi.fn()
      },
      db,
      stripeConfig: {
        client: {
          checkout: {
            sessions: {
              create: checkoutCreate
            }
          },
          billingPortal: {
            sessions: {
              create: vi.fn()
            }
          }
        },
        webhookSecret: "whsec_test",
        priceMap: new Map([
          ["price_solo", { plan: "solo", type: "plan" }],
          ["price_team", { plan: "team", type: "plan" }],
          ["price_solo_capacity", { plan: "solo", type: "extra_capacity" }],
          ["price_team_capacity", { plan: "team", type: "extra_capacity" }]
        ]),
        soloPriceId: "price_solo",
        teamPriceId: "price_team",
        soloExtraCapacityPriceId: "price_solo_capacity",
        teamExtraCapacityPriceId: "price_team_capacity"
      } as never
    });

    const checkout = await deps.billingManagement.createCheckoutLink({
      organization_id: "org_123",
      billing_email: "owner@example.com",
      current_plan: "free",
      target_plan: "solo"
    });

    expect(checkout).toEqual({ url: "https://checkout.stripe.test/session_123" });
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        client_reference_id: "org_123",
        customer_email: "owner@example.com",
        line_items: [{ price: "price_solo", quantity: 1 }],
        automatic_tax: { enabled: true },
        billing_address_collection: "auto",
        tax_id_collection: { enabled: true },
        subscription_data: {
          metadata: { organization_id: "org_123" }
        },
        success_url: expect.stringContaining("session_id={CHECKOUT_SESSION_ID}")
      })
    );
    expect(db.query).toHaveBeenCalledWith(
      "SELECT stripe_customer_id FROM organizations WHERE id = $1 LIMIT 1",
      ["org_123"]
    );
  });

  it("should update saved Stripe customer billing details during checkout", async (): Promise<void> => {
    const checkoutCreate = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.test/session_456" });
    const db = {
      query: vi.fn().mockResolvedValue({ rows: [{ stripe_customer_id: "cus_existing" }] })
    };
    const deps = createApiDependencies({
      objectStore: {
        putObject: vi.fn(),
        getObject: vi.fn(),
        deleteObjectsByPrefix: vi.fn()
      },
      queue: {
        enqueue: vi.fn()
      },
      db,
      stripeConfig: {
        client: {
          checkout: {
            sessions: {
              create: checkoutCreate
            }
          },
          billingPortal: {
            sessions: {
              create: vi.fn()
            }
          }
        },
        webhookSecret: "whsec_test",
        priceMap: new Map([
          ["price_solo", { plan: "solo", type: "plan" }],
          ["price_team", { plan: "team", type: "plan" }],
          ["price_solo_capacity", { plan: "solo", type: "extra_capacity" }],
          ["price_team_capacity", { plan: "team", type: "extra_capacity" }]
        ]),
        soloPriceId: "price_solo",
        teamPriceId: "price_team",
        soloExtraCapacityPriceId: "price_solo_capacity",
        teamExtraCapacityPriceId: "price_team_capacity"
      } as never
    });

    const checkout = await deps.billingManagement.createCheckoutLink({
      organization_id: "org_123",
      billing_email: "owner@example.com",
      current_plan: "solo",
      target_plan: "team"
    });

    expect(checkout).toEqual({ url: "https://checkout.stripe.test/session_456" });
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_existing",
        customer_update: { address: "auto", name: "auto" },
        line_items: [{ price: "price_team", quantity: 1 }],
        automatic_tax: { enabled: true },
        billing_address_collection: "auto",
        tax_id_collection: { enabled: true }
      })
    );
    expect(checkoutCreate.mock.calls[0]?.[0]).not.toHaveProperty("customer_email");
  });

  it("should increase allowance capacity immediately through the Stripe subscription", async (): Promise<void> => {
    const subscriptionUpdate = vi.fn().mockResolvedValue({ id: "sub_123" });
    const subscriptionRetrieve = vi.fn().mockResolvedValue({
      id: "sub_123",
      schedule: null,
      items: {
        data: [
          {
            id: "si_plan",
            price: {
              id: "price_solo",
              recurring: {
                interval: "month",
                interval_count: 1
              }
            },
            quantity: 1
          }
        ]
      }
    });
    const billingStore = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "solo",
        stripe_customer_id: "cus_123",
        active_projects: 2,
        capacity_units: {
          total: 3,
          included: 3,
          additional_purchased: 0,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-03-23T11:56:12.000Z",
          ends_at: "2026-04-23T11:56:12.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 20, limit: 750 },
          monthly_raw_ingested_events: { used: 200, limit: 10500 },
          retained_bundle_cap: { used: 5, limit: 450 },
          monthly_remote_activations: { used: 1, limit: 75 },
          monthly_alert_deliveries: { used: 3, limit: 225 },
          monthly_webhook_deliveries: { used: 6, limit: 750 }
        }
      }),
      getBillingSummaryForProject: vi.fn()
    };
    createPostgresBillingStoreMock.mockReturnValueOnce(billingStore);

    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            plan: "solo",
            stripe_customer_id: "cus_123",
            stripe_subscription_id: "sub_123"
          }
        ]
      })
    };

    const deps = createApiDependencies({
      objectStore: {
        putObject: vi.fn(),
        getObject: vi.fn(),
        deleteObjectsByPrefix: vi.fn()
      },
      queue: {
        enqueue: vi.fn()
      },
      db,
      stripeConfig: {
        client: {
          subscriptions: {
            retrieve: subscriptionRetrieve,
            update: subscriptionUpdate
          },
          subscriptionSchedules: {
            create: vi.fn(),
            retrieve: vi.fn(),
            update: vi.fn(),
            release: vi.fn()
          },
          checkout: {
            sessions: {
              create: vi.fn()
            }
          },
          billingPortal: {
            sessions: {
              create: vi.fn()
            }
          }
        },
        webhookSecret: "whsec_test",
        priceMap: new Map([
          ["price_solo", { plan: "solo", type: "plan" }],
          ["price_team", { plan: "team", type: "plan" }],
          ["price_solo_capacity", { plan: "solo", type: "extra_capacity" }],
          ["price_team_capacity", { plan: "team", type: "extra_capacity" }]
        ]),
        soloPriceId: "price_solo",
        teamPriceId: "price_team",
        soloExtraCapacityPriceId: "price_solo_capacity",
        teamExtraCapacityPriceId: "price_team_capacity"
      } as never
    });

    const nextBilling = await deps.billingManagement.increaseCapacity({
      organization_id: "org_123",
      target_additional_capacity_units: 2,
      now: "2026-03-23T12:00:00.000Z"
    });

    expect(subscriptionUpdate).toHaveBeenCalledWith(
      "sub_123",
      expect.objectContaining({
        proration_behavior: "always_invoice",
        items: [{ id: "si_plan", quantity: 1 }, { price: "price_solo_capacity", quantity: 2 }]
      })
    );
    expect(nextBilling).toEqual(
      expect.objectContaining({
        capacity_units: expect.objectContaining({
          additional_purchased: 2,
          total: 5
        })
      })
    );
  });

  it("should avoid enqueueing duplicate regeneration while a lease is already held", async (): Promise<void> => {
    const enqueue = vi.fn();
    const acquireLease = vi.fn().mockResolvedValue(false);
    const objectStore = {
      putObject: vi.fn(),
      getObject: vi.fn(),
      deleteObjectsByPrefix: vi.fn()
    };

    const deps = createApiDependencies({
      objectStore,
      queue: {
        enqueue,
        acquireLease
      } as { enqueue: typeof enqueue; acquireLease: typeof acquireLease },
      db: {
        query: vi.fn()
      }
    });
    const metadataStore = createPostgresMetadataStoreMock.mock.results.at(-1)?.value;

    const requested = await deps.bundleRegeneration.requestRegeneration({
      organization_id: "org_123",
      project_id: "proj_123",
      incident_id: "inc_123"
    });

    expect(requested).toBe(false);
    expect(acquireLease).toHaveBeenCalledWith("leases:bundle-regeneration:inc_123", 30);
    expect(metadataStore.getBundleSourceForOrganization).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("should create dependencies from default env values", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ id: "ok" }] });

    createApiDependenciesFromEnv({});

    expect(poolConfigSpy).toHaveBeenCalledWith({
      host: "localhost",
      port: 5432,
      user: "debugbundle",
      password: "debugbundle",
      database: "debugbundle"
    });
    expect(createRedisQueueClientMock).toHaveBeenCalledWith({ redisUrl: "redis://localhost:6379" });
    const frequencyArgs = createRedisIncidentFrequencyCounterMock.mock.calls[0]?.[0] as {
      redisUrl: string;
      snapshotStore?: { query: unknown };
    };
    expect(frequencyArgs.redisUrl).toBe("redis://localhost:6379");
    expect(frequencyArgs.snapshotStore).toBeDefined();
    expect(typeof frequencyArgs.snapshotStore?.query).toBe("function");
    expect(createRedisAuthRateLimiterMock).toHaveBeenCalledWith({ redisUrl: "redis://localhost:6379" });
    expect(createRedisIngestionRateLimiterMock).toHaveBeenCalledWith({ redisUrl: "redis://localhost:6379" });
    expect(createS3ObjectStoreClientMock).toHaveBeenCalledWith({
      endpoint: "http://localhost:4566",
      region: "us-east-1",
      bucket: "debugbundle-raw-events",
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });

    const dbArg = createPostgresMetadataStoreMock.mock.calls[0]?.[0] as { query: <T>(sql: string, params: unknown[]) => Promise<T> };
    await dbArg.query("SELECT 1", ["x"]);
    expect(poolQueryMock).toHaveBeenCalledWith("SELECT 1", ["x"]);
  });

  it("should honor explicit env overrides", (): void => {
    createApiDependenciesFromEnv({
      DB_HOST: "db.internal",
      DB_PORT: "5440",
      DB_USER: "svc",
      DB_PASSWORD: "secret",
      DB_NAME: "debugbundle_ci",
      REDIS_URL: "redis://cache:6380",
      S3_ENDPOINT: "http://s3:9000",
      S3_REGION: "eu-west-1",
      S3_BUCKET: "bucket-a",
      AWS_ACCESS_KEY_ID: "k",
      AWS_SECRET_ACCESS_KEY: "s"
    });

    expect(poolConfigSpy).toHaveBeenCalledWith({
      host: "db.internal",
      port: 5440,
      user: "svc",
      password: "secret",
      database: "debugbundle_ci"
    });
    expect(createRedisQueueClientMock).toHaveBeenCalledWith({ redisUrl: "redis://cache:6380" });
    const frequencyArgs = createRedisIncidentFrequencyCounterMock.mock.calls[0]?.[0] as {
      redisUrl: string;
      snapshotStore?: { query: unknown };
    };
    expect(frequencyArgs.redisUrl).toBe("redis://cache:6380");
    expect(frequencyArgs.snapshotStore).toBeDefined();
    expect(typeof frequencyArgs.snapshotStore?.query).toBe("function");
    expect(createRedisAuthRateLimiterMock).toHaveBeenCalledWith({ redisUrl: "redis://cache:6380" });
    expect(createRedisIngestionRateLimiterMock).toHaveBeenCalledWith({ redisUrl: "redis://cache:6380" });
    expect(createS3ObjectStoreClientMock).toHaveBeenCalledWith({
      endpoint: "http://s3:9000",
      region: "eu-west-1",
      bucket: "bucket-a",
      accessKeyId: "k",
      secretAccessKey: "s",
      forcePathStyle: true
    });
  });

  it("should compose auth email delivery when ses settings are present", async (): Promise<void> => {
    createApiDependenciesFromEnv({
      SES_REGION: "eu-west-1",
      SES_FROM_EMAIL: "noreply@debugbundle.test",
      AWS_ACCESS_KEY_ID: "aws-key",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      APP_BASE_URL: "https://app.debugbundle.test"
    });

    expect(createSesEmailTransportMock).toHaveBeenCalledWith({
      region: "eu-west-1",
      fromEmail: "DebugBundle <noreply@debugbundle.test>",
      accessKeyId: "aws-key",
      secretAccessKey: "aws-secret",
      timeoutMs: 10000
    });

    const serviceOptions = createWebSessionAuthServiceMock.mock.calls.at(-1)?.[1] as
        | {
          authEmails?: {
            sendEmailAuthCode(input: { email: string; code: string; expires_in_minutes: number }): Promise<void>;
            sendAccountDeletionOtp(input: { email: string; code: string; expires_in_minutes: number }): Promise<void>;
            sendProjectInviteEmail(input: {
              email: string;
              token: string;
              inviter_name: string;
              project_title: string;
            }): Promise<void>;
          };
        }
      | undefined;

    expect(serviceOptions?.authEmails).toBeDefined();
    expect(createAccountDeletionChallengeServiceMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        authEmails: serviceOptions?.authEmails
      })
    );

    await serviceOptions?.authEmails?.sendEmailAuthCode({
      email: "owen@example.com",
      code: "123456",
      expires_in_minutes: 10
    });
    await serviceOptions?.authEmails?.sendAccountDeletionOtp({
      email: "owen@example.com",
      code: "654321",
      expires_in_minutes: 10
    });
    await serviceOptions?.authEmails?.sendProjectInviteEmail({
      email: "invitee@example.com",
      token: "invite-token",
      inviter_name: "Owen Far",
      project_title: "Checkout API"
    });

    expect(renderEmailAuthCodeEmailMock).toHaveBeenCalledWith({
      code: "123456",
      appUrl: "https://app.debugbundle.test/login",
      expiresInMinutes: 10,
      brandMarkUrl: "https://app.debugbundle.test/email/debugbundle-mark.png"
    });
    expect(renderAccountDeletionOtpEmailMock).toHaveBeenCalledWith({
      code: "654321",
      settingsUrl: "https://app.debugbundle.test/settings",
      expiresInMinutes: 10,
      brandMarkUrl: "https://app.debugbundle.test/email/debugbundle-mark.png"
    });
    expect(renderProjectInviteEmailMock).toHaveBeenCalledWith({
      acceptUrl: "https://app.debugbundle.test/invite?token=invite-token",
      inviterName: "Owen Far",
      projectName: "Checkout API",
      brandMarkUrl: "https://app.debugbundle.test/email/debugbundle-mark.png"
    });
    expect(emailTransportSendMock).toHaveBeenCalledTimes(3);
  });

  it("should prefer the app origin over the public site for email brand assets when no explicit override is set", async (): Promise<void> => {
    createApiDependenciesFromEnv({
      SES_REGION: "eu-west-1",
      SES_FROM_EMAIL: "noreply@debugbundle.test",
      AWS_ACCESS_KEY_ID: "aws-key",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      APP_BASE_URL: "https://app.debugbundle.test",
      PUBLIC_SITE_URL: "https://debugbundle.test"
    });

    const serviceOptions = createWebSessionAuthServiceMock.mock.calls.at(-1)?.[1] as
        | {
          authEmails?: {
            sendEmailAuthCode(input: { email: string; code: string; expires_in_minutes: number }): Promise<void>;
          };
        }
      | undefined;

    await serviceOptions?.authEmails?.sendEmailAuthCode({
      email: "owen@example.com",
      code: "123456",
      expires_in_minutes: 10
    });

    expect(renderEmailAuthCodeEmailMock).toHaveBeenLastCalledWith({
      code: "123456",
      appUrl: "https://app.debugbundle.test/login",
      expiresInMinutes: 10,
      brandMarkUrl: "https://app.debugbundle.test/email/debugbundle-mark.png"
    });
  });

  it("should compose github oauth support when github env settings are present", (): void => {
    createApiDependenciesFromEnv({
      GITHUB_CLIENT_ID: "gh-client-id",
      GITHUB_CLIENT_SECRET: "gh-client-secret",
      GITHUB_OAUTH_CALLBACK_URL: "https://api.debugbundle.test/v1/auth/github/callback",
      GITHUB_OAUTH_STATE_SECRET: "github-oauth-secret",
      APP_BASE_URL: "https://app.debugbundle.test"
    });

    expect(createGitHubOAuthClientMock).toHaveBeenCalledWith({
      clientId: "gh-client-id",
      clientSecret: "gh-client-secret",
      callbackUrl: "https://api.debugbundle.test/v1/auth/github/callback"
    });

    const serviceOptions = createWebSessionAuthServiceMock.mock.calls.at(-1)?.[1] as {
      githubOAuth?: {
        clientId: string;
        callbackUrl: string;
        appRedirectUrl: string;
        stateSecret: string;
        client: {
          exchangeCodeForIdentity: ReturnType<typeof vi.fn>;
          resolveIdentityFromAccessToken: ReturnType<typeof vi.fn>;
          beginDeviceAuthorization: ReturnType<typeof vi.fn>;
          pollDeviceAuthorization: ReturnType<typeof vi.fn>;
        };
      };
    };
    expect(serviceOptions.githubOAuth).toEqual({
      clientId: "gh-client-id",
      callbackUrl: "https://api.debugbundle.test/v1/auth/github/callback",
      appRedirectUrl: "https://app.debugbundle.test/auth/github/callback",
      stateSecret: "github-oauth-secret",
      client: {
        exchangeCodeForIdentity: expect.any(Function),
        resolveIdentityFromAccessToken: expect.any(Function),
        beginDeviceAuthorization: expect.any(Function),
        pollDeviceAuthorization: expect.any(Function)
      }
    });
  });

  it("should ignore the removed signup allowlist runtime env", (): void => {
    createApiDependenciesFromEnv({
      AUTH_SIGNUP_ALLOWED_EMAILS: "owen@example.com, jason@example.com"
    });

    const serviceOptions = (createWebSessionAuthServiceMock.mock.calls.at(-1)?.[1] ?? {}) as Record<string, unknown>;

    expect(serviceOptions).not.toHaveProperty("signupEmailAllowlist");
  });

  it("should configure billing admin override emails from runtime env", (): void => {
    const dependencies = createApiDependenciesFromEnv({
      BILLING_ADMIN_OVERRIDE_EMAILS: " Owen@Example.com, admin@example.com ,owen@example.com"
    });
    const billingAdmin = dependencies.billingAdmin;

    expect(billingAdmin).toBeDefined();
    expect(billingAdmin?.isOperatorAllowed({ email: "owen@example.com" })).toBe(true);
    expect(billingAdmin?.isOperatorAllowed({ email: "ADMIN@example.com" })).toBe(true);
    expect(billingAdmin?.isOperatorAllowed({ email: "regular@example.com" })).toBe(false);
  });

  it("should configure admin analytics access emails from runtime env", (): void => {
    const dependencies = createApiDependenciesFromEnv({
      ANALYTICS_HASH_SECRET: "analytics-hash-secret",
      ADMIN_ANALYTICS_ACCESS_EMAILS: " Owen@Example.com, admin@example.com ,owen@example.com"
    });
    const adminAnalytics = dependencies.adminAnalytics;

    expect(adminAnalytics).toBeDefined();
    expect(adminAnalytics?.isOperatorAllowed({ email: "owen@example.com" })).toBe(true);
    expect(adminAnalytics?.isOperatorAllowed({ email: "ADMIN@example.com" })).toBe(true);
    expect(adminAnalytics?.isOperatorAllowed({ email: "regular@example.com" })).toBe(false);
  });

  it("should keep admin analytics unavailable when access emails are empty", (): void => {
    const dependencies = createApiDependenciesFromEnv({
      ANALYTICS_HASH_SECRET: "analytics-hash-secret",
      ADMIN_ANALYTICS_ACCESS_EMAILS: " , "
    });

    expect(dependencies.accountAnalytics).toBeDefined();
    expect(dependencies.adminAnalytics).toBeUndefined();
  });

  it("should compose billing admin override support for review access without operator emails", (): void => {
    const dependencies = createApiDependenciesFromEnv({
      REVIEW_ACCESS_SECRET: "review-secret"
    });
    const billingAdmin = dependencies.billingAdmin;

    expect(billingAdmin).toBeDefined();
    expect(billingAdmin?.isOperatorAllowed({ email: "regular@example.com" })).toBe(false);
  });

  it("should compose dev-only mock github oauth support when enabled without real github credentials", async (): Promise<void> => {
    createApiDependenciesFromEnv({
      APP_BASE_URL: "http://localhost:5291",
      DEV_GITHUB_MOCK_LOGIN: "true",
      DEV_GITHUB_MOCK_EMAIL: "mock-user@example.com"
    });

    expect(createGitHubOAuthClientMock).not.toHaveBeenCalled();

    const serviceOptions = createWebSessionAuthServiceMock.mock.calls.at(-1)?.[1] as {
      githubOAuth?: {
        clientId: string;
        callbackUrl: string;
        appRedirectUrl: string;
        authorizeUrl?: string;
        stateSecret: string;
        client: { exchangeCodeForIdentity(input: { code: string }): Promise<{ github_user_id: string; email: string } | null> };
      };
    };

    expect(serviceOptions.githubOAuth?.clientId).toBe("debugbundle-dev-mock-github");
    expect(serviceOptions.githubOAuth?.callbackUrl).toBe("http://localhost:5291/v1/auth/github/callback");
    expect(serviceOptions.githubOAuth?.appRedirectUrl).toBe("http://localhost:5291/auth/github/callback");
    expect(serviceOptions.githubOAuth?.authorizeUrl).toBe("http://localhost:5291/v1/auth/github/mock-authorize");
    expect(serviceOptions.githubOAuth?.stateSecret).toBe("debugbundle-dev-mock-github-state-secret");
    await expect(serviceOptions.githubOAuth?.client.exchangeCodeForIdentity({ code: "debugbundle-dev-mock-code" })).resolves.toEqual({
      github_user_id: "debugbundle-dev-mock-user",
      email: "mock-user@example.com"
    });
    await expect(serviceOptions.githubOAuth?.client.exchangeCodeForIdentity({ code: "wrong-code" })).resolves.toBeNull();
  });

  it("should ignore empty real github env values and still use the dev mock provider", (): void => {
    createApiDependenciesFromEnv({
      APP_BASE_URL: "http://localhost:5291",
      DEV_GITHUB_MOCK_LOGIN: "true",
      GITHUB_CLIENT_ID: "",
      GITHUB_CLIENT_SECRET: "   ",
      GITHUB_OAUTH_CALLBACK_URL: "",
      GITHUB_OAUTH_STATE_SECRET: ""
    });

    expect(createGitHubOAuthClientMock).not.toHaveBeenCalled();

    const serviceOptions = createWebSessionAuthServiceMock.mock.calls.at(-1)?.[1] as {
      githubOAuth?: {
        clientId: string;
        authorizeUrl?: string;
      };
    };

    expect(serviceOptions.githubOAuth?.clientId).toBe("debugbundle-dev-mock-github");
    expect(serviceOptions.githubOAuth?.authorizeUrl).toBe("http://localhost:5291/v1/auth/github/mock-authorize");
  });

  it("should expose the dev mock github device and token helpers when enabled", async (): Promise<void> => {
    createApiDependenciesFromEnv({
      APP_BASE_URL: "http://localhost:5291",
      DEV_GITHUB_MOCK_LOGIN: "true",
      DEV_GITHUB_MOCK_EMAIL: "device-mock@example.com"
    });

    const serviceOptions = createWebSessionAuthServiceMock.mock.calls.at(-1)?.[1] as {
      githubOAuth?: {
        client: {
          resolveIdentityFromAccessToken(input: { access_token: string }): Promise<unknown>;
          beginDeviceAuthorization(): Promise<unknown>;
          pollDeviceAuthorization(input: { device_code: string }): Promise<unknown>;
        };
      };
    };

    await expect(
      serviceOptions.githubOAuth?.client.resolveIdentityFromAccessToken({
        access_token: "debugbundle-dev-mock-code"
      })
    ).resolves.toEqual({
      ok: true,
      identity: {
        github_user_id: "debugbundle-dev-mock-user",
        email: "device-mock@example.com"
      }
    });
    await expect(
      serviceOptions.githubOAuth?.client.resolveIdentityFromAccessToken({
        access_token: "invalid-token"
      })
    ).resolves.toEqual({
      ok: false,
      error: "token_invalid"
    });
    await expect(serviceOptions.githubOAuth?.client.beginDeviceAuthorization()).resolves.toEqual({
      ok: true,
      device_code: "debugbundle-dev-mock-code",
      user_code: "MOCK-CODE",
      verification_uri: "http://localhost:5291/v1/auth/github/mock-authorize",
      expires_in: 900,
      interval: 5
    });
    await expect(
      serviceOptions.githubOAuth?.client.pollDeviceAuthorization({
        device_code: "debugbundle-dev-mock-code"
      })
    ).resolves.toEqual({
      status: "approved",
      identity: {
        github_user_id: "debugbundle-dev-mock-user",
        email: "device-mock@example.com"
      }
    });
    await expect(
      serviceOptions.githubOAuth?.client.pollDeviceAuthorization({
        device_code: "wrong-code"
      })
    ).resolves.toEqual({
      status: "provider_error"
    });
  });

  it("should enrich account exports with stored artifacts and error fallbacks", async (): Promise<void> => {
    createPostgresAccountStoreMock.mockReturnValue({
      exportAccountForOrganization: vi.fn().mockResolvedValue({
        export_version: 1,
        exported_at: "2026-03-20T00:00:00.000Z",
        user: { user_id: "usr_123" },
        organization: { organization_id: "org_123" },
        members: [],
        project_members: [],
        project_invites: [],
        member_tokens: [],
        projects: [],
        project_tokens: [],
        probe_activations: [],
        capture_policies: [],
        services: [],
        deployments: [],
        processed_events: [],
        improvement_opportunities: [
          {
            improvement_opportunity_id: "imp_123",
            project_id: "proj_123",
            bundle_generation_number: 1
          }
        ],
        improvement_opportunity_events: [
          {
            event_id: "evt_imp_123",
            project_id: "proj_123",
            occurred_at: "2026-03-20T00:01:00.000Z"
          }
        ],
        incidents: [{ incident_id: "inc_123", project_id: "proj_123" }],
        incident_events: [
          {
            event_id: "evt_123",
            project_id: "proj_123",
            occurred_at: "2026-03-20T00:00:00.000Z",
            is_sampled: true
          }
        ],
        bundle_generations: [],
        stored_artifacts: [],
        audit_logs: [],
        alert_rules: [],
        alert_deliveries: [],
        alert_email_digests: [],
        alert_email_digest_items: [],
        weekly_report_channels: [],
        weekly_report_deliveries: [],
        webhooks: [],
        webhook_deliveries: [],
        agent_webhooks: [],
        github_installations: [],
        project_github_repos: [],
        github_dispatch_rules: [],
        github_dispatch_deliveries: [],
        org_usage_counters: [],
        processed_billing_events: [],
        operational_email_deliveries: []
      }),
      deleteAccountForOrganization: vi.fn()
    });

    const objectStore = {
      putObject: vi.fn(),
      getObject: vi
        .fn()
        .mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify({ event: "raw" }))))
        .mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify({ event: "improvement-raw" }))))
        .mockResolvedValueOnce(Buffer.from("invalid-gzip"))
        .mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify({ bundle_type: "improvement" }))))
        .mockRejectedValueOnce(new Error("s3_object_not_found")),
      deleteObjectsByPrefix: vi.fn()
    };
    const deps = createApiDependencies({
      objectStore,
      queue: { enqueue: vi.fn() },
      db: { query: vi.fn() }
    });

    await expect(
      deps.accountManagement.exportAccountForOrganization({
        organization_id: "org_123",
        user_id: "usr_123",
        exported_at: "2026-03-20T00:00:00.000Z"
      })
    ).resolves.toMatchObject({
      artifacts: {
        raw_events: [{ content: { event: "raw" } }, { content: { event: "improvement-raw" } }],
        bundles: [{ content: { error: "artifact_invalid" } }, { content: { bundle_type: "improvement" } }],
        reproductions: [{ content: { error: "artifact_not_found" } }]
      }
    });
  });

  it("should return github installation status branches before listing repositories", async (): Promise<void> => {
    const githubStore = {
      getGitHubInstallationForOrganization: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ installation_id: 1, status: "suspended" })
        .mockResolvedValueOnce({ installation_id: 1, status: "removed" })
        .mockResolvedValueOnce({ installation_id: 42, status: "active" }),
      deleteGitHubInstallationForOrganization: vi.fn(),
      getProjectGitHubRepoForOrganization: vi.fn(),
      listProjectGitHubDeliveriesForOrganization: vi.fn(),
      retryProjectGitHubDeliveryForOrganization: vi.fn(),
      listProjectGitHubRulesForOrganization: vi.fn(),
      getProjectGitHubRuleForOrganization: vi.fn(),
      createProjectGitHubRuleForOrganization: vi.fn(),
      updateProjectGitHubRuleForOrganization: vi.fn(),
      deleteProjectGitHubRuleForOrganization: vi.fn(),
      setProjectGitHubRepoForOrganization: vi.fn(),
      removeProjectGitHubRepoForOrganization: vi.fn()
    };
    createPostgresGitHubStoreMock.mockReturnValue(githubStore);
    const listRepositories = vi.fn().mockResolvedValue([{ id: 1, full_name: "debugbundle/app" }]);

    const deps = createApiDependencies({
      objectStore: {
        putObject: vi.fn(),
        getObject: vi.fn(),
        deleteObjectsByPrefix: vi.fn()
      },
      queue: { enqueue: vi.fn() },
      db: { query: vi.fn() },
      githubAppClient: {
        getInstallUrl: vi.fn(),
        listRepositories,
        retryDelivery: vi.fn(),
        getInstallationClient: vi.fn()
      } as never
    });

    await expect(deps.githubManagement?.listRepositoriesForOrganization({ organization_id: "org_123" })).resolves.toBe(
      "installation_not_found"
    );
    await expect(deps.githubManagement?.listRepositoriesForOrganization({ organization_id: "org_123" })).resolves.toBe(
      "installation_suspended"
    );
    await expect(deps.githubManagement?.listRepositoriesForOrganization({ organization_id: "org_123" })).resolves.toBe(
      "installation_removed"
    );
    await expect(deps.githubManagement?.listRepositoriesForOrganization({ organization_id: "org_123" })).resolves.toEqual([
      { id: 1, full_name: "debugbundle/app" }
    ]);
    expect(listRepositories).toHaveBeenCalledWith({ installationId: 42 });
  });

  it("should delete every project object prefix and the user avatar during account deletion", async (): Promise<void> => {
    const accountStore = {
      exportAccountForOrganization: vi.fn().mockResolvedValue(null),
      deleteAccountForOrganization: vi.fn().mockResolvedValue({
        deleted_at: "2026-06-10T12:00:00.000Z",
        organization_id: "org_123",
        deleted_project_ids: ["proj_1", "proj_2"],
        user_deleted: true,
        deleted_member_token_count: 2
      }),
      getUserAvatar: vi.fn().mockResolvedValue(null),
      saveUserAvatar: vi.fn().mockResolvedValue(null)
    };
    createPostgresAccountStoreMock.mockReturnValue(accountStore);

    const objectStore = {
      putObject: vi.fn(),
      getObject: vi.fn(),
      deleteObjectsByPrefix: vi.fn().mockResolvedValue(undefined),
      deleteObject: vi.fn().mockResolvedValue(undefined)
    };
    const deps = createApiDependencies({
      objectStore,
      queue: { enqueue: vi.fn() },
      db: { query: vi.fn() }
    });

    const deleted = await deps.accountManagement.deleteAccountForOrganization({
      organization_id: "org_123",
      user_id: "usr_123",
      deleted_at: "2026-06-10T12:00:00.000Z"
    });

    expect(deleted).toMatchObject({
      organization_id: "org_123",
      deleted_project_ids: ["proj_1", "proj_2"],
      user_deleted: true
    });
    expect(objectStore.deleteObjectsByPrefix).toHaveBeenCalledTimes(8);
    expect(objectStore.deleteObjectsByPrefix.mock.calls).toEqual(
      expect.arrayContaining([
        ["raw-events/proj_1/"],
        ["bundles/proj_1/"],
        ["improvement-bundles/proj_1/"],
        ["reproductions/proj_1/"],
        ["raw-events/proj_2/"],
        ["bundles/proj_2/"],
        ["improvement-bundles/proj_2/"],
        ["reproductions/proj_2/"]
      ])
    );
    expect(objectStore.deleteObject).toHaveBeenCalledWith({
      key: "avatars/users/usr_123/profile"
    });
  });

  it("should not delete account objects when account deletion is blocked by external project ownership", async (): Promise<void> => {
    const accountStore = {
      exportAccountForOrganization: vi.fn().mockResolvedValue(null),
      deleteAccountForOrganization: vi.fn().mockResolvedValue("other_owned_projects_exist"),
      getUserAvatar: vi.fn().mockResolvedValue(null),
      saveUserAvatar: vi.fn().mockResolvedValue(null)
    };
    createPostgresAccountStoreMock.mockReturnValue(accountStore);

    const objectStore = {
      putObject: vi.fn(),
      getObject: vi.fn(),
      deleteObjectsByPrefix: vi.fn().mockResolvedValue(undefined),
      deleteObject: vi.fn().mockResolvedValue(undefined)
    };
    const deps = createApiDependencies({
      objectStore,
      queue: { enqueue: vi.fn() },
      db: { query: vi.fn() }
    });

    await expect(
      deps.accountManagement.deleteAccountForOrganization({
        organization_id: "org_123",
        user_id: "usr_123",
        deleted_at: "2026-06-10T12:00:00.000Z"
      })
    ).resolves.toBe("other_owned_projects_exist");

    expect(objectStore.deleteObjectsByPrefix).not.toHaveBeenCalled();
    expect(objectStore.deleteObject).not.toHaveBeenCalled();
  });

  it("should enqueue webhook test deliveries and support the null branch", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn()
    };
    const webhookDeliveryStore = {
      listDeliveriesForWebhookInOrganization: vi.fn(),
      createTestDeliveryForOrganization: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ delivery_id: "del_456", event_type: "verification.failed" }),
      listWebhooksForOrganization: vi.fn(),
      createWebhookForOrganization: vi.fn(),
      getWebhookForOrganization: vi.fn(),
      updateWebhookForOrganization: vi.fn(),
      deleteWebhookForOrganization: vi.fn()
    };
    createPostgresWebhookDeliveryStoreMock.mockReturnValue(webhookDeliveryStore);

    const deps = createApiDependencies({
      objectStore: {
        putObject: vi.fn(),
        getObject: vi.fn(),
        deleteObjectsByPrefix: vi.fn()
      },
      queue,
      db: {
        query: vi.fn()
      },
      frequencyCounter: { recordOccurrence: vi.fn() }
    });

    await expect(
      deps.webhookTesting.triggerTestDelivery({
        organization_id: "org_123",
        webhook_id: "wh_123",
        event_type: "verification.passed"
      })
    ).resolves.toBeNull();
    await expect(
      deps.webhookTesting.triggerTestDelivery({
        organization_id: "org_123",
        webhook_id: "wh_123",
        event_type: "verification.failed"
      })
    ).resolves.toEqual({ delivery_id: "del_456", event_type: "verification.failed" });

    expect(queue.enqueue).toHaveBeenCalledWith("deliver-webhook", {
      delivery_id: "del_456",
      attempt: 1
    });
    expect(createIngestionMetadataServiceMock).toHaveBeenCalled();
  });

  it("should create a default dispatch rule when assigning a repo to a project with no existing rules", async (): Promise<void> => {
    const githubStore = {
      getGitHubInstallationForOrganization: vi.fn().mockResolvedValue({
        id: "ghi_1",
        installation_id: 42,
        account_login: "testorg",
        account_type: "Organization",
        status: "active"
      }),
      upsertProjectGitHubRepoForOrganization: vi.fn().mockResolvedValue({
        id: "pgr_1",
        project_id: "proj_1",
        installation_id: "ghi_1",
        repo_owner: "testorg",
        repo_name: "myrepo",
        default_branch: "main",
        created_at: "2026-03-26T00:00:00.000Z",
        updated_at: "2026-03-26T00:00:00.000Z"
      }),
      listProjectGitHubRulesForOrganization: vi.fn().mockResolvedValue([]),
      createProjectGitHubRuleForOrganization: vi.fn().mockResolvedValue({
        rule_id: "rule_default",
        project_id: "proj_1",
        name: "Default triage rule",
        enabled: true,
        event_types: ["bundle.created", "bundle.reopened"],
        environments: [],
        services: [],
        severity_min: "high",
        bundle_type: null,
        incident_status: "new_or_reopened",
        cooldown_seconds: 300,
        created_at: "2026-03-26T00:00:00.000Z",
        updated_at: "2026-03-26T00:00:00.000Z"
      }),
      deleteGitHubInstallationForOrganization: vi.fn(),
      deleteProjectGitHubRepoForOrganization: vi.fn(),
      getProjectGitHubRepoForOrganization: vi.fn(),
      getProjectGitHubRuleForOrganization: vi.fn(),
      updateProjectGitHubRuleForOrganization: vi.fn(),
      deleteProjectGitHubRuleForOrganization: vi.fn(),
      listProjectGitHubDeliveriesForOrganization: vi.fn(),
      retryGitHubDispatchDelivery: vi.fn(),
      upsertGitHubInstallationForOrganization: vi.fn()
    };
    createPostgresGitHubStoreMock.mockReturnValue(githubStore);

    const githubAppClient = {
      getInstallUrl: vi.fn().mockResolvedValue("https://github.com/apps/debugbundle-automation/installations/new"),
      getInstallation: vi.fn().mockResolvedValue({
        installation_id: 42,
        account_login: "testorg",
        account_type: "Organization" as const
      }),
      listRepositories: vi.fn().mockResolvedValue([
        { id: 1, owner: "testorg", name: "myrepo", full_name: "testorg/myrepo", default_branch: "main", private: false }
      ]),
      verifyWebhookSignature: vi.fn().mockReturnValue(true)
    };

    const deps = createApiDependencies({
      objectStore: { putObject: vi.fn(), getObject: vi.fn(), deleteObjectsByPrefix: vi.fn() },
      queue: { enqueue: vi.fn() },
      db: { query: vi.fn() },
      githubAppClient
    });

    const result = await deps.githubManagement!.setProjectRepoForOrganization({
      organization_id: "org_1",
      project_id: "proj_1",
      created_by_user_id: "usr_1",
      owner: "testorg",
      repo: "myrepo"
    });

    expect(typeof result).not.toBe("string");
    expect(githubStore.listProjectGitHubRulesForOrganization).toHaveBeenCalledWith({
      organization_id: "org_1",
      project_id: "proj_1"
    });
    expect(githubStore.createProjectGitHubRuleForOrganization).toHaveBeenCalledWith({
      organization_id: "org_1",
      project_id: "proj_1",
      created_by_user_id: "usr_1",
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
  });

  it("should not create a default dispatch rule when the project already has rules", async (): Promise<void> => {
    const githubStore = {
      getGitHubInstallationForOrganization: vi.fn().mockResolvedValue({
        id: "ghi_1",
        installation_id: 42,
        account_login: "testorg",
        account_type: "Organization",
        status: "active"
      }),
      upsertProjectGitHubRepoForOrganization: vi.fn().mockResolvedValue({
        id: "pgr_1",
        project_id: "proj_1",
        installation_id: "ghi_1",
        repo_owner: "testorg",
        repo_name: "myrepo",
        default_branch: "main",
        created_at: "2026-03-26T00:00:00.000Z",
        updated_at: "2026-03-26T00:00:00.000Z"
      }),
      listProjectGitHubRulesForOrganization: vi.fn().mockResolvedValue([
        { rule_id: "rule_existing", name: "Existing rule" }
      ]),
      createProjectGitHubRuleForOrganization: vi.fn(),
      deleteGitHubInstallationForOrganization: vi.fn(),
      deleteProjectGitHubRepoForOrganization: vi.fn(),
      getProjectGitHubRepoForOrganization: vi.fn(),
      getProjectGitHubRuleForOrganization: vi.fn(),
      updateProjectGitHubRuleForOrganization: vi.fn(),
      deleteProjectGitHubRuleForOrganization: vi.fn(),
      listProjectGitHubDeliveriesForOrganization: vi.fn(),
      retryGitHubDispatchDelivery: vi.fn(),
      upsertGitHubInstallationForOrganization: vi.fn()
    };
    createPostgresGitHubStoreMock.mockReturnValue(githubStore);

    const githubAppClient = {
      getInstallUrl: vi.fn().mockResolvedValue("https://github.com/apps/debugbundle-automation/installations/new"),
      getInstallation: vi.fn().mockResolvedValue({
        installation_id: 42,
        account_login: "testorg",
        account_type: "Organization" as const
      }),
      listRepositories: vi.fn().mockResolvedValue([
        { id: 1, owner: "testorg", name: "myrepo", full_name: "testorg/myrepo", default_branch: "main", private: false }
      ]),
      verifyWebhookSignature: vi.fn().mockReturnValue(true)
    };

    const deps = createApiDependencies({
      objectStore: { putObject: vi.fn(), getObject: vi.fn(), deleteObjectsByPrefix: vi.fn() },
      queue: { enqueue: vi.fn() },
      db: { query: vi.fn() },
      githubAppClient
    });

    const result = await deps.githubManagement!.setProjectRepoForOrganization({
      organization_id: "org_1",
      project_id: "proj_1",
      created_by_user_id: "usr_1",
      owner: "testorg",
      repo: "myrepo"
    });

    expect(typeof result).not.toBe("string");
    expect(githubStore.listProjectGitHubRulesForOrganization).toHaveBeenCalled();
    expect(githubStore.createProjectGitHubRuleForOrganization).not.toHaveBeenCalled();
  });

  it("should expose billing email helpers when ses settings are present", async (): Promise<void> => {
    poolQueryMock
      .mockResolvedValueOnce({
        rows: [{ organization_name: "Acme", recipient_email: "owner@example.com" }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const deps = createApiDependenciesFromEnv({
      SES_REGION: "eu-west-1",
      SES_FROM_EMAIL: "noreply@debugbundle.test",
      AWS_ACCESS_KEY_ID: "aws-key",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      APP_BASE_URL: "https://app.debugbundle.test/"
    });

    await expect(
      deps.billingEmails?.getBillingContactForOrganization({
        organization_id: "org_123"
      })
    ).resolves.toEqual({
      organizationName: "Acme",
      recipientEmail: "owner@example.com"
    });
    await expect(
      deps.billingEmails?.getBillingContactForOrganization({
        organization_id: "org_missing"
      })
    ).resolves.toBeNull();
    await deps.billingEmails?.send({
      to: ["finance@example.com"],
      subject: "Billing update",
      text: "billing-text",
      html: "<p>billing-text</p>"
    });

    expect(deps.billingEmails?.managementUrl).toBe("https://app.debugbundle.test/billing");
    expect(poolQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("FROM organizations o"),
      ["org_123"]
    );
    expect(emailTransportSendMock).toHaveBeenCalledWith({
      to: ["finance@example.com"],
      subject: "Billing update",
      text: "billing-text",
      html: "<p>billing-text</p>"
    });
  });

  it("should fall back to static billing links when stripe is unavailable", async (): Promise<void> => {
    vi.stubEnv("STRIPE_SOLO_CHECKOUT_URL", "https://billing.example.test/solo");
    vi.stubEnv("STRIPE_CUSTOMER_PORTAL_URL", "https://billing.example.test/portal");

    try {
      const deps = createApiDependencies({
        objectStore: {
          putObject: vi.fn(),
          getObject: vi.fn(),
          deleteObjectsByPrefix: vi.fn()
        },
        queue: {
          enqueue: vi.fn()
        },
        db: {
          query: vi.fn()
        }
      });

      await expect(
        deps.billingManagement.createCheckoutLink({
          organization_id: "org_123",
          billing_email: "owner@example.com",
          current_plan: "free",
          target_plan: "solo"
        })
      ).resolves.toEqual({ url: "https://billing.example.test/solo" });
      await expect(
        deps.billingManagement.createPortalLink({
          organization_id: "org_123",
          current_plan: "solo"
        })
      ).resolves.toEqual({ url: "https://billing.example.test/portal" });

      vi.stubEnv("STRIPE_SOLO_CHECKOUT_URL", "   ");
      vi.stubEnv("STRIPE_CUSTOMER_PORTAL_URL", "");

      const missingLinksDeps = createApiDependencies({
        objectStore: {
          putObject: vi.fn(),
          getObject: vi.fn(),
          deleteObjectsByPrefix: vi.fn()
        },
        queue: {
          enqueue: vi.fn()
        },
        db: {
          query: vi.fn()
        }
      });

      await expect(
        missingLinksDeps.billingManagement.createCheckoutLink({
          organization_id: "org_123",
          billing_email: "owner@example.com",
          current_plan: "free",
          target_plan: "solo"
        })
      ).resolves.toBeNull();
      await expect(
        missingLinksDeps.billingManagement.createPortalLink({
          organization_id: "org_123",
          current_plan: "solo"
        })
      ).resolves.toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("should use existing stripe customers and fall back to stored summaries on stripe failures", async (): Promise<void> => {
    const summary = {
      plan: "solo",
      stripe_customer_id: "cus_123",
      active_projects: 2,
      capacity_units: {
        total: 3,
        included: 3,
        additional_purchased: 0,
        pending_reduction: null
      },
      usage_window: {
        starts_at: "2026-03-23T11:56:12.000Z",
        ends_at: "2026-04-23T11:56:12.000Z"
      },
      allowances: {
        monthly_bundle_requests: { used: 20, limit: 750 },
        monthly_raw_ingested_events: { used: 200, limit: 10500 },
        retained_bundle_cap: { used: 5, limit: 450 },
        monthly_remote_activations: { used: 1, limit: 75 },
        monthly_alert_deliveries: { used: 3, limit: 225 },
        monthly_webhook_deliveries: { used: 6, limit: 750 }
      }
    };
    const checkoutCreate = vi.fn().mockResolvedValue({ url: null });
    const portalCreate = vi.fn().mockRejectedValue(new Error("stripe unavailable"));
    const subscriptionRetrieve = vi.fn().mockRejectedValue(new Error("stripe unavailable"));
    const billingStore = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(summary),
      getBillingSummaryForProject: vi.fn(),
      incrementOrgUsageCounter: vi.fn()
    };
    createPostgresBillingStoreMock.mockReturnValueOnce(billingStore);

    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ stripe_customer_id: "cus_123" }] })
        .mockResolvedValueOnce({ rows: [{ stripe_customer_id: "cus_123" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              plan: "solo",
              stripe_customer_id: "cus_123",
              stripe_subscription_id: "sub_123"
            }
          ]
        })
    };

    const deps = createApiDependencies({
      objectStore: {
        putObject: vi.fn(),
        getObject: vi.fn(),
        deleteObjectsByPrefix: vi.fn()
      },
      queue: {
        enqueue: vi.fn()
      },
      db,
      stripeConfig: {
        client: {
          subscriptions: {
            retrieve: subscriptionRetrieve,
            update: vi.fn()
          },
          subscriptionSchedules: {
            create: vi.fn(),
            retrieve: vi.fn(),
            update: vi.fn(),
            release: vi.fn()
          },
          checkout: {
            sessions: {
              create: checkoutCreate
            }
          },
          billingPortal: {
            sessions: {
              create: portalCreate
            }
          }
        },
        webhookSecret: "whsec_test",
        priceMap: new Map([
          ["price_solo", { plan: "solo", type: "plan" }],
          ["price_team", { plan: "team", type: "plan" }],
          ["price_solo_capacity", { plan: "solo", type: "extra_capacity" }],
          ["price_team_capacity", { plan: "team", type: "extra_capacity" }]
        ]),
        soloPriceId: "price_solo",
        teamPriceId: "price_team",
        soloExtraCapacityPriceId: "price_solo_capacity",
        teamExtraCapacityPriceId: "price_team_capacity"
      } as never
    });

    await expect(
      deps.billingManagement.createCheckoutLink({
        organization_id: "org_123",
        billing_email: "owner@example.com",
        current_plan: "free",
        target_plan: "solo"
      })
    ).resolves.toBeNull();
    await expect(
      deps.billingManagement.createPortalLink({
        organization_id: "org_123",
        current_plan: "solo"
      })
    ).resolves.toBeNull();
    await expect(
      deps.billingManagement.getBillingSummaryForOrganization({
        organization_id: "org_123",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toEqual(summary);

    expect(subscriptionRetrieve).toHaveBeenCalledWith(
      "sub_123",
      {
        expand: ["schedule", "items.data.price"]
      },
      {
        timeout: 2500,
        maxNetworkRetries: 0
      }
    );

    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_123",
        line_items: [{ price: "price_solo", quantity: 1 }]
      })
    );
    expect(portalCreate).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "http://localhost:3000/billing"
    });
  });

  it("should skip live projection when organization billing state omits stripe_subscription_id", async (): Promise<void> => {
    const summary = {
      plan: "solo",
      stripe_customer_id: "cus_123",
      active_projects: 2,
      capacity_units: {
        total: 3,
        included: 3,
        additional_purchased: 0,
        pending_reduction: null
      },
      usage_window: {
        starts_at: "2026-03-23T11:56:12.000Z",
        ends_at: "2026-04-23T11:56:12.000Z"
      },
      allowances: {
        monthly_bundle_requests: { used: 20, limit: 750 },
        monthly_raw_ingested_events: { used: 200, limit: 10500 },
        retained_bundle_cap: { used: 5, limit: 450 },
        monthly_remote_activations: { used: 1, limit: 75 },
        monthly_alert_deliveries: { used: 3, limit: 225 },
        monthly_webhook_deliveries: { used: 6, limit: 750 }
      }
    };
    const subscriptionRetrieve = vi.fn();
    const billingStore = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(summary),
      getBillingSummaryForProject: vi.fn(),
      incrementOrgUsageCounter: vi.fn()
    };
    createPostgresBillingStoreMock.mockReturnValueOnce(billingStore);

    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            plan: "solo",
            stripe_customer_id: "cus_123"
          }
        ]
      })
    };

    const deps = createApiDependencies({
      objectStore: {
        putObject: vi.fn(),
        getObject: vi.fn(),
        deleteObjectsByPrefix: vi.fn()
      },
      queue: {
        enqueue: vi.fn()
      },
      db,
      stripeConfig: {
        client: {
          subscriptions: {
            retrieve: subscriptionRetrieve,
            update: vi.fn()
          },
          subscriptionSchedules: {
            create: vi.fn(),
            retrieve: vi.fn(),
            update: vi.fn(),
            release: vi.fn()
          },
          checkout: {
            sessions: {
              create: vi.fn()
            }
          },
          billingPortal: {
            sessions: {
              create: vi.fn()
            }
          }
        },
        webhookSecret: "whsec_test",
        priceMap: new Map([
          ["price_solo", { plan: "solo", type: "plan" }],
          ["price_team", { plan: "team", type: "plan" }],
          ["price_solo_capacity", { plan: "solo", type: "extra_capacity" }],
          ["price_team_capacity", { plan: "team", type: "extra_capacity" }]
        ]),
        soloPriceId: "price_solo",
        teamPriceId: "price_team",
        soloExtraCapacityPriceId: "price_solo_capacity",
        teamExtraCapacityPriceId: "price_team_capacity"
      } as never
    });

    await expect(
      deps.billingManagement.getBillingSummaryForOrganization({
        organization_id: "org_123",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toEqual(summary);
    expect(subscriptionRetrieve).not.toHaveBeenCalled();
  });

  it("should map checkout confirmation failure branches before syncing entitlements", async (): Promise<void> => {
    const billingSyncStore = {
      isEventProcessed: vi.fn(),
      markEventProcessed: vi.fn(),
      updateEntitlements: vi.fn(),
      resolveOrganizationByStripeCustomerId: vi.fn(),
      linkStripeCustomer: vi.fn(),
      revokeEntitlements: vi.fn(),
      updateBillingState: vi.fn()
    };
    const billingStore = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "solo",
        stripe_customer_id: "cus_123",
        active_projects: 2,
        capacity_units: {
          total: 3,
          included: 3,
          additional_purchased: 0,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-01-01T00:00:00.000Z",
          ends_at: "2026-02-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 20, limit: 750 },
          monthly_raw_ingested_events: { used: 200, limit: 10500 },
          retained_bundle_cap: { used: 5, limit: 450 },
          monthly_remote_activations: { used: 1, limit: 75 },
          monthly_alert_deliveries: { used: 3, limit: 225 },
          monthly_webhook_deliveries: { used: 6, limit: 750 }
        }
      }),
      getBillingSummaryForProject: vi.fn(),
      incrementOrgUsageCounter: vi.fn()
    };
    const makeDeps = (overrides: {
      retrieveSession?: ReturnType<typeof vi.fn>;
      retrieveSubscription?: ReturnType<typeof vi.fn>;
    }) => {
      createPostgresBillingSyncStoreMock.mockReturnValueOnce(billingSyncStore);
      createPostgresBillingStoreMock.mockReturnValueOnce(billingStore);

      return createApiDependencies({
        objectStore: {
          putObject: vi.fn(),
          getObject: vi.fn(),
          deleteObjectsByPrefix: vi.fn()
        },
        queue: {
          enqueue: vi.fn()
        },
        db: {
          query: vi.fn().mockResolvedValue({ rows: [{ stripe_customer_id: "cus_123" }] })
        },
        stripeConfig: {
          client: {
            subscriptions: {
              retrieve: overrides.retrieveSubscription ?? vi.fn(),
              update: vi.fn()
            },
            subscriptionSchedules: {
              create: vi.fn(),
              retrieve: vi.fn(),
              update: vi.fn(),
              release: vi.fn()
            },
            checkout: {
              sessions: {
                create: vi.fn(),
                retrieve: overrides.retrieveSession ?? vi.fn()
              }
            },
            billingPortal: {
              sessions: {
                create: vi.fn()
              }
            }
          },
          webhookSecret: "whsec_test",
          priceMap: new Map([
            ["price_solo", { plan: "solo", type: "plan" }],
            ["price_team", { plan: "team", type: "plan" }],
            ["price_solo_capacity", { plan: "solo", type: "extra_capacity" }],
            ["price_team_capacity", { plan: "team", type: "extra_capacity" }]
          ]),
          soloPriceId: "price_solo",
          teamPriceId: "price_team",
          soloExtraCapacityPriceId: "price_solo_capacity",
          teamExtraCapacityPriceId: "price_team_capacity"
        } as never
      });
    };

    const sessionMissingDeps = makeDeps({
      retrieveSession: vi.fn().mockRejectedValue(new Error("missing_session"))
    });
    const wrongOrgDeps = makeDeps({
      retrieveSession: vi.fn().mockResolvedValue({
        id: "cs_wrong_org",
        status: "complete",
        client_reference_id: "org_other",
        customer: "cus_123",
        subscription: "sub_123"
      })
    });
    const incompleteDeps = makeDeps({
      retrieveSession: vi.fn().mockResolvedValue({
        id: "cs_open",
        status: "open",
        client_reference_id: "org_123",
        customer: "cus_123",
        subscription: "sub_123"
      })
    });
    const missingCustomerDeps = makeDeps({
      retrieveSession: vi.fn().mockResolvedValue({
        id: "cs_missing_customer",
        status: "complete",
        client_reference_id: "org_123",
        customer: null,
        subscription: {
          id: "sub_123",
          status: "active",
          items: { data: [] },
          latest_invoice: null
        }
      })
    });
    const subscriptionFailureDeps = makeDeps({
      retrieveSession: vi.fn().mockResolvedValue({
        id: "cs_sub_failure",
        status: "complete",
        client_reference_id: "org_123",
        customer: "cus_123",
        subscription: "sub_123"
      }),
      retrieveSubscription: vi.fn().mockRejectedValue(new Error("stripe_down"))
    });

    await expect(
      sessionMissingDeps.billingManagement.confirmCheckoutSession({
        organization_id: "org_123",
        session_id: "cs_missing",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("checkout_session_not_found");
    await expect(
      wrongOrgDeps.billingManagement.confirmCheckoutSession({
        organization_id: "org_123",
        session_id: "cs_wrong_org",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("checkout_session_not_found");
    await expect(
      incompleteDeps.billingManagement.confirmCheckoutSession({
        organization_id: "org_123",
        session_id: "cs_open",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("checkout_not_complete");
    await expect(
      missingCustomerDeps.billingManagement.confirmCheckoutSession({
        organization_id: "org_123",
        session_id: "cs_missing_customer",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("checkout_not_complete");
    await expect(
      subscriptionFailureDeps.billingManagement.confirmCheckoutSession({
        organization_id: "org_123",
        session_id: "cs_sub_failure",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("billing_service_error");

    expect(billingSyncStore.linkStripeCustomer).not.toHaveBeenCalled();
    expect(billingSyncStore.updateEntitlements).not.toHaveBeenCalled();
  });

  it("should confirm checkout sessions using invoice line periods when Stripe omits current subscription periods", async (): Promise<void> => {
    const startsAt = new Date("2026-03-23T00:00:00.000Z");
    const endsAt = new Date("2026-04-23T00:00:00.000Z");
    const subscription = {
      id: "sub_123",
      status: "active",
      items: {
        data: [
          {
            id: "si_plan",
            price: {
              id: "price_solo",
              recurring: {
                interval: "month",
                interval_count: 1
              }
            },
            quantity: 1
          }
        ]
      },
      latest_invoice: {
        lines: {
          data: [
            {
              period: {
                start: Math.floor(startsAt.getTime() / 1000),
                end: Math.floor(endsAt.getTime() / 1000)
              }
            }
          ]
        }
      }
    };
    const subscriptionRetrieve = vi.fn().mockResolvedValue(subscription);
    const billingSyncStore = {
      isEventProcessed: vi.fn(),
      markEventProcessed: vi.fn(),
      updateEntitlements: vi.fn(),
      resolveOrganizationByStripeCustomerId: vi.fn(),
      linkStripeCustomer: vi.fn(),
      revokeEntitlements: vi.fn(),
      updateBillingState: vi.fn()
    };
    createPostgresBillingSyncStoreMock.mockReturnValueOnce(billingSyncStore);
    const billingStore = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "solo",
        stripe_customer_id: "cus_123",
        active_projects: 2,
        capacity_units: {
          total: 3,
          included: 3,
          additional_purchased: 0,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-01-01T00:00:00.000Z",
          ends_at: "2026-02-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 20, limit: 750 },
          monthly_raw_ingested_events: { used: 200, limit: 10500 },
          retained_bundle_cap: { used: 5, limit: 450 },
          monthly_remote_activations: { used: 1, limit: 75 },
          monthly_alert_deliveries: { used: 3, limit: 225 },
          monthly_webhook_deliveries: { used: 6, limit: 750 }
        }
      }),
      getBillingSummaryForProject: vi.fn(),
      incrementOrgUsageCounter: vi.fn()
    };
    createPostgresBillingStoreMock.mockReturnValueOnce(billingStore);

    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            plan: "solo",
            stripe_customer_id: "cus_123",
            stripe_subscription_id: "sub_123"
          }
        ]
      })
    };

    const deps = createApiDependencies({
      objectStore: {
        putObject: vi.fn(),
        getObject: vi.fn(),
        deleteObjectsByPrefix: vi.fn()
      },
      queue: {
        enqueue: vi.fn()
      },
      db,
      stripeConfig: {
        client: {
          subscriptions: {
            retrieve: subscriptionRetrieve,
            update: vi.fn()
          },
          subscriptionSchedules: {
            create: vi.fn(),
            retrieve: vi.fn(),
            update: vi.fn(),
            release: vi.fn()
          },
          checkout: {
            sessions: {
              create: vi.fn(),
              retrieve: vi.fn().mockResolvedValue({
                id: "cs_123",
                status: "complete",
                client_reference_id: "org_123",
                customer: "cus_123",
                subscription
              })
            }
          },
          billingPortal: {
            sessions: {
              create: vi.fn()
            }
          }
        },
        webhookSecret: "whsec_test",
        priceMap: new Map([
          ["price_solo", { plan: "solo", type: "plan" }],
          ["price_team", { plan: "team", type: "plan" }],
          ["price_solo_capacity", { plan: "solo", type: "extra_capacity" }],
          ["price_team_capacity", { plan: "team", type: "extra_capacity" }]
        ]),
        soloPriceId: "price_solo",
        teamPriceId: "price_team",
        soloExtraCapacityPriceId: "price_solo_capacity",
        teamExtraCapacityPriceId: "price_team_capacity"
      } as never
    });

    await expect(
      deps.billingManagement.confirmCheckoutSession({
        organization_id: "org_123",
        session_id: "cs_123",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toEqual(expect.objectContaining({ plan: "solo" }));

    expect(billingSyncStore.updateEntitlements).toHaveBeenCalledWith(
      expect.objectContaining({
        billing_period_starts_at: startsAt.toISOString(),
        billing_period_ends_at: endsAt.toISOString()
      })
    );
  });

  it("should clear invalid Stripe billing periods when checkout confirmation resolves a reversed invoice window", async (): Promise<void> => {
    const subscription = {
      id: "sub_123",
      status: "active",
      items: {
        data: [
          {
            id: "si_plan",
            price: {
              id: "price_solo",
              recurring: {
                interval: "month",
                interval_count: 1
              }
            },
            quantity: 1
          }
        ]
      },
      latest_invoice: {
        lines: {
          data: [
            {
              period: {
                start: 1_772_668_800,
                end: 1_772_582_400
              }
            }
          ]
        }
      }
    };
    const subscriptionRetrieve = vi.fn().mockResolvedValue(subscription);
    const billingSyncStore = {
      isEventProcessed: vi.fn(),
      markEventProcessed: vi.fn(),
      updateEntitlements: vi.fn(),
      resolveOrganizationByStripeCustomerId: vi.fn(),
      linkStripeCustomer: vi.fn(),
      revokeEntitlements: vi.fn(),
      updateBillingState: vi.fn()
    };
    createPostgresBillingSyncStoreMock.mockReturnValueOnce(billingSyncStore);
    const billingStore = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "solo",
        stripe_customer_id: "cus_123",
        active_projects: 2,
        capacity_units: {
          total: 3,
          included: 3,
          additional_purchased: 0,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-01-01T00:00:00.000Z",
          ends_at: "2026-02-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 20, limit: 750 },
          monthly_raw_ingested_events: { used: 200, limit: 10500 },
          retained_bundle_cap: { used: 5, limit: 450 },
          monthly_remote_activations: { used: 1, limit: 75 },
          monthly_alert_deliveries: { used: 3, limit: 225 },
          monthly_webhook_deliveries: { used: 6, limit: 750 }
        }
      }),
      getBillingSummaryForProject: vi.fn(),
      incrementOrgUsageCounter: vi.fn()
    };
    createPostgresBillingStoreMock.mockReturnValueOnce(billingStore);

    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            plan: "solo",
            stripe_customer_id: "cus_123",
            stripe_subscription_id: "sub_123"
          }
        ]
      })
    };

    const deps = createApiDependencies({
      objectStore: {
        putObject: vi.fn(),
        getObject: vi.fn(),
        deleteObjectsByPrefix: vi.fn()
      },
      queue: {
        enqueue: vi.fn()
      },
      db,
      stripeConfig: {
        client: {
          subscriptions: {
            retrieve: subscriptionRetrieve,
            update: vi.fn()
          },
          subscriptionSchedules: {
            create: vi.fn(),
            retrieve: vi.fn(),
            update: vi.fn(),
            release: vi.fn()
          },
          checkout: {
            sessions: {
              create: vi.fn(),
              retrieve: vi.fn().mockResolvedValue({
                id: "cs_124",
                status: "complete",
                client_reference_id: "org_123",
                customer: "cus_123",
                subscription
              })
            }
          },
          billingPortal: {
            sessions: {
              create: vi.fn()
            }
          }
        },
        webhookSecret: "whsec_test",
        priceMap: new Map([
          ["price_solo", { plan: "solo", type: "plan" }],
          ["price_team", { plan: "team", type: "plan" }],
          ["price_solo_capacity", { plan: "solo", type: "extra_capacity" }],
          ["price_team_capacity", { plan: "team", type: "extra_capacity" }]
        ]),
        soloPriceId: "price_solo",
        teamPriceId: "price_team",
        soloExtraCapacityPriceId: "price_solo_capacity",
        teamExtraCapacityPriceId: "price_team_capacity"
      } as never
    });

    await expect(
      deps.billingManagement.confirmCheckoutSession({
        organization_id: "org_123",
        session_id: "cs_124",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toEqual(expect.objectContaining({ plan: "solo" }));

    expect(billingSyncStore.updateEntitlements).toHaveBeenCalledWith(
      expect.objectContaining({
        billing_period_starts_at: null,
        billing_period_ends_at: null
      })
    );
  });

  it("should map slot-management edge cases through stripe-backed dependencies", async (): Promise<void> => {
    const summary = {
      plan: "solo",
      stripe_customer_id: "cus_123",
      active_projects: 2,
      capacity_units: {
        total: 5,
        included: 3,
        additional_purchased: 2,
        pending_reduction: null
      },
      usage_window: {
        starts_at: "2026-03-23T11:56:12.000Z",
        ends_at: "2026-04-23T11:56:12.000Z"
      },
      allowances: {
        monthly_bundle_requests: { used: 20, limit: 1250 },
        monthly_raw_ingested_events: { used: 200, limit: 10000 },
        retained_bundle_cap: { used: 5, limit: 750 },
        monthly_remote_activations: { used: 1, limit: 125 },
        monthly_alert_deliveries: { used: 3, limit: 375 },
        monthly_webhook_deliveries: { used: 6, limit: 1250 }
      }
    };
    const buildStripeConfig = (input: {
      subscriptionRetrieve: ReturnType<typeof vi.fn>;
      subscriptionUpdate?: ReturnType<typeof vi.fn> | undefined;
      scheduleCreate?: ReturnType<typeof vi.fn> | undefined;
      scheduleUpdate?: ReturnType<typeof vi.fn> | undefined;
      scheduleRelease?: ReturnType<typeof vi.fn> | undefined;
    }) =>
      ({
        client: {
          subscriptions: {
            retrieve: input.subscriptionRetrieve,
            update: input.subscriptionUpdate ?? vi.fn()
          },
          subscriptionSchedules: {
            create: input.scheduleCreate ?? vi.fn(),
            retrieve: vi.fn(),
            update: input.scheduleUpdate ?? vi.fn(),
            release: input.scheduleRelease ?? vi.fn()
          },
          checkout: {
            sessions: {
              create: vi.fn()
            }
          },
          billingPortal: {
            sessions: {
              create: vi.fn()
            }
          }
        },
        webhookSecret: "whsec_test",
        priceMap: new Map([
          ["price_solo", { plan: "solo", type: "plan" }],
          ["price_team", { plan: "team", type: "plan" }],
          ["price_solo_capacity", { plan: "solo", type: "extra_capacity" }],
          ["price_team_capacity", { plan: "team", type: "extra_capacity" }]
        ]),
        soloPriceId: "price_solo",
        teamPriceId: "price_team",
        soloExtraCapacityPriceId: "price_solo_capacity",
        teamExtraCapacityPriceId: "price_team_capacity"
      }) as never;
    const buildDeps = (input: {
      dbRows: Array<Record<string, unknown>>;
      subscriptionRetrieve: ReturnType<typeof vi.fn>;
      subscriptionUpdate?: ReturnType<typeof vi.fn>;
      scheduleCreate?: ReturnType<typeof vi.fn>;
      scheduleUpdate?: ReturnType<typeof vi.fn>;
      scheduleRelease?: ReturnType<typeof vi.fn>;
      includeStripeConfig?: boolean;
    }) => {
      createPostgresBillingStoreMock.mockReturnValueOnce({
        getBillingSummaryForOrganization: vi.fn().mockResolvedValue(summary),
        getBillingSummaryForProject: vi.fn(),
        incrementOrgUsageCounter: vi.fn()
      });

      return createApiDependencies({
        objectStore: {
          putObject: vi.fn(),
          getObject: vi.fn(),
          deleteObjectsByPrefix: vi.fn()
        },
        queue: {
          enqueue: vi.fn()
        },
        db: {
          query: vi.fn().mockResolvedValue({ rows: input.dbRows })
        },
        ...(input.includeStripeConfig === false
          ? {}
          : {
              stripeConfig: buildStripeConfig({
                subscriptionRetrieve: input.subscriptionRetrieve,
                subscriptionUpdate: input.subscriptionUpdate,
                scheduleCreate: input.scheduleCreate,
                scheduleUpdate: input.scheduleUpdate,
                scheduleRelease: input.scheduleRelease
              })
            })
      });
    };
    const recurringPrice = {
      recurring: {
        interval: "month",
        interval_count: 1
      }
    };
    const subscriptionWithExtraSlots = {
      id: "sub_123",
      schedule: null,
      items: {
        data: [
          {
            id: "si_plan",
            price: {
              id: "price_solo",
              ...recurringPrice
            },
            quantity: 1
          },
          {
            id: "si_slots",
            price: {
              id: "price_solo_capacity",
              ...recurringPrice
            },
            quantity: 2
          }
        ]
      }
    };

    const noStripeDeps = buildDeps({
      dbRows: [
        {
          plan: "solo",
          stripe_customer_id: "cus_123",
          stripe_subscription_id: "sub_123"
        }
      ],
      subscriptionRetrieve: vi.fn(),
      includeStripeConfig: false
    });
    const invalidQuantityDeps = buildDeps({
      dbRows: [
        {
          plan: "solo",
          stripe_customer_id: "cus_123",
          stripe_subscription_id: "sub_123"
        }
      ],
      subscriptionRetrieve: vi.fn().mockResolvedValue(subscriptionWithExtraSlots)
    });
    const noSubscriptionDeps = buildDeps({
      dbRows: [
        {
          plan: "free",
          stripe_customer_id: null,
          stripe_subscription_id: null
        }
      ],
      subscriptionRetrieve: vi.fn()
    });
    const updateErrorDeps = buildDeps({
      dbRows: [
        {
          plan: "solo",
          stripe_customer_id: "cus_123",
          stripe_subscription_id: "sub_123"
        }
      ],
      subscriptionRetrieve: vi.fn().mockResolvedValue({
        ...subscriptionWithExtraSlots,
        items: {
          data: [
            {
              id: "si_plan",
              price: {
                id: "price_solo",
                ...recurringPrice
              },
              quantity: 1
            }
          ]
        }
      }),
      subscriptionUpdate: vi.fn().mockRejectedValue(new Error("update failed"))
    });

    await expect(
      noStripeDeps.billingManagement.increaseCapacity({
        organization_id: "org_123",
        target_additional_capacity_units: 3,
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("billing_not_configured");
    await expect(
      invalidQuantityDeps.billingManagement.increaseCapacity({
        organization_id: "org_123",
        target_additional_capacity_units: 2,
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("invalid_target_quantity");
    await expect(
      invalidQuantityDeps.billingManagement.scheduleCapacityReduction({
        organization_id: "org_123",
        target_additional_capacity_units: 2,
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("invalid_target_quantity");
    await expect(
      invalidQuantityDeps.billingManagement.cancelCapacityReduction({
        organization_id: "org_123",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("capacity_reduction_not_found");
    await expect(
      noSubscriptionDeps.billingManagement.scheduleCapacityReduction({
        organization_id: "org_123",
        target_additional_capacity_units: 0,
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("no_active_subscription");
    await expect(
      updateErrorDeps.billingManagement.increaseCapacity({
        organization_id: "org_123",
        target_additional_capacity_units: 1,
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("billing_not_configured");
  });

  it("should map github installation and retry failure states", async (): Promise<void> => {
    const githubAppClient = {
      getInstallUrl: vi.fn().mockResolvedValue("https://github.com/apps/debugbundle-automation/installations/new"),
      getInstallation: vi.fn(),
      listRepositories: vi.fn().mockResolvedValue([
        { id: 1, owner: "debugbundle", name: "app", full_name: "debugbundle/app", default_branch: "main", private: false }
      ]),
      verifyWebhookSignature: vi.fn().mockReturnValue(true)
    };
    const buildDeps = (githubStore: Record<string, unknown>) => {
      createPostgresGitHubStoreMock.mockReturnValueOnce(githubStore);

      return createApiDependencies({
        objectStore: { putObject: vi.fn(), getObject: vi.fn(), deleteObjectsByPrefix: vi.fn() },
        queue: { enqueue: vi.fn() },
        db: { query: vi.fn() },
        githubAppClient
      });
    };

    const installationMissingDeps = buildDeps({
      getGitHubInstallationForOrganization: vi.fn().mockResolvedValue(null)
    });
    const installationSuspendedDeps = buildDeps({
      getGitHubInstallationForOrganization: vi.fn().mockResolvedValue({ status: "suspended" })
    });
    const installationRemovedDeps = buildDeps({
      getGitHubInstallationForOrganization: vi.fn().mockResolvedValue({ status: "removed" })
    });
    const retryRepoMissingDeps = buildDeps({
      getGitHubInstallationForOrganization: vi.fn().mockResolvedValue({ status: "active" }),
      getProjectGitHubRepoForOrganization: vi.fn().mockResolvedValue(null),
      retryProjectGitHubDeliveryForOrganization: vi.fn()
    });
    const retryMissingDeliveryDeps = buildDeps({
      getGitHubInstallationForOrganization: vi.fn().mockResolvedValue({ status: "active" }),
      getProjectGitHubRepoForOrganization: vi.fn().mockResolvedValue({ project_id: "proj_1" }),
      retryProjectGitHubDeliveryForOrganization: vi.fn().mockResolvedValue(null)
    });
    const retrySuccessDeps = buildDeps({
      getGitHubInstallationForOrganization: vi.fn().mockResolvedValue({ status: "active", installation_id: 42 }),
      getProjectGitHubRepoForOrganization: vi.fn().mockResolvedValue({ project_id: "proj_1" }),
      retryProjectGitHubDeliveryForOrganization: vi.fn().mockResolvedValue({
        delivery_id: "del_123",
        status: "retrying"
      })
    });

    await expect(
      installationMissingDeps.githubManagement?.listRepositoriesForOrganization({ organization_id: "org_1" })
    ).resolves.toBe("installation_not_found");
    await expect(
      installationSuspendedDeps.githubManagement?.listRepositoriesForOrganization({ organization_id: "org_1" })
    ).resolves.toBe("installation_suspended");
    await expect(
      installationRemovedDeps.githubManagement?.listRepositoriesForOrganization({ organization_id: "org_1" })
    ).resolves.toBe("installation_removed");
    await expect(
      retryRepoMissingDeps.githubManagement?.retryProjectDeliveryForOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        delivery_id: "del_123"
      })
    ).resolves.toBe("repo_not_found");
    await expect(
      retryMissingDeliveryDeps.githubManagement?.retryProjectDeliveryForOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        delivery_id: "del_123"
      })
    ).resolves.toBe("delivery_not_found");
    await expect(
      retrySuccessDeps.githubManagement?.retryProjectDeliveryForOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        delivery_id: "del_123"
      })
    ).resolves.toEqual({
      delivery_id: "del_123",
      status: "retrying"
    });
  });

  it("should map github rule creation and installation webhook branches", async (): Promise<void> => {
    const updateGitHubInstallationStatus = vi.fn().mockResolvedValue(undefined);
    const upsertGitHubInstallationForOrganization = vi.fn().mockResolvedValue({
      id: "ghi_1",
      installation_id: 42,
      account_login: "debugbundle",
      account_type: "Organization",
      status: "active"
    });
    const githubStore = {
      getProjectGitHubRepoForOrganization: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ project_id: "proj_limit" })
        .mockResolvedValueOnce({ project_id: "proj_created" }),
      listProjectGitHubRulesForOrganization: vi
        .fn()
        .mockResolvedValueOnce([{ rule_id: "one" }, { rule_id: "two" }, { rule_id: "three" }])
        .mockResolvedValueOnce([]),
      createProjectGitHubRuleForOrganization: vi.fn().mockResolvedValue({ rule_id: "rule_created" }),
      updateGitHubInstallationStatus,
      upsertGitHubInstallationForOrganization,
      getGitHubInstallationForOrganization: vi.fn(),
      deleteGitHubInstallationForOrganization: vi.fn(),
      deleteProjectGitHubRepoForOrganization: vi.fn(),
      getProjectGitHubRuleForOrganization: vi.fn(),
      updateProjectGitHubRuleForOrganization: vi.fn(),
      deleteProjectGitHubRuleForOrganization: vi.fn(),
      listProjectGitHubDeliveriesForOrganization: vi.fn(),
      retryProjectGitHubDeliveryForOrganization: vi.fn(),
      upsertProjectGitHubRepoForOrganization: vi.fn()
    };
    const linkOrganizationToMarketplaceAccountByInstallationId = vi.fn().mockResolvedValue(null);
    createPostgresGitHubStoreMock.mockReturnValue(githubStore);
    createPostgresGitHubMarketplaceStoreMock.mockReturnValueOnce({
      isEventProcessed: vi.fn(),
      markEventProcessed: vi.fn(),
      upsertMarketplaceAccount: vi.fn(),
      linkOrganizationToMarketplaceAccountByInstallationId
    });
    createPostgresMetadataStoreMock.mockReturnValueOnce({
      ...createPostgresMetadataStoreMock.getMockImplementation?.()?.(),
      listProjectsForOrganization: vi
        .fn()
        .mockResolvedValueOnce([{ project_id: "proj_repo_missing" }])
        .mockResolvedValueOnce([])
    });
    createPostgresBillingStoreMock.mockReturnValueOnce({
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({ plan: "free" }),
      getBillingSummaryForProject: vi.fn(),
      incrementOrgUsageCounter: vi.fn()
    });
    const githubAppClient = {
      getInstallUrl: vi.fn().mockResolvedValue("https://github.com/apps/debugbundle-automation/installations/new"),
      getInstallation: vi.fn().mockResolvedValue({
        installation_id: 42,
        account_login: "debugbundle",
        account_type: "Organization" as const
      }),
      listRepositories: vi.fn().mockResolvedValue([]),
      verifyWebhookSignature: vi.fn().mockReturnValue(true)
    };

    const deps = createApiDependencies({
      objectStore: { putObject: vi.fn(), getObject: vi.fn(), deleteObjectsByPrefix: vi.fn() },
      queue: { enqueue: vi.fn() },
      db: { query: vi.fn() },
      githubAppClient
    });

    await expect(
      deps.githubManagement?.createProjectRuleForOrganization({
        organization_id: "org_1",
        project_id: "proj_repo_missing",
        created_by_user_id: "user_1",
        name: "Rule",
        enabled: true,
        event_types: ["bundle.created"],
        environments: [],
        services: [],
        severity_min: "high",
        bundle_type: "failure",
        incident_status: "new_or_reopened",
        cooldown_seconds: 300
      })
    ).resolves.toBe("repo_not_found");
    await expect(
      deps.githubManagement?.createProjectRuleForOrganization({
        organization_id: "org_1",
        project_id: "proj_missing",
        created_by_user_id: "user_1",
        name: "Rule",
        enabled: true,
        event_types: ["bundle.created"],
        environments: [],
        services: [],
        severity_min: "high",
        bundle_type: "failure",
        incident_status: "new_or_reopened",
        cooldown_seconds: 300
      })
    ).resolves.toBe("project_not_found");
    await expect(
      deps.githubManagement?.createProjectRuleForOrganization({
        organization_id: "org_1",
        project_id: "proj_limit",
        created_by_user_id: "user_1",
        name: "Rule",
        enabled: true,
        event_types: ["bundle.created"],
        environments: [],
        services: [],
        severity_min: "high",
        bundle_type: "failure",
        incident_status: "new_or_reopened",
        cooldown_seconds: 300
      })
    ).resolves.toBe("rule_limit_reached");
    await expect(
      deps.githubManagement?.createProjectRuleForOrganization({
        organization_id: "org_1",
        project_id: "proj_created",
        created_by_user_id: "user_1",
        name: "Rule",
        enabled: true,
        event_types: ["bundle.created"],
        environments: [],
        services: [],
        severity_min: "high",
        bundle_type: "failure",
        incident_status: "new_or_reopened",
        cooldown_seconds: 300
      })
    ).resolves.toEqual({ rule_id: "rule_created" });
    await expect(
      deps.githubManagement?.completeGithubInstallationForOrganization({
        organization_id: "org_1",
        installation_id: 42
      })
    ).resolves.toEqual(
      expect.objectContaining({
        installation_id: 42,
        status: "active"
      })
    );
    expect(linkOrganizationToMarketplaceAccountByInstallationId).toHaveBeenCalledWith({
      organization_id: "org_1",
      installation_id: 42
    });

    expect(
      deps.githubManagement?.verifyWebhookSignature({
        rawBody: Buffer.from("{}"),
        signature: "sha256=test"
      })
    ).toBe(true);

    await deps.githubManagement?.processWebhook({ eventName: "ping", payload: {} });
    await deps.githubManagement?.processWebhook({
      eventName: "installation",
      payload: {
        action: "deleted",
        installation: {
          id: 42,
          account: {
            login: "debugbundle",
            type: "Organization"
          }
        }
      }
    });
    await deps.githubManagement?.processWebhook({
      eventName: "installation",
      payload: {
        action: "unsuspend",
        installation: {
          id: 42,
          account: {
            login: "debugbundle",
            type: "User"
          }
        }
      }
    });
    await deps.githubManagement?.processWebhook({
      eventName: "installation",
      payload: {
        action: "unknown",
        installation: {
          id: 42
        }
      }
    });

    expect(updateGitHubInstallationStatus).toHaveBeenCalledTimes(2);
    expect(updateGitHubInstallationStatus).toHaveBeenCalledWith({
      installation_id: 42,
      status: "removed",
      account_login: "debugbundle",
      account_type: "Organization"
    });
    expect(updateGitHubInstallationStatus).toHaveBeenCalledWith({
      installation_id: 42,
      status: "active",
      account_login: "debugbundle",
      account_type: "User"
    });
  });

  it("should delegate through additional github management helpers", async (): Promise<void> => {
    const githubStore = {
      getGitHubInstallationForOrganization: vi.fn().mockResolvedValue({
        id: "ghi_1",
        installation_id: 42,
        account_login: "debugbundle",
        account_type: "Organization",
        status: "active"
      }),
      deleteGitHubInstallationForOrganization: vi.fn().mockResolvedValue(true),
      listProjectGitHubDeliveriesForOrganization: vi.fn().mockResolvedValue([{ delivery_id: "del_123" }]),
      listProjectGitHubRulesForOrganization: vi.fn().mockResolvedValue([{ rule_id: "rule_123" }]),
      getProjectGitHubRuleForOrganization: vi.fn().mockResolvedValue({ rule_id: "rule_123" }),
      updateProjectGitHubRuleForOrganization: vi.fn().mockResolvedValue({ rule_id: "rule_123", enabled: false }),
      deleteProjectGitHubRuleForOrganization: vi.fn().mockResolvedValue(true),
      deleteProjectGitHubRepoForOrganization: vi.fn().mockResolvedValue(true),
      getProjectGitHubRepoForOrganization: vi.fn().mockResolvedValue({ project_id: "proj_1" }),
      retryProjectGitHubDeliveryForOrganization: vi.fn().mockResolvedValue({ delivery_id: "del_123", status: "retrying" }),
      upsertProjectGitHubRepoForOrganization: vi.fn(),
      createProjectGitHubRuleForOrganization: vi.fn(),
      updateGitHubInstallationStatus: vi.fn(),
      upsertGitHubInstallationForOrganization: vi.fn()
    };
    createPostgresGitHubStoreMock.mockReturnValue(githubStore);
    const githubAppClient = {
      getInstallUrl: vi.fn().mockResolvedValue("https://github.com/apps/debugbundle-automation/installations/new"),
      getInstallation: vi.fn(),
      listRepositories: vi.fn().mockResolvedValue([
        { id: 1, owner: "debugbundle", name: "app", full_name: "debugbundle/app", default_branch: "main", private: false }
      ]),
      verifyWebhookSignature: vi.fn().mockReturnValue(true)
    };

    const deps = createApiDependencies({
      objectStore: { putObject: vi.fn(), getObject: vi.fn(), deleteObjectsByPrefix: vi.fn() },
      queue: { enqueue: vi.fn() },
      db: { query: vi.fn() },
      githubAppClient
    });

    await expect(
      deps.githubManagement?.listRepositoriesForOrganization({ organization_id: "org_1" })
    ).resolves.toEqual([
      { id: 1, owner: "debugbundle", name: "app", full_name: "debugbundle/app", default_branch: "main", private: false }
    ]);
    await expect(
      deps.githubManagement?.getInstallationForOrganization({ organization_id: "org_1" })
    ).resolves.toEqual(expect.objectContaining({ installation_id: 42 }));
    await expect(
      deps.githubManagement?.disconnectInstallationForOrganization({ organization_id: "org_1" })
    ).resolves.toBe(true);
    await expect(
      deps.githubManagement?.listProjectDeliveriesForOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        status: "failed",
        limit: 5
      })
    ).resolves.toEqual([{ delivery_id: "del_123" }]);
    await expect(
      deps.githubManagement?.listProjectRulesForOrganization({
        organization_id: "org_1",
        project_id: "proj_1"
      })
    ).resolves.toEqual([{ rule_id: "rule_123" }]);
    await expect(
      deps.githubManagement?.getProjectRuleForOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        rule_id: "rule_123"
      })
    ).resolves.toEqual({ rule_id: "rule_123" });
    await expect(
      deps.githubManagement?.updateProjectRuleForOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        rule_id: "rule_123",
        enabled: false
      })
    ).resolves.toEqual({ rule_id: "rule_123", enabled: false });
    await expect(
      deps.githubManagement?.deleteProjectRuleForOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        rule_id: "rule_123"
      })
    ).resolves.toBe(true);
    await expect(
      deps.githubManagement?.removeProjectRepoForOrganization({
        organization_id: "org_1",
        project_id: "proj_1"
      })
    ).resolves.toBe(true);

    expect(githubStore.listProjectGitHubDeliveriesForOrganization).toHaveBeenCalledWith({
      organization_id: "org_1",
      project_id: "proj_1",
      status: "failed",
      limit: 5
    });
    expect(githubStore.updateProjectGitHubRuleForOrganization).toHaveBeenCalledWith({
      organization_id: "org_1",
      project_id: "proj_1",
      rule_id: "rule_123",
      enabled: false
    });
    expect(githubStore.deleteProjectGitHubRepoForOrganization).toHaveBeenCalledWith({
      organization_id: "org_1",
      project_id: "proj_1"
    });
  });

  it("clears sample-only fields when changing a capture rule to a non-sample action", async (): Promise<void> => {
    const updateCaptureRule = vi.fn().mockResolvedValue(null);
    createPostgresCaptureRuleStoreMock.mockReturnValueOnce({
      listCaptureRulesByProjectId: vi.fn(),
      listActiveCaptureRulesByProjectId: vi.fn(),
      createCaptureRule: vi.fn(),
      updateCaptureRule,
      deleteCaptureRule: vi.fn(),
      recordCaptureRuleMatch: vi.fn()
    });

    const deps = createApiDependencies({
      objectStore: { putObject: vi.fn(), getObject: vi.fn(), deleteObjectsByPrefix: vi.fn() },
      queue: { enqueue: vi.fn() },
      db: { query: vi.fn() }
    });

    await deps.captureRuleManagement.updateCaptureRuleForProject({
      organization_id: "org_123",
      project_id: "proj_123",
      rule_id: "00000000-0000-4000-8000-000000000101",
      update: {
        action: "drop"
      }
    });

    expect(updateCaptureRule).toHaveBeenCalledWith({
      id: "00000000-0000-4000-8000-000000000101",
      project_id: "proj_123",
      action: "drop",
      sample_rate: null,
      sample_event_class: null
    });
  });
});
