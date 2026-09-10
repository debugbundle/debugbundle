import { vi } from "vitest";
import { STORAGE_SCHEMA_MIGRATIONS } from "../../packages/storage/src/schema-migrations.js";

export const TEST_GITHUB_PRIVATE_KEY = "test-only-github-app-private-key-not-used";

const { redisPingMock, redisQuitMock, s3SendMock } = vi.hoisted(() => ({
  redisPingMock: vi.fn().mockResolvedValue("PONG"),
  redisQuitMock: vi.fn().mockResolvedValue("OK"),
  s3SendMock: vi.fn().mockResolvedValue({})
}));

const {
  emailTransportSendMock,
  poolQueryMock,
  poolEndMock,
  queueEnqueueMock,
  queueClaimMock,
  queueAcquireLeaseMock,
  queueCloseMock,
  redisFactoryMock,
  s3FactoryMock,
  processNextNormalizeEventsJobMock,
  processNextAggregateAnalyticsEventsJobMock,
  processNextGroupIncidentJobMock,
  processNextBuildBundleJobMock,
  processNextBuildAnalyticsBundleJobMock,
  processNextBuildReproductionJobMock,
  processNextEvaluateAlertsJobMock,
  processNextDeliverAlertEmailDigestJobMock,
  processNextDeliverOperationalEmailJobMock,
  processNextCleanupRetentionJobMock,
  processNextDeliverWebhookJobMock,
  processNextDeliverGitHubDispatchJobMock,
  processNextGenerateWeeklyReportJobMock,
  frequencyCounterCloseMock,
  requestAnomalyCounterCloseMock,
  createPostgresAccountAnalyticsStoreMock,
  createPostgresAnalyticsRollupStoreMock,
  createPostgresAnalyticsMetricsStoreMock,
  createPostgresAnalyticsBundleGenerationStoreMock,
  createPostgresBillingStoreMock,
  createPostgresMetadataStoreMock,
  createPostgresImprovementOpportunityStoreMock,
  createPostgresRetentionStoreMock,
  createRetentionCleanupServiceMock,
  createPostgresWebhookDeliveryStoreMock,
  createPostgresGitHubStoreMock,
  createPostgresAlertDeliveryStoreMock,
  createPostgresOperationalEmailDeliveryStoreMock,
  createPostgresSlackDestinationStoreMock,
  createPostgresWeeklyReportDeliveryStoreMock,
  createPostgresWeeklyReportChannelStoreMock,
  registerWorkerDogfoodingMock,
  captureWorkerDogfoodingStepFailureMock
} = vi.hoisted(() => ({
  emailTransportSendMock: vi.fn().mockResolvedValue(undefined),
  poolQueryMock: vi.fn(),
  poolEndMock: vi.fn().mockResolvedValue(undefined),
  queueEnqueueMock: vi.fn().mockResolvedValue(undefined),
  queueClaimMock: vi.fn().mockResolvedValue(null),
  queueAcquireLeaseMock: vi.fn().mockResolvedValue(true),
  queueCloseMock: vi.fn().mockResolvedValue(undefined),
  redisFactoryMock: vi.fn(),
  s3FactoryMock: vi.fn(),
  processNextNormalizeEventsJobMock: vi.fn(),
  processNextAggregateAnalyticsEventsJobMock: vi.fn(),
  processNextGroupIncidentJobMock: vi.fn(),
  processNextBuildBundleJobMock: vi.fn(),
  processNextBuildAnalyticsBundleJobMock: vi.fn(),
  processNextBuildReproductionJobMock: vi.fn(),
  processNextEvaluateAlertsJobMock: vi.fn(),
  processNextDeliverAlertEmailDigestJobMock: vi.fn(),
  processNextDeliverOperationalEmailJobMock: vi.fn(),
  processNextCleanupRetentionJobMock: vi.fn(),
  processNextDeliverWebhookJobMock: vi.fn(),
  processNextDeliverGitHubDispatchJobMock: vi.fn(),
  processNextGenerateWeeklyReportJobMock: vi.fn(),
  frequencyCounterCloseMock: vi.fn().mockResolvedValue(undefined),
  requestAnomalyCounterCloseMock: vi.fn().mockResolvedValue(undefined),
  createPostgresAccountAnalyticsStoreMock: vi.fn().mockReturnValue({
    recordMetricDeltas: vi.fn().mockResolvedValue("recorded")
  }),
  createPostgresAnalyticsRollupStoreMock: vi.fn().mockReturnValue({
    recordAnalyticsEvent: vi.fn().mockResolvedValue({ recorded: true })
  }),
  createPostgresAnalyticsMetricsStoreMock: vi.fn().mockReturnValue({
    getIncidentImpact: vi.fn(),
    getUsageSummary: vi.fn(),
    getRouteMetrics: vi.fn(),
    getJourneyPatterns: vi.fn(),
    getDeviceBreakdown: vi.fn(),
    getReferrerMetrics: vi.fn(),
    getActionMetrics: vi.fn(),
    listFunnels: vi.fn(),
    getFunnelAnalysis: vi.fn()
  }),
  createPostgresAnalyticsBundleGenerationStoreMock: vi.fn().mockReturnValue({
    reserveAnalyticsBundleGeneration: vi.fn(),
    listAnalyticsBundleGenerationsForProject: vi.fn(),
    getAnalyticsBundleGenerationForProject: vi.fn(),
    claimAnalyticsBundleGenerationForProject: vi.fn(),
    claimPendingAnalyticsBundleGeneration: vi.fn(),
    markAnalyticsBundleGenerationCompleted: vi.fn(),
    markAnalyticsBundleGenerationFailed: vi.fn()
  }),
  createPostgresBillingStoreMock: vi.fn().mockReturnValue({
    getBillingSummaryForProject: vi.fn().mockResolvedValue(null)
  }),
  createPostgresMetadataStoreMock: vi.fn().mockReturnValue({
    upsertIncident: vi.fn(),
    insertIncidentEvent: vi.fn(),
    markIncidentSpiking: vi.fn(),
    listProjectsWithWeeklyActivity: vi.fn().mockResolvedValue([]),
    getWeeklyProjectReport: vi.fn().mockResolvedValue(null)
  }),
  createPostgresImprovementOpportunityStoreMock: vi.fn().mockReturnValue({
    getImprovementExecutionSettings: vi.fn().mockResolvedValue(null),
    listImprovementsForOrganization: vi.fn(),
    getImprovementForOrganization: vi.fn(),
    resolveImprovementForOrganization: vi.fn(),
    reopenImprovementForOrganization: vi.fn(),
    recordWarningHotspot: vi.fn(),
    recordRequestPattern: vi.fn(),
    getImprovementBundleBuildContext: vi.fn(),
    listImprovementEventReferences: vi.fn(),
    hasImprovementBundleGenerationForSourceEvent: vi.fn(),
    reserveImprovementBundleGeneration: vi.fn(),
    markImprovementBundleGenerationFailure: vi.fn(),
    pruneRetainedBundleOwnersForProject: vi.fn().mockResolvedValue([])
  }),
  createPostgresRetentionStoreMock: vi.fn().mockReturnValue({
    listExpiredSampledRawEvents: vi.fn().mockResolvedValue([]),
    markRawEventsExpired: vi.fn().mockResolvedValue(undefined)
  }),
  createRetentionCleanupServiceMock: vi.fn().mockReturnValue({
    runCleanup: vi.fn().mockResolvedValue(undefined)
  }),
  createPostgresWebhookDeliveryStoreMock: vi.fn().mockReturnValue({
    listMatchingWebhooks: vi.fn().mockResolvedValue([]),
    createDeliveryIntent: vi.fn(),
    claimDueDeliveries: vi.fn().mockResolvedValue([]),
    getDeliveryIntent: vi.fn(),
    markDeliveryAttempt: vi.fn()
  }),
  createPostgresGitHubStoreMock: vi.fn().mockReturnValue({
    listMatchingGitHubDispatchRules: vi.fn().mockResolvedValue([]),
    hasRecentGitHubDispatch: vi.fn().mockResolvedValue(false),
    countProjectGitHubDispatchesSince: vi.fn().mockResolvedValue(0),
    countInstallationGitHubDispatchesSince: vi.fn().mockResolvedValue(0),
    createGitHubDispatchDeliveryIntent: vi.fn(),
    createSkippedGitHubDispatchDelivery: vi.fn(),
    claimDueGitHubDispatchDeliveries: vi.fn().mockResolvedValue([]),
    getGitHubDispatchDeliveryIntent: vi.fn().mockResolvedValue(null),
    markGitHubDispatchDeliveryAttempt: vi.fn()
  }),
  createPostgresAlertDeliveryStoreMock: vi.fn().mockReturnValue({
    listMatchingAlerts: vi.fn().mockResolvedValue([]),
    createAlertDeliveryIntent: vi.fn(),
    markAlertDeliveryResult: vi.fn(),
    queueAlertEmailDigestItem: vi.fn(),
    claimDueAlertEmailDigests: vi.fn().mockResolvedValue([]),
    getAlertEmailDigest: vi.fn().mockResolvedValue(null),
    markAlertEmailDigestResult: vi.fn()
  }),
  createPostgresOperationalEmailDeliveryStoreMock: vi.fn().mockReturnValue({
    queueProjectOperationalEmailDelivery: vi.fn(),
    claimDueOperationalEmailDeliveries: vi.fn().mockResolvedValue([]),
    getOperationalEmailDelivery: vi.fn().mockResolvedValue(null),
    resolveOperationalEmailRecipientContext: vi.fn().mockResolvedValue(null),
    markOperationalEmailDeliveryAttempt: vi.fn()
  }),
  createPostgresSlackDestinationStoreMock: vi.fn().mockReturnValue({
    getSlackDestinationSecretForDelivery: vi.fn().mockResolvedValue(null)
  }),
  createPostgresWeeklyReportDeliveryStoreMock: vi.fn().mockReturnValue({
    claimWeeklyReportDelivery: vi.fn(),
    markWeeklyReportDeliveryResult: vi.fn()
  }),
  createPostgresWeeklyReportChannelStoreMock: vi.fn().mockReturnValue({
    listEnabledWeeklyReportChannels: vi.fn().mockResolvedValue([]),
    getWeeklyReportChannelById: vi.fn().mockResolvedValue(null),
    listWeeklyReportChannelsForOrganization: vi.fn().mockResolvedValue([]),
    createWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null),
    updateWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null),
    deleteWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null)
  }),
  registerWorkerDogfoodingMock: vi.fn().mockReturnValue(null),
  captureWorkerDogfoodingStepFailureMock: vi.fn()
}));

