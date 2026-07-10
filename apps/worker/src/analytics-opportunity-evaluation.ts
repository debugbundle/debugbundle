import type {
  AnalyticsOpportunityEvaluator,
  AnalyticsOpportunitySchedulerStore,
  EvaluateAnalyticsOpportunitiesJob
} from "../../../packages/storage/src/index.js";
import type { WorkerProcessResult } from "./processor.js";

const ANALYTICS_OPPORTUNITY_EVALUATION_LEASE_KEY = "leases:analytics-opportunities:schedule";
const DEFAULT_ANALYTICS_OPPORTUNITY_EVALUATION_BATCH_SIZE = 25;

export interface AnalyticsOpportunityEvaluationQueue {
  dequeue(
    jobName: "evaluate-analytics-opportunities"
  ): Promise<EvaluateAnalyticsOpportunitiesJob | null>;
  enqueue(
    jobName: "evaluate-analytics-opportunities",
    payload: EvaluateAnalyticsOpportunitiesJob
  ): Promise<void>;
  acquireLease?(key: string, ttlSeconds: number): Promise<boolean>;
}

export async function scheduleAnalyticsOpportunityEvaluation(input: {
  queue: Pick<AnalyticsOpportunityEvaluationQueue, "enqueue"> &
    Partial<Pick<AnalyticsOpportunityEvaluationQueue, "acquireLease">>;
  intervalMs: number;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const ttlSeconds = Math.max(60, Math.ceil(input.intervalMs / 1000));

  if (input.queue.acquireLease !== undefined) {
    const acquired = await input.queue.acquireLease(
      ANALYTICS_OPPORTUNITY_EVALUATION_LEASE_KEY,
      ttlSeconds
    );
    if (!acquired) {
      return false;
    }
  }

  await input.queue.enqueue("evaluate-analytics-opportunities", {
    scheduled_at: now.toISOString(),
    cursor: null
  });
  return true;
}

export async function processNextEvaluateAnalyticsOpportunitiesJob(input: {
  queue: AnalyticsOpportunityEvaluationQueue;
  projectStore: AnalyticsOpportunitySchedulerStore;
  opportunityEvaluator: AnalyticsOpportunityEvaluator;
  batchSize?: number;
}): Promise<WorkerProcessResult> {
  const job = await input.queue.dequeue("evaluate-analytics-opportunities");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  const batchSize = input.batchSize ?? DEFAULT_ANALYTICS_OPPORTUNITY_EVALUATION_BATCH_SIZE;
  const projectIds = await input.projectStore.listProjectsForOpportunityEvaluation({
    cursor: job.cursor,
    limit: batchSize,
    occurred_at: job.scheduled_at
  });

  for (const projectId of projectIds) {
    await input.opportunityEvaluator.evaluateProjectOpportunities({
      project_id: projectId,
      occurred_at: job.scheduled_at
    });
  }

  const lastProjectId = projectIds.at(-1);
  if (lastProjectId !== undefined && projectIds.length === batchSize) {
    await input.queue.enqueue("evaluate-analytics-opportunities", {
      scheduled_at: job.scheduled_at,
      cursor: lastProjectId
    });
  }

  return { processed: true };
}
