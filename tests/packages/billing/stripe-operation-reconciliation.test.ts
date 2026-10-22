import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { reconcileStripeSubscriptionOperation } from "../../../packages/billing/src/stripe-operation-reconciliation.js";
import { createMemoryBillingSubscriptionOperationStore } from "../../helpers/billing-subscription-operations.js";

async function setup() {
  const store = createMemoryBillingSubscriptionOperationStore("sub_test", "cus_test");
  const operation = await store.claim({
    organization_id: "org_test",
    kind: "upgrade",
    intent: { target_plan: "team" }
  });
  if (typeof operation === "string") throw new Error(operation);
  await store.prepare("org_test", operation.id, {
    items: [
      { id: "si_base", price: "price_team", quantity: 1 },
      { id: "si_extra", price: "price_team_capacity", quantity: 7 }
    ]
  });
  await store.saveResource("org_test", operation.id, "in_upgrade");
  const invoice = {
    id: "in_upgrade",
    status: "paid",
    customer: "cus_test",
    billing_reason: "subscription_update",
    parent: { subscription_details: { subscription: "sub_test" } }
  };
  const subscription = {
    id: "sub_test",
    customer: "cus_test",
    status: "active",
    metadata: { organization_id: "org_test" },
    pending_update: null as unknown,
    items: {
      has_more: false,
      data: [
        { id: "si_base", price: { id: "price_team" }, quantity: 1 },
        { id: "si_extra", price: { id: "price_team_capacity" }, quantity: 7 }
      ]
    },
    latest_invoice: invoice
  };
  const retrieve = vi.fn(async () => invoice);
  const client = { invoices: { retrieve } } as unknown as Stripe;
  const run = () =>
    reconcileStripeSubscriptionOperation({
      store,
      client,
      organizationId: "org_test",
      subscription: subscription as unknown as Stripe.Subscription
    });
  const capacity = () =>
    store.claim({ organization_id: "org_test", kind: "capacity_increase", intent: { target: 8 } });
  return { store, operation, invoice, subscription, run, retrieve, capacity };
}

describe("subscription-operation read reconciliation", () => {
  it("unlocks capacity after a hosted payment applies the exact upgrade, without another upgrade click", async () => {
    const f = await setup();
    expect(await f.capacity()).toBe("billing_change_in_progress");
    await f.run();
    expect(await f.capacity()).toMatchObject({ kind: "capacity_increase" });
  });
  it.each([
    "unpaid",
    "pending",
    "wrong_customer",
    "wrong_subscription",
    "wrong_quantity",
    "partial_items"
  ])("retains uncertain %s upgrades", async (reason) => {
    const f = await setup();
    if (reason === "unpaid") f.invoice.status = "open";
    if (reason === "pending") f.subscription.pending_update = {};
    if (reason === "wrong_customer") f.invoice.customer = "cus_other";
    if (reason === "wrong_subscription")
      f.invoice.parent.subscription_details.subscription = "sub_other";
    if (reason === "wrong_quantity") f.subscription.items.data[1]!.quantity = 6;
    if (reason === "partial_items") f.subscription.items.has_more = true;
    await f.run();
    expect(await f.capacity()).toBe("billing_change_in_progress");
  });
  it("retains a provider read failure without dispatching any payment mutation", async () => {
    const f = await setup();
    f.retrieve.mockRejectedValue(new Error("timeout"));
    await expect(f.run()).rejects.toThrow("timeout");
    expect(await f.capacity()).toBe("billing_change_in_progress");
  });
});
