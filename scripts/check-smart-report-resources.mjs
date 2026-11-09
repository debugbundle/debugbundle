// Synthetic local qualification only: no provider calls, credentials, retained
// database or customer content. Only its owned temporary predecessor tree is written.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { performance } from "node:perf_hooks";
import { runIngestionLoadCheck } from "./ingestion-load-check.ts";
import { maximumReportDocumentFixture } from "../tests/helpers/report-document.ts";
import { renderReportPdfInChild } from "../packages/smart-reports/src/report-pdf-process.ts";

// Recover the actual installed predecessor source, leaving its tracked bytes
// untouched. Dependencies remain the current locked test environment; this is
// a local source comparison, not a hosted-release performance measurement.
const predecessor = mkdtempSync(resolve(".tmp/resource-predecessor-"));
try {
  const archive = execFileSync("git", ["archive", "HEAD"], { maxBuffer: 64 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", predecessor], { input: archive });
  console.log(
    "report_resource_predecessor_source " +
      execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
  );
  for (const script of ["ingestion-load-check.ts"])
    execFileSync(process.execPath, ["--import", "tsx", join(predecessor, "scripts", script)], {
      stdio: "inherit"
    });
} finally {
  rmSync(predecessor, { recursive: true, force: true });
}
console.log("report_resource_baseline");
await runIngestionLoadCheck();
const document = maximumReportDocumentFixture();
const view = { document, available_source_refs: [] };
let peakParentRss = process.memoryUsage().rss;
let peakChildRssKiB = 0;
const sampler = setInterval(() => {
  peakParentRss = Math.max(peakParentRss, process.memoryUsage().rss);
  try {
    const children = readFileSync(`/proc/${process.pid}/task/${process.pid}/children`, "utf8")
      .trim()
      .split(/\s+/u)
      .filter(Boolean);
    for (const pid of children) {
      if (!/^\d+$/u.test(pid)) continue;
      const status = readFileSync(`/proc/${pid}/status`, "utf8");
      const rss = /^VmRSS:\s+(\d+) kB$/mu.exec(status)?.[1];
      if (rss) peakChildRssKiB = Math.max(peakChildRssKiB, Number(rss));
    }
  } catch {
    // A completed child can disappear between these metadata-only reads.
  }
}, 10);
const started = performance.now();
let pdfBytes = 0;
try {
  // Production permits one PDF child in its independent serial report lane.
  // Repeat maximum-sized rendering while the same process serves ingestion;
  // in-flight AI is asynchronous and tested separately with a real DB pool.
  const render = async () => {
    for (let index = 0; index < 3; index++) {
      const body = await renderReportPdfInChild(view);
      assert.ok(body.length < 5 * 1024 * 1024);
      assert.equal(body.subarray(0, 5).toString(), "%PDF-");
      pdfBytes += body.length;
    }
  };
  console.log("report_resource_under_pdf_pressure");
  await Promise.all([render(), runIngestionLoadCheck()]);
  console.log(
    JSON.stringify({
      report_resource_check: "passed",
      synthetic: true,
      projects: document.report.scope.length,
      metrics: document.report.facts.metrics.length,
      sources: document.report.sources.length,
      serial_pdf_children: 3,
      maximum_concurrent_pdf_children: 1,
      output_bytes: pdfBytes,
      elapsed_ms: Math.round(performance.now() - started),
      peak_parent_rss_bytes: peakParentRss,
      parent_peak_rss_kib: process.resourceUsage().maxRSS,
      sampled_child_peak_rss_kib: peakChildRssKiB,
      measurement_limits:
        "in-process mocked ingestion persistence; no hosted throughput or universal capacity claim"
    })
  );
} finally {
  clearInterval(sampler);
}
