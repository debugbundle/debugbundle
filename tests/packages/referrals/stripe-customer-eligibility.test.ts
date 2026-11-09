import { expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { readStripeCustomerPaymentHistory } from "../../../packages/referrals/src/stripe-customer-eligibility.js";
import { mockedObject } from "../../helpers/vitest.js";
function setup() {
  const customers = vi.fn().mockResolvedValue({ data: [], has_more: false }),
    invoices = vi.fn().mockResolvedValue({ data: [], has_more: false }),
    payments = vi.fn().mockResolvedValue({ data: [], has_more: false });
  const client = mockedObject<Stripe>({
    customers: mockedObject<Stripe["customers"]>({ list: customers }),
    invoices: mockedObject<Stripe["invoices"]>({ list: invoices }),
    invoicePayments: mockedObject<Stripe["invoicePayments"]>({ list: payments }),
    charges: mockedObject<Stripe["charges"]>({
      retrieve: vi.fn().mockResolvedValue({
        id: "ch_old",
        paid: true,
        captured: true,
        status: "succeeded",
        amount: 1900,
        amount_captured: 1900,
        currency: "usd",
        customer: "cus_old",
        payment_intent: null,
        livemode: false,
        balance_transaction: "txn_old"
      })
    }),
    balanceTransactions: mockedObject<Stripe["balanceTransactions"]>({
      retrieve: vi.fn().mockResolvedValue({
        id: "txn_old",
        source: "ch_old",
        amount: 1900,
        currency: "usd",
        available_on: 1794000000
      })
    })
  });
  return { client, customers, invoices, payments };
}
it("recognises a recreated account's prior cash subscription by its verified normalised billing identity", async () => {
  const f = setup();
  f.customers.mockResolvedValue({
    data: [{ id: "cus_old", email: "old@example.test" }],
    has_more: false
  });
  f.invoices.mockResolvedValue({
    data: [
      {
        id: "in_old",
        customer: "cus_old",
        currency: "usd",
        livemode: false,
        status: "paid",
        parent: { subscription_details: { subscription: "sub_old" } }
      }
    ],
    has_more: false
  });
  f.payments.mockResolvedValue({
    data: [
      {
        id: "inpay_old",
        invoice: "in_old",
        currency: "usd",
        livemode: false,
        status: "paid",
        amount_paid: 1900,
        status_transitions: { paid_at: 1794000000 },
        payment: { type: "charge", charge: "ch_old" }
      }
    ],
    has_more: false
  });
  expect(
    await readStripeCustomerPaymentHistory(f.client, {
      customer_id: null,
      verified_email: " Old@Example.Test "
    })
  ).toBe(true);
  expect(f.customers).toHaveBeenCalledWith(
    { email: "old@example.test", limit: 100 },
    { timeout: 8000, maxNetworkRetries: 0 }
  );
});
it("checks the retained customer even when the verified Owner's email has changed", async () => {
  const f = setup();
  await readStripeCustomerPaymentHistory(f.client, {
    customer_id: "cus_current",
    verified_email: "changed@example.test"
  });
  expect(f.invoices).toHaveBeenCalledWith(
    { customer: "cus_current", limit: 100 },
    expect.any(Object)
  );
  expect(f.customers).toHaveBeenCalledWith(
    { email: "changed@example.test", limit: 100 },
    expect.any(Object)
  );
});
it("does not treat incomplete or mismatched customer history as evidence of a new customer", async () => {
  const f = setup();
  f.customers.mockResolvedValueOnce({ data: [], has_more: true });
  await expect(
    readStripeCustomerPaymentHistory(f.client, {
      customer_id: null,
      verified_email: "new@example.test"
    })
  ).rejects.toThrow("referral_history_incomplete");
  f.customers.mockResolvedValueOnce({
    data: [{ id: "cus_wrong", email: "other@example.test" }],
    has_more: false
  });
  await expect(
    readStripeCustomerPaymentHistory(f.client, {
      customer_id: null,
      verified_email: "new@example.test"
    })
  ).rejects.toThrow("referral_customer_unverified");
});
