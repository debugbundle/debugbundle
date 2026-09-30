import { z } from "zod";
import type { Queryable } from "./types.js";

const Input = z
  .object({
    now: z.string().datetime({ precision: 3 }),
    limit: z.number().int().min(1).max(100)
  })
  .strict();

export interface AnalyticsIdentityContextRetention {
  pruneExpired(input: z.infer<typeof Input>): Promise<{ pruned: number; hasMore: boolean }>;
  pruneExpiredAssociations(
    input: z.infer<typeof Input>
  ): Promise<{ pruned: number; hasMore: boolean }>;
}

/** Expired handles have no authority; skip a row still locked by a concurrent lifecycle call. */
export function createAnalyticsIdentityContextRetention(
  db: Queryable
): AnalyticsIdentityContextRetention {
  return {
    async pruneExpired(input) {
      const { now, limit } = Input.parse(input);
      const deleted = await db.query<{ context_id: string }>(
        `WITH due AS (
           SELECT context_id FROM analytics_project_identity_contexts
           WHERE expires_at<=$1::timestamptz
           ORDER BY expires_at,context_id LIMIT $2 FOR UPDATE SKIP LOCKED
         )
         DELETE FROM analytics_project_identity_contexts target
         USING due WHERE target.context_id=due.context_id
         RETURNING target.context_id`,
        [now, limit]
      );
      return { pruned: deleted.rows.length, hasMore: deleted.rows.length >= limit };
    },
    async pruneExpiredAssociations(input) {
      const { now, limit } = Input.parse(input);
      const deleted = await db.query<{ context_id: string }>(
        `WITH due AS (
           SELECT association.project_id,association.context_id
           FROM analytics_project_identity_associations association
           WHERE association.expires_at<=$1::timestamptz
             AND NOT EXISTS (
               SELECT 1 FROM analytics_project_subject_erasures erasure
               WHERE erasure.project_id=association.project_id
                 AND erasure.namespace_revision=association.namespace_revision
                 AND erasure.status='pending'
                 AND ((erasure.subject_kind='user'
                     AND erasure.subject_ref=association.user_id_hash)
                   OR (erasure.subject_kind='account'
                     AND erasure.subject_ref=association.account_id_hash))
             )
           ORDER BY expires_at,project_id,context_id LIMIT $2 FOR UPDATE SKIP LOCKED
         )
         DELETE FROM analytics_project_identity_associations target
         USING due WHERE target.project_id=due.project_id AND target.context_id=due.context_id
         RETURNING target.context_id`,
        [now, limit]
      );
      return { pruned: deleted.rows.length, hasMore: deleted.rows.length >= limit };
    }
  };
}
