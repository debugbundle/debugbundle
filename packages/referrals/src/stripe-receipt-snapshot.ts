import type { ReferralReconciliationEvent } from "./referral-reconciliation.js";
import type Stripe from "stripe";
import { z } from "zod";
import type { StripeBillingProvider } from "../../billing/src/stripe-subscription.js";
import {
  ReferralReceiptSnapshotSchema,
  type ReferralReceiptSnapshot
} from "./referral-ledger-contracts.js";
import {
  createStripeReferralReadBudget,
  readStripeInvoiceCash,
  type VerifiedInvoiceCash
} from "./stripe-cash-receipts.js";
import { mapStripeReferralInvoiceLines } from "./stripe-invoice-lines.js";
import { readStripeInvoiceBenefit } from "./stripe-invoice-benefit.js";

type InvoiceFacts = ReferralReceiptSnapshot["invoices"][number];
type InvoiceWork = { source: Stripe.Invoice; facts: InvoiceFacts; cash: VerifiedInvoiceCash[] };
type ChargeWork = {
  id: string;
  cash: number;
  allocations: Map<string, number>;
  known: Map<string, number>;
  refunds: Stripe.Refund[];
  lost: number;
};
const minor = z.number().int().safe().min(0).max(1_000_000_000_000);
function id(value: unknown): string | null {
  if (typeof value === "string") return value;
  return value !== null &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string"
    ? value.id
    : null;
}
function fail(code = "referral_receipt_unverified"): never {
  throw new Error(code);
}
function complete<T>(page: { data: T[]; has_more: boolean }): T[] {
  if (page.has_more) return fail("referral_history_incomplete");
  return page.data;
}

/** Allocate the cumulative cash adjustment once. The stable largest-remainder
 * tie break conserves minor units across invoices and the unallocated bucket;
 * splitting/reordering provider refund notifications cannot change the result. */
