import { Pool } from "pg";
import { Redis } from "ioredis";

import {
  createRuntimeLoggerFromEnv,
  type RuntimeLogger
} from "../../../packages/runtime-logger/src/index.js";
import { buildPostgresSslConfig } from "../../../packages/storage/src/postgres-ssl.js";
import {
  createSesEmailTransport,
  formatProductFromEmail
} from "../../../packages/email/src/index.js";
import {
  createPostgresAlertDeliveryStore,
  createPostgresAccountAnalyticsStore,
  createPostgresAnalyticsBundleGenerationStore,
  createPostgresAnalyticsMetricsStore,
  createPostgresAnalyticsRollupStore,
  createPostgresAvailabilityCheckStore,
  createPostgresBillingStore,
  createIncidentLifecycleService,
  createPostgresGitHubStore,
  createPostgresImprovementOpportunityStore,
  createPostgresOperationalEmailDeliveryStore,
  createPostgresSlackDestinationStore,
  createPostgresWebhookDeliveryStore,
  createPostgresMetadataStore,
  createPostgresRetentionStore,
  createRetentionCleanupService,
  createPostgresWeeklyReportChannelStore,
  createPostgresWeeklyReportDeliveryStore,
  createRedisIncidentFrequencyCounter,
  createRedisRequestAnomalyCounter,
  createRedisQueueClient,
  createS3ObjectStoreClient,
  type Queryable
} from "../../../packages/storage/src/index.js";
import {
  processNextGroupIncidentJob,
  processNextBuildBundleJob,
  processNextBuildReproductionJob,
  processNextEvaluateAlertsJob,
  processNextCleanupRetentionJob,
  processNextDeliverAlertEmailDigestJob,
  processNextDeliverGitHubDispatchJob,
  processNextDeliverWebhookJob,
  processNextGenerateWeeklyReportJob,
  processNextNormalizeEventsJob,
  type ProcessedEventStore
} from "./processor.js";
import {
  processNextAggregateAnalyticsEventsJob,
  type AggregateAnalyticsWorkerQueue
} from "./analytics-aggregation.js";
import { processAvailabilityCheckBatch } from "./availability-checks.js";
import { processNextDeliverOperationalEmailJob } from "./operational-email-processor.js";
import {
  processNextBuildImprovementBundleJob,
  type ImprovementBundleJobQueue
} from "./improvement-bundle-processor.js";
import {
  processNextBuildAnalyticsBundleJob,
  type BuildAnalyticsBundleWorkerQueue
} from "./analytics-bundle-processor.js";
import { scheduleTrialLifecycleEmails } from "./trial-lifecycle-scheduler.js";
import { registerWorkerDogfooding } from "./dogfooding.js";
import {
  buildWorkerReadinessCheck,
  createPoolQueryable,
  createWorkerShutdownState,
  delayUntilNextPollOrShutdown,
  getProjectName,
  getProjectOrganizationId,
  getWebhookOwnerNotificationRecipient,
  normalizeWorkerBaseUrl,
  parseWorkerEnv,
  resolveWorkerEmailAssetBaseUrl,
  type WorkerShutdownState
} from "./worker-env.js";
import {
  createAlertEmailDigestTransport,
  createAlertTransport,
  createGitHubDispatchPublisher,
  createGitHubDispatchTransport,
  createLifecycleWebhookPublisher,
  createLifecycleWebhookTransport,
  createWeeklyReportTransport,
  createWorkerHealthServer,
  scheduleDueAlertEmailDigests,
  scheduleDueGitHubDispatches,
  scheduleDueWebhookDeliveries,
  scheduleRetentionCleanup,
  scheduleWeeklyReports
} from "./worker-notifications.js";
import {
  createClaimTrackingWorkerQueue,
  runWorkerProcessStep,
  runWorkerStep
} from "./worker-steps.js";

const WORKER_SHUTDOWN_GRACE_MS = 30_000;

