import type { NotificationSchedule } from "./notification-preferences.js";

/** Resolve wall-clock schedules explicitly: first repeated time, first valid minute after a DST gap. */
export function nextDailyNotificationAt(schedule: NotificationSchedule, after: Date): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: schedule.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  function localMillis(at: number): number {
    const parts = Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
    return Date.UTC(
      Number(parts["year"]),
      Number(parts["month"]) - 1,
      Number(parts["day"]),
      Number(parts["hour"]),
      Number(parts["minute"])
    );
  }
  const local = new Date(localMillis(after.getTime()));
  const [hour, minute] = schedule.time.split(":").map(Number);
  for (let day = 0; day < 4; day += 1) {
    const nominal = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + day,
      hour,
      minute
    );
    const offsets = new Set(
      [-86400000, 0, 86400000].map((delta) => localMillis(nominal + delta) - (nominal + delta))
    );
    for (let gap = 0; gap <= 180; gap += 1) {
      const wall = nominal + gap * 60000;
      const candidates = [...offsets]
        .map((offset) => wall - offset)
        .filter((at) => localMillis(at) === wall);
      if (candidates.length === 0) continue;
      const first = Math.min(...candidates);
      if (first > after.getTime()) return new Date(first).toISOString();
      break;
    }
  }
  throw new Error("notification_schedule_unresolvable");
}
