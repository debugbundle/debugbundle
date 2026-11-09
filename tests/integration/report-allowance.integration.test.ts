import { createReportDefinitionStore } from "../../packages/storage/src/report-definition-store.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { resetReportRunFixture } from "../helpers/report-runs.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
import { createReportAllowanceStore } from "../../packages/storage/src/report-allowance-store.js";
import { SmartReportError } from "../../packages/smart-reports/src/report-errors.js";
runIntegration("shared report allowance forecast", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  let fixture: Awaited<ReturnType<typeof resetReportRunFixture>>;
  const now = "2026-11-07T12:00:00.000Z";
  const read = () =>
    createReportAllowanceStore(db, { now: () => new Date(now) }).read({
      organization_id: fixture.org,
      definition_id: fixture.definition,
      initiator: { version: 1, kind: "browser_session", user_id: fixture.owner }
    });
  beforeEach(async () => {
    fixture = await resetReportRunFixture(pool, db);
  });
  afterAll(async () => {
    await pool.end();
  });
  it("uses the anchored monthly window for annual billing without multiplying by capacity", async () => {
    await pool.query(
      "UPDATE organizations SET billing_interval='year',billing_period_starts_at='2026-01-31',billing_period_ends_at='2027-01-31',billing_allowance_anchor_at='2026-01-31' WHERE id=$1",
      [fixture.org]
    );
    await pool.query(
      "INSERT INTO report_allowance_windows(organization_id,starts_at,ends_at,generations,budget_limit_nano_usd) VALUES($1,'2026-10-31','2026-11-30',7,1000000000)",
      [fixture.org]
    );
    expect(await read()).toMatchObject({
      window: { starts_at: "2026-10-31T00:00:00.000Z", ends_at: "2026-11-30T00:00:00.000Z" },
      limit: 40,
      used: 7,
      remaining: 33,
      scope_complete: true
    });
  });
  it("returns forecast only for definitions the actual reader can access as a whole", async () => {
    const stranger = randomUUID();
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      stranger,
      `${stranger}@example.test`
    ]);
    await expect(
      createReportAllowanceStore(db).read({
        organization_id: fixture.org,
        definition_id: fixture.definition,
        initiator: { version: 1, kind: "browser_session", user_id: stranger }
      })
    ).rejects.toBeInstanceOf(SmartReportError);
  });
  it("keeps consumed generations visible after schedules are disabled", async () => {
    await pool.query(
      "INSERT INTO report_allowance_windows(organization_id,starts_at,ends_at,generations,budget_limit_nano_usd) VALUES($1,'2026-11-01','2026-12-01',40,1000000000)",
      [fixture.org]
    );
    await pool.query("UPDATE report_definitions SET enabled=false WHERE id=$1", [
      fixture.definition
    ]);
    expect(await read()).toMatchObject({
      used: 40,
      remaining: 0,
      scheduled_remaining: 0,
      schedule_exceeds_remaining: false
    });
  });
  it("discloses a partial forecast without returning a private definition or scope", async () => {
    const viewer = randomUUID(),
      privateProject = randomUUID();
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      viewer,
      `${viewer}@example.test`
    ]);
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'viewer')",
      [randomUUID(), fixture.project, viewer]
    );
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Private project',$1::text)",
      [privateProject, fixture.org, fixture.owner]
    );
    await createReportDefinitionStore(db).create({
      organization_id: fixture.org,
      initiator: { version: 1, kind: "browser_session", user_id: fixture.owner },
      request_id: randomUUID(),
      definition: {
        name: "Private schedule",
        cadence: "daily",
        project_ids: [privateProject],
        recipient_user_ids: [],
        source_collection_consent: true,
        enabled: true,
        schedule: { time: "09:00", timezone: "UTC" }
      }
    });
    const result = await createReportAllowanceStore(db, { now: () => new Date(now) }).read({
      organization_id: fixture.org,
      definition_id: fixture.definition,
      initiator: { version: 1, kind: "browser_session", user_id: viewer }
    });
    expect(result.scope_complete).toBe(false);
    expect(result.remaining).toBe(40);
    expect(JSON.stringify(result)).not.toContain(privateProject);
    expect(JSON.stringify(result)).not.toContain("Private schedule");
  });
});
