import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { claimAnalyticsUsageInTransaction } from "../../packages/storage/src/analytics-usage-store.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { runInTransaction } from "../../packages/storage/src/transaction.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("analytics usage transaction participation", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  let organizationId: string;
  let projectId: string;
  let claimKey: string;
  const period = "2026-09-01T00:00:00.000Z";

  beforeEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    organizationId = randomUUID();
    projectId = randomUUID();
    claimKey = `semantic-event:${projectId}:${randomUUID()}`;
    await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Analytics",
      organizationSlug: "analytics",
      projectName: "Site",
      projectSlug: "site",
      organizationPlan: "team"
    });
  });
  afterAll(async () => pool.end());

  const claim = () => ({
    organization_id: organizationId,
    period_starts_at: period,
    analytics_events: 1,
    analytics_sessions: 0,
    analytics_journey_samples: 0,
    analytics_bundle_generations: 0,
    limits: {
      monthly_analytics_events: 1,
      monthly_analytics_sessions: 0,
      monthly_analytics_journey_samples: 0,
      monthly_analytics_bundle_generations: 0
    },
    claims: [{ claim_key: claimKey, metric: "analytics_events" as const }]
  });

  it("rolls back the event claim with a later receipt or job failure", async () => {
    await expect(
      runInTransaction(db, async (tx) => {
        expect((await claimAnalyticsUsageInTransaction(tx, claim())).allowed).toBe(true);
        throw new Error("receipt_insert_failed");
      })
    ).rejects.toThrow("receipt_insert_failed");
    expect((await pool.query("SELECT count(*) FROM analytics_usage_claims")).rows[0]?.count).toBe(
      "0"
    );
    expect((await pool.query("SELECT count(*) FROM analytics_usage_counters")).rows[0]?.count).toBe(
      "0"
    );
  });

  it("counts a repeated claim only once within a caller-owned transaction", async () => {
    await runInTransaction(db, async (tx) => {
      expect(await claimAnalyticsUsageInTransaction(tx, claim())).toMatchObject({
        allowed: true,
        claimed_keys: [claimKey]
      });
      expect(await claimAnalyticsUsageInTransaction(tx, claim())).toMatchObject({
        allowed: true,
        claimed_keys: []
      });
    });
    expect(
      (await pool.query("SELECT analytics_events FROM analytics_usage_counters")).rows[0]
        ?.analytics_events
    ).toBe(1);
  });
});
