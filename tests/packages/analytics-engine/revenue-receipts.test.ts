import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  evaluateRevenueReceipts,
  type RevenueReceiptFact,
  type RevenueReceiptQuery
} from "../../../packages/analytics-engine/src/index.js";
import { ANALYTICS_CURRENCY_TABLE_VERSION } from "../../../packages/shared-types/src/index.js";

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const reference = (value: string): string => `sha256:${hash(value)}`;
const project = "11111111-1111-4111-8111-111111111111";
const otherProject = "22222222-2222-4222-8222-222222222222";
const scope = { kind: "project" as const, project_id: project };
const at = (seconds: number): string =>
  new Date(Date.UTC(2026, 8, 1) + seconds * 1000).toISOString();
const query: RevenueReceiptQuery = {
  scope,
  scope_revision: 1,
  from: at(0),
  to: at(100),
  watermark: at(200),
  available_from: at(0),
  incomplete: false,
  sample_rate: 1
};
const payment = (
  id: number,
  amount: string,
  changes: Partial<RevenueReceiptFact> = {}
): RevenueReceiptFact => ({
  scope,
  scope_revision: 1,
  origin_project_id: project,
  authority: "server_authoritative",
  source_namespace: hash("billing-account"),
  event_id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  operation_id: reference(`op-${id}`),
  content_hash: hash(`content-${id}`),
  occurred_at: at(id),
  received_at: at(id + 1),
  account_key: hash("account"),
  money: { amount_minor: amount, currency: "USD", exponent: 2 },
  currency_table_version: ANALYTICS_CURRENCY_TABLE_VERSION,
  financial: { kind: "payment", payment_id: reference(`payment-${id}`), subscription_id: null },
  ...changes
});
const refund = (
  id: number,
  paymentId: number,
  amount: string,
  changes: Partial<RevenueReceiptFact> = {}
): RevenueReceiptFact =>
  payment(id, amount, {
    financial: {
      kind: "refund",
      refund_id: reference(`refund-${id}`),
      payment_id: reference(`payment-${paymentId}`)
    },
    ...changes
  });
const calculate = (facts: RevenueReceiptFact[], changes: Partial<RevenueReceiptQuery> = {}) => {
  const result = evaluateRevenueReceipts({ ...query, ...changes }, facts);
  expect(result.status).toBe("available");
  if (result.status !== "available") throw new Error(result.reason);
  return result;
};

it("deduplicates transports, operations and provider objects while preserving legitimate payments", () => {
  const original = payment(1, "1000");
  const retry = {
    ...original,
    event_id: payment(5, "0").event_id,
    content_hash: hash("retry"),
    received_at: at(30)
  };
  const secondWebhook = {
    ...retry,
    event_id: payment(6, "0").event_id,
    operation_id: reference("other-webhook"),
    content_hash: hash("other")
  };
  const result = calculate([
    original,
    original,
    retry,
    secondWebhook,
    payment(2, "1000"),
    refund(3, 1, "300"),
    refund(4, 1, "200")
  ]);
  expect(result.currencies).toEqual([
    {
      currency: "USD",
      exponent: 2,
      currency_table_version: ANALYTICS_CURRENCY_TABLE_VERSION,
      payments: 2,
      refunds: 2,
      gross_minor: "2000",
      refunded_minor: "500",
      net_minor: "1500",
      average_order_minor: { numerator: "1000", denominator: "1", rounded: "1000" },
      paying_accounts: 1,
      payments_without_account: 0
    }
  ]);
  expect(result.quality).toBe("observed");
  expect(result).not.toHaveProperty("mrr");
  expect(JSON.stringify(result)).not.toContain(hash("account"));
});

it("allows late partial/full refunds and validates against payments before the report window", () => {
  const result = calculate([
    refund(2, 1, "400"),
    refund(3, 1, "600"),
    payment(1, "1000", { occurred_at: at(-500), received_at: at(-499) })
  ]);
  expect(result.currencies[0]).toMatchObject({
    payments: 0,
    refunds: 2,
    gross_minor: "0",
    refunded_minor: "1000",
    net_minor: "-1000",
    average_order_minor: null
  });
  expect(calculate([payment(1, "1000"), refund(2, 1, "1000")]).currencies[0]?.net_minor).toBe("0");
});

it("uses a half-open occurrence window and a received watermark without assuming final history", () => {
  const result = calculate([
    payment(1, "100", { occurred_at: at(0) }),
    payment(2, "200", { occurred_at: at(100) }),
    payment(3, "300", { received_at: at(201) })
  ]);
  expect(result.currencies[0]?.gross_minor).toBe("100");
  expect(result.watermark).toBe(at(200));
  expect(
    calculate([payment(3, "300", { received_at: at(201) })], { watermark: at(201) }).currencies[0]
      ?.gross_minor
  ).toBe("300");
});

