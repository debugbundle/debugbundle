import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ObjectStoreBulkDeleter, ObjectStoreLister } from "./object-store-types.js";
import { buildSemanticAnalyticsRawEventObjectKey } from "./helpers.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

const Limit = z.number().int().min(1).max(100);
type Task = Record<string, unknown> & {
  task_id: string;
  project_id: string;
  namespace_revision: string;
  subject_kind: "anonymous" | "user" | "account";
  subject_ref: string;
  cutoff_at: Date;
  lease_token: string;
};
type Candidate = Record<string, unknown> & {
  event_id: string;
  worker_job_id: string;
  raw_object_key: string;
  content_hash: string;
  occurred_at: Date;
  raw_status: "active" | "deleting" | "deleted";
};

export interface SubjectErasurePass {
  task_id: string | null;
  objects_deleted: number;
  facts_deleted: number;
  failed_objects: number;
  complete: boolean;
  has_more: boolean;
}

async function claimTask(db: Queryable): Promise<Task | null> {
  const leaseToken = randomUUID();
  const row = (
    await db.query<Task>(
      `WITH due AS (
         SELECT task_id FROM analytics_project_subject_erasures
         WHERE status='pending' AND next_attempt_at<=clock_timestamp()
           AND (lease_expires_at IS NULL OR lease_expires_at<=clock_timestamp())
         ORDER BY next_attempt_at,task_id LIMIT 1 FOR UPDATE SKIP LOCKED
       )
       UPDATE analytics_project_subject_erasures task
       SET lease_token=$1::uuid,lease_expires_at=clock_timestamp()+interval '2 minutes',
           next_attempt_at=clock_timestamp()+interval '2 minutes',
           attempt_count=attempt_count+1
       FROM due WHERE task.task_id=due.task_id
       RETURNING task.task_id,task.project_id,task.namespace_revision,task.subject_kind,
         task.subject_ref,task.cutoff_at,task.lease_token`,
      [leaseToken]
    )
  ).rows[0];
  return row ?? null;
}

async function candidates(
  db: Queryable,
  task: Task,
  limit: number,
  dueOnly = true
): Promise<Candidate[]> {
  return (
    await db.query<Candidate>(
      `SELECT DISTINCT receipt.event_id,receipt.worker_job_id,receipt.raw_object_key,
         receipt.content_hash,receipt.occurred_at,receipt.raw_status,
         receipt.accepted_at
       FROM semantic_analytics_receipts receipt
       JOIN semantic_analytics_receipt_subjects subject
         ON subject.project_id=receipt.project_id AND subject.event_id=receipt.event_id
           AND subject.namespace_revision=receipt.namespace_revision
       WHERE receipt.project_id=$1::uuid AND receipt.namespace_revision=$2
         AND receipt.occurred_at<=$5::timestamptz
         AND (NOT $7::boolean OR receipt.raw_status IN ('active','deleted')
           OR (receipt.raw_status='deleting'
             AND (receipt.raw_delete_retry_at IS NULL
               OR receipt.raw_delete_retry_at<=clock_timestamp())))
         AND ((subject.subject_kind=$3 AND subject.subject_ref=$4)
           OR ($3 IN ('user','account') AND subject.subject_kind='anonymous'
             AND EXISTS (
               SELECT 1 FROM analytics_project_identity_associations association
               WHERE association.project_id=receipt.project_id
                 AND association.namespace_revision=receipt.namespace_revision
                 AND association.anonymous_id_hash=subject.subject_ref
                 AND (($3='user' AND association.user_id_hash=$4)
                   OR ($3='account' AND association.account_id_hash=$4)))))
       ORDER BY receipt.accepted_at,receipt.event_id LIMIT $6`,
      [
        task.project_id,
        task.namespace_revision,
        task.subject_kind,
        task.subject_ref,
        task.cutoff_at.toISOString(),
        limit,
        dueOnly
      ]
    )
  ).rows;
}

