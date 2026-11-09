import { z } from "zod";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import { ProjectJobInitiatorSchema } from "./project-job-authorization.js";
import { readPublishedReportRun } from "./report-published-run.js";
import { createWorkerJobStore, type WorkerJobClaim } from "./worker-job-store.js";
import type { Queryable } from "./types.js";
export const ReportPdfJobPayloadSchema = z
  .object({
    organization_id: z.uuid(),
    run_id: z.uuid(),
    request_id: z.uuid(),
    expected_ready_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    initiating_authority: ProjectJobInitiatorSchema
  })
  .strict();
/** PDF work uses the actual requesting reader, including archived access after
 * downgrade. Lock order remains organisation, real durable job, published run.
 * A generation lease or an invented token cannot authorise PDF publication. */
export async function lockReportPdfClaim(
  tx: Queryable,
  claim: WorkerJobClaim,
  markClaim = false
): Promise<Record<string, unknown>> {
  if (claim.name !== "render-smart-report-pdf") throw new Error("report_pdf_job_claim_invalid");
  const payload = ReportPdfJobPayloadSchema.parse(claim.payload);
  await tx.query("SET LOCAL lock_timeout='5s'", []);
  await tx.query("SET LOCAL statement_timeout='10s'", []);
  if (
    (
      await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        payload.organization_id
      ])
    ).rows.length !== 1
  )
    throw new SmartReportError("report_not_found");
  await createWorkerJobStore(tx).lock(claim);
  const row = await readPublishedReportRun(
    tx,
    {
      organization_id: payload.organization_id,
      id: payload.run_id,
      initiator: payload.initiating_authority
    },
    true
  );
  if (row["pdf_job_id"] !== claim.id || row["ready_sha256"] !== payload.expected_ready_sha256)
    throw new Error("report_pdf_job_scope_changed");
  if (
    (
      await tx.query("SELECT id FROM worker_jobs WHERE id=$1 AND expires_at>clock_timestamp()", [
        claim.id
      ])
    ).rows.length !== 1
  )
    throw new Error("report_pdf_job_expired");
  if (markClaim)
    await tx.query("UPDATE report_runs SET last_claimed_at=clock_timestamp() WHERE id=$1", [
      payload.run_id
    ]);
  return row;
}