export function createProcessedEventStore(db: Queryable): ProcessedEventStore {
  return {
    async upsertProcessedEvent(input): Promise<{ inserted: boolean }> {
      const result = await db.query<{ event_id: string }>(
        `
          INSERT INTO processed_events (event_id, project_id, event_type, fingerprint, normalized_message, processed_at)
          VALUES ($1, $2, $3, $4, $5, now())
          ON CONFLICT (event_id) DO NOTHING
          RETURNING event_id::text AS event_id
        `,
        [
          input.event_id,
          input.project_id,
          input.event_type,
          input.fingerprint,
          input.normalized_message
        ]
      );

      return {
        inserted: result.rows.length > 0
      };
    }
  };
}

export {
  assertWorkerRedisReady,
  assertWorkerS3BucketReady,
  assertWorkerSchema,
  createWorkerShutdownState,
  parseWorkerEnv,
  resolveWorkerEmailAssetBaseUrl
} from "./worker-env.js";

export {
  buildGitHubAppJwt,
  createAlertEmailDigestTransport,
  createAlertTransport,
  createGitHubDispatchPublisher,
  createGitHubDispatchTransport,
  createLifecycleWebhookPublisher,
  createLifecycleWebhookTransport,
  createWorkerHealthServer,
  createWeeklyReportTransport,
  encodeBase64Url,
  getIncidentStatusForDispatchEvent,
  normalizeGitHubPrivateKey,
  scheduleDueAlertEmailDigests,
  scheduleDueGitHubDispatches,
  scheduleDueWebhookDeliveries,
  scheduleRetentionCleanup,
  scheduleWeeklyReports
} from "./worker-notifications.js";

export async function runAvailabilityCheckLoop(input: {
  logger: RuntimeLogger;
  shutdownState: WorkerShutdownState;
  intervalMs: number;
  processBatch: () => Promise<{ processed: boolean; reason?: string }>;
}): Promise<void> {
  while (!input.shutdownState.isShuttingDown()) {
    await runWorkerProcessStep(input.logger, "availability-checks", input.processBatch);
    await delayUntilNextPollOrShutdown(input.intervalMs, input.shutdownState);
  }
}

