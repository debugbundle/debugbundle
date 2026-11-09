import { createReportLifecycleStore } from "../../packages/storage/src/report-lifecycle-store.js";
import { readReportSourceSnapshot } from "../../packages/storage/src/report-source-snapshot.js";
import { createReportDefinitionStore } from "../../packages/storage/src/report-definition-store.js";
import { lastCompletedReportPeriod } from "../../packages/smart-reports/src/report-period.js";
import { assertStorageSchemaMigrationsApplied } from "../../packages/storage/src/schema-migrations.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("project report lifecycle facts", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  let project: string, incident: string, organization: string, owner: string, definition: string;
  beforeEach(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    const org = randomUUID();
    organization = org;
    owner = randomUUID();
    project = randomUUID();
    incident = randomUUID();
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      owner,
      `${owner}@example.test`
    ]);
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan) VALUES($1::uuid,'Report source',$1::text,'business')",
      [org]
    );
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1,$2,$3,'Source','source')",
      [project, org, owner]
    );
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
      [randomUUID(), org, owner]
    );
    definition = (
      await createReportDefinitionStore(db).create({
        organization_id: org,
        initiator: { version: 1, kind: "browser_session", user_id: owner },
        request_id: randomUUID(),
        definition: {
          name: "Review",
          cadence: "monthly",
          project_ids: [project],
          recipient_user_ids: [],
          privacy_mode: "restricted",
          source_collection_consent: false,
          schedule: { time: "09:00", timezone: "UTC" },
          enabled: true
        }
      })
    ).id;
    await pool.query(
      "INSERT INTO incidents(id,project_id,fingerprint,title,severity,status,first_seen_at,last_seen_at) VALUES($1,$2,'fingerprint','Private captured title','critical','open','2026-11-01','2026-11-01')",
      [incident, project]
    );
  });
  afterAll(async () => {
    await pool.end();
  });
  it("records resolve, regression and repeated resolution without counting duplicate state writes", async () => {
    await pool.query(
      "UPDATE incidents SET status='resolved',resolved_at='2026-11-02' WHERE id=$1",
      [incident]
    );
    await pool.query("UPDATE incidents SET status='resolved',updated_at=now() WHERE id=$1", [
      incident
    ]);
    await pool.query(
      "UPDATE incidents SET status='regressed',regressed_at='2026-11-03' WHERE id=$1",
      [incident]
    );
    await pool.query(
      "UPDATE incidents SET status='resolved',resolved_at='2026-11-04',regressed_at=NULL WHERE id=$1",
      [incident]
    );
    const facts = (
      await pool.query<{ transition: string; severity: string; occurred_at: string }>(
        "SELECT transition,severity,occurred_at::text FROM report_lifecycle_facts WHERE source_id=$1 ORDER BY id",
        [incident]
      )
    ).rows;
    expect(facts.map((f) => f.transition)).toEqual(["opened", "resolved", "regressed", "resolved"]);
    expect(facts.every((f) => f.severity === "critical")).toBe(true);
    expect(new Date(String(facts[3]?.occurred_at)).toISOString()).toBe("2026-11-04T00:00:00.000Z");
  });
  it("keeps numeric lifecycle evidence through routine source pruning without claiming resolution", async () => {
    await pool.query("DELETE FROM incidents WHERE id=$1", [incident]);
    const facts = (
      await pool.query("SELECT * FROM report_lifecycle_facts WHERE source_id=$1", [incident])
    ).rows;
    expect(facts).toHaveLength(1);
    expect(facts[0]?.transition).toBe("opened");
    expect(JSON.stringify(facts)).not.toContain("Private captured title");
    await pool.query("DELETE FROM projects WHERE id=$1", [project]);
    expect((await pool.query("SELECT * FROM report_lifecycle_facts")).rows).toHaveLength(0);
  });
  it("rolls report facts back with the lifecycle mutation", async () => {
    await expect(
      db.transaction!(async (tx) => {
        await tx.query(
          "UPDATE incidents SET status='resolved',resolved_at='2026-11-02' WHERE id=$1",
          [incident]
        );
        throw new Error("rollback");
      })
    ).rejects.toThrow("rollback");
    expect(
      (
        await pool.query(
          "SELECT transition FROM report_lifecycle_facts WHERE source_id=$1 ORDER BY id",
          [incident]
        )
      ).rows
    ).toEqual([{ transition: "opened" }]);
  });
  it("distinguishes improvement snoozing/restoration from a recorded resolution", async () => {
    const improvement = randomUUID();
    await pool.query(
      "INSERT INTO improvement_opportunities(id,project_id,service_name,kind,severity,confidence,fingerprint,title,summary,evidence,first_detected_at,last_detected_at) VALUES($1,$2,'api','performance','high',0.9,'improvement','private title','private summary','{}'::jsonb,'2026-11-01','2026-11-01')",
      [improvement, project]
    );
    await pool.query(
      "UPDATE improvement_opportunities SET status='snoozed',snoozed_until='2026-11-10' WHERE id=$1",
      [improvement]
    );
    await pool.query(
      "UPDATE improvement_opportunities SET status='open',snoozed_until=NULL WHERE id=$1",
      [improvement]
    );
    await pool.query(
      "UPDATE improvement_opportunities SET status='resolved',resolved_at='2026-11-03' WHERE id=$1",
      [improvement]
    );
    const facts = (
      await pool.query<{ transition: string }>(
        "SELECT transition FROM report_lifecycle_facts WHERE source_id=$1 ORDER BY id",
        [improvement]
      )
    ).rows;
    expect(facts.map((f) => f.transition)).toEqual(["opened", "snoozed", "restored", "resolved"]);
  });
  it("backfills only retained known transitions once and preserves incomplete historical coverage", async () => {
    const old = randomUUID();
    await pool.query("ALTER TABLE incidents DISABLE TRIGGER incidents_report_lifecycle");
    await pool.query(
      "INSERT INTO incidents(id,project_id,fingerprint,title,severity,status,first_seen_at,last_seen_at,resolved_at) VALUES($1,$2,'old','private old title','high','resolved','2026-10-25','2026-11-01','2026-11-02')",
      [old, project]
    );
    await pool.query("ALTER TABLE incidents ENABLE TRIGGER incidents_report_lifecycle");
    const store = createReportLifecycleStore(db);
    const input = {
      project_id: project,
      source_type: "incident" as const,
      limit: 100,
      now: "2026-12-01T00:00:00.000Z"
    };
    await store.backfill(input);
    await store.backfill(input);
    expect(
      (
        await pool.query(
          "SELECT transition,backfilled,severity FROM report_lifecycle_facts WHERE source_id=$1 AND transition<>'observed' ORDER BY occurred_at,id",
          [old]
        )
      ).rows
    ).toEqual([
      { transition: "opened", backfilled: true, severity: "unknown" },
      { transition: "resolved", backfilled: true, severity: "unknown" }
    ]);
    expect(
      (
        await pool.query(
          "SELECT transition,backfilled,severity,to_status FROM report_lifecycle_facts WHERE source_id=$1 AND transition='observed'",
          [old]
        )
      ).rows
    ).toEqual([
      { transition: "observed", backfilled: false, severity: "high", to_status: "resolved" }
    ]);
    const summaries = await store.readPeriod({
      definition_id: definition,
      origin_ids: [project],
      period: lastCompletedReportPeriod("monthly", input.now),
      now: input.now
    });
    expect(summaries[0]).toMatchObject({
      project_id: project,
      coverage: { complete: false },
      incidents: { opened: 1, resolution_events: 1, distinct_resolved: 1 }
    });
    expect(JSON.stringify(summaries)).not.toContain("private");
  });
  it("bounds numeric retention to twelve UTC calendar months and respects its deletion batch", async () => {
    await pool.query(
      "INSERT INTO report_lifecycle_facts(project_id,source_type,source_id,transition,to_status,severity,occurred_at) VALUES($1,'incident',$2,'opened','open','high','2025-10-01'),($1,'incident',$3,'opened','open','low','2025-10-02')",
      [project, randomUUID(), randomUUID()]
    );
    const store = createReportLifecycleStore(db);
    expect(await store.prune({ now: "2026-11-07T00:00:00.000Z", limit: 1 })).toBe(1);
    expect(
      (await pool.query("SELECT * FROM report_lifecycle_facts WHERE occurred_at<'2025-11-07'")).rows
    ).toHaveLength(1);
    expect(await store.prune({ now: "2026-11-07T00:00:00.000Z", limit: 10 })).toBe(1);
    expect(
      (await pool.query("SELECT * FROM report_lifecycle_facts WHERE source_id=$1", [incident])).rows
    ).toHaveLength(1);
  });
  it("rejects missing report triggers despite a complete migration ledger", async () => {
    await pool.query("DROP TRIGGER incidents_report_lifecycle ON incidents");
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "report_lifecycle_schema_incomplete"
    );
  });
  it("retains known outstanding priorities after pruning and reconstructs earlier state without text", async () => {
    const cutoff = "2026-12-01T00:00:00.000Z";
    await pool.query(
      "UPDATE incidents SET status='resolved',resolved_at='2026-11-10',updated_at='2026-11-10' WHERE id=$1",
      [incident]
    );
    const input = {
      origin_ids: [project],
      cutoff_at: cutoff,
      period: lastCompletedReportPeriod("monthly", cutoff),
      at: cutoff
    };
    const resolved = await readReportSourceSnapshot(db, input);
    expect(resolved.sources[0]).toMatchObject({
      source_id: incident,
      status: "resolved",
      period_events: ["new", "resolved"]
    });
    const before = await readReportSourceSnapshot(db, { ...input, at: "2026-11-09T00:00:00.000Z" });
    expect(before).toMatchObject({ open_critical_incidents: 1 });
    expect(before.sources[0]).toMatchObject({ status: "open" });
    await pool.query(
      "UPDATE incidents SET status='regressed',regressed_at='2026-11-20',updated_at='2026-11-20' WHERE id=$1",
      [incident]
    );
    await pool.query("DELETE FROM incidents WHERE id=$1", [incident]);
    const pruned = await readReportSourceSnapshot(db, input);
    expect(pruned).toMatchObject({ open_critical_incidents: 1 });
    expect(pruned.sources[0]).toMatchObject({
      status: "regressed",
      retained: false,
      period_events: ["new", "resolved", "regressed"]
    });
    expect(JSON.stringify(pruned)).not.toContain("Private captured title");
    await pool.query("DELETE FROM projects WHERE id=$1", [project]);
    expect((await readReportSourceSnapshot(db, input)).sources).toEqual([]);
  });
  it("does not admit late-recorded lifecycle evidence after the frozen cutoff", async () => {
    await pool.query(
      "UPDATE report_lifecycle_facts SET recorded_at='2026-12-02' WHERE source_id=$1",
      [incident]
    );
    await pool.query("DELETE FROM incidents WHERE id=$1", [incident]);
    const cutoff = "2026-12-01T00:00:00.000Z";
    expect(
      (
        await readReportSourceSnapshot(db, {
          origin_ids: [project],
          at: cutoff,
          cutoff_at: cutoff,
          period: lastCompletedReportPeriod("monthly", cutoff)
        })
      ).sources
    ).toEqual([]);
    expect(
      (
        await createReportLifecycleStore(db).readPeriod({
          definition_id: definition,
          origin_ids: [project],
          now: cutoff,
          period: lastCompletedReportPeriod("monthly", cutoff)
        })
      )[0]?.incidents.opened
    ).toBe(0);
  });
  it.each(["business", "free"])(
    "does not start numeric report collection for a non-opted-in %s project",
    async (plan) => {
      if (plan === "free")
        await pool.query("UPDATE organizations SET plan='free' WHERE id=$1", [organization]);
      const unselected = randomUUID(),
        source = randomUUID();
      await pool.query(
        "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Unselected',$1::text)",
        [unselected, organization, owner]
      );
      await pool.query(
        "INSERT INTO incidents(id,project_id,fingerprint,title,severity,status,first_seen_at,last_seen_at) VALUES($1,$2,'unselected','Unselected','high','open','2026-11-01','2026-11-01')",
        [source, unselected]
      );
      expect(
        (await pool.query("SELECT * FROM report_lifecycle_facts WHERE source_id=$1", [source])).rows
      ).toEqual([]);
    }
  );
  it("stops report-specific capture across a disabled definition without changing the incident mutation", async () => {
    await pool.query("UPDATE report_definitions SET enabled=false WHERE id=$1", [definition]);
    await pool.query(
      "UPDATE incidents SET status='resolved',resolved_at='2026-11-02' WHERE id=$1",
      [incident]
    );
    expect(
      (
        await pool.query(
          "SELECT transition FROM report_lifecycle_facts WHERE source_id=$1 ORDER BY id",
          [incident]
        )
      ).rows
    ).toEqual([{ transition: "opened" }]);
    expect(
      (await pool.query("SELECT status FROM incidents WHERE id=$1", [incident])).rows[0]?.status
    ).toBe("resolved");
  });
  it("preserves a current high-priority observation when initial retained backfill is later pruned", async () => {
    const old = randomUUID();
    await pool.query("ALTER TABLE incidents DISABLE TRIGGER incidents_report_lifecycle");
    await pool.query(
      "INSERT INTO incidents(id,project_id,fingerprint,title,severity,status,first_seen_at,last_seen_at) VALUES($1,$2,'old-priority','Old priority','high','open','2026-10-01','2026-11-01')",
      [old, project]
    );
    await pool.query("ALTER TABLE incidents ENABLE TRIGGER incidents_report_lifecycle");
    const store = createReportLifecycleStore(db),
      now = "2026-12-01T00:00:00.000Z";
    await store.backfill({ project_id: project, source_type: "incident", limit: 100, now });
    await store.backfill({ project_id: project, source_type: "incident", limit: 100, now });
    await pool.query("DELETE FROM incidents WHERE id=$1", [old]);
    const snapshot = await readReportSourceSnapshot(db, {
      origin_ids: [project],
      at: now,
      cutoff_at: now,
      period: lastCompletedReportPeriod("monthly", now)
    });
    expect(snapshot.sources.find((source) => source.source_id === old)).toMatchObject({
      severity: "high",
      status: "open",
      retained: false,
      period_events: []
    });
    expect(
      (
        await pool.query(
          "SELECT * FROM report_lifecycle_facts WHERE source_id=$1 AND transition='observed'",
          [old]
        )
      ).rows
    ).toHaveLength(1);
  });
  it("labels evidence collected after period close as partial instead of asserting complete historical coverage", async () => {
    await pool.query(
      "UPDATE report_collection_coverage SET collected_from='2026-10-01' WHERE definition_id=$1",
      [definition]
    );
    await pool.query(
      "UPDATE report_lifecycle_facts SET recorded_at='2026-12-01T01:00:00Z' WHERE source_id=$1",
      [incident]
    );
    const now = "2026-12-02T00:00:00.000Z";
    const result = await createReportLifecycleStore(db).readPeriod({
      definition_id: definition,
      origin_ids: [project],
      period: lastCompletedReportPeriod("monthly", now),
      now
    });
    expect(result[0]).toMatchObject({ coverage: { complete: false }, incidents: { opened: 1 } });
  });
});