vi.mock("../../apps/worker/src/dogfooding.js", () => ({
  registerWorkerDogfooding: registerWorkerDogfoodingMock,
  captureWorkerDogfoodingStepFailure: captureWorkerDogfoodingStepFailureMock
}));

vi.mock("../../packages/email/src/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../packages/email/src/index.js")>();

  return {
    ...actual,
    createSesEmailTransport: vi.fn().mockReturnValue({
      send: emailTransportSendMock
    })
  };
});

vi.mock("pg", () => ({
  Pool: vi.fn(function MockPool() {
    return {
      query: poolQueryMock,
      end: poolEndMock
    };
  })
}));

vi.mock("ioredis", () => ({
  Redis: vi.fn(function MockRedis() {
    return {
      ping: redisPingMock,
      quit: redisQuitMock,
      get: vi.fn(),
      set: vi.fn()
    };
  })
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(function MockS3Client() {
    return {
      send: s3SendMock,
      destroy: vi.fn()
    };
  }),
  HeadBucketCommand: class {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }
}));

vi.mock("../../packages/storage/src/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../packages/storage/src/index.js")>();

  return {
    ...actual,
    createRedisQueueClient: vi.fn().mockImplementation((input: unknown) => {
      redisFactoryMock(input);
      return {
        enqueue: queueEnqueueMock,
        claim: queueClaimMock,
        acquireLease: queueAcquireLeaseMock,
        dequeue: vi.fn(),
        close: queueCloseMock
      };
    }),
    createS3ObjectStoreClient: vi.fn().mockImplementation((input: unknown) => {
      s3FactoryMock(input);
      return {
        getObject: vi.fn(),
        deleteObjectsByPrefix: vi.fn()
      };
    }),
    createRedisIncidentFrequencyCounter: vi.fn().mockReturnValue({
      recordOccurrence: vi.fn(),
      close: frequencyCounterCloseMock
    }),
    createRedisRequestAnomalyCounter: vi.fn().mockReturnValue({
      recordObservation: vi.fn(),
      close: requestAnomalyCounterCloseMock
    }),
    createPostgresAccountAnalyticsStore: createPostgresAccountAnalyticsStoreMock,
    createPostgresAnalyticsRollupStore: createPostgresAnalyticsRollupStoreMock,
    createPostgresAnalyticsMetricsStore: createPostgresAnalyticsMetricsStoreMock,
    createPostgresAnalyticsBundleGenerationStore: createPostgresAnalyticsBundleGenerationStoreMock,
    createPostgresBillingStore: createPostgresBillingStoreMock,
    createPostgresMetadataStore: createPostgresMetadataStoreMock,
    createPostgresImprovementOpportunityStore: createPostgresImprovementOpportunityStoreMock,
    createPostgresRetentionStore: createPostgresRetentionStoreMock,
    createRetentionCleanupService: createRetentionCleanupServiceMock,
    createPostgresWebhookDeliveryStore: createPostgresWebhookDeliveryStoreMock,
    createPostgresGitHubStore: createPostgresGitHubStoreMock,
    createPostgresAlertDeliveryStore: createPostgresAlertDeliveryStoreMock,
    createPostgresOperationalEmailDeliveryStore: createPostgresOperationalEmailDeliveryStoreMock,
    createPostgresSlackDestinationStore: createPostgresSlackDestinationStoreMock,
    createPostgresWeeklyReportDeliveryStore: createPostgresWeeklyReportDeliveryStoreMock,
    createPostgresWeeklyReportChannelStore: createPostgresWeeklyReportChannelStoreMock
  };
});

