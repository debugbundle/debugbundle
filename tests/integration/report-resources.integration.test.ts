import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it, vi } from "vitest";
import { processNextSmartReportJob } from "../../apps/worker/src/smart-report-processor.js";
import { createWorkerJobStore } from "../../packages/storage/src/worker-job-store.js";
import { reportModelProfile } from "../../packages/smart-reports/src/model-request.js";
import type { ReportModelClient } from "../../packages/smart-reports/src/model-client.js";
import { resetReportRunFixture, reportTestReceipt } from "../helpers/report-runs.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("report resource isolation", () => {
  const pool = createIntegrationPool();
  // Set before the first connection: a held report transaction would deadlock
  // every normal journal operation and fail this single-connection proof.
  pool.options.max = 1;
  pool.options.connectionTimeoutMillis = 1000;
  const db = createQueryable(pool);
  afterAll(async () => {
    await pool.end();
  });

  it("keeps the shared connection and normal journal available through slow AI and a report backlog", async () => {
    const fixture = await resetReportRunFixture(pool, db);
    for (let index = 0; index < 8; index++) await fixture.admit();
    const objects = new Map<string, Buffer>();
    const storage = {
      putObject: async (input: { key: string; body: Buffer }) => {
        objects.set(input.key, Buffer.from(input.body));
      },
      getObject: async (input: { key: string }) => {
        const value = objects.get(input.key);
        if (!value) throw new Error("s3_object_not_found");
        return value;
      },
      deleteObject: async (input: { key: string }) => {
        objects.delete(input.key);
      }
    };
    let release!: () => void, entered!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inProvider = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const prepare = vi.fn<ReportModelClient["prepare"]>().mockResolvedValue({
      input_tokens: 100,
      profile: reportModelProfile("gpt-6.1-terra"),
      request_hash: "c".repeat(64),
      maximum_nano_usd: 24750000,
      run: async (before) => {
        await before();
        entered();
        await blocked;
        return reportTestReceipt();
      }
    });
    const pending = processNextSmartReportJob({ db, objects: storage, model: { prepare } });
    try {
      await inProvider;
      const jobs = createWorkerJobStore(db),
        latencies: number[] = [];
      for (const name of [
        "normalize-events",
        "group-incident",
        "build-bundle",
        "evaluate-alerts",
        "deliver-webhook",
        "generate-weekly-report"
      ] as const) {
        const started = performance.now();
        const id = await jobs.enqueue(name, {
          project_id: fixture.project,
          probe_id: randomUUID()
        });
        const claim = await jobs.claim(name, id);
        expect(claim?.id).toBe(id);
        await jobs.complete(claim!);
        latencies.push(performance.now() - started);
      }
      expect(pool.waitingCount).toBe(0);
      expect(pool.totalCount).toBe(1);
      expect(
        (
          await pool.query(
            "SELECT status,count(*)::int AS count FROM worker_jobs WHERE job_name='generate-smart-report' GROUP BY status ORDER BY status"
          )
        ).rows
      ).toEqual([
        { status: "pending", count: 7 },
        { status: "running", count: 1 }
      ]);
      const maximum = Math.max(...latencies);
      expect(maximum).toBeLessThan(5000);
      console.log(
        JSON.stringify({
          report_resource_pool: "passed",
          connections: pool.totalCount,
          blocked_report_jobs: 1,
          queued_report_jobs: 7,
          normal_journal_completions: latencies.length,
          maximum_journal_delay_ms: Math.round(maximum),
          provider: "synthetic delayed response"
        })
      );
    } finally {
      release();
      await pending;
    }
    // A fresh processor resumes another queued report without depending on the
    // first process's memory. Durable paid intent and retries have separate tests.
    expect(await processNextSmartReportJob({ db, objects: storage, model: null })).toEqual({
      processed: true
    });
    expect(prepare).toHaveBeenCalledOnce();
  });
});
