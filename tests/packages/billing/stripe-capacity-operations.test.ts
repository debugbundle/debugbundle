import { describe, expect, it, vi } from "vitest";
import { runStripeCapacityOperation } from "../../../packages/billing/src/stripe-capacity-operations.js";
import type { StripeBillingProvider } from "../../../packages/billing/src/stripe-subscription.js";
import type {
  BillingSubscriptionOperation,
  BillingSubscriptionOperationStore
} from "../../../packages/storage/src/billing-subscription-operation-store.js";
import type { BillingSummaryRecord } from "../../../packages/storage/src/index.js";

function setup() {
  const operation: BillingSubscriptionOperation = {
    id: "capacity_attempt",
    organization_id: "org_test",
    subscription_id: "sub_test",
    customer_id: "cus_test",
    kind: "capacity_increase",
    intent: { target: 8 },
    parameters: null,
    resource_id: null,
    created_at: new Date().toISOString(),
    completed_at: null
  };
  const store: BillingSubscriptionOperationStore = {
    get: vi.fn(async () => operation),
    claim: vi.fn(async () => operation),
    prepare: vi.fn(async (_org, _id, p) => {
      operation.parameters ??= p;
      return operation;
    }),
    saveResource: vi.fn(async (_org, _id, id) => {
      operation.resource_id = id;
      return true;
    }),
    complete: vi.fn(async () => true),
    abandonUnprepared: vi.fn(async () => true),
    retireVoidedPayment: vi.fn()
  };
  const metric = () => ({ used: 0, limit: 100 });
  const summary = {
    organization_id: "org_test",
    plan: "solo",
    billing_state: "active",
    stripe_customer_id: "cus_test",
    active_projects: 1,
    usage_window: { starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-11-01T00:00:00Z" },
    capacity_units: { included: 3, additional_purchased: 7, total: 10, pending_reduction: null },
    trial: {
      available: false,
      active: false,
      plan: null,
      started_at: null,
      ends_at: null,
      used_at: null,
      converted_at: null,
      expired_at: null,
      days_remaining: null
    },
    allowances: {
      monthly_bundle_requests: metric(),
      monthly_raw_ingested_events: metric(),
      retained_bundle_cap: metric(),
      monthly_remote_activations: metric(),
      monthly_alert_deliveries: metric(),
      monthly_webhook_deliveries: metric()
    }
  } as BillingSummaryRecord;
  const subscription = {
    id: "sub_test",
    customer: "cus_test",
    status: "active",
    pending_update: null,
    collection_method: "charge_automatically",
    latest_invoice: { id: "in_original", status: "paid" },
    items: {
      data: [
        {
          id: "si_base",
          price: { id: "price_solo", recurring: { interval: "month" } },
          current_period_start: 1790812800,
          current_period_end: 1793491200,
          quantity: 1
        },
        { id: "si_extra", price: { id: "price_solo_capacity" }, quantity: 7 }
      ]
    },
    schedule: null
  };
  const context = {
    summary,
    stripeState: {
      subscription,
      schedule: null,
      plan: "solo",
      additionalPurchased: 7,
      pendingReduction: null
    }
  };
  const invoice = {
    id: "in_paid",
    customer: "cus_test",
    status: "paid",
    billing_reason: "subscription_update",
    parent: { subscription_details: { subscription: "sub_test" } }
  };
  const invoiceRetrieve = vi.fn(async () => invoice);
  const update = vi.fn().mockImplementation(async () => {
    context.stripeState.additionalPurchased = 8;
    context.summary.capacity_units = {
      ...summary.capacity_units,
      additional_purchased: 8,
      total: 11
    };
    subscription.items.data[1]!.quantity = 8;
    return { ...subscription, latest_invoice: invoice };
  });
  const scheduleCreate = vi.fn().mockResolvedValue({ id: "sched_new" });
  const scheduleUpdate = vi.fn().mockResolvedValue({});
  const release = vi.fn().mockResolvedValue({});
  const provider = {
    client: {
      subscriptions: { update },
      invoices: { retrieve: invoiceRetrieve },
      subscriptionSchedules: { create: scheduleCreate, update: scheduleUpdate, release }
    },
    soloPriceId: "price_solo",
    teamPriceId: "price_team",
    soloExtraCapacityPriceId: "price_solo_capacity",
    teamExtraCapacityPriceId: "price_team_capacity",
    priceMap: new Map([
      ["price_solo", { plan: "solo", type: "plan" }],
      ["price_solo_capacity", { plan: "solo", type: "extra_capacity" }]
    ])
  } as unknown as StripeBillingProvider;
  const loadContext = vi.fn().mockImplementation(async () => structuredClone(context));
  const run = (
    kind: "capacity_increase" | "capacity_schedule" | "capacity_cancel" = "capacity_increase",
    target = 8
  ) =>
    runStripeCapacityOperation({
      store,
      provider,
      organizationId: "org_test",
      kind,
      target,
      loadContext: loadContext as never
    });
  return {
    operation,
    store,
    context,
    run,
    update,
    invoiceRetrieve,
    scheduleCreate,
    scheduleUpdate,
    release,
    loadContext
  };
}

describe("durable capacity operations", () => {
  it.each([
    "void",
    "uncollectible",
    "paid_not_applied",
    "wrong_customer",
    "unsafe_url",
    "missing_invoice",
    "save_failure"
  ])("never grants new capacity for %s payment outcomes", async (reason) => {
    const f = setup();
    const invoice = {
      id: "in_capacity",
      status:
        reason === "void"
          ? "void"
          : reason === "uncollectible"
            ? "uncollectible"
            : reason === "paid_not_applied"
              ? "paid"
              : "open",
      customer: reason === "wrong_customer" ? "cus_other" : "cus_test",
      billing_reason: "subscription_update",
      parent: { subscription_details: { subscription: "sub_test" } },
      hosted_invoice_url:
        reason === "unsafe_url"
          ? "https://unexpected.test/payment"
          : "https://invoice.stripe.com/i/capacity"
    };
    f.update.mockResolvedValue({
      ...f.context.stripeState.subscription,
      latest_invoice: reason === "missing_invoice" ? null : invoice
    });
    if (reason === "save_failure") vi.mocked(f.store.saveResource).mockResolvedValue(false);
    expect(await f.run()).toBe(
      ["wrong_customer", "missing_invoice", "save_failure"].includes(reason)
        ? "billing_not_configured"
        : "billing_change_in_progress"
    );
    expect(f.store.complete).not.toHaveBeenCalled();
    if (reason === "void")
      expect(f.store.retireVoidedPayment).toHaveBeenCalledWith(
        "org_test",
        "capacity_attempt",
        "in_capacity"
      );
  });
  it("resumes the exact open capacity invoice without another update", async () => {
    const f = setup();
    const invoice = {
      id: "in_capacity",
      status: "open",
      customer: "cus_test",
      billing_reason: "subscription_update",
      parent: { subscription_details: { subscription: "sub_test" } },
      hosted_invoice_url: "https://invoice.stripe.com/i/capacity"
    };
    f.update.mockResolvedValue({ ...f.context.stripeState.subscription, latest_invoice: invoice });
    f.invoiceRetrieve.mockResolvedValue(invoice);
    expect(await f.run()).toEqual({ payment_required: { url: invoice.hosted_invoice_url } });
    expect(await f.run()).toEqual({ payment_required: { url: invoice.hosted_invoice_url } });
    expect(f.update).toHaveBeenCalledTimes(1);
    expect(f.store.complete).not.toHaveBeenCalled();
  });
  it("does not overwrite or release an unrelated subscription schedule", async () => {
    const f = setup();
    f.operation.kind = "capacity_schedule";
    f.context.stripeState.schedule = {
      id: "sched_other",
      status: "active",
      end_behavior: "cancel",
      current_phase: null
    } as never;
    expect(await f.run("capacity_schedule", 2)).toBe("billing_change_in_progress");
    expect(f.scheduleUpdate).not.toHaveBeenCalled();
    expect(f.release).not.toHaveBeenCalled();
  });
  it("keeps existing capacity and returns the same invoice until authentication succeeds", async () => {
    const f = setup();
    const invoice = {
      id: "in_capacity",
      status: "open",
      customer: "cus_test",
      billing_reason: "subscription_update",
      parent: { subscription_details: { subscription: "sub_test" } },
      hosted_invoice_url: "https://invoice.stripe.com/i/capacity"
    };
    f.update.mockResolvedValue({
      ...f.context.stripeState.subscription,
      pending_update: { expires_at: 1999999999 },
      latest_invoice: invoice
    });
    expect(await f.run()).toEqual({ payment_required: { url: invoice.hosted_invoice_url } });
    expect(f.store.complete).not.toHaveBeenCalled();
    expect(f.update).toHaveBeenCalledWith(
      "sub_test",
      expect.objectContaining({
        payment_behavior: "pending_if_incomplete",
        proration_behavior: "always_invoice"
      }),
      expect.anything()
    );
  });
  it.each(["past_due", "incomplete", "unpaid", "canceled"])(
    "does not sell new capacity against a %s subscription",
    async (status) => {
      const f = setup();
      f.context.stripeState.subscription.status = status;
      expect(await f.run()).toBe("no_active_subscription");
      expect(f.update).not.toHaveBeenCalled();
    }
  );
  it("cancels the exact saved reduction with a stable release key", async () => {
    const f = setup();
    f.operation.kind = "capacity_cancel";
    f.context.stripeState.schedule = {
      id: "sched_current",
      subscription: "sub_test",
      status: "active",
      end_behavior: "release",
      current_phase: { start_date: 1790812800, end_date: 1793491200 },
      phases: [
        {
          start_date: 1790812800,
          end_date: 1793491200,
          items: [
            { price: "price_solo", quantity: 1 },
            { price: "price_solo_capacity", quantity: 7 }
          ]
        },
        {
          start_date: 1793491200,
          end_date: 1796083200,
          items: [
            { price: "price_solo", quantity: 1 },
            { price: "price_solo_capacity", quantity: 2 }
          ]
        }
      ]
    } as never;
    f.context.stripeState.pendingReduction = {
      additional_purchased: 2,
      total: 5,
      effective_at: "2026-11-01T00:00:00Z"
    } as never;
    expect(await f.run("capacity_cancel")).toMatchObject({
      capacity_units: { additional_purchased: 7, pending_reduction: null }
    });
    expect(f.release).toHaveBeenCalledWith(
      "sched_current",
      {},
      {
        timeout: 8000,
        maxNetworkRetries: 0,
        idempotencyKey: "billing-subscription:capacity_attempt:release"
      }
    );
  });
  it("keeps the exact provider key after an operation-completion write fails", async () => {
    const f = setup();
    vi.mocked(f.store.complete).mockResolvedValueOnce(false);
    expect(await f.run()).toBe("billing_not_configured");
    expect(await f.run()).toMatchObject({ capacity_units: { additional_purchased: 8 } });
    expect(f.update).toHaveBeenCalledTimes(1);
    expect(f.invoiceRetrieve).toHaveBeenCalledWith("in_paid", {}, expect.anything());
  });
  it("replays schedule creation with the same key if the returned schedule ID was not saved", async () => {
    const f = setup();
    f.operation.kind = "capacity_schedule";
    vi.mocked(f.store.saveResource).mockResolvedValueOnce(false);
    expect(await f.run("capacity_schedule", 2)).toBe("billing_not_configured");
    expect(await f.run("capacity_schedule", 2)).toMatchObject({
      capacity_units: { pending_reduction: { additional_purchased: 2 } }
    });
    expect(f.scheduleCreate.mock.calls[1]).toEqual(f.scheduleCreate.mock.calls[0]);
  });
  it("keeps the existing capacity proration behaviour with a persisted request and idempotency key", async () => {
    const f = setup();
    expect(await f.run()).toMatchObject({ capacity_units: { additional_purchased: 8 } });
    expect(f.update).toHaveBeenCalledWith(
      "sub_test",
      expect.objectContaining({
        proration_behavior: "always_invoice",
        items: [
          { id: "si_base", price: "price_solo", quantity: 1 },
          { id: "si_extra", price: "price_solo_capacity", quantity: 8 }
        ]
      }),
      {
        timeout: 8000,
        maxNetworkRetries: 0,
        idempotencyKey: "billing-subscription:capacity_attempt:update"
      }
    );
    expect(f.store.complete).toHaveBeenCalledWith("org_test", "capacity_attempt");
  });
  it("blocks capacity changes while an upgrade or another mutation holds the reservation", async () => {
    const f = setup();
    vi.mocked(f.store.claim).mockResolvedValue("billing_change_in_progress");
    expect(await f.run()).toBe("billing_change_in_progress");
    expect(f.loadContext).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });
  it("replays identical requests after an uncertain response and retains reservations after failures", async () => {
    const f = setup();
    f.update.mockRejectedValueOnce(new Error("timeout"));
    expect(await f.run()).toBe("billing_not_configured");
    expect(f.store.complete).not.toHaveBeenCalled();
    expect(f.store.abandonUnprepared).not.toHaveBeenCalled();
    await f.run();
    expect(f.update).toHaveBeenCalledTimes(2);
    expect(f.update.mock.calls[1]).toEqual(f.update.mock.calls[0]);
  });
  it("never replays old ambiguous mutation parameters after the provider idempotency window", async () => {
    const f = setup();
    f.update.mockRejectedValueOnce(new Error("lost response"));
    expect(await f.run()).toBe("billing_not_configured");
    f.operation.completed_at = null;
    f.operation.created_at = "2026-01-01T00:00:00Z";
    f.update.mockClear();
    expect(await f.run()).toBe("billing_change_in_progress");
    expect(f.update).not.toHaveBeenCalled();
  });
  it("uses separate durable keys for schedule creation and update and resumes the saved schedule", async () => {
    const f = setup();
    f.operation.kind = "capacity_schedule";
    f.scheduleUpdate.mockRejectedValueOnce(new Error("lost response"));
    expect(await f.run("capacity_schedule", 2)).toBe("billing_not_configured");
    expect(await f.run("capacity_schedule", 2)).toMatchObject({
      capacity_units: { pending_reduction: { additional_purchased: 2 } }
    });
    expect(f.scheduleCreate).toHaveBeenCalledTimes(1);
    expect(f.scheduleCreate).toHaveBeenCalledWith(
      { from_subscription: "sub_test" },
      {
        timeout: 8000,
        maxNetworkRetries: 0,
        idempotencyKey: "billing-subscription:capacity_attempt:create"
      }
    );
    expect(f.scheduleUpdate.mock.calls[1]).toEqual(f.scheduleUpdate.mock.calls[0]);
  });
  it("releases an unprepared reservation on invalid quantities and preserves paid status", async () => {
    const f = setup();
    expect(await f.run("capacity_increase", 1)).toBe("invalid_target_quantity");
    expect(f.store.abandonUnprepared).toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
    const other = setup();
    other.context.stripeState.subscription.pending_update = {} as never;
    expect(await other.run()).toBe("billing_change_in_progress");
    expect(other.update).not.toHaveBeenCalled();
  });
  it("does not release another account's schedule or apply a mismatched subscription snapshot", async () => {
    const f = setup();
    f.context.stripeState.subscription.customer = "cus_other";
    expect(await f.run()).toBe("no_active_subscription");
    expect(f.update).not.toHaveBeenCalled();
  });
});