it("keeps namespaces and currencies separate without guessing missing account identity", () => {
  const a = payment(1, "9223372036854775807", { account_key: null });
  const b = payment(2, "9223372036854775807", {
    account_key: null,
    source_namespace: hash("different-provider"),
    financial: a.financial
  });
  const result = calculate([
    a,
    b,
    payment(3, "3", { money: { amount_minor: "3", currency: "JPY", exponent: 0 } })
  ]);
  expect(
    result.currencies.map((row) => [
      row.currency,
      row.gross_minor,
      row.paying_accounts,
      row.payments_without_account
    ])
  ).toEqual([
    ["JPY", "3", 1, 0],
    ["USD", "18446744073709551614", 0, 2]
  ]);
});

it("fails closed on conflicting transport, operation or provider-object content", () => {
  const original = payment(1, "100");
  const conflicts = [
    { ...original, content_hash: hash("changed") },
    payment(2, "200", { operation_id: original.operation_id }),
    payment(2, "200", { financial: original.financial })
  ];
  for (const conflict of conflicts)
    expect(evaluateRevenueReceipts(query, [original, conflict])).toEqual({
      status: "unavailable",
      reason: "conflicting_evidence"
    });
});

it("refuses missing, mismatched, premature and excessive refund reconciliation", () => {
  expect(evaluateRevenueReceipts(query, [refund(2, 1, "10")])).toEqual({
    status: "unavailable",
    reason: "missing_payment"
  });
  expect(
    evaluateRevenueReceipts(query, [payment(1, "100"), refund(2, 1, "60"), refund(3, 1, "41")])
  ).toEqual({ status: "unavailable", reason: "refund_exceeds_payment" });
  for (const bad of [
    refund(2, 1, "10", { money: { amount_minor: "10", currency: "EUR", exponent: 2 } }),
    refund(2, 1, "10", { occurred_at: at(0) }),
    refund(2, 1, "10", { account_key: hash("another-account") })
  ]) {
    expect(evaluateRevenueReceipts(query, [payment(1, "100"), bad])).toEqual({
      status: "unavailable",
      reason: "conflicting_evidence"
    });
  }
});

it("does not fabricate exact totals from unavailable, sampled, stale or incomplete evidence", () => {
  expect(calculate([payment(1, "100")], { incomplete: true }).quality).toBe("partial");
  expect(evaluateRevenueReceipts({ ...query, available_from: at(1) }, [])).toEqual({
    status: "unavailable",
    reason: "insufficient_history"
  });
  expect(evaluateRevenueReceipts({ ...query, sample_rate: 0.5 }, [])).toEqual({
    status: "unavailable",
    reason: "sampled_financial_evidence"
  });
  for (const bad of [
    payment(1, "100", { scope_revision: 2 }),
    payment(1, "100", { origin_project_id: otherProject })
  ])
    expect(evaluateRevenueReceipts(query, [bad])).toEqual({
      status: "unavailable",
      reason: "stale_evidence"
    });
  expect(calculate([]).currencies).toEqual([]);
});

it("bounds work and rejects malformed/private-schema input", () => {
  for (const [q, facts] of [
    [null, []],
    [query, null],
    [query, [{}]],
    [{ ...query, to: at(0) }, []],
    [query, [payment(1, "100", { authority: "client_observed" } as never)]],
    [query, [payment(1, "100", { currency_table_version: "unknown" })]]
  ])
    expect(evaluateRevenueReceipts(q, facts)).toEqual({
      status: "unavailable",
      reason: "invalid_input"
    });
  expect(
    evaluateRevenueReceipts(
      query,
      Array.from({ length: 10001 }, () => payment(1, "1"))
    )
  ).toEqual({ status: "unavailable", reason: "capacity_exceeded" });
});

it("returns identical aggregates under replay and different loader order", () => {
  const facts = [payment(1, "101"), payment(2, "100"), refund(3, 1, "1")];
  expect(calculate(facts)).toEqual(calculate([...facts].reverse()));
  expect(calculate(facts).currencies[0]?.average_order_minor).toEqual({
    numerator: "201",
    denominator: "2",
    rounded: "101"
  });
});

it("canonicalizes hash and UUID spelling before financial identity and replay comparisons", () => {
  const mixedProject = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const mixedScope = { kind: "project" as const, project_id: mixedProject };
  const original = payment(1, "100", { scope: mixedScope, origin_project_id: mixedProject });
  const alternate = {
    ...original,
    scope: { ...mixedScope, project_id: mixedProject.toUpperCase() },
    origin_project_id: mixedProject.toUpperCase(),
    operation_id: original.operation_id.toUpperCase(),
    financial: {
      kind: "payment" as const,
      payment_id: reference("payment-1").toUpperCase(),
      subscription_id: null
    }
  };
  expect(calculate([original, alternate], { scope: mixedScope }).currencies[0]?.gross_minor).toBe(
    "100"
  );
});

it("does not count free orders as paying accounts and retains matched currency interpretation", () => {
  const result = calculate([payment(1, "0"), payment(2, "0", { account_key: null })]);
  expect(result.currencies[0]).toMatchObject({
    payments: 2,
    paying_accounts: 0,
    payments_without_account: 0,
    average_order_minor: { numerator: "0", denominator: "1", rounded: "0" }
  });
  expect(
    evaluateRevenueReceipts(query, [
      payment(1, "1", { money: { amount_minor: "1", currency: "JPY", exponent: 2 } })
    ])
  ).toEqual({ status: "unavailable", reason: "invalid_input" });
});