vi.mock("../../packages/storage/src/migrations.js", () => ({
  REQUIRED_WORKER_TABLES: [
    "processed_events",
    "organizations",
    "projects",
    "services",
    "deployments",
    "improvement_opportunities",
    "improvement_opportunity_events",
    "bundle_generations",
    "incidents",
    "incident_events",
    "alert_rules",
    "alert_deliveries",
    "alert_email_digests",
    "alert_email_digest_items",
    "agent_webhooks",
    "webhook_deliveries",
    "weekly_report_deliveries",
    "account_analytics_accounts",
    "account_metric_periods",
    "account_metric_events",
    "project_analytics_settings",
    "analytics_ingestion_ledger",
    "analytics_rollup_uniques",
    "analytics_session_rollups",
    "analytics_route_rollups",
    "analytics_action_rollups",
    "analytics_funnel_definitions",
    "analytics_funnel_rollups",
    "analytics_transition_rollups",
    "analytics_journey_samples",
    "analytics_opportunities",
    "analytics_bundle_generations",
    "analytics_incident_correlations",
    "analytics_incident_session_links"
  ]
}));

vi.mock("../../apps/worker/src/processor.js", () => ({
  processNextNormalizeEventsJob: processNextNormalizeEventsJobMock,
  processNextGroupIncidentJob: processNextGroupIncidentJobMock,
  processNextBuildBundleJob: processNextBuildBundleJobMock,
  processNextBuildReproductionJob: processNextBuildReproductionJobMock,
  processNextEvaluateAlertsJob: processNextEvaluateAlertsJobMock,
  processNextDeliverAlertEmailDigestJob: processNextDeliverAlertEmailDigestJobMock,
  processNextDeliverOperationalEmailJob: processNextDeliverOperationalEmailJobMock,
  processNextCleanupRetentionJob: processNextCleanupRetentionJobMock,
  processNextDeliverWebhookJob: processNextDeliverWebhookJobMock,
  processNextDeliverGitHubDispatchJob: processNextDeliverGitHubDispatchJobMock,
  processNextGenerateWeeklyReportJob: processNextGenerateWeeklyReportJobMock,
  AlertDeliveryError: class AlertDeliveryError extends Error {},
  GitHubDispatchDeliveryError: class GitHubDispatchDeliveryError extends Error {
    statusCode: number | null;
    retryAfterSeconds: number | null;

    constructor(
      message: string,
      statusCode: number | null = null,
      retryAfterSeconds: number | null = null
    ) {
      super(message);
      this.statusCode = statusCode;
      this.retryAfterSeconds = retryAfterSeconds;
    }
  },
  LifecycleWebhookDeliveryError: class LifecycleWebhookDeliveryError extends Error {
    responseCode: number | null;

    constructor(message: string, responseCode: number | null = null) {
      super(message);
      this.responseCode = responseCode;
    }
  }
}));

