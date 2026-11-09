import { BUSINESS_SMART_REPORT_RUNS_PER_MONTH } from "../../shared-types/src/smart-report-limits.js";
import { z } from "zod";

export const ReportModelIdSchema = z.enum(["gpt-6-luna", "gpt-6.1-terra"]);
export type ReportModelId = z.infer<typeof ReportModelIdSchema>;
export const REPORT_AI_MONTHLY_BUDGET_NANO_USD = 1_000_000_000;
export const REPORT_AI_RUN_BUDGET_NANO_USD = Math.floor(
  REPORT_AI_MONTHLY_BUDGET_NANO_USD / BUSINESS_SMART_REPORT_RUNS_PER_MONTH
);
export const REPORT_AI_EVALUATION_BUDGET_NANO_USD = 1_000_000_000;
const tokens = z.number().int().safe().nonnegative();
// Standard short-context rates fetched 2026-11-07:
// https://developers.openai.com/api/docs/pricing
// Use integer nanodollars/token; no cache saving or processing-tier discount is
// needed to satisfy a reservation. Model choice still requires the quality eval.
const rates = {
  "gpt-6-luna": { input: 100n, output: 500n, cached: 10n, write30: 125n, write12: 250n },
  "gpt-6.1-terra": { input: 1000n, output: 5000n, cached: 50n, write30: 1250n, write12: 2500n }
} as const;
function withRegionalPremium(amount: bigint, regional: boolean): number {
  const value = regional ? (amount * 110n + 99n) / 100n : amount;
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error("report_cost_out_of_range");
  return result;
}
export const ReportAttemptProfileSchema = z
  .object({
    model: ReportModelIdSchema,
    max_input_tokens: tokens.min(1).max(272_000),
    max_output_tokens: tokens.min(1).max(128_000),
    max_paid_attempts: z.number().int().min(1).max(2),
    regional_processing: z.boolean()
  })
  .strict();
export type ReportAttemptProfile = z.infer<typeof ReportAttemptProfileSchema>;
/** A logical run owns its complete permitted attempt budget. The caller must
 * enforce the input bound before sending and use only Standard/30m caching;
 * an uncertain outcome keeps its reservation rather than funding a blind retry. */
export function maximumReportRunCost(raw: ReportAttemptProfile): {
  attempt_nano_usd: number;
  run_nano_usd: number;
} {
  const input = ReportAttemptProfileSchema.parse(raw),
    rate = rates[input.model];
  const attempt = withRegionalPremium(
    BigInt(input.max_input_tokens) * rate.write30 + BigInt(input.max_output_tokens) * rate.output,
    input.regional_processing
  );
  const run = attempt * input.max_paid_attempts;
  if (run > REPORT_AI_RUN_BUDGET_NANO_USD) throw new Error("report_run_budget_exceeded");
  return { attempt_nano_usd: attempt, run_nano_usd: run };
}
export const ReportModelUsageSchema = z
  .object({
    input_tokens: tokens.max(272_000),
    output_tokens: tokens.max(128_000),
    total_tokens: tokens,
    input_tokens_details: z
      .object({
        cached_tokens: tokens,
        cache_write_tokens: tokens,
        cache_write_tokens_details: z
          .object({ ttl_30m_tokens: tokens, ttl_12h_tokens: tokens })
          .strict()
      })
      .strict(),
    output_tokens_details: z.object({ reasoning_tokens: tokens }).strict()
  })
  .strict()
  .superRefine((value, context) => {
    const detail = value.input_tokens_details,
      writes = detail.cache_write_tokens_details;
    if (
      detail.cache_write_tokens !== writes.ttl_30m_tokens + writes.ttl_12h_tokens ||
      detail.cached_tokens + detail.cache_write_tokens > value.input_tokens ||
      value.output_tokens_details.reasoning_tokens > value.output_tokens ||
      value.total_tokens !== value.input_tokens + value.output_tokens
    ) {
      context.addIssue({ code: "custom", message: "report_usage_inconsistent" });
    }
  });
/** Output includes reasoning already. Cache reads and the two write lifetimes
 * are disjoint input buckets; missing/inconsistent usage is not a free call. */
export function actualReportAttemptCost(raw: {
  model: ReportModelId;
  regional_processing: boolean;
  usage: z.infer<typeof ReportModelUsageSchema>;
}): number {
  const input = z
    .object({
      model: ReportModelIdSchema,
      regional_processing: z.boolean(),
      usage: ReportModelUsageSchema
    })
    .strict()
    .parse(raw);
  const rate = rates[input.model],
    detail = input.usage.input_tokens_details;
  const ordinary = input.usage.input_tokens - detail.cached_tokens - detail.cache_write_tokens;
  return withRegionalPremium(
    BigInt(ordinary) * rate.input +
      BigInt(detail.cached_tokens) * rate.cached +
      BigInt(detail.cache_write_tokens_details.ttl_30m_tokens) * rate.write30 +
      BigInt(detail.cache_write_tokens_details.ttl_12h_tokens) * rate.write12 +
      BigInt(input.usage.output_tokens) * rate.output,
    input.regional_processing
  );
}
