import { z } from "zod";
import {
  AnalyticsMoneySchema,
  ANALYTICS_CURRENCY_EXPONENTS,
  ANALYTICS_CURRENCY_TABLE_VERSION
} from "../../shared-types/src/index.js";

export const MAX_FINANCIAL_FACTS = 10000;
export const MAX_FINANCIAL_AGGREGATE = 10n ** 38n - 1n;

/** Retain this versioned interpretation with state; never reinterpret historical minor units. */
export const RetainedAnalyticsMoneySchema = z
  .object({
    money: AnalyticsMoneySchema,
    currency_table_version: z.literal(ANALYTICS_CURRENCY_TABLE_VERSION)
  })
  .strict()
  .refine(({ money }) => ANALYTICS_CURRENCY_EXPONENTS[money.currency] === money.exponent);

const RecurringRateSchema = z
  .object({
    money: AnalyticsMoneySchema,
    currency_table_version: z.literal(ANALYTICS_CURRENCY_TABLE_VERSION),
    status: z.enum(["trialing", "active", "past_due", "paused", "canceled"]),
    billing_interval: z.enum(["day", "week", "month", "year"]),
    interval_count: z.number().int().min(1).max(12)
  })
  .strict()
  .refine(({ money }) => ANALYTICS_CURRENCY_EXPONENTS[money.currency] === money.exponent);
type RecurringRate = z.infer<typeof RecurringRateSchema>;

type Fraction = { numerator: bigint; denominator: bigint };
export interface ExactMinorAmount {
  numerator: string;
  denominator: string;
  rounded: string;
}
interface RecurringCurrency {
  currency: string;
  exponent: number;
  currency_table_version: string;
  mrr_minor: ExactMinorAmount;
  contributing_rates: number;
}
export type RecurringRevenueResult =
  | { status: "unavailable"; reason: "invalid_input" | "capacity_exceeded" | "aggregate_overflow" }
  | {
      status: "available";
      calculation_version: "recurring-revenue-1";
      normalization: "fixed_365_day_year";
      rounding: "half_up_after_currency_aggregation";
      currencies: RecurringCurrency[];
    };

function reduce(numerator: bigint, denominator: bigint): Fraction {
  let a = numerator,
    b = denominator;
  while (b !== 0n) [a, b] = [b, a % b];
  return { numerator: numerator / a, denominator: denominator / a };
}

/** Nonnegative exact minor-unit average/total, rounded half up only at the display boundary. */
export function exactMinorAmount(numerator: bigint, denominator: bigint): ExactMinorAmount {
  const value = reduce(numerator, denominator);
  return {
    numerator: value.numerator.toString(),
    denominator: value.denominator.toString(),
    rounded: ((value.numerator * 2n + value.denominator) / (2n * value.denominator)).toString()
  };
}

function monthly(rate: RecurringRate): Fraction {
  if (rate.status !== "active" && rate.status !== "past_due") {
    return { numerator: 0n, denominator: 1n };
  }
  const amount = BigInt(rate.money.amount_minor),
    count = BigInt(rate.interval_count);
  switch (rate.billing_interval) {
    case "day":
      return reduce(amount * 365n, count * 12n);
    case "week":
      return reduce(amount * 365n, count * 84n);
    case "month":
      return reduce(amount, count);
    case "year":
      return reduce(amount, count * 12n);
  }
}

/** One complete, deduplicated effective rate set; this arithmetic grants no source/history authority. */
export function evaluateRecurringRevenue(input: unknown): RecurringRevenueResult {
  if (!Array.isArray(input)) return { status: "unavailable", reason: "invalid_input" };
  if (input.length > MAX_FINANCIAL_FACTS)
    return { status: "unavailable", reason: "capacity_exceeded" };
  const parsed = z.array(RecurringRateSchema).safeParse(input);
  if (!parsed.success) return { status: "unavailable", reason: "invalid_input" };
  const currencies = new Map<string, { rate: RecurringRate; total: Fraction; count: number }>();
  for (const rate of parsed.data) {
    const entry = currencies.get(rate.money.currency) ?? {
      rate,
      total: { numerator: 0n, denominator: 1n },
      count: 0
    };
    const value = monthly(rate);
    entry.total = reduce(
      entry.total.numerator * value.denominator + value.numerator * entry.total.denominator,
      entry.total.denominator * value.denominator
    );
    if (value.numerator > 0n) entry.count++;
    if (entry.total.numerator > MAX_FINANCIAL_AGGREGATE * entry.total.denominator) {
      return { status: "unavailable", reason: "aggregate_overflow" };
    }
    currencies.set(rate.money.currency, entry);
  }
  return {
    status: "available",
    calculation_version: "recurring-revenue-1",
    normalization: "fixed_365_day_year",
    rounding: "half_up_after_currency_aggregation",
    currencies: [...currencies.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, entry]) => ({
        currency,
        exponent: entry.rate.money.exponent,
        currency_table_version: entry.rate.currency_table_version,
        mrr_minor: exactMinorAmount(entry.total.numerator, entry.total.denominator),
        contributing_rates: entry.count
      }))
  };
}
