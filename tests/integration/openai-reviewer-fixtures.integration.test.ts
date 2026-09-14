import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, expect, it } from "vitest";

import {
  buildBundleObjectKey,
  buildImprovementBundleObjectKey,
  buildReproductionObjectKey
} from "../../packages/storage/src/index.js";
import { createPostgresAvailabilityCheckStore } from "../../packages/storage/src/availability-check-store.js";
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
    const checkState = async () => {
      const result = await pool.query<{ enabled: boolean; status: string }>(
        "SELECT enabled, status FROM availability_checks WHERE id = $1",
        [reviewerFixture.identifiers.health_check_id]
      );
      return result.rows[0];
    };
    expect(await checkState()).toEqual({ enabled: false, status: "failing" });
    // Re-seeding must also repair a previously enabled synthetic check.
    await pool.query("UPDATE availability_checks SET enabled = true WHERE id = $1", [
      reviewerFixture.identifiers.health_check_id
    ]);
    expect(runSeeder()).toEqual({
      mode: "applied",
      version: "1.0.0",
      anchor: "2026-09-02T12:00:00.000Z"
    });
    expect(await checkState()).toEqual({ enabled: false, status: "failing" });

    const ordinaryCheckId = randomUUID();
    await pool.query(
      `INSERT INTO availability_checks
         (id, project_id, created_by_user_id, name, url, method, interval_seconds,
          environment, enabled, next_check_at)
       VALUES ($1, $2, $3, 'Ordinary enabled check', 'https://example.com/health',
               'GET', 60, 'production', true, $4)`,
      [
        ordinaryCheckId,
        reviewerFixture.identifiers.project_id,
        reviewerFixture.identifiers.user_id,
        "2026-09-02T12:00:00.000Z"
      ]
    );
    const store = createPostgresAvailabilityCheckStore(pool);
    const claimed = await store.claimDueChecks({
      now: "2026-09-02T12:10:00.000Z",
      claim_timeout_before: "2026-09-02T12:05:00.000Z",
      limit: 100
    });
    expect(claimed.map((check) => check.check_id)).toContain(ordinaryCheckId);
    expect(claimed.map((check) => check.check_id)).not.toContain(
      reviewerFixture.identifiers.health_check_id
    );
    const retained = await pool.query<{ results: number; rollups: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM availability_check_results WHERE check_id = $1) AS results,
         (SELECT COUNT(*)::int FROM availability_check_daily_rollups WHERE check_id = $1) AS rollups`,
      [reviewerFixture.identifiers.health_check_id]
    );
    expect(retained.rows[0]).toEqual({ results: 1, rollups: 1 });

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
        key: buildImprovementBundleObjectKey(projectId, reviewerFixture.identifiers.improvement_id)
      })
    ).resolves.toBeInstanceOf(Buffer);

    await pool.query("DELETE FROM organizations WHERE id = $1", [
      reviewerFixture.identifiers.organization_id
    ]);
  });
});