export async function runWorkerFromEnv(
  envInput: Record<string, string | undefined>
): Promise<void> {
  const env = parseWorkerEnv(envInput);
  registerWorkerDogfooding(envInput);
  const logger = createRuntimeLoggerFromEnv({
    app: "worker",
    defaultService: "debugbundle-worker",
    env: envInput,
    ...(process.env["npm_package_version"] === undefined
      ? {}
      : { version: process.env["npm_package_version"] })
  });
  const dbSsl = buildPostgresSslConfig(env.DB_SSL_MODE);

  const startupPool = new Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ...(dbSsl === undefined ? {} : { ssl: dbSsl })
  });

  try {
    await buildWorkerReadinessCheck({
      env,
      queryable: {
        query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) =>
          startupPool.query<Row>(sql, params)
      }
    })();
  } finally {
    await startupPool.end();
  }

  const pool = new Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ...(dbSsl === undefined ? {} : { ssl: dbSsl })
  });

  const queryable = createPoolQueryable(pool);
  const shutdownState = createWorkerShutdownState();
  const readinessCheck = buildWorkerReadinessCheck({ env, queryable });
  const drainingReadinessCheck = async (): Promise<void> => {
    await shutdownState.readinessCheck(readinessCheck);
  };
  const healthServer =
    env.WORKER_HEALTH_PORT > 0
      ? createWorkerHealthServer({
          port: env.WORKER_HEALTH_PORT,
          readinessCheck: drainingReadinessCheck
        })
      : null;

  const queue = createClaimTrackingWorkerQueue(
    createRedisQueueClient({
      redisUrl: env.REDIS_URL
    })
  );

  const objectStore = createS3ObjectStoreClient({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    forcePathStyle: true
  });

  const processedEventStore = createProcessedEventStore(queryable);
  const incidentStore = createPostgresMetadataStore(queryable);
  const billingStore = createPostgresBillingStore(queryable);
  const analyticsRollupStore = createPostgresAnalyticsRollupStore(queryable);
  const analyticsMetricsStore = createPostgresAnalyticsMetricsStore(queryable);
  const analyticsBundleGenerationStore = createPostgresAnalyticsBundleGenerationStore(queryable);
  const accountAnalyticsStore = createPostgresAccountAnalyticsStore({
    db: queryable,
    analyticsHashSecret: env.ANALYTICS_HASH_SECRET
  });
  const improvementOpportunityStore = createPostgresImprovementOpportunityStore(queryable, {
    accountAnalyticsStore
  });
  const availabilityCheckStore = createPostgresAvailabilityCheckStore(queryable);
  const alertDeliveryStore = createPostgresAlertDeliveryStore(queryable);
  const operationalEmailDeliveryStore = createPostgresOperationalEmailDeliveryStore(queryable);
  const slackDestinationStore = createPostgresSlackDestinationStore(queryable);
  const webhookDeliveryStore = createPostgresWebhookDeliveryStore(queryable);
  const githubStore = createPostgresGitHubStore(queryable);
  const incidentLifecycle = createIncidentLifecycleService({
    incidentStore,
    improvementStore: improvementOpportunityStore,
    webhookDeliveryStore,
    fallbackTargetUrl: env.LIFECYCLE_WEBHOOK_TARGET_URL ?? null,
    fallbackSigningSecret: env.LIFECYCLE_WEBHOOK_SECRET ?? null,
    accountAnalyticsStore,
    billingStore,
    operationalEmailDeliveryStore
  });
  const retentionStore = createPostgresRetentionStore(queryable);
  const weeklyReportChannelStore = createPostgresWeeklyReportChannelStore(queryable);
  const weeklyReportDeliveryStore = createPostgresWeeklyReportDeliveryStore(queryable);
  const frequencyCounter = createRedisIncidentFrequencyCounter({
    redisUrl: env.REDIS_URL,
    snapshotStore: queryable
  });
  const requestAnomalyCounter = createRedisRequestAnomalyCounter({
    redisUrl: env.REDIS_URL
  });
  const resolveOrganizationIdForProject = (projectId: string): Promise<string | null> =>
    getProjectOrganizationId(queryable, projectId);
  const lifecycleWebhookPublisher = createLifecycleWebhookPublisher({
    fallbackTargetUrl: env.LIFECYCLE_WEBHOOK_TARGET_URL ?? null,
    fallbackSigningSecret: env.LIFECYCLE_WEBHOOK_SECRET ?? null,
    webhookDeliveryStore,
    billingStore,
    operationalEmailDeliveryStore,
    accountAnalyticsStore,
    resolveOrganizationIdForProject
  });
  const githubDispatchPublisher = createGitHubDispatchPublisher({
    githubStore,
    accountAnalyticsStore,
    resolveOrganizationIdForProject
  });
  const lifecycleWebhookTransport = createLifecycleWebhookTransport({
    timeoutMs: env.WEBHOOK_DELIVERY_TIMEOUT_MS
  });
  const githubTokenRedis =
    env.GITHUB_APP_ID !== undefined && env.GITHUB_APP_PRIVATE_KEY !== undefined
      ? new Redis(env.REDIS_URL)
      : null;
  const githubDispatchTransport =
    env.GITHUB_APP_ID !== undefined &&
    env.GITHUB_APP_PRIVATE_KEY !== undefined &&
    githubTokenRedis !== null
      ? createGitHubDispatchTransport({
          appId: env.GITHUB_APP_ID,
          privateKey: env.GITHUB_APP_PRIVATE_KEY,
          tokenCache: {
            async get(key) {
              const value = await githubTokenRedis.get(key);
              return value;
            },
            async set(key, value, ttlSeconds) {
              await githubTokenRedis.set(key, value, "EX", ttlSeconds);
            }
          }
        })
      : null;
  const emailTransport =
    env.SES_FROM_EMAIL !== undefined
      ? createSesEmailTransport({
          region: env.SES_REGION ?? env.S3_REGION,
          fromEmail: formatProductFromEmail(env.SES_FROM_EMAIL),
          timeoutMs: env.WEEKLY_REPORT_EMAIL_TIMEOUT_MS,
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY
        })
      : null;
  const alertTransport = createAlertTransport({
    timeoutMs: env.WEBHOOK_DELIVERY_TIMEOUT_MS,
    emailTransport,
    slackDestinationStore,
    ...(env.INTEGRATION_SECRET_ENCRYPTION_KEY === undefined
      ? {}
      : { integrationSecretEncryptionKey: env.INTEGRATION_SECRET_ENCRYPTION_KEY }),
    resolveProjectName: (projectId) => getProjectName(queryable, projectId),
    appBaseUrl: normalizeWorkerBaseUrl(envInput["APP_BASE_URL"]),
    emailAssetBaseUrl: resolveWorkerEmailAssetBaseUrl(envInput),
    apiBaseUrl: normalizeWorkerBaseUrl(
      envInput["DEBUGBUNDLE_API_URL"] ?? envInput["API_BASE_URL"] ?? envInput["VITE_API_URL"]
    )
  });
  const alertEmailDigestTransport = createAlertEmailDigestTransport({
    emailTransport,
    resolveProjectName: (projectId) => getProjectName(queryable, projectId),
    appBaseUrl: normalizeWorkerBaseUrl(envInput["APP_BASE_URL"]),
    emailAssetBaseUrl: resolveWorkerEmailAssetBaseUrl(envInput),
    apiBaseUrl: normalizeWorkerBaseUrl(
      envInput["DEBUGBUNDLE_API_URL"] ?? envInput["API_BASE_URL"] ?? envInput["VITE_API_URL"]
    )
  });
  const weeklyReportTransport = createWeeklyReportTransport({
    emailTransport,
    slackDestinationStore,
    appBaseUrl: normalizeWorkerBaseUrl(envInput["APP_BASE_URL"]),
    emailAssetBaseUrl: resolveWorkerEmailAssetBaseUrl(envInput),
    ...(env.INTEGRATION_SECRET_ENCRYPTION_KEY === undefined
      ? {}
      : { integrationSecretEncryptionKey: env.INTEGRATION_SECRET_ENCRYPTION_KEY })
  });
  const appBaseUrl = normalizeWorkerBaseUrl(envInput["APP_BASE_URL"]);
  const emailAssetBaseUrl = resolveWorkerEmailAssetBaseUrl(envInput);
  const retentionCleanupRunner = createRetentionCleanupService({
    retentionStore,
    objectStore
  });
  const docsBaseUrl =
    normalizeWorkerBaseUrl(envInput["DEBUGBUNDLE_DOCS_URL"]) ??
    (normalizeWorkerBaseUrl(envInput["PUBLIC_SITE_URL"]) === null
      ? null
      : `${normalizeWorkerBaseUrl(envInput["PUBLIC_SITE_URL"])}/docs`);

  logger.info(
    {
      poll_interval_ms: env.WORKER_POLL_INTERVAL_MS,
      availability_check_loop_interval_ms: env.AVAILABILITY_CHECK_LOOP_INTERVAL_MS,
      availability_check_claim_batch_size: env.AVAILABILITY_CHECK_CLAIM_BATCH_SIZE,
      availability_check_concurrency: env.AVAILABILITY_CHECK_CONCURRENCY,
      run_once: env.WORKER_RUN_ONCE === "1"
    },
    "worker_started"
  );

  const runClaimedProcessStep = async <Result extends { processed: boolean; reason?: string }>(
    jobName: string,
    work: () => Promise<Result>
  ): Promise<Result> => runWorkerProcessStep(logger, jobName, work, queue);

  let lastAvailabilityRetentionPurgeAt = 0;
  const processAvailabilityBatch = async (): Promise<{ processed: boolean; reason?: string }> => {
    const now = Date.now();
    const purgeRetainedDataOnNoDue = now - lastAvailabilityRetentionPurgeAt >= 60_000;
    if (purgeRetainedDataOnNoDue) {
      lastAvailabilityRetentionPurgeAt = now;
    }

    return await processAvailabilityCheckBatch({
      availabilityCheckStore,
      incidentStore,
      incidentLifecycle,
      queue,
      objectStore,
      lifecycleWebhookPublisher,
      githubDispatchPublisher,
      logger,
      batchSize: env.AVAILABILITY_CHECK_CLAIM_BATCH_SIZE,
      concurrency: env.AVAILABILITY_CHECK_CONCURRENCY,
      purgeRetainedDataOnNoDue
    });
  };

  let workerShutdownStarted = false;
  let workerForceExitTimer: NodeJS.Timeout | null = null;
  function requestWorkerShutdown(signal: NodeJS.Signals): void {
    if (workerShutdownStarted) {
      return;
    }

    workerShutdownStarted = true;
    shutdownState.requestShutdown();
    logger.info({ signal }, "worker_draining");

    workerForceExitTimer = setTimeout(() => {
      logger.error({ signal }, "worker_shutdown_timeout");
      process.exit(1);
    }, WORKER_SHUTDOWN_GRACE_MS);
    workerForceExitTimer.unref();
  }

  if (process.env["NODE_ENV"] !== "test") {
    process.once("SIGTERM", () => {
      requestWorkerShutdown("SIGTERM");
    });
    process.once("SIGINT", () => {
      requestWorkerShutdown("SIGINT");
    });
  }

  let availabilityLoopPromise: Promise<void> | null = null;
  if (env.WORKER_RUN_ONCE === "1") {
    await runWorkerProcessStep(logger, "availability-checks", processAvailabilityBatch);
  } else {
    availabilityLoopPromise = runAvailabilityCheckLoop({
      logger,
      shutdownState,
      intervalMs: env.AVAILABILITY_CHECK_LOOP_INTERVAL_MS,
      processBatch: processAvailabilityBatch
    });
  }

  try {
    do {
      if (shutdownState.isShuttingDown()) {
        break;
      }

      const normalizeResult = await runClaimedProcessStep("normalize-events", async () =>
        processNextNormalizeEventsJob({
          queue,
          objectStore,
          processedEventStore,
          requestAnomalyCounter,
          improvementBundleWorker: {
            improvementOpportunityStore,
            billingStore,
            webhookDeliveryStore,
            operationalEmailDeliveryStore,
            accountAnalyticsStore,
            resolveOrganizationIdForProject,
            fallbackTargetUrl: env.LIFECYCLE_WEBHOOK_TARGET_URL ?? null,
            fallbackSigningSecret: env.LIFECYCLE_WEBHOOK_SECRET ?? null,
            objectStore,
            apiBaseUrl: normalizeWorkerBaseUrl(
              envInput["DEBUGBUNDLE_API_URL"] ??
                envInput["API_BASE_URL"] ??
                envInput["VITE_API_URL"]
            ),
            appBaseUrl: normalizeWorkerBaseUrl(envInput["APP_BASE_URL"]),
            docsBaseUrl
          }
        })
      );

      if (!normalizeResult.processed) {
        const analyticsAggregateResult = await runClaimedProcessStep(
          "aggregate-analytics-events",
          async () =>
            processNextAggregateAnalyticsEventsJob({
              queue: queue as unknown as AggregateAnalyticsWorkerQueue,
              objectStore,
              analyticsRollupStore
            })
        );

        if (!analyticsAggregateResult.processed) {
          const groupResult = await runClaimedProcessStep("group-incident", async () =>
            processNextGroupIncidentJob({
              queue,
              alertEvaluationQueue: queue,
              logger,
              incidentStore,
              frequencyCounter,
              lifecycleWebhookPublisher,
              githubDispatchPublisher,
              objectStore,
              improvementBundleWorker: {
                improvementOpportunityStore,
                billingStore,
                webhookDeliveryStore,
                operationalEmailDeliveryStore,
                accountAnalyticsStore,
                resolveOrganizationIdForProject,
                fallbackTargetUrl: env.LIFECYCLE_WEBHOOK_TARGET_URL ?? null,
                fallbackSigningSecret: env.LIFECYCLE_WEBHOOK_SECRET ?? null,
                objectStore,
                apiBaseUrl: normalizeWorkerBaseUrl(
                  envInput["DEBUGBUNDLE_API_URL"] ??
                    envInput["API_BASE_URL"] ??
                    envInput["VITE_API_URL"]
                ),
                appBaseUrl: normalizeWorkerBaseUrl(envInput["APP_BASE_URL"]),
                docsBaseUrl
              }
            })
          );

          if (!groupResult.processed) {
            const buildBundleResult = await runClaimedProcessStep("build-bundle", async () =>
              processNextBuildBundleJob({
                queue,
                logger,
                env: envInput,
                incidentStore,
                objectStore,
                billingStore,
                operationalEmailDeliveryStore,
                accountAnalyticsStore,
                resolveOrganizationIdForProject
              })
            );

            if (!buildBundleResult.processed) {
              const buildImprovementBundleResult = await runClaimedProcessStep(
                "build-improvement-bundle",
                async () =>
                  processNextBuildImprovementBundleJob({
                    queue: queue as unknown as ImprovementBundleJobQueue,
                    logger,
                    dependencies: {
                      improvementOpportunityStore,
                      billingStore,
                      webhookDeliveryStore,
                      operationalEmailDeliveryStore,
                      accountAnalyticsStore,
                      resolveOrganizationIdForProject,
                      fallbackTargetUrl: env.LIFECYCLE_WEBHOOK_TARGET_URL ?? null,
                      fallbackSigningSecret: env.LIFECYCLE_WEBHOOK_SECRET ?? null,
                      objectStore,
                      apiBaseUrl: normalizeWorkerBaseUrl(
                        envInput["DEBUGBUNDLE_API_URL"] ??
                          envInput["API_BASE_URL"] ??
                          envInput["VITE_API_URL"]
                      ),
                      appBaseUrl: normalizeWorkerBaseUrl(envInput["APP_BASE_URL"]),
                      docsBaseUrl
                    }
                  })
              );

              if (!buildImprovementBundleResult.processed) {
                const buildAnalyticsBundleResult = await runWorkerProcessStep(
                  logger,
                  "build-analytics-bundle",
                  async () =>
                    processNextBuildAnalyticsBundleJob({
                      queue: queue as unknown as BuildAnalyticsBundleWorkerQueue,
                      analyticsBundleGenerationStore,
                      analyticsMetricsStore,
                      objectStore,
                      logger
                    })
                );

                if (!buildAnalyticsBundleResult.processed) {
                  const buildReproductionResult = await runClaimedProcessStep(
                    "build-reproduction",
                    async () =>
                      processNextBuildReproductionJob({
                        queue,
                        accountAnalyticsStore,
                        objectStore,
                        resolveOrganizationIdForProject
                      })
                  );

                  if (!buildReproductionResult.processed) {
                    const evaluateAlertsResult = await runClaimedProcessStep(
                      "evaluate-alerts",
                      async () =>
                        processNextEvaluateAlertsJob({
                          queue,
                          alertStore: alertDeliveryStore,
                          alertTransport,
                          billingStore,
                          operationalEmailDeliveryStore,
                          accountAnalyticsStore,
                          resolveOrganizationIdForProject
                        })
                    );

                    if (!evaluateAlertsResult.processed) {
                      await runWorkerStep(logger, "schedule-alert-email-digests", async () => {
                        await scheduleDueAlertEmailDigests({
                          queue,
                          alertStore: alertDeliveryStore,
                          batchSize: env.WEBHOOK_DELIVERY_SCHEDULER_BATCH_SIZE
                        });
                      });
                      await runWorkerStep(logger, "schedule-webhook-deliveries", async () => {
                        await scheduleDueWebhookDeliveries({
                          queue,
                          webhookDeliveryStore,
                          batchSize: env.WEBHOOK_DELIVERY_SCHEDULER_BATCH_SIZE
                        });
                      });
                      await runWorkerStep(logger, "schedule-github-dispatches", async () => {
                        await scheduleDueGitHubDispatches({
                          queue,
                          githubStore,
                          batchSize: env.WEBHOOK_DELIVERY_SCHEDULER_BATCH_SIZE
                        });
                      });
                      await runWorkerStep(logger, "schedule-weekly-reports", async () => {
                        await scheduleWeeklyReports({
                          queue,
                          weeklyReportingStore: incidentStore,
                          weeklyReportChannelStore,
                          weeklyReportDeliveryStore,
                          batchSize: env.WEEKLY_REPORT_SCHEDULER_BATCH_SIZE
                        });
                      });
                      await runWorkerStep(logger, "schedule-retention-cleanup", async () => {
                        await scheduleRetentionCleanup({
                          queue,
                          intervalMs: env.RETENTION_CLEANUP_INTERVAL_MS
                        });
                      });
                      await runWorkerStep(logger, "schedule-trial-lifecycle-emails", async () => {
                        await scheduleTrialLifecycleEmails({
                          batchSize: env.WEEKLY_REPORT_SCHEDULER_BATCH_SIZE,
                          billingStore,
                          operationalEmailDeliveryStore
                        });
                      });

                      await runClaimedProcessStep("deliver-alert-email-digest", async () =>
                        processNextDeliverAlertEmailDigestJob({
                          queue,
                          alertStore: alertDeliveryStore,
                          alertEmailDigestTransport,
                          accountAnalyticsStore,
                          resolveOrganizationIdForProject
                        })
                      );

                      if (emailTransport !== null) {
                        await runWorkerStep(logger, "deliver-operational-email", async () => {
                          await processNextDeliverOperationalEmailJob({
                            logger,
                            appBaseUrl,
                            emailAssetBaseUrl,
                            operationalEmailDeliveryStore,
                            emailTransport,
                            accountAnalyticsStore,
                            resolveOrganizationIdForProject
                          });
                        });
                      }

                      await runClaimedProcessStep("deliver-webhook", async () =>
                        processNextDeliverWebhookJob({
                          queue,
                          logger,
                          webhookDeliveryStore,
                          lifecycleWebhookTransport,
                          accountAnalyticsStore,
                          resolveOrganizationIdForProject,
                          async onWebhookDisabled({ webhook_id, target_url }) {
                            try {
                              const webhook = await getWebhookOwnerNotificationRecipient(
                                queryable,
                                webhook_id
                              );
                              if (webhook === null) {
                                return;
                              }
                              await operationalEmailDeliveryStore.queueProjectOperationalEmailDelivery(
                                {
                                  project_id: webhook.projectId,
                                  kind: "webhook_auto_disabled",
                                  dedupe_key: `webhook_auto_disabled:${webhook_id}:${new Date().toISOString().slice(0, 10)}`,
                                  payload: {
                                    webhook_id,
                                    target_url
                                  }
                                }
                              );
                            } catch {
                              // Notification enqueue failure must not block delivery processing.
                            }
                          }
                        })
                      );

                      if (githubDispatchTransport !== null) {
                        await runClaimedProcessStep("deliver-github-dispatch", async () =>
                          processNextDeliverGitHubDispatchJob({
                            queue,
                            logger,
                            githubStore,
                            githubDispatchTransport,
                            accountAnalyticsStore,
                            resolveOrganizationIdForProject
                          })
                        );
                      }

                      const weeklyReportResult = await runClaimedProcessStep(
                        "generate-weekly-report",
                        async () =>
                          processNextGenerateWeeklyReportJob({
                            queue,
                            logger,
                            weeklyReportingStore: incidentStore,
                            weeklyReportChannelStore,
                            weeklyReportDeliveryStore,
                            weeklyReportTransport,
                            accountAnalyticsStore,
                            resolveOrganizationIdForProject
                          })
                      );

                      if (!weeklyReportResult.processed) {
                        await runClaimedProcessStep("cleanup-retention", async () =>
                          processNextCleanupRetentionJob({
                            queue,
                            retentionCleanupRunner
                          })
                        );
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (env.WORKER_RUN_ONCE === "1") {
        break;
      }

      await delayUntilNextPollOrShutdown(env.WORKER_POLL_INTERVAL_MS, shutdownState);
    } while (!shutdownState.isShuttingDown());
  } finally {
    shutdownState.requestShutdown();
    if (availabilityLoopPromise !== null) {
      await availabilityLoopPromise;
    }
    if (healthServer !== null) {
      healthServer.close();
    }
    if (githubTokenRedis !== null) {
      await githubTokenRedis.quit();
    }
    await frequencyCounter.close();
    await requestAnomalyCounter.close();
    await queue.close();
    await pool.end();
    if (workerForceExitTimer !== null) {
      clearTimeout(workerForceExitTimer);
    }
    if (workerShutdownStarted) {
      logger.info("worker_shutdown_complete");
    }
  }
}
