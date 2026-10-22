import type Stripe from "stripe";
import { expect, it } from "vitest";
import { buildSchedulePhasesForReduction } from "../../../packages/billing/src/stripe-capacity.js";
import { isCapacityReductionSchedule } from "../../../packages/billing/src/stripe-schedule-safety.js";

it.each(["price", "discounts", "tax_rates", "metadata"])(
  "does not overwrite a future capacity item %s change",
  (field) => {
    const current = {
      start_date: 1790812800,
      end_date: 1793491200,
      items: [
        { price: "price_solo", quantity: 1 },
        { price: "price_extra", quantity: 7 }
      ]
    };
    const future = {
      start_date: current.end_date,
      end_date: 1796083200,
      items: [
        { price: "price_solo", quantity: 1 },
        {
          price: "price_extra",
          quantity: 2,
          ...(field === "price"
            ? { price: "price_team_extra" }
            : field === "metadata"
              ? { metadata: { future: "change" } }
              : { [field]: ["new_setting"] })
        }
      ]
    };
    expect(
      isCapacityReductionSchedule(
        { id: "sub_test", items: { data: current.items } } as never,
        {
          status: "active",
          subscription: "sub_test",
          end_behavior: "release",
          current_phase: { start_date: current.start_date, end_date: current.end_date },
          phases: [current, future]
        } as never,
        {
          priceMap: new Map([
            ["price_solo", { plan: "solo", type: "plan" }],
            ["price_extra", { plan: "solo", type: "extra_capacity" }],
            ["price_team_extra", { plan: "team", type: "extra_capacity" }]
          ])
        } as never
      )
    ).toBe(false);
  }
);

it("preserves automatic tax and existing subscription and item discounts through both reduction phases", () => {
  const subscription = {
    id: "sub_test",
    automatic_tax: { enabled: true },
    discounts: ["di_subscription"],
    default_tax_rates: [{ id: "txr_default" }],
    items: {
      data: [
        {
          id: "si_base",
          price: { id: "price_solo", recurring: { interval: "month", interval_count: 1 } },
          quantity: 1,
          current_period_start: 1792627200,
          current_period_end: 1795305600,
          discounts: ["di_item"],
          tax_rates: [{ id: "txr_item" }]
        },
        {
          id: "si_extra",
          price: { id: "price_extra", recurring: { interval: "month", interval_count: 1 } },
          quantity: 7,
          current_period_start: 1792627200,
          current_period_end: 1795305600
        }
      ]
    }
  } as unknown as Stripe.Subscription;
  const phases = buildSchedulePhasesForReduction({
    subscription,
    schedule: null,
    plan: "solo",
    targetAdditionalPurchased: 2,
    summary: { capacity_units: { additional_purchased: 7 } } as never,
    stripeConfig: {
      priceMap: new Map([
        ["price_solo", { plan: "solo", type: "plan" }],
        ["price_extra", { plan: "solo", type: "extra_capacity" }]
      ])
    } as never
  });
  for (const phase of phases) {
    expect(phase).toMatchObject({
      automatic_tax: { enabled: true },
      discounts: [{ discount: "di_subscription" }],
      default_tax_rates: ["txr_default"]
    });
    expect(phase.items[0]).toMatchObject({
      discounts: [{ discount: "di_item" }],
      tax_rates: ["txr_item"]
    });
  }
  expect(phases[1]?.items[1]?.quantity).toBe(2);
});
