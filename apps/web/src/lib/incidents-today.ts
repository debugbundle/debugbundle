import type { IncidentRecord } from "./api.js";

export type LocalDayWindow = {
  startsAtIso: string;
  startsAtMs: number;
  endsAtMs: number;
};

export function getLocalDayWindow(now = new Date(), timeZone?: string): LocalDayWindow {
  if (timeZone === undefined || timeZone.length === 0) {
    const startsAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endsAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

    return {
      startsAtIso: startsAt.toISOString(),
      startsAtMs: startsAt.getTime(),
      endsAtMs: endsAt.getTime()
    };
  }

  const local = getTimeZoneParts(now, timeZone);
  const nextLocalDay = new Date(Date.UTC(local.year, local.month - 1, local.day + 1, 0, 0, 0, 0));
  const startsAt = zonedLocalMidnightToUtc(local.year, local.month, local.day, timeZone);
  const endsAt = zonedLocalMidnightToUtc(
    nextLocalDay.getUTCFullYear(),
    nextLocalDay.getUTCMonth() + 1,
    nextLocalDay.getUTCDate(),
    timeZone
  );

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

function getTimeZoneParts(now: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const read = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "0";
  return {
    year: Number.parseInt(read("year"), 10),
    month: Number.parseInt(read("month"), 10),
    day: Number.parseInt(read("day"), 10)
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "0";
  const zonedAsUtc = Date.UTC(
    Number.parseInt(read("year"), 10),
    Number.parseInt(read("month"), 10) - 1,
    Number.parseInt(read("day"), 10),
    Number.parseInt(read("hour"), 10),
    Number.parseInt(read("minute"), 10),
    Number.parseInt(read("second"), 10)
  );

  return zonedAsUtc - date.getTime();
}

function zonedLocalMidnightToUtc(year: number, month: number, day: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const offset = getTimeZoneOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offset);
}
