import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ReportPdfStateSchema, type ReportPdfState } from "../../smart-reports/src/report-pdf.js";
import type { ReportContentView } from "../../smart-reports/src/report-content.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import {
  ReportContentInputSchema,
  type ReportContentInput,
  readPublishedReportRun
} from "./report-published-run.js";
import { ReportPdfJobPayloadSchema, lockReportPdfClaim } from "./report-pdf-claim.js";
import { createReportContentStore } from "./report-content-store.js";
import { createReportArtifactStore } from "./report-artifact-store.js";
import { reportArtifactKey, reportArtifactDigest } from "./report-artifact-key.js";
import { createWorkerJobStore, type WorkerJobClaim } from "./worker-job-store.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable, ObjectStoreClient, ObjectStoreReader } from "./types.js";
type Row = Record<string, unknown>;
type Reference = { key: string; sha256: string };
export interface ReportPdfStore {
  request(input: ReportContentInput): Promise<ReportPdfState>;
  status(input: ReportContentInput): Promise<ReportPdfState>;
  download(input: ReportContentInput): Promise<Buffer>;
  processNext(
    render: (view: ReportContentView) => Promise<Buffer>
  ): Promise<{ processed: boolean }>;
}
async function lockOrganization(tx: Queryable, id: string): Promise<void> {
  await tx.query("SET LOCAL lock_timeout='5s'", []);
  await tx.query("SET LOCAL statement_timeout='10s'", []);
  await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [id]);
}
async function pdfReference(tx: Queryable, row: Row): Promise<Reference | null> {
  if (row["pdf_object_key"] === null || row["pdf_sha256"] === null) return null;
  const sha256 = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(row["pdf_sha256"]);
  const key = reportArtifactKey({
    organization_id: String(row["organization_id"]),
    definition_id: String(row["definition_id"]),
    run_id: String(row["id"]),
    kind: "pdf",
    sha256
  });
  if (key !== row["pdf_object_key"]) throw new Error("report_pdf_namespace_invalid");
  const attached = await tx.query(
    "SELECT object_key FROM report_artifact_objects WHERE object_key=$1 AND run_id=$2 AND artifact_kind='pdf' AND sha256=$3 AND state='attached' AND expires_at>clock_timestamp()",
    [key, row["id"], sha256]
  );
  return attached.rows.length === 1 ? { key, sha256 } : null;
}
/** Metadata-only availability for authenticated report export manifests. */
export async function reportPdfAvailable(db: Queryable, row: Row): Promise<boolean> {
  return (await pdfReference(db, row)) !== null;
}
/** PDF cache preparation is a read capability over an already published report.
 * It never reserves logical generation or AI allowance. Organisation/run locks
 * coalesce requests; the queued principal is the actual requesting reader. */
