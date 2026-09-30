import { expect, it } from "vitest";
import { evaluateRecurringRevenue } from "../../../packages/analytics-engine/src/index.js";
import { ANALYTICS_CURRENCY_TABLE_VERSION } from "../../../packages/shared-types/src/index.js";

const rate = (amount: string, changes: Record<string, unknown> = {}) => ({
  money: { amount_minor: amount, currency: "USD", exponent: 2 },
  currency_table_version: ANALYTICS_CURRENCY_TABLE_VERSION,
  status: "active",
  billing_interval: "month",
  interval_count: 1,
  ...changes
});
const calculate = (rates: unknown[]) => {
  const result = evaluateRecurringRevenue(rates);
  expect(result.status).toBe("available");
  if (result.status !== "available") throw new Error(result.reason);
  return result;
};

it("normalizes annual and multi-month rates exactly and rounds only the currency total", () => {
  const result = calculate([
    rate("100", { billing_interval: "year" }),
    rate("100", { billing_interval: "year" }),
    rate("100", { billing_interval: "year" }),
    rate("100", { interval_count: 3 })
  ]);
  expect(result.currencies).toEqual([
    {
      currency: "USD",
      exponent: 2,
      currency_table_version: ANALYTICS_CURRENCY_TABLE_VERSION,
      mrr_minor: { numerator: "175", denominator: "3", rounded: "58" },
      contributing_rates: 4
    }
  ]);
  expect(calculate([rate("1", { interval_count: 2 })]).currencies[0]?.mrr_minor.rounded).toBe("1");
});

it("uses an explicit fixed-year convention for daily and weekly rates", () => {
  expect(calculate([rate("1", { billing_interval: "day" })]).currencies[0]?.mrr_minor).toEqual({
    numerator: "365",
    denominator: "12",
    rounded: "30"
  });
  expect(calculate([rate("7", { billing_interval: "week" })]).currencies[0]?.mrr_minor).toEqual({
    numerator: "365",
    denominator: "12",
    rounded: "30"
  });
});

it("keeps currencies separate and excludes trial, paused and canceled recurring state", () => {
  const result = calculate([
    rate("200", { status: "trialing" }),
    rate("300", { status: "paused" }),
    rate("400", { status: "canceled" }),
    rate("0"),
    rate("100", { status: "past_due" }),
    rate("1", { money: { amount_minor: "1", currency: "JPY", exponent: 0 } }),
    rate("1001", { money: { amount_minor: "1001", currency: "KWD", exponent: 3 } })
  ]);
  expect(
    result.currencies.map(({ currency, mrr_minor, contributing_rates }) => [
      currency,
      mrr_minor.rounded,
      contributing_rates
    ])
  ).toEqual([
    ["JPY", "1", 1],
    ["KWD", "1001", 1],
    ["USD", "100", 1]
  ]);
  expect(calculate([rate("100", { status: "trialing" })]).currencies[0]?.mrr_minor.rounded).toBe(
    "0"
  );
});

it("preserves values beyond JavaScript safe integers and never emits floating point money", () => {
  expect(
    calculate([rate("9223372036854775807"), rate("9223372036854775807")]).currencies[0]?.mrr_minor
  ).toEqual({
    numerator: "18446744073709551614",
    denominator: "1",
    rounded: "18446744073709551614"
  });
  expect(calculate([]).currencies).toEqual([]);
});

it("rejects malformed, unsupported or overflowing rates and excessive work", () => {
  for (const input of [
    null,
    {},
    [rate("-1")],
    [rate("1.2")],
    [rate("9223372036854775808")],
    [rate("1", { interval_count: 0 })],
    [rate("1", { interval_count: 13 })],
    [rate("1", { money: { amount_minor: "1", currency: "JPY", exponent: 2 } })],
    [rate("1", { currency_table_version: "unknown" })],
    [rate("1", { billing_interval: "hour" })],
    [rate("1", { surprise: true })]
  ]) {
    expect(evaluateRecurringRevenue(input)).toEqual({
      status: "unavailable",
      reason: "invalid_input"
    });
  }
  expect(evaluateRecurringRevenue(Array.from({ length: 10001 }, () => rate("1")))).toEqual({
    status: "unavailable",
    reason: "capacity_exceeded"
  });
});
