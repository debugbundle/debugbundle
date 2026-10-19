import type { NotificationDailyStore, DailyNotificationItem } from "./notification-daily-store.js";
import type { NotificationPreferencesStore } from "./notification-preferences-store.js";

export interface DailyNotificationDelivery {
  recipient: string;
  items: DailyNotificationItem[];
  total_incident_count: number;
}

/** One fenced durable batch per pass. Payloads are rebuilt from current unresolved incidents. */
export async function deliverNextDailyNotification(input: {
  store: NotificationDailyStore;
  preferences: Pick<NotificationPreferencesStore, "decide">;
  deliver: (delivery: DailyNotificationDelivery) => Promise<void>;
  now?: Date;
}): Promise<boolean> {
  const batch = await input.store.claim(input.now);
  if (batch === null) return false;
  const now = input.now ?? new Date();
  const future = Date.parse(batch.due_at) > now.getTime();
  try {
    const revision = await input.store.policyRevision(batch);
    const items: DailyNotificationItem[] = [];
    let total = 0;
    let cursor: string | null = null;
    const rank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    for (;;) {
      if (!(await input.store.renew(batch, input.now))) return true;
      const page = await input.store.listItems(batch, cursor);
      for (const item of page) {
        const decision = await input.preferences.decide({
          project_id: item.project_id,
          channel: "email",
          recipient: batch.recipient,
          incident_id: item.incident_id,
          occurred_at: item.occurred_at,
          ...(input.now === undefined ? {} : { now: input.now })
        });
        if (decision.mode === "off") continue;
        if (decision.mode === "immediate" && future) {
          await input.store.reschedule(batch, item.incident_id, decision.daily, now, now, now);
          continue;
        }
        if (
          decision.mode === "daily" &&
          (decision.daily.time !== batch.schedule_time ||
            decision.daily.timezone !== batch.schedule_timezone)
        ) {
          await input.store.reschedule(
            batch,
            item.incident_id,
            decision.daily,
            batch.next_attempt_at === undefined ? input.now : new Date(batch.next_attempt_at),
            undefined,
            now
          );
          continue;
        }
        if (future) continue;
        total += 1;
        items.push(item);
        items.sort(
          (a, b) =>
            (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0) ||
            a.incident_id.localeCompare(b.incident_id)
        );
        if (items.length > 25) items.pop();
      }
      const last = page.at(-1);
      if (page.length < 250 || last === undefined) break;
      cursor = last.incident_id;
    }
    if (!(await input.store.renew(batch, input.now))) return true;
    if (revision !== (await input.store.policyRevision(batch))) {
      await input.store.defer(batch, input.now);
      return true;
    }
    if (future) {
      // Settings updates can wake a batch for re-evaluation before it is due. Keep
      // its window open for unchanged projects and concurrent new incident inserts.
      await input.store.defer(batch, now, new Date(batch.due_at));
      return true;
    }
    if (items.length > 0) {
      // Group the bounded preview by project; retain the exact eligible incident count.
      items.sort(
        (a, b) =>
          a.project_name.localeCompare(b.project_name) ||
          (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0)
      );
      await input.deliver({ recipient: batch.recipient, items, total_incident_count: total });
    }
    await input.store.complete(batch, items.length > 0);
  } catch {
    await input.store.fail(batch, input.now);
  }
  return true;
}
