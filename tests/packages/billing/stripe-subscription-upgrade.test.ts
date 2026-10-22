import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { createUpgradeQuote } from "../../../packages/billing/src/stripe-upgrade-quote.js";
import {
  createStripeSubscriptionUpgradeLink,
  planItems
} from "../../../packages/billing/src/stripe-subscription-upgrade.js";
import type {
  BillingSubscriptionOperation,
  BillingSubscriptionOperationStore
} from "../../../packages/storage/src/billing-subscription-operation-store.js";

function setup() {
  const now = Date.parse("2026-10-22T04:00:00Z");
  let operation: BillingSubscriptionOperation | null = {
    id: "attempt-upgrade",
    organization_id: "org_test",
    subscription_id: "sub_existing",
    customer_id: "cus_existing",
    kind: "upgrade",
    intent: { target_plan: "team" },
    parameters: null,
    resource_id: null,
    created_at: new Date(now).toISOString(),
    completed_at: null
  };
  const store: BillingSubscriptionOperationStore = {
    get: vi.fn(async () => operation),
    claim: vi.fn(async () => operation ?? "billing_change_in_progress"),
    prepare: vi.fn(async (_org, _id, parameters) => {
      if (operation) operation.parameters ??= parameters;
      return operation;
    }),
    saveResource: vi.fn(async (_org, _id, resource) => {
      if (operation) operation.resource_id = resource;
      return true;
    }),
    complete: vi.fn(async () => {
      if (operation) operation.completed_at = new Date(now).toISOString();
      return true;
    }),
    abandonUnprepared: vi.fn(async () => true),
    retireVoidedPayment: vi.fn(async () => {
      operation = null;
      return true;
    })
  };
  const items = [
    { id: "si_base", price: { id: "price_solo" }, quantity: 1 },
    { id: "si_capacity", price: { id: "price_solo_capacity" }, quantity: 7 }
  ];
  const subscription = {
    id: "sub_existing",
    customer: "cus_existing",
    metadata: { organization_id: "org_test" },
    status: "active",
    collection_method: "charge_automatically",
    cancel_at_period_end: false,
    cancel_at: null,
    schedule: null,
    pending_update: null,
    items: { data: items, has_more: false },
    latest_invoice: { id: "in_original", status: "paid" }
  };
  const invoice = {
    id: "in_upgrade",
    customer: "cus_existing",
    status: "open",
    billing_reason: "subscription_update",
    parent: { subscription_details: { subscription: "sub_existing" } },
    hosted_invoice_url: "https://invoice.stripe.com/i/test_upgrade"
  };
  const retrieve = vi.fn().mockImplementation(async () => structuredClone(subscription));
  const update = vi.fn().mockImplementation(async () => ({
    ...structuredClone(subscription),
    pending_update: { expires_at: now / 1000 + 3600 },
    latest_invoice: structuredClone(invoice)
  }));
  const invoiceRetrieve = vi.fn().mockImplementation(async () => structuredClone(invoice));
  const provider = {
    client: {
      subscriptions: { retrieve, update },
      subscriptionSchedules: {
        retrieve: vi.fn(async () => ({
          status: "active",
          end_behavior: "release",
          metadata: {},
          phases: []
        }))
      },
      invoices: {
        retrieve: invoiceRetrieve,
        createPreview: vi.fn(async () => ({
          currency: "usd",
          amount_due: 700,
          total: 700,
          total_taxes: []
        }))
      }
    } as unknown as Stripe,
    webhookSecret: "synthetic_quote_secret",
    soloPriceId: "price_solo",
    teamPriceId: "price_team",
    soloExtraCapacityPriceId: "price_solo_capacity",
    teamExtraCapacityPriceId: "price_team_capacity"
  };
  const run = async (confirmed = true) => {
    const items = planItems(subscription as unknown as Stripe.Subscription, provider, "solo");
    const quote =
      items && confirmed
        ? await createUpgradeQuote({
            client: provider.client,
            secret: provider.webhookSecret,
            organizationId: "org_test",
            // The quote predates any subsequently scheduled conflicting change.
            subscription: { ...subscription, schedule: null } as unknown as Stripe.Subscription,
            items,
            additionalCapacityUnits: 7,
            now
          })
        : null;
    return createStripeSubscriptionUpgradeLink({
      provider,
      store,
      organizationId: "org_test",
      appBaseUrl: "https://app.debugbundle.test",
      ...(quote ? { confirmationToken: quote.confirmation_token } : {}),
      now
    });
  };
  return {
    run,
    store,
    operation: () => operation!,
    subscription,
    invoice,
    update,
    retrieve,
    invoiceRetrieve
  };
}

