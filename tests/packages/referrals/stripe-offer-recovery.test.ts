import { readStripeOfferInvoice } from "../../../packages/referrals/src/stripe-offer-invoice.js";
import { expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { restoreStripeOfferBenefit } from "../../../packages/referrals/src/stripe-offer-recovery.js";
import type { StripeBillingProvider } from "../../../packages/billing/src/stripe-subscription.js";
import { mockedObject } from "../../helpers/vitest.js";
import { offerPolicy, offerDefinition, offerClaim } from "../../helpers/offer-fixtures.js";
function fixture() {
  const command = {
    organization_external_id: offerDefinition.programme_id,
    claim_id: offerClaim.claim_id,
    version_id: offerDefinition.version_id,
    provider_customer_id: "cus_offer",
    provider_subscription_id: "sub_offer",
    coupon_id: "coupon_offer",
    invoice_id: "in_offer",
    requested_at: "2026-11-16T00:00:00.000Z",
    livemode: false,
    policy: {
      ...offerPolicy,
      eligible_plans: ["team" as const],
      eligible_intervals: ["month" as const]
    }
  };
  const metadata = {
    organization_id: command.organization_external_id,
    offer_claim_id: command.claim_id,
    offer_version_id: command.version_id
  };
  const subscription = {
    id: "sub_offer",
    customer: "cus_offer",
    livemode: false,
    status: "active",
    metadata,
    items: { has_more: false, data: [{ price: { id: "price_base" } }] }
  };
  const invoice = mockedObject<Stripe.Invoice>({
    id: "in_offer",
    customer: "cus_offer",
    livemode: false,
    currency: "usd",
    created: 1794787200,
    amount_due: 1900,
    status: "draft",
    status_transitions: { finalized_at: null },
    parent: { subscription_details: { subscription: "sub_offer", metadata } },
    discounts: []
  });
  const line = mockedObject<Stripe.InvoiceLineItem>({
      id: "line_base",
      invoice: "in_offer",
      currency: "usd",
      subtotal: 1900,
      discount_amounts: [],
      pricing: { price_details: { price: "price_base" } }
    }),
    lines = { has_more: false, data: [line] },
    coupon = {
      id: "coupon_offer",
      valid: true,
      livemode: false,
      percent_off: 20,
      amount_off: null,
      duration: "once",
      max_redemptions: null,
      redeem_by: null,
      applies_to: { products: ["prod_base"] }
    };
  const retrieveInvoice = vi.fn().mockResolvedValue(invoice),
    update = vi.fn().mockResolvedValue(invoice),
    provider = mockedObject<StripeBillingProvider>({
      priceMap: new Map([
        ["price_base", { plan: "team", type: "plan", interval: "month", currency: "usd" }]
      ]),
      client: {
        subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
        invoices: {
          retrieve: retrieveInvoice,
          listLineItems: vi.fn().mockResolvedValue(lines),
          update
        },
        coupons: { retrieve: vi.fn().mockResolvedValue(coupon) },
        prices: {
          retrieve: vi.fn().mockResolvedValue({
            id: "price_base",
            active: true,
            livemode: false,
            currency: "usd",
            unit_amount: 1900,
            tax_behavior: "exclusive",
            recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
            product: "prod_base"
          })
        }
      }
    });
  return { command, subscription, invoice, line, lines, coupon, provider, retrieveInvoice, update };
}
it("updates only the exact saved draft with stable idempotency and no payment mutation", async () => {
  const f = fixture();
  expect(await restoreStripeOfferBenefit(f.provider, f.command)).toBe("applied");
  expect(f.update).toHaveBeenCalledWith(
    "in_offer",
    { discounts: [{ coupon: "coupon_offer" }] },
    expect.objectContaining({
      idempotencyKey: expect.stringMatching(/^offer-benefit:[a-f0-9]{64}$/),
      timeout: expect.any(Number),
      maxNetworkRetries: 0
    })
  );
  const key = f.update.mock.calls[0]![2].idempotencyKey;
  await restoreStripeOfferBenefit(f.provider, {
    ...f.command,
    requested_at: "2026-11-17T00:00:00.000Z"
  });
  expect(f.update.mock.calls[1]![2].idempotencyKey).toBe(key);
});
it("recognises an accepted discount after a lost acknowledgement and rechecks a finalised invoice", async () => {
  const f = fixture();
  f.invoice.amount_due = 1520;
  f.invoice.discounts = [
    mockedObject<Stripe.Discount>({
      id: "di_offer",
      promotion_code: null,
      source: { type: "coupon", coupon: "coupon_offer" }
    })
  ];
  f.line.discount_amounts = [{ amount: 380, discount: "di_offer" }];
  expect(await restoreStripeOfferBenefit(f.provider, f.command)).toBe("already_applied");
  expect(f.update).not.toHaveBeenCalled();
  f.invoice.status = "open";
  expect(await restoreStripeOfferBenefit(f.provider, f.command)).toBe("recheck_invoices");
  expect(f.update).not.toHaveBeenCalled();
});
it.each([
  "subscription-customer",
  "claim",
  "version",
  "mode",
  "ended",
  "subscription-page",
  "invoice-customer",
  "invoice-page",
  "zero",
  "foreign-discount",
  "invalid-coupon"
])("refuses unsafe draft recovery: %s", async (reason) => {
  const f = fixture();
  if (reason === "subscription-customer") f.subscription.customer = "other";
  if (reason === "claim")
    f.subscription.metadata.offer_claim_id = "00000000-0000-4000-8000-000000000099";
  if (reason === "version")
    f.subscription.metadata.offer_version_id = "00000000-0000-4000-8000-000000000099";
  if (reason === "mode") f.subscription.livemode = true;
  if (reason === "ended") f.subscription.status = "canceled";
  if (reason === "subscription-page") f.subscription.items.has_more = true;
  if (reason === "invoice-customer") f.invoice.customer = "other";
  if (reason === "invoice-page") f.lines.has_more = true;
  if (reason === "zero") f.invoice.amount_due = 0;
  if (reason === "foreign-discount")
    f.invoice.discounts = [
      mockedObject<Stripe.Discount>({
        id: "di_other",
        promotion_code: null,
        source: { type: "coupon", coupon: "other" }
      })
    ];
  if (reason === "invalid-coupon") f.coupon.valid = false;
  await expect(restoreStripeOfferBenefit(f.provider, f.command)).rejects.toThrow(
    "offer_benefit_recovery_unavailable"
  );
  expect(f.update).not.toHaveBeenCalled();
});

it("rejects malformed invoice discount evidence and ignores unrelated invoices", () => {
  const f = fixture();
  f.invoice.discounts = [mockedObject<Stripe.Discount>({ id: "malformed" })];
  expect(() =>
    readStripeOfferInvoice(f.invoice, [f.line], f.provider.priceMap, f.command.policy)
  ).toThrow("offer_invoice_benefit_unverified");
  f.invoice.parent = null;
  expect(
    readStripeOfferInvoice(f.invoice, [f.line], f.provider.priceMap, f.command.policy)
  ).toBeNull();
});
