import { expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { StripeBillingProvider } from "../../../packages/billing/src/stripe-subscription.js";
import { restoreStripeReferralBenefit } from "../../../packages/referrals/src/stripe-benefit-recovery.js";
function fixture() {
  const organization = "11111111-1111-4111-8111-111111111111",
    attribution = "22222222-2222-4222-8222-222222222222";
  const subscription = {
    id: "sub_one",
    customer: "cus_one",
    livemode: false,
    status: "active",
    metadata: { organization_id: organization, referral_attribution_id: attribution },
    items: { has_more: false, data: [{ price: { id: "price_base" } }] }
  };
  const invoice = {
    id: "in_draft",
    customer: "cus_one",
    livemode: false,
    currency: "usd",
    created: 1793491200,
    amount_due: 5900,
    status: "draft",
    status_transitions: { finalized_at: null },
    parent: {
      subscription_details: {
        subscription: "sub_one",
        metadata: { referral_attribution_id: attribution }
      }
    },
    discounts: []
  } as unknown as Stripe.Invoice;
  const line = {
    id: "il_base",
    invoice: "in_draft",
    currency: "usd",
    subtotal: 5900,
    discount_amounts: [],
    pricing: { price_details: { price: "price_base" } }
  } as unknown as Stripe.InvoiceLineItem;
  const retrieveSub = vi.fn().mockResolvedValue(subscription),
    retrieveInvoice = vi.fn().mockResolvedValue(invoice),
    lines = vi.fn().mockResolvedValue({ has_more: false, data: [line] }),
    update = vi.fn().mockResolvedValue(invoice);
  const provider = {
    priceMap: new Map([["price_base", { plan: "business", type: "plan" }]]),
    client: {
      subscriptions: { retrieve: retrieveSub },
      invoices: { retrieve: retrieveInvoice, listLineItems: lines, update },
      coupons: {
        retrieve: vi.fn().mockResolvedValue({
          id: "coupon_referral",
          livemode: false,
          valid: true,
          percent_off: 10,
          amount_off: null,
          duration: "once",
          applies_to: { products: ["prod_base"] }
        })
      },
      prices: {
        retrieve: vi.fn().mockResolvedValue({
          id: "price_base",
          active: true,
          livemode: false,
          product: "prod_base"
        })
      }
    }
  } as unknown as StripeBillingProvider;
  const command = {
    organization_external_id: organization,
    attribution_id: attribution,
    provider_customer_id: "cus_one",
    provider_subscription_id: "sub_one",
    coupon_id: "coupon_referral",
    invoice_id: "in_draft",
    requested_at: new Date().toISOString(),
    livemode: false
  };
  return {
    provider,
    subscription,
    invoice,
    line,
    retrieveSub,
    retrieveInvoice,
    lines,
    update,
    command
  };
}
it("updates only the exact eligible draft invoice with a stable idempotency identity", async () => {
  const f = fixture();
  expect(await restoreStripeReferralBenefit(f.provider, f.command)).toBe("applied");
  expect(f.update).toHaveBeenCalledWith(
    "in_draft",
    { discounts: [{ coupon: "coupon_referral" }] },
    expect.objectContaining({
      idempotencyKey: expect.stringMatching(/^referral-benefit:[a-f0-9]{64}$/),
      timeout: expect.any(Number),
      maxNetworkRetries: 0
    })
  );
  const first = f.update.mock.calls[0]?.[2];
  f.command.requested_at = new Date(Date.now() - 48 * 3600000).toISOString();
  await restoreStripeReferralBenefit(f.provider, f.command);
  expect(f.update.mock.calls[1]?.[0]).toBe("in_draft");
  expect(f.update.mock.calls[1]?.[2]?.idempotencyKey).toBe(first?.idempotencyKey);
});
it("reads back an accepted draft discount after a lost acknowledgement", async () => {
  const f = fixture();
  f.retrieveInvoice.mockResolvedValue({
    ...f.invoice,
    amount_due: 5310,
    discounts: [
      { id: "di_one", promotion_code: null, source: { type: "coupon", coupon: "coupon_referral" } }
    ]
  });
  f.lines.mockResolvedValue({
    has_more: false,
    data: [{ ...f.line, discount_amounts: [{ amount: 590, discount: "di_one" }] }]
  });
  expect(await restoreStripeReferralBenefit(f.provider, f.command)).toBe("already_applied");
  expect(f.update).not.toHaveBeenCalled();
});
it("requests full reconciliation after finalisation and never selects another invoice", async () => {
  const f = fixture();
  f.retrieveInvoice.mockResolvedValue({
    ...f.invoice,
    status: "open",
    status_transitions: { finalized_at: 1793491201 }
  });
  expect(await restoreStripeReferralBenefit(f.provider, f.command)).toBe("recheck_invoices");
  expect(f.update).not.toHaveBeenCalled();
});
it.each(["foreign_coupon", "foreign_customer", "foreign_attribution", "zero", "incomplete"])(
  "refuses unsafe draft recovery: %s",
  async (reason) => {
    const f = fixture();
    if (reason === "foreign_coupon")
      f.retrieveInvoice.mockResolvedValue({
        ...f.invoice,
        discounts: [
          { id: "di_foreign", promotion_code: null, source: { type: "coupon", coupon: "foreign" } }
        ]
      });
    if (reason === "foreign_customer")
      f.retrieveSub.mockResolvedValue({ ...f.subscription, customer: "cus_foreign" });
    if (reason === "foreign_attribution")
      f.retrieveSub.mockResolvedValue({
        ...f.subscription,
        metadata: {
          ...f.subscription.metadata,
          referral_attribution_id: "33333333-3333-4333-8333-333333333333"
        }
      });
    if (reason === "zero") f.retrieveInvoice.mockResolvedValue({ ...f.invoice, amount_due: 0 });
    if (reason === "incomplete") f.lines.mockResolvedValue({ has_more: true, data: [f.line] });
    await expect(restoreStripeReferralBenefit(f.provider, f.command)).rejects.toThrow(
      "referral_benefit_recovery_unavailable"
    );
    expect(f.update).not.toHaveBeenCalled();
  }
);
