import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, expect, it } from "vitest";

import {
  buildBundleObjectKey,
  buildImprovementBundleObjectKey,
  buildReproductionObjectKey
} from "../../packages/storage/src/index.js";
import reviewerFixture from "../fixtures/openai-plugin-v1/reviewer-tenant.json" with { type: "json" };
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createS3AdminClient,
  createTestObjectStore,
  runIntegration
} from "../helpers/integration-setup.ts";

runIntegration("OpenAI reviewer fixture integration", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();
  const objectStore = createTestObjectStore();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  it("seeds deterministic aggregate analytics and artifacts without raw analytics state", async (): Promise<void> => {
    const runSeeder = (): { mode: string; version: string; anchor: string } =>
      JSON.parse(
        execFileSync(
          "node",
          ["--import", "tsx", "scripts/seed-openai-reviewer-fixtures.ts", "--apply"],
          {
            cwd: process.cwd(),
            encoding: "utf8",
            env: {
              ...process.env,
              AWS_ACCESS_KEY_ID: "test",
              AWS_SECRET_ACCESS_KEY: "test",
              OPENAI_REVIEWER_FIXTURE_ANCHOR: "2026-09-02T12:00:00.000Z",
              OPENAI_REVIEWER_FIXTURE_CONFIRM: "apply-synthetic-openai-reviewer-fixture"
            }
          }
        )
      ) as { mode: string; version: string; anchor: string };

    expect(runSeeder()).toEqual({
      mode: "applied",
      version: "1.0.0",
      anchor: "2026-09-02T12:00:00.000Z"
    });
    expect(runSeeder()).toEqual({
      mode: "applied",
      version: "1.0.0",
      anchor: "2026-09-02T12:00:00.000Z"
    });

    const projectId = reviewerFixture.identifiers.project_id;
    const aggregateCounts = await pool.query<Record<string, string>>(
      `
        SELECT
          (SELECT COUNT(*)::text FROM analytics_session_rollups WHERE project_id = $1) AS sessions,
          (SELECT COUNT(*)::text FROM analytics_route_rollups WHERE project_id = $1) AS routes,
          (SELECT COUNT(*)::text FROM analytics_transition_rollups WHERE project_id = $1) AS transitions,
          (SELECT COUNT(*)::text FROM analytics_action_rollups WHERE project_id = $1) AS actions,
          (SELECT COUNT(*)::text FROM analytics_funnel_definitions WHERE project_id = $1) AS funnels,
          (SELECT COUNT(*)::text FROM analytics_funnel_rollups WHERE project_id = $1) AS funnel_steps,
          (SELECT COUNT(*)::text FROM analytics_incident_session_links WHERE project_id = $1) AS incident_links,
          (SELECT COUNT(*)::text FROM analytics_rollup_uniques WHERE project_id = $1) AS aggregate_uniques
      `,
      [projectId]
    );
    expect(aggregateCounts.rows[0]).toEqual({
      sessions: "1",
      routes: "1",
      transitions: "1",
      actions: "1",
      funnels: "1",
      funnel_steps: "2",
      incident_links: "2",
      aggregate_uniques: "4"
    });

    const excludedCounts = await pool.query<Record<string, string>>(
      `
        SELECT
          (SELECT COUNT(*)::text FROM analytics_ingestion_ledger WHERE project_id = $1) AS raw_events,
          (SELECT COUNT(*)::text FROM analytics_journey_samples WHERE project_id = $1) AS journey_samples,
          (SELECT COUNT(*)::text FROM analytics_bundle_generations WHERE project_id = $1) AS bundle_generations
      `,
      [projectId]
    );
    expect(excludedCounts.rows[0]).toEqual({
      raw_events: "0",
      journey_samples: "0",
      bundle_generations: "0"
    });

    await expect(
      objectStore.getObject({
        key: buildBundleObjectKey(projectId, reviewerFixture.identifiers.incident_id)
      })
    ).resolves.toBeInstanceOf(Buffer);
    await expect(
      objectStore.getObject({
        key: buildReproductionObjectKey(projectId, reviewerFixture.identifiers.incident_id)
      })
    ).resolves.toBeInstanceOf(Buffer);
    await expect(
      objectStore.getObject({
        key: buildImprovementBundleObjectKey(
          projectId,
          reviewerFixture.identifiers.improvement_id
        )
      })
    ).resolves.toBeInstanceOf(Buffer);

    await pool.query("DELETE FROM organizations WHERE id = $1", [
      reviewerFixture.identifiers.organization_id
    ]);
  });
});
