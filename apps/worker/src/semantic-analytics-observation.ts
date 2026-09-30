import type { ObjectStoreReader } from "../../../packages/storage/src/index.js";
import { recordSemanticAnalyticsCatalogObservationInTransaction } from "../../../packages/storage/src/semantic-analytics-observation-store.js";
import { recordProjectSemanticFunnelFactsInTransaction } from "../../../packages/storage/src/semantic-analytics-funnel-projection.js";
import { recordPortfolioSemanticFunnelFactsInTransaction } from "../../../packages/storage/src/semantic-analytics-portfolio-projection.js";
import { loadVerifiedSemanticAnalyticsWorkerInput } from "../../../packages/storage/src/semantic-analytics-worker-input.js";
import type { DurableWorkerQueue } from "./durable-queue.js";
import type { WorkerProcessResult } from "./processor.js";

/** Project catalog and protected funnel effects; report reads remain gated. */
export async function processNextSemanticAnalyticsObservationJob(input: {
  queue: DurableWorkerQueue;
  objectStore: Pick<ObjectStoreReader, "getObject">;
}): Promise<WorkerProcessResult> {
  return input.queue.transaction("process-semantic-analytics-event", async (tx, queue) => {
    const payload = await queue.dequeueInternal("process-semantic-analytics-event");
    if (payload === null) return { processed: false, reason: "no_jobs" };
    const jobId = queue.getActiveJobId?.();
    if (jobId === null || jobId === undefined) throw new Error("semantic_worker_job_unclaimed");
    const verified = await loadVerifiedSemanticAnalyticsWorkerInput(tx, input.objectStore, {
      id: jobId,
      payload
    });
    if (verified === null) return { processed: false, reason: "receipt_unavailable" };
    const projectId = payload["project_id"];
    if (typeof projectId !== "string") throw new Error("semantic_worker_project_invalid");
    await recordSemanticAnalyticsCatalogObservationInTransaction(tx, projectId, verified);
    await recordProjectSemanticFunnelFactsInTransaction(tx, projectId, verified);
    await recordPortfolioSemanticFunnelFactsInTransaction(tx, projectId, verified);
    return { processed: true };
  });
}
