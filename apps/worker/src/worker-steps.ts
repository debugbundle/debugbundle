import { getErrorMessage, type RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";
import type { RedisQueueClient } from "../../../packages/storage/src/index.js";
import { captureWorkerDogfoodingStepFailure } from "./dogfooding.js";
import type { WorkerQueue } from "./processor.js";

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
  claimTracker?: { ackClaimedJobs(): Promise<void>; dropClaimedJobs(): void }
): Promise<Result> {
  try {
    const result = await work();
    await claimTracker?.ackClaimedJobs();
    return result;
  } catch (error) {
    claimTracker?.dropClaimedJobs();
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
  ackClaimedJobs(): Promise<void>;
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
