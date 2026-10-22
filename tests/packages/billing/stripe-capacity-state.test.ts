import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import {
  buildSubscriptionItemsForQuantity,
  buildSchedulePhasesForReduction,
  loadStripeBillingSubscriptionState
} from "../../../packages/billing/src/stripe-capacity.js";
import type { StripeBillingProvider } from "../../../packages/billing/src/stripe-subscription.js";

function setup() {
  const boundary = 1793491200;
  const schedule = {
    id: "sched_test",
    status: "active",
    current_phase: { start_date: boundary - 2678400, end_date: boundary },
    phases: [
      {
        start_date: boundary,
        items: [
          { price: "price_solo", quantity: 1 },
          { price: { id: "price_extra" }, quantity: 2 }
        ]
      }
    ]
  };
  const subscription = {
    id: "sub_test",
    status: "active",
    schedule: schedule as unknown,
    items: {
      data: [
        { id: "si_base", price: { id: "price_solo" }, quantity: 1 },
        { id: "si_extra", price: { id: "price_extra" }, quantity: 7 }
      ]
    }
  };
  const retrieve = vi.fn().mockImplementation(async () => structuredClone(subscription));
  const scheduleRetrieve = vi.fn().mockImplementation(async () => structuredClone(schedule));
  const provider = {
    client: { subscriptions: { retrieve }, subscriptionSchedules: { retrieve: scheduleRetrieve } },
    priceMap: new Map([
      ["price_solo", { plan: "solo", type: "plan" }],
      ["price_extra", { plan: "solo", type: "extra_capacity" }]
    ]),
    soloExtraCapacityPriceId: "price_extra",
    teamExtraCapacityPriceId: "price_team_extra"
  } as unknown as StripeBillingProvider;
  const run = () =>
    loadStripeBillingSubscriptionState({
      stripeConfig: provider,
      subscriptionId: "sub_test",
      fallbackPlan: "solo",
      fallbackEffectiveAt: "2026-11-01T00:00:00Z",
      timeoutMs: 2500
    });
  return { run, subscription, schedule, provider, retrieve, scheduleRetrieve };
}

describe("authoritative capacity schedule projection", () => {
  it("does not schedule a charge change from cached periods when Stripe has no current period", () => {
    const f = setup();
    expect(() =>
      buildSchedulePhasesForReduction({
        subscription: f.subscription as unknown as Stripe.Subscription,
        schedule: null,
        stripeConfig: f.provider,
        summary: {
          usage_window: { starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-11-01T00:00:00Z" },
          capacity_units: { additional_purchased: 7 }
        } as never,
        targetAdditionalPurchased: 2,
        plan: "solo"
      })
    ).toThrow("billing_period_unavailable");
  });
  it.each(["canceled", "unpaid", "paused", "incomplete_expired"])(
    "does not project paid access from %s subscription items",
    async (status) => {
      const f = setup();
      f.subscription.status = status;
      expect(await f.run()).toMatchObject({
        plan: "free",
        additionalPurchased: 0,
        pendingReduction: null
      });
    }
  );
  it("keeps incomplete base grace without projecting unpaid extra capacity", async () => {
    const f = setup();
    f.subscription.status = "incomplete";
    expect(await f.run()).toMatchObject({ plan: "solo", additionalPurchased: 0 });
  });
  it("uses Clover item periods for reductions even when the stored period is stale", () => {
    const f = setup();
    const subscription = structuredClone(f.subscription) as unknown as Stripe.Subscription;
    for (const item of subscription.items.data) {
      item.current_period_start = 1792627200;
      item.current_period_end = 1795305600;
    }
    const phases = buildSchedulePhasesForReduction({
      subscription,
      schedule: null,
      stripeConfig: f.provider,
      summary: {
        usage_window: { starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-11-01T00:00:00Z" },
        capacity_units: { additional_purchased: 7 }
      } as never,
      targetAdditionalPurchased: 2,
      plan: "solo"
    });
    expect(phases[0]).toMatchObject({ start_date: 1792627200, end_date: 1795305600 });
    expect(phases[1]).toMatchObject({ start_date: 1795305600 });
  });
  it("projects the next renewal reduction without changing current purchased capacity", async () => {
    const f = setup();
    expect(await f.run()).toMatchObject({
      plan: "solo",
      additionalPurchased: 7,
      pendingReduction: {
        additional_purchased: 2,
        total: 5,
        effective_at: "2026-11-01T00:00:00.000Z"
      }
    });
  });
  it("retrieves an unexpanded schedule with the same bounded provider options", async () => {
    const f = setup();
    f.subscription.schedule = "sched_test";
    expect(await f.run()).toMatchObject({ pendingReduction: { additional_purchased: 2 } });
    expect(f.scheduleRetrieve).toHaveBeenCalledWith(
      "sched_test",
      {},
      { timeout: 2500, maxNetworkRetries: 0 }
    );
  });
  it.each(["inactive", "missing_phase", "missing_future", "not_reducing"])(
    "does not invent a pending reduction for %s schedules",
    async (reason) => {
      const f = setup();
      if (reason === "inactive") f.schedule.status = "released";
      if (reason === "missing_phase") f.schedule.current_phase = null as never;
      if (reason === "missing_future") f.schedule.phases = [];
      if (reason === "not_reducing") f.schedule.phases[0]!.items[1]!.quantity = 7;
      f.subscription.schedule = f.schedule;
      expect((await f.run()).pendingReduction).toBeNull();
    }
  );
  it("ignores malformed optional price references and uses absent quantity as one", async () => {
    const f = setup();
    f.schedule.phases[0]!.items = [
      { price: {} as never, quantity: 1 },
      { price: "price_solo", quantity: 1 },
      { price: { id: "price_extra" }, quantity: undefined as never }
    ];
    f.subscription.schedule = f.schedule;
    expect((await f.run()).pendingReduction).toMatchObject({ additional_purchased: 1, total: 4 });
  });
  it("removes an add-on at zero and selects the Team capacity Price when adding the first units", () => {
    const f = setup();
    expect(
      buildSubscriptionItemsForQuantity({
        subscription: f.subscription as unknown as Stripe.Subscription,
        stripeConfig: f.provider,
        targetAdditionalPurchased: 0,
        plan: "solo"
      })
    ).toEqual([
      { id: "si_base", quantity: 1 },
      { id: "si_extra", deleted: true }
    ]);
    f.subscription.items.data = [{ id: "si_base", price: { id: "price_team" }, quantity: 1 }];
    expect(
      buildSubscriptionItemsForQuantity({
        subscription: f.subscription as unknown as Stripe.Subscription,
        stripeConfig: f.provider,
        targetAdditionalPurchased: 3,
        plan: "team"
      })
    ).toEqual([
      { id: "si_base", quantity: 1 },
      { price: "price_team_extra", quantity: 3 }
    ]);
  });
});
