import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { createMemoryBillingSubscriptionOperationStore } from "../../helpers/billing-subscription-operations.js";
import type {
  StripeBillingProvider,
  StripePriceMapping
} from "../../../packages/billing/src/stripe-subscription.js";
import { createStripeOfferChangeService } from "../../../packages/billing/src/stripe-offer-change.js";

function fixture() {
  let now = Date.parse("2026-02-10T00:00:00Z");
  const start = Date.parse("2026-01-31T00:00:00Z") / 1000,
    end = Date.parse("2027-01-31T00:00:00Z") / 1000;
  const sub = {
    id: "sub",
    customer: "cus",
    status: "active",
    collection_method: "charge_automatically",
    latest_invoice: { status: "paid" },
    schedule: null,
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
  let schedule: Stripe.SubscriptionSchedule | null = null;
  const create = vi.fn(async () => {
    schedule ??= {
      id: "schedule",
      status: "active",
      end_behavior: "release",
      subscription: sub.id,
      current_phase: { start_date: start, end_date: end },
      phases: [
        {
          start_date: start,
          end_date: end,
          items: sub.items.data.map((item) => ({ price: item.price.id, quantity: item.quantity }))
        }
      ]
    } as unknown as Stripe.SubscriptionSchedule;
    sub.schedule = schedule.id;
    return structuredClone(schedule);
  });
  const update = vi.fn(async (_id: string, body: Stripe.SubscriptionScheduleUpdateParams) => {
    schedule = {
      ...schedule,
      ...body,
      current_phase: { start_date: start, end_date: end },
      phases: body.phases!.map((phase, i) => ({
        ...phase,
        end_date: i === 0 ? end : end + 28 * 86400
      }))
    } as unknown as Stripe.SubscriptionSchedule;
    return structuredClone(schedule);
  });
  const release = vi.fn(async () => {
    schedule = {
      ...schedule,
      status: "released",
      released_subscription: sub.id
    } as Stripe.SubscriptionSchedule;
    sub.schedule = null;
    return structuredClone(schedule);
  });
  const priceMap = new Map<string, StripePriceMapping>([
    ["business_year", { plan: "business", type: "plan", interval: "year", currency: "usd" }],
    [
      "business_extra_year",
      { plan: "business", type: "extra_capacity", interval: "year", currency: "usd" }
    ],
    ["team_month", { plan: "team", type: "plan" }],
    ["team_extra_month", { plan: "team", type: "extra_capacity" }]
  ]);
  const provider = {
    webhookSecret: "secret",
    priceMap,
    client: {
      subscriptions: { retrieve: vi.fn(async () => structuredClone(sub)) },
      invoices: {
        createPreview: vi.fn(async () => ({ currency: "usd", total: 31501, total_taxes: [] }))
      },
      subscriptionSchedules: {
        create,
        update,
        release,
        retrieve: vi.fn(async () => structuredClone(schedule))
      }
    }
  } as unknown as StripeBillingProvider;
  const store = createMemoryBillingSubscriptionOperationStore("sub", "cus", "attempt", () => now);
  const service = createStripeOfferChangeService({
    provider,
    store,
    organizationId: "org",
    actorUserId: "owner",
    subscriptionId: "sub",
    customerId: "cus",
    now: () => now
  });
  const target = { target_plan: "team" as const, interval: "month" as const };
  const quote = async () => {
    const result = await service.preview(target);
    if (typeof result === "string") throw new Error(result);
    return result.quote;
  };
  return {
    service,
    target,
    quote,
    provider,
    store,
    sub,
    create,
    update,
    release,
    getSchedule: () => schedule!,
    setNow: (value: number) => {
      now = value;
    }
  };
}

describe("reserved interval-aware renewal changes", () => {
  it("reports the provider's current annual prices and paid term separately from the pending change", async () => {
    const f = fixture();
    f.sub.items.data[0]!.price.unit_amount = 58800;
    f.sub.items.data[1]!.price.unit_amount = 3000;
    expect(await f.service.getStatus()).toEqual({
      pending_change: null,
      subscription: {
        plan: "business",
        interval: "year",
        currency: "usd",
        additional_capacity_units: 99,
        base_amount_minor: 58800,
        capacity_unit_amount_minor: 3000,
        term_starts_at: "2026-01-31T00:00:00.000Z",
        term_ends_at: "2027-01-31T00:00:00.000Z"
      }
    });
    expect(f.create).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });
  it("previews the explicit monthly renewal total without creating a schedule", async () => {
    const f = fixture();
    expect(await f.quote()).toMatchObject({
      action: "renewal",
      interval: "month",
      target_plan: "team",
      amount_due: 0,
      recurring_total: 31501,
      additional_capacity_units: 99,
      effective_at: "2027-01-31T00:00:00.000Z"
    });
    expect(f.create).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });
  it("confirms a single renewal schedule, preserves quantities and can cancel it explicitly", async () => {
    const f = fixture(),
      quote = await f.quote();
    const result = await f.service.schedule(quote.confirmation_token);
    expect(result).toMatchObject({
      pending_change: {
        target_plan: "team",
        interval: "month",
        additional_capacity_units: 99,
        schedule_id: "schedule"
      }
    });
    expect(f.create).toHaveBeenCalledWith(
      { from_subscription: "sub" },
      {
        timeout: 8000,
        maxNetworkRetries: 0,
        idempotencyKey: "billing-subscription:attempt_1:create"
      }
    );
    expect(f.getSchedule().phases[1]!.items[1]!.quantity).toBe(99);
    expect(await f.service.getStatus()).toMatchObject(result as object);
    expect(await f.service.cancel("schedule")).toEqual({ pending_change: null });
    expect(f.sub.items.data[0]!.price.id).toBe("business_year");
    expect(await f.service.cancel("schedule")).toEqual({ pending_change: null });
    expect(f.release).toHaveBeenCalledTimes(1);
  });
  it.each(["price", "tax", "discount", "invoice_item", "end_behavior"])(
    "does not overwrite an edited initial provider schedule: %s",
    async (edit) => {
      const f = fixture(),
        quote = await f.quote();
      const create = f.create.getMockImplementation()!;
      f.create.mockImplementationOnce(async () => {
        await create();
        const schedule = f.getSchedule(),
          phase = schedule.phases[0]!;
        if (edit === "price") phase.items[0]!.price = "operator_price" as never;
        if (edit === "tax") phase.default_tax_rates = ["operator_tax"] as never;
        if (edit === "discount") phase.discounts = [{ discount: "operator_discount" }] as never;
        if (edit === "invoice_item")
          phase.add_invoice_items = [{ price: "operator_invoice_item" }] as never;
        if (edit === "end_behavior") schedule.end_behavior = "cancel";
        return structuredClone(schedule);
      });
      expect(await f.service.schedule(quote.confirmation_token)).toBe("billing_change_in_progress");
      expect(f.update).not.toHaveBeenCalled();
    }
  );
  it("retires only the local cancellation intent if the scheduled phase applied during cancellation", async () => {
    const f = fixture(),
      quote = await f.quote();
    await f.service.schedule(quote.confirmation_token);
    const retrieve = vi.mocked(f.provider.client.subscriptions.retrieve);
    const original = retrieve.getMockImplementation()!;
    let reads = 0;
    retrieve.mockImplementation(async (...args) => {
      if (++reads === 2) {
        const schedule = f.getSchedule(),
          phase = schedule.phases[1]!;
        schedule.current_phase = { start_date: phase.start_date, end_date: phase.end_date };
        f.sub.items.data.forEach((item, index) => {
          item.price.id =
            typeof phase.items[index]!.price === "string"
              ? phase.items[index]!.price
              : phase.items[index]!.price.id;
          item.price.recurring!.interval = "month";
          item.current_period_start = phase.start_date;
          item.current_period_end = phase.end_date;
        });
        f.setNow(phase.start_date * 1000 + 1000);
      }
      return original(...args);
    });
    expect(await f.service.cancel("schedule")).toBe("plan_change_not_found");
    expect(f.release).not.toHaveBeenCalled();
    expect((await f.store.get("org"))?.completed_at).not.toBeNull();
  });
  it("reconciles a lost update response without issuing the update twice", async () => {
    const f = fixture(),
      quote = await f.quote();
    const apply = f.update.getMockImplementation()!;
    f.update.mockImplementationOnce(async (...args) => {
      await apply(...args);
      throw new Error("response_lost");
    });
    expect(await f.service.schedule(quote.confirmation_token)).toBe("billing_service_error");
    expect((await f.store.get("org"))?.parameters).not.toBeNull();
    expect(await f.service.schedule(quote.confirmation_token)).toMatchObject({
      pending_change: { schedule_id: "schedule" }
    });
    expect(f.update).toHaveBeenCalledTimes(1);
    expect(f.create).toHaveBeenCalledTimes(1);
  });
  it("does not release a schedule whose future price or tax changed", async () => {
    const f = fixture(),
      quote = await f.quote();
    await f.service.schedule(quote.confirmation_token);
    f.getSchedule().phases[1]!.items[1]!.tax_rates = ["foreign_tax"] as never;
    expect(await f.service.cancel("schedule")).toBe("plan_change_not_found");
    expect(f.release).not.toHaveBeenCalled();
  });
  it("rejects expired or superseded unprepared confirmations", async () => {
    const f = fixture(),
      quote = await f.quote();
    f.setNow(Date.parse(quote.expires_at));
    expect(await f.service.schedule(quote.confirmation_token)).toBe(
      "plan_change_confirmation_required"
    );
    expect(f.create).not.toHaveBeenCalled();
  });
  it("serializes against an existing capacity operation", async () => {
    const f = fixture(),
      quote = await f.quote();
    await f.store.claim({
      organization_id: "org",
      kind: "capacity_increase",
      intent: { target: 2 }
    });
    expect(await f.service.schedule(quote.confirmation_token)).toBe(
      "plan_change_confirmation_required"
    );
    expect(f.create).not.toHaveBeenCalled();
  });
});
