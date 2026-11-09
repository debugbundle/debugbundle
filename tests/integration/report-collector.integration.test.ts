import { createSmartReportProcessor } from "../../apps/worker/src/smart-report-runtime.js";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { createReportDefinitionStore } from "../../packages/storage/src/report-definition-store.js";
import { createReportCollectorStore } from "../../packages/storage/src/report-collector-store.js";
import { createReportSourceTextStore } from "../../packages/storage/src/report-source-text-store.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("bounded periodic report collection", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    definitions = createReportDefinitionStore(db),
    sources = createReportSourceTextStore(db);
  let organization: string, project: string, owner: string, definitionId: string;
  const now = "2026-11-07T10:00:00.000Z";
  const actor = () => ({ version: 1 as const, kind: "browser_session" as const, user_id: owner });
  const command = () => ({
    name: "Review",
    cadence: "monthly" as const,
    project_ids: [project],
    recipient_user_ids: [],
    schedule: { time: "09:00", timezone: "UTC" },
    enabled: true,
    source_collection_consent: true
  });
  const step = (at = now, limit = 1) =>
    createReportCollectorStore(db).processNext({ now: at, limit });
  const incident = async (
    overrides: { status?: string; severity?: string; title?: string; contentAt?: string } = {}
  ) => {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO incidents(id,project_id,environment,fingerprint,title,severity,status,
      first_seen_at,last_seen_at,created_at,updated_at,bundle_created_at)
      VALUES($1::uuid,$2,'production',$1::text,$3,$4,$5,'2026-10-01','2026-11-01','2026-10-01','2026-11-01',$6)`,
      [
        id,
        project,
        overrides.title ?? "Checkout failure",
        overrides.severity ?? "critical",
        overrides.status ?? "open",
        overrides.contentAt ?? "2026-10-01"
      ]
    );
    return id;
  };
  beforeEach(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    organization = randomUUID();
    project = randomUUID();
    owner = randomUUID();
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      owner,
      `${owner}@example.test`
    ]);
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan) VALUES($1::uuid,'Reports',$1::text,'business')",
      [organization]
    );
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
      [randomUUID(), organization, owner]
    );
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Project',$1::text)",
      [project, organization, owner]
    );
    definitionId = (
      await definitions.create({
        organization_id: organization,
        initiator: actor(),
        request_id: randomUUID(),
        definition: command()
      })
    ).id;
  });
  afterAll(async () => {
    await pool.end();
  });

  afterEach(() => vi.unstubAllEnvs());
  it("collects opted-in reports for self-hosted Free accounts", async () => {
    vi.stubEnv("SELFHOST_MODE", "true");
    await pool.query("DELETE FROM report_definitions WHERE id=$1", [definitionId]);
    await pool.query("UPDATE organizations SET plan='free' WHERE id=$1", [organization]);
    definitionId = (
      await definitions.create({
        organization_id: organization,
        initiator: actor(),
        request_id: randomUUID(),
        definition: command()
      })
    ).id;
    await incident();
    expect(await step()).toMatchObject({ processed: true, failed: false });
  });

  it("resumes numeric batches after a new worker instance and refreshes bounded redacted summaries", async () => {
    await incident({ title: "Failure for owner@example.test" });
    await incident();
    expect(await step()).toMatchObject({ processed: true, failed: false });
    const first = (
      await pool.query("SELECT cursor FROM report_collection_progress WHERE definition_id=$1", [
        definitionId
      ])
    ).rows[0]?.cursor;
    expect(first).toMatchObject({ stage: "lifecycle", origin: 0, source: "incident" });
    expect(first.after_id).toBeTruthy();
    for (let i = 0; i < 8; i++) await step();
    expect(
      (
        await pool.query("SELECT cursor FROM report_collection_progress WHERE definition_id=$1", [
          definitionId
        ])
      ).rows[0]?.cursor
    ).toEqual({ stage: "refresh" });
    const summaries = await sources.read({ definition_id: definitionId, now });
    expect(summaries).toHaveLength(2);
    expect(JSON.stringify(summaries)).not.toContain("owner@example.test");
    expect(await step()).toEqual({ processed: false, failed: false });
    expect(await step("2026-11-07T10:06:00.000Z")).toMatchObject({ processed: true });
  });
  it("makes fair progress across definitions instead of finishing one backlog first", async () => {
    const second = (
      await definitions.create({
        organization_id: organization,
        initiator: actor(),
        request_id: randomUUID(),
        definition: command()
      })
    ).id;
    await incident();
    await step();
    await step();
    const rows = (
      await pool.query<{ definition_id: string }>(
        "SELECT definition_id FROM report_collection_progress ORDER BY definition_id"
      )
    ).rows;
    expect(rows.map((r) => r.definition_id).sort()).toEqual([definitionId, second].sort());
  });
  it("does not collect for disabled, suspended or downgraded definitions", async () => {
    await incident();
    await pool.query("UPDATE report_definitions SET enabled=false WHERE id=$1", [definitionId]);
    expect(await step()).toEqual({ processed: false, failed: false });
    await pool.query("UPDATE report_definitions SET enabled=true WHERE id=$1", [definitionId]);
    await pool.query("UPDATE organizations SET suspended_at=now() WHERE id=$1", [organization]);
    expect(await step()).toEqual({ processed: false, failed: false });
    await pool.query("UPDATE organizations SET suspended_at=NULL,plan='team' WHERE id=$1", [
      organization
    ]);
    expect(await step()).toEqual({ processed: false, failed: false });
    expect((await pool.query("SELECT * FROM report_source_text")).rows).toEqual([]);
  });
  it("checks the saved creator rather than borrowing the current owner", async () => {
    const replacement = randomUUID();
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      replacement,
      `${replacement}@example.test`
    ]);
    await pool.query("UPDATE projects SET owner_user_id=$2 WHERE id=$1", [project, replacement]);
    await pool.query("DELETE FROM organization_members WHERE user_id=$1", [owner]);
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
      [randomUUID(), organization, replacement]
    );
    expect(await step()).toMatchObject({ processed: true, failed: false });
    expect(
      (await pool.query("SELECT pause_reason FROM report_definitions WHERE id=$1", [definitionId]))
        .rows[0]?.pause_reason
    ).toBe("creator_access_lost");
    expect((await pool.query("SELECT * FROM report_collection_progress")).rows).toEqual([]);
  });
  it("rolls a failed batch back and delays it so other definitions can progress", async () => {
    const second = (
      await definitions.create({
        organization_id: organization,
        initiator: actor(),
        request_id: randomUUID(),
        definition: command()
      })
    ).id;
    await incident();
    let injected = false;
    const failing = {
      ...db,
      transaction: async <T>(callback: (tx: typeof db) => Promise<T>) =>
        db.transaction!(async (tx) =>
          callback({
            ...tx,
            query: async (sql, params) => {
              if (!injected && sql.includes("FROM incidents WHERE project_id=$1")) {
                injected = true;
                throw new Error("private failure");
              }
              return tx.query(sql, params);
            }
          })
        )
    };
    expect(await createReportCollectorStore(failing).processNext({ now, limit: 1 })).toEqual({
      processed: true,
      failed: true
    });
    expect(await step()).toMatchObject({ processed: true, failed: false });
    expect(
      (
        await pool.query(
          "SELECT definition_id FROM report_collection_progress WHERE last_error_code='collection_failed'"
        )
      ).rows
    ).toHaveLength(1);
    expect(
      (
        await pool.query<{ definition_id: string }>(
          "SELECT definition_id FROM report_collection_progress WHERE last_error_code IS NULL"
        )
      ).rows.map((r) => r.definition_id)
    ).toHaveLength(1);
    expect(second).toBeTruthy();
  });
  it("drops progress on deletion and restarts the cursor on a new definition version", async () => {
    await incident();
    await step();
    await pool.query("UPDATE report_definitions SET version=version+1 WHERE id=$1", [definitionId]);
    expect(await step()).toMatchObject({ processed: true });
    expect(
      (await pool.query("SELECT definition_version FROM report_collection_progress")).rows[0]
        ?.definition_version
    ).toBe(2);
    await pool.query("DELETE FROM report_definitions WHERE id=$1", [definitionId]);
    expect((await pool.query("SELECT * FROM report_collection_progress")).rows).toEqual([]);
  });
  it("keeps periodic collection off with the reporting switch and runs it without provider work when enabled", async () => {
    const objects = {
      putObject: async () => {},
      getObject: async () => Buffer.from(""),
      deleteObject: async () => {}
    };
    const off = createSmartReportProcessor({ db, objects, env: {}, emailSend: null });
    await off();
    expect((await pool.query("SELECT * FROM report_collection_progress")).rows).toEqual([]);
    const on = createSmartReportProcessor({
      db,
      objects,
      env: { SMART_REPORTS_ENABLED: "true" },
      emailSend: null
    });
    await on();
    expect((await pool.query("SELECT * FROM report_collection_progress")).rows).toHaveLength(1);
  });
  it("requires the forward collection schema in readiness", async () => {
    await assertStorageSchemaMigrationsApplied(db);
    await pool.query("DROP INDEX report_collection_progress_due_idx");
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "report_collector_schema_incomplete"
    );
  });
});
