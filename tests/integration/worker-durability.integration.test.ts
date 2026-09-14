import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createWorkerJobStore } from "../../packages/storage/src/worker-job-store.js";
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

runIntegration("durable worker handoffs", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const s3 = createS3AdminClient();
  const projectId = randomUUID();
  const store = createWorkerJobStore(db);
  beforeAll(async () => {
    await bootstrapStorageAndCreateBucket(pool, s3);
    await seedOwnedProject({
      pool,
      projectId,
      organizationId: randomUUID(),
      organizationName: "Durability",
      organizationSlug: `durability-${projectId}`,
      projectName: "Durability",
      projectSlug: "durability"
    });
  });
  beforeEach(async () => {
    await pool.query("DELETE FROM worker_jobs WHERE project_id = $1", [projectId]);
  });
  afterAll(async () => {
    await pool.query("DELETE FROM worker_jobs WHERE project_id = $1", [projectId]);
    await pool.end();
    s3.destroy();
  });

  it("rolls back a processed marker and its downstream job together, then survives a new connection", async () => {
    const eventId = randomUUID();
    const finish = async (fail: boolean) =>
      db.transaction!(async (tx) => {
        await tx.query(
          "INSERT INTO processed_events(event_id, project_id, event_type, fingerprint, normalized_message) VALUES ($1, $2, 'backend_exception', 'f', 'error') ON CONFLICT DO NOTHING",
          [eventId, projectId]
        );
        await createWorkerJobStore(tx).enqueue("group-incident", {
          project_id: projectId,
          event_id: eventId
        });
        if (fail) throw new Error("simulated_process_exit");
      });
    await expect(finish(true)).rejects.toThrow("simulated_process_exit");
    expect(
      (await pool.query("SELECT * FROM processed_events WHERE event_id = $1", [eventId])).rows
    ).toHaveLength(0);
    expect(await store.claim("group-incident")).toBeNull();
    await finish(false);
    const restarted = createWorkerJobStore(createQueryable(pool));
    const claim = await restarted.claim("group-incident");
    expect(claim?.payload).toMatchObject({ event_id: eventId, project_id: projectId });
    await restarted.complete(claim!);
    await restarted.enqueue("group-incident", { event_id: eventId, project_id: projectId });
    expect(await restarted.claim("group-incident")).toBeNull();
  });

  it("fences stale owners, retries with backoff, and keeps exhausted jobs visible without logging payloads", async () => {
    const id = await store.enqueue("build-bundle", {
      project_id: projectId,
      event_id: randomUUID()
    });
    const original = (await store.claim("build-bundle"))!;
    await pool.query(
      "UPDATE worker_jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1",
      [id]
    );
    const recovered = (await store.claim("build-bundle"))!;
    expect(recovered.token).not.toBe(original.token);
    await expect(store.complete(original)).rejects.toThrow("worker_job_lease_lost");
    await store.fail(recovered);
    expect(await store.claim("build-bundle")).toBeNull();
    await pool.query("UPDATE worker_jobs SET available_at = now(), attempts = 7 WHERE id = $1", [
      id
    ]);
    const final = (await store.claim("build-bundle"))!;
    await store.fail(final);
    expect(await store.claim("build-bundle")).toBeNull();
    expect((await store.summary()).failed).toBe(1);
    expect(
      (await pool.query("SELECT status, last_error_code FROM worker_jobs WHERE id = $1", [id]))
        .rows[0]
    ).toMatchObject({ status: "failed", last_error_code: "attempts_exhausted" });
  });

  it("lets concurrent claimers consume 1000 unique jobs without double claims", async () => {
    for (let start = 0; start < 1000; start += 25) {
      await Promise.all(
        Array.from({ length: 25 }, (_, index) =>
          store.enqueue("group-incident", { project_id: projectId, event_id: `${start + index}` })
        )
      );
    }
    const seen = new Set<string>();
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (true) {
          const claim = await store.claim("group-incident");
          if (!claim) break;
          expect(seen.has(claim.id)).toBe(false);
          seen.add(claim.id);
          await store.complete(claim);
        }
      })
    );
    expect(seen.size).toBe(1000);
    await pool.query(
      "UPDATE worker_jobs SET expires_at = now() - interval '1 second' WHERE project_id = $1",
      [projectId]
    );
    expect(await store.maintain()).toBe(true);
    expect(
      (
        await pool.query("SELECT count(*)::int AS count FROM worker_jobs WHERE project_id = $1", [
          projectId
        ])
      ).rows[0].count
    ).toBe(500);
    expect(await store.maintain()).toBe(true);
    expect(await store.maintain()).toBe(false);
    expect((await store.summary()).pending).toBe(0);
  }, 30_000);

  it("holds lifecycle publication until its bundle completes and suppresses publication when the bundle is unavailable", async () => {
    const parent = await store.enqueue("build-bundle", {
      project_id: projectId,
      event_id: randomUUID()
    });
    await store.enqueue(
      "publish-incident-lifecycle",
      { project_id: projectId },
      { dependsOn: parent }
    );
    expect(await store.claim("publish-incident-lifecycle")).toBeNull();
    await store.complete((await store.claim("build-bundle"))!);
    expect(await store.claim("publish-incident-lifecycle")).not.toBeNull();

    const skippedParent = await store.enqueue("build-bundle", {
      project_id: projectId,
      event_id: randomUUID()
    });
    const child = await store.enqueue(
      "publish-incident-lifecycle",
      { project_id: projectId, title: "Unavailable" },
      { dependsOn: skippedParent }
    );
    await store.complete((await store.claim("build-bundle"))!, "monthly_quota_exceeded");
    await store.maintain();
    expect(
      (await pool.query("SELECT status, payload FROM worker_jobs WHERE id = $1", [child])).rows[0]
    ).toMatchObject({ status: "skipped", payload: null });
  });
  it("bounds payload retention and permits an explicit scoped retry only while failed evidence remains", async () => {
    const id = await store.enqueue("build-bundle", {
      project_id: projectId,
      event_id: randomUUID(),
      private_context: "must not appear in inspection"
    });
    await pool.query("UPDATE worker_jobs SET attempts = 7 WHERE id = $1", [id]);
    await store.fail((await store.claim("build-bundle"))!);
    const inspection = await store.inspect({ projectId, id });
    expect(inspection).toHaveLength(1);
    expect(JSON.stringify(inspection)).not.toContain("private_context");
    expect(inspection[0]).toMatchObject({ status: "failed", can_retry: true, operator_retries: 0 });
    expect(await store.retryFailed({ projectId: randomUUID(), id })).toBe(false);
    expect(await store.retryFailed({ projectId, id })).toBe(true);
    expect(await store.retryFailed({ projectId, id })).toBe(false);
    expect((await store.inspect({ projectId, id }))[0]).toMatchObject({
      status: "pending",
      attempts: 0,
      operator_retries: 1
    });
    const active = (await store.claim("build-bundle"))!;
    await pool.query(
      "UPDATE worker_jobs SET expires_at = now() - interval '1 second' WHERE id = $1",
      [id]
    );
    await store.maintain();
    expect((await store.inspect({ projectId, id }))[0]).toMatchObject({ status: "running" });
    await store.fail(active);
    await store.maintain();
    expect((await store.inspect({ projectId, id }))[0]).toMatchObject({
      status: "failed",
      can_retry: false,
      last_error_code: "evidence_expired"
    });
    expect(
      (await pool.query("SELECT payload FROM worker_jobs WHERE id = $1", [id])).rows[0].payload
    ).toBeNull();
    expect(await store.retryFailed({ projectId, id })).toBe(false);
  });

  it("rejects cross-project dependencies and ignores ingress for a deleted project", async () => {
    const parent = await store.enqueue("build-bundle", {
      project_id: projectId,
      event_id: randomUUID()
    });
    await expect(
      store.enqueue(
        "publish-incident-lifecycle",
        { project_id: randomUUID() },
        { dependsOn: parent }
      )
    ).rejects.toThrow("worker_dependency_scope_invalid");
    const absent = await store.enqueue("group-incident", {
      project_id: randomUUID(),
      event_id: randomUUID()
    });
    expect(
      (await pool.query("SELECT id FROM worker_jobs WHERE id = $1", [absent])).rows
    ).toHaveLength(0);
  });

  it("retains dependency receipts until their children are removed", async () => {
    const parent = await store.enqueue("build-bundle", {
      project_id: projectId,
      event_id: randomUUID()
    });
    const child = await store.enqueue(
      "publish-incident-lifecycle",
      { project_id: projectId },
      { dependsOn: parent }
    );
    await store.complete((await store.claim("build-bundle"))!);
    await pool.query(
      "UPDATE worker_jobs SET expires_at = now() - interval '1 second' WHERE id = $1",
      [parent]
    );
    await store.maintain();
    expect(
      (await pool.query("SELECT id FROM worker_jobs WHERE id = $1", [parent])).rows
    ).toHaveLength(1);
    await store.complete((await store.claim("publish-incident-lifecycle"))!);
    await pool.query(
      "UPDATE worker_jobs SET expires_at = now() - interval '1 second' WHERE id = $1",
      [child]
    );
    await store.maintain();
    await store.maintain();
    expect(
      (await pool.query("SELECT id FROM worker_jobs WHERE id IN ($1, $2)", [parent, child])).rows
    ).toHaveLength(0);
  });
  it("requires explicit global scope to inspect or retry unscoped maintenance work", async () => {
    const id = await store.enqueue(
      "cleanup-retention",
      { requested_at: new Date().toISOString() },
      { dedupeKey: randomUUID() }
    );
    try {
      await pool.query("UPDATE worker_jobs SET attempts = 7 WHERE id = $1", [id]);
      await store.fail((await store.claim("cleanup-retention"))!);
      expect(await store.inspect({ projectId, id })).toHaveLength(0);
      expect(await store.retryFailed({ projectId, id })).toBe(false);
      expect((await store.inspect({ projectId: null, id }))[0]).toMatchObject({ can_retry: true });
      expect(await store.retryFailed({ projectId: null, id })).toBe(true);
    } finally {
      await pool.query("DELETE FROM worker_jobs WHERE id = $1", [id]);
    }
  });

  it("removes scoped job payloads and dependency receipts when their project is deleted", async () => {
    const deletedProject = randomUUID();
    await seedOwnedProject({
      pool,
      projectId: deletedProject,
      organizationId: randomUUID(),
      organizationName: "Deleted",
      organizationSlug: `deleted-${deletedProject}`,
      projectName: "Deleted",
      projectSlug: "deleted"
    });
    const parent = await store.enqueue("build-bundle", {
      project_id: deletedProject,
      event_id: randomUUID()
    });
    await store.enqueue(
      "publish-incident-lifecycle",
      { project_id: deletedProject },
      { dependsOn: parent }
    );
    await pool.query("DELETE FROM projects WHERE id = $1", [deletedProject]);
    expect(
      (await pool.query("SELECT id FROM worker_jobs WHERE project_id = $1", [deletedProject])).rows
    ).toHaveLength(0);
  });
});
