import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStripePlanChangeService } from "../../../packages/billing/src/stripe-plan-change.js";
import { createMemoryBillingSubscriptionOperationStore } from "../../helpers/billing-subscription-operations.js";

function fixture() {
  const sub = {
    id: "sub_test",
    customer: "cus_test",
    metadata: { organization_id: "org_test" },
    status: "active",
    collection_method: "charge_automatically",
    cancel_at_period_end: false,
    cancel_at: null,
    pending_update: null,
    schedule: null as unknown,
    latest_invoice: { status: "paid" },
    automatic_tax: { enabled: true },
    discounts: [],
    default_tax_rates: [],
    items: {
      has_more: false,
      data: [
        {
          id: "si_base",
          price: { id: "price_team", recurring: { interval: "month", interval_count: 1 } },
          quantity: 1,
          current_period_start: 1790812800,
          current_period_end: 1793491200,
          discounts: [],
          tax_rates: []
        },
        {
          id: "si_extra",
          price: { id: "price_team_extra", recurring: { interval: "month", interval_count: 1 } },
          quantity: 7,
          current_period_start: 1790812800,
          current_period_end: 1793491200,
          discounts: [],
          tax_rates: []
        }
      ]
    }
  };
  let schedule: Record<string, unknown> | null = null;
  const create = vi.fn(async () => {
    schedule = {
      id: "sched_test",
      status: "active",
      subscription: sub.id,
      phases: [
        {
          start_date: 1790812800,
          end_date: 1793491200,
          items: sub.items.data.map((item) => ({ price: item.price.id, quantity: item.quantity }))
        }
      ]
    };
    sub.schedule = "sched_test";
    return schedule;
  });
  const update = vi.fn(async (_id: string, body: Record<string, unknown>) => {
    const phases = structuredClone(body["phases"]) as Array<Record<string, unknown>>;
    phases[1]!["end_date"] = 1796083200;
    schedule = {
      ...schedule,
      ...body,
      phases,
      current_phase: { start_date: 1790812800, end_date: 1793491200 }
    };
    return schedule;
  });
  const release = vi.fn(async () => {
    sub.schedule = null;
    schedule = {
      ...schedule,
      status: "released",
      subscription: null,
      released_subscription: sub.id
    };
    return schedule;
  });
  const createPreview = vi.fn(async () => ({
    currency: "usd",
    total: 1275,
    total_taxes: [{ amount: 83 }],
    automatic_tax: { status: "complete" }
  }));
  const provider = {
    webhookSecret: "synthetic_secret",
    soloPriceId: "price_solo",
    teamPriceId: "price_team",
    soloExtraCapacityPriceId: "price_solo_extra",
    teamExtraCapacityPriceId: "price_team_extra",
    priceMap: new Map([
      ["price_solo", { plan: "solo", type: "plan" }],
      ["price_team", { plan: "team", type: "plan" }],
      ["price_solo_extra", { plan: "solo", type: "extra_capacity" }],
      ["price_team_extra", { plan: "team", type: "extra_capacity" }]
    ]),
    client: {
      subscriptions: { retrieve: vi.fn(async () => structuredClone(sub)) },
      invoices: { createPreview },
      subscriptionSchedules: {
        create,
        update,
        release,
        retrieve: vi.fn(async () => structuredClone(schedule))
      }
    }
  };
  const store = createMemoryBillingSubscriptionOperationStore(sub.id, sub.customer);
  const service = createStripePlanChangeService({
    provider: provider as never,
    store,
    organizationId: "org_test",
    subscriptionId: sub.id,
    customerId: sub.customer,
    now: () => Date.now()
  });
  const quote = async () => {
    const result = await service.preview();
    if (typeof result === "string") throw new Error(result);
    return result.quote;
  };
  return {
    service,
    quote,
    sub,
    provider,
    store,
    create,
    update,
    release,
    createPreview,
    setSchedule: (value: Record<string, unknown>) => {
      schedule = value;
      sub.schedule = value["id"];
    },
    getSchedule: () => schedule
  };
}

