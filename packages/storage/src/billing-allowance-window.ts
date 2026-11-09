import type { BillingInterval, TierName } from "../../shared-types/src/index.js";

export interface BillingUsageWindow {
  starts_at: string;
  ends_at: string;
}

function calendarWindow(now: Date): BillingUsageWindow {
  return {
    starts_at: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    ends_at: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
  };
}

/** Always compute from the original day, so February cannot move a 31st anchor. */
function anchoredMonth(anchor: Date, offset: number): Date {
  const month = anchor.getUTCMonth() + offset;
  const lastDay = new Date(Date.UTC(anchor.getUTCFullYear(), month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      anchor.getUTCFullYear(),
      month,
      Math.min(anchor.getUTCDate(), lastDay),
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds()
    )
  );
}

export function resolveBillingUsageWindow(input: {
  now: Date;
  plan: TierName;
  billing_interval?: BillingInterval | null;
  billing_period_starts_at?: string | null;
  billing_period_ends_at?: string | null;
  billing_allowance_anchor_at?: string | null;
}): BillingUsageWindow {
  const starts = Date.parse(input.billing_period_starts_at ?? "");
  const ends = Date.parse(input.billing_period_ends_at ?? "");
  if (
    input.plan === "free" ||
    !Number.isFinite(starts) ||
    !Number.isFinite(ends) ||
    starts >= ends
  ) {
    return calendarWindow(input.now);
  }
  if (input.billing_interval !== "year") {
    // Retain exact persisted legacy monthly strings and their counter identities.
    return { starts_at: input.billing_period_starts_at!, ends_at: input.billing_period_ends_at! };
  }
  const parsedAnchor = Date.parse(input.billing_allowance_anchor_at ?? "");
  const anchor = new Date(
    Number.isFinite(parsedAnchor) && parsedAnchor <= starts ? parsedAnchor : starts
  );
  // Never create a new paid term from a clock alone while renewal is unreconciled.
  const point = new Date(Math.max(starts, Math.min(input.now.getTime(), ends - 1)));
  let offset =
    (point.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    point.getUTCMonth() -
    anchor.getUTCMonth();
  if (anchoredMonth(anchor, offset).getTime() > point.getTime()) offset -= 1;
  const windowStart = Math.max(starts, anchoredMonth(anchor, offset).getTime());
  const windowEnd = Math.min(ends, anchoredMonth(anchor, offset + 1).getTime());
  return {
    starts_at: new Date(windowStart).toISOString(),
    ends_at: new Date(windowEnd).toISOString()
  };
}
