import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { createReportDefinitionStore } from "../../packages/storage/src/report-definition-store.js";
import { createReportAvailabilityStore } from "../../packages/storage/src/report-availability-store.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import { lastCompletedReportPeriod } from "../../packages/smart-reports/src/report-period.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
runIntegration("report availability numeric history", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    definitions = createReportDefinitionStore(db),
    history = createReportAvailabilityStore(db);
  let org: string, project: string, owner: string, check: string, definition: string;
  const now = "2026-11-07T12:00:00.000Z";
  const settings = () => ({
    name: "Review",
    cadence: "monthly" as const,
    project_ids: [project],
    recipient_user_ids: [],
    privacy_mode: "restricted" as const,
    source_collection_consent: false,
    schedule: { time: "09:00", timezone: "UTC" },
    enabled: true
  });
  const save = () =>
    definitions.create({
      organization_id: org,
      initiator: { version: 1, kind: "browser_session", user_id: owner },
      request_id: randomUUID(),
      definition: settings()
    });
  const write = async (day: string, total = 10, success = 8) =>
    pool.query(
      `INSERT INTO availability_check_daily_rollups(id,check_id,project_id,day,state,total_checks,successful_checks,failed_checks,downtime_seconds,first_checked_at,last_checked_at)
 VALUES($1,$2,$3,$4::date,'operational',$5::integer,$6::integer,$5::integer-$6::integer,120,$4::date::timestamp AT TIME ZONE 'UTC',($4::date::timestamp AT TIME ZONE 'UTC')+interval '12 hours')
 ON CONFLICT(check_id,day) DO UPDATE SET total_checks=EXCLUDED.total_checks,successful_checks=EXCLUDED.successful_checks,failed_checks=EXCLUDED.failed_checks`,
      [randomUUID(), check, project, day, total, success]
    );
  beforeEach(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    org = randomUUID();
    project = randomUUID();
    owner = randomUUID();
    check = randomUUID();
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      owner,
      `${owner}@example.test`
    ]);
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan) VALUES($1::uuid,'Reports',$1::text,'business')",
      [org]
    );
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
      [randomUUID(), org, owner]
    );
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Project',$1::text)",
      [project, org, owner]
    );
    await pool.query(
      "INSERT INTO availability_checks(id,project_id,name,url,method,interval_seconds) VALUES($1,$2,'API','https://example.test','GET',60)",
      [check, project]
    );
  });
  afterAll(async () => {
    await pool.end();
  });
  it("stops trigger-driven history at trial expiry and starts a fresh coverage epoch on late conversion", async () => {
    await pool.query(
      "UPDATE organizations SET billing_state='trialing',trial_plan='business',trial_started_at=now()-interval '14 days',trial_ends_at=now()+interval '16 days' WHERE id=$1",
      [org]
    );
    definition = (await save()).id;
    await write("2026-10-01");
    const before = (
      await pool.query<{ collected_from: Date }>(
        "SELECT collected_from FROM report_collection_coverage WHERE definition_id=$1",
        [definition]
      )
    ).rows[0]!.collected_from;
    await pool.query(
      "UPDATE organizations SET trial_ends_at=now()-interval '1 second' WHERE id=$1",
      [org]
    );
    await write("2026-10-02");
    await pool.query(
      "INSERT INTO incidents(id,project_id,environment,fingerprint,title,severity,status,first_seen_at,last_seen_at) VALUES($1::uuid,$2,'test',$1::text,'Expired trial','critical','open',now(),now())",
      [randomUUID(), project]
    );
    expect((await pool.query("SELECT * FROM report_availability_days")).rows).toHaveLength(1);
    expect((await pool.query("SELECT * FROM report_lifecycle_facts")).rows).toHaveLength(0);
    expect(
      (await pool.query("SELECT billing_state,plan FROM organizations WHERE id=$1", [org])).rows[0]
    ).toEqual({ billing_state: "trialing", plan: "business" });
    await pool.query("UPDATE organizations SET billing_state='active' WHERE id=$1", [org]);
    const resumed = (
      await pool.query<{ collected_from: Date }>(
        "SELECT collected_from FROM report_collection_coverage WHERE definition_id=$1",
        [definition]
      )
    ).rows[0]!.collected_from;
    expect(new Date(resumed).getTime()).toBeGreaterThan(new Date(before).getTime());
    await write("2026-10-03");
    expect((await pool.query("SELECT * FROM report_availability_days")).rows).toHaveLength(2);
  });

  it("captures numeric rollups only while a report is enabled and preserves them through routine history pruning", async () => {
    await write("2026-10-01");
    expect((await pool.query("SELECT * FROM report_availability_days")).rows).toEqual([]);
    definition = (await save()).id;
    await write("2026-10-02");
    await write("2026-10-02", 20, 18);
    expect((await pool.query("SELECT * FROM report_availability_days")).rows).toHaveLength(1);
    await pool.query("DELETE FROM availability_check_daily_rollups");
    const result = await history.readPeriod({
      definition_id: definition,
      origin_ids: [project],
      period: lastCompletedReportPeriod("monthly", "2026-11-01T00:00:00.000Z"),
      now
    });
    expect(result).toMatchObject({
      total_checks: 20,
      successful_checks: 18,
      estimated_check_downtime_seconds: 120,
      complete: false
    });
    await pool.query("DELETE FROM projects WHERE id=$1", [project]);
    expect((await pool.query("SELECT * FROM report_availability_days")).rows).toEqual([]);
  });
  it("backfills retained numeric rows in bounded resumable batches without claiming prior complete coverage", async () => {
    for (const day of ["2026-10-01", "2026-10-02", "2026-10-03"]) await write(day);
    definition = (await save()).id;
    const first = await history.backfill({ definition_id: definition, now, limit: 2 });
    expect(first).toMatchObject({ examined: 2, done: false });
    const second = await history.backfill({
      definition_id: definition,
      now,
      limit: 2,
      after: first.next_cursor!
    });
    expect(second).toMatchObject({ examined: 1, done: true });
    await history.backfill({ definition_id: definition, now, limit: 10 });
    expect((await pool.query("SELECT * FROM report_availability_days")).rows).toHaveLength(3);
    const result = await history.readPeriod({
      definition_id: definition,
      origin_ids: [project],
      period: lastCompletedReportPeriod("monthly", "2026-11-01T00:00:00.000Z"),
      now
    });
    expect(result).toMatchObject({ total_checks: 30, complete: false });
  });
  it("resets continuous-collection coverage across disabled schedules, plan loss and workspace suspension", async () => {
    definition = (await save()).id;
    await pool.query(
      "UPDATE report_collection_coverage SET collected_from='2026-01-01' WHERE definition_id=$1",
      [definition]
    );
    await definitions.replace({
      organization_id: org,
      initiator: { version: 1, kind: "browser_session", user_id: owner },
      id: definition,
      definition: { ...settings(), enabled: false, expected_version: 1 }
    });
    expect((await pool.query("SELECT * FROM report_collection_coverage")).rows).toEqual([]);
    await definitions.replace({
      organization_id: org,
      initiator: { version: 1, kind: "browser_session", user_id: owner },
      id: definition,
      definition: { ...settings(), expected_version: 2 }
    });
    expect(
      new Date(
        (
          await pool.query<{ collected_from: Date }>(
            "SELECT collected_from FROM report_collection_coverage"
          )
        ).rows[0]!.collected_from
      ).getTime()
    ).toBeGreaterThan(Date.parse("2026-11-01"));
    await pool.query("UPDATE organizations SET suspended_at=now() WHERE id=$1", [org]);
    expect((await pool.query("SELECT * FROM report_collection_coverage")).rows).toEqual([]);
    await pool.query("UPDATE organizations SET suspended_at=NULL WHERE id=$1", [org]);
    expect((await pool.query("SELECT * FROM report_collection_coverage")).rows).toHaveLength(1);
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [org]);
    expect((await pool.query("SELECT * FROM report_collection_coverage")).rows).toEqual([]);
  });
  it("uses twelve UTC calendar months and bounded numeric cleanup", async () => {
    definition = (await save()).id;
    await write("2025-11-06");
    await write("2025-11-07");
    expect(await history.prune({ now, limit: 1 })).toBe(1);
    expect(await history.prune({ now, limit: 1 })).toBe(0);
  });
  it("rejects startup if atomic availability capture has been disabled", async () => {
    await migrateStorageSchema(db);
    await pool.query(
      "ALTER TABLE availability_check_daily_rollups DISABLE TRIGGER availability_rollups_report_capture"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "report_availability_schema_incomplete"
    );
  });
});
