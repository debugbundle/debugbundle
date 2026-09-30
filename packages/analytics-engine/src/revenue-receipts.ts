import { z } from "zod";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import {
  MAX_FINANCIAL_FACTS,
  MAX_FINANCIAL_AGGREGATE,
  exactMinorAmount
} from "./financial-arithmetic.js";
import {
  RevenueReceiptFactSchema,
  RevenueReceiptQuerySchema,
  type RevenueReceiptFact,
  type RevenueReceiptQuery,
  type RevenueReceiptResult,
  type RevenueReceiptCurrency,
  type RevenueReceiptUnavailable
} from "./revenue-evidence.js";

const unavailable = (reason: RevenueReceiptUnavailable): RevenueReceiptResult => ({
  status: "unavailable",
  reason
});
function sourceKey(fact: RevenueReceiptFact): string[] {
  return [fact.origin_project_id.toLowerCase(), fact.source_namespace];
}
function entityKey(fact: RevenueReceiptFact, kind: "payment" | "refund", id: string): string {
  return JSON.stringify([...sourceKey(fact), kind, id]);
}
function businessContent(fact: RevenueReceiptFact): string {
  return stableJson({
    money: fact.money,
    currency_table_version: fact.currency_table_version,
    occurred_at: fact.occurred_at,
    account_key: fact.account_key,
    financial: fact.financial
  });
}
function currentScope(fact: RevenueReceiptFact, query: RevenueReceiptQuery): boolean {
  return (
    fact.scope_revision === query.scope_revision &&
    stableJson(fact.scope) === stableJson(query.scope) &&
    (query.scope.kind !== "project" ||
      query.scope.project_id === fact.origin_project_id.toLowerCase())
  );
}

interface CurrencyAccumulator {
  row: RevenueReceiptCurrency;
  gross: bigint;
  refunded: bigint;
  accounts: Set<string>;
}
function aggregate(facts: RevenueReceiptFact[], query: RevenueReceiptQuery): RevenueReceiptResult {
  const currencies = new Map<string, CurrencyAccumulator>();
  for (const fact of facts) {
    if (fact.occurred_at < query.from) continue;
    const entry = currencies.get(fact.money.currency) ?? {
      row: {
        currency: fact.money.currency,
        exponent: fact.money.exponent,
        currency_table_version: fact.currency_table_version,
        payments: 0,
        refunds: 0,
        gross_minor: "0",
        refunded_minor: "0",
        net_minor: "0",
        average_order_minor: null,
        paying_accounts: 0,
        payments_without_account: 0
      },
      gross: 0n,
      refunded: 0n,
      accounts: new Set<string>()
    };
    const amount = BigInt(fact.money.amount_minor);
    if (fact.financial.kind === "payment") {
      entry.gross += amount;
      entry.row.payments++;
      // A free successful order is not evidence of a paying account.
      if (amount > 0n) {
        if (fact.account_key === null) entry.row.payments_without_account++;
        else entry.accounts.add(fact.account_key);
      }
    } else {
      entry.refunded += amount;
      entry.row.refunds++;
    }
    if (entry.gross > MAX_FINANCIAL_AGGREGATE || entry.refunded > MAX_FINANCIAL_AGGREGATE) {
      return unavailable("aggregate_overflow");
    }
    currencies.set(fact.money.currency, entry);
  }
  return {
    status: "available",
    calculation_version: "revenue-receipts-1",
    quality: query.incomplete ? "partial" : "observed",
    scope: query.scope,
    scope_revision: query.scope_revision,
    from: query.from,
    to: query.to,
    watermark: query.watermark,
    currencies: [...currencies.values()]
      .sort((a, b) => a.row.currency.localeCompare(b.row.currency))
      .map((entry) => ({
        ...entry.row,
        gross_minor: entry.gross.toString(),
        refunded_minor: entry.refunded.toString(),
        net_minor: (entry.gross - entry.refunded).toString(),
        paying_accounts: entry.accounts.size,
        average_order_minor:
          entry.row.payments === 0
            ? null
            : exactMinorAmount(entry.gross, BigInt(entry.row.payments))
      }))
  };
}

/** Replay bounded immutable receipt evidence; durable acceptance/dedupe remains the store's job. */
export function evaluateRevenueReceipts(
  queryInput: unknown,
  factsInput: unknown
): RevenueReceiptResult {
  const queryResult = RevenueReceiptQuerySchema.safeParse(queryInput);
  if (!queryResult.success || !Array.isArray(factsInput)) return unavailable("invalid_input");
  if (factsInput.length > MAX_FINANCIAL_FACTS) return unavailable("capacity_exceeded");
  const parsed = z.array(RevenueReceiptFactSchema).safeParse(factsInput);
  if (!parsed.success) return unavailable("invalid_input");
  const query = queryResult.data;
  if (query.available_from > query.from) return unavailable("insufficient_history");
  if (query.sample_rate !== 1) return unavailable("sampled_financial_evidence");
  const transports = new Map<string, string>(),
    operations = new Map<string, string>();
  const entities = new Map<string, RevenueReceiptFact>();
  for (const fact of parsed.data) {
    if (!currentScope(fact, query)) return unavailable("stale_evidence");
    if (fact.received_at > query.watermark || fact.occurred_at >= query.to) continue;
    const transportKey = JSON.stringify([
      fact.origin_project_id.toLowerCase(),
      fact.event_id.toLowerCase()
    ]);
    const transportContent = stableJson(fact),
      previousTransport = transports.get(transportKey);
    if (previousTransport !== undefined && previousTransport !== transportContent)
      return unavailable("conflicting_evidence");
    transports.set(transportKey, transportContent);
    const operationKey = JSON.stringify([
      ...sourceKey(fact),
      fact.financial.kind,
      fact.operation_id
    ]);
    const content = businessContent(fact),
      previousOperation = operations.get(operationKey);
    if (previousOperation !== undefined && previousOperation !== content)
      return unavailable("conflicting_evidence");
    operations.set(operationKey, content);
    const id =
      fact.financial.kind === "payment" ? fact.financial.payment_id : fact.financial.refund_id;
    const key = entityKey(fact, fact.financial.kind, id),
      previous = entities.get(key);
    if (previous !== undefined && businessContent(previous) !== content)
      return unavailable("conflicting_evidence");
    entities.set(key, fact);
  }
  const refunded = new Map<string, bigint>();
  for (const fact of entities.values()) {
    if (fact.financial.kind !== "refund") continue;
    const key = entityKey(fact, "payment", fact.financial.payment_id),
      payment = entities.get(key);
    if (payment === undefined) return unavailable("missing_payment");
    if (
      payment.money.currency !== fact.money.currency ||
      payment.money.exponent !== fact.money.exponent ||
      payment.currency_table_version !== fact.currency_table_version ||
      payment.occurred_at > fact.occurred_at ||
      (fact.account_key !== null && fact.account_key !== payment.account_key)
    )
      return unavailable("conflicting_evidence");
    const total = (refunded.get(key) ?? 0n) + BigInt(fact.money.amount_minor);
    if (total > BigInt(payment.money.amount_minor)) return unavailable("refund_exceeds_payment");
    refunded.set(key, total);
  }
  return aggregate([...entities.values()], query);
}
