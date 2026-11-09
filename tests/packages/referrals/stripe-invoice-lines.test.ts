import { expect, it } from "vitest";
import type Stripe from "stripe";
import { mapStripeReferralInvoiceLines } from "../../../packages/referrals/src/stripe-invoice-lines.js";
import { mockedObject } from "../../helpers/vitest.js";
import type { StripePriceMapping } from "../../../packages/billing/src/stripe-subscription.js";
const prices = new Map<string, StripePriceMapping>([
  ["price_business", { plan: "business", type: "plan" }],
  ["price_extra", { plan: "business", type: "extra_capacity" }]
]);
const invoice = { id: "in_one", currency: "usd", total: 6173, total_excluding_tax: 5583 };
function line(overrides: Record<string, unknown> = {}) {
  return mockedObject<Stripe.InvoiceLineItem>({
    id: "il_base",
    invoice: "in_one",
    currency: "usd",
    subtotal: 5900,
    amount: 5900,
    discount_amounts: [{ amount: 590, discount: "di_one" }],
    pretax_credit_amounts: [{ type: "discount", amount: 590, discount: "di_one" }],
    taxes: [{ amount: 590, tax_behavior: "exclusive" }],
    period: { start: 1793491200, end: 1796083200 },
    pricing: { price_details: { price: "price_business" } },
    description: "private customer description",
    metadata: { secret: "private" },
    ...overrides
  });
}
it("uses verified net lines without double subtracting discounts or persisting captured descriptions", () => {
  const result = mapStripeReferralInvoiceLines(
    invoice,
    [
      line(),
      line({
        id: "il_extra",
        subtotal: 273,
        amount: 273,
        discount_amounts: [],
        pretax_credit_amounts: [],
        taxes: [],
        pricing: { price_details: { price: "price_extra" } }
      })
    ],
    prices
  );
  expect(result[0]).toEqual({
    id: "il_base",
    plan: "business",
    kind: "plan",
    net_amount_minor: 5310,
    tax_amount_minor: 590,
    service_starts_at: "2026-11-01T00:00:00.000Z",
    service_ends_at: "2026-12-01T00:00:00.000Z"
  });
  expect(result[1]).toMatchObject({ kind: "extra_capacity", net_amount_minor: 273 });
  expect(JSON.stringify(result)).not.toContain("private");
});
it("accounts for credit grants once and requires the final provider net/tax totals to match", () => {
  expect(
    mapStripeReferralInvoiceLines(
      { id: "in_one", currency: "usd", total: 5400, total_excluding_tax: 4810 },
      [
        line({
          pretax_credit_amounts: [
            { type: "discount", amount: 590 },
            { type: "credit_balance_transaction", amount: 500 }
          ]
        })
      ],
      prices
    )[0]?.net_amount_minor
  ).toBe(4810);
  expect(() =>
    mapStripeReferralInvoiceLines(
      { id: "in_one", currency: "usd", total: 5901, total_excluding_tax: 5310 },
      [line()],
      prices
    )
  ).toThrow("referral_invoice_lines_unverified");
});
it("includes unrelated cash charges in allocation without declaring them Business base revenue", () => {
  const result = mapStripeReferralInvoiceLines(
    { id: "in_one", currency: "usd", total: 100, total_excluding_tax: 100 },
    [
      line({
        id: "il_other",
        subtotal: 100,
        amount: 100,
        discount_amounts: [],
        pretax_credit_amounts: [],
        taxes: [],
        period: { start: 1793491200, end: 1793491200 },
        pricing: null
      })
    ],
    prices
  );
  expect(result[0]).toMatchObject({ plan: "free", kind: "other", net_amount_minor: 100 });
});
it.each([
  { currency: "eur" },
  { invoice: "in_other" },
  { subtotal: 1.1 },
  { discount_amounts: [{ amount: 589 }] },
  { period: { start: 1793491200, end: 1793491200 } }
])("refuses inconsistent line facts %j", (changes) => {
  expect(() =>
    mapStripeReferralInvoiceLines(
      { id: "in_one", currency: "usd", total: 5900, total_excluding_tax: 5310 },
      [line(changes)],
      prices
    )
  ).toThrow("referral_invoice_lines_unverified");
});