export function createReportPdfStore(
  db: Queryable,
  objects: ObjectStoreClient & ObjectStoreReader
): ReportPdfStore {
  const jobs = createWorkerJobStore(db),
    artifacts = createReportArtifactStore(db),
    content = createReportContentStore(db, objects);
  async function currentProjection(input: ReportContentInput, row: Row): Promise<boolean> {
    if (row["privacy_mode"] !== "restricted" || row["pdf_object_key"] === null) return true;
    const document = await content.read(input);
    const digest = reportArtifactDigest(Buffer.from(JSON.stringify(document)));
    const projection = (
      await db.query<{ document_sha256: string; pdf_sha256: string }>(
        "SELECT document_sha256,pdf_sha256 FROM report_pdf_projections WHERE run_id=$1",
        [input.id]
      )
    ).rows[0];
    // Legacy caches are usable only if the current private reader returns the
    // original canonical document unchanged. A safe fallback needs a fresh PDF.
    return projection
      ? projection.document_sha256 === digest && projection.pdf_sha256 === row["pdf_sha256"]
      : digest === row["ready_sha256"];
  }
  async function state(tx: Queryable, row: Row): Promise<ReportPdfState> {
    if (await pdfReference(tx, row))
      return { run_id: String(row["id"]), status: "ready", retry_after_seconds: null };
    if (row["pdf_job_id"] === null)
      return { run_id: String(row["id"]), status: "not_requested", retry_after_seconds: null };
    const job = (
      await tx.query<Row>(
        `SELECT status,last_error_code,attempts,expires_at>clock_timestamp() AS alive,lease_expires_at>clock_timestamp() AS leased,
      GREATEST(0,LEAST(300,ceil(extract(epoch FROM updated_at+interval '5 minutes'-clock_timestamp()))))::int AS retry_after FROM worker_jobs WHERE id=$1`,
        [row["pdf_job_id"]]
      )
    ).rows[0];
    const active = job?.["alive"] === true;
    const status =
      active && job?.["status"] === "running" && job["leased"] === true
        ? "processing"
        : active &&
            ["pending", "running"].includes(String(job?.["status"])) &&
            z.coerce.number().parse(job?.["attempts"]) < 8
          ? "queued"
          : "failed";
    const retry =
      status !== "failed"
        ? 2
        : job?.["status"] === "failed"
          ? z.coerce.number().int().parse(job["retry_after"])
          : 0;
    return ReportPdfStateSchema.parse({ run_id: row["id"], status, retry_after_seconds: retry });
  }
  async function check(claim: WorkerJobClaim, mark = false): Promise<Row> {
    return runInTransaction(db, (tx) => lockReportPdfClaim(tx, claim, mark));
  }
  async function invalidate(input: ReportContentInput, reference: Reference): Promise<void> {
    await runInTransaction(db, async (tx) => {
      await lockOrganization(tx, input.organization_id);
      const row = await readPublishedReportRun(tx, input, true);
      if (row["pdf_object_key"] !== reference.key || row["pdf_sha256"] !== reference.sha256) return;
      // A corrupt/missing cache can be rewritten by a new fenced writer. Its
      // previous private object remains owned and receives bounded orphan GC.
      await tx.query(
        "UPDATE report_artifact_objects SET state='allocated',cleanup_after_at=LEAST(clock_timestamp()+interval '10 minutes',expires_at) WHERE object_key=$1 AND state='attached'",
        [reference.key]
      );
      await tx.query(
        "UPDATE report_runs SET pdf_object_key=NULL,pdf_sha256=NULL,updated_at=clock_timestamp() WHERE id=$1",
        [input.id]
      );
      await tx.query("UPDATE worker_jobs SET last_error_code='cached_output_missing' WHERE id=$1", [
        row["pdf_job_id"]
      ]);
    });
  }
  return {
    async request(raw) {
      const input = ReportContentInputSchema.parse(raw);
      const saved = await readPublishedReportRun(db, input);
      if (!(await currentProjection(input, saved))) {
        const reference = await pdfReference(db, saved);
        if (reference) await invalidate(input, reference);
      }
      return runInTransaction(db, async (tx) => {
        await lockOrganization(tx, input.organization_id);
        const row = await readPublishedReportRun(tx, input, true),
          current = await state(tx, row);
        if (
          current.status !== "not_requested" &&
          (current.status !== "failed" || (current.retry_after_seconds ?? 0) > 0)
        )
          return current;
        const payload = ReportPdfJobPayloadSchema.parse({
          organization_id: input.organization_id,
          run_id: input.id,
          request_id: randomUUID(),
          expected_ready_sha256: row["ready_sha256"],
          initiating_authority: input.initiator
        });
        const id = await createWorkerJobStore(tx).enqueue("render-smart-report-pdf", payload);
        await tx.query(
          "UPDATE worker_jobs SET expires_at=LEAST(clock_timestamp()+interval '24 hours',$2::timestamptz) WHERE id=$1",
          [id, row["expires_at"]]
        );
        await tx.query(
          "UPDATE report_runs SET pdf_job_id=$2,updated_at=clock_timestamp() WHERE id=$1",
          [input.id, id]
        );
        return { run_id: input.id, status: "queued", retry_after_seconds: 2 };
      });
    },
    async status(raw) {
      const input = ReportContentInputSchema.parse(raw);
      const row = await readPublishedReportRun(db, input);
      if (!(await currentProjection(input, row)))
        return { run_id: input.id, status: "not_requested", retry_after_seconds: null };
      return state(db, row);
    },
    async download(raw) {
      const input = ReportContentInputSchema.parse(raw),
        row = await readPublishedReportRun(db, input),
        reference = await pdfReference(db, row);
      if (!reference) throw new Error("report_pdf_not_ready");
      let body: Buffer;
      try {
        body = await objects.getObject({
          key: reference.key,
          maxBytes: 5 * 1024 * 1024,
          timeoutMs: 15000
        });
      } catch (error) {
        if (
          error instanceof Error &&
          ["s3_object_not_found", "s3_object_too_large"].includes(error.message)
        )
          await invalidate(input, reference);
        throw new Error("report_pdf_unavailable");
      }
      if (
        !Buffer.isBuffer(body) ||
        body.length > 5 * 1024 * 1024 ||
        reportArtifactDigest(body) !== reference.sha256 ||
        body.subarray(0, 5).toString() !== "%PDF-" ||
        !/%%EOF\s*$/.test(body.subarray(-32).toString("latin1"))
      ) {
        await invalidate(input, reference);
        throw new Error("report_pdf_unavailable");
      }
      const current = await readPublishedReportRun(db, input);
      if (current["pdf_object_key"] !== reference.key || current["pdf_sha256"] !== reference.sha256)
        throw new Error("report_pdf_unavailable");
      // The private fetch can overlap an identity change. Check the current safe
      // projection after that IO, before cached bytes cross the response boundary.
      if (!(await currentProjection(input, current))) {
        await invalidate(input, reference);
        throw new Error("report_pdf_not_ready");
      }
      return body;
    },
    async processNext(render) {
      const next = (
        await db.query<{ pdf_job_id: string }>(
          `SELECT r.pdf_job_id FROM report_runs r JOIN worker_jobs j ON j.id=r.pdf_job_id
        LEFT JOIN LATERAL(SELECT last_claimed_at FROM report_runs previous WHERE previous.organization_id=r.organization_id AND previous.last_claimed_at IS NOT NULL ORDER BY last_claimed_at DESC LIMIT 1) recent ON true
        WHERE r.status IN ('ready','factual_only') AND j.job_name='render-smart-report-pdf' AND j.expires_at>clock_timestamp() AND j.attempts<8
        AND ((j.status='pending' AND j.available_at<=clock_timestamp()) OR (j.status='running' AND j.lease_expires_at<=clock_timestamp()))
        ORDER BY recent.last_claimed_at ASC NULLS FIRST,r.created_at,r.id LIMIT 1`,
          []
        )
      ).rows[0];
      const claim = next ? await jobs.claim("render-smart-report-pdf", next.pdf_job_id) : null;
      if (!claim) return { processed: false };
      try {
        const row = await check(claim, true),
          payload = ReportPdfJobPayloadSchema.parse(claim.payload);
        if (!(await pdfReference(db, row))) {
          const view = await content.view({
            organization_id: payload.organization_id,
            id: payload.run_id,
            initiator: payload.initiating_authority
          });
          await check(claim);
          const body = await render(view);
          await check(claim);
          if (
            !Buffer.isBuffer(body) ||
            body.length > 5 * 1024 * 1024 ||
            body.subarray(0, 5).toString() !== "%PDF-" ||
            !/%%EOF\s*$/.test(body.subarray(-32).toString("latin1"))
          )
            throw new Error("report_pdf_output_invalid");
          await artifacts.persist(
            claim,
            { kind: "pdf", body, expires_at: view.document.report.expires_at },
            objects
          );
          await runInTransaction(db, async (tx) => {
            const current = await lockReportPdfClaim(tx, claim);
            await tx.query(
              `INSERT INTO report_pdf_projections(run_id,document_sha256,pdf_sha256) VALUES($1,$2,$3)
              ON CONFLICT(run_id) DO UPDATE SET document_sha256=EXCLUDED.document_sha256,pdf_sha256=EXCLUDED.pdf_sha256`,
              [
                payload.run_id,
                reportArtifactDigest(Buffer.from(JSON.stringify(view.document))),
                current["pdf_sha256"]
              ]
            );
          });
        }
        await runInTransaction(db, async (tx) => {
          const current = await lockReportPdfClaim(tx, claim);
          if (!(await pdfReference(tx, current))) throw new Error("report_pdf_output_missing");
          await createWorkerJobStore(tx).complete(claim);
        });
        return { processed: true };
      } catch (error) {
        const terminal = (
          await db.query<{ status: string }>("SELECT status FROM worker_jobs WHERE id=$1", [
            claim.id
          ])
        ).rows[0]?.status;
        if (
          error instanceof SmartReportError ||
          terminal === "skipped" ||
          terminal === "completed"
        ) {
          await jobs.complete(claim, "initiator_access_revoked").catch(() => undefined);
          return { processed: true };
        }
        await jobs.fail(claim);
        throw new Error("report_pdf_processing_unavailable");
      }
    }
  };
}