describe("end-of-period Team to Solo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());
  it("previews renewal totals without creating a schedule or charging", async () => {
    const f = fixture();
    expect(await f.quote()).toMatchObject({
      amount_due: 0,
      monthly_total: 1275,
      tax: 83,
      additional_capacity_units: 7,
      effective_at: "2026-11-01T00:00:00.000Z"
    });
    expect(f.create).not.toHaveBeenCalled();
    expect(f.createPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription: "sub_test",
        subscription_details: expect.objectContaining({ proration_behavior: "none" })
      }),
      expect.anything()
    );
  });
  it("schedules both prices on the same subscription at renewal and retains all 99 extra units", async () => {
    const f = fixture();
    f.sub.items.data[1]!.quantity = 99;
    const quote = await f.quote();
    expect(await f.service.schedule(quote.confirmation_token)).toMatchObject({
      pending_change: {
        target_plan: "solo",
        additional_capacity_units: 99,
        schedule_id: "sched_test"
      }
    });
    expect(f.sub.items.data[0]!.price.id).toBe("price_team");
    const body = f.update.mock.calls[0]![1] as {
      phases: Array<{ items: unknown[]; start_date: number }>;
    };
    expect(body.phases[0]!.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ price: "price_team_extra", quantity: 99 })])
    );
    expect(body.phases[1]!.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ price: "price_solo_extra", quantity: 99 })])
    );
    expect(body.phases[1]!.start_date).toBe(1793491200);
    expect(await f.service.schedule(quote.confirmation_token)).toMatchObject({
      pending_change: { schedule_id: "sched_test" }
    });
    expect(f.create).toHaveBeenCalledTimes(1);
  });
  it.each(["unpaid", "pending", "canceling", "other_schedule", "unknown_item"])(
    "blocks a new change for %s state",
    async (reason) => {
      const f = fixture();
      if (reason === "unpaid") f.sub.latest_invoice.status = "open";
      if (reason === "pending") f.sub.pending_update = {} as never;
      if (reason === "canceling") f.sub.cancel_at_period_end = true;
      if (reason === "other_schedule")
        f.sub.schedule = { id: "sched_other", status: "active", metadata: {} };
      if (reason === "unknown_item") f.sub.items.data[0]!.price.id = "price_other";
      expect(typeof (await f.service.preview())).toBe("string");
      expect(f.create).not.toHaveBeenCalled();
    }
  );
  it("rejects a changed quote before any schedule mutation", async () => {
    const f = fixture();
    const quote = await f.quote();
    f.createPreview.mockResolvedValue({
      currency: "usd",
      total: 1500,
      total_taxes: [{ amount: 83 }],
      automatic_tax: { status: "complete" }
    });
    expect(await f.service.schedule(quote.confirmation_token)).toBe(
      "plan_change_confirmation_required"
    );
    expect(f.create).not.toHaveBeenCalled();
  });
  it("retries a lost update response using the same schedule, exact phases and key", async () => {
    const f = fixture();
    const quote = await f.quote();
    f.update.mockRejectedValueOnce(new Error("lost response"));
    expect(await f.service.schedule(quote.confirmation_token)).toBe("billing_service_error");
    expect(await f.service.schedule(quote.confirmation_token)).toMatchObject({
      pending_change: { schedule_id: "sched_test" }
    });
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.update.mock.calls[1]).toEqual(f.update.mock.calls[0]);
  });
  it("releases only the exact owned pending schedule while keeping Team active", async () => {
    const f = fixture();
    const quote = await f.quote();
    await f.service.schedule(quote.confirmation_token);
    expect(await f.service.cancel("sched_other")).toBe("plan_change_not_found");
    expect(f.release).not.toHaveBeenCalled();
    expect(await f.service.cancel("sched_test")).toEqual({ pending_change: null });
    expect(f.release).toHaveBeenCalledWith(
      "sched_test",
      {},
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
    expect(f.sub.status).toBe("active");
    expect(f.sub.items.data[0]!.price.id).toBe("price_team");
  });
  it("reconciles an applied schedule after a lost response and permits its cancellation", async () => {
    const f = fixture();
    const quote = await f.quote();
    const update = f.update.getMockImplementation()!;
    f.update.mockImplementationOnce(async (...args) => {
      await update(...args);
      throw new Error("lost response");
    });
    expect(await f.service.schedule(quote.confirmation_token)).toBe("billing_service_error");
    vi.setSystemTime(new Date("2026-10-24T10:00:00Z"));
    expect(await f.service.getStatus()).toMatchObject({
      pending_change: { schedule_id: "sched_test" }
    });
    expect((await f.store.get("org_test"))?.completed_at).not.toBeNull();
    expect(await f.service.cancel("sched_test")).toEqual({ pending_change: null });
    expect(f.update).toHaveBeenCalledTimes(1);
  });
  it("does not age-rotate or replay an unknown create after Stripe's replay window", async () => {
    const f = fixture();
    const quote = await f.quote();
    f.create.mockRejectedValue(new Error("timeout"));
    expect(await f.service.schedule(quote.confirmation_token)).toBe("billing_service_error");
    const original = await f.store.get("org_test");
    vi.setSystemTime(new Date("2026-10-24T10:00:00Z"));
    expect(await f.service.schedule(quote.confirmation_token)).toBe("billing_change_in_progress");
    expect((await f.store.get("org_test"))?.id).toBe(original?.id);
    expect(f.create).toHaveBeenCalledTimes(1);
  });
  it("offers the exact prepared request after reload, without repricing or a new intent", async () => {
    const f = fixture();
    const quote = await f.quote();
    f.update.mockRejectedValueOnce(new Error("timeout"));
    await f.service.schedule(quote.confirmation_token);
    vi.setSystemTime(new Date("2026-10-22T11:00:00Z"));
    expect(await f.service.preview()).toMatchObject({
      quote: { confirmation_token: quote.confirmation_token, resume_required: true }
    });
    expect(await f.service.schedule(quote.confirmation_token)).toMatchObject({
      pending_change: { schedule_id: "sched_test" }
    });
    expect(f.createPreview).toHaveBeenCalledTimes(2);
  });
  it("reconciles a lost release response without releasing again", async () => {
    const f = fixture();
    const quote = await f.quote();
    await f.service.schedule(quote.confirmation_token);
    const release = f.release.getMockImplementation()!;
    f.release.mockImplementationOnce(async () => {
      await release();
      throw new Error("lost response");
    });
    expect(await f.service.cancel("sched_test")).toBe("billing_service_error");
    vi.setSystemTime(new Date("2026-10-24T10:00:00Z"));
    expect(await f.service.cancel("sched_test")).toEqual({ pending_change: null });
    expect(f.release).toHaveBeenCalledTimes(1);
  });
  it.each(["tampered", "expired", "changed_quantity"])(
    "rejects %s confirmation without dispatch",
    async (reason) => {
      const f = fixture();
      const quote = await f.quote();
      if (reason === "expired") vi.setSystemTime(new Date("2026-10-22T11:00:00Z"));
      if (reason === "changed_quantity") f.sub.items.data[1]!.quantity = 8;
      expect(
        await f.service.schedule(quote.confirmation_token + (reason === "tampered" ? "x" : ""))
      ).toBe("plan_change_confirmation_required");
      expect(f.create).not.toHaveBeenCalled();
    }
  );
  it("retains tax and discounts on both item and subscription phases", async () => {
    const f = fixture();
    f.sub.discounts = ["di_subscription"] as never;
    f.sub.default_tax_rates = ["txr_subscription"] as never;
    f.sub.items.data[1]!.discounts = ["di_item"] as never;
    f.sub.items.data[1]!.tax_rates = ["txr_item"] as never;
    const quote = await f.quote();
    await f.service.schedule(quote.confirmation_token);
    const phases = f.update.mock.calls[0]![1]["phases"] as Array<Record<string, unknown>>;
    for (const phase of phases)
      expect(phase).toMatchObject({
        automatic_tax: { enabled: true },
        discounts: [{ discount: "di_subscription" }],
        default_tax_rates: ["txr_subscription"],
        items: expect.arrayContaining([
          expect.objectContaining({ discounts: [{ discount: "di_item" }], tax_rates: ["txr_item"] })
        ])
      });
  });
  it("supports zero extra units without inventing an add-on", async () => {
    const f = fixture();
    f.sub.items.data.pop();
    const quote = await f.quote();
    expect(quote.additional_capacity_units).toBe(0);
    expect(await f.service.schedule(quote.confirmation_token)).toMatchObject({
      pending_change: { additional_capacity_units: 0 }
    });
    expect(
      (f.update.mock.calls[0]![1]["phases"] as Array<{ items: unknown[] }>)[1]!.items
    ).toHaveLength(1);
  });
  it("does not resurrect a cancelled schedule from a delayed confirmation", async () => {
    const f = fixture();
    const quote = await f.quote();
    await f.service.schedule(quote.confirmation_token);
    await f.service.cancel("sched_test");
    expect(await f.service.schedule(quote.confirmation_token)).toBe(
      "plan_change_confirmation_required"
    );
    expect(f.create).toHaveBeenCalledTimes(1);
    const fresh = await f.quote();
    expect(await f.service.schedule(fresh.confirmation_token)).toMatchObject({
      pending_change: { target_plan: "solo" }
    });
  });

  it("allows a downgrade after a capacity schedule has reached its final phase, releasing only on confirmation", async () => {
    const f = fixture();
    f.setSchedule({
      id: "sched_capacity_done",
      status: "active",
      subscription: f.sub.id,
      end_behavior: "release",
      metadata: { organization_id: "org_test", debugbundle_change: "capacity_reduction" },
      current_phase: { start_date: 1790812800, end_date: 1793491200 },
      phases: [
        { start_date: 1788220800, end_date: 1790812800, items: [] },
        {
          start_date: 1790812800,
          end_date: 1793491200,
          items: f.sub.items.data.map((item) => ({ price: item.price.id, quantity: item.quantity }))
        }
      ]
    });
    f.createPreview.mockResolvedValue({
      currency: "usd",
      total: 1275,
      total_taxes: [{ amount: 83 }],
      automatic_tax: { status: "complete" },
      lines: {
        has_more: false,
        data: [
          { price: "price_solo", quantity: 1 },
          { price: "price_solo_extra", quantity: 7 }
        ].map((item) => ({
          quantity: item.quantity,
          parent: {
            type: "subscription_item_details",
            subscription_item_details: { proration: false }
          },
          pricing: { price_details: { price: item.price } }
        }))
      }
    } as never);
    const quote = await f.quote();
    expect(f.release).not.toHaveBeenCalled();
    expect(await f.service.schedule(quote.confirmation_token)).toMatchObject({
      pending_change: { target_plan: "solo" }
    });
    expect(f.release).toHaveBeenCalledWith("sched_capacity_done", {}, expect.anything());
    expect(f.create).toHaveBeenCalledTimes(1);
  });
});
