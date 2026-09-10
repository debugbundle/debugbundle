import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  redisPingMock,
  redisQuitMock,
  s3SendMock,
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
  processNextBuildAnalyticsBundleJobMock,
  processNextBuildReproductionJobMock,
  processNextEvaluateAlertsJobMock,
  processNextDeliverAlertEmailDigestJobMock,
  processNextCleanupRetentionJobMock,
  processNextDeliverWebhookJobMock,
  processNextGenerateWeeklyReportJobMock,
  frequencyCounterCloseMock,
  requestAnomalyCounterCloseMock,
  createPostgresAnalyticsMetricsStoreMock,
  createPostgresAnalyticsBundleGenerationStoreMock,
  createPostgresMetadataStoreMock,
  createPostgresOperationalEmailDeliveryStoreMock,
  createPostgresWeeklyReportDeliveryStoreMock,
  createPostgresWeeklyReportChannelStoreMock,
  registerWorkerDogfoodingMock,
  captureWorkerDogfoodingStepFailureMock,
  WORKER_TABLE_ROWS,
  buildMigratedWorkerSchemaRows,
  resetWorkerRuntimeMocks
} from "../../helpers/worker-runtime-mocks.js";
import {
  assertWorkerSchema,
  createWorkerShutdownState,
  createProcessedEventStore,
  parseWorkerEnv,
  resolveWorkerEmailAssetBaseUrl,
  runAvailabilityCheckLoop,
  runWorkerFromEnv
} from "../../../apps/worker/src/runtime.js";

