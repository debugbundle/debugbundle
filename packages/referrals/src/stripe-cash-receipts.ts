import type Stripe from "stripe";
import { z } from "zod";

export const REFERRAL_PROVIDER_READ_OPTIONS = { timeout: 8000, maxNetworkRetries: 0 } as const;
export function createStripeReferralReadBudget(
  timeoutMs = 15_000,
  maxRequests = 100
): () => Stripe.RequestOptions {
  const deadline = Date.now() + timeoutMs;
  let requests = 0;
  return () => {
    const remaining = deadline - Date.now();
    if (remaining <= 0 || requests++ >= maxRequests) throw new Error("referral_history_incomplete");
    return {
      ...REFERRAL_PROVIDER_READ_OPTIONS,
      timeout: Math.min(remaining, REFERRAL_PROVIDER_READ_OPTIONS.timeout)
    };
  };
}
export interface VerifiedInvoiceCash {
  payment_id: string;
  charge_id: string;
  payment_intent_id: string | null;
  cash_minor: number;
  charge_cash_minor: number;
  collected_at: string;
  provider_available_at: string;
}
const money = z.number().int().safe().min(0).max(1_000_000_000_000);
function id(value: string | { id: string } | null | undefined): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}
function unverified(): never {
  throw new Error("referral_cash_unverified");
}
function timestamp(value: number | null | undefined): string {
  if (!Number.isSafeInteger(value) || !value || value < 0) return unverified();
  return new Date(value * 1000).toISOString();
}

/** A provider-paid invoice is insufficient: accept only successful captured
 * cash, and only the InvoicePayment allocation belonging to this invoice.
 * Manual payment records and customer credit are never collected cash. */
export async function readStripeInvoiceCash(
  client: Stripe,
  input: {
    invoice_id: string;
    customer_id: string;
    currency: string;
    livemode: boolean;
  },
  nextReadOptions: () => Stripe.RequestOptions = createStripeReferralReadBudget()
): Promise<VerifiedInvoiceCash[]> {
  const page = await client.invoicePayments.list(
    { invoice: input.invoice_id, status: "paid", limit: 100 },
    nextReadOptions()
  );
  if (page.has_more) throw new Error("referral_history_incomplete");
  const result: VerifiedInvoiceCash[] = [],
    seen = new Set<string>();
  for (const payment of page.data) {
    if (seen.has(payment.id)) unverified();
    seen.add(payment.id);
    if (payment.status !== "paid" || payment.payment.type === "payment_record") continue;
    if (!money.safeParse(payment.amount_paid).success) unverified();
    const amount = payment.amount_paid!;
    if (amount === 0) continue;
    if (
      id(payment.invoice) !== input.invoice_id ||
      payment.currency !== input.currency ||
      payment.livemode !== input.livemode
    )
      unverified();
    let chargeId: string | null = null,
      paymentIntentId: string | null = null;
    if (payment.payment.type === "payment_intent") {
      paymentIntentId = id(payment.payment.payment_intent);
      if (!paymentIntentId) unverified();
      const intent = await client.paymentIntents.retrieve(paymentIntentId, {}, nextReadOptions());
      if (
        intent.id !== paymentIntentId ||
        intent.status !== "succeeded" ||
        id(intent.customer) !== input.customer_id ||
        intent.currency !== input.currency ||
        intent.livemode !== input.livemode
      )
        unverified();
      chargeId = id(intent.latest_charge);
    } else if (payment.payment.type === "charge") chargeId = id(payment.payment.charge);
    if (!chargeId) unverified();
    const charge = await client.charges.retrieve(chargeId, {}, nextReadOptions());
    if (
      charge.id !== chargeId ||
      !charge.paid ||
      !charge.captured ||
      charge.status !== "succeeded" ||
      id(charge.customer) !== input.customer_id ||
      charge.currency !== input.currency ||
      charge.livemode !== input.livemode ||
      !money.safeParse(charge.amount).success ||
      !money.safeParse(charge.amount_captured).success ||
      charge.amount_captured < amount ||
      charge.amount_captured > charge.amount ||
      id(charge.payment_intent) !== paymentIntentId
    )
      unverified();
    const balanceId = id(charge.balance_transaction);
    if (!balanceId) unverified();
    const balance = await client.balanceTransactions.retrieve(balanceId, {}, nextReadOptions());
    // The balance is in the settlement currency. Its verified charge source and
    // exchange rate establish funds availability; commission remains in the
    // original invoice currency and never uses the settlement amount.
    if (
      balance.id !== balanceId ||
      id(balance.source) !== chargeId ||
      !/^[a-z]{3}$/.test(balance.currency) ||
      !money.safeParse(balance.amount).success ||
      balance.amount <= 0 ||
      (balance.currency === input.currency
        ? balance.amount !== charge.amount_captured
        : !Number.isFinite(balance.exchange_rate) || (balance.exchange_rate ?? 0) <= 0)
    )
      unverified();
    result.push({
      payment_id: payment.id,
      charge_id: chargeId,
      payment_intent_id: paymentIntentId,
      cash_minor: amount,
      charge_cash_minor: charge.amount_captured,
      collected_at: timestamp(payment.status_transitions.paid_at),
      provider_available_at: timestamp(balance.available_on)
    });
  }
  return result.sort(
    (a, b) =>
      a.collected_at.localeCompare(b.collected_at) || a.payment_id.localeCompare(b.payment_id)
  );
}

/** Search bounded complete subscription history, including partially paid open
 * invoices. Overflow/uncertainty refuses a new-customer benefit rather than
 * silently treating the unseen history as empty. */
export async function hasStripePaidSubscriptionHistory(
  client: Stripe,
  customerId: string,
  nextReadOptions: () => Stripe.RequestOptions = createStripeReferralReadBudget()
): Promise<boolean> {
  let after: string | undefined;
  const seen = new Set<string>();
  for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
    const page = await client.invoices.list(
      { customer: customerId, limit: 100, ...(after ? { starting_after: after } : {}) },
      nextReadOptions()
    );
    for (const invoice of page.data) {
      if (seen.has(invoice.id) || id(invoice.customer) !== customerId) unverified();
      seen.add(invoice.id);
      if (invoice.status === "draft" || !invoice.parent?.subscription_details?.subscription)
        continue;
      if (
        (
          await readStripeInvoiceCash(
            client,
            {
              invoice_id: invoice.id,
              customer_id: customerId,
              currency: invoice.currency,
              livemode: invoice.livemode
            },
            nextReadOptions
          )
        ).length
      )
        return true;
    }
    if (!page.has_more) return false;
    after = page.data.at(-1)?.id;
    if (!after) break;
  }
  throw new Error("referral_history_incomplete");
}
