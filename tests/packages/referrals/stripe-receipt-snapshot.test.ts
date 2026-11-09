import { expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { readStripeReferralSnapshot } from "../../../packages/referrals/src/stripe-receipt-snapshot.js";
import { calculateReferralCommission } from "../../../packages/referrals/src/commission-policy.js";
import type { StripeBillingProvider } from "../../../packages/billing/src/stripe-subscription.js";
import { mockedObject } from "../../helpers/vitest.js";
const org = "11111111-1111-4111-8111-111111111111";
function setup() {
  const invoice = {
    id: "in_first",
    customer: "cus_one",
    currency: "usd",
    livemode: false,
    status: "paid",
    total: 5310,
    total_excluding_tax: 5310,
    parent: { subscription_details: { subscription: "sub_one" } }
  };
  const line = {
    id: "il_base",
    invoice: invoice.id,
    currency: "usd",
    subtotal: 5900,
    amount: 5900,
    discount_amounts: [{ amount: 590 }],
    pretax_credit_amounts: [{ type: "discount", amount: 590 }],
    taxes: [],
    period: { start: 1793491200, end: 1796083200 },
    pricing: { price_details: { price: "price_business" } },
    description: "private customer details"
  };
  const payment = {
    id: "inpay_first",
    invoice: invoice.id,
    status: "paid",
    currency: "usd",
    amount_paid: 5310,
    livemode: false,
    status_transitions: { paid_at: 1793491200 },
    payment: { type: "charge", charge: "ch_one" }
  };
  const charge = {
    id: "ch_one",
    customer: "cus_one",
    payment_intent: null,
    paid: true,
    captured: true,
    status: "succeeded",
    currency: "usd",
    amount: 5310,
    amount_captured: 5310,
    amount_refunded: 0,
    disputed: false,
    livemode: false,
    balance_transaction: "txn_one"
  };
  const invoices = vi.fn().mockResolvedValue({ data: [invoice], has_more: false }),
    lines = vi.fn().mockResolvedValue({ data: [line], has_more: false }),
    payments = vi.fn().mockResolvedValue({ data: [payment], has_more: false }),
    charges = vi.fn().mockResolvedValue(charge),
    refunds = vi.fn().mockResolvedValue({ data: [], has_more: false }),
    disputes = vi.fn().mockResolvedValue({ data: [], has_more: false }),
    notes = vi.fn().mockResolvedValue({ data: [], has_more: false });
  const provider = mockedObject<StripeBillingProvider>({
    priceMap: new Map([
      ["price_business", { plan: "business", type: "plan" }],
      ["price_extra", { plan: "business", type: "extra_capacity" }]
    ]),
    client: mockedObject<Stripe>({
      invoices: mockedObject<Stripe["invoices"]>({ list: invoices, listLineItems: lines }),
      invoicePayments: mockedObject<Stripe["invoicePayments"]>({ list: payments }),
      charges: mockedObject<Stripe["charges"]>({ retrieve: charges }),
      balanceTransactions: mockedObject<Stripe["balanceTransactions"]>({
        retrieve: vi.fn().mockResolvedValue({
          id: "txn_one",
          source: "ch_one",
          amount: 5310,
          currency: "usd",
          available_on: 1793664000
        })
      }),
      refunds: mockedObject<Stripe["refunds"]>({ list: refunds }),
      disputes: mockedObject<Stripe["disputes"]>({ list: disputes }),
      creditNotes: mockedObject<Stripe["creditNotes"]>({ list: notes })
    })
  });
  const read = () =>
    readStripeReferralSnapshot(provider, {
      organization_external_id: org,
      owner_identity_hash: "a".repeat(64),
      provider_customer_id: "cus_one"
    });
  return {
    invoice,
    line,
    payment,
    charge,
    invoices,
    lines,
    payments,
    charges,
    refunds,
    disputes,
    notes,
    provider,
    read
  };
}
it("freezes only verified financial facts and original collection chronology", async () => {
  const f = setup(),
    snapshot = await f.read(),
    invoice = snapshot.invoices[0]!;
  expect(invoice.payments).toEqual([
    {
      payment_id: "inpay_first",
      cash_minor: 5310,
      collected_at: "2026-11-01T00:00:00.000Z",
      provider_available_at: "2026-11-03T00:00:00.000Z"
    }
  ]);
  expect(
    calculateReferralCommission({
      first_paid_service_starts_at: "2026-11-01T00:00:00.000Z",
      lines: invoice.lines,
      cash_collected_minor: 5310,
      refunds: invoice.refunds
    })
  ).toBe(2655);
  expect(JSON.stringify(snapshot)).not.toContain("private");
});
it("resolves expanded provider identities and rejects a mismatched expanded customer before reading cash", async () => {
  const f = setup();
  f.invoices.mockResolvedValue({
    data: [{ ...f.invoice, customer: { id: "cus_one" } }],
    has_more: false
  });
  f.charges.mockResolvedValue({ ...f.charge, customer: { id: "cus_one" } });
  expect((await f.read()).invoices).toHaveLength(1);
  f.payments.mockClear();
  f.invoices.mockResolvedValue({
    data: [{ ...f.invoice, customer: { id: "cus_foreign" } }],
    has_more: false
  });
  await expect(f.read()).rejects.toThrow("referral_receipt_unverified");
  expect(f.payments).not.toHaveBeenCalled();
});
it("projects eligible draft invoices for benefit recovery without treating them as cash receipts", async () => {
  const f = setup();
  f.invoices.mockResolvedValue({
    data: [
      {
        ...f.invoice,
        status: "draft",
        created: 1793491200,
        amount_due: 5900,
        total: 5900,
        total_excluding_tax: 5900,
        status_transitions: { finalized_at: null },
        discounts: [],
        parent: {
          subscription_details: {
            subscription: "sub_one",
            metadata: { referral_attribution_id: "22222222-2222-4222-8222-222222222222" }
          }
        }
      }
    ],
    has_more: false
  });
  f.lines.mockResolvedValue({
    data: [{ ...f.line, discount_amounts: [], pretax_credit_amounts: [] }],
    has_more: false
  });
  const snapshot = await readStripeReferralSnapshot(
    f.provider,
    {
      organization_external_id: org,
      owner_identity_hash: "a".repeat(64),
      provider_customer_id: "cus_one"
    },
    { includeInvoiceBenefits: true }
  );
  expect(snapshot.invoices).toEqual([]);
  expect(snapshot.benefit_invoices).toEqual([
    expect.objectContaining({
      invoice_id: "in_first",
      finalized: false,
      amount_due_minor: 5900,
      business_base_net_minor: 5900,
      applied_coupon_ids: []
    })
  ]);
  expect(f.payments).not.toHaveBeenCalled();
  expect(f.invoices).toHaveBeenCalledWith(
    expect.objectContaining({ expand: ["data.discounts"] }),
    expect.any(Object)
  );
});
it("deduplicates a credit note's linked refund and keeps a capacity-only refund off the base commission", async () => {
  const f = setup();
  f.invoices.mockResolvedValue({
    data: [{ ...f.invoice, total: 5609, total_excluding_tax: 5609 }],
    has_more: false
  });
  f.lines.mockResolvedValue({
    data: [
      f.line,
      {
        ...f.line,
        id: "il_extra",
        subtotal: 299,
        amount: 299,
        discount_amounts: [],
        pretax_credit_amounts: [],
        pricing: { price_details: { price: "price_extra" } }
      }
    ],
    has_more: false
  });
  f.payments.mockResolvedValue({ data: [{ ...f.payment, amount_paid: 5609 }], has_more: false });
  f.charges.mockResolvedValue({
    ...f.charge,
    amount: 5609,
    amount_captured: 5609,
    amount_refunded: 299
  });
  vi.mocked(f.provider.client.balanceTransactions.retrieve).mockResolvedValue(
    mockedObject<Stripe.Response<Stripe.BalanceTransaction>>({
      id: "txn_one",
      source: "ch_one",
      amount: 5609,
      currency: "usd",
      available_on: 1793664000
    })
  );
  f.refunds.mockResolvedValue({
    data: [{ id: "re_extra", charge: "ch_one", amount: 299, currency: "usd", status: "succeeded" }],
    has_more: false
  });
  f.notes.mockResolvedValue({
    data: [
      {
        id: "cn_extra",
        invoice: "in_first",
        customer: "cus_one",
        currency: "usd",
        livemode: false,
        status: "issued",
        total: 299,
        total_excluding_tax: 299,
        pre_payment_amount: 0,
        post_payment_amount: 299,
        out_of_band_amount: 0,
        customer_balance_transaction: null,
        refunds: [{ refund: "re_extra", amount_refunded: 299, type: "refund" }],
        lines: {
          data: [
            {
              id: "cnli_extra",
              type: "invoice_line_item",
              invoice_line_item: "il_extra",
              amount: 299,
              discount_amount: 0,
              taxes: []
            }
          ],
          has_more: false
        }
      }
    ],
    has_more: false
  });
  const invoice = (await f.read()).invoices[0]!;
  expect(invoice.refunds.reduce((sum, r) => sum + r.cash_minor, 0)).toBe(299);
  expect(
    calculateReferralCommission({
      first_paid_service_starts_at: "2026-11-01T00:00:00.000Z",
      lines: invoice.lines,
      cash_collected_minor: 5609,
      refunds: invoice.refunds
    })
  ).toBe(2655);
});
it("apportions cumulative refunds of one charge across all of its invoice cash allocations", async () => {
  const f = setup();
  f.invoices.mockResolvedValue({
    data: [f.invoice, { ...f.invoice, id: "in_second", total: 4690, total_excluding_tax: 4690 }],
    has_more: false
  });
  f.lines.mockImplementation(async (id: string) => ({
    data: [
      id === "in_first"
        ? f.line
        : {
            ...f.line,
            id: "il_second",
            invoice: "in_second",
            subtotal: 4690,
            amount: 4690,
            discount_amounts: [],
            pretax_credit_amounts: []
          }
    ],
    has_more: false
  }));
  f.payments.mockImplementation(async (input: { invoice: string }) => ({
    data: [
      input.invoice === "in_first"
        ? f.payment
        : { ...f.payment, id: "inpay_second", invoice: "in_second", amount_paid: 4690 }
    ],
    has_more: false
  }));
  f.charges.mockResolvedValue({
    ...f.charge,
    amount: 10000,
    amount_captured: 10000,
    amount_refunded: 3333
  });
  vi.mocked(f.provider.client.balanceTransactions.retrieve).mockResolvedValue(
    mockedObject<Stripe.Response<Stripe.BalanceTransaction>>({
      id: "txn_one",
      source: "ch_one",
      amount: 10000,
      currency: "usd",
      available_on: 1793664000
    })
  );
  f.refunds.mockResolvedValue({
    data: [
      { id: "re_a", charge: "ch_one", currency: "usd", amount: 1000, status: "succeeded" },
      { id: "re_b", charge: "ch_one", currency: "usd", amount: 2333, status: "succeeded" }
    ],
    has_more: false
  });
  const snapshot = await f.read();
  expect(
    snapshot.invoices.map((i) => [
      i.invoice_id,
      i.refunds.reduce((sum, r) => sum + r.cash_minor, 0)
    ])
  ).toEqual([
    ["in_first", 1770],
    ["in_second", 1563]
  ]);
});
it.each(["needs_response", "lost", "won"])(
  "reconciles dispute outcome %s without inventing new cash",
  async (status) => {
    const f = setup();
    f.disputes.mockResolvedValue({
      data: [{ id: "dp_one", charge: "ch_one", currency: "usd", amount: 5310, status }],
      has_more: false
    });
    const invoice = (await f.read()).invoices[0]!;
    expect(invoice.disputed).toBe(status === "needs_response");
    expect(invoice.refunds.reduce((sum, r) => sum + r.cash_minor, 0)).toBe(
      status === "lost" ? 5310 : 0
    );
  }
);
it("keeps unsupported noncash credit allocations held instead of paying an inferred balance", async () => {
  const f = setup();
  f.notes.mockResolvedValue({
    data: [
      {
        id: "cn_credit",
        status: "issued",
        invoice: "in_first",
        customer: "cus_one",
        currency: "usd",
        livemode: false,
        total: 100,
        total_excluding_tax: 100,
        pre_payment_amount: 0,
        post_payment_amount: 100,
        customer_balance_transaction: "cbtxn_one",
        out_of_band_amount: 0,
        refunds: [],
        lines: { data: [], has_more: false }
      }
    ],
    has_more: false
  });
  expect((await f.read()).invoices[0]?.reconciliation_hold).toBe("credit_allocation_unverified");
});
it("never publishes a truncated provider invoice/line/refund history", async () => {
  const f = setup();
  f.lines.mockResolvedValueOnce({ data: [f.line], has_more: true });
  await expect(f.read()).rejects.toThrow("referral_history_incomplete");
  f.refunds.mockResolvedValueOnce({ data: [], has_more: true });
  await expect(f.read()).rejects.toThrow("referral_history_incomplete");
});

it.each(["credit_note", "refund", "dispute"] as const)(
  "holds a %s event until the complete list reflects its triggering resource",
  async (resource_type) => {
    const f = setup();
    await expect(
      readStripeReferralSnapshot(
        f.provider,
        {
          organization_external_id: org,
          owner_identity_hash: "a".repeat(64),
          provider_customer_id: "cus_one"
        },
        { expectedResource: { resource_type, resource_id: "missing_resource" } }
      )
    ).rejects.toThrow("referral_trigger_not_observed");
  }
);