describe("worker runtime", () => {
  beforeEach(resetWorkerRuntimeMocks);

  it("should parse worker env with defaults", (): void => {
    const env = parseWorkerEnv({ ANALYTICS_HASH_SECRET: "test-analytics-secret" });

    expect(env.DB_HOST).toBe("localhost");
    expect(env.DB_SSL_MODE).toBe("disable");
    expect(env.WORKER_POLL_INTERVAL_MS).toBe(1000);
    expect(env.AVAILABILITY_CHECK_LOOP_INTERVAL_MS).toBe(250);
    expect(env.AVAILABILITY_CHECK_CLAIM_BATCH_SIZE).toBe(20);
    expect(env.AVAILABILITY_CHECK_CONCURRENCY).toBe(8);
    expect(env.RETENTION_CLEANUP_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
    expect(env.ANALYTICS_OPPORTUNITY_EVALUATION_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
  });

  it("registers worker dogfooding during startup", async (): Promise<void> => {
    await runWorkerFromEnv({
      WORKER_RUN_ONCE: "1",
      ANALYTICS_HASH_SECRET: "test-analytics-secret"
    });

    expect(registerWorkerDogfoodingMock).toHaveBeenCalledWith({
      WORKER_RUN_ONCE: "1",
      ANALYTICS_HASH_SECRET: "test-analytics-secret"
    });
  });

  it("should parse require DB SSL mode", (): void => {
    const env = parseWorkerEnv({
      DB_SSL_MODE: "require",
      ANALYTICS_HASH_SECRET: "test-analytics-secret"
    });

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
    expect(() =>
      parseWorkerEnv({
        WORKER_POLL_INTERVAL_MS: "5",
        ANALYTICS_HASH_SECRET: "test-analytics-secret"
      })
    ).toThrow("worker_env_invalid");
  });

  it("should reject retention cleanup intervals longer than 24 hours", (): void => {
    expect(() =>
      parseWorkerEnv({
        RETENTION_CLEANUP_INTERVAL_MS: String(24 * 60 * 60 * 1000 + 1),
        ANALYTICS_HASH_SECRET: "test-analytics-secret"
      })
    ).toThrow("worker_env_invalid");
  });

  it("should reject invalid run-once env values", (): void => {
    expect(() =>
      parseWorkerEnv({ WORKER_RUN_ONCE: "2", ANALYTICS_HASH_SECRET: "test-analytics-secret" })
    ).toThrow("worker_env_invalid");
  });

  it("should reject invalid DB SSL mode values with a targeted error", (): void => {
    expect(() =>
      parseWorkerEnv({ DB_SSL_MODE: "broken", ANALYTICS_HASH_SECRET: "test-analytics-secret" })
    ).toThrow("worker_env_invalid: DB_SSL_MODE: expected disable or require");
  });

  it("should treat empty optional GitHub app env vars as unset", (): void => {
    const env = parseWorkerEnv({
      GITHUB_APP_ID: "",
      GITHUB_APP_PRIVATE_KEY: "",
      ANALYTICS_HASH_SECRET: "test-analytics-secret"
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
    poolQueryMock.mockResolvedValueOnce({ rows: WORKER_TABLE_ROWS });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({ processed: true });

    await runWorkerFromEnv({
      WORKER_RUN_ONCE: "1",
      ANALYTICS_HASH_SECRET: "test-analytics-secret"
    });

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
    expect(processNextBuildAnalyticsBundleJobMock).not.toHaveBeenCalled();
    expect(processNextBuildReproductionJobMock).not.toHaveBeenCalled();
    expect(processNextDeliverWebhookJobMock).not.toHaveBeenCalled();
    expect(frequencyCounterCloseMock).toHaveBeenCalledOnce();
    expect(requestAnomalyCounterCloseMock).toHaveBeenCalledOnce();
    expect(queueCloseMock).toHaveBeenCalledOnce();
    expect(poolEndMock).toHaveBeenCalledTimes(2);
  });

  it("should run the availability-check loop until shutdown is requested", async (): Promise<void> => {
    const shutdownState = createWorkerShutdownState();
    const processBatch = vi.fn().mockImplementation(async () => {
      shutdownState.requestShutdown();
      return { processed: false, reason: "no_jobs" };
    });

    await runAvailabilityCheckLoop({
      logger: { error: vi.fn() } as never,
      shutdownState,
      intervalMs: 1,
      processBatch
    });

    expect(processBatch).toHaveBeenCalledOnce();
  });

  it("should fail worker startup when redis preflight fails", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({ rows: WORKER_TABLE_ROWS });
    redisPingMock.mockResolvedValueOnce("NOPE");

    await expect(
      runWorkerFromEnv({ WORKER_RUN_ONCE: "1", ANALYTICS_HASH_SECRET: "test-analytics-secret" })
    ).rejects.toThrow("worker_redis_not_ready");
    expect(queueEnqueueMock).not.toHaveBeenCalled();
  });

  it("should wrap redis connectivity failures as worker_redis_unreachable", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({ rows: WORKER_TABLE_ROWS });
    redisPingMock.mockRejectedValueOnce(new Error("redis_down"));

    await expect(
      runWorkerFromEnv({ WORKER_RUN_ONCE: "1", ANALYTICS_HASH_SECRET: "test-analytics-secret" })
    ).rejects.toThrow("worker_redis_unreachable: redis_down");
    expect(queueEnqueueMock).not.toHaveBeenCalled();
  });

  it("should wrap s3 preflight failures as worker_s3_bucket_unreachable", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({ rows: WORKER_TABLE_ROWS });
    s3SendMock.mockRejectedValueOnce(new Error("bucket_missing"));

    await expect(
      runWorkerFromEnv({ WORKER_RUN_ONCE: "1", ANALYTICS_HASH_SECRET: "test-analytics-secret" })
    ).rejects.toThrow("worker_s3_bucket_unreachable: bucket_missing");
    expect(queueEnqueueMock).not.toHaveBeenCalled();
  });

  it("should run group-incident processor when normalize queue has no work", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({ rows: WORKER_TABLE_ROWS });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({
      processed: false,
      reason: "no_jobs"
    });
    processNextGroupIncidentJobMock.mockResolvedValueOnce({ processed: true });

    await runWorkerFromEnv({
      WORKER_RUN_ONCE: "1",
      ANALYTICS_HASH_SECRET: "test-analytics-secret"
    });

    expect(processNextNormalizeEventsJobMock).toHaveBeenCalledOnce();
    expect(processNextGroupIncidentJobMock).toHaveBeenCalledOnce();
    expect(processNextBuildBundleJobMock).not.toHaveBeenCalled();
    expect(processNextBuildAnalyticsBundleJobMock).not.toHaveBeenCalled();
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

    processNextDeliverWebhookJobMock.mockImplementationOnce(
      async (input: {
        onWebhookDisabled?: (payload: { webhook_id: string; target_url: string }) => Promise<void>;
      }) => {
        await input.onWebhookDisabled?.({
          webhook_id: "wh_123",
          target_url: "https://hooks.example.test/debugbundle"
        });

        return { processed: true };
      }
    );

    await runWorkerFromEnv({
      WORKER_RUN_ONCE: "1",
      ANALYTICS_HASH_SECRET: "test-analytics-secret",
      APP_BASE_URL: "https://app.debugbundle.test"
    });

    expect(processNextDeliverWebhookJobMock).toHaveBeenCalledOnce();
    const queuedOperationalEmails =
      createPostgresOperationalEmailDeliveryStoreMock.mock.results[0]?.value
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
    poolQueryMock.mockResolvedValueOnce({ rows: WORKER_TABLE_ROWS });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({
      processed: false,
      reason: "no_jobs"
    });
    processNextGroupIncidentJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildBundleJobMock.mockResolvedValueOnce({ processed: true });

    await runWorkerFromEnv({
      WORKER_RUN_ONCE: "1",
      ANALYTICS_HASH_SECRET: "test-analytics-secret",
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
    expect(processNextBuildAnalyticsBundleJobMock).not.toHaveBeenCalled();
    expect(processNextBuildReproductionJobMock).not.toHaveBeenCalled();
    expect(processNextDeliverWebhookJobMock).not.toHaveBeenCalled();
  });

  it("should run build-analytics-bundle processor before reproduction when earlier queues are empty", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({ rows: WORKER_TABLE_ROWS });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({
      processed: false,
      reason: "no_jobs"
    });
    processNextGroupIncidentJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildBundleJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildAnalyticsBundleJobMock.mockResolvedValueOnce({ processed: true });

    await runWorkerFromEnv({
      WORKER_RUN_ONCE: "1",
      ANALYTICS_HASH_SECRET: "test-analytics-secret"
    });

    expect(createPostgresAnalyticsMetricsStoreMock).toHaveBeenCalledOnce();
    expect(createPostgresAnalyticsBundleGenerationStoreMock).toHaveBeenCalledOnce();
    expect(processNextBuildAnalyticsBundleJobMock).toHaveBeenCalledOnce();
    expect(processNextBuildAnalyticsBundleJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        analyticsBundleGenerationStore:
          createPostgresAnalyticsBundleGenerationStoreMock.mock.results[0]?.value,
        analyticsMetricsStore: createPostgresAnalyticsMetricsStoreMock.mock.results[0]?.value,
        objectStore: expect.objectContaining({
          getObject: expect.any(Function)
        })
      })
    );
    expect(processNextBuildReproductionJobMock).not.toHaveBeenCalled();
    expect(processNextEvaluateAlertsJobMock).not.toHaveBeenCalled();
  });

  it("should run build-reproduction processor when normalize/group/build queues are empty", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({ rows: WORKER_TABLE_ROWS });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({
      processed: false,
      reason: "no_jobs"
    });
    processNextGroupIncidentJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildBundleJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildReproductionJobMock.mockResolvedValueOnce({ processed: true });

    await runWorkerFromEnv({
      WORKER_RUN_ONCE: "1",
      ANALYTICS_HASH_SECRET: "test-analytics-secret"
    });

    expect(processNextBuildBundleJobMock).toHaveBeenCalledOnce();
    expect(processNextBuildAnalyticsBundleJobMock).toHaveBeenCalledOnce();
    expect(processNextBuildReproductionJobMock).toHaveBeenCalledOnce();
    expect(processNextDeliverWebhookJobMock).not.toHaveBeenCalled();
  });

  it("should run evaluate-alerts processor when normalize/group/build/reproduction queues are empty", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({ rows: WORKER_TABLE_ROWS });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({
      processed: false,
      reason: "no_jobs"
    });
    processNextGroupIncidentJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildBundleJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildReproductionJobMock.mockResolvedValueOnce({
      processed: false,
      reason: "no_jobs"
    });
    processNextEvaluateAlertsJobMock.mockResolvedValueOnce({ processed: true });

    await runWorkerFromEnv({
      WORKER_RUN_ONCE: "1",
      ANALYTICS_HASH_SECRET: "test-analytics-secret"
    });

    expect(processNextBuildBundleJobMock).toHaveBeenCalledOnce();
    expect(processNextBuildAnalyticsBundleJobMock).toHaveBeenCalledOnce();
    expect(processNextBuildReproductionJobMock).toHaveBeenCalledOnce();
    expect(processNextEvaluateAlertsJobMock).toHaveBeenCalledOnce();
    expect(processNextDeliverWebhookJobMock).not.toHaveBeenCalled();
  });

  it("should run deliver-webhook processor when normalize/group/build/reproduction queues are empty", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({ rows: WORKER_TABLE_ROWS });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({
      processed: false,
      reason: "no_jobs"
    });
    processNextGroupIncidentJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildBundleJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildReproductionJobMock.mockResolvedValueOnce({
      processed: false,
      reason: "no_jobs"
    });
    processNextEvaluateAlertsJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextDeliverWebhookJobMock.mockResolvedValueOnce({ processed: true });

    await runWorkerFromEnv({
      WORKER_RUN_ONCE: "1",
      ANALYTICS_HASH_SECRET: "test-analytics-secret"
    });

    expect(processNextBuildBundleJobMock).toHaveBeenCalledOnce();
    expect(processNextBuildAnalyticsBundleJobMock).toHaveBeenCalledOnce();
    expect(processNextBuildReproductionJobMock).toHaveBeenCalledOnce();
    expect(processNextEvaluateAlertsJobMock).toHaveBeenCalledOnce();
    expect(processNextDeliverWebhookJobMock).toHaveBeenCalledOnce();
    expect(processNextGenerateWeeklyReportJobMock).toHaveBeenCalledOnce();
  });

  it("should run generate-weekly-report processor when other queues are empty", async (): Promise<void> => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T12:00:00.000Z"));
    poolQueryMock.mockResolvedValueOnce({ rows: WORKER_TABLE_ROWS });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({
      processed: false,
      reason: "no_jobs"
    });
    processNextGroupIncidentJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildBundleJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildReproductionJobMock.mockResolvedValueOnce({
      processed: false,
      reason: "no_jobs"
    });
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
      claimWeeklyReportDelivery: vi
        .fn()
        .mockResolvedValue({ delivery_id: "wrd_123", created: true }),
      markWeeklyReportDeliveryResult: vi.fn()
    });
    createPostgresMetadataStoreMock.mockReturnValueOnce({
      upsertIncident: vi.fn(),
      insertIncidentEvent: vi.fn(),
      markIncidentSpiking: vi.fn(),
      listProjectsWithWeeklyActivity: vi.fn().mockResolvedValue(["proj_123"]),
      getWeeklyProjectReport: vi.fn().mockResolvedValue(null)
    });

    await runWorkerFromEnv({
      WORKER_RUN_ONCE: "1",
      ANALYTICS_HASH_SECRET: "test-analytics-secret"
    });

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

    await runWorkerFromEnv({
      WORKER_RUN_ONCE: "1",
      ANALYTICS_HASH_SECRET: "test-analytics-secret"
    });

    expect(processNextDeliverAlertEmailDigestJobMock).toHaveBeenCalledOnce();
    expect(captureWorkerDogfoodingStepFailureMock).toHaveBeenCalledWith(
      "schedule-weekly-reports",
      expect.any(Error)
    );

    vi.useRealTimers();
  });

  it("should run cleanup-retention when other worker lanes are idle", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({ rows: WORKER_TABLE_ROWS });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({
      processed: false,
      reason: "no_jobs"
    });
    processNextGroupIncidentJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildBundleJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildReproductionJobMock.mockResolvedValueOnce({
      processed: false,
      reason: "no_jobs"
    });
    processNextEvaluateAlertsJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextDeliverWebhookJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextGenerateWeeklyReportJobMock.mockResolvedValueOnce({
      processed: false,
      reason: "no_jobs"
    });
    processNextCleanupRetentionJobMock.mockResolvedValueOnce({ processed: true });

    await runWorkerFromEnv({
      WORKER_RUN_ONCE: "1",
      ANALYTICS_HASH_SECRET: "test-analytics-secret"
    });

    expect(queueAcquireLeaseMock).toHaveBeenCalledWith("leases:cleanup-retention:schedule", 21600);
    expect(queueEnqueueMock).toHaveBeenCalledWith("cleanup-retention", {
      scheduled_at: expect.any(String)
    });
    expect(queueAcquireLeaseMock).toHaveBeenCalledWith(
      "leases:analytics-opportunities:schedule",
      21600
    );
    expect(queueEnqueueMock).toHaveBeenCalledWith("evaluate-analytics-opportunities", {
      scheduled_at: expect.any(String),
      cursor: null
    });
    expect(processNextCleanupRetentionJobMock).toHaveBeenCalledOnce();
  });

  it("should close resources when processor throws", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({ rows: WORKER_TABLE_ROWS });
    processNextNormalizeEventsJobMock.mockRejectedValueOnce(new Error("worker failed"));

    // The worker loop catches processor errors so the worker stays alive.
    // With WORKER_RUN_ONCE it completes normally after the failed iteration.
    await runWorkerFromEnv({
      WORKER_RUN_ONCE: "1",
      ANALYTICS_HASH_SECRET: "test-analytics-secret"
    });
    expect(frequencyCounterCloseMock).toHaveBeenCalledOnce();
    expect(requestAnomalyCounterCloseMock).toHaveBeenCalledOnce();
    expect(queueCloseMock).toHaveBeenCalledOnce();
    expect(poolEndMock).toHaveBeenCalledTimes(2);
  });
});
