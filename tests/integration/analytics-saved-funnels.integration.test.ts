import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

import {
  createPostgresAnalyticsSavedFunnelStore,
  type Queryable
} from "../../packages/storage/src/index.js";
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createS3AdminClient,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

runIntegration("analytics saved funnels integration", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  it("enforces active limits under concurrency and reuses archived keys", async () => {
    const organizationId = randomUUID();
    const projectId = randomUUID();
    const { ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Saved Funnel Org",
      organizationSlug: `saved-funnel-${organizationId}`,
      projectName: "Saved Funnel Project",
      projectSlug: `saved-funnel-${projectId}`,
      organizationPlan: "team"
    });
    await pool.query(
      `
        INSERT INTO project_analytics_settings (project_id, max_saved_funnels)
        VALUES ($1, 1)
      `,
      [projectId]
    );

    const store = createPostgresAnalyticsSavedFunnelStore(createTransactionalQueryable(pool));
    const definitions = ["checkout", "onboarding"].map((funnelKey) => ({
      organization_id: organizationId,
      project_id: projectId,
      created_by_user_id: ownerUserId,
      definition: {
        funnel_key: funnelKey,
        display_name: funnelKey === "checkout" ? "Checkout" : "Onboarding",
        steps: [
          { step_key: "start", display_name: "Start" },
          { step_key: "complete", display_name: "Complete" }
        ]
      }
    }));

    const results = await Promise.all(
      definitions.map((definition) => store.createSavedFunnelForProject(definition))
    );
    expect(results.map((result) => result.status).sort()).toEqual(["created", "limit_reached"]);

    const [created] = await store.listSavedFunnelsForProject({
      organization_id: organizationId,
      project_id: projectId
    });
    expect(created).toBeDefined();
    await expect(
      store.archiveSavedFunnelForProject({
        organization_id: organizationId,
        project_id: projectId,
        funnel_key: created!.funnel_key
      })
    ).resolves.toMatchObject({ archived_at: expect.any(String) });

    const recreated = await store.createSavedFunnelForProject({
      organization_id: organizationId,
      project_id: projectId,
      created_by_user_id: ownerUserId,
      definition: {
        funnel_key: created!.funnel_key,
        display_name: "Reactivated funnel",
        steps: [
          { step_key: "start", display_name: "Start" },
          { step_key: "complete", display_name: "Complete" }
        ]
      }
    });
    expect(recreated).toMatchObject({
      status: "created",
      funnel: { display_name: "Reactivated funnel", archived_at: null }
    });

    await pool.query("DELETE FROM organizations WHERE id = $1", [organizationId]);
  });
});

function createTransactionalQueryable(pool: Pool): Queryable {
  return {
    query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) =>
      pool.query<Row>(sql, params),
    transaction: async <Result>(callback: (database: Queryable) => Promise<Result>) => {
      const client = await pool.connect();
      const transaction: Queryable = {
        query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) =>
          client.query<Row>(sql, params)
      };
      try {
        await client.query("BEGIN");
        const result = await callback(transaction);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }
  };
}
