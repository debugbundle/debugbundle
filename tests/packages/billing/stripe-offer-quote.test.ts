import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { BillingOfferSelection } from "../../../packages/shared-types/src/index.js";
import type {
  StripeBillingProvider,
  StripePriceMapping
} from "../../../packages/billing/src/stripe-subscription.js";
import {
  createStripeOfferQuote,
  stripeOfferChangeAction,
  verifyStripeOfferQuote
} from "../../../packages/billing/src/stripe-offer-quote.js";

function fixture(interval: "month" | "year" = "year") {
  const now = Date.parse("2026-02-10T12:00:00Z");
  const priceMap = new Map<string, StripePriceMapping>();
  for (const plan of ["solo", "team", "business"] as const)
    for (const term of ["month", "year"] as const)
      for (const type of ["plan", "extra_capacity"] as const)
        priceMap.set(`${plan}_${term}_${type}`, { plan, interval: term, type, currency: "usd" });
  const start = Date.parse("2026-01-31T00:00:00Z") / 1000;
  const end =
    Date.parse(interval === "year" ? "2027-01-31T00:00:00Z" : "2026-02-28T00:00:00Z") / 1000;
  const subscription = {
    id: "sub_test",
    customer: "cus_test",
    items: {
      data: [
        {
          id: "base",
          price: {
            id: `team_${interval}_plan`,
            currency: "usd",
            recurring: { interval, interval_count: 1 }
          },
          quantity: 1,
          current_period_start: start,
          current_period_end: end
        },
        {
          id: "extra",
          price: {
            id: `team_${interval}_extra_capacity`,
            currency: "usd",
            recurring: { interval, interval_count: 1 }
          },
          quantity: 99,
          current_period_start: start,
          current_period_end: end
        }
      ]
    }
  } as Stripe.Subscription;
  const createPreview = vi.fn(async (input: Stripe.InvoiceCreatePreviewParams) =>
    input.preview_mode
      ? { currency: "usd", total: 355010, total_taxes: [{ amount: 10010 }] }
      : { currency: "usd", amount_due: 12000, total_taxes: [{ amount: 500 }] }
  );
  const provider = {
    client: { invoices: { createPreview } },
    webhookSecret: "test_secret",
    priceMap
  } as unknown as StripeBillingProvider;
  const quote = (target: BillingOfferSelection) =>
    createStripeOfferQuote({
      provider,
      subscription,
      organizationId: "org",
      actorUserId: "owner",
      target,
      operationRevision: "previous_op",
      now
    });
  const verify = (
    token: string,
    overrides: Partial<Parameters<typeof verifyStripeOfferQuote>[0]> = {}
  ) =>
    verifyStripeOfferQuote({
      token,
      secret: provider.webhookSecret,
      organizationId: "org",
      actorUserId: "owner",
      subscription,
      now,
      ...overrides
    });
  return { now, provider, subscription, createPreview, quote, verify };
}

describe("interval-aware billing offer quotes", () => {
  it("quotes an annual upgrade with an explicit annual recurring total and unchanged capacity", async () => {
    const f = fixture();
    const quote = await f.quote({ target_plan: "business", interval: "year" });
    expect(quote).toMatchObject({
      action: "upgrade",
      interval: "year",
      target_plan: "business",
      amount_due: 12000,
      recurring_total: 355010,
      tax: 500,
      additional_capacity_units: 99,
      effective_at: "2026-02-10T12:00:00.000Z"
    });
    expect(quote).not.toHaveProperty("monthly_total");
    expect(f.verify(quote.confirmation_token)).toMatchObject({
      operation_revision: "previous_op",
      items: [
        { id: "base", price: "business_year_plan", quantity: 1 },
        { id: "extra", price: "business_year_extra_capacity", quantity: 99 }
      ]
    });
  });
  it.each(["solo", "business"] as const)(
    "schedules a month-to-year %s change at the paid renewal boundary",
    async (target_plan) => {
      const f = fixture("month");
      const quote = await f.quote({ target_plan, interval: "year" });
      expect(quote).toMatchObject({
        action: "renewal",
        amount_due: 0,
        effective_at: "2026-02-28T00:00:00.000Z",
        interval: "year"
      });
      expect(f.createPreview).toHaveBeenCalledTimes(1);
      expect(f.createPreview.mock.calls[0]![0]).toMatchObject({
        preview_mode: "recurring",
        subscription_details: { proration_behavior: "none" }
      });
    }
  );
  it.each(["expired", "actor", "organization", "subscription", "items", "signature"])(
    "rejects a stale or substituted quote: %s",
    async (reason) => {
      const f = fixture();
      const { confirmation_token } = await f.quote({ target_plan: "business", interval: "year" });
      const changes: Partial<Parameters<typeof verifyStripeOfferQuote>[0]> = {};
      if (reason === "expired") changes.now = f.now + 600000;
      if (reason === "actor") changes.actorUserId = "former_owner";
      if (reason === "organization") changes.organizationId = "other_org";
      if (reason === "subscription") changes.subscription = { ...f.subscription, id: "other_sub" };
      if (reason === "items") f.subscription.items.data[1]!.quantity = 98;
      if (reason === "signature") changes.secret = "other_secret";
      expect(f.verify(confirmation_token, changes)).toBeNull();
    }
  );
  it("does not reprice an unchanged retained offer or pretend it is an upgrade", () => {
    const f = fixture();
    expect(
      stripeOfferChangeAction(f.provider, f.subscription, { target_plan: "team", interval: "year" })
    ).toBeNull();
  });
});
