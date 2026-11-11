import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";
import bundleExample from "../../examples/bundle.failure.json" with { type: "json" };
import { createReportContextCollector } from "../../packages/storage/src/report-context-collector.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { createReportDefinitionStore } from "../../packages/storage/src/report-definition-store.js";
import { createReportSourceTextStore } from "../../packages/storage/src/report-source-text-store.js";
import { createReportFactStore } from "../../packages/storage/src/report-facts-store.js";
import { createReportRunAdmissionStore } from "../../packages/storage/src/report-run-admission.js";
import { createReportRunExecutionStore } from "../../packages/storage/src/report-run-execution.js";
import { createWorkerJobStore } from "../../packages/storage/src/worker-job-store.js";
import { lastCompletedReportPeriod } from "../../packages/smart-reports/src/report-period.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
runIntegration("whole-scope report fact assembly", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    definitions = createReportDefinitionStore(db),
    facts = createReportFactStore(db);
  let org: string, project: string, owner: string, definition: string, source: string;
  const command = () => ({
    name: "Review",
    cadence: "monthly" as const,
    project_ids: [project],
    recipient_user_ids: [],
    source_collection_consent: true,
    schedule: { time: "09:00", timezone: "UTC" },
    enabled: true
  });
  const actor = () => ({ version: 1 as const, kind: "browser_session" as const, user_id: owner });
  const read = (version = 1) =>
    facts.readDefinition({
      organization_id: org,
      definition_id: definition,
      expected_version: version,
      period: lastCompletedReportPeriod("monthly", "2026-11-01T00:00:00.000Z"),
      cutoff_at: new Date().toISOString()
    });
  beforeEach(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    org = randomUUID();
    project = randomUUID();
    owner = randomUUID();
    source = randomUUID();
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
    definition = (
      await definitions.create({
        organization_id: org,
        initiator: actor(),
        request_id: randomUUID(),
        definition: command()
      })
    ).id;
    await pool.query(
      `INSERT INTO incidents(id,project_id,fingerprint,title,severity,status,first_seen_at,last_seen_at,created_at,updated_at)
 VALUES($1,$2,'failure','Private checkout error','critical','open','2026-10-20','2026-10-20','2026-10-20','2026-10-20')`,
      [source, project]
    );
    await pool.query(
      "UPDATE incidents SET status='resolved',resolved_at='2026-10-25',updated_at='2026-10-25' WHERE id=$1",
      [source]
    );
    await createReportSourceTextStore(db).collect({
      organization_id: org,
      definition_id: definition,
      expected_version: 1,
      now: new Date().toISOString()
    });
    await pool.query(
      "UPDATE incidents SET bundle_generation_number=2,bundle_created_at='2026-10-20',bundle_updated_at='2026-10-20' WHERE id=$1",
      [source]
    );
  });
  afterAll(async () => {
    await pool.end();
  });
  it("assembles retained actual resolution, coverage and private source references from the saved definition", async () => {
    const report = await read();
    expect(report.scope).toEqual([{ project_id: project, origin_project_ids: [project] }]);
    expect(report.facts.metrics.find((metric) => metric.key === "resolution_events")).toMatchObject(
      { current: 1 }
    );
    expect(report.facts.evidence[0]).toMatchObject({
      title: "Private checkout error",
      status: "resolved",
      period_events: ["new", "resolved"]
    });
    expect(report.sources[0]).toMatchObject({ source_id: source, origin_project_id: project });
    expect(JSON.stringify(report.facts)).not.toContain(source);
    expect(report.facts.projects[0]?.coverage.analytics).toBe("unavailable");
  });
  it("rejects stale definitions, plan loss, foreign workspaces and saved creator access loss", async () => {
    await expect(read(2)).rejects.toThrow("report_version_conflict");
    await expect(
      facts.readDefinition({
        organization_id: randomUUID(),
        definition_id: definition,
        expected_version: 1,
        period: lastCompletedReportPeriod("monthly", "2026-11-01T00:00:00.000Z"),
        cutoff_at: new Date().toISOString()
      })
    ).rejects.toThrow("report_not_found");
    await pool.query("UPDATE users SET email_verified_at=NULL WHERE id=$1", [owner]);
    await expect(read()).rejects.toThrow("forbidden");
    await pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [owner]);
    await pool.query("UPDATE organizations SET plan='free' WHERE id=$1", [org]);
    await expect(read(2)).rejects.toThrow("upgrade_required");
  });
  it("keeps the oldest critical source through both bounded storage and canonical selection", async () => {
    const old = randomUUID();
    await pool.query(
      `INSERT INTO incidents(id,project_id,fingerprint,title,severity,status,first_seen_at,last_seen_at,created_at,updated_at)
      VALUES($1,$2,'old-critical','Old critical','critical','open','2026-08-01','2026-10-20','2026-08-01','2026-10-20')`,
      [old, project]
    );
    await pool.query(
      `INSERT INTO incidents(id,project_id,fingerprint,title,severity,status,first_seen_at,last_seen_at,created_at,updated_at)
      SELECT gen_random_uuid(),$1,'noisy-'||i,'Recent critical','critical','open','2026-10-25','2026-10-26','2026-10-25','2026-10-26' FROM generate_series(1,25) i`,
      [project]
    );
    const report = await read();
    expect(report.sources.some((item) => item.source_id === old)).toBe(true);
    expect(
      report.facts.metrics.find((metric) => metric.key === "open_critical_incidents")?.current
    ).toBe(26);
  });
  it("reads and enriches a claimed run's original scope after ordinary definition scope changes", async () => {
    const run = await createReportRunAdmissionStore(db, { profile: null }).admit({
      organization_id: org,
      initiator: actor(),
      request_id: randomUUID(),
      definition_id: definition,
      expected_version: 1,
      period: lastCompletedReportPeriod("monthly", "2026-11-01T00:00:00.000Z"),
      kind: "manual"
    });
    const claim = (await createWorkerJobStore(db).claim("generate-smart-report"))!;
    await createReportRunExecutionStore(db).bind(claim);
    const other = randomUUID();
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Other',$1::text)",
      [other, org, owner]
    );
    await definitions.replace({
      organization_id: org,
      initiator: actor(),
      id: definition,
      definition: { ...command(), project_ids: [other], enabled: false, expected_version: 1 }
    });
    expect((await pool.query("SELECT * FROM report_source_text")).rows).toEqual([]);
    const original = await facts.readRun({ claim, cutoff_at: new Date().toISOString() });
    expect(original.scope).toEqual(run.scope);
    expect(original.facts.evidence[0]?.title).toBe("Private checkout error");
    const getObject = vi.fn().mockResolvedValue(object());
    const enriched = await createReportContextCollector(db, { getObject }).collectRun({
      claim,
      report: original
    });
    expect(enriched.facts.evidence[0]?.context).toContain("Retained bundle context");
    expect((await pool.query("SELECT * FROM report_source_text")).rows).toEqual([]);
    await pool.query(
      "UPDATE report_definitions SET privacy_mode='restricted',source_collection_consent=false WHERE id=$1",
      [definition]
    );
    await expect(facts.readRun({ claim, cutoff_at: new Date().toISOString() })).rejects.toThrow(
      "forbidden"
    );
    getObject.mockClear();
    await expect(
      createReportContextCollector(db, { getObject }).collectRun({ claim, report: original })
    ).rejects.toThrow("forbidden");
    expect(getObject).not.toHaveBeenCalled();
  });
  const object = () => {
    const bundle = structuredClone(bundleExample);
    bundle.project.id = project;
    bundle.bundle_id = `bnd_${source}`;
    bundle.metadata.generation_number = 2;
    bundle.metadata.created_at = "2026-10-20T00:00:00.000Z";
    bundle.metadata.updated_at = bundle.metadata.created_at;
    bundle.captured_at = bundle.metadata.created_at;
    bundle.signal.first_seen_at = bundle.metadata.created_at;
    bundle.signal.last_seen_at = bundle.metadata.created_at;
    bundle.summary.description = "Retained bundle context for checkout failure";
    return gzipSync(JSON.stringify(bundle));
  };
  it("adds verified retained context and preserves the cached bundle excerpt during subsequent metadata collection", async () => {
    const report = await read(),
      getObject = vi.fn().mockResolvedValue(object());
    const enriched = await createReportContextCollector(db, { getObject }).collect({
      organization_id: org,
      definition_id: definition,
      expected_version: 1,
      report
    });
    expect(getObject).toHaveBeenCalledWith({
      key: `bundles/${project}/${source}/bundle.json.gz`,
      maxBytes: 524288,
      timeoutMs: 1000
    });
    expect(enriched.facts.evidence[0]?.context).toContain("Retained bundle context");
    await createReportSourceTextStore(db).collect({
      organization_id: org,
      definition_id: definition,
      expected_version: 1,
      now: new Date().toISOString()
    });
    const cached = await read();
    expect(cached.facts.evidence[0]?.context).toContain("Retained bundle context");
    getObject.mockClear();
    await createReportContextCollector(db, { getObject }).collect({
      organization_id: org,
      definition_id: definition,
      expected_version: 1,
      report: cached
    });
    expect(getObject).not.toHaveBeenCalled();
  });
  it("rejects creator revocation while the object read is in progress before accepting or caching context", async () => {
    const report = await read(),
      getObject = vi.fn().mockImplementation(async () => {
        await pool.query("UPDATE users SET email_verified_at=NULL WHERE id=$1", [owner]);
        return object();
      });
    await expect(
      createReportContextCollector(db, { getObject }).collect({
        organization_id: org,
        definition_id: definition,
        expected_version: 1,
        report
      })
    ).rejects.toThrow("forbidden");
    expect(
      (await pool.query("SELECT summary->>'context_origin' AS origin FROM report_source_text"))
        .rows[0]?.origin
    ).not.toBe("bundle");
  });
  it("does not accept a stale generation or malformed object as current source context", async () => {
    const report = await read(),
      getObject = vi.fn().mockImplementation(async () => {
        await pool.query(
          "UPDATE incidents SET bundle_generation_number=3,bundle_updated_at='2026-10-21' WHERE id=$1",
          [source]
        );
        return object();
      });
    const unchanged = await createReportContextCollector(db, { getObject }).collect({
      organization_id: org,
      definition_id: definition,
      expected_version: 1,
      report
    });
    expect(unchanged.facts.evidence[0]?.context).toBeNull();
    getObject.mockResolvedValue(Buffer.from("invalid"));
    expect(
      (
        await createReportContextCollector(db, { getObject }).collect({
          organization_id: org,
          definition_id: definition,
          expected_version: 1,
          report: await read()
        })
      ).facts.evidence[0]?.context
    ).toBeNull();
  });
  it("can enrich an explicitly requested manual full report without persisting disabled-definition source text", async () => {
    await definitions.replace({
      organization_id: org,
      initiator: actor(),
      id: definition,
      definition: { ...command(), enabled: false, expected_version: 1 }
    });
    const report = await read(2),
      getObject = vi.fn().mockResolvedValue(object());
    const enriched = await createReportContextCollector(db, { getObject }).collect({
      organization_id: org,
      definition_id: definition,
      expected_version: 2,
      report
    });
    expect(enriched.facts.evidence[0]?.context).toContain("Retained bundle context");
    expect((await pool.query("SELECT * FROM report_source_text")).rows).toEqual([]);
  });
  it("uses retained known resolution dates for a first report while keeping pre-collection history partial", async () => {
    await pool.query("DELETE FROM report_lifecycle_facts WHERE source_id=$1", [source]);
    const report = await read();
    expect(report.facts.metrics.find((metric) => metric.key === "new_incidents")).toMatchObject({
      current: 1,
      current_complete: false
    });
    expect(report.facts.metrics.find((metric) => metric.key === "resolution_events")).toMatchObject(
      { current: 1, current_complete: false }
    );
    expect(report.facts.evidence[0]).toMatchObject({
      status: "resolved",
      period_events: ["new", "resolved"]
    });
  });
});
