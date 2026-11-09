import { afterEach, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
  readStripeInvoiceCash,
  hasStripePaidSubscriptionHistory
} from "../../../packages/referrals/src/stripe-cash-receipts.js";
import { mockedObject } from "../../helpers/vitest.js";
afterEach(() => vi.restoreAllMocks());
const payment = {
  id: "inpay_one",
  invoice: "in_one",
  status: "paid",
  currency: "usd",
  amount_paid: 5310,
  livemode: false,
  status_transitions: { paid_at: 1794000000 },
  payment: { type: "payment_intent", payment_intent: "pi_one" }
};
function provider(changes: Record<string, unknown> = {}) {
  const payments = vi.fn().mockResolvedValue({ data: [payment], has_more: false });
  const charge = vi.fn().mockResolvedValue({
    id: "ch_one",
    customer: "cus_one",
    payment_intent: "pi_one",
    paid: true,
    captured: true,
    status: "succeeded",
    currency: "usd",
    amount: 10000,
    amount_captured: 10000,
    livemode: false,
    balance_transaction: "txn_one",
    ...changes
  });
  return {
    payments,
    charge,
    client: mockedObject<Stripe>({
      invoicePayments: mockedObject<Stripe["invoicePayments"]>({ list: payments }),
      paymentIntents: mockedObject<Stripe["paymentIntents"]>({
        retrieve: vi.fn().mockResolvedValue({
          id: "pi_one",
          customer: "cus_one",
          status: "succeeded",
          currency: "usd",
          latest_charge: "ch_one",
          livemode: false
        })
      }),
      charges: mockedObject<Stripe["charges"]>({ retrieve: charge }),
      balanceTransactions: mockedObject<Stripe["balanceTransactions"]>({
        retrieve: vi.fn().mockResolvedValue({
          id: "txn_one",
          source: "ch_one",
          amount:
            typeof changes["amount_captured"] === "number" ? changes["amount_captured"] : 10000,
          currency: "usd",
          created: 1794000000,
          available_on: 1794100000
        })
      })
    })
  };
}
it("uses only the invoice's verified cash allocation, never the whole charge", async () => {
  const { client } = provider();
  expect(
    await readStripeInvoiceCash(client, {
      invoice_id: "in_one",
      customer_id: "cus_one",
      currency: "usd",
      livemode: false
    })
  ).toEqual([
    {
      payment_id: "inpay_one",
      charge_id: "ch_one",
      payment_intent_id: "pi_one",
      cash_minor: 5310,
      charge_cash_minor: 10000,
      collected_at: "2026-11-06T21:20:00.000Z",
      provider_available_at: new Date(1794100000 * 1000).toISOString()
    }
  ]);
});
it("keeps source-currency cash when Stripe settles it in a different currency", async () => {
  const { client } = provider();
  vi.mocked(client.balanceTransactions.retrieve).mockResolvedValueOnce(
    mockedObject<Stripe.Response<Stripe.BalanceTransaction>>({
      id: "txn_one",
      source: "ch_one",
      amount: 9200,
      currency: "eur",
      exchange_rate: 0.92,
      available_on: 1794100000
    })
  );
  const cash = await readStripeInvoiceCash(client, {
    invoice_id: "in_one",
    customer_id: "cus_one",
    currency: "usd",
    livemode: false
  });
  expect(cash[0]).toMatchObject({ cash_minor: 5310, charge_cash_minor: 10000 });
});
it.each([
  { currency: "usd", amount: 9200, exchange_rate: null },
  { currency: "eur", amount: 9200, exchange_rate: null },
  { currency: "eur", amount: 9200, exchange_rate: 0 },
  { currency: "eur", amount: 0, exchange_rate: 0.92 },
  { currency: "invalid", amount: 9200, exchange_rate: 0.92 }
])("refuses an unverified settlement balance %j", async (change) => {
  const { client } = provider();
  vi.mocked(client.balanceTransactions.retrieve).mockResolvedValueOnce(
    mockedObject<Stripe.Response<Stripe.BalanceTransaction>>({
      id: "txn_one",
      source: "ch_one",
      available_on: 1794100000,
      ...change
    })
  );
  await expect(
    readStripeInvoiceCash(client, {
      invoice_id: "in_one",
      customer_id: "cus_one",
      currency: "usd",
      livemode: false
    })
  ).rejects.toThrow("referral_cash_unverified");
});
it("uses captured cash rather than an authorised-but-uncaptured remainder", async () => {
  const { client } = provider({ amount_captured: 5310 });
  const result = await readStripeInvoiceCash(client, {
    invoice_id: "in_one",
    customer_id: "cus_one",
    currency: "usd",
    livemode: false
  });
  expect(result[0]).toMatchObject({ cash_minor: 5310, charge_cash_minor: 5310 });
});
it("excludes zero, open and manual payment records without treating them as cash", async () => {
  const { client, payments, charge } = provider();
  payments.mockResolvedValue({
    data: [
      { ...payment, amount_paid: 0 },
      { ...payment, id: "inpay_open", status: "open" },
      {
        ...payment,
        id: "inpay_manual",
        payment: { type: "payment_record", payment_record: "pr_one" }
      }
    ],
    has_more: false
  });
  expect(
    await readStripeInvoiceCash(client, {
      invoice_id: "in_one",
      customer_id: "cus_one",
      currency: "usd",
      livemode: false
    })
  ).toEqual([]);
  expect(charge).not.toHaveBeenCalled();
});
it.each([
  { paid: false },
  { captured: false },
  { status: "pending" },
  { customer: "cus_other" },
  { payment_intent: "pi_other" },
  { currency: "eur" },
  { amount: 100 },
  { amount_captured: 100 },
  { balance_transaction: null },
  { livemode: true }
])("refuses inconsistent or uncollected charge facts %j", async (changes) => {
  const { client } = provider(changes);
  await expect(
    readStripeInvoiceCash(client, {
      invoice_id: "in_one",
      customer_id: "cus_one",
      currency: "usd",
      livemode: false
    })
  ).rejects.toThrow("referral_cash_unverified");
});
it("does not silently accept truncated or duplicate payment lists", async () => {
  const { client, payments } = provider();
  payments.mockResolvedValueOnce({ data: [payment], has_more: true });
  await expect(
    readStripeInvoiceCash(client, {
      invoice_id: "in_one",
      customer_id: "cus_one",
      currency: "usd",
      livemode: false
    })
  ).rejects.toThrow("referral_history_incomplete");
  payments.mockResolvedValueOnce({ data: [payment, payment], has_more: false });
  await expect(
    readStripeInvoiceCash(client, {
      invoice_id: "in_one",
      customer_id: "cus_one",
      currency: "usd",
      livemode: false
    })
  ).rejects.toThrow("referral_cash_unverified");
});
it("checks partial collections on open subscription invoices and skips no-cash trials", async () => {
  const { client, payments } = provider();
  const list = vi.fn().mockResolvedValue({
    data: [
      {
        id: "in_zero",
        customer: "cus_one",
        currency: "usd",
        livemode: false,
        status: "paid",
        parent: { subscription_details: { subscription: "sub_one" } }
      },
      {
        id: "in_one",
        customer: "cus_one",
        currency: "usd",
        livemode: false,
        status: "open",
        parent: { subscription_details: { subscription: "sub_one" } }
      }
    ],
    has_more: false
  });
  client.invoices = mockedObject<Stripe["invoices"]>({ list });
  payments
    .mockResolvedValueOnce({ data: [], has_more: false })
    .mockResolvedValueOnce({ data: [payment], has_more: false });
  expect(await hasStripePaidSubscriptionHistory(client, "cus_one")).toBe(true);
  expect(list).toHaveBeenCalledWith(
    { customer: "cus_one", limit: 100 },
    { timeout: 8000, maxNetworkRetries: 0 }
  );
});
it("bounds the entire eligibility read, rather than restarting the timeout on each invoice", async () => {
  const { client, payments } = provider();
  vi.spyOn(Date, "now").mockReturnValue(1000);
  client.invoices = mockedObject<Stripe["invoices"]>({
    list: vi.fn().mockImplementation(async () => {
      vi.mocked(Date.now).mockReturnValue(17000);
      return {
        data: [
          {
            id: "in_one",
            customer: "cus_one",
            currency: "usd",
            livemode: false,
            status: "open",
            parent: { subscription_details: { subscription: "sub_one" } }
          }
        ],
        has_more: false
      };
    })
  });
  await expect(hasStripePaidSubscriptionHistory(client, "cus_one")).rejects.toThrow(
    "referral_history_incomplete"
  );
  expect(payments).not.toHaveBeenCalled();
});
it("caps no-cash provider reads even if all responses are fast", async () => {
  const { client, payments } = provider();
  payments.mockResolvedValue({ data: [], has_more: false });
  client.invoices = mockedObject<Stripe["invoices"]>({
    list: vi.fn().mockResolvedValue({
      data: Array.from({ length: 100 }, (_, index) => ({
        id: `in_${index}`,
        customer: "cus_one",
        currency: "usd",
        livemode: false,
        status: "paid",
        parent: { subscription_details: { subscription: "sub_one" } }
      })),
      has_more: false
    })
  });
  await expect(hasStripePaidSubscriptionHistory(client, "cus_one")).rejects.toThrow(
    "referral_history_incomplete"
  );
  expect(payments.mock.calls.length).toBeLessThan(100);
});
