/** Native datetime-local fields show the device timezone; API timestamps remain UTC. */
export function localDateTimeInput(timestamp: string | null | undefined): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number): string => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localDateTimeUtc(value: string, original?: string | null): string | null {
  if (!value) return null;
  // An untouched minute-precision control must preserve stored seconds/milliseconds.
  if (original && localDateTimeInput(original) === value) return original;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value);
  // Reject normalization of invalid calendar values and nonexistent DST times.
  return Number.isFinite(date.getTime()) && localDateTimeInput(date.toISOString()) === value
    ? date.toISOString()
    : null;
}
