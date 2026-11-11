import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { createReportSchedulerStore } from "../../packages/storage/src/report-scheduler-store.js";
import { createReportRunAdmissionStore } from "../../packages/storage/src/report-run-admission.js";
import { reportModelProfile } from "../../packages/smart-reports/src/model-request.js";
import { lastCompletedReportPeriod } from "../../packages/smart-reports/src/report-period.js";
import { resetReportRunFixture } from "../helpers/report-runs.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
runIntegration("durable report due scheduler", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    scheduler = createReportSchedulerStore(db, { profile: reportModelProfile("gpt-6.1-terra") });
  let fixture: Awaited<ReturnType<typeof resetReportRunFixture>>, end: string, due: string;
  beforeEach(async () => {
    fixture = await resetReportRunFixture(pool, db);
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - 1);
    end = date.toISOString();
    date.setUTCHours(9);
    due = date.toISOString();
    await pool.query(
      "UPDATE report_definitions SET cadence='daily',schedule=$2::jsonb,next_due_at=$3,next_period_ends_at=$4 WHERE id=$1",
      [fixture.definition, JSON.stringify({ time: "09:00", timezone: "UTC" }), due, end]
    );
  });
  afterAll(async () => {
    await pool.end();
  });
  it("admits one fixed UTC period and atomically advances its next local delivery", async () => {
    expect(await scheduler.scheduleNext()).toEqual({ processed: true });
    const run = (
      await pool.query<{ period_ends_at: Date; generation_kind: string; send_email: boolean }>(
        "SELECT period_ends_at,generation_kind,send_email FROM report_runs"
      )
    ).rows[0]!;
    expect(run.period_ends_at.toISOString()).toBe(end);
    expect(run.generation_kind).toBe("scheduled");
    expect(run.send_email).toBe(true);
    const next = (
      await pool.query<{ next_due_at: Date; next_period_ends_at: Date }>(
        "SELECT next_due_at,next_period_ends_at FROM report_definitions"
      )
    ).rows[0]!;
    expect(next.next_due_at.getTime()).toBeGreaterThan(Date.parse(due));
    expect(next.next_period_ends_at.getTime()).toBeGreaterThan(Date.parse(end));
    // Recovered delivery identity returns the original receipt, not another job.
    await pool.query(
      "UPDATE report_definitions SET next_due_at=$2,next_period_ends_at=$3 WHERE id=$1",
      [fixture.definition, due, end]
    );
    await scheduler.scheduleNext();
    expect((await pool.query("SELECT id FROM report_runs")).rows).toHaveLength(1);
    expect(
      (await pool.query("SELECT id FROM worker_jobs WHERE job_name='generate-smart-report'")).rows
    ).toHaveLength(1);
  });
  it("pauses an unbounded restricted identity scope without leaving a reservation or blocking later schedules", async () => {
    await pool.query("UPDATE report_definitions SET privacy_mode='restricted' WHERE id=$1", [
      fixture.definition
    ]);
    await pool.query("UPDATE projects SET name=repeat('x',321) WHERE id=$1", [fixture.project]);
    await expect(scheduler.scheduleNext()).resolves.toEqual({ processed: true });
    expect(
      (
        await pool.query(
          "SELECT pause_reason,paused_at IS NOT NULL AS paused FROM report_definitions"
        )
      ).rows[0]
    ).toEqual({ pause_reason: "scope_unavailable", paused: true });
    expect((await pool.query("SELECT id FROM report_runs")).rows).toHaveLength(0);
    expect((await pool.query("SELECT * FROM report_allowance_windows")).rows).toHaveLength(0);
    await expect(scheduler.scheduleNext()).resolves.toEqual({ processed: false });
  });
  it("rolls back the complete admission if advancement fails", async () => {
    await pool.query(
      `CREATE FUNCTION reject_report_advance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.next_due_at>OLD.next_due_at THEN RAISE EXCEPTION 'test_report_advance_failed'; END IF; RETURN NEW; END $$`
    );
    await pool.query(
      "CREATE TRIGGER reject_report_advance BEFORE UPDATE OF next_due_at ON report_definitions FOR EACH ROW EXECUTE FUNCTION reject_report_advance()"
    );
    await expect(scheduler.scheduleNext()).rejects.toThrow("test_report_advance_failed");
    expect((await pool.query("SELECT id FROM report_runs")).rows).toEqual([]);
    expect((await pool.query("SELECT * FROM report_allowance_windows")).rows).toEqual([]);
    expect(
      (await pool.query("SELECT id FROM worker_jobs WHERE job_name='generate-smart-report'")).rows
    ).toEqual([]);
  });
  it("resumes one persisted overdue period after a long outage without draining the allowance on a catch-up burst", async () => {
    await pool.query(
      "UPDATE report_definitions SET next_due_at=next_due_at-interval '45 days',next_period_ends_at=next_period_ends_at-interval '45 days' WHERE id=$1",
      [fixture.definition]
    );
    expect(await scheduler.scheduleNext()).toEqual({ processed: true });
    expect(await scheduler.scheduleNext()).toEqual({ processed: false });
    expect((await pool.query("SELECT id FROM report_runs")).rows).toHaveLength(1);
    expect(
      (await pool.query("SELECT generations FROM report_allowance_windows")).rows[0]
    ).toMatchObject({ generations: 1 });
    expect(
      (await pool.query("SELECT next_due_at>clock_timestamp() AS future FROM report_definitions"))
        .rows[0]
    ).toEqual({ future: true });
  });
  it("records a visible generation-quota skip and advances without enqueuing unpaid work", async () => {
    for (let index = 0; index < 40; index++) await fixture.admit();
    await scheduler.scheduleNext();
    expect(
      (
        await pool.query(
          "SELECT status,skip_reason,generation_counted,ai_reserved_nano_usd FROM report_runs WHERE generation_kind='scheduled'"
        )
      ).rows
    ).toEqual([
      {
        status: "skipped_quota",
        skip_reason: "generation_quota",
        generation_counted: false,
        ai_reserved_nano_usd: "0"
      }
    ]);
    expect(
      (await pool.query("SELECT id FROM worker_jobs WHERE job_name='generate-smart-report'")).rows
    ).toHaveLength(40);
    expect(
      (await pool.query("SELECT generations,held_nano_usd FROM report_allowance_windows")).rows[0]
    ).toMatchObject({ generations: 40, held_nano_usd: "990000000" });
  });
  it("keeps AI-budget skips visible while retaining manual admission errors", async () => {
    const constrained = createReportSchedulerStore(db, {
      profile: reportModelProfile("gpt-6.1-terra"),
      monthly_budget_nano_usd: 0
    });
    await constrained.scheduleNext();
    expect((await pool.query("SELECT status,skip_reason FROM report_runs")).rows).toEqual([
      { status: "skipped_quota", skip_reason: "ai_budget" }
    ]);
    expect(
      (await pool.query("SELECT generations,held_nano_usd FROM report_allowance_windows")).rows[0]
    ).toMatchObject({ generations: 0, held_nano_usd: "0" });
    await expect(
      createReportRunAdmissionStore(db, {
        profile: reportModelProfile("gpt-6.1-terra"),
        monthly_budget_nano_usd: 0,
        record_scheduled_quota_skips: true
      }).admit({
        organization_id: fixture.org,
        initiator: { version: 1, kind: "browser_session", user_id: fixture.owner },
        request_id: randomUUID(),
        definition_id: fixture.definition,
        expected_version: 1,
        period: lastCompletedReportPeriod("daily", end),
        kind: "manual"
      })
    ).rejects.toThrow("report_ai_budget_exhausted");
  });
  it("pauses revoked initiating authority without substituting an owner or creating a run", async () => {
    await pool.query("UPDATE users SET email_verified_at=NULL WHERE id=$1", [fixture.owner]);
    expect(await scheduler.scheduleNext()).toEqual({ processed: true });
    expect((await pool.query("SELECT pause_reason FROM report_definitions")).rows).toEqual([
      { pause_reason: "creator_access_lost" }
    ]);
    expect((await pool.query("SELECT id FROM report_runs")).rows).toEqual([]);
  });
  it("serialises competing due claims without duplicating a period or reservation", async () => {
    await Promise.all([scheduler.scheduleNext(), scheduler.scheduleNext()]);
    const rows = (
      await pool.query<{ period_ends_at: Date }>("SELECT period_ends_at FROM report_runs")
    ).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((row) => row.period_ends_at.toISOString())).size).toBe(rows.length);
    expect(
      (await pool.query("SELECT generations FROM report_allowance_windows")).rows[0]?.generations
    ).toBe(rows.length);
  });
  it("advances more than a hundred due definitions without hiding later accounts", async () => {
    const orgs = [fixture.org, ...Array.from({ length: 20 }, () => randomUUID())];
    for (const org of orgs.slice(1)) {
      await pool.query(
        "INSERT INTO organizations(id,name,slug,plan) VALUES($1::uuid,'Backlog',$1::text,'business')",
        [org]
      );
      await pool.query(
        "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
        [randomUUID(), org, fixture.owner]
      );
    }
    const initiator = JSON.stringify({
      version: 1,
      kind: "browser_session",
      user_id: fixture.owner
    });
    let remaining = 100;
    for (const [index, org] of orgs.entries()) {
      const project = index === 0 ? fixture.project : randomUUID();
      if (index !== 0)
        await pool.query(
          "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Backlog',$1::text)",
          [project, org, fixture.owner]
        );
      const count = Math.min(index === 0 ? 4 : 5, remaining);
      remaining -= count;
      await pool.query(
        `INSERT INTO report_definitions(id,organization_id,created_by_user_id,initiating_authority,creation_request_id,creation_digest,name,cadence,privacy_mode,source_collection_consent,accepted_scope,recipient_user_ids,schedule,enabled,next_due_at,next_period_ends_at)
        SELECT gen_random_uuid(),$1,$2,$3::jsonb,gen_random_uuid(),repeat('a',64),'Backlog review','daily','full',true,$4::jsonb,ARRAY[]::uuid[],$5::jsonb,true,$6,$7 FROM generate_series(1,$8::int)`,
        [
          org,
          fixture.owner,
          initiator,
          JSON.stringify([{ project_id: project, origin_project_ids: [project] }]),
          JSON.stringify({ time: "09:00", timezone: "UTC" }),
          due,
          end,
          count
        ]
      );
    }
    expect(remaining).toBe(0);
    const factual = createReportSchedulerStore(db, { profile: null });
    for (let i = 0; i < 21; i++) expect(await factual.scheduleNext()).toEqual({ processed: true });
    expect(
      (await pool.query("SELECT DISTINCT organization_id FROM report_runs")).rows
    ).toHaveLength(21);
    let passes = 21;
    while (passes < 220 && (await factual.scheduleNext()).processed) passes++;
    expect(passes).toBeLessThan(220);
    expect((await pool.query("SELECT DISTINCT definition_id FROM report_runs")).rows).toHaveLength(
      101
    );
    expect(
      (await pool.query("SELECT id FROM report_definitions WHERE next_due_at<=clock_timestamp()"))
        .rows
    ).toEqual([]);
  }, 30000);
});
