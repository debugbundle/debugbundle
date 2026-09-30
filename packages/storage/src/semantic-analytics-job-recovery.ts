import { z } from "zod";
import { lockAnalyticsWriterProject } from "./analytics-writer-access.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

const Input = z
  .object({
    actorUserId: z.string().uuid(),
    projectId: z.string().uuid(),
    eventId: z.string().uuid()
  })
  .strict();

export type SemanticAnalyticsJobRecoveryResult =
  | { kind: "queued" }
  | { kind: "invalid" | "forbidden" | "unavailable" };

/** Explicit owner/admin retry while the exact accepted raw receipt still owns its job. */
export async function retryFailedSemanticAnalyticsEvent(
  db: Queryable,
  input: { actorUserId: string; projectId: string; eventId: string }
): Promise<SemanticAnalyticsJobRecoveryResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { kind: "invalid" };
  const { actorUserId, projectId, eventId } = parsed.data;
  return runInTransaction(db, async (tx) => {
    if ((await lockAnalyticsWriterProject(tx, projectId, actorUserId)) === null)
      return { kind: "forbidden" };
    const receipt = (
      await tx.query<{
        worker_job_id: string;
        content_hash: string;
        raw_object_key: string;
      }>(
        `SELECT worker_job_id,content_hash,raw_object_key
       FROM semantic_analytics_receipts
       WHERE project_id=$1::uuid AND event_id=$2::uuid
         AND raw_status='active' AND raw_retention_outcome IS NULL AND expires_at>now()
       FOR UPDATE`,
        [projectId, eventId]
      )
    ).rows[0];
    if (receipt === undefined) return { kind: "unavailable" };
    const queued = await tx.query(
      `UPDATE worker_jobs SET status='pending',attempts=0,
         operator_retries=operator_retries+1,available_at=now(),updated_at=now(),
         last_error_code='operator_retry_requested'
       WHERE id=$1 AND project_id=$2::uuid
         AND job_name='process-semantic-analytics-event'
         AND status='failed' AND payload IS NOT NULL AND expires_at>now()
         AND operator_retries<3
         AND payload->>'project_id'=$2::text AND payload->>'event_id'=$3
         AND payload->>'content_hash'=$4 AND payload->>'object_key'=$5
       RETURNING id`,
      [receipt.worker_job_id, projectId, eventId, receipt.content_hash, receipt.raw_object_key]
    );
    return queued.rows.length === 1 ? { kind: "queued" } : { kind: "unavailable" };
  });
}
