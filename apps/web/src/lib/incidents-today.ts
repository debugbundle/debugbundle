import type { IncidentRecord } from "./api.js";

export type LocalDayWindow = {
  startsAtIso: string;
  startsAtMs: number;
  endsAtMs: number;
};

export function getLocalDayWindow(now = new Date()): LocalDayWindow {
  const startsAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endsAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

  return {
    startsAtIso: startsAt.toISOString(),
    startsAtMs: startsAt.getTime(),
    endsAtMs: endsAt.getTime()
  };
}

export function isIncidentAttentionToday(incident: IncidentRecord, window: LocalDayWindow): boolean {
  return isTimestampInWindow(incident.first_seen_at, window) || isTimestampInWindow(incident.regressed_at, window);
}

function isTimestampInWindow(value: string | null, window: LocalDayWindow): boolean {
  if (value === null) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= window.startsAtMs && timestamp < window.endsAtMs;
}
