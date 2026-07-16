import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";

import type {
  BuildBundleJob,
  BuildReproductionJob,
  ClaimedRedisJob,
  CleanupRetentionJob,
  CreateRedisQueueClientInput,
  DeliverAlertEmailDigestJob,
  DeliverGitHubDispatchJob,
  DeliverWebhookJob,
  EvaluateAlertsJob,
  EvaluateAnalyticsOpportunitiesJob,
  GenerateWeeklyReportJob,
  GroupIncidentJob,
  NormalizeEventsJob,
  RedisQueueClient,
} from "./types.js";
import type { BuildAnalyticsBundleJob } from "./analytics-bundle-jobs.js";
import type { AggregateAnalyticsEventsJob } from "./analytics-ingestion-jobs.js";
import type { BuildImprovementBundleJob } from "./improvement-bundle-jobs.js";

type RedisJobName =
  | "normalize-events"
  | "aggregate-analytics-events"
  | "group-incident"
  | "build-bundle"
  | "build-analytics-bundle"
  | "evaluate-analytics-opportunities"
  | "build-improvement-bundle"
  | "build-reproduction"
  | "evaluate-alerts"
  | "deliver-alert-email-digest"
  | "deliver-webhook"
  | "deliver-github-dispatch"
  | "generate-weekly-report"
  | "cleanup-retention";

type RedisJobPayload =
  | NormalizeEventsJob
  | AggregateAnalyticsEventsJob
  | GroupIncidentJob
  | BuildBundleJob
  | BuildAnalyticsBundleJob
  | EvaluateAnalyticsOpportunitiesJob
  | BuildImprovementBundleJob
  | BuildReproductionJob
  | EvaluateAlertsJob
  | DeliverAlertEmailDigestJob
  | DeliverWebhookJob
  | DeliverGitHubDispatchJob
  | GenerateWeeklyReportJob
  | CleanupRetentionJob;

interface ProcessingEnvelope {
  claim_id: string;
  payload: string;
}

const DEFAULT_PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;

