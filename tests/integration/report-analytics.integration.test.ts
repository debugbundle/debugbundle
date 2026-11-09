import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { readReportAnalyticsPeriod } from "../../packages/storage/src/report-analytics-facts.js";
import { lastCompletedReportPeriod } from "../../packages/smart-reports/src/report-period.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
runIntegration("report analytics aggregate coverage", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  let project: string;
  const now = "2026-12-01T00:00:00.000Z",
    period = lastCompletedReportPeriod("monthly", now);
  const read = () => readReportAnalyticsPeriod(db, { origin_ids: [project], period, now });
  const row = async (grain = "day", hash = "desktop", sessions = 4, updated = "2026-11-10") =>
    pool.query(
      `INSERT INTO analytics_session_rollups(project_id,service,environment,bucket_start,bucket_granularity,dimension_hash,sessions,active_visitors,total_pageviews,updated_at)
 VALUES($1,'api','production','2026-11-10',$2,$3,$4,3,8,$5)`,
      [project, grain, hash, sessions, updated]
    );
  beforeEach(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    const owner = randomUUID(),
      org = randomUUID();
    project = randomUUID();
    await pool.query("INSERT INTO users(id,email) VALUES($1,$2)", [owner, `${owner}@example.test`]);
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan) VALUES($1::uuid,'Reports',$1::text,'business')",
      [org]
    );
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Project',$1::text)",
      [project, org, owner]
    );
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,enabled,created_at,updated_at) VALUES($1,true,'2026-01-01','2026-10-01')",
      [project]
    );
  });
  afterAll(async () => {
    await pool.end();
  });
  it("sums only retained day rollups and labels scoped daily counts rather than unique monthly people", async () => {
    await row();
    await row("day", "mobile", 6);
    await row("hour", "desktop", 100);
    expect(await read()).toMatchObject({
      coverage: "complete",
      sessions: 10,
      page_views: 16,
      daily_active_visitor_days: 6
    });
    expect((await read()).notes.join(" ")).toContain("not unique");
  });
  it("keeps disabled, newly enabled and late-updated data from becoming a complete zero or a false trend", async () => {
    await pool.query("UPDATE project_analytics_settings SET enabled=false WHERE project_id=$1", [
      project
    ]);
    expect(await read()).toMatchObject({ coverage: "unavailable", sessions: null });
    await pool.query(
      "UPDATE project_analytics_settings SET enabled=true,updated_at='2026-11-15' WHERE project_id=$1",
      [project]
    );
    expect(await read()).toMatchObject({ coverage: "partial", sessions: null });
    await row();
    expect(await read()).toMatchObject({ coverage: "partial", sessions: 4 });
    await row("day", "late", 20, "2026-12-02");
    expect(await read()).toMatchObject({ coverage: "partial", sessions: 4 });
  });
  it("applies shorter current privacy retention before background pruning and never reads raw events", async () => {
    await row();
    await pool.query(
      "UPDATE project_analytics_settings SET aggregate_retention_months=1 WHERE project_id=$1",
      [project]
    );
    const old = await readReportAnalyticsPeriod(db, {
      origin_ids: [project],
      period: lastCompletedReportPeriod("monthly", "2026-11-01T00:00:00.000Z"),
      now
    });
    expect(old).toMatchObject({ coverage: "unavailable", sessions: null });
    await pool.query(
      "UPDATE project_analytics_settings SET updated_at='2026-10-01' WHERE project_id=$1",
      [project]
    );
    expect(await read()).toMatchObject({ coverage: "complete", sessions: 4 });
  });
  it("uses the current retention clock even when a retried report has an older frozen cutoff", async () => {
    await row();
    await pool.query(
      "UPDATE project_analytics_settings SET aggregate_retention_months=1 WHERE project_id=$1",
      [project]
    );
    const result = await readReportAnalyticsPeriod(db, {
      origin_ids: [project],
      period,
      now,
      retention_at: "2027-01-01T00:00:00.000Z"
    });
    expect(result).toMatchObject({ coverage: "unavailable", sessions: null });
    expect((await pool.query("SELECT sessions FROM analytics_session_rollups")).rows).toHaveLength(
      1
    );
  });
});
