import { z } from "zod";
import type { ObjectStoreBulkDeleter, ObjectStoreDeleteInput } from "./object-store-types.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

interface RawCandidate extends Record<string, unknown> {
  project_id: string;
  event_id: string;
  worker_job_id: string;
  raw_object_key: string;
  raw_status: "active" | "deleting" | "deleted";
  accepted_at: Date;
  due_at: Date;
}

export interface SemanticAnalyticsRawRetentionCursor {
  accepted_at: string;
  project_id: string;
  event_id: string;
}

export interface SemanticAnalyticsRawDeletionProgress {
  failed_deletes: number;
  /** Oldest due time in this selected batch; it is not a remaining-backlog watermark. */
  oldest_selected_due_at: string | null;
}

export interface SemanticAnalyticsRawRetentionService {
  cleanExpired(input: {
    now: string;
    limit: number;
    objectStore: {
      deleteObject(input: ObjectStoreDeleteInput): Promise<void>;
    } & Partial<ObjectStoreBulkDeleter>;
    deadlineMs?: number;
    onProgress?: (progress: SemanticAnalyticsRawDeletionProgress) => void;
    startAfter?: SemanticAnalyticsRawRetentionCursor;
    /** Advances within one bounded pass; the next scheduled pass starts from the oldest due row. */
    onCursor?: (cursor: SemanticAnalyticsRawRetentionCursor | null) => void;
  }): Promise<{ deleted: number; hasMore: boolean }>;
  pruneExpired(input: {
    now: string;
    limit: number;
  }): Promise<{ pruned: number; hasMore: boolean }>;
}

