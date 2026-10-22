import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import {
  createUpgradeQuote,
  verifyUpgradeQuote
} from "../../../packages/billing/src/stripe-upgrade-quote.js";

function fixture() {
  const now = Date.parse("2026-10-22T07:00:00Z");
  const subscription = {
    id: "sub_test",
    customer: "cus_test",
    status: "active",
    items: { data: [{ id: "si_base", price: { id: "price_solo" }, quantity: 1 }], has_more: false }
  };
  const items = [{ id: "si_base", price: "price_team", quantity: 1 }];
  const createPreview = vi.fn(async (params: Stripe.InvoiceCreatePreviewParams) => ({
    currency: "usd",
    amount_due: 824,
    total: params.preview_mode === "recurring" ? 2052 : 824,
    total_taxes: [{ amount: params.preview_mode === "recurring" ? 152 : 61 }],
    automatic_tax: { status: "complete" }
  }));
  const input = {
    client: { invoices: { createPreview } } as never,
    secret: "synthetic_quote_key",
    organizationId: "org_test",
    subscription: subscription as never,
    items,
    additionalCapacityUnits: 0,
    now
  };
  return { input, subscription, createPreview, now };
}
describe("billing upgrade confirmation quotes", () => {
  it("quotes due-now tax and recurring totals without a payment mutation", async () => {
    const f = fixture();
    const quote = await createUpgradeQuote(f.input);
    expect(quote).toMatchObject({
      amount_due: 824,
      tax: 61,
      monthly_total: 2052,
      currency: "usd",
      additional_capacity_units: 0
    });
    expect(verifyUpgradeQuote({ ...f.input, token: quote.confirmation_token })).toMatchObject({
      proration_date: f.now / 1000
    });
    expect(f.createPreview).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        subscription: "sub_test",
        subscription_details: {
          items: f.input.items,
          proration_behavior: "always_invoice",
          proration_date: f.now / 1000
        }
      }),
      { timeout: 8000, maxNetworkRetries: 0 }
    );
  });
  it.each(["tampered", "expired", "another_org", "changed_items", "changed_key"])(
    "rejects a %s quote before payment",
    async (reason) => {
      const f = fixture();
      const quote = await createUpgradeQuote(f.input);
      const check = { ...f.input, token: quote.confirmation_token };
      if (reason === "tampered") check.token += "x";
      if (reason === "expired") check.now += 11 * 60_000;
      if (reason === "another_org") check.organizationId = "org_other";
      if (reason === "changed_items") f.subscription.items.data[0]!.quantity = 2;
      if (reason === "changed_key") check.secret = "another_key";
      expect(verifyUpgradeQuote(check)).toBeNull();
    }
  );
});

it("does not quote incomplete automatic-tax calculations", async () => {
  const f = fixture();
  f.createPreview.mockResolvedValue({
    currency: "usd",
    amount_due: 824,
    total: 824,
    total_taxes: [],
    automatic_tax: { status: "requires_location_inputs" }
  });
  await expect(createUpgradeQuote(f.input)).rejects.toThrow("billing_quote_unavailable");
});

it.each(["valid", "one_off", "partial", "proration", "wrong_price"])(
  "checks completed-schedule recurring estimates for %s lines",
  async (reason) => {
    const f = fixture();
    Object.assign(f.subscription, { schedule: "sched_completed" });
    f.createPreview.mockImplementation(async (params) => ({
      currency: "usd",
      amount_due: 824,
      total: params.preview_mode === "next" ? 2052 : 824,
      total_taxes: [],
      automatic_tax: { status: "complete" },
      lines: {
        has_more: reason === "partial",
        data: [
          {
            parent: {
              type: reason === "one_off" ? "invoice_item_details" : "subscription_item_details",
              subscription_item_details: { proration: reason === "proration" }
            },
            pricing: {
              price_details: { price: reason === "wrong_price" ? "price_other" : "price_team" }
            },
            quantity: 1
          }
        ]
      }
    }));
    if (reason === "valid")
      expect(await createUpgradeQuote(f.input)).toMatchObject({ monthly_total: 2052 });
    else
      await expect(createUpgradeQuote(f.input)).rejects.toThrow(
        "billing_recurring_quote_unavailable"
      );
  }
);
