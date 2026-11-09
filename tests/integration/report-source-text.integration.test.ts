import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { createReportDefinitionStore } from "../../packages/storage/src/report-definition-store.js";
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

runIntegration("bounded report source text", () => {
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
  const collect = (expected_version = 1) =>
    sources.collect({
      organization_id: organization,
      definition_id: definitionId,
      expected_version,
      now
    });
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

  it("redacts reusable text before storage and never renews the original content lifetime", async () => {
    const id = await incident({
      title: "Failure for owner@example.test at https://secret.example.test/path"
    });
    expect(await collect()).toMatchObject({ collected: 1, paused: false });
    await collect();
    const rows = await sources.read({ definition_id: definitionId, now });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source_id: id,
      origin_project_id: project,
      selected_project_id: project,
      text_expires_at: "2026-12-30T00:00:00.000Z"
    });
    expect(JSON.stringify(rows)).not.toContain("owner@example.test");
    expect(JSON.stringify(rows)).not.toContain("secret.example.test");
    await pool.query("DELETE FROM incidents WHERE id=$1", [id]);
    expect(await sources.read({ definition_id: definitionId, now })).toHaveLength(1);
    expect(
      await sources.read({ definition_id: definitionId, now: "2026-12-30T00:00:00.000Z" })
    ).toEqual([]);
    expect(await sources.prune({ now: "2026-12-30T00:00:00.000Z", limit: 100 })).toBe(1);
  });
  it("keeps the urgent/resolved/recent bounds and does not collect unrelated origins", async () => {
    for (let index = 0; index < 25; index++) await incident();
    for (let index = 0; index < 20; index++) await incident({ status: "resolved" });
    for (let index = 0; index < 20; index++) await incident({ severity: "low" });
    expect(await collect()).toMatchObject({ collected: 50 });
    const rows = await sources.read({ definition_id: definitionId, now });
    expect(rows).toHaveLength(50);
    expect(rows.filter((row) => row.summary_group === "urgent")).toHaveLength(20);
    expect(rows.filter((row) => row.summary_group === "resolved")).toHaveLength(15);
    expect(rows.filter((row) => row.summary_group === "recent")).toHaveLength(15);
    expect(new Set(rows.map((row) => row.origin_project_id))).toEqual(new Set([project]));
  });
  it("fences stale collection and clears text immediately on privacy changes", async () => {
    await incident();
    await collect();
    await definitions.replace({
      organization_id: organization,
      initiator: actor(),
      id: definitionId,
      definition: {
        ...command(),
        privacy_mode: "restricted",
        source_collection_consent: false,
        expected_version: 1
      }
    });
    expect((await pool.query("SELECT * FROM report_source_text")).rows).toEqual([]);
    await expect(collect()).rejects.toThrow("report_version_conflict");
    expect(await collect(2)).toMatchObject({ collected: 0, paused: false });
  });
  it("refreshes cached resolution even when the source falls outside the selected resolved text slots", async () => {
    const old = await incident();
    await collect();
    await pool.query(
      "UPDATE incidents SET status='resolved',resolved_at='2026-11-06',updated_at='2026-11-06',last_seen_at='2026-10-02' WHERE id=$1",
      [old]
    );
    for (let index = 0; index < 20; index++) await incident({ status: "resolved" });
    await collect();
    const rows = await sources.read({ definition_id: definitionId, now });
    expect(rows.filter((row) => row.summary_group === "urgent")).toEqual([]);
    expect(rows.find((row) => row.source_id === old)?.status).not.toBe("open");
  });
  it("pauses and clears the cache when the saved creator loses whole-scope authority", async () => {
    await incident();
    await collect();
    await pool.query(
      "UPDATE organization_members SET suspended_at=now() WHERE organization_id=$1 AND user_id=$2",
      [organization, owner]
    );
    expect(await collect()).toMatchObject({ collected: 0, paused: true });
    expect((await pool.query("SELECT * FROM report_source_text")).rows).toEqual([]);
    expect(
      (await pool.query("SELECT pause_reason FROM report_definitions WHERE id=$1", [definitionId]))
        .rows[0]
    ).toMatchObject({ pause_reason: "creator_access_lost" });
  });
  it("does not collect expired evidence and removes all dependent text on explicit project deletion", async () => {
    await incident({ contentAt: "2026-01-01" });
    expect(await collect()).toMatchObject({ collected: 0 });
    await incident();
    await collect();
    await pool.query("DELETE FROM projects WHERE id=$1", [project]);
    expect((await pool.query("SELECT * FROM report_source_text")).rows).toEqual([]);
  });
  it("fails readiness when the privacy deletion guard has been disabled", async () => {
    await migrateStorageSchema(db);
    await pool.query(
      "ALTER TABLE report_definitions DISABLE TRIGGER report_definitions_source_privacy_guard"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "report_source_text_schema_incomplete"
    );
  });
  it("bounds oversized Unicode source metadata before transfer and keeps one source from blocking collection", async () => {
    await pool.query(
      `INSERT INTO improvement_opportunities(id,project_id,service_name,kind,severity,confidence,fingerprint,title,summary,evidence,
      first_detected_at,last_detected_at,created_at,updated_at) VALUES($1,$2,'api','performance','high',0.9,'oversized',$3,$4,'{}','2026-10-01','2026-11-01','2026-10-01','2026-11-01')`,
      [randomUUID(), project, "😀".repeat(9000), "😀".repeat(17000)]
    );
    const stored = (
      await pool.query<{ title: string; summary: string }>(
        "SELECT title,summary FROM improvement_opportunities WHERE fingerprint='oversized'"
      )
    ).rows[0]!;
    expect(stored.title.length).toBe(18000);
    expect(stored.summary.length).toBe(34000);
    expect(await collect()).toMatchObject({ collected: 1 });
    const rows = await sources.read({ definition_id: definitionId, now });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title.length).toBeLessThanOrEqual(160);
    expect(rows[0]!.context!.length).toBeLessThanOrEqual(1600);
  });
  it("does not rewrite unchanged cached evidence on repeated collection", async () => {
    await incident();
    await collect();
    const before = (
      await pool.query<{ revision: string }>(
        "SELECT xmin::text AS revision FROM report_source_text"
      )
    ).rows[0]!.revision;
    await collect();
    const after = (
      await pool.query<{ revision: string }>(
        "SELECT xmin::text AS revision FROM report_source_text"
      )
    ).rows[0]!.revision;
    expect(after).toBe(before);
  });
});
