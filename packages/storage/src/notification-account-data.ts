import type { Queryable } from "./types.js";

/** Owner exports include only their personal policies and this account's shared policies/items. */
export async function exportNotificationAccountData(
  db: Queryable,
  input: { user_id: string; organization_id: string; projectIds: string[] }
): Promise<Record<string, unknown>> {
  const preferences = await db.query(
    `SELECT * FROM notification_preferences
    WHERE user_id = $1 OR organization_id = $2 ORDER BY id`,
    [input.user_id, input.organization_id]
  );
  const items = await db.query(
    "SELECT * FROM notification_daily_items WHERE project_id = ANY($1::uuid[]) ORDER BY id",
    [input.projectIds]
  );
  const batches = await db.query(
    `SELECT b.* FROM notification_daily_batches b WHERE EXISTS(
    SELECT 1 FROM notification_daily_items d WHERE d.batch_id = b.id AND d.project_id = ANY($1::uuid[])) ORDER BY b.id`,
    [input.projectIds]
  );
  const allowanceUsage = await db.query(
    "SELECT * FROM notification_daily_allowance_usage WHERE project_id = ANY($1::uuid[]) ORDER BY batch_id, project_id",
    [input.projectIds]
  );
  return {
    notification_preferences: preferences.rows,
    notification_daily_items: items.rows,
    notification_daily_batches: batches.rows,
    notification_daily_allowance_usage: allowanceUsage.rows
  };
}

export async function deleteNotificationAccountData(db: Queryable, userId: string): Promise<void> {
  // Cancel mail to the deleted user and remove empty rows left by cascading project deletion.
  await db.query(
    `DELETE FROM notification_daily_batches b WHERE
    lower(recipient) = (SELECT lower(email) FROM users WHERE id = $1)
    OR NOT EXISTS(SELECT 1 FROM notification_daily_items d WHERE d.batch_id = b.id)`,
    [userId]
  );
}
