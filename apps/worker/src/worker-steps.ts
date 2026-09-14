import { getErrorMessage, type RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";
import type { RedisQueueClient } from "../../../packages/storage/src/index.js";
import { captureWorkerDogfoodingStepFailure } from "./dogfooding.js";
import type { WorkerQueue } from "./processor.js";
import type { WorkerShutdownState } from "./worker-env.js";

export async function runWorkerLane(input: {
  logger: RuntimeLogger;
  name: string;
  shutdown: WorkerShutdownState;
  idleIntervalMs: number;
  processPass(): Promise<{ processed: boolean }>;
}): Promise<void> {
  while (!input.shutdown.isShuttingDown()) {
    const result = await runWorkerProcessStep(input.logger, input.name, () => input.processPass());
    await input.shutdown.waitForNextPoll(result.processed ? 0 : input.idleIntervalMs);
  }
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function runWorkerStep(
  logger: RuntimeLogger,
  jobName: string,
  work: () => Promise<void>
): Promise<boolean> {
  try {
    await work();
    return true;
  } catch (error) {
    logger.error(
      { error_message: getErrorMessage(error, "unknown_worker_step_error"), job_name: jobName },
      "worker_step_failed"
    );
    captureWorkerDogfoodingStepFailure(jobName, error);
    return false;
  }
}

export async function runWorkerProcessStep<Result extends { processed: boolean; reason?: string }>(
  logger: RuntimeLogger,
  jobName: string,
  work: () => Promise<Result>,
  claimTracker?: {
    ackClaimedJobs(result?: { processed: boolean; reason?: string }): Promise<void>;
    dropClaimedJobs(): void;
    failClaimedJobs?(): Promise<void>;
  }
): Promise<Result> {
  try {
    const result = await work();
    await claimTracker?.ackClaimedJobs(result);
    return result;
  } catch (error) {
    if (claimTracker?.failClaimedJobs) {
      await claimTracker.failClaimedJobs().catch(() => claimTracker.dropClaimedJobs());
    } else {
      claimTracker?.dropClaimedJobs();
    }
    logger.error(
      { error_message: getErrorMessage(error, "unknown_worker_step_error"), job_name: jobName },
      "worker_step_failed"
    );
    captureWorkerDogfoodingStepFailure(jobName, error);
    return {
      processed: false,
      reason: "step_error"
    } as Result;
  }
}

export interface ClaimTrackingWorkerQueue extends WorkerQueue {
  acquireLease(key: string, ttlSeconds: number): Promise<boolean>;
  ackClaimedJobs(result?: { processed: boolean; reason?: string }): Promise<void>;
  close(): Promise<void>;
  dropClaimedJobs(): void;
  releaseLease(key: string): Promise<void>;
}

export function createClaimTrackingWorkerQueue(queue: RedisQueueClient): ClaimTrackingWorkerQueue {
  let pendingAcks: Array<() => Promise<void>> = [];

  return {
    ...queue,
    dequeue: (async (jobName: Parameters<RedisQueueClient["claim"]>[0]) => {
      const claimed = await queue.claim(jobName);
      if (claimed === null) {
        return null;
      }

      pendingAcks.push(() => claimed.ack());
      return claimed.payload;
    }) as WorkerQueue["dequeue"],
    async ackClaimedJobs(): Promise<void> {
      const acks = pendingAcks;
      pendingAcks = [];
      for (const ack of acks) {
        await ack();
      }
    },
    dropClaimedJobs(): void {
      pendingAcks = [];
    }
  };
}
