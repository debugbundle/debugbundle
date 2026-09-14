import { expect, it, vi } from "vitest";
import { createWorkerJobStore } from "../../../packages/storage/src/worker-job-store.js";

const projectId = "142f36fd-4e11-4817-9530-5c1f6b3b3aa1";
const id = "a".repeat(64);
const claim = {
  id,
  token: "fenced-owner",
  name: "build-bundle" as const,
  payload: {},
  attempts: 1
};

it("uses canonical persisted content for identity while keeping explicit requests distinct", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const store = createWorkerJobStore({ query });
  const a = await store.enqueue("build-bundle", {
    project_id: projectId,
    extra: { z: 1, a: [2, 3] },
    omitted: undefined
  });
  const b = await store.enqueue("build-bundle", {
    extra: { a: [2, 3], z: 1 },
    project_id: projectId
  });
  expect(a).toBe(b);
  expect(
    await store.enqueue("build-bundle", { extra: { a: [3, 2], z: 1 }, project_id: projectId })
  ).not.toBe(a);
  expect(
    await store.enqueue(
      "build-bundle",
      { extra: { a: [2, 3], z: 1 }, project_id: projectId },
      { dedupeKey: "manual-request" }
    )
  ).not.toBe(a);
});

it("rejects invalid scope, names and oversized evidence before persistence", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const store = createWorkerJobStore({ query });
  await expect(store.enqueue("run-shell", {})).rejects.toThrow();
  await expect(store.enqueue("build-bundle", { project_id: "wrong" })).rejects.toThrow();
  await expect(
    store.enqueue("build-bundle", { data: "x".repeat(2 * 1024 * 1024) })
  ).rejects.toThrow("worker_job_payload_too_large");
  await expect(store.enqueue("build-bundle", {}, { dependsOn: "wrong" })).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
  await expect(
    store.enqueue("publish-incident-lifecycle", { project_id: projectId }, { dependsOn: id })
  ).rejects.toThrow("worker_dependency_scope_invalid");
  query.mockResolvedValue({ rows: [{ id }] });
  await expect(
    store.enqueue("publish-incident-lifecycle", { project_id: projectId }, { dependsOn: id })
  ).resolves.toMatch(/^[a-f0-9]{64}$/);
});

it("requires successful fenced database updates before reporting lock, renewal or completion", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const store = createWorkerJobStore({ query });
  await expect(store.lock(claim)).rejects.toThrow("worker_job_lease_lost");
  await expect(store.renew(claim)).rejects.toThrow("worker_job_lease_lost");
  await expect(store.complete(claim)).rejects.toThrow("worker_job_lease_lost");
  query.mockResolvedValue({ rows: [{ id }] });
  await expect(store.lock(claim)).resolves.toBeUndefined();
  await expect(store.renew(claim)).resolves.toBeUndefined();
  await expect(store.complete(claim, "monthly_quota_exceeded")).resolves.toBeUndefined();
  await expect(store.complete(claim, "arbitrary_payload_text")).rejects.toThrow();
  query.mockRejectedValue(new Error("database_unavailable"));
  await expect(store.fail(claim)).rejects.toThrow("database_unavailable");
});

it("returns no work for an empty journal and retains the database-assigned attempt number", async () => {
  const query = vi
    .fn()
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValue({ rows: [{ id, attempts: 3, payload: { project_id: projectId } }] });
  const store = createWorkerJobStore({ query });
  expect(await store.claim("build-bundle")).toBeNull();
  const first = await store.claim("build-bundle");
  const second = await store.claim("build-bundle");
  expect(first).toMatchObject({
    id,
    name: "build-bundle",
    attempts: 3,
    payload: { project_id: projectId }
  });
  expect(first?.token).not.toBe(second?.token);
});

it("validates bounded operator requests and reports whether a retry actually changed a row", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const store = createWorkerJobStore({ query });
  await expect(store.inspect({ projectId, limit: 101 })).rejects.toThrow();
  await expect(store.inspect({ projectId, id: "bad" })).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
  expect(await store.inspect({ projectId: null })).toEqual([]);
  expect(await store.retryFailed({ projectId, id })).toBe(false);
  query.mockResolvedValue({ rows: [{ id }] });
  expect(await store.retryFailed({ projectId, id })).toBe(true);
});

it("handles empty backlog summaries and propagates maintenance failures for operator visibility", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const store = createWorkerJobStore({ query });
  expect(await store.summary()).toEqual({
    pending: 0,
    running: 0,
    failed: 0,
    oldestPendingSeconds: 0
  });
  query.mockResolvedValue({ rows: [{ pending: "20", running: "2", failed: "1", oldest: 7.5 }] });
  expect(await store.summary()).toEqual({
    pending: 20,
    running: 2,
    failed: 1,
    oldestPendingSeconds: 7.5
  });
  await store.maintain();
  query.mockRejectedValue(new Error("database_unavailable"));
  await expect(store.maintain()).rejects.toThrow("database_unavailable");
});