/** Keep the small receipt for replay after deleting its short-lived protected S3 bytes. */
export function createSemanticAnalyticsRawRetentionService(
  db: Queryable
): SemanticAnalyticsRawRetentionService {
  return {
    async cleanExpired(input) {
      const now = z.string().datetime({ precision: 3 }).parse(input.now);
      const limit = z.number().int().min(1).max(100).parse(input.limit);
      const deadlineMs =
        input.deadlineMs === undefined
          ? undefined
          : z.number().int().nonnegative().parse(input.deadlineMs);
      const startAfter =
        input.startAfter === undefined
          ? undefined
          : z
              .object({
                accepted_at: z.string().datetime({ precision: 3 }),
                project_id: z.string().uuid(),
                event_id: z.string().uuid()
              })
              .strict()
              .parse(input.startAfter);
      const selectionSql =
        startAfter === undefined
          ? `SELECT r.project_id::text,r.event_id::text,r.worker_job_id,r.raw_object_key,
                    r.raw_status,r.accepted_at,
                    r.accepted_at+make_interval(days => COALESCE(s.raw_retention_days,1)::int)
                      AS due_at
             FROM semantic_analytics_receipts r
             LEFT JOIN project_analytics_settings s ON s.project_id=r.project_id
             WHERE ((r.raw_status='deleting'
               AND (r.raw_delete_retry_at IS NULL OR r.raw_delete_retry_at<=clock_timestamp()))
               OR (r.raw_status='active' AND r.accepted_at <
                 $1::timestamptz-make_interval(days => COALESCE(s.raw_retention_days,1)::int)))
             ORDER BY r.accepted_at,r.project_id,r.event_id LIMIT $2`
          : `WITH active AS (
           SELECT r.project_id::text,r.event_id::text,r.worker_job_id,r.raw_object_key,
                  r.raw_status,r.accepted_at,
                  r.accepted_at+make_interval(days => COALESCE(s.raw_retention_days,1)::int)
                    AS due_at
           FROM semantic_analytics_receipts r
           LEFT JOIN project_analytics_settings s ON s.project_id=r.project_id
           WHERE r.raw_status='active'
             AND r.accepted_at < $1::timestamptz-interval '1 day'
             AND r.accepted_at <
               $1::timestamptz-make_interval(days => COALESCE(s.raw_retention_days,1)::int)
             AND (r.accepted_at,r.project_id,r.event_id)>($3::timestamptz,$4::uuid,$5::uuid)
           ORDER BY r.accepted_at,r.project_id,r.event_id LIMIT $2
         ), deleting AS (
           SELECT r.project_id::text,r.event_id::text,r.worker_job_id,r.raw_object_key,
                  r.raw_status,r.accepted_at,
                  r.accepted_at+make_interval(days => COALESCE(s.raw_retention_days,1)::int)
                    AS due_at
           FROM semantic_analytics_receipts r
           LEFT JOIN project_analytics_settings s ON s.project_id=r.project_id
           WHERE r.raw_status='deleting'
             AND (r.raw_delete_retry_at IS NULL OR r.raw_delete_retry_at<=clock_timestamp())
             AND (r.accepted_at,r.project_id,r.event_id)>($3::timestamptz,$4::uuid,$5::uuid)
           ORDER BY r.accepted_at,r.project_id,r.event_id LIMIT $2
         )
         SELECT * FROM active UNION ALL SELECT * FROM deleting
         ORDER BY accepted_at,project_id,event_id LIMIT $2`;
      const candidates = await db.query<RawCandidate>(
        selectionSql,
        startAfter === undefined
          ? [now, limit]
          : [now, limit, startAfter.accepted_at, startAfter.project_id, startAfter.event_id]
      );
      const lastSelected = candidates.rows.at(-1);
      input.onCursor?.(
        lastSelected === undefined
          ? null
          : {
              accepted_at: lastSelected.accepted_at.toISOString(),
              project_id: lastSelected.project_id,
              event_id: lastSelected.event_id
            }
      );
      let deleted = 0;
      let deferred = false;
      let failedDeletes = 0;
      let oldestSelectedDueAt: string | null = null;
      const bulkCandidates: RawCandidate[] = [];
      for (const candidate of candidates.rows) {
        if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
          deferred = true;
          break;
        }
        const selectedDueAt = candidate.due_at.toISOString();
        if (oldestSelectedDueAt === null || selectedDueAt < oldestSelectedDueAt)
          oldestSelectedDueAt = selectedDueAt;
        const key = await runInTransaction(db, async (tx) => {
          // The durable worker locks its job before project and receipt. Match that order
          // so a worker either finishes before deletion or loses its lease before reading.
          const job = await tx.query<{ status: string }>(
            "SELECT status FROM worker_jobs WHERE id=$1 FOR UPDATE",
            [candidate.worker_job_id]
          );
          const project = await tx.query("SELECT id FROM projects WHERE id=$1::uuid FOR UPDATE", [
            candidate.project_id
          ]);
          if (project.rows.length === 0) return null;
          const receipt = await tx.query<
            RawCandidate & { accepted_at: Date; delete_lease_active: boolean }
          >(
            `SELECT project_id::text,event_id::text,worker_job_id,raw_object_key,raw_status,
                    accepted_at,COALESCE(raw_delete_retry_at>clock_timestamp(),false)
                      AS delete_lease_active
             FROM semantic_analytics_receipts
             WHERE project_id=$1::uuid AND event_id=$2::uuid FOR UPDATE`,
            [candidate.project_id, candidate.event_id]
          );
          const current = receipt.rows[0];
          if (
            current === undefined ||
            current.raw_object_key !== candidate.raw_object_key ||
            current.worker_job_id !== candidate.worker_job_id ||
            current.raw_status === "deleted"
          )
            return null;
          // Use the database execution clock for the in-flight lease. A delayed
          // job's scheduled cutoff must not make its current S3 attempt look stale.
          if (current.raw_status === "deleting") {
            if (current.delete_lease_active) return null;
            await tx.query(
              `UPDATE semantic_analytics_receipts
               SET raw_delete_retry_at=clock_timestamp()+interval '5 minutes'
               WHERE project_id=$1::uuid AND event_id=$2::uuid AND raw_status='deleting'`,
              [candidate.project_id, candidate.event_id]
            );
            return current.raw_object_key;
          }

          const settings = await tx.query<{ raw_retention_days: number }>(
            `SELECT COALESCE(raw_retention_days,1)::int AS raw_retention_days
             FROM project_analytics_settings WHERE project_id=$1::uuid`,
            [candidate.project_id]
          );
          const days = settings.rows[0]?.raw_retention_days ?? 1;
          if (current.accepted_at.getTime() >= new Date(now).getTime() - days * 86_400_000)
            return null;

          const completed = job.rows[0]?.status === "completed";
          if (job.rows[0] !== undefined && !completed && job.rows[0].status !== "skipped") {
            await tx.query(
              `UPDATE worker_jobs SET status='failed',payload=NULL,lease_token=NULL,
                 lease_expires_at=NULL,last_error_code='semantic_raw_retention_expired',
                 updated_at=now(),expires_at=now()+interval '7 days'
               WHERE id=$1`,
              [candidate.worker_job_id]
            );
          }
          const transitioned = await tx.query<{ occurred_at: Date }>(
            `UPDATE semantic_analytics_receipts
             SET raw_status='deleting',raw_retention_outcome=$3,
                 raw_delete_retry_at=clock_timestamp()+interval '5 minutes'
             WHERE project_id=$1::uuid AND event_id=$2::uuid AND raw_status='active'
             RETURNING occurred_at`,
            [candidate.project_id, candidate.event_id, completed ? "job_completed" : "lost"]
          );
          if (transitioned.rows.length !== 1) throw new Error("semantic_raw_retention_lease_lost");
          if (!completed) {
            // This project/day marker survives transport receipt pruning. The
            // active-to-deleting transition owns its single increment.
            await tx.query(
              `INSERT INTO semantic_analytics_loss_days(project_id,occurred_on,lost_count)
               VALUES($1::uuid,($2::timestamptz AT TIME ZONE 'UTC')::date,1)
               ON CONFLICT(project_id,occurred_on) DO UPDATE
               SET lost_count=semantic_analytics_loss_days.lost_count+1,
                   last_recorded_at=GREATEST(
                     semantic_analytics_loss_days.last_recorded_at,clock_timestamp())`,
              [candidate.project_id, transitioned.rows[0]!.occurred_at]
            );
          }
          return current.raw_object_key;
        });
        if (key === null) continue;
        if (input.objectStore.deleteObjects !== undefined) {
          bulkCandidates.push(candidate);
          continue;
        }
        // The durable deletion state is committed before this bounded, retryable call.
        try {
          await input.objectStore.deleteObject({ key, signal: AbortSignal.timeout(10_000) });
        } catch {
          failedDeletes += 1;
          // Back off this object without letting it occupy every bounded batch.
          await db.query(
            `UPDATE semantic_analytics_receipts
             SET raw_delete_retry_at=clock_timestamp()+interval '5 minutes'
             WHERE project_id=$1::uuid AND event_id=$2::uuid AND raw_object_key=$3
               AND raw_status='deleting'`,
            [candidate.project_id, candidate.event_id, key]
          );
          continue;
        }
        await db.query(
          `UPDATE semantic_analytics_receipts
           SET raw_status='deleted',raw_deleted_at=now(),raw_delete_retry_at=NULL
           WHERE project_id=$1::uuid AND event_id=$2::uuid AND raw_object_key=$3
             AND raw_status='deleting'`,
          [candidate.project_id, candidate.event_id, key]
        );
        deleted += 1;
      }
      if (bulkCandidates.length > 0 && input.objectStore.deleteObjects !== undefined) {
        const keys = bulkCandidates.map((candidate) => candidate.raw_object_key);
        let deletedKeys = new Set<string>();
        try {
          const result = await input.objectStore.deleteObjects({
            keys,
            signal: AbortSignal.timeout(10_000)
          });
          const allOutcomes = [...result.deleted, ...result.failed];
          if (
            allOutcomes.length !== keys.length ||
            new Set(allOutcomes).size !== keys.length ||
            allOutcomes.some((key) => !keys.includes(key))
          )
            throw new Error("semantic_raw_bulk_delete_response_invalid");
          deletedKeys = new Set(result.deleted);
        } catch {
          // All leased objects remain retryable after their per-object delay.
        }
        for (const candidate of bulkCandidates) {
          if (!deletedKeys.has(candidate.raw_object_key)) {
            failedDeletes += 1;
            continue;
          }
          await db.query(
            `UPDATE semantic_analytics_receipts
             SET raw_status='deleted',raw_deleted_at=now(),raw_delete_retry_at=NULL
             WHERE project_id=$1::uuid AND event_id=$2::uuid AND raw_object_key=$3
               AND raw_status='deleting'`,
            [candidate.project_id, candidate.event_id, candidate.raw_object_key]
          );
          deleted += 1;
        }
      }
      input.onProgress?.({
        failed_deletes: failedDeletes,
        oldest_selected_due_at: oldestSelectedDueAt
      });
      return { deleted, hasMore: deferred || candidates.rows.length === limit };
    },
    async pruneExpired(input) {
      const now = z.string().datetime({ precision: 3 }).parse(input.now);
      const limit = z.number().int().min(1).max(100).parse(input.limit);
      const result = await db.query<{ event_id: string }>(
        `WITH expired AS (
           SELECT project_id,event_id FROM semantic_analytics_receipts
           WHERE expires_at<=$1::timestamptz AND raw_status='deleted'
           ORDER BY expires_at,project_id,event_id
           FOR UPDATE SKIP LOCKED LIMIT $2
         )
         DELETE FROM semantic_analytics_receipts receipt USING expired
         WHERE receipt.project_id=expired.project_id AND receipt.event_id=expired.event_id
         RETURNING receipt.event_id`,
        [now, limit]
      );
      return { pruned: result.rows.length, hasMore: result.rows.length === limit };
    }
  };
}
