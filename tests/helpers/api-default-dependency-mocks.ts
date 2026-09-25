import { beforeEach, vi } from "vitest";

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
  createPostgresAnalyticsBundleGenerationStoreMock,
  createPostgresAnalyticsJourneySampleStoreMock,
  createPostgresAnalyticsMetricsStoreMock,
  createPostgresAnalyticsOpportunityStoreMock,
  createPostgresAnalyticsSavedFunnelStoreMock,
  createPostgresAnalyticsSettingsStoreMock,
  createPostgresAnalyticsUsageStoreMock,
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
  createPostgresAlertGroupInspectionStoreMock,
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
  createPostgresAnalyticsBundleGenerationStoreMock: vi.fn(),
  createPostgresAnalyticsJourneySampleStoreMock: vi.fn(),
  createPostgresAnalyticsMetricsStoreMock: vi.fn(),
  createPostgresAnalyticsOpportunityStoreMock: vi.fn(),
  createPostgresAnalyticsSavedFunnelStoreMock: vi.fn(),
  createPostgresAnalyticsSettingsStoreMock: vi.fn(),
  createPostgresAnalyticsUsageStoreMock: vi.fn(),
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
  createPostgresAlertGroupInspectionStoreMock: vi.fn(),
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

vi.mock("../../packages/storage/src/index.js", () => ({
  createAgentTokenStore: vi.fn(() => ({
    resolveByTokenHash: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    revoke: vi.fn()
  })),
  buildRawEventObjectKey: ({ projectId, eventId }: { projectId: string; eventId: string }) =>
    `events/${projectId}/${eventId}.json.gz`,
  buildBundleObjectKey: (projectId: string, incidentId: string) =>
    `bundles/${projectId}/${incidentId}.json.gz`,
  buildImprovementBundleObjectKey: (projectId: string, opportunityId: string) =>
    `improvement-bundles/${projectId}/${opportunityId}.json.gz`,
  buildReproductionObjectKey: (projectId: string, incidentId: string) =>
    `reproductions/${projectId}/${incidentId}.json.gz`,
  buildBundleRegenerationLeaseKey: (incidentId: string) =>
    `leases:bundle-regeneration:${incidentId}`,
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
  createPostgresAnalyticsBundleGenerationStore: createPostgresAnalyticsBundleGenerationStoreMock,
  createPostgresAnalyticsJourneySampleStore: createPostgresAnalyticsJourneySampleStoreMock,
  createPostgresAnalyticsMetricsStore: createPostgresAnalyticsMetricsStoreMock,
  createPostgresAnalyticsOpportunityStore: createPostgresAnalyticsOpportunityStoreMock,
  createPostgresAnalyticsSavedFunnelStore: createPostgresAnalyticsSavedFunnelStoreMock,
  createPostgresAnalyticsSettingsStore: createPostgresAnalyticsSettingsStoreMock,
  createPostgresAnalyticsUsageStore: createPostgresAnalyticsUsageStoreMock,
  createPostgresCapturePolicyStore: createPostgresCapturePolicyStoreMock,
  createPostgresAvailabilityCheckStore: createPostgresAvailabilityCheckStoreMock,
  createMemberAuthService: createMemberAuthServiceMock,
  createIngestionPersistenceService: createIngestionPersistenceServiceMock,
  createPostgresMetadataStore: createPostgresMetadataStoreMock,
  createPostgresAlertGroupInspectionStore: createPostgresAlertGroupInspectionStoreMock,
  createPostgresSlackDestinationStore: createPostgresSlackDestinationStoreMock,
  createPostgresOperationalEmailDeliveryStore: createPostgresOperationalEmailDeliveryStoreMock,
  createPostgresWeeklyReportChannelStore: createPostgresWeeklyReportChannelStoreMock,
  createPostgresWebhookDeliveryStore: createPostgresWebhookDeliveryStoreMock,
  createPostgresGitHubStore: createPostgresGitHubStoreMock,
  createPostgresGitHubMarketplaceStore: createPostgresGitHubMarketplaceStoreMock,
  createPostgresIngestionRejectionDiagnosticStore:
    createPostgresIngestionRejectionDiagnosticStoreMock,
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
  createPostgresCaptureRuleStore: createPostgresCaptureRuleStoreMock
}));

