import { expect, it, vi } from "vitest";
import { previewStripeSubscriptionUpgrade } from "../../../packages/billing/src/stripe-upgrade-preview.js";
function fixture() {
  const subscription = {
    id: "sub_test",
    customer: "cus_test",
    metadata: { organization_id: "org_test" },
    status: "active",
    collection_method: "charge_automatically",
    schedule: null as unknown,
    pending_update: null as unknown,
    cancel_at: null as unknown,
    cancel_at_period_end: false,
    latest_invoice: { id: "in_original", status: "paid" },
    items: {
      has_more: false,
      data: [
        { id: "si_base", price: { id: "price_solo" }, quantity: 1 },
        { id: "si_capacity", price: { id: "price_solo_capacity" }, quantity: 7 }
      ]
    }
  };
  const invoice = {
    id: "in_update",
    customer: "cus_test",
    status: "open",
    billing_reason: "subscription_update",
    parent: { subscription_details: { subscription: "sub_test" } },
    hosted_invoice_url: "https://invoice.stripe.com/i/test_update"
  };
  const get = vi.fn().mockResolvedValue(null);
  const update = vi.fn();
  const retrieve = vi.fn(async () => subscription);
  const invoiceRetrieve = vi.fn(async () => invoice);
  const preview = vi.fn(async () => ({
    currency: "usd",
    amount_due: 804,
    total: 804,
    total_taxes: []
  }));
  const input = {
    organizationId: "org_test",
    subscriptionId: "sub_test",
    customerId: "cus_test",
    store: { get } as never,
    provider: {
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
        invoices: { retrieve: invoiceRetrieve, createPreview: preview }
      },
      webhookSecret: "synthetic",
      soloPriceId: "price_solo",
      teamPriceId: "price_team",
      soloExtraCapacityPriceId: "price_solo_capacity",
      teamExtraCapacityPriceId: "price_team_capacity"
    } as never
  };
  return {
    subscription,
    invoice,
    get,
    update,
    retrieve,
    invoiceRetrieve,
    preview,
    run: () => previewStripeSubscriptionUpgrade(input)
  };
}
it("quotes the exact retained capacity without reserving or updating a subscription", async () => {
  const f = fixture();
  expect(await f.run()).toMatchObject({ quote: { additional_capacity_units: 7, amount_due: 804 } });
  expect(f.update).not.toHaveBeenCalled();
});
it.each([
  "other_customer",
  "other_org",
  "scheduled",
  "pending",
  "canceling",
  "past_due",
  "unpaid",
  "manual_collection",
  "unknown_items"
])("does not offer a payable quote for %s", async (reason) => {
  const f = fixture();
  if (reason === "other_customer") f.subscription.customer = "cus_other";
  if (reason === "other_org") f.subscription.metadata.organization_id = "org_other";
  if (reason === "scheduled") f.subscription.schedule = "sched_other";
  if (reason === "pending") f.subscription.pending_update = {};
  if (reason === "canceling") f.subscription.cancel_at_period_end = true;
  if (reason === "past_due") f.subscription.status = "past_due";
  if (reason === "unpaid") f.subscription.latest_invoice.status = "open";
  if (reason === "manual_collection") f.subscription.collection_method = "send_invoice";
  if (reason === "unknown_items") f.subscription.items.data[0]!.price.id = "unknown";
  expect(await f.run()).toBe("checkout_not_allowed");
  expect(f.preview).not.toHaveBeenCalled();
  expect(f.update).not.toHaveBeenCalled();
});
it.each(["open", "ambiguous", "other_invoice", "paid", "unsafe_url"])(
  "resumes only the exact saved unpaid invoice (%s)",
  async (reason) => {
    const f = fixture();
    f.get.mockResolvedValue({
      kind: "upgrade",
      completed_at: null,
      parameters: {},
      resource_id: reason === "ambiguous" ? null : "in_update",
      subscription_id: "sub_test",
      customer_id: "cus_test"
    });
    if (reason === "other_invoice") f.invoice.customer = "cus_other";
    if (reason === "paid") f.invoice.status = "paid";
    if (reason === "unsafe_url") f.invoice.hosted_invoice_url = "https://unexpected.test/payment";
    expect(await f.run()).toEqual(
      reason === "open" ? { payment_url: f.invoice.hosted_invoice_url } : "checkout_in_progress"
    );
    expect(f.preview).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  }
);
it("fails closed when Stripe cannot supply a preview", async () => {
  const f = fixture();
  f.preview.mockRejectedValue(new Error("provider unavailable"));
  expect(await f.run()).toBe("billing_service_error");
  expect(f.update).not.toHaveBeenCalled();
});