async function stageObject(
  db: Queryable,
  task: Task,
  candidate: Candidate
): Promise<string | null> {
  const expected = buildSemanticAnalyticsRawEventObjectKey({
    projectId: task.project_id,
    eventId: candidate.event_id,
    occurredAt: candidate.occurred_at,
    contentHash: candidate.content_hash
  });
  if (expected !== candidate.raw_object_key) throw new Error("semantic_subject_object_key_invalid");
  return runInTransaction(db, async (tx) => {
    // Match the durable job -> project -> receipt lock order used by raw retention.
    const job = await tx.query<{ status: string }>(
      "SELECT status FROM worker_jobs WHERE id=$1 FOR UPDATE",
      [candidate.worker_job_id]
    );
    const project = await tx.query("SELECT id FROM projects WHERE id=$1::uuid FOR UPDATE", [
      task.project_id
    ]);
    if (project.rows.length !== 1) return null;
    const currentTask = await tx.query(
      `SELECT 1 FROM analytics_project_subject_erasures
       WHERE task_id=$1::uuid AND status='pending' AND lease_token=$2::uuid
         AND lease_expires_at>clock_timestamp()`,
      [task.task_id, task.lease_token]
    );
    if (currentTask.rows.length !== 1) throw new Error("semantic_subject_erasure_lease_lost");
    const current = (
      await tx.query<
        Record<string, unknown> & {
          raw_object_key: string;
          raw_status: "active" | "deleting" | "deleted";
          retry_due: boolean;
        }
      >(
        `SELECT raw_object_key,raw_status,
           COALESCE(raw_delete_retry_at<=clock_timestamp(),true) AS retry_due
         FROM semantic_analytics_receipts
         WHERE project_id=$1::uuid AND event_id=$2::uuid FOR UPDATE`,
        [task.project_id, candidate.event_id]
      )
    ).rows[0];
    if (current === undefined || current.raw_object_key !== expected) return null;
    if (current.raw_status === "deleted" || !current.retry_due) return null;
    if (current.raw_status === "active") {
      if (job.rows[0] !== undefined && !["completed", "skipped"].includes(job.rows[0].status)) {
        await tx.query(
          `UPDATE worker_jobs SET status='failed',payload=NULL,lease_token=NULL,
             lease_expires_at=NULL,last_error_code='semantic_subject_erased',
             updated_at=now(),expires_at=now()+interval '7 days'
           WHERE id=$1`,
          [candidate.worker_job_id]
        );
      }
      await tx.query(
        `UPDATE semantic_analytics_receipts
         SET raw_status='deleting',raw_retention_outcome='erased',
           raw_delete_retry_at=clock_timestamp()+interval '5 minutes'
         WHERE project_id=$1::uuid AND event_id=$2::uuid AND raw_status='active'`,
        [task.project_id, candidate.event_id]
      );
    } else {
      await tx.query(
        `UPDATE semantic_analytics_receipts
         SET raw_delete_retry_at=clock_timestamp()+interval '5 minutes'
         WHERE project_id=$1::uuid AND event_id=$2::uuid AND raw_status='deleting'`,
        [task.project_id, candidate.event_id]
      );
    }
    return expected;
  });
}

