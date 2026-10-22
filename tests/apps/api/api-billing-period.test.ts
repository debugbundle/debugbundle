import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  resolveStripeSubscriptionBillingPeriod,
  readSubscriptionInvoiceLinePeriod,
  readUnixTimestampField
} from "../../../apps/api/src/billing-management.js";

describe("Stripe subscription billing period", () => {
  it("bounds malformed and partial legacy evidence without throwing", () => {
    for (const input of [
      null,
      "invoice",
      {},
      { lines: null },
      { lines: { data: "invalid" } },
      { lines: { data: [null, {}, { period: { start: 10, end: 10 } }] } }
    ]) {
      expect(readSubscriptionInvoiceLinePeriod(input)).toEqual({ start: null, end: null });
    }
    expect(
      readSubscriptionInvoiceLinePeriod({
        lines: {
          data: [
            { proration: true, period: { start: 1, end: 2 } },
            {
              parent: { subscription_item_details: { proration: true } },
              period: { start: 2, end: 3 }
            },
            { period: { start: 3, end: 4 } }
          ]
        }
      })
    ).toEqual({ start: 3, end: 4 });
    expect(readUnixTimestampField(null, "start")).toBeNull();
    expect(readUnixTimestampField({ start: Infinity }, "start")).toBeNull();
    expect(
      resolveStripeSubscriptionBillingPeriod({
        latest_invoice: { period_end: 1795279590 }
      } as unknown as Stripe.Subscription)
    ).toEqual({ starts_at: null, ends_at: new Date(1795279590000).toISOString() });
  });
  const start = 1792601190;
  const end = 1795279590;
  const period = {
    starts_at: new Date(start * 1000).toISOString(),
    ends_at: new Date(end * 1000).toISOString()
  };
  it("uses Clover subscription item periods even when the creation invoice has a zero-length period", () => {
    const subscription = {
      items: { data: [{ current_period_start: start, current_period_end: end }] },
      latest_invoice: { period_start: start, period_end: start }
    } as unknown as Stripe.Subscription;
    expect(resolveStripeSubscriptionBillingPeriod(subscription)).toEqual(period);
  });
  it("does not let an old invoice or a proration line replace the live subscription period", () => {
    const subscription = {
      items: { data: [{ current_period_start: start, current_period_end: end }] },
      latest_invoice: { lines: { data: [{ period: { start: start - 86400, end: start } }] } }
    } as unknown as Stripe.Subscription;
    expect(resolveStripeSubscriptionBillingPeriod(subscription)).toEqual(period);
  });
  it("retains pre-Clover top-level periods ahead of invoice fallbacks", () => {
    const subscription = {
      current_period_start: start,
      current_period_end: end,
      latest_invoice: { period_start: start, period_end: start }
    } as unknown as Stripe.Subscription;
    expect(resolveStripeSubscriptionBillingPeriod(subscription)).toEqual(period);
  });
  it("falls back to valid invoice line periods for legacy records", () => {
    const subscription = {
      latest_invoice: {
        period_start: start,
        period_end: start,
        lines: { data: [{ period: { start, end } }] }
      }
    } as unknown as Stripe.Subscription;
    expect(resolveStripeSubscriptionBillingPeriod(subscription)).toEqual(period);
  });
  it("does not throw or invent a billing window from invalid provider timestamps", () => {
    const subscription = {
      items: { data: [{ current_period_start: Infinity, current_period_end: -1 }] },
      latest_invoice: { period_start: start, period_end: start }
    } as unknown as Stripe.Subscription;
    expect(resolveStripeSubscriptionBillingPeriod(subscription)).toEqual({
      starts_at: null,
      ends_at: null
    });
  });
});
