import { describe, expect, it, vi } from "vitest";
import {
  createPostgresAuthStoreMock,
  createPostgresAnalyticsBundleGenerationStoreMock,
  createPostgresCaptureRuleStoreMock,
  createPostgresAvailabilityCheckStoreMock,
  createPostgresImprovementOpportunityStoreMock,
  createMemberAuthServiceMock,
  createWebSessionAuthServiceMock,
  createIngestionPersistenceServiceMock,
  createPostgresMetadataStoreMock,
  createPostgresWeeklyReportChannelStoreMock,
  createPostgresWebhookDeliveryStoreMock,
  createIngestionMetadataServiceMock,
  validateAvailabilityCheckDefinitionMock
} from "../../helpers/api-default-dependency-mocks.js";
import { createApiDependencies } from "../../../apps/api/src/default-dependencies.ts";

describe("api-default-dependency-mocks core", () => {
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
    expect(createWebSessionAuthServiceMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Object)
    );
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
    expect(typeof deps.probeManagement.createProbeActivationForProjectInOrganization).toBe(
      "function"
    );
    expect(typeof deps.probeManagement.deactivateProbeActivationForProjectInOrganization).toBe(
      "function"
    );
    expect(typeof deps.captureRuleManagement.listCaptureRulesForProject).toBe("function");
    expect(typeof deps.captureRuleManagement.listActiveCaptureRulesForProject).toBe("function");
    expect(typeof deps.captureRuleManagement.createCaptureRuleForProject).toBe("function");
    expect(typeof deps.captureRuleManagement.updateCaptureRuleForProject).toBe("function");
    expect(typeof deps.captureRuleManagement.deleteCaptureRuleForProject).toBe("function");
    expect(typeof deps.captureRuleManagement.recordCaptureRuleMatch).toBe("function");
    expect(typeof deps.analyticsSettingsManagement.getAnalyticsSettingsForProject).toBe("function");
    expect(typeof deps.analyticsSettingsManagement.updateAnalyticsSettingsForProject).toBe(
      "function"
    );
    expect(typeof deps.analyticsSavedFunnels?.listSavedFunnelsForProject).toBe("function");
    expect(typeof deps.analyticsSavedFunnels?.createSavedFunnelForProject).toBe("function");
    expect(typeof deps.analyticsMetrics.getUsageSummaryForProject).toBe("function");
    expect(typeof deps.analyticsMetrics.getRouteMetricsForProject).toBe("function");
    expect(typeof deps.analyticsMetrics.getJourneyPatternsForProject).toBe("function");
    expect(typeof deps.analyticsMetrics.getDeviceBreakdownForProject).toBe("function");
    expect(typeof deps.analyticsMetrics.getReferrerMetricsForProject).toBe("function");
    expect(typeof deps.analyticsMetrics.getActionMetricsForProject).toBe("function");
    expect(typeof deps.analyticsMetrics.listFunnelsForProject).toBe("function");
    expect(typeof deps.analyticsMetrics.getFunnelAnalysisForProject).toBe("function");
    expect(typeof deps.analyticsJourneySamples.listAnalyticsJourneySamplesForProject).toBe(
      "function"
    );
    expect(typeof deps.analyticsJourneySamples.getAnalyticsJourneySampleForProject).toBe(
      "function"
    );
    expect(typeof deps.analyticsBundles.requestAnalyticsBundleGenerationForProject).toBe(
      "function"
    );
    expect(typeof deps.analyticsBundles.listAnalyticsBundleGenerationsForProject).toBe("function");
    expect(typeof deps.analyticsBundles.getAnalyticsBundleGenerationForProject).toBe("function");
    expect(typeof deps.analyticsOpportunities?.listAnalyticsOpportunitiesForProject).toBe(
      "function"
    );
    expect(typeof deps.analyticsOpportunities?.getAnalyticsOpportunityForProject).toBe("function");
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
    expect(typeof deps.weeklyReportManagement.listWeeklyReportChannelsForOrganization).toBe(
      "function"
    );
    expect(typeof deps.weeklyReportManagement.createWeeklyReportChannelForOrganization).toBe(
      "function"
    );
    expect(typeof deps.weeklyReportManagement.updateWeeklyReportChannelForOrganization).toBe(
      "function"
    );
    expect(typeof deps.weeklyReportManagement.deleteWeeklyReportChannelForOrganization).toBe(
      "function"
    );
    expect(typeof deps.webhookDelivery.listDeliveriesForWebhookInOrganization).toBe("function");
    expect(typeof deps.webhookTesting.triggerTestDelivery).toBe("function");

    void deps.incidentRetrieval.listIncidentsForOrganization({
      organization_id: "org_123",
      limit: 5
    });
    void deps.incidentRetrieval.getIncidentForOrganization({
      organization_id: "org_123",
      incident_id: "inc_123"
    });
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
    const improvementOpportunityStore = createPostgresImprovementOpportunityStoreMock.mock
      .results[0]?.value as {
      listImprovementsForOrganization: ReturnType<typeof vi.fn>;
      getImprovementForOrganization: ReturnType<typeof vi.fn>;
      resolveImprovementForOrganization: ReturnType<typeof vi.fn>;
      reopenImprovementForOrganization: ReturnType<typeof vi.fn>;
      snoozeImprovementForOrganization: ReturnType<typeof vi.fn>;
    };
    const webhookStore = createPostgresWebhookDeliveryStoreMock.mock.results[0]?.value as {
      createTestDeliveryForOrganization: ReturnType<typeof vi.fn>;
    };

    expect(metadataStore.listIncidentsForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      limit: 5
    });
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
    expect(objectStore.getObject).toHaveBeenCalledWith({
      key: "bundles/proj_123/inc_123/bundle.json.gz"
    });
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
    expect(typeof deps.weeklyReportManagement.listWeeklyReportChannelsForOrganization).toBe(
      "function"
    );
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

  it("should reserve and enqueue manual AnalyticsBundle generations through default dependencies", async (): Promise<void> => {
    const generation = {
      generation_id: "00000000-0000-4000-8000-000000000222",
      project_id: "00000000-0000-0000-0000-000000000001",
      opportunity_id: null,
      requested_by_user_id: "usr_123",
      analysis_kind: "funnel_dropoff",
      analysis_spec: { from: "2026-03-01T00:00:00.000Z", to: "2026-03-08T00:00:00.000Z" },
      input_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      status: "pending",
      object_key: null,
      failure_reason: null,
      created_at: "2026-03-08T00:00:00.000Z",
      claimed_at: null,
      completed_at: null,
      updated_at: "2026-03-08T00:00:00.000Z"
    } as const;
    const reserveAnalyticsBundleGeneration = vi.fn().mockResolvedValue(generation);
    createPostgresAnalyticsBundleGenerationStoreMock.mockReturnValue({
      listAnalyticsBundleGenerationsForProject: vi.fn(),
      reserveAnalyticsBundleGeneration,
      getAnalyticsBundleGenerationForProject: vi.fn()
    });
    const queue = { enqueue: vi.fn() };
    const deps = createApiDependencies({
      objectStore: {
        putObject: vi.fn(),
        getObject: vi.fn(),
        deleteObjectsByPrefix: vi.fn()
      },
      queue,
      db: { query: vi.fn() }
    });

    await expect(
      deps.analyticsBundles.requestAnalyticsBundleGenerationForProject({
        organization_id: "org_123",
        project_id: generation.project_id,
        requested_by_user_id: "usr_123",
        analysis_kind: "funnel_dropoff",
        analysis_spec: generation.analysis_spec
      })
    ).resolves.toEqual(generation);

    expect(reserveAnalyticsBundleGeneration).toHaveBeenCalledWith({
      project_id: generation.project_id,
      opportunity_id: null,
      requested_by_user_id: "usr_123",
      analysis_kind: "funnel_dropoff",
      analysis_spec: generation.analysis_spec
    });
    expect(queue.enqueue).toHaveBeenCalledWith("build-analytics-bundle", {
      project_id: generation.project_id,
      generation_id: generation.generation_id,
      requested_at: expect.any(String),
      trigger: "manual"
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
    const availabilityCheckStore = createPostgresAvailabilityCheckStoreMock.mock.results[0]
      ?.value as {
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
