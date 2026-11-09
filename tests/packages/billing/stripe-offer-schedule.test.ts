import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import type {
  StripeBillingProvider,
  StripePriceMapping
} from "../../../packages/billing/src/stripe-subscription.js";
import {
  buildStripeOfferChangePhases,
  readPendingStripeOfferChange
} from "../../../packages/billing/src/stripe-offer-schedule.js";

function fixture() {
  const start = Date.parse("2026-01-31T00:00:00Z") / 1000,
    end = Date.parse("2027-01-31T00:00:00Z") / 1000;
  const now = Date.parse("2026-02-10T00:00:00Z");
  const priceMap = new Map<string, StripePriceMapping>([
    ["business_year", { plan: "business", type: "plan", interval: "year", currency: "usd" }],
    [
      "business_extra_year",
      { plan: "business", type: "extra_capacity", interval: "year", currency: "usd" }
    ],
    ["team_month", { plan: "team", type: "plan" }],
    ["team_extra_month", { plan: "team", type: "extra_capacity" }]
  ]);
  const sub = {
    id: "sub",
    customer: "cus",
    automatic_tax: { enabled: true },
    discounts: [],
    default_tax_rates: [],
    items: {
      data: [
        {
          id: "base",
          price: {
            id: "business_year",
            currency: "usd",
            recurring: { interval: "year", interval_count: 1 }
          },
          quantity: 1,
          current_period_start: start,
          current_period_end: end,
          discounts: [],
          tax_rates: []
        },
        {
          id: "extra",
          price: {
            id: "business_extra_year",
            currency: "usd",
            recurring: { interval: "year", interval_count: 1 }
          },
          quantity: 99,
          current_period_start: start,
          current_period_end: end,
          discounts: [],
          tax_rates: []
        }
      ]
    }
  } as unknown as Stripe.Subscription;
  const provider = { priceMap } as StripeBillingProvider;
  const target = { target_plan: "team" as const, interval: "month" as const };
  const phases = () => buildStripeOfferChangePhases({ subscription: sub, provider, target, now });
  const schedule = (): Stripe.SubscriptionSchedule =>
    ({
      id: "schedule",
      subscription: "sub",
      status: "active",
      end_behavior: "release",
      current_phase: { start_date: start, end_date: end },
      metadata: {
        organization_id: "org",
        debugbundle_change: "offer_change",
        target_plan: "team",
        interval: "month"
      },
      phases: phases().map((phase, index) => ({
        ...phase,
        end_date: index === 0 ? end : end + 28 * 86400
      }))
    }) as unknown as Stripe.SubscriptionSchedule;
  const pending = (value: Stripe.SubscriptionSchedule) =>
    readPendingStripeOfferChange({
      subscription: sub,
      schedule: value,
      provider,
      organizationId: "org",
      now
    });
  return { now, sub, provider, target, start, end, phases, schedule, pending };
}

describe("explicit offer renewal schedules", () => {
  it("keeps the paid annual phase and all purchased units before changing at renewal", () => {
    const f = fixture(),
      phases = f.phases();
    expect(phases[0]).toMatchObject({
      start_date: f.start,
      end_date: f.end,
      items: [
        { price: "business_year", quantity: 1 },
        { price: "business_extra_year", quantity: 99 }
      ]
    });
    expect(phases[1]).toMatchObject({
      start_date: f.end,
      duration: { interval: "month", interval_count: 1 },
      proration_behavior: "none",
      items: [
        { price: "team_month", quantity: 1 },
        { price: "team_extra_month", quantity: 99 }
      ]
    });
    expect(f.pending(f.schedule())).toEqual({
      schedule_id: "schedule",
      target_plan: "team",
      interval: "month",
      additional_capacity_units: 99,
      effective_at: "2027-01-31T00:00:00.000Z"
    });
  });
  it.each(["price", "quantity", "tax", "discount", "account", "metadata", "phase_time"])(
    "does not claim an edited or foreign schedule: %s",
    (reason) => {
      const f = fixture(),
        schedule = f.schedule();
      if (reason === "price") schedule.phases[1]!.items[0]!.price = "foreign_price" as never;
      if (reason === "quantity") schedule.phases[1]!.items[1]!.quantity = 98;
      if (reason === "tax") schedule.phases[1]!.items[1]!.tax_rates = ["tax_foreign"] as never;
      if (reason === "discount") schedule.phases[1]!.discounts = [{ discount: "foreign" }] as never;
      if (reason === "account") schedule.metadata!["organization_id"] = "other";
      if (reason === "metadata") schedule.metadata!["interval"] = "year";
      if (reason === "phase_time") schedule.phases[1]!.start_date += 1;
      expect(f.pending(schedule)).toBeNull();
    }
  );
  it("refuses inconsistent provider periods before building a schedule", () => {
    const f = fixture();
    f.sub.items.data[1]!.current_period_end -= 1;
    expect(f.phases).toThrow("unsupported_plan_change");
  });
});
