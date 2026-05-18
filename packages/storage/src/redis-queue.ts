import { Redis } from "ioredis";

import type {
  BuildBundleJob,
  BuildReproductionJob,
  CleanupRetentionJob,
  CreateRedisQueueClientInput,
  DeliverAlertEmailDigestJob,
  DeliverGitHubDispatchJob,
  DeliverWebhookJob,
  EvaluateAlertsJob,
  GenerateWeeklyReportJob,
  GroupIncidentJob,
  NormalizeEventsJob,
  RedisQueueClient,
} from "./types.js";

export function createRedisQueueClient(input: CreateRedisQueueClientInput): RedisQueueClient {
  const redis = new Redis(input.redisUrl);

  async function enqueue(jobName: "normalize-events", payload: NormalizeEventsJob): Promise<void>;
  async function enqueue(jobName: "group-incident", payload: GroupIncidentJob): Promise<void>;
  async function enqueue(jobName: "build-bundle", payload: BuildBundleJob): Promise<void>;
  async function enqueue(jobName: "build-reproduction", payload: BuildReproductionJob): Promise<void>;
  async function enqueue(jobName: "evaluate-alerts", payload: EvaluateAlertsJob): Promise<void>;
  async function enqueue(jobName: "deliver-alert-email-digest", payload: DeliverAlertEmailDigestJob): Promise<void>;
  async function enqueue(jobName: "deliver-webhook", payload: DeliverWebhookJob): Promise<void>;
  async function enqueue(jobName: "deliver-github-dispatch", payload: DeliverGitHubDispatchJob): Promise<void>;
  async function enqueue(jobName: "generate-weekly-report", payload: GenerateWeeklyReportJob): Promise<void>;
  async function enqueue(jobName: "cleanup-retention", payload: CleanupRetentionJob): Promise<void>;
  async function enqueue(
    jobName: "normalize-events" | "group-incident" | "build-bundle" | "build-reproduction" | "evaluate-alerts" | "deliver-alert-email-digest" | "deliver-webhook" | "deliver-github-dispatch" | "generate-weekly-report" | "cleanup-retention",
    payload: NormalizeEventsJob | GroupIncidentJob | BuildBundleJob | BuildReproductionJob | EvaluateAlertsJob | DeliverAlertEmailDigestJob | DeliverWebhookJob | DeliverGitHubDispatchJob | GenerateWeeklyReportJob | CleanupRetentionJob
  ): Promise<void> {
    await redis.rpush(`jobs:${jobName}`, JSON.stringify(payload));
  }

  async function dequeue(jobName: "normalize-events"): Promise<NormalizeEventsJob | null>;
  async function dequeue(jobName: "group-incident"): Promise<GroupIncidentJob | null>;
  async function dequeue(jobName: "build-bundle"): Promise<BuildBundleJob | null>;
  async function dequeue(jobName: "build-reproduction"): Promise<BuildReproductionJob | null>;
  async function dequeue(jobName: "evaluate-alerts"): Promise<EvaluateAlertsJob | null>;
  async function dequeue(jobName: "deliver-alert-email-digest"): Promise<DeliverAlertEmailDigestJob | null>;
  async function dequeue(jobName: "deliver-webhook"): Promise<DeliverWebhookJob | null>;
  async function dequeue(jobName: "deliver-github-dispatch"): Promise<DeliverGitHubDispatchJob | null>;
  async function dequeue(jobName: "generate-weekly-report"): Promise<GenerateWeeklyReportJob | null>;
  async function dequeue(jobName: "cleanup-retention"): Promise<CleanupRetentionJob | null>;
  async function dequeue(
    jobName: "normalize-events" | "group-incident" | "build-bundle" | "build-reproduction" | "evaluate-alerts" | "deliver-alert-email-digest" | "deliver-webhook" | "deliver-github-dispatch" | "generate-weekly-report" | "cleanup-retention"
  ): Promise<NormalizeEventsJob | GroupIncidentJob | BuildBundleJob | BuildReproductionJob | EvaluateAlertsJob | DeliverAlertEmailDigestJob | DeliverWebhookJob | DeliverGitHubDispatchJob | GenerateWeeklyReportJob | CleanupRetentionJob | null> {
    const raw = await redis.lpop(`jobs:${jobName}`);
    if (raw === null) {
      return null;
    }

    return JSON.parse(raw) as NormalizeEventsJob | GroupIncidentJob | BuildBundleJob | BuildReproductionJob | EvaluateAlertsJob | DeliverAlertEmailDigestJob | DeliverWebhookJob | DeliverGitHubDispatchJob | GenerateWeeklyReportJob | CleanupRetentionJob;
  }

  return {
    enqueue,

    async readJobQueue(
      jobName: "normalize-events" | "group-incident" | "build-bundle" | "build-reproduction" | "evaluate-alerts" | "deliver-alert-email-digest" | "deliver-webhook" | "deliver-github-dispatch" | "generate-weekly-report" | "cleanup-retention"
    ): Promise<string[]> {
      const values = await redis.lrange(`jobs:${jobName}`, 0, -1);
      return values;
    },

    async clearJobQueue(
      jobName: "normalize-events" | "group-incident" | "build-bundle" | "build-reproduction" | "evaluate-alerts" | "deliver-alert-email-digest" | "deliver-webhook" | "deliver-github-dispatch" | "generate-weekly-report" | "cleanup-retention"
    ): Promise<void> {
      await redis.del(`jobs:${jobName}`);
    },

    async acquireLease(key: string, ttlSeconds: number): Promise<boolean> {
      const result = await redis.set(key, "1", "EX", ttlSeconds, "NX");
      return result === "OK";
    },

    async releaseLease(key: string): Promise<void> {
      await redis.del(key);
    },

    dequeue,

    async close(): Promise<void> {
      await redis.quit();
    }
  };
}
