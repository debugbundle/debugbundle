import { z } from "zod";
import type { Queryable } from "./types.js";

const Input = z
  .object({
    now: z.string().datetime({ precision: 3 }),
    limit: z.number().int().min(1).max(100)
  })
  .strict();

/** The cutoff outlives every supported 90-day report window. Pending tasks are never pruned. */
export function createAnalyticsSubjectErasureRetention(db: Queryable): {
  pruneCompleted(input: z.infer<typeof Input>): Promise<{ pruned: number; hasMore: boolean }>;
} {
  return {
    async pruneCompleted(input) {
      const { now, limit } = Input.parse(input);
      const result = await db.query<{ task_id: string }>(
        `WITH expired AS (
           SELECT task_id FROM analytics_project_subject_erasures
           WHERE status='complete' AND cutoff_at<=$1::timestamptz-interval '90 days'
           ORDER BY cutoff_at,task_id LIMIT $2 FOR UPDATE SKIP LOCKED
         )
         DELETE FROM analytics_project_subject_erasures task
         USING expired WHERE task.task_id=expired.task_id
         RETURNING task.task_id`,
        [now, limit]
      );
      return { pruned: result.rows.length, hasMore: result.rows.length >= limit };
    }
  };
}
