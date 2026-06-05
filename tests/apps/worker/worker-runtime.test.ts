import { generateKeyPairSync } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptIntegrationSecret } from "../../../packages/storage/src/index.ts";

const TEST_GITHUB_PRIVATE_KEY = "test-only-github-app-private-key-not-used";

const {
  redisPingMock,
  redisQuitMock,
  s3SendMock
} = vi.hoisted(() => ({
  redisPingMock: vi.fn().mockResolvedValue("PONG"),
  redisQuitMock: vi.fn().mockResolvedValue("OK"),
  s3SendMock: vi.fn().mockResolvedValue({})
}));

const {
  emailTransportSendMock,
  poolQueryMock,
  poolEndMock,
  queueEnqueueMock,
  queueAcquireLeaseMock,
  queueCloseMock,
  redisFactoryMock,
  s3FactoryMock,
  processNextNormalizeEventsJobMock,
  processNextGroupIncidentJobMock,
  processNextBuildBundleJobMock,
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
  queueAcquireLeaseMock: vi.fn().mockResolvedValue(true),
  queueCloseMock: vi.fn().mockResolvedValue(undefined),
  redisFactoryMock: vi.fn(),
  s3FactoryMock: vi.fn(),
  processNextNormalizeEventsJobMock: vi.fn(),
  processNextGroupIncidentJobMock: vi.fn(),
  processNextBuildBundleJobMock: vi.fn(),
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

vi.mock("../../../apps/worker/src/dogfooding.js", () => ({
  registerWorkerDogfooding: registerWorkerDogfoodingMock,
  captureWorkerDogfoodingStepFailure: captureWorkerDogfoodingStepFailureMock
}));

vi.mock("../../../packages/email/src/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/email/src/index.js")>();

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
      send: s3SendMock
    };
  }),
  HeadBucketCommand: class {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }
}));

