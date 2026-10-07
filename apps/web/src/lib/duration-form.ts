export const DURATION_UNITS = { seconds: 1, minutes: 60, hours: 3600, days: 86400 } as const;
export interface DurationDraft {
  amount: string;
  unit: keyof typeof DURATION_UNITS;
}

/** Choose an exact unit without rounding existing API seconds. */
export function durationFromSeconds(seconds: number): DurationDraft {
  for (const unit of ["days", "hours", "minutes"] as const) {
    if (seconds > 0 && seconds % DURATION_UNITS[unit] === 0)
      return { amount: String(seconds / DURATION_UNITS[unit]), unit };
  }
  return { amount: String(seconds), unit: "seconds" };
}
export function durationToSeconds(draft: DurationDraft, maximum: number): number | null {
  if (!/^\d+(?:\.\d+)?$/.test(draft.amount)) return null;
  const seconds = Number(draft.amount) * DURATION_UNITS[draft.unit];
  return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= maximum ? seconds : null;
}
