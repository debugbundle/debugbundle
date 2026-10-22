import type Stripe from "stripe";

export function readUnixTimestampField(source: unknown, key: string): number | null {
  if (typeof source !== "object" || source === null) return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 8_640_000_000_000
    ? value
    : null;
}

export function readSubscriptionInvoiceLinePeriod(source: unknown): {
  start: number | null;
  end: number | null;
} {
  if (typeof source !== "object" || source === null) return { start: null, end: null };
  const lines = (source as { lines?: { data?: unknown } }).lines?.data;
  if (!Array.isArray(lines)) return { start: null, end: null };
  for (const line of lines as Array<{
    period?: unknown;
    proration?: boolean;
    parent?: { subscription_item_details?: { proration?: boolean } };
  }>) {
    if (line?.proration === true || line?.parent?.subscription_item_details?.proration === true)
      continue;
    const start = readUnixTimestampField(line?.period, "start");
    const end = readUnixTimestampField(line?.period, "end");
    if ((start !== null || end !== null) && (start === null || end === null || end > start))
      return { start, end };
  }
  return { start: null, end: null };
}

export function resolveStripeSubscriptionBillingPeriod(subscription: Stripe.Subscription): {
  starts_at: string | null;
  ends_at: string | null;
} {
  // Clover stores current periods on subscription items. Never let an old or
  // zero-length initial invoice override the authoritative live subscription.
  const invoice =
    typeof subscription.latest_invoice === "object" ? subscription.latest_invoice : null;
  const candidates = [
    ...(subscription.items?.data ?? []).map((item) => ({
      start: readUnixTimestampField(item, "current_period_start"),
      end: readUnixTimestampField(item, "current_period_end")
    })),
    {
      start: readUnixTimestampField(subscription, "current_period_start"),
      end: readUnixTimestampField(subscription, "current_period_end")
    },
    readSubscriptionInvoiceLinePeriod(invoice),
    {
      start: readUnixTimestampField(invoice, "period_start"),
      end: readUnixTimestampField(invoice, "period_end")
    }
  ];
  const period =
    candidates.find((x) => x.start !== null && x.end !== null && x.end > x.start) ??
    candidates.find((x) => (x.start === null) !== (x.end === null));
  return {
    starts_at:
      period?.start === null || period?.start === undefined
        ? null
        : new Date(period.start * 1000).toISOString(),
    ends_at:
      period?.end === null || period?.end === undefined
        ? null
        : new Date(period.end * 1000).toISOString()
  };
}
