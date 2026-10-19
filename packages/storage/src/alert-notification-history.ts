/** All delivery modes share cooldown history; callers bind the rule/key parameters. */
export function alertNotificationHistorySql(
  alertId: `$${number}`,
  notificationKey: `$${number}`
): string {
  return `SELECT COALESCE(delivered_at, created_at) AS notified_at FROM alert_deliveries
    WHERE alert_id = ${alertId}::uuid AND notification_key = ${notificationKey}
    AND status IN ('pending', 'delivered')
    UNION ALL
    SELECT CASE WHEN digests.status = 'delivered' THEN COALESCE(digests.delivered_at, items.created_at)
      ELSE items.created_at END AS notified_at
    FROM alert_email_digest_items items JOIN alert_email_digests digests ON digests.id = items.digest_id
    WHERE items.alert_id = ${alertId}::uuid AND items.notification_key = ${notificationKey}
    AND digests.status IN ('pending', 'delivered')
    UNION ALL
    SELECT CASE WHEN batches.status = 'delivered' THEN COALESCE(batches.delivered_at, items.created_at)
      ELSE items.created_at END AS notified_at
    FROM notification_daily_items items JOIN notification_daily_batches batches ON batches.id = items.batch_id
    WHERE items.alert_id = ${alertId}::uuid AND items.notification_key = ${notificationKey}
    AND batches.status IN ('pending', 'delivered')`;
}
