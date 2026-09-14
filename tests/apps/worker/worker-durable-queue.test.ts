import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Queryable, RedisQueueClient } from "../../../packages/storage/src/index.js";
import { createDurableWorkerQueue } from "../../../apps/worker/src/durable-queue.js";

const journal = vi.hoisted(() => ({
  enqueue: vi.fn(),
  claim: vi.fn(),
  lock: vi.fn(),
  renew: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn()
}));
vi.mock("../../../packages/storage/src/worker-job-store.js", () => ({
  createWorkerJobStore: () => journal
}));
const owned = {
  id: "a".repeat(64),
  token: "owner",
  name: "normalize-events",
  payload: { event_id: "event" },
  attempts: 1
};
const redis = { claim: vi.fn(), close: vi.fn(), acquireLease: vi.fn(), releaseLease: vi.fn() };
const db: Queryable = {
  query: vi.fn().mockResolvedValue({ rows: [] }),
  transaction: (callback) => callback(db)
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  journal.claim.mockResolvedValue(owned);
  journal.enqueue.mockResolvedValue("b".repeat(64));
  for (const fn of [journal.lock, journal.renew, journal.complete, journal.fail, redis.close])
    fn.mockResolvedValue(undefined);
  vi.mocked(db.query).mockResolvedValue({ rows: [] });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
const queue = (ownsRedis = true) =>
  createDurableWorkerQueue(db, redis as unknown as RedisQueueClient, ownsRedis);

it("does not acknowledge ingress until durable adoption succeeds", async () => {
  journal.claim.mockResolvedValueOnce(null);
  journal.enqueue.mockRejectedValueOnce(new Error("database_unavailable"));
  const ack = vi.fn();
  redis.claim.mockResolvedValue({ payload: owned.payload, ack });
  const worker = queue();
  await expect(worker.dequeue("normalize-events")).rejects.toThrow("database_unavailable");
  expect(ack).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  await worker.close();
});

it("can continue from the journal after a failed Redis acknowledgement", async () => {
  journal.claim.mockResolvedValueOnce(null);
  const ack = vi.fn().mockRejectedValue(new Error("redis_ack_failed"));
  redis.claim.mockResolvedValue({ payload: owned.payload, ack });
  const worker = queue();
  await expect(worker.dequeue("normalize-events")).rejects.toThrow("redis_ack_failed");
  expect(journal.enqueue).toHaveBeenCalledWith("normalize-events", owned.payload, {});
  expect(await worker.dequeue("normalize-events")).toEqual(owned.payload);
  expect(redis.claim).toHaveBeenCalledTimes(1);
  await worker.ackClaimedJobs({ processed: false, reason: "invalid_event" });
  expect(journal.complete).toHaveBeenCalledWith(owned, "invalid_event");
  expect(vi.getTimerCount()).toBe(0);
  await worker.close();
});

it.each(["bundle_missing", "bundle_invalid"])(
  "does not complete reproduction work when its source reports %s",
  async (reason) => {
    const claim = { ...owned, name: "build-reproduction" };
    journal.claim.mockResolvedValue(claim);
    const worker = queue();
    await worker.dequeue("build-reproduction");
    await expect(worker.ackClaimedJobs({ processed: false, reason })).rejects.toThrow(
      "worker_reproduction_input_unavailable"
    );
    expect(journal.complete).not.toHaveBeenCalled();
    await worker.failClaimedJobs();
    expect(journal.fail).toHaveBeenCalledWith(claim);
    expect(vi.getTimerCount()).toBe(0);
    await worker.close();
  }
);

it("bounds in-flight heartbeats and waits for renewal before closing its client", async () => {
  let finish!: () => void;
  journal.renew.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const worker = queue();
  await worker.dequeue("normalize-events");
  await expect(worker.dequeue("group-incident")).rejects.toThrow("worker_claim_overlap");
  await vi.advanceTimersByTimeAsync(240_000);
  expect(journal.renew).toHaveBeenCalledTimes(1);
  const closing = worker.close();
  expect(vi.getTimerCount()).toBe(0);
  expect(redis.close).not.toHaveBeenCalled();
  finish();
  await closing;
  expect(redis.close).toHaveBeenCalledTimes(1);
});

it("rejects completion after renewal fails and leaves retry to the journal", async () => {
  journal.renew.mockRejectedValue("transport closed");
  const worker = queue(false);
  await worker.dequeue("normalize-events");
  await vi.advanceTimersByTimeAsync(60_000);
  await expect(worker.ackClaimedJobs()).rejects.toThrow("worker_lease_renewal_failed");
  expect(journal.complete).not.toHaveBeenCalled();
  await worker.failClaimedJobs();
  expect(journal.fail).toHaveBeenCalledWith(owned);
  expect(vi.getTimerCount()).toBe(0);
  await worker.close();
  expect(redis.close).not.toHaveBeenCalled();
});

it("does not let a late heartbeat error poison a different active job", async () => {
  let reject!: (error: Error) => void;
  journal.renew.mockImplementation(
    () =>
      new Promise<void>((_resolve, rejectPromise) => {
        reject = rejectPromise;
      })
  );
  const worker = queue();
  await worker.dequeue("normalize-events");
  await vi.advanceTimersByTimeAsync(60_000);
  await worker.ackClaimedJobs();
  journal.claim.mockResolvedValue({ ...owned, id: "c".repeat(64), token: "new-owner" });
  await worker.dequeue("normalize-events");
  reject(new Error("old_renewal_failed"));
  await vi.advanceTimersByTimeAsync(0);
  await expect(worker.ackClaimedJobs()).resolves.toBeUndefined();
  await worker.close();
});

it("owns a single transactional dequeue and completes only after durable follow-ups", async () => {
  const worker = queue();
  await worker.transaction("normalize-events", async (_tx, scoped) => {
    expect(await scoped.dequeue("normalize-events")).toEqual(owned.payload);
    expect(await scoped.dequeue("normalize-events")).toBeNull();
    await scoped.enqueueInternal("evaluate-event-improvement", { event: "redacted" });
    expect(journal.complete).not.toHaveBeenCalled();
    return { processed: true };
  });
  expect(journal.lock).toHaveBeenCalledWith(owned);
  expect(journal.enqueue).toHaveBeenCalledWith(
    "evaluate-event-improvement",
    { event: "redacted" },
    { dedupeKey: owned.id }
  );
  expect(journal.complete).toHaveBeenCalledWith(owned, undefined);
  expect(vi.getTimerCount()).toBe(0);
  await worker.close();
});

it("retains ownership on transactional failure until failure handling releases it", async () => {
  const worker = queue();
  await expect(
    worker.transaction("normalize-events", async (_tx, scoped) => {
      await scoped.dequeue("group-incident");
    })
  ).rejects.toThrow("worker_transaction_job_mismatch");
  expect(journal.complete).not.toHaveBeenCalled();
  await worker.failClaimedJobs();
  expect(journal.fail).toHaveBeenCalledWith(owned);
  await worker.close();
});

it("never asks Redis for internal jobs and rejects nontransactional configuration", async () => {
  expect(() =>
    createDurableWorkerQueue({ query: db.query }, redis as unknown as RedisQueueClient)
  ).toThrow("worker_transactions_required");
  journal.claim.mockResolvedValue(null);
  const worker = queue();
  await worker.transaction("evaluate-event-improvement", async (_tx, scoped) => {
    expect(await scoped.dequeueInternal("evaluate-event-improvement")).toBeNull();
  });
  expect(redis.claim).not.toHaveBeenCalled();
  expect(journal.lock).not.toHaveBeenCalled();
  await worker.close();
});