async function finalizeObject(db: Queryable, task: Task, candidate: Candidate): Promise<number> {
  return runInTransaction(db, async (tx) => {
    const project = await tx.query("SELECT id FROM projects WHERE id=$1::uuid FOR UPDATE", [
      task.project_id
    ]);
    if (project.rows.length !== 1) return 0;
    const lease = await tx.query(
      `SELECT 1 FROM analytics_project_subject_erasures
       WHERE task_id=$1::uuid AND status='pending' AND lease_token=$2::uuid
         AND lease_expires_at>clock_timestamp()`,
      [task.task_id, task.lease_token]
    );
    if (lease.rows.length !== 1) throw new Error("semantic_subject_erasure_lease_lost");
    const receipt = (
      await tx.query<{ raw_status: string; raw_object_key: string }>(
        `SELECT raw_status,raw_object_key FROM semantic_analytics_receipts
         WHERE project_id=$1::uuid AND event_id=$2::uuid FOR UPDATE`,
        [task.project_id, candidate.event_id]
      )
    ).rows[0];
    if (receipt === undefined || receipt.raw_object_key !== candidate.raw_object_key) return 0;
    if (receipt.raw_status === "deleting") {
      await tx.query(
        `UPDATE semantic_analytics_receipts
         SET raw_status='deleted',raw_deleted_at=clock_timestamp(),raw_delete_retry_at=NULL
         WHERE project_id=$1::uuid AND event_id=$2::uuid AND raw_status='deleting'`,
        [task.project_id, candidate.event_id]
      );
    } else if (receipt.raw_status !== "deleted") {
      throw new Error("semantic_subject_erasure_receipt_unfenced");
    }
    const facts = await tx.query<{ event_id: string }>(
      `DELETE FROM semantic_analytics_funnel_facts
       WHERE project_id=$1::uuid AND event_id=$2::uuid RETURNING event_id`,
      [task.project_id, candidate.event_id]
    );
    const portfolioFacts = await tx.query<{ event_id: string }>(
      `DELETE FROM semantic_analytics_portfolio_funnel_facts
       WHERE project_id=$1::uuid AND event_id=$2::uuid RETURNING event_id`,
      [task.project_id, candidate.event_id]
    );
    await tx.query(
      `DELETE FROM semantic_analytics_receipt_subjects
       WHERE project_id=$1::uuid AND event_id=$2::uuid`,
      [task.project_id, candidate.event_id]
    );
    return facts.rows.length + portfolioFacts.rows.length;
  });
}

async function finalizeTask(
  db: Queryable,
  task: Task,
  filledPage: boolean
): Promise<{ complete: boolean; hasMore: boolean }> {
  return runInTransaction(db, async (tx) => {
    // Admission stages under this lock; the final absence proof must see that commit.
    const project = await tx.query("SELECT id FROM projects WHERE id=$1::uuid FOR UPDATE", [
      task.project_id
    ]);
    if (project.rows.length !== 1) return { complete: true, hasMore: false };
    const lease = await tx.query(
      `SELECT 1 FROM analytics_project_subject_erasures
       WHERE task_id=$1::uuid AND status='pending' AND lease_token=$2::uuid
         AND lease_expires_at>clock_timestamp() FOR UPDATE`,
      [task.task_id, task.lease_token]
    );
    if (lease.rows.length !== 1) throw new Error("semantic_subject_erasure_lease_lost");
    const remaining = (await candidates(tx, task, 1, false)).length > 0;
    const unresolved =
      (
        await tx.query(
          `SELECT 1 FROM semantic_analytics_receipts receipt
           WHERE receipt.project_id=$1::uuid AND receipt.namespace_revision=$2
             AND receipt.principal='relay' AND receipt.identity_scope IS NOT NULL
             AND receipt.occurred_at<=$3::timestamptz AND receipt.raw_status<>'deleted'
             AND NOT EXISTS (
               SELECT 1 FROM semantic_analytics_receipt_subjects subject
               WHERE subject.project_id=receipt.project_id AND subject.event_id=receipt.event_id)
           LIMIT 1`,
          [task.project_id, task.namespace_revision, task.cutoff_at.toISOString()]
        )
      ).rows.length > 0;
    const contexts =
      (
        await tx.query(
          `SELECT 1 FROM analytics_project_identity_contexts context
           WHERE context.project_id=$1::uuid AND context.namespace_revision=$2
             AND context.issued_at<=$5::timestamptz
             AND (($3='anonymous' AND context.anonymous_id_hash=$4)
               OR ($3='user' AND context.user_id_hash=$4)
               OR ($3='account' AND context.account_id_hash=$4)
               OR ($3 IN ('user','account') AND EXISTS (
                 SELECT 1 FROM analytics_project_identity_associations association
                 WHERE association.project_id=context.project_id
                   AND association.namespace_revision=context.namespace_revision
                   AND association.anonymous_id_hash=context.anonymous_id_hash
                   AND (($3='user' AND association.user_id_hash=$4)
                     OR ($3='account' AND association.account_id_hash=$4)))))
           LIMIT 1`,
          [
            task.project_id,
            task.namespace_revision,
            task.subject_kind,
            task.subject_ref,
            task.cutoff_at.toISOString()
          ]
        )
      ).rows.length > 0;
    const pending =
      (
        await tx.query(
          `SELECT 1 FROM semantic_analytics_pending_objects
           WHERE project_id=$1::uuid AND created_at<=$2::timestamptz LIMIT 1`,
          [task.project_id, task.cutoff_at.toISOString()]
        )
      ).rows.length > 0;
    const hasMore = remaining || unresolved || contexts || pending || filledPage;
    const completed = await tx.query<{ status: string }>(
      `UPDATE analytics_project_subject_erasures
       SET status=CASE WHEN $3::boolean THEN 'pending' ELSE 'complete' END,
         completed_at=CASE WHEN $3::boolean THEN NULL ELSE clock_timestamp() END,
         next_attempt_at=clock_timestamp()+interval '1 minute',
         lease_token=NULL,lease_expires_at=NULL
       WHERE task_id=$1::uuid AND lease_token=$2::uuid
         AND lease_expires_at>clock_timestamp() AND status='pending'
       RETURNING status`,
      [task.task_id, task.lease_token, hasMore]
    );
    if (completed.rows.length !== 1) throw new Error("semantic_subject_erasure_lease_lost");
    return { complete: completed.rows[0]!.status === "complete", hasMore };
  });
}

