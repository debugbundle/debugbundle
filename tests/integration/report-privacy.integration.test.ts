import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { processNextSmartReportJob } from "../../apps/worker/src/smart-report-processor.js";
import { createReportContentStore } from "../../packages/storage/src/report-content-store.js";
import { createReportPdfStore } from "../../packages/storage/src/report-pdf-store.js";
import { readReportIdentities } from "../../packages/storage/src/report-identity-store.js";
import { reportModelProfile } from "../../packages/smart-reports/src/model-request.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import { resetReportRunFixture, reportTestReceipt } from "../helpers/report-runs.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("restricted report identity and export policy", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  let fixture: Awaited<ReturnType<typeof resetReportRunFixture>>;
  const saved = new Map<string, Buffer>();
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
  beforeEach(async () => {
    fixture = await resetReportRunFixture(pool, db, { privacy_mode: "restricted" });
    await pool.query("UPDATE projects SET name='HiddenAcme',slug='hidden-acme' WHERE id=$1", [
      fixture.project
    ]);
    saved.clear();
  });
  afterAll(async () => {
    await pool.end();
  });
  const actor = (id: string) => ({
    organization_id: fixture.org,
    id,
    initiator: { version: 1 as const, kind: "browser_session" as const, user_id: fixture.owner }
  });
  it.each(["before_download", "during_download"])(
    "withholds newly identified legacy prose and its cached PDF when identity changes %s while preserving facts and receipt hashes",
    async (timing) => {
      const run = await fixture.admit();
      const prepare = vi.fn().mockResolvedValue({
        profile: reportModelProfile("gpt-6.1-terra"),
        input_tokens: 100,
        request_hash: "b".repeat(64),
        maximum_nano_usd: 24750000,
        async run(before: () => Promise<void>) {
          await before();
          return {
            ...reportTestReceipt(),
            state: "succeeded",
            narrative: {
              version: 1,
              overview: { text: "Northwind observations need review.", evidence_refs: ["c1"] },
              highlights: [],
              priorities: [],
              limitations: [
                { text: "Source coverage is partial and restricted.", evidence_refs: ["c1"] }
              ]
            }
          };
        }
      });
      await processNextSmartReportJob({ db, objects, model: { prepare } });
      const content = createReportContentStore(db, objects),
        pdf = createReportPdfStore(db, objects);
      const initial = await content.read(actor(run.id));
      expect(initial.narrative).not.toBeNull();
      await pdf.request(actor(run.id));
      const render = vi.fn(async (view) =>
        Buffer.from(`%PDF-1.7\n${view.document.narrative?.overview.text ?? "Safe facts"}\n%%EOF\n`)
      );
      await pdf.processNext(render);
      expect((await pdf.download(actor(run.id))).toString()).toContain("Northwind");
      const receipts = (
        await pool.query("SELECT outcome_sha256,cost_nano_usd,state FROM report_model_attempts")
      ).rows;
      const original = (
        await pool.query("SELECT ready_sha256 FROM report_runs WHERE id=$1", [run.id])
      ).rows;
      const rename = async () => {
        await pool.query("UPDATE projects SET name='Northwind',slug='northwind' WHERE id=$1", [
          fixture.project
        ]);
      };
      if (timing === "during_download") {
        const racing = createReportPdfStore(db, {
          ...objects,
          async getObject(input) {
            const body = await objects.getObject(input);
            if (body.subarray(0, 5).toString() === "%PDF-") await rename();
            return body;
          }
        });
        await expect(racing.download(actor(run.id))).rejects.toThrow("report_pdf_not_ready");
      } else await rename();
      expect(await readReportIdentities(db, run.scope, run.id)).toEqual(
        expect.arrayContaining(["HiddenAcme", "Northwind", "hidden-acme", "northwind"])
      );
      const safe = await content.read(actor(run.id));
      expect(safe.report).toEqual(initial.report);
      expect(safe.narrative).toBeNull();
      expect(safe.analysis.reason).toBe("model_rejected");
      // A refused download already invalidated the cache; the existing PDF
      // lifecycle exposes that completed job as immediately retryable failure.
      expect(await pdf.status(actor(run.id))).toMatchObject(
        timing === "during_download"
          ? { status: "failed", retry_after_seconds: 0 }
          : { status: "not_requested" }
      );
      await expect(pdf.download(actor(run.id))).rejects.toThrow("report_pdf_not_ready");
      await pdf.request(actor(run.id));
      await pdf.processNext(render);
      expect((await pdf.download(actor(run.id))).toString()).not.toContain("Northwind");
      expect(prepare).toHaveBeenCalledOnce();
      expect(
        (await pool.query("SELECT outcome_sha256,cost_nano_usd,state FROM report_model_attempts"))
          .rows
      ).toEqual(receipts);
      expect(
        (await pool.query("SELECT ready_sha256 FROM report_runs WHERE id=$1", [run.id])).rows
      ).toEqual(original);
    }
  );
  it("requires the forward identity migration without changing any earlier ledger entry", async () => {
    await migrateStorageSchema(db);
    const run = await fixture.admit();
    const ledger = (
      await pool.query(
        "SELECT id,checksum FROM storage_migration_ledger WHERE id<>'202611100001_add_report_identity_snapshots' ORDER BY id"
      )
    ).rows;
    await pool.query("DROP TABLE report_identity_snapshots,report_pdf_projections");
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "report_identity_schema_incomplete"
    );
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202611100001_add_report_identity_snapshots'"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "storage_schema_missing_migrations"
    );
    expect((await migrateStorageSchema(db)).applied).toEqual([
      "202611100001_add_report_identity_snapshots"
    ]);
    await assertStorageSchemaMigrationsApplied(db);
    expect((await migrateStorageSchema(db)).applied).toEqual([]);
    expect(
      (
        await pool.query(
          "SELECT id,checksum FROM storage_migration_ledger WHERE id<>'202611100001_add_report_identity_snapshots' ORDER BY id"
        )
      ).rows
    ).toEqual(ledger);
    expect((await pool.query("SELECT id FROM report_runs WHERE id=$1", [run.id])).rowCount).toBe(1);
    expect((await pool.query("SELECT * FROM report_identity_snapshots")).rowCount).toBe(0);
  });
});