function apportion(total: number, weights: Map<string, number>): Map<string, number> {
  minor.parse(total);
  let sum = 0n;
  for (const value of weights.values()) sum += BigInt(minor.parse(value));
  if (BigInt(total) > sum) fail();
  const result = new Map<string, number>(),
    remainders: Array<{ id: string; value: bigint }> = [];
  let used = 0;
  for (const [key, weight] of weights) {
    const value = sum === 0n ? 0n : (BigInt(total) * BigInt(weight)) / sum;
    result.set(key, Number(value));
    used += Number(value);
    remainders.push({ id: key, value: sum === 0n ? 0n : (BigInt(total) * BigInt(weight)) % sum });
  }
  remainders.sort((a, b) =>
    a.value === b.value ? a.id.localeCompare(b.id) : a.value > b.value ? -1 : 1
  );
  for (let index = 0; index < total - used; index++) {
    const key = remainders[index]?.id;
    if (!key) fail();
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

function creditAllocations(
  note: Stripe.CreditNote,
  invoice: InvoiceFacts
): Array<{ line_id: string; amount_minor: number; net_amount_minor: number }> {
  const allocations = new Map<
    string,
    { line_id: string; amount_minor: number; net_amount_minor: number }
  >();
  for (const line of complete(note.lines)) {
    const lineId = line.invoice_line_item;
    if (
      line.type !== "invoice_line_item" ||
      !lineId ||
      !invoice.lines.some((candidate) => candidate.id === lineId)
    )
      fail("referral_credit_unverified");
    const taxes = line.taxes ?? [];
    const inclusive = taxes
      .filter((tax) => tax.tax_behavior === "inclusive")
      .reduce((sum, tax) => sum + minor.parse(tax.amount), 0);
    const tax = taxes.reduce((sum, value) => sum + minor.parse(value.amount), 0);
    const net = minor.parse(line.amount) - minor.parse(line.discount_amount) - inclusive;
    minor.parse(net);
    const previous = allocations.get(lineId) ?? {
      line_id: lineId,
      amount_minor: 0,
      net_amount_minor: 0
    };
    previous.amount_minor += net + tax;
    previous.net_amount_minor += net;
    allocations.set(lineId, previous);
  }
  const result = [...allocations.values()].sort((a, b) => a.line_id.localeCompare(b.line_id));
  if (
    result.reduce((sum, value) => sum + value.amount_minor, 0) !== note.total ||
    result.reduce((sum, value) => sum + value.net_amount_minor, 0) !== note.total_excluding_tax
  )
    fail("referral_credit_unverified");
  return result;
}

/** Provider reads run outside storage transactions with one bounded budget.
 * No invoice-paid flag, manual payment record, raw description or customer
 * payload becomes an earning. The ledger receives only complete cash facts. */
export async function readStripeReferralSnapshot(
  provider: StripeBillingProvider,
  raw: {
    organization_external_id: string;
    owner_identity_hash: string;
    provider_customer_id: string;
  },
  options: {
    expectedResource?: Pick<ReferralReconciliationEvent, "resource_type" | "resource_id">;
    includeInvoiceBenefits?: boolean;
  } = {}
): Promise<ReferralReceiptSnapshot> {
  try {
    const input = ReferralReceiptSnapshotSchema.omit({ invoices: true, observed_at: true }).parse(
      raw
    );
    const client = provider.client,
      nextRead = createStripeReferralReadBudget(120_000, 1000);
    const invoices = new Map<string, InvoiceWork>(),
      benefits: NonNullable<ReferralReceiptSnapshot["benefit_invoices"]> = [],
      charges = new Map<string, ChargeWork>(),
      seenInvoices = new Set<string>(),
      adjustmentsSeen = new Set<string>();
    let after: string | undefined,
      finished = false,
      bytes = 0;
    for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
      const page = await client.invoices.list(
        {
          customer: input.provider_customer_id,
          limit: 100,
          ...(options.includeInvoiceBenefits ? { expand: ["data.discounts"] } : {}),
          ...(after === undefined ? {} : { starting_after: after })
        },
        nextRead()
      );
      for (const invoice of page.data) {
        if (seenInvoices.has(invoice.id) || id(invoice.customer) !== input.provider_customer_id)
          fail();
        seenInvoices.add(invoice.id);
        if (
          !invoice.parent?.subscription_details?.subscription ||
          (invoice.status === "draft" && !options.includeInvoiceBenefits)
        )
          continue;
        if (invoice.currency !== "usd") fail("referral_currency_unsupported");
        const lines = complete(
          await client.invoices.listLineItems(invoice.id, { limit: 100 }, nextRead())
        );
        const mapped = mapStripeReferralInvoiceLines(invoice, lines, provider.priceMap);
        if (options.includeInvoiceBenefits) {
          const benefit = readStripeInvoiceBenefit(invoice, lines, provider.priceMap);
          if (benefit) benefits.push(benefit);
        }
        if (invoice.status === "draft") continue;
        const cash = await readStripeInvoiceCash(
          client,
          {
            invoice_id: invoice.id,
            customer_id: input.provider_customer_id,
            currency: invoice.currency,
            livemode: invoice.livemode
          },
          nextRead
        );
        const facts: InvoiceFacts = {
          invoice_id: invoice.id,
          currency: "usd",
          lines: mapped,
          payments: cash.map((value) => ({
            payment_id: value.payment_id,
            cash_minor: value.cash_minor,
            collected_at: value.collected_at,
            provider_available_at: value.provider_available_at
          })),
          refunds: [],
          disputed: false
        };
        invoices.set(invoice.id, { source: invoice, facts, cash });
        bytes += Buffer.byteLength(JSON.stringify(facts));
        if (bytes > 2 * 1024 * 1024) fail("referral_snapshot_too_large");
        for (const payment of cash) {
          let charge = charges.get(payment.charge_id);
          if (!charge) {
            charge = {
              id: payment.charge_id,
              cash: payment.charge_cash_minor,
              allocations: new Map(),
              known: new Map(),
              refunds: [],
              lost: 0
            };
            charges.set(charge.id, charge);
          }
          if (charge.cash !== payment.charge_cash_minor) fail();
          charge.allocations.set(
            invoice.id,
            (charge.allocations.get(invoice.id) ?? 0) + payment.cash_minor
          );
        }
      }
      if (!page.has_more) {
        finished = true;
        break;
      }
      after = page.data.at(-1)?.id;
      if (!after) fail("referral_history_incomplete");
    }
    if (!finished) fail("referral_history_incomplete");
    const refunds = new Map<
      string,
      { source: Stripe.Refund; charge: ChargeWork; assigned: number }
    >();
    for (const charge of charges.values()) {
      if ([...charge.allocations.values()].reduce((sum, value) => sum + value, 0) > charge.cash)
        fail();
      const current = await client.charges.retrieve(charge.id, {}, nextRead());
      if (
        current.id !== charge.id ||
        id(current.customer) !== input.provider_customer_id ||
        current.currency !== "usd" ||
        current.amount_captured !== charge.cash
      )
        fail();
      const returned = complete(
        await client.refunds.list({ charge: charge.id, limit: 100 }, nextRead())
      );
      let pending = false,
        refunded = 0;
      for (const refund of returned) {
        adjustmentsSeen.add(`refund:${refund.id}`);
        if (refunds.has(refund.id) || id(refund.charge) !== charge.id || refund.currency !== "usd")
          fail();
        minor.parse(refund.amount);
        if (refund.status === "succeeded") {
          refunds.set(refund.id, { source: refund, charge, assigned: 0 });
          charge.refunds.push(refund);
          refunded += refund.amount;
        } else if (refund.status !== "failed" && refund.status !== "canceled") pending = true;
      }
      if (refunded > charge.cash || (!pending && refunded !== current.amount_refunded))
        fail("referral_refund_unverified");
      if (pending)
        for (const key of charge.allocations.keys())
          invoices.get(key)!.facts.reconciliation_hold = "refund_allocation_unverified";
      const disputes = complete(
        await client.disputes.list({ charge: charge.id, limit: 100 }, nextRead())
      );
      const seen = new Set<string>();
      for (const dispute of disputes) {
        adjustmentsSeen.add(`dispute:${dispute.id}`);
        if (seen.has(dispute.id) || id(dispute.charge) !== charge.id || dispute.currency !== "usd")
          fail();
        seen.add(dispute.id);
        minor.parse(dispute.amount);
        if (dispute.status === "lost") charge.lost += dispute.amount;
        else if (!["won", "warning_closed", "prevented"].includes(dispute.status))
          for (const key of charge.allocations.keys()) invoices.get(key)!.facts.disputed = true;
      }
      if (current.disputed && disputes.length === 0)
        for (const key of charge.allocations.keys())
          invoices.get(key)!.facts.reconciliation_hold = "refund_allocation_unverified";
    }
    for (const work of invoices.values()) {
      const notes = complete(
          await client.creditNotes.list({ invoice: work.source.id, limit: 100 }, nextRead())
        ),
        seen = new Set<string>();
      for (const note of notes) {
        adjustmentsSeen.add(`credit_note:${note.id}`);
        if (
          seen.has(note.id) ||
          id(note.invoice) !== work.source.id ||
          id(note.customer) !== input.provider_customer_id ||
          note.currency !== "usd" ||
          note.livemode !== work.source.livemode
        )
          fail();
        seen.add(note.id);
        if (note.status === "void") continue;
        if (note.status !== "issued") fail();
        if (
          note.customer_balance_transaction ||
          note.out_of_band_amount ||
          (note.pre_payment_amount > 0 && note.post_payment_amount > 0)
        ) {
          work.facts.reconciliation_hold = "credit_allocation_unverified";
          continue;
        }
        const allocations = creditAllocations(note, work.facts);
        if (
          note.pre_payment_amount === note.total &&
          note.post_payment_amount === 0 &&
          note.refunds.length === 0
        ) {
          for (const allocation of allocations) {
            const line = work.facts.lines.find((candidate) => candidate.id === allocation.line_id)!;
            line.net_amount_minor -= allocation.net_amount_minor;
            line.tax_amount_minor -= allocation.amount_minor - allocation.net_amount_minor;
            if (line.net_amount_minor < 0 || line.tax_amount_minor < 0)
              fail("referral_credit_unverified");
          }
          continue;
        }
        if (
          note.pre_payment_amount !== 0 ||
          note.post_payment_amount !== note.total ||
          note.refunds.length < 1
        ) {
          work.facts.reconciliation_hold = "credit_allocation_unverified";
          continue;
        }
        let total = 0;
        const linkedRefunds = new Set<string>();
        const used: Array<{
          source: Stripe.Refund;
          charge: ChargeWork;
          assigned: number;
          amount: number;
        }> = [];
        for (const linked of note.refunds) {
          const refund = refunds.get(id(linked.refund) ?? "");
          const amount = minor.parse(linked.amount_refunded);
          if (
            (linked.type !== null && linked.type !== "refund") ||
            !refund ||
            linkedRefunds.has(refund.source.id) ||
            refund.assigned + amount > refund.source.amount ||
            !refund.charge.allocations.has(work.source.id)
          )
            fail("referral_credit_unverified");
          linkedRefunds.add(refund.source.id);
          used.push({ ...refund, amount });
          total += amount;
        }
        if (total !== note.total) fail("referral_credit_unverified");
        for (const value of used) {
          const refund = refunds.get(value.source.id)!;
          refund.assigned += value.amount;
          value.charge.known.set(
            work.source.id,
            (value.charge.known.get(work.source.id) ?? 0) + value.amount
          );
        }
        work.facts.refunds.push({ id: `credit-note:${note.id}`, cash_minor: total, allocations });
      }
    }
    for (const charge of charges.values()) {
      const cashRefund = charge.refunds.reduce((sum, value) => sum + value.amount, 0);
      const known = charge.refunds.reduce(
        (sum, value) => sum + (refunds.get(value.id)?.assigned ?? 0),
        0
      );
      const lost = Math.min(charge.lost, charge.cash - cashRefund);
      const remaining = new Map<string, number>();
      let allocated = 0;
      for (const [key, cash] of charge.allocations) {
        const value = cash - (charge.known.get(key) ?? 0);
        if (value < 0) fail("referral_credit_unverified");
        remaining.set(key, value);
        allocated += cash;
      }
      remaining.set("~unallocated", charge.cash - allocated);
      const adjustments = apportion(cashRefund - known + lost, remaining);
      for (const [key, amount] of adjustments)
        if (key !== "~unallocated" && amount > 0)
          invoices
            .get(key)!
            .facts.refunds.push({ id: `charge-adjustment:${charge.id}`, cash_minor: amount });
    }
    const expected = options.expectedResource;
    if (
      expected &&
      ["credit_note", "refund", "dispute"].includes(expected.resource_type) &&
      !adjustmentsSeen.has(`${expected.resource_type}:${expected.resource_id}`)
    )
      fail("referral_trigger_not_observed");
    const snapshot = ReferralReceiptSnapshotSchema.parse({
      ...input,
      observed_at: new Date().toISOString(),
      ...(options.includeInvoiceBenefits ? { benefit_invoices: benefits } : {}),
      invoices: [...invoices.values()]
        .map((value) => value.facts)
        .sort((a, b) => a.invoice_id.localeCompare(b.invoice_id))
    });
    if (Buffer.byteLength(JSON.stringify(snapshot)) > 2 * 1024 * 1024)
      fail("referral_snapshot_too_large");
    return snapshot;
  } catch (error) {
    if (error instanceof Error && /^referral_[a-z_]+$/.test(error.message)) throw error;
    throw new Error("referral_provider_read_unavailable");
  }
}