vi.mock("../../../packages/storage/src/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/storage/src/index.js")>();

  return {
  ...actual,
  createRedisQueueClient: vi.fn().mockImplementation((input: unknown) => {
    redisFactoryMock(input);
    return {
      enqueue: queueEnqueueMock,
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
}});

vi.mock("../../../packages/storage/src/migrations.js", () => ({
  REQUIRED_WORKER_TABLES: [
    "processed_events",
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
    "weekly_report_deliveries"
  ]
}));

vi.mock("../../../apps/worker/src/processor.js", () => ({
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

    constructor(message: string, statusCode: number | null = null, retryAfterSeconds: number | null = null) {
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

import {
  assertWorkerSchema,
  buildGitHubAppJwt,
  createAlertTransport,
  createGitHubDispatchPublisher,
  createGitHubDispatchTransport,
  createLifecycleWebhookTransport,
  createLifecycleWebhookPublisher,
  createWorkerHealthServer,
  createWorkerShutdownState,
  createWeeklyReportTransport,
  encodeBase64Url,
  getIncidentStatusForDispatchEvent,
  normalizeGitHubPrivateKey,
  scheduleDueGitHubDispatches,
  scheduleDueAlertEmailDigests,
  scheduleDueWebhookDeliveries,
  scheduleRetentionCleanup,
  scheduleWeeklyReports,
  createProcessedEventStore,
  parseWorkerEnv,
  resolveWorkerEmailAssetBaseUrl,
  runWorkerFromEnv
} from "../../../apps/worker/src/runtime.js";
import { STORAGE_SCHEMA_MIGRATIONS } from "../../../packages/storage/src/schema-migrations.js";

const WORKER_TABLE_ROWS = [
  { table_name: "processed_events" },
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
  { table_name: "weekly_report_deliveries" }
];

function buildMigratedWorkerSchemaRows(sql: string): { rows: Record<string, unknown>[] } {
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

describe("worker runtime", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    poolQueryMock.mockReset();
    emailTransportSendMock.mockClear();
    poolEndMock.mockClear();
    queueEnqueueMock.mockClear();
    queueAcquireLeaseMock.mockClear();
    queueAcquireLeaseMock.mockResolvedValue(true);
    queueCloseMock.mockClear();
    redisFactoryMock.mockReset();
    s3FactoryMock.mockReset();
    processNextNormalizeEventsJobMock.mockReset();
    processNextGroupIncidentJobMock.mockReset();
    processNextBuildBundleJobMock.mockReset();
    processNextBuildReproductionJobMock.mockReset();
    processNextEvaluateAlertsJobMock.mockReset();
    processNextDeliverAlertEmailDigestJobMock.mockReset();
    processNextDeliverOperationalEmailJobMock.mockReset();
    processNextCleanupRetentionJobMock.mockReset();
    processNextDeliverWebhookJobMock.mockReset();
    processNextDeliverGitHubDispatchJobMock.mockReset();
    processNextGenerateWeeklyReportJobMock.mockReset();
    processNextNormalizeEventsJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
    processNextGroupIncidentJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
    processNextBuildBundleJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
    processNextBuildReproductionJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
    processNextEvaluateAlertsJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
    processNextDeliverAlertEmailDigestJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
    processNextDeliverOperationalEmailJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
    processNextDeliverWebhookJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
    processNextDeliverGitHubDispatchJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
    processNextGenerateWeeklyReportJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
    processNextCleanupRetentionJobMock.mockResolvedValue({ processed: false, reason: "no_jobs" });
    frequencyCounterCloseMock.mockClear();
    requestAnomalyCounterCloseMock.mockClear();
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
  });

  it("should parse worker env with defaults", (): void => {
    const env = parseWorkerEnv({});

    expect(env.DB_HOST).toBe("localhost");
    expect(env.DB_SSL_MODE).toBe("disable");
    expect(env.WORKER_POLL_INTERVAL_MS).toBe(1000);
    expect(env.RETENTION_CLEANUP_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
  });

  it("registers worker dogfooding during startup", async (): Promise<void> => {
    await runWorkerFromEnv({ WORKER_RUN_ONCE: "1" });

    expect(registerWorkerDogfoodingMock).toHaveBeenCalledWith({ WORKER_RUN_ONCE: "1" });
  });

  it("should parse require DB SSL mode", (): void => {
    const env = parseWorkerEnv({ DB_SSL_MODE: "require" });

    expect(env.DB_SSL_MODE).toBe("require");
  });

  it("should prefer the app origin over the public site for worker email brand assets when no explicit override is set", (): void => {
    const assetBaseUrl = resolveWorkerEmailAssetBaseUrl({
      APP_BASE_URL: "https://app.debugbundle.test",
      PUBLIC_SITE_URL: "https://debugbundle.test"
    });

    expect(assetBaseUrl).toBe("https://app.debugbundle.test");
  });

  it("should throw clear error for invalid poll interval", (): void => {
    expect(() => parseWorkerEnv({ WORKER_POLL_INTERVAL_MS: "5" })).toThrow("worker_env_invalid");
  });

  it("should reject retention cleanup intervals longer than 24 hours", (): void => {
    expect(() => parseWorkerEnv({ RETENTION_CLEANUP_INTERVAL_MS: String(24 * 60 * 60 * 1000 + 1) })).toThrow(
      "worker_env_invalid"
    );
  });

  it("should reject invalid run-once env values", (): void => {
    expect(() => parseWorkerEnv({ WORKER_RUN_ONCE: "2" })).toThrow("worker_env_invalid");
  });

  it("should reject invalid DB SSL mode values with a targeted error", (): void => {
    expect(() => parseWorkerEnv({ DB_SSL_MODE: "broken" })).toThrow(
      "worker_env_invalid: DB_SSL_MODE: expected disable or require"
    );
  });

  it("should treat empty optional GitHub app env vars as unset", (): void => {
    const env = parseWorkerEnv({
      GITHUB_APP_ID: "",
      GITHUB_APP_PRIVATE_KEY: ""
    });

    expect(env.GITHUB_APP_ID).toBeUndefined();
    expect(env.GITHUB_APP_PRIVATE_KEY).toBeUndefined();
  });

  it("should pass schema guard when processed_events table exists", async (): Promise<void> => {
    const db = {
      query: vi.fn().mockImplementation(async (sql: string) => buildMigratedWorkerSchemaRows(sql))
    };

    await expect(assertWorkerSchema(db)).resolves.toBeUndefined();
  });

  it("should fail schema guard with missing processed_events table", async (): Promise<void> => {
    const db = {
      query: vi.fn().mockResolvedValue({ rows: [] })
    };

    await expect(assertWorkerSchema(db)).rejects.toThrow("worker_schema_missing_tables");
  });

  it("should upsert processed event metadata", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createProcessedEventStore({ query });

    await store.upsertProcessedEvent({
      event_id: "evt_123",
      project_id: "proj_123",
      event_type: "backend_exception",
      fingerprint: "fp_123",
      normalized_message: "boom"
    });

    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO processed_events"), [
      "evt_123",
      "proj_123",
      "backend_exception",
      "fp_123",
      "boom"
    ]);
  });

  it("should run one worker iteration and close resources", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { table_name: "processed_events" },
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
        { table_name: "weekly_report_deliveries" }
      ]
    });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({ processed: true });

    await runWorkerFromEnv({ WORKER_RUN_ONCE: "1" });

    expect(redisPingMock).toHaveBeenCalledOnce();
    expect(redisQuitMock).toHaveBeenCalledOnce();
    expect(s3SendMock).toHaveBeenCalledOnce();
    expect(redisFactoryMock).toHaveBeenCalledWith({ redisUrl: "redis://localhost:6379" });
    expect(s3FactoryMock).toHaveBeenCalledWith({
      endpoint: "http://localhost:4566",
      region: "us-east-1",
      bucket: "debugbundle-raw-events",
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });
    expect(processNextNormalizeEventsJobMock).toHaveBeenCalledOnce();
    expect(processNextGroupIncidentJobMock).not.toHaveBeenCalled();
    expect(processNextBuildBundleJobMock).not.toHaveBeenCalled();
    expect(processNextBuildReproductionJobMock).not.toHaveBeenCalled();
    expect(processNextDeliverWebhookJobMock).not.toHaveBeenCalled();
    expect(frequencyCounterCloseMock).toHaveBeenCalledOnce();
    expect(requestAnomalyCounterCloseMock).toHaveBeenCalledOnce();
    expect(queueCloseMock).toHaveBeenCalledOnce();
    expect(poolEndMock).toHaveBeenCalledTimes(2);
  });

  it("should fail worker startup when redis preflight fails", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { table_name: "processed_events" },
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
        { table_name: "weekly_report_deliveries" }
      ]
    });
    redisPingMock.mockResolvedValueOnce("NOPE");

    await expect(runWorkerFromEnv({ WORKER_RUN_ONCE: "1" })).rejects.toThrow("worker_redis_not_ready");
    expect(queueEnqueueMock).not.toHaveBeenCalled();
  });

  it("should wrap redis connectivity failures as worker_redis_unreachable", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { table_name: "processed_events" },
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
        { table_name: "weekly_report_deliveries" }
      ]
    });
    redisPingMock.mockRejectedValueOnce(new Error("redis_down"));

    await expect(runWorkerFromEnv({ WORKER_RUN_ONCE: "1" })).rejects.toThrow("worker_redis_unreachable: redis_down");
    expect(queueEnqueueMock).not.toHaveBeenCalled();
  });

  it("should wrap s3 preflight failures as worker_s3_bucket_unreachable", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { table_name: "processed_events" },
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
        { table_name: "weekly_report_deliveries" }
      ]
    });
    s3SendMock.mockRejectedValueOnce(new Error("bucket_missing"));

    await expect(runWorkerFromEnv({ WORKER_RUN_ONCE: "1" })).rejects.toThrow("worker_s3_bucket_unreachable: bucket_missing");
    expect(queueEnqueueMock).not.toHaveBeenCalled();
  });

  it("should initialize and close the github token cache when github app credentials are configured", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { table_name: "processed_events" },
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
        { table_name: "weekly_report_deliveries" }
      ]
    });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextGroupIncidentJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildBundleJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildReproductionJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextEvaluateAlertsJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextDeliverWebhookJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextDeliverGitHubDispatchJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });

    await runWorkerFromEnv({
      WORKER_RUN_ONCE: "1",
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: "test-private-key"
    });

    expect(redisQuitMock).toHaveBeenCalledTimes(2);
  });

  it("should normalize escaped github app private keys before requesting installation tokens", async (): Promise<void> => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ token: "ghs_test" })
    });
    const createAppJwt = vi.fn().mockReturnValue("jwt_escaped");

    const transport = createGitHubDispatchTransport({
      appId: "123",
      privateKey: "-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY-----",
      tokenCache: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined)
      },
      fetchImpl: fetchMock,
      now: () => new Date("2026-03-11T00:00:00.000Z"),
      createAppJwt
    });

    await expect(
      transport.deliver({
        delivery_id: "gdd_escaped",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        dispatch_payload: {
          debugbundle_event: "bundle.created",
          incident_id: "inc_123",
          bundle_type: "failure",
          bundle_version: 3,
          severity: "high",
          service: "checkout-api",
          environment: "production",
          title: "TypeError in checkout",
          links: {
            bundle: "/v1/incidents/inc_123/bundle",
            reproduction: "/v1/incidents/inc_123/reproduction",
            dashboard: "/incidents/inc_123"
          },
          debugbundle: {
            project_id: "proj_123",
            occurrence_count: 12,
            first_seen_at: "2026-03-10T23:00:00.000Z"
          }
        }
      })
    ).resolves.toBeUndefined();

    expect(createAppJwt).toHaveBeenCalledWith(
      "123",
      "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----",
      new Date("2026-03-11T00:00:00.000Z")
    );
  });

  it("should encode github app jwt payloads with base64url segments", (): void => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const now = new Date("2026-03-11T00:00:00.000Z");

    expect(encodeBase64Url("debugbundle")).toBe(Buffer.from("debugbundle", "utf8").toString("base64url"));
    expect(normalizeGitHubPrivateKey(privateKeyPem.replace(/\n/g, "\\n"))).toBe(privateKeyPem);

    const jwt = buildGitHubAppJwt("123", privateKeyPem, now);
    const [encodedHeader, encodedPayload, signature] = jwt.split(".");

    if (encodedHeader === undefined || encodedPayload === undefined || signature === undefined) {
      throw new Error("github_app_jwt_segments_missing");
    }
    expect(signature.length).toBeGreaterThan(0);
    expect(JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"))).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"))).toEqual({
      iat: Math.floor(now.getTime() / 1000) - 30,
      exp: Math.floor(now.getTime() / 1000) + 9 * 60,
      iss: "123"
    });
  });

  it("should reject github dispatch transport responses with missing installation tokens", async (): Promise<void> => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({})
    });

    const transport = createGitHubDispatchTransport({
      appId: "123",
      privateKey: privateKeyPem,
      tokenCache: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined)
      },
      fetchImpl: fetchMock,
      now: () => new Date("2026-03-11T00:00:00.000Z")
    });

    await expect(
      transport.deliver({
        delivery_id: "gdd_missing_token",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        dispatch_payload: {
          debugbundle_event: "bundle.created",
          incident_id: "inc_123",
          debugbundle: {
            project_id: "proj_123"
          }
        }
      })
    ).rejects.toMatchObject({
      message: "github_dispatch_token_invalid_response"
    });
  });

  it("should run group-incident processor when normalize queue has no work", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { table_name: "processed_events" },
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
        { table_name: "weekly_report_deliveries" }
      ]
    });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextGroupIncidentJobMock.mockResolvedValueOnce({ processed: true });

    await runWorkerFromEnv({ WORKER_RUN_ONCE: "1" });

    expect(processNextNormalizeEventsJobMock).toHaveBeenCalledOnce();
    expect(processNextGroupIncidentJobMock).toHaveBeenCalledOnce();
    expect(processNextBuildBundleJobMock).not.toHaveBeenCalled();
    expect(processNextBuildReproductionJobMock).not.toHaveBeenCalled();
    expect(processNextDeliverWebhookJobMock).not.toHaveBeenCalled();
  });

  it("queues the webhook auto-disabled operational email for later delivery", async (): Promise<void> => {
    poolQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM agent_webhooks aw")) {
        return {
          rows: [
            {
              organization_name: "Acme Production",
              project_id: "proj_123",
              project_name: "Checkout API",
              recipient_email: "owner@example.com"
            }
          ]
        };
      }

      return buildMigratedWorkerSchemaRows(sql);
    });

    processNextDeliverWebhookJobMock.mockImplementationOnce(async (input: {
      onWebhookDisabled?: (payload: { webhook_id: string; target_url: string }) => Promise<void>;
    }) => {
      await input.onWebhookDisabled?.({
        webhook_id: "wh_123",
        target_url: "https://hooks.example.test/debugbundle"
      });

      return { processed: true };
    });

    await runWorkerFromEnv({
      WORKER_RUN_ONCE: "1",
      APP_BASE_URL: "https://app.debugbundle.test"
    });

    expect(processNextDeliverWebhookJobMock).toHaveBeenCalledOnce();
    const queuedOperationalEmails = createPostgresOperationalEmailDeliveryStoreMock.mock.results[0]?.value
      .queueProjectOperationalEmailDelivery;
    expect(queuedOperationalEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "proj_123",
        kind: "webhook_auto_disabled",
        payload: {
          webhook_id: "wh_123",
          target_url: "https://hooks.example.test/debugbundle"
        }
      })
    );
    expect(emailTransportSendMock).not.toHaveBeenCalled();
  });

  it("should run build-bundle processor when normalize/group queues are empty", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { table_name: "processed_events" },
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
        { table_name: "weekly_report_deliveries" }
      ]
    });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextGroupIncidentJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildBundleJobMock.mockResolvedValueOnce({ processed: true });

    await runWorkerFromEnv({
      WORKER_RUN_ONCE: "1",
      DEBUGBUNDLE_API_URL: "https://api.debugbundle.test",
      APP_BASE_URL: "https://app.debugbundle.test",
      PUBLIC_SITE_URL: "https://debugbundle.test"
    });

    expect(processNextBuildBundleJobMock).toHaveBeenCalledOnce();
    expect(processNextBuildBundleJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          DEBUGBUNDLE_API_URL: "https://api.debugbundle.test",
          APP_BASE_URL: "https://app.debugbundle.test",
          PUBLIC_SITE_URL: "https://debugbundle.test"
        })
      })
    );
    expect(processNextBuildReproductionJobMock).not.toHaveBeenCalled();
    expect(processNextDeliverWebhookJobMock).not.toHaveBeenCalled();
  });

  it("should run build-reproduction processor when normalize/group/build queues are empty", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { table_name: "processed_events" },
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
        { table_name: "weekly_report_deliveries" }
      ]
    });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextGroupIncidentJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildBundleJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildReproductionJobMock.mockResolvedValueOnce({ processed: true });

    await runWorkerFromEnv({ WORKER_RUN_ONCE: "1" });

    expect(processNextBuildBundleJobMock).toHaveBeenCalledOnce();
    expect(processNextBuildReproductionJobMock).toHaveBeenCalledOnce();
    expect(processNextDeliverWebhookJobMock).not.toHaveBeenCalled();
  });

  it("should run evaluate-alerts processor when normalize/group/build/reproduction queues are empty", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { table_name: "processed_events" },
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
        { table_name: "weekly_report_deliveries" }
      ]
    });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextGroupIncidentJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildBundleJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildReproductionJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextEvaluateAlertsJobMock.mockResolvedValueOnce({ processed: true });

    await runWorkerFromEnv({ WORKER_RUN_ONCE: "1" });

    expect(processNextBuildBundleJobMock).toHaveBeenCalledOnce();
    expect(processNextBuildReproductionJobMock).toHaveBeenCalledOnce();
    expect(processNextEvaluateAlertsJobMock).toHaveBeenCalledOnce();
    expect(processNextDeliverWebhookJobMock).not.toHaveBeenCalled();
  });

  it("should run deliver-webhook processor when normalize/group/build/reproduction queues are empty", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { table_name: "processed_events" },
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
        { table_name: "weekly_report_deliveries" }
      ]
    });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextGroupIncidentJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildBundleJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildReproductionJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextEvaluateAlertsJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextDeliverWebhookJobMock.mockResolvedValueOnce({ processed: true });

    await runWorkerFromEnv({ WORKER_RUN_ONCE: "1" });

    expect(processNextBuildBundleJobMock).toHaveBeenCalledOnce();
    expect(processNextBuildReproductionJobMock).toHaveBeenCalledOnce();
    expect(processNextEvaluateAlertsJobMock).toHaveBeenCalledOnce();
    expect(processNextDeliverWebhookJobMock).toHaveBeenCalledOnce();
    expect(processNextGenerateWeeklyReportJobMock).toHaveBeenCalledOnce();
  });

  it("should run generate-weekly-report processor when other queues are empty", async (): Promise<void> => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T12:00:00.000Z"));
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { table_name: "processed_events" },
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
        { table_name: "weekly_report_deliveries" }
      ]
    });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextGroupIncidentJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildBundleJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildReproductionJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextEvaluateAlertsJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextDeliverWebhookJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextGenerateWeeklyReportJobMock.mockResolvedValueOnce({ processed: true });
    createPostgresWeeklyReportChannelStoreMock.mockReturnValueOnce({
      listEnabledWeeklyReportChannels: vi.fn().mockResolvedValue([
        {
          channel_id: "wr_123",
          project_id: "proj_123",
          channel: "email",
          config: { to: ["team@example.com"] },
          schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z"
        }
      ]),
      getWeeklyReportChannelById: vi.fn().mockResolvedValue(null),
      listWeeklyReportChannelsForOrganization: vi.fn().mockResolvedValue([]),
      createWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null),
      updateWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null),
      deleteWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null)
    });
    createPostgresWeeklyReportDeliveryStoreMock.mockReturnValueOnce({
      claimWeeklyReportDelivery: vi.fn().mockResolvedValue({ delivery_id: "wrd_123", created: true }),
      markWeeklyReportDeliveryResult: vi.fn()
    });
    createPostgresMetadataStoreMock.mockReturnValueOnce({
      upsertIncident: vi.fn(),
      insertIncidentEvent: vi.fn(),
      markIncidentSpiking: vi.fn(),
      listProjectsWithWeeklyActivity: vi.fn().mockResolvedValue(["proj_123"]),
      getWeeklyProjectReport: vi.fn().mockResolvedValue(null)
    });

    await runWorkerFromEnv({ WORKER_RUN_ONCE: "1" });

    expect(queueEnqueueMock).toHaveBeenCalledWith("generate-weekly-report", {
      delivery_id: "wrd_123",
      weekly_report_channel_id: "wr_123",
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z"
    });
    expect(processNextDeliverWebhookJobMock).toHaveBeenCalledOnce();
    expect(processNextGenerateWeeklyReportJobMock).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  it("should continue alert digest delivery when weekly scheduling fails", async (): Promise<void> => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T12:00:00.000Z"));
    createPostgresWeeklyReportChannelStoreMock.mockReturnValueOnce({
      listEnabledWeeklyReportChannels: vi.fn().mockRejectedValue(new Error("weekly_conflict")),
      getWeeklyReportChannelById: vi.fn().mockResolvedValue(null),
      listWeeklyReportChannelsForOrganization: vi.fn().mockResolvedValue([]),
      createWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null),
      updateWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null),
      deleteWeeklyReportChannelForOrganization: vi.fn().mockResolvedValue(null)
    });

    await runWorkerFromEnv({ WORKER_RUN_ONCE: "1" });

    expect(processNextDeliverAlertEmailDigestJobMock).toHaveBeenCalledOnce();
    expect(captureWorkerDogfoodingStepFailureMock).toHaveBeenCalledWith(
      "schedule-weekly-reports",
      expect.any(Error)
    );

    vi.useRealTimers();
  });

  it("should run cleanup-retention when other worker lanes are idle", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { table_name: "processed_events" },
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
        { table_name: "weekly_report_deliveries" }
      ]
    });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextGroupIncidentJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildBundleJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildReproductionJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextEvaluateAlertsJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextDeliverWebhookJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextGenerateWeeklyReportJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextCleanupRetentionJobMock.mockResolvedValueOnce({ processed: true });

    await runWorkerFromEnv({ WORKER_RUN_ONCE: "1" });

    expect(queueAcquireLeaseMock).toHaveBeenCalledWith("leases:cleanup-retention:schedule", 21600);
    expect(queueEnqueueMock).toHaveBeenCalledWith("cleanup-retention", {
      scheduled_at: expect.any(String)
    });
    expect(processNextCleanupRetentionJobMock).toHaveBeenCalledOnce();
  });

  it("should close resources when processor throws", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { table_name: "processed_events" },
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
        { table_name: "weekly_report_deliveries" }
      ]
    });
    processNextNormalizeEventsJobMock.mockRejectedValueOnce(new Error("worker failed"));

    // The worker loop catches processor errors so the worker stays alive.
    // With WORKER_RUN_ONCE it completes normally after the failed iteration.
    await runWorkerFromEnv({ WORKER_RUN_ONCE: "1" });
    expect(frequencyCounterCloseMock).toHaveBeenCalledOnce();
    expect(requestAnomalyCounterCloseMock).toHaveBeenCalledOnce();
    expect(queueCloseMock).toHaveBeenCalledOnce();
    expect(poolEndMock).toHaveBeenCalledTimes(2);
  });

  it("should persist delivery intent and enqueue initial webhook job", async (): Promise<void> => {
    const listMatchingWebhooks = vi.fn().mockResolvedValue([
      {
        webhook_id: "wh_123",
        target_url: "https://hooks.example.test/debugbundle",
        signing_secret: "secret_123"
      }
    ]);
    const createDeliveryIntent = vi.fn().mockResolvedValue({ delivery_id: "del_123" });

    const publisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      webhookDeliveryStore: { listMatchingWebhooks, createDeliveryIntent }
    });

    await publisher.publish({
      event_type: "bundle.reopened",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    expect(listMatchingWebhooks).toHaveBeenCalledWith({
      project_id: "proj_123",
      event_type: "bundle.reopened",
      environment: "production",
      service_name: "checkout-api",
      severity: "high"
    });
    expect(createDeliveryIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          event: "bundle.reopened",
          event_type: "bundle.reopened",
          incident_id: "inc_123",
          project_id: "proj_123",
          occurred_at: "2026-03-11T00:00:00.000Z",
          service: "checkout-api",
          environment: "production",
          severity: "high",
          bundle_type: "failure",
          verification: false,
          summary: null,
          links: {
            bundle: "/v1/incidents/inc_123/bundle",
            reproduction: "/v1/incidents/inc_123/reproduction"
          },
          regression_after_deploy: false,
          deploy_version: null,
          deploy_commit_sha: null,
          deploy_branch: null,
          deploy_deployed_at: null,
          minutes_since_deploy: null
        }
      })
    );
  });

  it("should skip lifecycle webhook intents when the monthly webhook quota is exhausted", async (): Promise<void> => {
    const listMatchingWebhooks = vi.fn().mockResolvedValue([
      {
        webhook_id: "wh_123",
        target_url: "https://hooks.example.test/debugbundle",
        signing_secret: "secret_123"
      }
    ]);
    const createDeliveryIntent = vi.fn();
    const queueProjectOperationalEmailDelivery = vi.fn().mockResolvedValue({ delivery_id: "op_123", created: true });

    const publisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      webhookDeliveryStore: { listMatchingWebhooks, createDeliveryIntent },
      operationalEmailDeliveryStore: { queueProjectOperationalEmailDelivery },
      billingStore: {
        getBillingSummaryForProject: vi.fn().mockResolvedValue({
          usage_window: {
            starts_at: "2026-03-01T00:00:00.000Z",
            ends_at: "2026-04-01T00:00:00.000Z"
          },
          allowances: {
            monthly_webhook_deliveries: { used: 100, limit: 100 }
          }
        })
      }
    });

    await publisher.publish({
      event_type: "bundle.created",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    expect(createDeliveryIntent).not.toHaveBeenCalled();
    expect(queueProjectOperationalEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "proj_123",
        kind: "allowance_limit_reached"
      })
    );
  });

  it("should queue webhook allowance threshold notifications when lifecycle deliveries cross 80 percent", async (): Promise<void> => {
    const listMatchingWebhooks = vi.fn().mockResolvedValue([
      {
        webhook_id: "wh_123",
        target_url: "https://hooks.example.test/debugbundle",
        signing_secret: "secret_123"
      }
    ]);
    const createDeliveryIntent = vi.fn().mockResolvedValue({ delivery_id: "del_123" });
    const queueProjectOperationalEmailDelivery = vi.fn().mockResolvedValue({ delivery_id: "op_123", created: true });

    const publisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      webhookDeliveryStore: { listMatchingWebhooks, createDeliveryIntent },
      operationalEmailDeliveryStore: { queueProjectOperationalEmailDelivery },
      billingStore: {
        getBillingSummaryForProject: vi.fn().mockResolvedValue({
          usage_window: {
            starts_at: "2026-03-01T00:00:00.000Z",
            ends_at: "2026-04-01T00:00:00.000Z"
          },
          allowances: {
            monthly_webhook_deliveries: { used: 79, limit: 100 }
          }
        })
      }
    });

    await publisher.publish({
      event_type: "bundle.created",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    expect(createDeliveryIntent).toHaveBeenCalledOnce();
    expect(queueProjectOperationalEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "proj_123",
        kind: "allowance_warning_80"
      })
    );
  });

  it("should persist github dispatch intent when a rule matches", async (): Promise<void> => {
    const listMatchingGitHubDispatchRules = vi.fn().mockResolvedValue([
      {
        rule_id: "ghr_123",
        rule_name: "High severity incidents",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        default_branch: "main",
        cooldown_seconds: 300
      }
    ]);
    const hasRecentGitHubDispatch = vi.fn().mockResolvedValue(false);
    const countProjectGitHubDispatchesSince = vi.fn().mockResolvedValue(1);
    const countInstallationGitHubDispatchesSince = vi.fn().mockResolvedValue(25);
    const createGitHubDispatchDeliveryIntent = vi.fn().mockResolvedValue({ delivery_id: "gdd_123", created: true });
    const createSkippedGitHubDispatchDelivery = vi.fn();

    const publisher = createGitHubDispatchPublisher({
      githubStore: {
        listMatchingGitHubDispatchRules,
        hasRecentGitHubDispatch,
        countProjectGitHubDispatchesSince,
        countInstallationGitHubDispatchesSince,
        createGitHubDispatchDeliveryIntent,
        createSkippedGitHubDispatchDelivery
      }
    });

    await publisher.publish({
      event_type: "bundle.created",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high",
      bundle_type: "failure",
      title: "TypeError in checkout",
      occurrence_count: 12,
      first_seen_at: "2026-03-10T23:00:00.000Z",
      bundle_version: 3
    });

    expect(listMatchingGitHubDispatchRules).toHaveBeenCalledWith({
      project_id: "proj_123",
      event_type: "bundle.created",
      environment: "production",
      service_name: "checkout-api",
      severity: "high",
      bundle_type: "failure",
      incident_status: "new_or_reopened"
    });
    expect(createGitHubDispatchDeliveryIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        rule_id: "ghr_123",
        rule_name: "High severity incidents",
        project_id: "proj_123",
        incident_id: "inc_123",
        improvement_id: null,
        target_fingerprint: "inc_123:bundle.created",
        dedupe_key: "bundle.created:3",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        dispatch_payload: {
          debugbundle_event: "bundle.created",
          incident_id: "inc_123",
          improvement_id: null,
          bundle_type: "failure",
          bundle_version: 3,
          severity: "high",
          service: "checkout-api",
          environment: "production",
          title: "TypeError in checkout",
          links: {
            bundle: "/v1/incidents/inc_123/bundle",
            reproduction: "/v1/incidents/inc_123/reproduction",
            dashboard: "/incidents/inc_123"
          },
          debugbundle: {
            project_id: "proj_123",
            occurrence_count: 12,
            first_seen_at: "2026-03-10T23:00:00.000Z"
          }
        }
      })
    );
  });

  it("should classify github dispatch event statuses and skip publishes during cooldown or quota limits", async (): Promise<void> => {
    expect(getIncidentStatusForDispatchEvent("bundle.created")).toBe("new_or_reopened");
    expect(getIncidentStatusForDispatchEvent("bundle.reopened")).toBe("new_or_reopened");
    expect(getIncidentStatusForDispatchEvent("incident.spike_detected")).toBe("new_or_reopened");
    expect(getIncidentStatusForDispatchEvent("improvement_bundle.created")).toBe("new_or_reopened");

    const baseRule = {
      rule_id: "ghr_123",
      rule_name: "High severity incidents",
      installation_id: 99,
      repo_owner: "debugbundle",
      repo_name: "app",
      default_branch: "main",
      cooldown_seconds: 300
    };
    const createGitHubDispatchDeliveryIntent = vi.fn();
    const createSkippedGitHubDispatchDelivery = vi.fn().mockResolvedValue({ delivery_id: "gdd_skipped", created: true });
    const listMatchingGitHubDispatchRules = vi.fn().mockResolvedValue([baseRule]);

    const cooldownPublisher = createGitHubDispatchPublisher({
      githubStore: {
        listMatchingGitHubDispatchRules,
        hasRecentGitHubDispatch: vi.fn().mockResolvedValue(true),
        countProjectGitHubDispatchesSince: vi.fn().mockResolvedValue(0),
        countInstallationGitHubDispatchesSince: vi.fn().mockResolvedValue(0),
        createGitHubDispatchDeliveryIntent,
        createSkippedGitHubDispatchDelivery
      }
    });

    await cooldownPublisher.publish({
      event_type: "bundle.created",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    const projectQuotaPublisher = createGitHubDispatchPublisher({
      githubStore: {
        listMatchingGitHubDispatchRules,
        hasRecentGitHubDispatch: vi.fn().mockResolvedValue(false),
        countProjectGitHubDispatchesSince: vi.fn().mockResolvedValue(100),
        countInstallationGitHubDispatchesSince: vi.fn().mockResolvedValue(0),
        createGitHubDispatchDeliveryIntent,
        createSkippedGitHubDispatchDelivery
      }
    });

    await projectQuotaPublisher.publish({
      event_type: "bundle.created",
      incident_id: "inc_124",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    const installationQuotaPublisher = createGitHubDispatchPublisher({
      githubStore: {
        listMatchingGitHubDispatchRules,
        hasRecentGitHubDispatch: vi.fn().mockResolvedValue(false),
        countProjectGitHubDispatchesSince: vi.fn().mockResolvedValue(0),
        countInstallationGitHubDispatchesSince: vi.fn().mockResolvedValue(4000),
        createGitHubDispatchDeliveryIntent,
        createSkippedGitHubDispatchDelivery
      }
    });

    await installationQuotaPublisher.publish({
      event_type: "bundle.created",
      incident_id: "inc_125",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    expect(createGitHubDispatchDeliveryIntent).not.toHaveBeenCalled();
    expect(createSkippedGitHubDispatchDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        incident_id: "inc_124",
        reason: "project_hourly_rate_limited"
      })
    );
    expect(createSkippedGitHubDispatchDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        incident_id: "inc_125",
        reason: "installation_hourly_rate_limited"
      })
    );
  });

  it("should persist github dispatch intent for improvement bundles", async (): Promise<void> => {
    const listMatchingGitHubDispatchRules = vi.fn().mockResolvedValue([
      {
        rule_id: "ghr_123",
        rule_name: "Hosted improvements",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        default_branch: "main",
        cooldown_seconds: 300
      }
    ]);
    const hasRecentGitHubDispatch = vi.fn().mockResolvedValue(false);
    const countProjectGitHubDispatchesSince = vi.fn().mockResolvedValue(1);
    const countInstallationGitHubDispatchesSince = vi.fn().mockResolvedValue(25);
    const createGitHubDispatchDeliveryIntent = vi.fn().mockResolvedValue({ delivery_id: "gdd_123", created: true });
    const createSkippedGitHubDispatchDelivery = vi.fn();

    const publisher = createGitHubDispatchPublisher({
      githubStore: {
        listMatchingGitHubDispatchRules,
        hasRecentGitHubDispatch,
        countProjectGitHubDispatchesSince,
        countInstallationGitHubDispatchesSince,
        createGitHubDispatchDeliveryIntent,
        createSkippedGitHubDispatchDelivery
      }
    });

    await publisher.publish({
      event_type: "improvement_bundle.created",
      improvement_id: "imp_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "medium",
      bundle_type: "improvement",
      title: "Repeated warning hotspot",
      occurrence_count: 7,
      first_seen_at: "2026-03-10T23:00:00.000Z",
      bundle_version: 2
    });

    expect(listMatchingGitHubDispatchRules).toHaveBeenCalledWith({
      project_id: "proj_123",
      event_type: "improvement_bundle.created",
      environment: "production",
      service_name: "checkout-api",
      severity: "medium",
      bundle_type: "improvement",
      incident_status: "new_or_reopened"
    });
    expect(createGitHubDispatchDeliveryIntent).toHaveBeenCalledWith({
      rule_id: "ghr_123",
      rule_name: "Hosted improvements",
      project_id: "proj_123",
      incident_id: null,
      improvement_id: "imp_123",
      target_fingerprint: "imp_123:improvement_bundle.created",
      dedupe_key: "improvement_bundle.created:2",
      installation_id: 99,
      repo_owner: "debugbundle",
      repo_name: "app",
      dispatch_payload: {
        debugbundle_event: "improvement_bundle.created",
        incident_id: null,
        improvement_id: "imp_123",
        bundle_type: "improvement",
        bundle_version: 2,
        severity: "medium",
        service: "checkout-api",
        environment: "production",
        title: "Repeated warning hotspot",
        links: {
          bundle: "/v1/projects/proj_123/improvements/imp_123/bundle",
          reproduction: null,
          dashboard: "/projects/proj_123/improvements/imp_123"
        },
        debugbundle: {
          project_id: "proj_123",
          occurrence_count: 7,
          first_seen_at: "2026-03-10T23:00:00.000Z"
        }
      }
    });
  });

  it("should derive github dispatch dedupe keys from occurred_at when bundle version is absent", async (): Promise<void> => {
    const listMatchingGitHubDispatchRules = vi.fn().mockResolvedValue([
      {
        rule_id: "ghr_123",
        rule_name: "Spike detector",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        default_branch: "main",
        cooldown_seconds: 300
      }
    ]);
    const hasRecentGitHubDispatch = vi.fn().mockResolvedValue(false);
    const countProjectGitHubDispatchesSince = vi.fn().mockResolvedValue(1);
    const countInstallationGitHubDispatchesSince = vi.fn().mockResolvedValue(25);
    const createGitHubDispatchDeliveryIntent = vi.fn().mockResolvedValue({ delivery_id: "gdd_123", created: true });
    const createSkippedGitHubDispatchDelivery = vi.fn();

    const publisher = createGitHubDispatchPublisher({
      githubStore: {
        listMatchingGitHubDispatchRules,
        hasRecentGitHubDispatch,
        countProjectGitHubDispatchesSince,
        countInstallationGitHubDispatchesSince,
        createGitHubDispatchDeliveryIntent,
        createSkippedGitHubDispatchDelivery
      }
    });

    await publisher.publish({
      event_type: "incident.spike_detected",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    expect(createGitHubDispatchDeliveryIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        rule_name: "Spike detector",
        dedupe_key: "incident.spike_detected:2026-03-11T00:00:00.000Z"
      })
    );
  });

  it("should persist deploy correlation fields for reopened lifecycle payloads", async (): Promise<void> => {
    const listMatchingWebhooks = vi.fn().mockResolvedValue([
      {
        webhook_id: "wh_123",
        target_url: "https://hooks.example.test/debugbundle",
        signing_secret: "secret_123"
      }
    ]);
    const createDeliveryIntent = vi.fn().mockResolvedValue({ delivery_id: "del_123" });

    const publisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      webhookDeliveryStore: { listMatchingWebhooks, createDeliveryIntent }
    });

    await publisher.publish({
      event_type: "bundle.reopened",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T01:30:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high",
      regression_deploy: {
        deployment_id: "dep_123",
        commit_sha: "abc123def456",
        version: "v2.4.0",
        branch: "main",
        deployed_at: "2026-03-10T23:30:00.000Z",
        minutes_since_deploy: 120
      }
    });

    expect(createDeliveryIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          event: "bundle.reopened",
          event_type: "bundle.reopened",
          incident_id: "inc_123",
          project_id: "proj_123",
          occurred_at: "2026-03-11T01:30:00.000Z",
          service: "checkout-api",
          environment: "production",
          severity: "high",
          bundle_type: "failure",
          verification: false,
          summary: null,
          links: {
            bundle: "/v1/incidents/inc_123/bundle",
            reproduction: "/v1/incidents/inc_123/reproduction"
          },
          regression_after_deploy: true,
          deploy_version: "v2.4.0",
          deploy_commit_sha: "abc123def456",
          deploy_branch: "main",
          deploy_deployed_at: "2026-03-10T23:30:00.000Z",
          minutes_since_deploy: 120
        }
      })
    );
  });

  it("should use fallback webhook target when no matching webhooks exist", async (): Promise<void> => {
    const listMatchingWebhooks = vi.fn().mockResolvedValue([]);
    const createDeliveryIntent = vi.fn().mockResolvedValue({ delivery_id: "del_123" });

    const publisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: "https://fallback.example.test/webhook",
      fallbackSigningSecret: "fallback_secret",
      webhookDeliveryStore: { listMatchingWebhooks, createDeliveryIntent }
    });

    await publisher.publish({
      event_type: "incident.spike_detected",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    expect(createDeliveryIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        target_url: "https://fallback.example.test/webhook",
        signing_secret: "fallback_secret"
      })
    );
  });

  it("should skip delivery intent creation when no matching webhook and no fallback", async (): Promise<void> => {
    const listMatchingWebhooks = vi.fn().mockResolvedValue([]);
    const createDeliveryIntent = vi.fn().mockResolvedValue({ delivery_id: "del_123" });

    const publisher = createLifecycleWebhookPublisher({
      fallbackTargetUrl: null,
      fallbackSigningSecret: null,
      webhookDeliveryStore: { listMatchingWebhooks, createDeliveryIntent }
    });

    await publisher.publish({
      event_type: "incident.spike_detected",
      incident_id: "inc_123",
      project_id: "proj_123",
      occurred_at: "2026-03-11T00:00:00.000Z",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    expect(createDeliveryIntent).not.toHaveBeenCalled();
  });

  it("should enqueue only due webhook deliveries during scheduler pass", async (): Promise<void> => {
    const claimDueDeliveries = vi
      .fn()
      .mockResolvedValue([{ delivery_id: "del_1", attempt: 2 }, { delivery_id: "del_2", attempt: 1 }]);
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const count = await scheduleDueWebhookDeliveries({
      queue: { enqueue },
      webhookDeliveryStore: { claimDueDeliveries },
      batchSize: 50
    });

    expect(count).toBe(2);
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it("should enqueue only due alert email digest deliveries during scheduler pass", async (): Promise<void> => {
    const claimDueAlertEmailDigests = vi
      .fn()
      .mockResolvedValue([{ digest_id: "dig_1" }, { digest_id: "dig_2" }]);
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const count = await scheduleDueAlertEmailDigests({
      queue: { enqueue },
      alertStore: { claimDueAlertEmailDigests },
      batchSize: 50
    });

    expect(count).toBe(2);
    expect(enqueue).toHaveBeenCalledWith("deliver-alert-email-digest", { digest_id: "dig_1" });
    expect(enqueue).toHaveBeenCalledWith("deliver-alert-email-digest", { digest_id: "dig_2" });
  });

  it("should enqueue only due github dispatch deliveries during scheduler pass", async (): Promise<void> => {
    const claimDueGitHubDispatchDeliveries = vi
      .fn()
      .mockResolvedValue([{ delivery_id: "gdd_1", attempt: 2 }, { delivery_id: "gdd_2", attempt: 1 }]);
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const count = await scheduleDueGitHubDispatches({
      queue: { enqueue },
      githubStore: { claimDueGitHubDispatchDeliveries },
      batchSize: 50
    });

    expect(count).toBe(2);
    expect(enqueue).toHaveBeenCalledWith("deliver-github-dispatch", { delivery_id: "gdd_1", attempt: 2 });
    expect(enqueue).toHaveBeenCalledWith("deliver-github-dispatch", { delivery_id: "gdd_2", attempt: 1 });
  });

  it("should enqueue cleanup-retention work when the scheduler lease is acquired", async (): Promise<void> => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const acquireLease = vi.fn().mockResolvedValue(true);

    const scheduled = await scheduleRetentionCleanup({
      queue: { enqueue, acquireLease },
      intervalMs: 60 * 60 * 1000,
      now: new Date("2026-04-04T12:00:00.000Z")
    });

    expect(scheduled).toBe(true);
    expect(acquireLease).toHaveBeenCalledWith("leases:cleanup-retention:schedule", 3600);
    expect(enqueue).toHaveBeenCalledWith("cleanup-retention", {
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });
  });

  it("should skip cleanup-retention enqueue when the scheduler lease is already held", async (): Promise<void> => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const acquireLease = vi.fn().mockResolvedValue(false);

    const scheduled = await scheduleRetentionCleanup({
      queue: { enqueue, acquireLease },
      intervalMs: 60 * 60 * 1000,
      now: new Date("2026-04-04T12:00:00.000Z")
    });

    expect(scheduled).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("should enqueue cleanup-retention work when no lease helper is provided", async (): Promise<void> => {
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const scheduled = await scheduleRetentionCleanup({
      queue: { enqueue },
      intervalMs: 60 * 60 * 1000,
      now: new Date("2026-04-04T12:00:00.000Z")
    });

    expect(scheduled).toBe(true);
    expect(enqueue).toHaveBeenCalledWith("cleanup-retention", {
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });
  });

  it("should reuse cached installation tokens for github dispatch transport", async (): Promise<void> => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ token: "ghs_cached" })
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    const get = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("ghs_cached");
    const set = vi.fn().mockResolvedValue(undefined);

    const transport = createGitHubDispatchTransport({
      appId: "123",
      privateKey: TEST_GITHUB_PRIVATE_KEY,
      tokenCache: { get, set },
      fetchImpl: fetchMock,
      now: () => new Date("2026-03-11T00:00:00.000Z"),
      createAppJwt: () => "jwt_123"
    });

    await transport.deliver({
      delivery_id: "gdd_1",
      installation_id: 99,
      repo_owner: "debugbundle",
      repo_name: "app",
      dispatch_payload: {
        debugbundle_event: "bundle.created",
        incident_id: "inc_123",
        bundle_type: "failure",
        bundle_version: 3,
        severity: "high",
        service: "checkout-api",
        environment: "production",
        title: "TypeError in checkout",
        links: {
          bundle: "/v1/incidents/inc_123/bundle",
          reproduction: "/v1/incidents/inc_123/reproduction",
          dashboard: "/incidents/inc_123"
        },
        debugbundle: {
          project_id: "proj_123",
          occurrence_count: 12,
          first_seen_at: "2026-03-10T23:00:00.000Z"
        }
      }
    });

    await transport.deliver({
      delivery_id: "gdd_2",
      installation_id: 99,
      repo_owner: "debugbundle",
      repo_name: "app",
      dispatch_payload: {
        debugbundle_event: "bundle.reopened",
        incident_id: "inc_456",
        bundle_type: "failure",
        bundle_version: 4,
        severity: "critical",
        service: "checkout-api",
        environment: "production",
        title: "Checkout regressed",
        links: {
          bundle: "/v1/incidents/inc_456/bundle",
          reproduction: "/v1/incidents/inc_456/reproduction",
          dashboard: "/incidents/inc_456"
        },
        debugbundle: {
          project_id: "proj_123",
          occurrence_count: 25,
          first_seen_at: "2026-03-10T21:00:00.000Z"
        }
      }
    });

    expect(set).toHaveBeenCalledWith("github-installation-token:99", "ghs_cached", 3000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.github.com/repos/debugbundle/app/dispatches",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "token ghs_cached" }),
        body: expect.stringContaining('"dispatch_id":"gdd_2"')
      })
    );
    const dispatchedRequest = fetchMock.mock.calls[2]?.[1];
    expect(dispatchedRequest).toEqual(
      expect.objectContaining({
        body: expect.stringContaining('"debugbundle_event":"bundle.reopened"')
      })
    );
    const dispatchedBody = JSON.parse(String(dispatchedRequest?.body)) as {
      client_payload: Record<string, unknown>;
    };
    expect(Object.keys(dispatchedBody.client_payload)).toHaveLength(10);
    expect(dispatchedBody.client_payload).toMatchObject({
      debugbundle_event: "bundle.reopened",
      incident_id: "inc_456",
      debugbundle: {
        project_id: "proj_123",
        occurrence_count: 25,
        first_seen_at: "2026-03-10T21:00:00.000Z",
        dispatch_id: "gdd_2",
        dispatched_at: "2026-03-11T00:00:00.000Z"
      }
    });
  });

  it("should surface github Retry-After headers from dispatch transport failures", async (): Promise<void> => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ token: "ghs_retry" })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: {
          get: vi.fn().mockImplementation((name: string) => (name.toLowerCase() === "retry-after" ? "17" : null))
        }
      });

    const transport = createGitHubDispatchTransport({
      appId: "123",
      privateKey: TEST_GITHUB_PRIVATE_KEY,
      tokenCache: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined)
      },
      fetchImpl: fetchMock,
      now: () => new Date("2026-03-11T00:00:00.000Z"),
      createAppJwt: () => "jwt_123"
    });

    await expect(
      transport.deliver({
        delivery_id: "gdd_retry",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        dispatch_payload: {
          debugbundle_event: "bundle.created",
          incident_id: "inc_123",
          bundle_version: 3,
          debugbundle: {
            project_id: "proj_123"
          }
        }
      })
    ).rejects.toMatchObject({
      message: "github_dispatch_http_error_429",
      statusCode: 429,
      retryAfterSeconds: 17
    });
  });

  it("should deliver alerts across email, slack, discord, and webhook channels", async (): Promise<void> => {
    const emailSend = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const transport = createAlertTransport({
      timeoutMs: 1000,
      emailTransport: { send: emailSend },
      appBaseUrl: "https://app.debugbundle.com",
      apiBaseUrl: "https://api.debugbundle.com"
    });

    await transport.deliver({
      channel: "email",
      config: { to: "alerts@example.com" },
      payload: {
        condition_type: "new_incident",
        incident_id: "inc_alert_123",
        occurred_at: "2026-05-13T08:33:56.774Z",
        service_name: "api",
        environment: "production",
        severity: "high"
      }
    } as never);
    await transport.deliver({
      channel: "slack",
      config: { webhook_url: "https://hooks.slack.test/alert" },
      payload: {}
    } as never);
    await transport.deliver({
      channel: "discord",
      config: { webhook_url: "https://discord.test/alert" },
      payload: {}
    } as never);
    await transport.deliver({
      channel: "webhook",
      config: { target_url: "https://alerts.test/webhook" },
      payload: { summary: "Disk alert" }
    } as never);

    expect(emailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["alerts@example.com"],
        subject: "[DebugBundle Alert] A new incident was detected"
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("should surface alert transport configuration and delivery failures", async (): Promise<void> => {
    const transportWithoutEmail = createAlertTransport({ timeoutMs: 1000, emailTransport: null });

    await expect(
      transportWithoutEmail.deliver({
        channel: "email",
        config: { to: "alerts@example.com" },
        payload: { summary: "Broken" }
      } as never)
    ).rejects.toMatchObject({ message: "alert_email_not_configured" });

    const emailSend = vi.fn().mockRejectedValue(new Error("smtp_down"));
    const transport = createAlertTransport({ timeoutMs: 1000, emailTransport: { send: emailSend } });

    await expect(
      transport.deliver({
        channel: "email",
        config: { to: "   " },
        payload: { summary: "Broken" }
      } as never)
    ).rejects.toMatchObject({ message: "alert_email_recipients_missing" });

    await expect(
      transport.deliver({
        channel: "email",
        config: { to: "alerts@example.com" },
        payload: { summary: "Broken", event_type: "incident.spike_detected" }
      } as never)
    ).rejects.toMatchObject({ message: "alert_email_error:smtp_down" });

    const abortError = new Error("timed out");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(abortError));

    await expect(
      transport.deliver({
        channel: "slack",
        config: { webhook_url: "https://hooks.slack.test/alert" },
        payload: { summary: "Slack broken", event_type: "bundle.created" }
      } as never)
    ).rejects.toMatchObject({ message: "alert_transport_error:offline" });

    await expect(
      transport.deliver({
        channel: "discord",
        config: { webhook_url: "https://discord.test/alert" },
        payload: { summary: "Discord broken", event_type: "bundle.created" }
      } as never)
    ).rejects.toMatchObject({ message: "alert_timeout" });

    await expect(
      transport.deliver({
        channel: "webhook",
        config: {},
        payload: { summary: "Webhook broken" }
      } as never)
    ).rejects.toMatchObject({ message: "alert_target_url_missing" });

    await expect(
      transport.deliver({
        channel: "pagerduty",
        config: {},
        payload: {}
      } as never)
    ).rejects.toMatchObject({ message: "alert_channel_not_supported:pagerduty" });
  });

  it("should validate weekly report email and slack delivery configuration", async (): Promise<void> => {
    const reportEvent = {
      channel: {
        channel: "email",
        config: { to: ["team@example.com"] }
      },
      report: {
        project_id: "proj_123",
        project_name: "Main app",
        window_start: "2026-03-09T00:00:00.000Z",
        window_end: "2026-03-16T00:00:00.000Z",
        bundle_counts: { failure: 3, improvement: 1 },
        new_incidents: 2,
        resolved_incidents: 1,
        opened_incidents_resolved: 1,
        regressions: 1,
        top_spiking_incidents: []
      }
    };

    await expect(createWeeklyReportTransport({ emailTransport: null }).deliver(reportEvent as never)).rejects.toThrow(
      "weekly_report_email_not_configured"
    );

    await expect(
      createWeeklyReportTransport({ emailTransport: { send: vi.fn() } }).deliver({
        ...reportEvent,
        channel: {
          channel: "email",
          config: { to: "team@example.com" }
        }
      } as never)
    ).rejects.toThrow("weekly_report_email_config_invalid");

    await expect(
      createWeeklyReportTransport({ emailTransport: { send: vi.fn() } }).deliver({
        ...reportEvent,
        channel: {
          channel: "slack",
          config: {}
        }
      } as never)
    ).rejects.toThrow("weekly_report_slack_config_invalid");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, headers: { get: vi.fn().mockReturnValue(null) } })
    );

    await expect(
      createWeeklyReportTransport({ emailTransport: { send: vi.fn() } }).deliver({
        ...reportEvent,
        channel: {
          channel: "slack",
          config: { webhook_url: "https://hooks.slack.test/weekly" }
        }
      } as never)
    ).rejects.toThrow("weekly_report_slack_http_error_503");

    const encryptedWebhookUrl = encryptIntegrationSecret(
      "https://hooks.slack.test/weekly",
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true })
    );

    await expect(
      createWeeklyReportTransport({
        emailTransport: { send: vi.fn() },
        integrationSecretEncryptionKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        slackDestinationStore: {
          getSlackDestinationSecretForDelivery: vi.fn().mockResolvedValue({
            webhook_url_ciphertext: encryptedWebhookUrl
          })
        }
      }).deliver({
        ...reportEvent,
        channel: {
          channel: "slack",
          config: { slack_destination_id: "sd_123" }
        }
      } as never)
    ).resolves.toBeUndefined();
  });

  it("should enqueue one generate-weekly-report job per active project during scheduler pass", async (): Promise<void> => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const listProjectsWithWeeklyActivity = vi.fn().mockResolvedValue(["proj_123", "proj_456"]);
    const claimWeeklyReportDelivery = vi.fn().mockResolvedValue({ delivery_id: "wrd_123", created: true });

    const count = await scheduleWeeklyReports({
      queue: { enqueue },
      weeklyReportingStore: { listProjectsWithWeeklyActivity },
      weeklyReportChannelStore: {
        listEnabledWeeklyReportChannels: vi.fn().mockResolvedValue([
          {
            channel_id: "wr_123",
            project_id: "proj_123",
            channel: "email",
            config: { to: ["team@example.com"] },
            schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ])
      },
      weeklyReportDeliveryStore: { claimWeeklyReportDelivery },
      batchSize: 50,
      now: new Date("2026-03-16T10:00:00.000Z")
    });

    expect(count).toBe(1);
    expect(enqueue).toHaveBeenCalledWith("generate-weekly-report", {
      delivery_id: "wrd_123",
      weekly_report_channel_id: "wr_123",
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z"
    });
  });

  it("should return timeout error from real webhook transport", async (): Promise<void> => {
    const transport = createLifecycleWebhookTransport({
      timeoutMs: 100
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      Object.assign(new Error("aborted"), { name: "AbortError" })
    );

    await expect(
      transport.deliver({
        delivery_id: "del_1",
        project_id: "proj_1",
        incident_id: "inc_1",
        event_type: "bundle.reopened",
        occurred_at: "2026-03-11T00:00:00.000Z",
        target_url: "https://hooks.example.test/debugbundle",
        signing_secret: "secret_123",
        payload: { event: "bundle.reopened" }
      })
    ).rejects.toThrow("webhook_timeout");

    fetchSpy.mockRestore();
  });

  it("should return http status error from real webhook transport when response is non-2xx", async (): Promise<void> => {
    const transport = createLifecycleWebhookTransport({
      timeoutMs: 100
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 503
    } as Response);

    await expect(
      transport.deliver({
        delivery_id: "del_1",
        project_id: "proj_1",
        incident_id: "inc_1",
        event_type: "bundle.reopened",
        occurred_at: "2026-03-11T00:00:00.000Z",
        target_url: "https://hooks.example.test/debugbundle",
        signing_secret: "secret_123",
        payload: { event: "bundle.reopened" }
      })
    ).rejects.toThrow("webhook_http_error_503");

    fetchSpy.mockRestore();
  });

  it("should return transport error from real webhook transport for non-timeout failures", async (): Promise<void> => {
    const transport = createLifecycleWebhookTransport({
      timeoutMs: 100
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network_down"));

    await expect(
      transport.deliver({
        delivery_id: "del_1",
        project_id: "proj_1",
        incident_id: "inc_1",
        event_type: "bundle.reopened",
        occurred_at: "2026-03-11T00:00:00.000Z",
        target_url: "https://hooks.example.test/debugbundle",
        signing_secret: "secret_123",
        payload: { event: "bundle.reopened" }
      })
    ).rejects.toThrow("webhook_transport_error:network_down");

    fetchSpy.mockRestore();
  });

  it("should sign webhook payloads with HMAC header", async (): Promise<void> => {
    const transport = createLifecycleWebhookTransport({
      timeoutMs: 100
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true
    } as Response);

    await transport.deliver({
      delivery_id: "del_1",
      project_id: "proj_1",
      incident_id: "inc_1",
      event_type: "bundle.reopened",
      occurred_at: "2026-03-11T00:00:00.000Z",
      target_url: "https://hooks.example.test/debugbundle",
      signing_secret: "secret_123",
      payload: { event: "bundle.reopened", incident_id: "inc_1" }
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const requestOptions = fetchSpy.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(requestOptions.headers["x-debugbundle-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    fetchSpy.mockRestore();
  });

  it("should start worker health server and return health status", async (): Promise<void> => {
    const server = createWorkerHealthServer({ port: 0 });

    try {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      const text = await response.text();
      const body = JSON.parse(text) as { status: string; uptime: number };

      expect(response.status).toBe(200);
      expect(body.status).toBe("ok");
      expect(typeof body.uptime).toBe("number");
    } finally {
      server.close();
    }
  });

  it("should return ready status on worker health server", async (): Promise<void> => {
    const server = createWorkerHealthServer({ port: 0 });

    try {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      const text = await response.text();
      const body = JSON.parse(text) as { status: string };

      expect(response.status).toBe(200);
      expect(body).toEqual({ status: "ready" });
    } finally {
      server.close();
    }
  });

  it("should return not-ready status on worker health server when readiness check fails", async (): Promise<void> => {
    const server = createWorkerHealthServer({
      port: 0,
      readinessCheck: vi.fn().mockRejectedValueOnce(new Error("worker_s3_bucket_unreachable"))
    });

    try {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      const text = await response.text();
      const body = JSON.parse(text) as { status: string; reason: string };

      expect(response.status).toBe(503);
      expect(body).toEqual({ status: "not_ready", reason: "worker_s3_bucket_unreachable" });
    } finally {
      server.close();
    }
  });

  it("should return not-ready status while worker shutdown is draining", async (): Promise<void> => {
    const shutdownState = createWorkerShutdownState();
    const readinessCheck = vi.fn().mockResolvedValue(undefined);
    const server = createWorkerHealthServer({
      port: 0,
      readinessCheck: () => shutdownState.readinessCheck(readinessCheck)
    });

    try {
      shutdownState.requestShutdown();

      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      const text = await response.text();
      const body = JSON.parse(text) as { status: string; reason: string };

      expect(response.status).toBe(503);
      expect(body).toEqual({ status: "not_ready", reason: "worker_draining" });
      expect(readinessCheck).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it("should return live status on worker health server", async (): Promise<void> => {
    const server = createWorkerHealthServer({ port: 0 });

    try {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/live`);
      const text = await response.text();
      const body = JSON.parse(text) as { status: string };

      expect(response.status).toBe(200);
      expect(body).toEqual({ status: "live" });
    } finally {
      server.close();
    }
  });

  it("should return 404 for unknown worker health server paths", async (): Promise<void> => {
    const server = createWorkerHealthServer({ port: 0 });

    try {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/unknown`);

      expect(response.status).toBe(404);
    } finally {
      server.close();
    }
  });
});
