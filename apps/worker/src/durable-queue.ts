import { randomUUID } from "node:crypto";
import type { Queryable, RedisQueueClient } from "../../../packages/storage/src/index.js";
import {
  createWorkerJobStore,
  type WorkerJobClaim,
  type WorkerJobOptions
} from "../../../packages/storage/src/worker-job-store.js";
import { createSavepointQueryable } from "../../../packages/storage/src/savepoint-queryable.js";
import type { ClaimTrackingWorkerQueue } from "./worker-steps.js";
import type { WorkerQueue } from "./processor.js";

export interface DurableWorkerQueue extends ClaimTrackingWorkerQueue {
  enqueueInternal(name: string, payload: unknown, options?: WorkerJobOptions): Promise<void>;
  dequeueInternal(name: string): Promise<Record<string, unknown> | null>;
  failClaimedJobs(): Promise<void>;
  transaction<Result>(
    name: string,
    work: (db: Queryable, queue: DurableWorkerQueue) => Promise<Result>
  ): Promise<Result>;
}

function skippedReason(result: unknown): string | undefined {
  if (result === null || typeof result !== "object" || !("reason" in result)) return undefined;
  const reason = result.reason;
  return typeof reason === "string" &&
    [
      "monthly_quota_exceeded",
      "incident_missing",
      "invalid_event",
      "bundle_generation_disabled"
    ].includes(reason)
    ? reason
    : undefined;
}

/** Redis remains the compatible ingress; Postgres owns a job before Redis is acknowledged. */
export function createDurableWorkerQueue(
  db: Queryable,
  redis: RedisQueueClient,
  ownsRedis = true
): DurableWorkerQueue {
  if (!db.transaction) throw new Error("worker_transactions_required");
  const store = createWorkerJobStore(db);
  let pending: WorkerJobClaim | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  let renewal: Promise<void> | null = null;
  let leaseError: Error | undefined;

  function clearClaim(): void {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    pending = null;
    leaseError = undefined;
  }

  async function dequeue(name: string): Promise<Record<string, unknown> | null> {
    if (pending) throw new Error("worker_claim_overlap");
    let claim = await store.claim(name);
    if (
      !claim &&
      ![
        "evaluate-event-improvement",
        "evaluate-incident-improvement",
        "publish-incident-lifecycle",
        "delete-retained-object"
      ].includes(name)
    ) {
      const ingress = await (
        redis.claim as (name: string) => Promise<{
          claim_id?: string;
          payload: Record<string, unknown>;
          ack(): Promise<void>;
        } | null>
      )(name);
      if (ingress) {
        // An explicit regeneration is a new request even if its source event is unchanged.
        // A recovered legacy Redis claim may repeat that build; generation/accounting remain idempotent.
        await store.enqueue(
          name,
          ingress.payload,
          ingress.payload["trigger"] === "regeneration"
            ? { dedupeKey: `regeneration:${ingress.claim_id ?? randomUUID()}` }
            : {}
        );
        // A crash on either side of this acknowledgement is safe: re-adoption is deduplicated.
        await ingress.ack();
        claim = await store.claim(name);
      }
    }
    if (!claim) return null;
    pending = claim;
    const active = claim;
    heartbeat = setInterval(() => {
      if (renewal) return;
      renewal = store
        .renew(active)
        .catch((error) => {
          if (pending === active)
            leaseError = error instanceof Error ? error : new Error("worker_lease_renewal_failed");
        })
        .finally(() => {
          renewal = null;
        });
    }, 60_000);
    heartbeat.unref();
    return claim.payload;
  }

  const queue: DurableWorkerQueue = {
    // Durable inserts deduplicate directly; never scan an unbounded legacy reproduction queue.
    acquireLease: (key, ttlSeconds) => redis.acquireLease(key, ttlSeconds),
    releaseLease: (key) => redis.releaseLease(key),
    dequeue: dequeue as WorkerQueue["dequeue"],
    dequeueInternal: dequeue,
    enqueue: (async (name: string, payload: unknown) => {
      await store.enqueue(name, payload, pending === null ? {} : { dedupeKey: pending.id });
    }) as WorkerQueue["enqueue"],
    async enqueueInternal(name, payload, options) {
      await store.enqueue(name, payload, {
        ...(pending === null ? {} : { dedupeKey: pending.id }),
        ...options
      });
    },
    async ackClaimedJobs(result) {
      if (!pending) return;
      if (leaseError) throw leaseError;
      // The legacy processor reports unavailable input without throwing. A read
      // outage or invalid object must not erase the durable reproduction intent.
      if (
        pending.name === "build-reproduction" &&
        (result?.reason === "bundle_missing" || result?.reason === "bundle_invalid")
      ) {
        throw new Error("worker_reproduction_input_unavailable");
      }
      await store.complete(pending, skippedReason(result));
      clearClaim();
    },
    async failClaimedJobs() {
      try {
        if (pending) await store.fail(pending);
      } finally {
        clearClaim();
      }
    },
    dropClaimedJobs: clearClaim,
    async transaction(name, work) {
      // Claim before acquiring the transaction connection: this also works with a one-slot pool.
      const payload = await dequeue(name);
      let consumed = false;
      const takeClaim = (requested: string): Promise<Record<string, unknown> | null> => {
        if (requested !== name) throw new Error("worker_transaction_job_mismatch");
        if (consumed) return Promise.resolve(null);
        consumed = true;
        return Promise.resolve(payload);
      };
      if (pending === null) {
        return work(db, {
          ...queue,
          dequeue: takeClaim as WorkerQueue["dequeue"],
          dequeueInternal: takeClaim
        });
      }
      const active = pending;
      const result = await db.transaction!(async (connection) => {
        await connection.query("SET LOCAL statement_timeout = '30s'", []);
        await connection.query("SET LOCAL idle_in_transaction_session_timeout = '60s'", []);
        const tx = createSavepointQueryable(connection);
        const txStore = createWorkerJobStore(tx);
        await txStore.lock(active);
        const scoped: DurableWorkerQueue = {
          ...queue,
          dequeue: takeClaim as WorkerQueue["dequeue"],
          dequeueInternal: takeClaim,
          enqueue: (async (jobName: string, input: unknown) => {
            await txStore.enqueue(jobName, input, { dedupeKey: active.id });
          }) as WorkerQueue["enqueue"],
          async enqueueInternal(jobName, input, options) {
            await txStore.enqueue(jobName, input, { dedupeKey: active.id, ...options });
          }
        };
        const value = await work(tx, scoped);
        await txStore.complete(active, skippedReason(value));
        return value;
      });
      clearClaim();
      return result;
    },
    async close() {
      clearClaim();
      await renewal;
      if (ownsRedis) await redis.close();
    }
  };
  return queue;
}
