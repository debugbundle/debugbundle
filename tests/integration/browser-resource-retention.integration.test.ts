import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { processNextGroupIncidentJob } from "../../apps/worker/src/processor-group.js";
import {
  createPostgresMetadataStore,
  type GroupIncidentJob,
  type Queryable
} from "../../packages/storage/src/index.js";
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  createNoopWebhookPublisher,
  createNonSpikingFrequencyCounter,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("browser resource route retention", () => {
  const pool = createIntegrationPool();
  beforeAll(async () => {
    await bootstrapStorageAndCreateBucket(pool, createS3AdminClient());
  });
  afterAll(async () => {
    await pool.end();
  });

  it("keeps route counts after raw sampling, with replay-safe occurrence totals", async () => {
    const projectId = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId: randomUUID(),
      projectId,
      organizationName: "Resource test",
      organizationSlug: `resource-${projectId}`,
      projectName: "Resource test",
      projectSlug: `resource-${projectId}`
    });
    const store = createPostgresMetadataStore(createQueryable(pool));
    const jobs: GroupIncidentJob[] = ["/login", "/dashboard", "/dashboard"].map((route, index) => ({
      project_id: projectId,
      event_id: randomUUID(),
      event_type: "frontend_exception",
      event_class: "incident_signal",
      service_name: "web",
      environment: "production",
      fingerprint: "resource-test",
      fingerprint_version: "v3",
      normalized_message: "Browser resource load error",
      incident_title: "Google Tag Manager script failed to load",
      resource_route: route,
      occurred_at: `2026-09-16T10:0${index}:00.000Z`,
      severity: "medium"
    }));
    const processJob = async (job: GroupIncidentJob): Promise<void> => {
      await processNextGroupIncidentJob({
        queue: {
          dequeue: async () => job,
          enqueue: async () => undefined
        } as unknown as Parameters<typeof processNextGroupIncidentJob>[0]["queue"],
        incidentStore: store,
        frequencyCounter: createNonSpikingFrequencyCounter(),
        lifecycleWebhookPublisher: createNoopWebhookPublisher(),
        objectStore: { deleteObject: async () => undefined }
      });
    };
    for (const job of [...jobs, jobs[1]!]) await processJob(job);
    const rows = await pool.query(
      "SELECT i.id, i.occurrence_count FROM incidents i WHERE project_id = $1",
      [projectId]
    );
    expect(rows.rows).toHaveLength(1);
    expect(Number(rows.rows[0].occurrence_count)).toBe(3);
    const context = await store.getBundleBuildContext({
      project_id: projectId,
      incident_id: rows.rows[0].id
    });
    expect(context?.resource_routes).toMatchObject({
      items: [
        { route: "/dashboard", occurrences: 2 },
        { route: "/login", occurrences: 1 }
      ],
      recorded_occurrences: 3,
      unattributed_occurrences: 0,
      omitted_routes: 0
    });
    const sampled = await pool.query(
      "SELECT is_sampled, resource_route FROM incident_events WHERE event_id = $1",
      [jobs[1]!.event_id]
    );
    expect(sampled.rows[0]).toEqual({ is_sampled: false, resource_route: "/dashboard" });

    // Delayed arrivals add routes even after raw sampling; old jobs can omit route evidence.
    for (let index = 0; index < 22; index += 1) {
      await processJob({
        ...jobs[0]!,
        event_id: randomUUID(),
        resource_route: `/page-${String.fromCharCode(97 + index)}?token=private`
      });
    }
    const legacyJob = { ...jobs[0]!, event_id: randomUUID() };
    delete legacyJob.resource_route;
    await processJob(legacyJob);
    const bounded = await store.getBundleBuildContext({
      project_id: projectId,
      incident_id: rows.rows[0].id
    });
    expect(bounded?.resource_routes).toMatchObject({
      recorded_occurrences: 25,
      unattributed_occurrences: 1,
      omitted_routes: 4,
      coverage: "occurrence_metadata"
    });
    expect(bounded?.resource_routes?.items).toHaveLength(20);
    expect(bounded?.resource_routes?.items[0]).toEqual({ route: "/dashboard", occurrences: 2 });
    expect(JSON.stringify(bounded?.resource_routes)).not.toContain("private");
    expect(
      await store.getBundleBuildContext({ project_id: randomUUID(), incident_id: rows.rows[0].id })
    ).toBeNull();

    // Commit a new occurrence between the incident read and any subsequent route read.
    const db = createQueryable(pool);
    let arrived = false;
    const interleaved: Queryable = {
      async query<Row extends Record<string, unknown>>(text: string, params: unknown[]) {
        const result = await db.query<Row>(text, params);
        if (!arrived) {
          arrived = true;
          await processJob({ ...jobs[0]!, event_id: randomUUID(), resource_route: "/concurrent" });
        }
        return result;
      }
    };
    const snapshot = await createPostgresMetadataStore(interleaved).getBundleBuildContext({
      project_id: projectId,
      incident_id: rows.rows[0].id
    });
    expect(arrived).toBe(true);
    expect(snapshot?.occurrence_count).toBe(26);
    expect(snapshot?.resource_routes?.recorded_occurrences).toBe(25);
    expect(snapshot?.resource_routes?.unattributed_occurrences).toBe(1);
  });
});
