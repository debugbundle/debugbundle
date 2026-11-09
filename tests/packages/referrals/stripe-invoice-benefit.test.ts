import { expect, it } from "vitest";
import type Stripe from "stripe";
import { readStripeInvoiceBenefit } from "../../../packages/referrals/src/stripe-invoice-benefit.js";
const prices = new Map([
  ["price_base", { plan: "business" as const, type: "plan" as const }],
  ["price_extra", { plan: "business" as const, type: "extra_capacity" as const }]
]);
const invoice = {
  id: "in_one",
  customer: "cus_one",
  livemode: false,
  currency: "usd",
  created: 1793491200,
  amount_due: 5310,
  status: "open",
  status_transitions: { finalized_at: 1793491201 },
  parent: { subscription_details: { subscription: "sub_one" } },
  discounts: [
    { id: "di_one", source: { type: "coupon", coupon: "coupon_one" }, promotion_code: null }
  ]
} as unknown as Stripe.Invoice;
const line = {
  id: "il_one",
  invoice: "in_one",
  currency: "usd",
  subtotal: 5900,
  discount_amounts: [{ amount: 590, discount: "di_one" }],
  pricing: { price_details: { price: "price_base" } }
} as unknown as Stripe.InvoiceLineItem;
it("retains only verified invoice identities and base-only ten percent application", () => {
  expect(readStripeInvoiceBenefit(invoice, [line], prices)).toMatchObject({
    invoice_id: "in_one",
    subscription_id: "sub_one",
    finalized: true,
    amount_due_minor: 5310,
    business_base_net_minor: 5310,
    applied_coupon_ids: ["coupon_one"],
    ten_percent_base_coupon_ids: ["coupon_one"]
  });
});
it("does not mistake a zero/trial bill or an unrelated promotion for a positive eligible base discount", () => {
  expect(
    readStripeInvoiceBenefit(
      { ...invoice, amount_due: 0 },
      [{ ...line, subtotal: 0, discount_amounts: [] }],
      prices
    )
  ).toMatchObject({
    amount_due_minor: 0,
    business_base_net_minor: 0,
    ten_percent_base_coupon_ids: []
  });
  expect(
    readStripeInvoiceBenefit(
      invoice,
      [{ ...line, discount_amounts: [{ amount: 1180, discount: "di_one" }] }],
      prices
    )?.ten_percent_base_coupon_ids
  ).toEqual([]);
});
it("refuses a base coupon that also discounted capacity or has unexpanded discount identity", () => {
  const extra = {
    ...line,
    id: "il_extra",
    subtotal: 299,
    discount_amounts: [{ amount: 30, discount: "di_one" }],
    pricing: { price_details: { price: "price_extra", product: "prod_extra" } }
  } as unknown as Stripe.InvoiceLineItem;
  expect(
    readStripeInvoiceBenefit(invoice, [line, extra], prices)?.ten_percent_base_coupon_ids
  ).toEqual([]);
  expect(() =>
    readStripeInvoiceBenefit({ ...invoice, discounts: ["di_one"] }, [line], prices)
  ).toThrow("referral_invoice_benefit_unverified");
});
