import { randomUUID } from "node:crypto";
import { afterAll, expect, it, vi } from "vitest";
import { processNextSmartReportJob } from "../../apps/worker/src/smart-report-processor.js";
import { createReportContentStore } from "../../packages/storage/src/report-content-store.js";
import { createReportDefinitionStore } from "../../packages/storage/src/report-definition-store.js";
import { createReportCollectorStore } from "../../packages/storage/src/report-collector-store.js";
import { createReportPdfStore } from "../../packages/storage/src/report-pdf-store.js";
import { resetReportRunFixture } from "../helpers/report-runs.js";
import { restoreStoragePredecessor } from "../helpers/storage-predecessor.js";
import { reportModelProfile } from "../../packages/smart-reports/src/model-request.js";
import {
  createIntegrationPool,
  createQueryable,
  seedOwnedProject,
  runIntegration
} from "../helpers/integration-setup.js";
import {
  migrateStorageSchema,
  STORAGE_SCHEMA_MIGRATIONS,
  assertStorageSchemaMigrationsApplied
} from "../../packages/storage/src/schema-migrations.js";

runIntegration("factual report entitlements and isolation", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  afterAll(async () => {
    await pool.end();
  });
  it("upgrades the real pre-product schema with populated Business runs and uncertain paid receipts unchanged", async () => {
    await restoreStoragePredecessor(pool);
    const applied = new Set(
      (await pool.query<{ id: string }>("SELECT id FROM storage_migration_ledger")).rows.map(
        (row) => row.id
      )
    );
    // Replay only immutable released migrations to materialise the actual old
    // shape. Do not fabricate a predecessor by removing candidate columns.
    for (const migration of STORAGE_SCHEMA_MIGRATIONS) {
      if (applied.has(migration.id) || migration.id >= "202611100001") continue;
      for (const sql of migration.statements) await pool.query(sql);
      await pool.query(
        "INSERT INTO storage_migration_ledger(id,description,checksum) VALUES($1,$2,$3)",
        [migration.id, migration.description, migration.checksum]
      );
    }
    const org = randomUUID(),
      project = randomUUID(),
      definition = randomUUID(),
      run = randomUUID();
    const { ownerUserId: owner } = await seedOwnedProject({
      pool,
      organizationId: org,
      projectId: project,
      organizationName: "Legacy",
      organizationSlug: org,
      projectName: "Legacy",
      projectSlug: project,
      organizationPlan: "business"
    });
    const authority = JSON.stringify({ version: 1, kind: "browser_session", user_id: owner }),
      scope = JSON.stringify([{ project_id: project, origin_project_ids: [project] }]),
      hash = "a".repeat(64),
      profile = JSON.stringify(reportModelProfile("gpt-6.1-terra"));
    await pool.query(
      `INSERT INTO report_definitions(id,organization_id,created_by_user_id,initiating_authority,creation_request_id,creation_digest,name,cadence,privacy_mode,source_collection_consent,accepted_scope,recipient_user_ids,enabled)
      VALUES($1,$2,$3,$4,$5,$6,'Legacy monthly','monthly','restricted',false,$7,'{}',false)`,
      [definition, org, owner, authority, randomUUID(), hash, scope]
    );
    await pool.query(
      `INSERT INTO report_allowance_windows(organization_id,starts_at,ends_at,generations,held_nano_usd,budget_limit_nano_usd) VALUES($1,'2026-11-01','2026-12-01',1,24750000,1000000000)`,
      [org]
    );
    await pool.query(
      `INSERT INTO report_runs(id,organization_id,definition_id,definition_version,request_id,request_digest,requested_by_user_id,initiating_authority,name,accepted_scope,recipient_user_ids,privacy_mode,source_collection_consent,period_kind,period_starts_at,period_ends_at,period_duration_days,generation_kind,window_starts_at,status,ai_status,ai_profile,ai_reserved_nano_usd,paid_attempts,facts_object_key,facts_sha256,ready_object_key,ready_sha256)
      VALUES($1,$2,$3,1,$4,$5,$6,$7,'Legacy monthly',$8,'{}','restricted',false,'monthly','2026-10-01','2026-11-01',31,'manual','2026-11-01','factual_only','uncertain',$9,24750000,1,'legacy/facts',$5,'legacy/ready',$5)`,
      [run, org, definition, randomUUID(), hash, owner, authority, scope, profile]
    );
    await pool.query(
      `INSERT INTO report_model_attempts(id,run_id,organization_id,window_starts_at,worker_lease_token,request_sha256,facts_sha256,profile,input_tokens,principal_nano_usd,state) VALUES($1,$2,$3,'2026-11-01',$4,$5,$5,$6,100,24750000,'uncertain')`,
      [randomUUID(), run, org, randomUUID(), hash, profile]
    );
    const snapshot = async () => {
      const result: Record<string, unknown> = {};
      for (const table of [
        "report_definitions",
        "report_runs",
        "report_model_attempts",
        "report_allowance_windows"
      ])
        result[table] = (
          await pool.query(`SELECT to_jsonb(t)-'report_mode' AS row FROM ${table} t`)
        ).rows;
      return result;
    };
    const before = await snapshot(),
      ledger = (await pool.query("SELECT id,checksum FROM storage_migration_ledger ORDER BY id"))
        .rows;
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
    expect((await migrateStorageSchema(db)).applied).toEqual([
      "202611100001_add_report_identity_snapshots",
      "202611100002_add_factual_report_products",
      "202611100003_add_weekly_improvement_reviews"
    ]);
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect(await snapshot()).toEqual(before);
    expect(
      (
        await pool.query(
          "SELECT report_mode FROM report_definitions UNION ALL SELECT report_mode FROM report_runs"
        )
      ).rows
    ).toEqual([{ report_mode: "ai" }, { report_mode: "ai" }]);
    expect(
      (
        await pool.query(
          "SELECT id,checksum FROM storage_migration_ledger WHERE id<'202611100001' ORDER BY id"
        )
      ).rows
    ).toEqual(ledger);
    expect((await migrateStorageSchema(db)).applied).toEqual([]);
  });
  it.each(["solo", "team"] as const)(
    "completes %s reports with no AI intent, preflight or money, including replay and PDF",
    async (plan) => {
      const fixture = await resetReportRunFixture(pool, db, { plan }),
        run = await fixture.admit(),
        saved = new Map<string, Buffer>();
      const objects = {
        async putObject(input: { key: string; body: Buffer }) {
          saved.set(input.key, Buffer.from(input.body));
        },
        async getObject(input: { key: string }) {
          const body = saved.get(input.key);
          if (!body) throw new Error("s3_object_not_found");
          return body;
        }
      };
      const prepare = vi.fn(async () => {
        throw new Error("factual_reports_must_not_prepare_ai");
      });
      expect(run.ai_status).toBe("unavailable");
      await processNextSmartReportJob({ db, objects, model: { prepare } });
      await processNextSmartReportJob({ db, objects, model: { prepare } });
      const actor = {
        organization_id: fixture.org,
        id: run.id,
        initiator: { version: 1 as const, kind: "browser_session" as const, user_id: fixture.owner }
      };
      const document = await createReportContentStore(db, objects).read(actor);
      expect(document.version).toBe(2);
      expect(document.analysis).toEqual({
        status: "not_requested",
        reason: null,
        model: null,
        request_sha256: null
      });
      expect(
        (
          await pool.query(
            "SELECT status,ai_profile,paid_attempts,ai_reserved_nano_usd FROM report_runs"
          )
        ).rows[0]
      ).toEqual({ status: "ready", ai_profile: null, paid_attempts: 0, ai_reserved_nano_usd: "0" });
      const pdf = createReportPdfStore(db, objects);
      await pdf.request(actor);
      await pdf.processNext(async () => Buffer.from("%PDF-1.7\nfactual\n%%EOF\n"));
      await pdf.download(actor);
      expect(prepare).not.toHaveBeenCalled();
      expect((await pool.query("SELECT * FROM report_model_attempts")).rowCount).toBe(0);
      expect(
        (
          await pool.query(
            "SELECT generations,held_nano_usd,spent_nano_usd FROM report_allowance_windows"
          )
        ).rows[0]
      ).toEqual({ generations: 1, held_nano_usd: "0", spent_nano_usd: "0" });
      expect(
        (await createReportCollectorStore(db).processNext({ now: new Date().toISOString() }))
          .processed
      ).toBe(true);
      await pool.query("UPDATE organizations SET plan='business' WHERE id=$1", [fixture.org]);
      const next = await fixture.admit();
      expect(
        (await pool.query("SELECT report_mode,ai_profile FROM report_runs WHERE id=$1", [next.id]))
          .rows[0]
      ).toEqual({ report_mode: "factual", ai_profile: null });
    }
  );
  it("enforces Solo quota atomically and pauses incompatible Team schedules on downgrade without inventing coverage", async () => {
    const fixture = await resetReportRunFixture(pool, db, { plan: "solo" });
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => fixture.admit()));
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(2);
    expect(
      results
        .filter((item) => item.status === "rejected")
        .every(
          (item) => item.status === "rejected" && item.reason.code === "report_quota_exhausted"
        )
    ).toBe(true);
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [fixture.org]);
    const definitions = createReportDefinitionStore(db),
      initiator = { version: 1 as const, kind: "browser_session" as const, user_id: fixture.owner };
    const weekly = await definitions.create({
      organization_id: fixture.org,
      initiator,
      request_id: randomUUID(),
      definition: {
        name: "Weekly facts",
        cadence: "weekly",
        project_ids: [fixture.project],
        source_collection_consent: true,
        enabled: true,
        schedule: { time: "09:00", timezone: "UTC" },
        weekly_overlap: "keep_existing"
      }
    });
    await pool.query("UPDATE organizations SET plan='solo' WHERE id=$1", [fixture.org]);
    const paused = await definitions.get({
      organization_id: fixture.org,
      id: weekly.id,
      initiator
    });
    expect(paused).toMatchObject({ requires_owner_review: true, pause_reason: "plan_lost" });
    expect(
      (
        await pool.query("SELECT * FROM report_collection_coverage WHERE definition_id=$1", [
          weekly.id
        ])
      ).rowCount
    ).toBe(0);
    await expect(
      definitions.replace({
        organization_id: fixture.org,
        id: weekly.id,
        initiator,
        definition: {
          name: weekly.name,
          cadence: "weekly",
          project_ids: [fixture.project],
          source_collection_consent: true,
          enabled: true,
          schedule: weekly.schedule,
          expected_version: paused!.version,
          resume_after_review: true
        }
      })
    ).rejects.toThrow("upgrade_required");
  });
  it("migrates the predecessor without rewriting earlier checksums and rejects missing factual-mode enforcement", async () => {
    await resetReportRunFixture(pool, db);
    await migrateStorageSchema(db);
    const before = (
      await pool.query(
        "SELECT id,checksum FROM storage_migration_ledger WHERE id<>'202611100002_add_factual_report_products' ORDER BY id"
      )
    ).rows;
    await pool.query("ALTER TABLE report_runs DROP CONSTRAINT report_runs_factual_no_ai");
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "report_product_schema_incomplete"
    );
    await pool.query("ALTER TABLE report_runs DROP COLUMN report_mode");
    await pool.query("ALTER TABLE report_definitions DROP COLUMN report_mode");
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202611100002_add_factual_report_products'"
    );
    expect((await migrateStorageSchema(db)).applied).toEqual([
      "202611100002_add_factual_report_products"
    ]);
    await assertStorageSchemaMigrationsApplied(db);
    expect(
      (
        await pool.query(
          "SELECT id,checksum FROM storage_migration_ledger WHERE id<>'202611100002_add_factual_report_products' ORDER BY id"
        )
      ).rows
    ).toEqual(before);
  });
});
