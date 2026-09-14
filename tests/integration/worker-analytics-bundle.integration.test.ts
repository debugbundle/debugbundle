import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { AnalyticsBundleV1Schema } from "../../packages/shared-types/src/index.js";
import {
  createPostgresAnalyticsBundleGenerationStore,
  createPostgresAnalyticsJourneySampleStore,
  createPostgresAnalyticsMetricsStore,
  createRedisQueueClient
} from "../../packages/storage/src/index.js";
import { createDurableWorkerQueue } from "../../apps/worker/src/durable-queue.js";
import { processNextBuildAnalyticsBundleJob } from "../../apps/worker/src/analytics-bundle-processor.js";
import { runWorkerProcessStep } from "../../apps/worker/src/worker-steps.js";
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  createTestObjectStore,
  redisUrl,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

runIntegration("analytics bundle durable runtime", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const s3 = createS3AdminClient();
  const redis = createRedisQueueClient({ redisUrl });
  const objectStore = createTestObjectStore();
  const generations = createPostgresAnalyticsBundleGenerationStore(db);
  const projectId = randomUUID();
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as never;

  beforeAll(async () => {
    await bootstrapStorageAndCreateBucket(pool, s3);
    await seedOwnedProject({
      pool,
      projectId,
      organizationId: randomUUID(),
      organizationName: "Analytics recovery",
      organizationSlug: `analytics-recovery-${projectId}`,
      projectName: "Analytics recovery",
      projectSlug: "analytics-recovery"
    });
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    await pool.query("DELETE FROM worker_jobs WHERE project_id = $1", [projectId]);
    await pool.query("DELETE FROM analytics_bundle_generations WHERE project_id = $1", [projectId]);
    await redis.clearJobQueue("build-analytics-bundle");
  });
  afterAll(async () => {
    await redis.close();
    await pool.query("DELETE FROM projects WHERE id = $1", [projectId]);
    await pool.end();
    s3.destroy();
  });

  async function enqueue() {
    const generation = await generations.reserveAnalyticsBundleGeneration({
      project_id: projectId,
      analysis_kind: "usage_summary",
      analysis_spec: { from: "2026-09-01T00:00:00.000Z", to: "2026-09-02T00:00:00.000Z" }
    });
    await redis.enqueue("build-analytics-bundle", {
      project_id: projectId,
      generation_id: generation.generation_id,
      requested_at: new Date().toISOString(),
      trigger: "manual"
    });
    return generation;
  }

  async function process(options: { failRead?: boolean; failCompletion?: boolean } = {}) {
    const queue = createDurableWorkerQueue(db, redis, false);
    const putObject = vi.spyOn(objectStore, "putObject");
    try {
      const result = await runWorkerProcessStep(
        logger,
        "build-analytics-bundle",
        () =>
          processNextBuildAnalyticsBundleJob({
            queue,
            analyticsBundleGenerationStore: options.failRead
              ? {
                  ...generations,
                  getAnalyticsBundleGenerationForProject: async () => {
                    throw new Error("injected_generation_read_failure");
                  }
                }
              : generations,
            analyticsMetricsStore: createPostgresAnalyticsMetricsStore(db),
            analyticsJourneySampleStore: createPostgresAnalyticsJourneySampleStore(db),
            objectStore,
            logger
          }),
        options.failCompletion
          ? {
              ...queue,
              ackClaimedJobs: async () => {
                throw new Error("injected_journal_completion_failure");
              }
            }
          : queue
      );
      return { result, writes: putObject.mock.calls.length };
    } finally {
      putObject.mockRestore();
      await queue.close();
    }
  }

  async function job() {
    return (
      await pool.query<{ status: string; attempts: number; payload: unknown }>(
        "SELECT status, attempts, payload FROM worker_jobs WHERE project_id = $1 AND job_name = 'build-analytics-bundle'",
        [projectId]
      )
    ).rows[0];
  }

  it("treats an empty analytics queue as an idle pass", async () => {
    expect(await process()).toEqual({ result: { processed: false, reason: "no_jobs" }, writes: 0 });
    expect(logger["error"]).not.toHaveBeenCalled();
  });

  it("adopts Redis work, publishes a valid artifact, and clears the durable payload", async () => {
    const generation = await enqueue();
    expect(await process()).toEqual({ result: { processed: true }, writes: 1 });
    const completed = await generations.getAnalyticsBundleGenerationForProject(generation);
    expect(completed?.status).toBe("completed");
    const body = await objectStore.getObject({ key: completed!.object_key! });
    expect(
      AnalyticsBundleV1Schema.parse(JSON.parse(gunzipSync(body).toString("utf8")))
    ).toMatchObject({ bundle_type: "analytics", analysis_kind: "usage_summary" });
    expect(await job()).toMatchObject({ status: "completed", attempts: 1, payload: null });
  });

  it("retains a failed generation read and completes it after bounded retry", async () => {
    await enqueue();
    expect((await process({ failRead: true })).result.reason).toBe("step_error");
    expect(await job()).toMatchObject({ status: "pending", attempts: 1 });
    await pool.query("UPDATE worker_jobs SET available_at = now() WHERE project_id = $1", [
      projectId
    ]);
    expect(await process()).toEqual({ result: { processed: true }, writes: 1 });
    expect(await job()).toMatchObject({ status: "completed", attempts: 2, payload: null });
  });

  it("retries a lost journal acknowledgement without failing or rebuilding a completed generation", async () => {
    const generation = await enqueue();
    expect((await process({ failCompletion: true })).result.reason).toBe("step_error");
    expect((await generations.getAnalyticsBundleGenerationForProject(generation))?.status).toBe(
      "completed"
    );
    expect(await job()).toMatchObject({ status: "pending", attempts: 1 });
    await pool.query("UPDATE worker_jobs SET available_at = now() WHERE project_id = $1", [
      projectId
    ]);
    expect(await process()).toEqual({
      result: { processed: true, reason: "analytics_bundle_generation_completed" },
      writes: 0
    });
    expect(await job()).toMatchObject({ status: "completed", attempts: 2, payload: null });
  });
});