/** One leased task and at most 100 exact accepted objects per semantic catch-up pass. */
export async function processProjectAnalyticsSubjectErasurePass(
  db: Queryable,
  objectStore: ObjectStoreBulkDeleter & ObjectStoreLister,
  input: { limit: number }
): Promise<SubjectErasurePass> {
  const limit = Limit.parse(input.limit);
  const task = await claimTask(db);
  if (task === null)
    return {
      task_id: null,
      objects_deleted: 0,
      facts_deleted: 0,
      failed_objects: 0,
      complete: false,
      has_more: false
    };
  const selected = await candidates(db, task, limit);
  const started = Date.now();
  const staged: Candidate[] = [];
  const alreadyDeleted: Candidate[] = [];
  for (const candidate of selected) {
    if (Date.now() - started >= 30_000) break;
    if (candidate.raw_status === "deleted") {
      alreadyDeleted.push(candidate);
      continue;
    }
    if ((await stageObject(db, task, candidate)) !== null) staged.push(candidate);
  }
  const deletedKeys = new Set<string>();
  if (staged.length > 0) {
    try {
      const result = await objectStore.deleteObjects({
        keys: staged.map((row) => row.raw_object_key),
        signal: AbortSignal.timeout(10_000)
      });
      const all = [...result.deleted, ...result.failed];
      const expected = staged.map((row) => row.raw_object_key);
      if (
        all.length !== expected.length ||
        new Set(all).size !== expected.length ||
        all.some((key) => !expected.includes(key))
      )
        throw new Error("semantic_subject_delete_outcome_invalid");
      const verificationDeadline = Date.now() + 30_000;
      for (let index = 0; index < result.deleted.length; index += 10) {
        if (Date.now() >= verificationDeadline) break;
        await Promise.all(
          result.deleted.slice(index, index + 10).map(async (key) => {
            try {
              const listed = await objectStore.listObjects({
                prefix: key,
                maxKeys: 1,
                signal: AbortSignal.timeout(
                  Math.max(1, Math.min(3_000, verificationDeadline - Date.now()))
                )
              });
              if (!listed.objects.some((object) => object.key === key)) deletedKeys.add(key);
            } catch {
              // Absence is unproved; keep the receipt and retry this exact key.
            }
          })
        );
      }
    } catch {
      // The durable per-object retry lease remains; the next pass may retry it.
    }
  }
  let factsDeleted = 0;
  for (const candidate of [
    ...alreadyDeleted,
    ...staged.filter((row) => deletedKeys.has(row.raw_object_key))
  ]) {
    factsDeleted += await finalizeObject(db, task, candidate);
  }
  const finished = await finalizeTask(db, task, selected.length >= limit);
  return {
    task_id: task.task_id,
    objects_deleted: deletedKeys.size,
    facts_deleted: factsDeleted,
    failed_objects: staged.length - deletedKeys.size,
    complete: finished.complete,
    has_more: finished.hasMore
  };
}
