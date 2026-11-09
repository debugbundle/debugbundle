import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { resetReportRunFixture } from "../helpers/report-runs.js";
import { processNextSmartReportJob } from "../../apps/worker/src/smart-report-processor.js";
import { createSmartReportProcessor } from "../../apps/worker/src/smart-report-runtime.js";
import { processNextSmartReportPdfJob } from "../../apps/worker/src/smart-report-pdf-processor.js";
import { createReportPdfStore } from "../../packages/storage/src/report-pdf-store.js";
import { createBusinessAccountExportStore } from "../../packages/storage/src/business-account-export.js";
import { createReportRunManagementStore } from "../../packages/storage/src/report-run-management.js";
import { createReportArtifactStore } from "../../packages/storage/src/report-artifact-store.js";
import { createWorkerJobStore } from "../../packages/storage/src/worker-job-store.js";
import { reportArtifactDigest } from "../../packages/storage/src/report-artifact-key.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
runIntegration("coalesced private report PDFs", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    saved = new Map<string, Buffer>();
  const body = Buffer.from("%PDF-1.7\nfixture\n%%EOF\n");
  let fixture: Awaited<ReturnType<typeof resetReportRunFixture>>;
  const objects = {
    putObject: vi.fn(async (input: { key: string; body: Buffer }) => {
      saved.set(input.key, Buffer.from(input.body));
    }),
    getObject: vi.fn(async (input: { key: string }) => {
      const value = saved.get(input.key);
      if (!value) throw new Error("s3_object_not_found");
      return value;
    }),
    deleteObject: vi.fn(async (input: { key: string }) => {
      saved.delete(input.key);
    })
  };
  const actor = (id: string, user = fixture.owner) => ({
    organization_id: fixture.org,
    id,
    initiator: { version: 1 as const, kind: "browser_session" as const, user_id: user }
  });
  const publish = async () => {
    const run = await fixture.admit();
    await processNextSmartReportJob({ db, objects, model: null });
    return run;
  };
  beforeEach(async () => {
    fixture = await resetReportRunFixture(pool, db);
    saved.clear();
    vi.clearAllMocks();
    objects.putObject.mockImplementation(async (input) => {
      saved.set(input.key, Buffer.from(input.body));
    });
  });
  afterAll(async () => {
    await pool.end();
  });
  it("coalesces simultaneous requests and reuses a cached PDF without more AI or logical generations", async () => {
    const run = await publish(),
      store = createReportPdfStore(db, objects),
      render = vi.fn().mockResolvedValue(body);
    expect((await store.status(actor(run.id))).status).toBe("not_requested");
    const exportRun = async () =>
      (await createBusinessAccountExportStore(db).read({
        organization_id: fixture.org,
        user_id: fixture.owner,
        query: { section: "report_runs" }
      }))!.items.find((item) => item["id"] === run.id)!;
    expect((await exportRun())["downloads"]).toMatchObject({
      pdf: null,
      pdf_status: `/v1/organizations/${fixture.org}/reports/${run.id}/pdf`
    });
    const requests = await Promise.all(
      Array.from({ length: 6 }, () => store.request(actor(run.id)))
    );
    expect(requests.every((result) => result.status === "queued")).toBe(true);
    expect(
      (await pool.query("SELECT id FROM worker_jobs WHERE job_name='render-smart-report-pdf'")).rows
    ).toHaveLength(1);
    expect(await processNextSmartReportPdfJob({ db, objects, render })).toEqual({
      processed: true
    });
    expect(render).toHaveBeenCalledOnce();
    expect((await store.status(actor(run.id))).status).toBe("ready");
    expect((await exportRun())["downloads"]).toMatchObject({
      pdf: `/v1/organizations/${fixture.org}/reports/${run.id}/pdf/file`
    });
    expect(await store.download(actor(run.id))).toEqual(body);
    expect((await store.request(actor(run.id))).status).toBe("ready");
    expect(await processNextSmartReportPdfJob({ db, objects, render })).toEqual({
      processed: false
    });
    expect(
      (
        await pool.query(
          "SELECT generations,held_nano_usd,spent_nano_usd FROM report_allowance_windows"
        )
      ).rows[0]
    ).toMatchObject({ generations: 1, held_nano_usd: "0", spent_nano_usd: "0" });
  });
  it("keeps a near-expiry unattached write past its upload deadline without a fresh ten-minute retention extension", async () => {
    const run = await publish(),
      store = createReportPdfStore(db, objects);
    await store.request(actor(run.id));
    const row = (await pool.query("SELECT pdf_job_id FROM report_runs WHERE id=$1", [run.id]))
      .rows[0] as { pdf_job_id: string };
    const claim = await createWorkerJobStore(db).claim("render-smart-report-pdf", row.pdf_job_id);
    if (!claim) throw new Error("missing_pdf_claim");
    const key = await createReportArtifactStore(db).allocate(claim, {
      kind: "pdf",
      sha256: reportArtifactDigest(body),
      expires_at: new Date(Date.now() + 30000).toISOString()
    });
    const bounds = (
      await pool.query(
        "SELECT cleanup_after_at>write_deadline_at AS protects_write,extract(epoch FROM cleanup_after_at-clock_timestamp()) AS seconds FROM report_artifact_objects WHERE object_key=$1",
        [key]
      )
    ).rows[0] as { protects_write: boolean; seconds: string };
    expect(bounds.protects_write).toBe(true);
    expect(Number(bounds.seconds)).toBeLessThanOrEqual(120.5);
  });
  it("supports a current Viewer requesting an archived PDF after downgrade and creator departure", async () => {
    const run = await publish(),
      reader = randomUUID(),
      replacementOwner = randomUUID();
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      reader,
      `${reader}@example.test`
    ]);
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'viewer')",
      [randomUUID(), fixture.project, reader]
    );
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      replacementOwner,
      `${replacementOwner}@example.test`
    ]);
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
      [randomUUID(), fixture.org, replacementOwner]
    );
    await pool.query("UPDATE projects SET owner_user_id=$1 WHERE id=$2", [
      replacementOwner,
      fixture.project
    ]);
    await pool.query("DELETE FROM organization_members WHERE user_id=$1", [fixture.owner]);
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [fixture.org]);
    const store = createReportPdfStore(db, objects),
      render = vi.fn().mockResolvedValue(body);
    expect((await store.request(actor(run.id, reader))).status).toBe("queued");
    await processNextSmartReportPdfJob({ db, objects, render });
    expect(await store.download(actor(run.id, reader))).toEqual(body);
    await expect(store.download(actor(run.id))).rejects.toThrow("report_not_found");
  });
  it("prepares retained PDFs with generation disabled while leaving queued new report work untouched", async () => {
    const run = await publish(),
      store = createReportPdfStore(db, objects);
    await store.request(actor(run.id));
    const pending = await fixture.admit(),
      pass = createSmartReportProcessor({ db, objects, env: {} });
    expect(await pass()).toEqual({ processed: true });
    expect((await store.status(actor(run.id))).status).toBe("ready");
    expect((await store.download(actor(run.id))).subarray(0, 5).toString()).toBe("%PDF-");
    expect(
      (await pool.query("SELECT status FROM report_runs WHERE id=$1", [pending.id])).rows[0]?.status
    ).toBe("queued");
  });
  it("alternates pending PDF and generation work within the one report lane", async () => {
    const first = await publish(),
      second = await publish(),
      store = createReportPdfStore(db, objects);
    await store.request(actor(first.id));
    await store.request(actor(second.id));
    const pending = await fixture.admit(),
      pass = createSmartReportProcessor({ db, objects, env: { SMART_REPORTS_ENABLED: "true" } });
    await pass();
    expect(
      (await pool.query("SELECT status FROM report_runs WHERE id=$1", [pending.id])).rows[0]?.status
    ).toBe("queued");
    await pass();
    expect(
      (await pool.query("SELECT status FROM report_runs WHERE id=$1", [pending.id])).rows[0]?.status
    ).toBe("factual_only");
    expect((await store.status(actor(second.id))).status).toBe("queued");
    await pass();
    expect((await store.status(actor(second.id))).status).toBe("ready");
    expect(
      (await pool.query("SELECT generations,spent_nano_usd FROM report_allowance_windows")).rows[0]
    ).toMatchObject({ generations: 3, spent_nano_usd: "0" });
  });
  it("rechecks requester revocation after rendering before storing or publishing private output", async () => {
    const run = await publish(),
      store = createReportPdfStore(db, objects);
    await store.request(actor(run.id));
    const render = vi.fn(async () => {
      await pool.query("UPDATE organizations SET suspended_at=now() WHERE id=$1", [fixture.org]);
      return body;
    });
    await processNextSmartReportPdfJob({ db, objects, render });
    expect(
      (
        await pool.query(
          "SELECT object_key FROM report_artifact_objects WHERE artifact_kind='pdf' AND state='attached'"
        )
      ).rows
    ).toHaveLength(0);
    expect(objects.putObject.mock.calls.some(([input]) => input.key.includes("/pdf-"))).toBe(false);
    await expect(store.download(actor(run.id))).rejects.toThrow("report_not_found");
  });
  it("rejects stale actual job leases and never attaches the old worker's PDF", async () => {
    const run = await publish(),
      store = createReportPdfStore(db, objects);
    await store.request(actor(run.id));
    const render = vi.fn(async () => {
      await pool.query(
        "UPDATE worker_jobs SET lease_expires_at=now()-interval '1 second' WHERE job_name='render-smart-report-pdf' AND status='running'"
      );
      return body;
    });
    await expect(processNextSmartReportPdfJob({ db, objects, render })).rejects.toThrow(
      "report_pdf_processing_unavailable"
    );
    expect(
      (await pool.query("SELECT pdf_object_key FROM report_runs WHERE id=$1", [run.id])).rows[0]
        ?.pdf_object_key
    ).toBeNull();
    expect(objects.putObject.mock.calls.some(([input]) => input.key.includes("/pdf-"))).toBe(false);
  });
  it("retains an owned cleanup intent when the report is deleted during PDF upload", async () => {
    const run = await publish(),
      store = createReportPdfStore(db, objects);
    await store.request(actor(run.id));
    const original = objects.putObject.getMockImplementation()!;
    objects.putObject.mockImplementation(async (input) => {
      await original(input);
      if (input.key.includes("/pdf-"))
        await createReportRunManagementStore(db).remove(actor(run.id));
    });
    await processNextSmartReportPdfJob({ db, objects, render: async () => body });
    expect(
      (await pool.query("SELECT state FROM report_artifact_objects WHERE artifact_kind='pdf'")).rows
    ).toEqual([{ state: "deleting" }]);
    await pool.query(
      "UPDATE report_artifact_objects SET cleanup_after_at=now()-interval '1 second'"
    );
    const artifacts = createReportArtifactStore(db);
    for (let index = 0; index < 3; index++) expect(await artifacts.cleanupNext(objects)).toBe(true);
    expect(saved.size).toBe(0);
    await expect(store.download(actor(run.id))).rejects.toThrow("report_not_found");
  });
  it("fails closed for corrupted cached bytes and permits an explicit free PDF retry from the canonical report", async () => {
    const run = await publish(),
      store = createReportPdfStore(db, objects),
      render = vi.fn().mockResolvedValue(body);
    await store.request(actor(run.id));
    await processNextSmartReportPdfJob({ db, objects, render });
    const key = (await pool.query("SELECT pdf_object_key FROM report_runs WHERE id=$1", [run.id]))
      .rows[0]!.pdf_object_key as string;
    saved.set(key, Buffer.from("tampered"));
    await expect(store.download(actor(run.id))).rejects.toThrow("report_pdf_unavailable");
    expect((await store.request(actor(run.id))).status).toBe("queued");
    await processNextSmartReportPdfJob({ db, objects, render });
    expect(await store.download(actor(run.id))).toEqual(body);
    expect(render).toHaveBeenCalledTimes(2);
    expect(
      (await pool.query("SELECT generations,spent_nano_usd FROM report_allowance_windows")).rows[0]
    ).toMatchObject({ generations: 1, spent_nano_usd: "0" });
  });
});
