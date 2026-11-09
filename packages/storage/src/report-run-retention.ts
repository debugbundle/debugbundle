import { releaseUnusedReportAllocation } from "./report-run-budget.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";
/** One bounded housekeeping item. Runs and names expire even when new reports
 * are disabled. Paid receipts/unknown holds survive run deletion; owned object
 * intents remain available for exact-key cleanup after in-flight writes finish. */
export async function maintainNextReportRun(db: Queryable): Promise<boolean> {
  return runInTransaction(db, async (tx) => {
    await tx.query("SET LOCAL lock_timeout='5s'", []);
    await tx.query("SET LOCAL statement_timeout='10s'", []);
    const candidate = (
      await tx.query<{ id: string; organization_id: string }>(
        `SELECT r.id,r.organization_id FROM report_runs r JOIN organizations o ON o.id=r.organization_id
      WHERE r.expires_at<=clock_timestamp() OR (r.status IN ('queued','processing') AND r.generation_deadline_at<=clock_timestamp())
      ORDER BY r.expires_at,r.created_at,r.id FOR UPDATE OF o SKIP LOCKED LIMIT 1`,
        []
      )
    ).rows[0];
    if (!candidate) return false;
    const row = (
      await tx.query<Record<string, unknown>>(
        `SELECT *,expires_at<=clock_timestamp() AS expired FROM report_runs WHERE id=$1 FOR UPDATE`,
        [candidate.id]
      )
    ).rows[0];
    if (!row) return false;
    await tx.query(
      "UPDATE worker_jobs SET status='skipped',payload=NULL,lease_token=NULL,lease_expires_at=NULL,last_error_code='report_expired',updated_at=clock_timestamp() WHERE id=$1 AND status IN ('pending','running')",
      [row["processing_job_id"]]
    );
    if (row["expired"] === true) {
      await tx.query("DELETE FROM report_runs WHERE id=$1", [candidate.id]);
      return true;
    }
    const unstarted = await releaseUnusedReportAllocation(tx, row, true);
    await tx.query(
      `UPDATE report_runs SET status='failed',lease_token=NULL,lease_expires_at=NULL,generation_counted=CASE WHEN $2 THEN false ELSE generation_counted END,
      ai_reserved_nano_usd=CASE WHEN paid_attempts=0 THEN 0 ELSE ai_reserved_nano_usd END,
      ai_status=CASE WHEN ai_status='pending' THEN CASE WHEN paid_attempts=0 THEN 'failed' ELSE 'uncertain' END ELSE ai_status END,updated_at=clock_timestamp() WHERE id=$1`,
      [candidate.id, unstarted]
    );
    await tx.query(
      "UPDATE report_model_attempts SET narrative_json=NULL,state=CASE WHEN state='sending' THEN 'uncertain' ELSE state END WHERE run_id=$1",
      [candidate.id]
    );
    await tx.query(
      "UPDATE report_artifact_objects SET state='deleting',cleanup_after_at=GREATEST(clock_timestamp()+interval '2 minutes',write_deadline_at+interval '2 minutes') WHERE run_id=$1",
      [candidate.id]
    );
    return true;
  });
}
