import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { processNextSmartReportJob } from "../../apps/worker/src/smart-report-processor.js";
import type { ReportModelClient } from "../../packages/smart-reports/src/model-client.js";
import { ReportDocumentSchema } from "../../packages/smart-reports/src/report-document.js";
import { createSmartReportProcessor } from "../../apps/worker/src/smart-report-runtime.js";
import { createReportRunManagementStore } from "../../packages/storage/src/report-run-management.js";
import { reportModelProfile } from "../../packages/smart-reports/src/model-request.js";
import {
  resetReportRunFixture,
  reportTestCost as cost,
  reportTestReceipt as receipt
} from "../helpers/report-runs.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
runIntegration("canonical report generation and recovery", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  let owner: string, admit: Awaited<ReturnType<typeof resetReportRunFixture>>["admit"];
  beforeEach(async () => {
    ({ owner, admit } = await resetReportRunFixture(pool, db));
  });
  afterAll(async () => {
    await pool.end();
  });
  function objects() {
    const saved = new Map<string, Buffer>();
    return {
      saved,
      putObject: vi.fn(async (input: { key: string; body: Buffer }) => {
        saved.set(input.key, Buffer.from(input.body));
      }),
      getObject: vi.fn(async (input: { key: string }) => {
        const body = saved.get(input.key);
        if (!body) throw new Error("s3_object_not_found");
        return body;
      }),
      deleteObject: vi.fn(async (input: { key: string }) => {
        saved.delete(input.key);
      })
    };
  }
  it("resumes a paid canonical response after an output-storage failure without calling AI again", async () => {
    const run = await admit(),
      storage = objects();
    let failReady = true;
    storage.putObject.mockImplementation(async (input) => {
      if (input.key.includes("/ready-") && failReady) {
        failReady = false;
        throw new Error("storage_unavailable");
      }
      storage.saved.set(input.key, Buffer.from(input.body));
    });
    const outcome = {
      ...receipt(),
      state: "succeeded" as const,
      narrative: {
        version: 1 as const,
        overview: { text: "Available observations are incomplete.", evidence_refs: ["c1"] },
        highlights: [],
        priorities: [],
        limitations: [{ text: "Source coverage is partial.", evidence_refs: ["c1"] }]
      }
    };
    const paid = vi.fn(async (before: () => Promise<void>) => {
      await before();
      return outcome;
    });
    const prepare = vi.fn<ReportModelClient["prepare"]>().mockResolvedValue({
      input_tokens: 100,
      profile: reportModelProfile("gpt-6.1-terra"),
      request_hash: "b".repeat(64),
      maximum_nano_usd: 24750000,
      run: paid
    });
    await expect(
      processNextSmartReportJob({ db, objects: storage, model: { prepare } })
    ).rejects.toThrow("report_generation_unavailable");
    expect(
      (
        await pool.query(
          "SELECT state,narrative_json IS NOT NULL AS saved FROM report_model_attempts"
        )
      ).rows
    ).toEqual([{ state: "succeeded", saved: true }]);
    await pool.query(
      "UPDATE worker_jobs SET available_at=now()-interval '1 second' WHERE job_name='generate-smart-report'"
    );
    expect(await processNextSmartReportJob({ db, objects: storage, model: { prepare } })).toEqual({
      processed: true
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(paid).toHaveBeenCalledTimes(1);
    const stored = (
      await pool.query<{ status: string; ready_object_key: string }>(
        "SELECT status,ready_object_key FROM report_runs WHERE id=$1",
        [run.id]
      )
    ).rows[0]!;
    expect(stored.status).toBe("ready");
    expect(
      ReportDocumentSchema.parse(JSON.parse(storage.saved.get(stored.ready_object_key)!.toString()))
        .analysis.status
    ).toBe("available");
    expect((await pool.query("SELECT narrative_json FROM report_model_attempts")).rows).toEqual([
      { narrative_json: null }
    ]);
    expect(
      (
        await pool.query(
          "SELECT generations,held_nano_usd,spent_nano_usd FROM report_allowance_windows"
        )
      ).rows[0]
    ).toMatchObject({ generations: 1, held_nano_usd: "0", spent_nano_usd: String(cost) });
    expect(await processNextSmartReportJob({ db, objects: storage, model: { prepare } })).toEqual({
      processed: false
    });
  });
  it("publishes an explicit factual-only report when AI is unavailable without reserving a second generation", async () => {
    const run = await admit(),
      storage = objects();
    expect(await processNextSmartReportJob({ db, objects: storage, model: null })).toEqual({
      processed: true
    });
    const row = (
      await pool.query<{ status: string; ready_object_key: string }>(
        "SELECT status,ready_object_key FROM report_runs WHERE id=$1",
        [run.id]
      )
    ).rows[0]!;
    expect(row.status).toBe("factual_only");
    expect(
      ReportDocumentSchema.parse(JSON.parse(storage.saved.get(row.ready_object_key)!.toString()))
        .analysis
    ).toMatchObject({ status: "unavailable", reason: "model_unavailable" });
    expect(
      (
        await pool.query(
          "SELECT generations,held_nano_usd,spent_nano_usd FROM report_allowance_windows"
        )
      ).rows[0]
    ).toMatchObject({ generations: 1, held_nano_usd: "0", spent_nano_usd: "0" });
  });
  it("keeps the runtime lane opt-in and processes factual work without an AI key", async () => {
    const storage = objects();
    const run = await admit();
    const disabled = createSmartReportProcessor({ db, objects: storage, env: {} });
    expect(await disabled()).toEqual({ processed: false });
    expect(
      (await pool.query("SELECT status FROM report_runs WHERE id=$1", [run.id])).rows[0]?.status
    ).toBe("queued");
    const pass = createSmartReportProcessor({
      db,
      objects: storage,
      env: { SMART_REPORTS_ENABLED: "true" }
    });
    expect(await pass()).toEqual({ processed: true });
    expect(
      (await pool.query("SELECT status FROM report_runs WHERE id=$1", [run.id])).rows[0]?.status
    ).toBe("factual_only");
    expect(await pass()).toEqual({ processed: false });
  });
  it("cleans deleted outputs with generation disabled and leaves new queued work untouched", async () => {
    const storage = objects(),
      run = await admit();
    await processNextSmartReportJob({ db, objects: storage, model: null });
    await createReportRunManagementStore(db).remove({
      organization_id: run.organization_id,
      id: run.id,
      initiator: { version: 1, kind: "browser_session", user_id: owner }
    });
    await pool.query(
      "UPDATE report_artifact_objects SET cleanup_after_at=clock_timestamp()-interval '1 second'"
    );
    const pending = await admit(),
      maintenance = createSmartReportProcessor({ db, objects: storage, env: {} });
    expect(await maintenance()).toEqual({ processed: true });
    expect(await maintenance()).toEqual({ processed: true });
    expect(storage.saved.size).toBe(0);
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
    expect(
      (await pool.query("SELECT status FROM report_runs WHERE id=$1", [pending.id])).rows[0]?.status
    ).toBe("queued");
  });
  it("fails abandoned pre-generation work once and expires its metadata independently of feature enablement", async () => {
    const run = await admit(),
      storage = objects();
    await pool.query(
      "UPDATE report_runs SET generation_deadline_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [run.id]
    );
    expect(await createSmartReportProcessor({ db, objects: storage, env: {} })()).toEqual({
      processed: true
    });
    expect(
      (await pool.query("SELECT status,generation_counted FROM report_runs WHERE id=$1", [run.id]))
        .rows[0]
    ).toMatchObject({ status: "failed", generation_counted: false });
    expect(
      (await pool.query("SELECT generations,held_nano_usd FROM report_allowance_windows")).rows[0]
    ).toMatchObject({ generations: 0, held_nano_usd: "0" });
    await pool.query(
      "UPDATE report_runs SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [run.id]
    );
    expect(await createSmartReportProcessor({ db, objects: storage, env: {} })()).toEqual({
      processed: true
    });
    expect((await pool.query("SELECT id FROM report_runs")).rows).toEqual([]);
  });
  it("stops revoked work after an in-flight object write and leaves a durable cleanup intent", async () => {
    const run = await admit(),
      storage = objects();
    storage.putObject.mockImplementation(async (input) => {
      storage.saved.set(input.key, Buffer.from(input.body));
      await pool.query("UPDATE users SET email_verified_at=NULL WHERE id=$1", [owner]);
    });
    const prepare = vi.fn<ReportModelClient["prepare"]>();
    await expect(
      processNextSmartReportJob({ db, objects: storage, model: { prepare } })
    ).rejects.toThrow("report_generation_unavailable");
    expect(prepare).not.toHaveBeenCalled();
    expect(
      (await pool.query("SELECT status,generation_counted FROM report_runs WHERE id=$1", [run.id]))
        .rows[0]
    ).toMatchObject({ status: "paused_access", generation_counted: false });
    expect((await pool.query("SELECT state FROM report_artifact_objects")).rows).toEqual([
      { state: "deleting" }
    ]);
    expect(
      (await pool.query("SELECT generations,held_nano_usd FROM report_allowance_windows")).rows[0]
    ).toMatchObject({ generations: 0, held_nano_usd: "0" });
  });
});