export function createRedisQueueClient(input: CreateRedisQueueClientInput): RedisQueueClient {
  const redis = new Redis(input.redisUrl);

  function pendingQueueKey(jobName: RedisJobName): string {
    return `jobs:${jobName}`;
  }

  function processingQueueKey(jobName: RedisJobName): string {
    return `jobs:${jobName}:processing`;
  }

  async function enqueue(jobName: "normalize-events", payload: NormalizeEventsJob): Promise<void>;
  async function enqueue(jobName: "aggregate-analytics-events", payload: AggregateAnalyticsEventsJob): Promise<void>;
  async function enqueue(jobName: "group-incident", payload: GroupIncidentJob): Promise<void>;
  async function enqueue(jobName: "build-bundle", payload: BuildBundleJob): Promise<void>;
  async function enqueue(jobName: "build-analytics-bundle", payload: BuildAnalyticsBundleJob): Promise<void>;
  async function enqueue(
    jobName: "evaluate-analytics-opportunities",
    payload: EvaluateAnalyticsOpportunitiesJob
  ): Promise<void>;
  async function enqueue(jobName: "build-improvement-bundle", payload: BuildImprovementBundleJob): Promise<void>;
  async function enqueue(jobName: "build-reproduction", payload: BuildReproductionJob): Promise<void>;
  async function enqueue(jobName: "evaluate-alerts", payload: EvaluateAlertsJob): Promise<void>;
  async function enqueue(jobName: "deliver-alert-email-digest", payload: DeliverAlertEmailDigestJob): Promise<void>;
  async function enqueue(jobName: "deliver-webhook", payload: DeliverWebhookJob): Promise<void>;
  async function enqueue(jobName: "deliver-github-dispatch", payload: DeliverGitHubDispatchJob): Promise<void>;
  async function enqueue(jobName: "generate-weekly-report", payload: GenerateWeeklyReportJob): Promise<void>;
  async function enqueue(jobName: "cleanup-retention", payload: CleanupRetentionJob): Promise<void>;
  async function enqueue(
    jobName: RedisJobName,
    payload: RedisJobPayload
  ): Promise<void> {
    await redis.rpush(pendingQueueKey(jobName), JSON.stringify(payload));
  }

  async function dequeue(jobName: "normalize-events"): Promise<NormalizeEventsJob | null>;
  async function dequeue(jobName: "aggregate-analytics-events"): Promise<AggregateAnalyticsEventsJob | null>;
  async function dequeue(jobName: "group-incident"): Promise<GroupIncidentJob | null>;
  async function dequeue(jobName: "build-bundle"): Promise<BuildBundleJob | null>;
  async function dequeue(jobName: "build-analytics-bundle"): Promise<BuildAnalyticsBundleJob | null>;
  async function dequeue(
    jobName: "evaluate-analytics-opportunities"
  ): Promise<EvaluateAnalyticsOpportunitiesJob | null>;
  async function dequeue(jobName: "build-improvement-bundle"): Promise<BuildImprovementBundleJob | null>;
  async function dequeue(jobName: "build-reproduction"): Promise<BuildReproductionJob | null>;
  async function dequeue(jobName: "evaluate-alerts"): Promise<EvaluateAlertsJob | null>;
  async function dequeue(jobName: "deliver-alert-email-digest"): Promise<DeliverAlertEmailDigestJob | null>;
  async function dequeue(jobName: "deliver-webhook"): Promise<DeliverWebhookJob | null>;
  async function dequeue(jobName: "deliver-github-dispatch"): Promise<DeliverGitHubDispatchJob | null>;
  async function dequeue(jobName: "generate-weekly-report"): Promise<GenerateWeeklyReportJob | null>;
  async function dequeue(jobName: "cleanup-retention"): Promise<CleanupRetentionJob | null>;
  async function dequeue(
    jobName: RedisJobName
  ): Promise<RedisJobPayload | null> {
    const raw = await redis.lpop(pendingQueueKey(jobName));
    if (raw === null) {
      return null;
    }

    return JSON.parse(raw) as RedisJobPayload;
  }

  async function reclaimStaleProcessingJobs(jobName: RedisJobName, olderThanMs: number): Promise<number> {
    const processingKey = processingQueueKey(jobName);
    const staleMembers = await redis.zrangebyscore(processingKey, "-inf", String(olderThanMs));
    if (staleMembers.length === 0) {
      return 0;
    }

    let reclaimed = 0;
    for (const member of staleMembers) {
      const removed = await redis.zrem(processingKey, member);
      if (removed !== 1) {
        continue;
      }

      const envelope = JSON.parse(member) as ProcessingEnvelope;
      await redis.rpush(pendingQueueKey(jobName), envelope.payload);
      reclaimed += 1;
    }

    return reclaimed;
  }

  async function claim(jobName: "normalize-events"): Promise<ClaimedRedisJob<NormalizeEventsJob> | null>;
  async function claim(jobName: "aggregate-analytics-events"): Promise<ClaimedRedisJob<AggregateAnalyticsEventsJob> | null>;
  async function claim(jobName: "group-incident"): Promise<ClaimedRedisJob<GroupIncidentJob> | null>;
  async function claim(jobName: "build-bundle"): Promise<ClaimedRedisJob<BuildBundleJob> | null>;
  async function claim(jobName: "build-analytics-bundle"): Promise<ClaimedRedisJob<BuildAnalyticsBundleJob> | null>;
  async function claim(
    jobName: "evaluate-analytics-opportunities"
  ): Promise<ClaimedRedisJob<EvaluateAnalyticsOpportunitiesJob> | null>;
  async function claim(jobName: "build-improvement-bundle"): Promise<ClaimedRedisJob<BuildImprovementBundleJob> | null>;
  async function claim(jobName: "build-reproduction"): Promise<ClaimedRedisJob<BuildReproductionJob> | null>;
  async function claim(jobName: "evaluate-alerts"): Promise<ClaimedRedisJob<EvaluateAlertsJob> | null>;
  async function claim(jobName: "deliver-alert-email-digest"): Promise<ClaimedRedisJob<DeliverAlertEmailDigestJob> | null>;
  async function claim(jobName: "deliver-webhook"): Promise<ClaimedRedisJob<DeliverWebhookJob> | null>;
  async function claim(jobName: "deliver-github-dispatch"): Promise<ClaimedRedisJob<DeliverGitHubDispatchJob> | null>;
  async function claim(jobName: "generate-weekly-report"): Promise<ClaimedRedisJob<GenerateWeeklyReportJob> | null>;
  async function claim(jobName: "cleanup-retention"): Promise<ClaimedRedisJob<CleanupRetentionJob> | null>;
  async function claim(jobName: RedisJobName): Promise<ClaimedRedisJob<RedisJobPayload> | null> {
    await reclaimStaleProcessingJobs(jobName, Date.now() - DEFAULT_PROCESSING_TIMEOUT_MS);

    const result = await redis.eval(
      `
        local payload = redis.call("LPOP", KEYS[1])
        if not payload then
          return nil
        end
        local envelope = cjson.encode({ claim_id = ARGV[2], payload = payload })
        redis.call("ZADD", KEYS[2], ARGV[1], envelope)
        return { payload, envelope }
      `,
      2,
      pendingQueueKey(jobName),
      processingQueueKey(jobName),
      String(Date.now()),
      randomUUID()
    );
    if (result === null) {
      return null;
    }

    const [raw, envelope] = result as [string, string];

    return {
      payload: JSON.parse(raw) as RedisJobPayload,
      async ack(): Promise<void> {
        await redis.zrem(processingQueueKey(jobName), envelope);
      }
    };
  }

  return {
    enqueue,

    async readJobQueue(
      jobName: RedisJobName
    ): Promise<string[]> {
      const values = await redis.lrange(pendingQueueKey(jobName), 0, -1);
      return values;
    },

    async clearJobQueue(
      jobName: RedisJobName
    ): Promise<void> {
      await redis.del(pendingQueueKey(jobName), processingQueueKey(jobName));
    },

    async acquireLease(key: string, ttlSeconds: number): Promise<boolean> {
      const result = await redis.set(key, "1", "EX", ttlSeconds, "NX");
      return result === "OK";
    },

    async releaseLease(key: string): Promise<void> {
      await redis.del(key);
    },

    dequeue,
    claim,
    reclaimStaleProcessingJobs,

    async close(): Promise<void> {
      await redis.quit();
    }
  };
}