vi.mock("../../packages/auth/src/index.js", () => ({
  createGitHubOAuthClient: createGitHubOAuthClientMock,
  createGitHubCliAuthService: createGitHubCliAuthServiceMock,
  createAccountDeletionChallengeService: createAccountDeletionChallengeServiceMock,
  createWebSessionAuthService: createWebSessionAuthServiceMock
}));

vi.mock("../../packages/email/src/index.js", () => ({
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
  createPostgresAnalyticsBundleGenerationStoreMock.mockReset();
  createPostgresAnalyticsJourneySampleStoreMock.mockReset();
  createPostgresAnalyticsMetricsStoreMock.mockReset();
  createPostgresAnalyticsOpportunityStoreMock.mockReset();
  createPostgresAnalyticsSavedFunnelStoreMock.mockReset();
  createPostgresAnalyticsSettingsStoreMock.mockReset();
  createPostgresAnalyticsUsageStoreMock.mockReset();
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
  createPostgresAlertGroupInspectionStoreMock.mockReset();
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
  createRedisIncidentFrequencyCounterMock.mockReturnValue({
    recordOccurrence: vi.fn(),
    close: vi.fn()
  });
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
  createPostgresAnalyticsBundleGenerationStoreMock.mockReturnValue({
    listAnalyticsBundleGenerationsForProject: vi.fn(),
    reserveAnalyticsBundleGeneration: vi.fn(),
    getAnalyticsBundleGenerationForProject: vi.fn()
  });
  createPostgresAnalyticsJourneySampleStoreMock.mockReturnValue({
    listAnalyticsJourneySamplesForProject: vi.fn(),
    getAnalyticsJourneySampleForProject: vi.fn()
  });
  createPostgresAnalyticsMetricsStoreMock.mockReturnValue({
    getIncidentImpact: vi.fn(),
    getUsageSummary: vi.fn(),
    getRouteMetrics: vi.fn(),
    getJourneyPatterns: vi.fn(),
    getDeviceBreakdown: vi.fn(),
    getReferrerMetrics: vi.fn(),
    getActionMetrics: vi.fn(),
    listFunnels: vi.fn(),
    getFunnelAnalysis: vi.fn()
  });
  createPostgresAnalyticsOpportunityStoreMock.mockReturnValue({
    listAnalyticsOpportunitiesForProject: vi.fn(),
    getAnalyticsOpportunityForProject: vi.fn()
  });
  createPostgresAnalyticsSavedFunnelStoreMock.mockReturnValue({
    listSavedFunnelsForProject: vi.fn(),
    createSavedFunnelForProject: vi.fn(),
    updateSavedFunnelForProject: vi.fn(),
    archiveSavedFunnelForProject: vi.fn()
  });
  createPostgresAnalyticsSettingsStoreMock.mockReturnValue({
    getAnalyticsSettingsByProjectId: vi.fn(),
    updateAnalyticsSettings: vi.fn()
  });
  createPostgresAnalyticsUsageStoreMock.mockReturnValue({
    getAnalyticsUsageForOrganization: vi.fn(),
    claimAnalyticsUsageForOrganization: vi.fn(),
    releaseAnalyticsUsageForOrganization: vi.fn()
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
  renderEmailAuthCodeEmailMock.mockReturnValue({
    subject: "Your DebugBundle code",
    text: "123456",
    html: "<b>123456</b>"
  });
  renderProjectInviteEmailMock.mockReturnValue({
    subject: "Invite",
    text: "invite-text",
    html: "invite-html"
  });
  createIngestionPersistenceServiceMock.mockReturnValue({ persistAndEnqueue: vi.fn() });
  createPostgresAlertGroupInspectionStoreMock.mockReturnValue({
    listGroupsForOrganization: vi.fn(),
    getGroupForOrganization: vi.fn()
  });
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

export {
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
  createPostgresAnalyticsBundleGenerationStoreMock,
  createPostgresAnalyticsJourneySampleStoreMock,
  createPostgresAnalyticsMetricsStoreMock,
  createPostgresAnalyticsOpportunityStoreMock,
  createPostgresAnalyticsSavedFunnelStoreMock,
  createPostgresAnalyticsSettingsStoreMock,
  createPostgresAnalyticsUsageStoreMock,
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
};
