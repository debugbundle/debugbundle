import type { Queryable } from "./types.js";

/** Moving admitted items never creates another allowance charge at the destination. */
export async function preserveDailyNotificationUsage(
  db: Queryable,
  targetBatchId: string,
  sourceBatchIds: string[],
  incidentId: string | null = null
): Promise<void> {
  await db.query(
    `INSERT INTO notification_daily_allowance_usage(batch_id, project_id, billable)
    SELECT $1, project_id, false FROM notification_daily_items
    WHERE batch_id = ANY($2::uuid[]) AND ($3::uuid IS NULL OR incident_id = $3)
    GROUP BY project_id ON CONFLICT(batch_id, project_id) DO NOTHING`,
    [targetBatchId, sourceBatchIds, incidentId]
  );
}