vi.mock("../../apps/worker/src/analytics-aggregation.js", () => ({
  processNextAggregateAnalyticsEventsJob: processNextAggregateAnalyticsEventsJobMock
}));

vi.mock("../../apps/worker/src/analytics-bundle-processor.js", () => ({
  processNextBuildAnalyticsBundleJob: processNextBuildAnalyticsBundleJobMock
}));

export const WORKER_TABLE_ROWS = [
  { table_name: "processed_events" },
  { table_name: "organizations" },
  { table_name: "projects" },
  { table_name: "services" },
  { table_name: "deployments" },
  { table_name: "improvement_opportunities" },
  { table_name: "improvement_opportunity_events" },
  { table_name: "bundle_generations" },
  { table_name: "incidents" },
  { table_name: "incident_events" },
  { table_name: "alert_rules" },
  { table_name: "alert_deliveries" },
  { table_name: "alert_email_digests" },
  { table_name: "alert_email_digest_items" },
  { table_name: "agent_webhooks" },
  { table_name: "webhook_deliveries" },
  { table_name: "weekly_report_deliveries" },
  { table_name: "account_analytics_accounts" },
  { table_name: "account_metric_periods" },
  { table_name: "account_metric_events" },
  { table_name: "project_analytics_settings" },
  { table_name: "analytics_ingestion_ledger" },
  { table_name: "analytics_rollup_uniques" },
  { table_name: "analytics_session_rollups" },
  { table_name: "analytics_route_rollups" },
  { table_name: "analytics_action_rollups" },
  { table_name: "analytics_funnel_definitions" },
  { table_name: "analytics_funnel_rollups" },
  { table_name: "analytics_transition_rollups" },
  { table_name: "analytics_journey_samples" },
  { table_name: "analytics_opportunities" },
  { table_name: "analytics_bundle_generations" },
  { table_name: "analytics_incident_correlations" },
  { table_name: "analytics_incident_session_links" }
];

