import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  createPostgresImprovementOpportunityStore,
  createRedisQueueClient
} from "../../packages/storage/src/index.js";
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createS3AdminClient,
  createTestObjectStore,
  redisUrl,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.ts";
import { createOpenAiHostedOperations } from "../../apps/api/src/openai-mcp-operations.js";

runIntegration("incident reliability persistence", () => {
  const pool = createIntegrationPool();
  const s3 = createS3AdminClient();
  const redis = new Redis(redisUrl);
  const queue = createRedisQueueClient({ redisUrl });
  beforeAll(async () => {
    await bootstrapStorageAndCreateBucket(pool, s3);
  });
  afterAll(async () => {
    await Promise.all([pool.end(), redis.quit(), queue.close()]);
    s3.destroy();
  });

  it("maps a real missing S3 object to missing through the OpenAI reader", async () => {
    const projectId = randomUUID();
    const operations = createOpenAiHostedOperations({
      dashboardBaseUrl: "https://app.example.test",
      dependencies: {
        projectManagement: {
          resolveProjectAccessForUser: async () => ({ organization_id: "org" })
        },
        incidentRetrieval: { getIncidentForOrganization: async () => ({ project_id: projectId }) },
        objectStoreReader: createTestObjectStore()
      } as never
    });
    const result = await operations.get_bundle!({
      principal: { userId: "user", organizationId: "org", grantId: "grant", scopes: [] },
      input: { projectId, incidentId: randomUUID() }
    });
    expect(result).toMatchObject({ status: "missing", artifact: null });
  });

  it("records fractional and large request durations without integer coercion or lost precision", async () => {
    const projectId = randomUUID();
    await seedOwnedProject({
      pool,
      projectId,
      organizationId: randomUUID(),
      organizationName: "Reliability",
      organizationSlug: `reliability-${projectId}`,
      projectName: "Reliability",
      projectSlug: "reliability"
    });
    const store = createPostgresImprovementOpportunityStore(pool);
    for (const duration of [1800.125, 3000.25, 3_000_000_000.5]) {
      const result = await store.recordRequestPattern({
        project_id: projectId,
        kind: "slow_request",
        service_name: "api",
        environment: "test",
        route_template: "/orders",
        http_method: "GET",
        response_status: 200,
        duration_ms: duration,
        source_event_id: randomUUID(),
        occurred_at: "2026-09-13T18:00:00.000Z",
        severity: "medium",
        confidence: 0.7,
        threshold: 5,
        slow_request_duration_threshold_ms: 1500
      });
      expect(result).not.toBeNull();
    }
    const rows = await pool.query(
      "SELECT occurrence_count, evidence FROM improvement_opportunities WHERE project_id = $1",
      [projectId]
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].occurrence_count).toBe(3);
    expect(rows.rows[0].evidence.duration_ms).toBe(3_000_000_000.5);
  });

  it("recovers stale jobs in bounded atomic batches without losing or duplicating 1000 jobs", async () => {
    await queue.clearJobQueue("normalize-events");
    const envelopes = Array.from({ length: 1000 }, (_, i) =>
      JSON.stringify({
        claim_id: randomUUID(),
        payload: JSON.stringify({ event_id: `event-${i}` })
      })
    );
    await redis.zadd(
      "jobs:normalize-events:processing",
      ...envelopes.flatMap((value) => ["1", value])
    );
    expect(await queue.reclaimStaleProcessingJobs("normalize-events", 2)).toBe(100);
    await Promise.all(
      Array.from({ length: 12 }, () => queue.reclaimStaleProcessingJobs("normalize-events", 2))
    );
    const pending = await queue.readJobQueue("normalize-events");
    expect(pending).toHaveLength(1000);
    expect(new Set(pending).size).toBe(1000);
    expect(await redis.zcard("jobs:normalize-events:processing")).toBe(0);
    await queue.clearJobQueue("normalize-events");
  });
});
