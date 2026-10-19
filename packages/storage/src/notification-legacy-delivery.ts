import type { AlertEmailDigestItemRecord } from "./alert-types.js";
import type { NotificationPreferencesStore } from "./notification-preferences-store.js";
import type { NotificationDailyStore } from "./notification-daily-store.js";

/** Recheck every retained member, not just the bounded email preview. */
export async function filterNotificationDigest(input: {
  now?: Date;
  digestId: string;
  recipient: string;
  preferences: Pick<NotificationPreferencesStore, "decide">;
  daily: Pick<NotificationDailyStore, "enqueue" | "listLegacyDigestItems">;
}): Promise<{ items: AlertEmailDigestItemRecord[]; total: number }> {
  const items: AlertEmailDigestItemRecord[] = [];
  const rank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  let cursor: string | null = null,
    total = 0;
  for (;;) {
    const page = await input.daily.listLegacyDigestItems(input.digestId, cursor);
    for (const item of page) {
      const occurred =
        typeof item.payload["occurred_at"] === "string"
          ? item.payload["occurred_at"]
          : item.created_at;
      const policy = await input.preferences.decide({
        project_id: item.project_id,
        channel: "email",
        recipient: input.recipient,
        incident_id: item.incident_id,
        occurred_at: occurred,
        ...(input.now === undefined ? {} : { now: input.now })
      });
      if (policy.mode === "immediate") {
        total += 1;
        items.push(item);
        items.sort(
          (a, b) =>
            (rank[String(b.payload["severity"])] ?? 0) -
              (rank[String(a.payload["severity"])] ?? 0) ||
            a.incident_id.localeCompare(b.incident_id)
        );
        if (items.length > 25) items.pop();
      } else if (
        policy.mode === "daily" &&
        item.condition_types?.some((condition) =>
          ["new_incident", "incident_regressed", "severity_threshold"].includes(condition)
        )
      ) {
        for (const alertId of item.alert_ids)
          await input.daily.enqueue({
            alert_id: alertId,
            incident_id: item.incident_id,
            project_id: item.project_id,
            recipient: input.recipient,
            occurred_at: occurred,
            ...(input.now === undefined ? {} : { now: input.now }),
            billable: false,
            notification_key: item.notification_key,
            schedule: policy.daily
          });
      }
    }
    const last = page.at(-1);
    if (page.length < 250 || last === undefined) break;
    cursor = last.incident_id;
  }
  return { items, total };
}
