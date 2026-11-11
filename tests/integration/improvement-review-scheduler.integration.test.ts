import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { createImprovementReviewSettingsStore } from "../../packages/storage/src/improvement-review-settings.js";
import { createImprovementReviewScheduler } from "../../packages/storage/src/improvement-review-scheduler.js";
import { resetReportRunFixture } from "../helpers/report-runs.js";
import { seedConsolidationProjects } from "../helpers/consolidation-projects.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("weekly review scheduler isolation and retention", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  let fixture: Awaited<ReturnType<typeof resetReportRunFixture>>;
  beforeEach(async () => {
    fixture = await resetReportRunFixture(pool, db, { plan: "team" });
  });
  afterAll(async () => {
    await pool.end();
  });
  async function enable(org: string, owner: string, project: string, days = 1) {
    await createImprovementReviewSettingsStore(db).replace({
      organization_id: org,
      initiator: { version: 1, kind: "browser_session", user_id: owner },
      command: { expected_version: 0, enabled: true, project_ids: [project], source_consent: true }
    });
    await pool.query(
      "UPDATE improvement_review_settings SET next_due_at=clock_timestamp()-make_interval(days=>$2) WHERE organization_id=$1",
      [org, days]
    );
  }
  async function healthyWorkspace() {
    const org = randomUUID(),
      project = randomUUID(),
      owner = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId: org,
      projectId: project,
      ownerUserId: owner,
      organizationName: "Healthy",
      organizationSlug: org,
      projectName: "Healthy",
      projectSlug: project,
      organizationPlan: "team"
    });
    await pool.query("UPDATE users SET email_verified_at=clock_timestamp() WHERE id=$1", [owner]);
    await enable(org, owner, project);
    return org;
  }
  it("skips suspended workspaces so their overdue schedule cannot block eligible work", async () => {
    await enable(fixture.org, fixture.owner, fixture.project, 2);
    const healthy = await healthyWorkspace();
    await pool.query("UPDATE organizations SET suspended_at=clock_timestamp() WHERE id=$1", [
      fixture.org
    ]);
    await expect(createImprovementReviewScheduler(db).scheduleNext()).resolves.toEqual({
      processed: true
    });
    expect((await pool.query("SELECT organization_id FROM improvement_reviews")).rows).toEqual([
      { organization_id: healthy }
    ]);
  });
  it("pauses an unsafe identity scope without blocking other workspaces or creating partial jobs", async () => {
    await enable(fixture.org, fixture.owner, fixture.project, 2);
    const healthy = await healthyWorkspace();
    await pool.query("UPDATE projects SET name=repeat('x',321) WHERE id=$1", [fixture.project]);
    const scheduler = createImprovementReviewScheduler(db);
    await expect(scheduler.scheduleNext()).resolves.toEqual({ processed: true });
    expect(
      (
        await pool.query(
          "SELECT enabled,requires_review FROM improvement_review_settings WHERE organization_id=$1",
          [fixture.org]
        )
      ).rows[0]
    ).toEqual({ enabled: false, requires_review: true });
    await expect(scheduler.scheduleNext()).resolves.toEqual({ processed: true });
    expect((await pool.query("SELECT organization_id FROM improvement_reviews")).rows).toEqual([
      { organization_id: healthy }
    ]);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM worker_jobs WHERE job_name='generate-improvement-review'"
        )
      ).rows[0]?.count
    ).toBe(1);
  });
  it("applies the current canonical retention to a selection saved before consolidation", async () => {
    await migrateStorageSchema(db);
    const f = await seedConsolidationProjects(pool, db);
    await pool.query("UPDATE users SET email_verified_at=clock_timestamp() WHERE id=$1", [
      f.userId
    ]);
    await enable(f.organizationId, f.userId, f.source);
    await f.consolidate();
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,enabled,aggregate_retention_months) VALUES($1,true,1) ON CONFLICT(project_id) DO UPDATE SET enabled=true,aggregate_retention_months=1",
      [f.target]
    );
    await createImprovementReviewScheduler(db).scheduleNext();
    expect(
      (
        await pool.query(
          "SELECT project_id,expires_at=cutoff_at+interval '1 month' AS governed FROM improvement_reviews WHERE organization_id=$1",
          [f.organizationId]
        )
      ).rows
    ).toEqual([{ project_id: f.source, governed: true }]);
  });
});