describe("same-subscription Solo to Team upgrade", () => {
  it("never attempts payment without explicit quote confirmation", async () => {
    const f = setup();
    expect(await f.run(false)).toBe("upgrade_confirmation_required");
    expect(f.update).not.toHaveBeenCalled();
    expect(f.store.prepare).not.toHaveBeenCalled();
  });
  it.each([1, 99])("preserves the exact %s-unit purchased-capacity boundary", async (quantity) => {
    const f = setup();
    f.subscription.items.data[1]!.quantity = quantity;
    await f.run();
    expect(f.update.mock.calls[0]?.[1]).toMatchObject({
      items: [
        { id: "si_base", quantity: 1 },
        { id: "si_capacity", quantity }
      ]
    });
  });
  it("upgrades a subscription with no add-on without purchasing extra capacity", async () => {
    const f = setup();
    f.subscription.items.data.splice(1);
    await f.run();
    expect(f.update.mock.calls[0]?.[1]).toMatchObject({
      items: [{ id: "si_base", price: "price_team", quantity: 1 }]
    });
  });
  it.each([0, 100, 1.5])(
    "refuses an invalid existing capacity quantity of %s before a charge",
    async (quantity) => {
      const f = setup();
      f.subscription.items.data[1]!.quantity = quantity;
      expect(await f.run()).toBe("checkout_not_allowed");
      expect(f.update).not.toHaveBeenCalled();
    }
  );
  it("tolerates a small DB clock offset without replaying substantially future-dated reservations", async () => {
    const f = setup();
    f.operation().created_at = "2026-10-22T04:00:00.020Z";
    expect(await f.run()).toEqual({ url: f.invoice.hosted_invoice_url });
    const other = setup();
    other.operation().created_at = "2026-10-23T04:00:00Z";
    expect(await other.run()).toBe("checkout_in_progress");
    expect(other.update).not.toHaveBeenCalled();
  });
  it("updates existing base and capacity items together, preserving quantity and fixing proration and idempotency", async () => {
    const f = setup();
    expect(await f.run()).toEqual({ url: f.invoice.hosted_invoice_url });
    expect(f.update).toHaveBeenCalledWith(
      "sub_existing",
      {
        items: [
          { id: "si_base", price: "price_team", quantity: 1 },
          { id: "si_capacity", price: "price_team_capacity", quantity: 7 }
        ],
        payment_behavior: "pending_if_incomplete",
        proration_behavior: "always_invoice",
        proration_date: 1792641600,
        expand: ["latest_invoice"]
      },
      {
        timeout: 8000,
        maxNetworkRetries: 0,
        idempotencyKey: "billing-subscription:attempt-upgrade:update"
      }
    );
    expect(f.store.complete).not.toHaveBeenCalled();
  });
  it("reuses the same invoice for declined or authentication-required payments without applying Team", async () => {
    const f = setup();
    await f.run();
    expect(await f.run()).toEqual({ url: f.invoice.hosted_invoice_url });
    expect(f.update).toHaveBeenCalledTimes(1);
    expect(f.invoiceRetrieve).toHaveBeenCalledWith(
      "in_upgrade",
      {},
      { timeout: 8000, maxNetworkRetries: 0 }
    );
    expect(f.subscription.items.data[0]?.price.id).toBe("price_solo");
    expect(f.store.complete).not.toHaveBeenCalled();
  });
  it("replays identical persisted parameters after a timeout or invoice-save failure", async () => {
    const f = setup();
    f.update.mockRejectedValueOnce(new Error("response lost after payment"));
    expect(await f.run()).toBe("billing_service_error");
    expect(await f.run()).toEqual({ url: f.invoice.hosted_invoice_url });
    expect(f.update.mock.calls[1]).toEqual(f.update.mock.calls[0]);
    const other = setup();
    vi.mocked(other.store.saveResource).mockResolvedValueOnce(false);
    expect(await other.run()).toBe("billing_service_error");
    other.operation().resource_id = null;
    expect(await other.run()).toEqual({ url: other.invoice.hosted_invoice_url });
    expect(other.update.mock.calls[1]).toEqual(other.update.mock.calls[0]);
  });
  it("does not replay an ambiguous operation beyond Stripe's idempotency retention window", async () => {
    const f = setup();
    f.operation().created_at = "2026-10-20T00:00:00Z";
    f.operation().parameters = { items: [] };
    expect(await f.run()).toBe("checkout_in_progress");
    expect(f.update).not.toHaveBeenCalled();
    expect(f.store.retireVoidedPayment).not.toHaveBeenCalled();
  });
  it("returns to existing billing polling only after paid Team items are authoritative", async () => {
    const f = setup();
    f.update.mockImplementationOnce(async () => {
      f.subscription.items.data[0]!.price.id = "price_team";
      f.subscription.items.data[1]!.price.id = "price_team_capacity";
      f.subscription.latest_invoice = { id: "in_upgrade", status: "paid" };
      return { ...f.subscription, latest_invoice: { ...f.invoice, status: "paid" } } as never;
    });
    expect(await f.run()).toEqual({ url: "https://app.debugbundle.test/billing?checkout=success" });
    expect(f.store.complete).toHaveBeenCalledTimes(1);
    expect(f.update).toHaveBeenCalledTimes(1);
  });
  it("retains a paid invoice awaiting application instead of charging again", async () => {
    const f = setup();
    await f.run();
    f.invoice.status = "paid";
    expect(await f.run()).toBe("checkout_in_progress");
    expect(f.update).toHaveBeenCalledTimes(1);
    expect(f.store.complete).not.toHaveBeenCalled();
  });
  it.each(["past_due", "canceled", "incomplete", "paused", "trialing"])(
    "rejects unsafe %s subscriptions before provider mutation",
    async (status) => {
      const f = setup();
      f.subscription.status = status;
      expect(await f.run()).toBe("checkout_not_allowed");
      expect(f.update).not.toHaveBeenCalled();
    }
  );
  it.each([
    "schedule",
    "pending_update",
    "cancel_at_period_end",
    "customer",
    "metadata",
    "unpaid_invoice",
    "partial_items",
    "unknown_item"
  ])("fails closed for %s", async (reason) => {
    const f = setup();
    if (reason === "schedule") f.subscription.schedule = "sub_sched" as never;
    if (reason === "pending_update") f.subscription.pending_update = {} as never;
    if (reason === "cancel_at_period_end") f.subscription.cancel_at_period_end = true;
    if (reason === "customer") f.subscription.customer = "cus_other";
    if (reason === "metadata") f.subscription.metadata.organization_id = "org_other";
    if (reason === "unpaid_invoice") f.subscription.latest_invoice.status = "open";
    if (reason === "partial_items") f.subscription.items.has_more = true;
    if (reason === "unknown_item") f.subscription.items.data[1]!.price.id = "price_unknown";
    expect(await f.run()).toBe("checkout_not_allowed");
    expect(f.update).not.toHaveBeenCalled();
  });
  it("fails closed for a mismatched invoice and for an unusable payment URL", async () => {
    const f = setup();
    f.invoice.customer = "cus_other";
    expect(await f.run()).toBe("billing_service_error");
    const other = setup();
    other.invoice.hosted_invoice_url = "https://attacker.test/pay";
    expect(await other.run()).toBe("billing_service_error");
  });
  it("permits replacement only after a provider-voided invoice with no pending update", async () => {
    const f = setup();
    await f.run();
    f.invoice.status = "void";
    expect(await f.run()).toBe("checkout_in_progress");
    expect(f.store.retireVoidedPayment).toHaveBeenCalledWith(
      "org_test",
      "attempt-upgrade",
      "in_upgrade"
    );
    expect(f.update).toHaveBeenCalledTimes(1);
  });
});