export function buildMigratedWorkerSchemaRows(sql: string): { rows: Record<string, unknown>[] } {
  if (sql.includes("information_schema.tables")) {
    return { rows: WORKER_TABLE_ROWS };
  }

  if (sql.includes("to_regclass")) {
    return { rows: [{ relation_name: "storage_migration_ledger" }] };
  }

  if (sql.includes("storage_migration_ledger")) {
    return {
      rows: STORAGE_SCHEMA_MIGRATIONS.map((migration) => ({
        id: migration.id,
        checksum: migration.checksum
      }))
    };
  }

  return { rows: [] };
}

export function resetWorkerRuntimeMocks(): void {
  vi.unstubAllGlobals();
  poolQueryMock.mockReset();
  emailTransportSendMock.mockClear();
  poolEndMock.mockClear();
  queueEnqueueMock.mockClear();
  queueClaimMock.mockReset();
  queueClaimMock.mockResolvedValue(null);
  queueAcquireLeaseMock.mockClear();
  queueAcquireLeaseMock.mockResolvedValue(true);
  queueCloseMock.mockClear();
  redisFactoryMock.mockReset();
  s3FactoryMock.mockReset();
  processNextNormalizeEventsJobMock.mockReset();
  processNextAggregateAnalyticsEventsJobMock.mockReset();
  processNextGroupIncidentJobMock.mockReset();
  processNextBuildBundleJobMock.mockReset();
  processNextBuildAnalyticsBundleJobMock.mockReset();
  processNextBuildReproductionJobMock.mockReset();
  processNextEvaluateAlertsJobMock.mockReset();
  processNextDeliverAlertEmailDigestJobMock.mockReset();
  processNextDeliverOperationalEmailJobMock.mockReset();
  processNextCleanupRetentionJobMock.mockReset();
  processNextDeliverWebhookJobMock.mockReset();
  processNextDeliverGitHubDispatchJobMock.mockReset();
  processNextGenerateWeeklyReportJobMock.mockReset();
  processNextNormalizeEventsJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
  processNextAggregateAnalyticsEventsJobMock.mockResolvedValue({
    processed: false,
    reason: "no_jobs"
  });
  processNextGroupIncidentJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
  processNextBuildBundleJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
  processNextBuildAnalyticsBundleJobMock.mockResolvedValue({
    processed: false,
    reason: "no_jobs"
  });
  processNextBuildReproductionJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
  processNextEvaluateAlertsJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
  processNextDeliverAlertEmailDigestJobMock.mockResolvedValue({
    processed: false,
    reason: "no_jobs"
  });
  processNextDeliverOperationalEmailJobMock.mockResolvedValue({
    processed: false,
    reason: "no_jobs"
  });
  processNextDeliverWebhookJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
  processNextDeliverGitHubDispatchJobMock.mockResolvedValue({
    processed: false,
    reason: "no_jobs"
  });
  processNextGenerateWeeklyReportJobMock.mockResolvedValue({
    processed: false,
    reason: "no_jobs"
  });
  processNextCleanupRetentionJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
  frequencyCounterCloseMock.mockClear();
  requestAnomalyCounterCloseMock.mockClear();
  createPostgresAccountAnalyticsStoreMock.mockClear();
  createPostgresAnalyticsRollupStoreMock.mockClear();
  createPostgresAnalyticsMetricsStoreMock.mockClear();
  createPostgresAnalyticsBundleGenerationStoreMock.mockClear();
  createPostgresBillingStoreMock.mockClear();
  createPostgresMetadataStoreMock.mockClear();
  createPostgresImprovementOpportunityStoreMock.mockClear();
  createPostgresRetentionStoreMock.mockClear();
  createRetentionCleanupServiceMock.mockClear();
  createPostgresWebhookDeliveryStoreMock.mockClear();
  createPostgresGitHubStoreMock.mockClear();
  createPostgresAlertDeliveryStoreMock.mockClear();
  createPostgresOperationalEmailDeliveryStoreMock.mockClear();
  createPostgresSlackDestinationStoreMock.mockClear();
  createPostgresWeeklyReportDeliveryStoreMock.mockClear();
  createPostgresWeeklyReportChannelStoreMock.mockClear();
  registerWorkerDogfoodingMock.mockReset();
  registerWorkerDogfoodingMock.mockReturnValue(null);
  captureWorkerDogfoodingStepFailureMock.mockReset();
  redisPingMock.mockReset();
  redisPingMock.mockResolvedValue("PONG");
  redisQuitMock.mockClear();
  s3SendMock.mockReset();
  s3SendMock.mockResolvedValue({});
  poolQueryMock.mockImplementation(async (sql: string) => buildMigratedWorkerSchemaRows(sql));
}

