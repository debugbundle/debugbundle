import { randomUUID } from "node:crypto";
import { PROJECT_OBJECT_PREFIXES } from "./helpers.js";
import type { ObjectStoreBulkDeleter, ObjectStoreLister } from "./object-store-types.js";
import type { Queryable } from "./types.js";

const PAGE_SIZE = 100;

interface ClaimedTask extends Record<string, unknown> {
  project_id: string;
  prefix_index: number;
  cursor_key: string | null;
  scan_round: number;
  created_at: Date;
  expires_at: Date;
}

export type ProjectObjectErasureResult =
  | { processed: false }
  | { processed: true; deleted: number; failed: boolean; verified: boolean };

/** A bounded S3 page is owned by a durable deletion task that survives project-row removal. */
export function createProjectObjectErasureService(
  db: Queryable,
  objectStore: ObjectStoreLister & ObjectStoreBulkDeleter
): { processNext(): Promise<ProjectObjectErasureResult> } {
  async function updateClaim(
    projectId: string,
    token: string,
    sql: string,
    extra: unknown[] = []
  ): Promise<void> {
    const updated = await db.query(
      `${sql} WHERE project_id=$1::uuid AND lease_token=$2::uuid RETURNING project_id`,
      [projectId, token, ...extra]
    );
    if (updated.rows.length !== 1) throw new Error("project_object_erasure_lease_lost");
  }

  async function failClaim(
    projectId: string,
    token: string,
    reason: "listing_failed" | "delete_failed" | "response_invalid",
    confirmedDeleted = 0
  ): Promise<ProjectObjectErasureResult> {
    await updateClaim(
      projectId,
      token,
      `UPDATE project_object_erasure_tasks
       SET lease_token=NULL,lease_expires_at=NULL,
           next_attempt_at=clock_timestamp()+interval '5 minutes',
           failure_count=failure_count+1,last_error_code=$3,
           verified_at=NULL,updated_at=clock_timestamp()`,
      [reason]
    );
    return { processed: true, deleted: confirmedDeleted, failed: true, verified: false };
  }

  return {
    async processNext() {
      const token = randomUUID();
      const claimed = await db.query<ClaimedTask>(
        `WITH due AS (
           SELECT project_id FROM project_object_erasure_tasks
           WHERE next_attempt_at<=clock_timestamp()
             AND (lease_expires_at IS NULL OR lease_expires_at<=clock_timestamp())
           ORDER BY next_attempt_at,created_at,project_id
           FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE project_object_erasure_tasks task
         SET lease_token=$1::uuid,lease_expires_at=clock_timestamp()+interval '5 minutes',
             updated_at=clock_timestamp()
         FROM due WHERE task.project_id=due.project_id
         RETURNING task.project_id::text,task.prefix_index,task.cursor_key,
                   task.scan_round,task.created_at,task.expires_at`,
        [token]
      );
      const task = claimed.rows[0];
      if (task === undefined) return { processed: false };
      const prefixName = PROJECT_OBJECT_PREFIXES[task.prefix_index];
      if (prefixName === undefined) {
        if (task.scan_round > 0 && task.expires_at.getTime() <= Date.now()) {
          await updateClaim(task.project_id, token, "DELETE FROM project_object_erasure_tasks");
          return { processed: true, deleted: 0, failed: false, verified: true };
        }
        await updateClaim(
          task.project_id,
          token,
          `UPDATE project_object_erasure_tasks
           SET prefix_index=0,cursor_key=NULL,scan_round=LEAST(scan_round+1,2),
               lease_token=NULL,lease_expires_at=NULL,
               next_attempt_at=CASE WHEN scan_round=0
                 THEN GREATEST(created_at+interval '2 hours',clock_timestamp())
                 ELSE clock_timestamp()+interval '1 day' END,
               verified_at=CASE WHEN scan_round=0 THEN NULL ELSE clock_timestamp() END,
               last_error_code=NULL,updated_at=clock_timestamp()`
        );
        return {
          processed: true,
          deleted: 0,
          failed: false,
          verified: task.scan_round > 0
        };
      }

      const prefix = `${prefixName}/${task.project_id}/`;
      let page: Awaited<ReturnType<ObjectStoreLister["listObjects"]>>;
      try {
        page = await objectStore.listObjects({
          prefix,
          ...(task.cursor_key === null ? {} : { startAfter: task.cursor_key }),
          maxKeys: PAGE_SIZE,
          signal: AbortSignal.timeout(10_000)
        });
      } catch {
        return failClaim(task.project_id, token, "listing_failed");
      }
      let prior = task.cursor_key ?? prefix;
      if (page.objects.length > PAGE_SIZE || (page.hasMore && page.objects.length === 0))
        return failClaim(task.project_id, token, "response_invalid");
      for (const object of page.objects) {
        if (!object.key.startsWith(prefix) || object.key <= prior)
          return failClaim(task.project_id, token, "response_invalid");
        prior = object.key;
      }
      const keys = page.objects.map((object) => object.key);
      if (keys.length > 0) {
        let result: Awaited<ReturnType<ObjectStoreBulkDeleter["deleteObjects"]>>;
        try {
          result = await objectStore.deleteObjects({
            keys,
            signal: AbortSignal.timeout(10_000)
          });
        } catch {
          return failClaim(task.project_id, token, "delete_failed");
        }
        const outcomes = [...result.deleted, ...result.failed];
        if (
          outcomes.length !== keys.length ||
          new Set(outcomes).size !== keys.length ||
          outcomes.some((key) => !keys.includes(key))
        )
          return failClaim(task.project_id, token, "response_invalid");
        if (result.failed.length > 0)
          return failClaim(task.project_id, token, "delete_failed", result.deleted.length);
      }
      await updateClaim(
        task.project_id,
        token,
        `UPDATE project_object_erasure_tasks
         SET prefix_index=$3,cursor_key=$4,
             lease_token=NULL,lease_expires_at=NULL,next_attempt_at=clock_timestamp(),
             verified_at=CASE WHEN $5::boolean THEN NULL ELSE verified_at END,
             last_error_code=NULL,updated_at=clock_timestamp()`,
        [task.prefix_index + (page.hasMore ? 0 : 1), page.hasMore ? prior : null, keys.length > 0]
      );
      return {
        processed: true,
        deleted: keys.length,
        failed: false,
        verified: false
      };
    }
  };
}
