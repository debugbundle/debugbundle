import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";
/** Maintenance continues with generation disabled. Exact indexed batches remove
 * derived evidence; paid/uncertain receipts keep their independent accounting. */
export async function maintainImprovementReviews(db: Queryable): Promise<boolean> {
  return runInTransaction(db, async (tx) => {
    const removed = await tx.query(
      `WITH due AS(SELECT id FROM improvement_reviews WHERE expires_at<=clock_timestamp() ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT 100)
      DELETE FROM improvement_reviews WHERE id IN(SELECT id FROM due) RETURNING id`,
      []
    );
    const stopped = await tx.query(
      `WITH due AS(SELECT r.id FROM improvement_reviews r JOIN worker_jobs j ON j.id=r.processing_job_id
      WHERE r.status IN ('queued','processing') AND (j.expires_at<=clock_timestamp() OR (j.status='failed' AND j.attempts>=8))
      ORDER BY r.created_at,r.id FOR UPDATE OF r SKIP LOCKED LIMIT 100), released AS(
      UPDATE improvement_review_usage u SET generations=u.generations-t.generations,held_nano_usd=u.held_nano_usd-t.held
      FROM(SELECT organization_id,ai_window_starts_at,count(*)::int AS generations,sum(ai_reserved_nano_usd) AS held FROM improvement_reviews
        WHERE id IN(SELECT id FROM due) AND paid_attempts=0 AND generation_counted GROUP BY organization_id,ai_window_starts_at) t
      WHERE u.organization_id=t.organization_id AND u.starts_at=t.ai_window_starts_at RETURNING u.organization_id)
      UPDATE improvement_reviews SET status='failed',reason='processing_failed',ai_reserved_nano_usd=CASE WHEN paid_attempts=0 THEN 0 ELSE ai_reserved_nano_usd END,
        generation_counted=CASE WHEN paid_attempts=0 THEN false ELSE generation_counted END WHERE id IN(SELECT id FROM due) RETURNING id`,
      []
    );
    await tx.query(
      `WITH due AS(SELECT a.id FROM improvement_review_attempts a LEFT JOIN improvement_reviews r ON r.id=a.review_id
       WHERE a.validated_guidance IS NOT NULL AND (r.id IS NULL OR r.status NOT IN ('queued','processing'))
       ORDER BY a.created_at,a.id FOR UPDATE OF a SKIP LOCKED LIMIT 100)
       UPDATE improvement_review_attempts SET validated_guidance=NULL WHERE id IN(SELECT id FROM due)`,
      []
    );
    await tx.query(
      `WITH due AS(SELECT a.id FROM improvement_review_attempts a LEFT JOIN improvement_reviews r ON r.id=a.review_id
       WHERE a.state='sending' AND a.created_at<clock_timestamp()-interval '10 minutes' AND (r.id IS NULL OR r.status NOT IN ('queued','processing'))
       ORDER BY a.created_at,a.id FOR UPDATE OF a SKIP LOCKED LIMIT 100)
       UPDATE improvement_review_attempts SET state='uncertain',diagnostic_code=COALESCE(diagnostic_code,'review_provider_outcome_unknown') WHERE id IN(SELECT id FROM due)`,
      []
    );
    return removed.rows.length > 0 || stopped.rows.length > 0;
  });
}