export {
  redisPingMock,
  redisQuitMock,
  s3SendMock,
  emailTransportSendMock,
  poolQueryMock,
  poolEndMock,
  queueEnqueueMock,
  queueClaimMock,
  queueAcquireLeaseMock,
  queueCloseMock,
  redisFactoryMock,
  s3FactoryMock,
  processNextNormalizeEventsJobMock,
  processNextAggregateAnalyticsEventsJobMock,
  processNextGroupIncidentJobMock,
  processNextBuildBundleJobMock,
  processNextBuildAnalyticsBundleJobMock,
  processNextBuildReproductionJobMock,
  processNextEvaluateAlertsJobMock,
  processNextDeliverAlertEmailDigestJobMock,
  processNextDeliverOperationalEmailJobMock,
  processNextCleanupRetentionJobMock,
  processNextDeliverWebhookJobMock,
  processNextDeliverGitHubDispatchJobMock,
  processNextGenerateWeeklyReportJobMock,
  frequencyCounterCloseMock,
  requestAnomalyCounterCloseMock,
  createPostgresAccountAnalyticsStoreMock,
  createPostgresAnalyticsRollupStoreMock,
  createPostgresAnalyticsMetricsStoreMock,
  createPostgresAnalyticsBundleGenerationStoreMock,
  createPostgresBillingStoreMock,
  createPostgresMetadataStoreMock,
  createPostgresImprovementOpportunityStoreMock,
  createPostgresRetentionStoreMock,
  createRetentionCleanupServiceMock,
  createPostgresWebhookDeliveryStoreMock,
  createPostgresGitHubStoreMock,
  createPostgresAlertDeliveryStoreMock,
  createPostgresOperationalEmailDeliveryStoreMock,
  createPostgresSlackDestinationStoreMock,
  createPostgresWeeklyReportDeliveryStoreMock,
  createPostgresWeeklyReportChannelStoreMock,
  registerWorkerDogfoodingMock,
  captureWorkerDogfoodingStepFailureMock
};
