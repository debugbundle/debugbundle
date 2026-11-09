import { expect, it } from "vitest";
import { reportModelProfile } from "../../../packages/smart-reports/src/model-request.js";
import {
  maximumReportRunCost,
  actualReportAttemptCost,
  REPORT_AI_RUN_BUDGET_NANO_USD,
  REPORT_AI_MONTHLY_BUDGET_NANO_USD
} from "../../../packages/smart-reports/src/model-cost.js";

it("protects all forty full Luna runs including two paid attempts, cache writes and regional processing", () => {
  const cost = maximumReportRunCost({
    model: "gpt-6-luna",
    max_input_tokens: 40000,
    max_output_tokens: 8000,
    max_paid_attempts: 2,
    regional_processing: true
  });
  expect(cost).toEqual({ attempt_nano_usd: 9900000, run_nano_usd: 19800000 });
  expect(cost.run_nano_usd).toBeLessThanOrEqual(REPORT_AI_RUN_BUDGET_NANO_USD);
  expect(cost.run_nano_usd * 40).toBeLessThanOrEqual(REPORT_AI_MONTHLY_BUDGET_NANO_USD);
});
it("permits a bounded Terra candidate without silently funding a second paid attempt", () => {
  const profile = {
    model: "gpt-6.1-terra" as const,
    max_input_tokens: 10000,
    max_output_tokens: 1800,
    max_paid_attempts: 1,
    regional_processing: true
  };
  expect(maximumReportRunCost(profile)).toEqual({
    attempt_nano_usd: 23650000,
    run_nano_usd: 23650000
  });
  expect(() => maximumReportRunCost({ ...profile, max_paid_attempts: 2 })).toThrow(
    "report_run_budget_exceeded"
  );
});
it("settles disjoint ordinary, cached, cache-write and output usage without double counting reasoning", () => {
  expect(
    actualReportAttemptCost({
      model: "gpt-6.1-terra",
      regional_processing: false,
      usage: {
        input_tokens: 12000,
        output_tokens: 200,
        total_tokens: 12200,
        input_tokens_details: {
          cached_tokens: 4000,
          cache_write_tokens: 7000,
          cache_write_tokens_details: { ttl_30m_tokens: 3000, ttl_12h_tokens: 4000 }
        },
        output_tokens_details: { reasoning_tokens: 100 }
      }
    })
  ).toBe(15950000);
});
it("charges reasoning as part of total output once, and rounds a regional premium upward", () => {
  const usage = {
    input_tokens: 10000,
    output_tokens: 2000,
    total_tokens: 12000,
    input_tokens_details: {
      cached_tokens: 0,
      cache_write_tokens: 0,
      cache_write_tokens_details: { ttl_30m_tokens: 0, ttl_12h_tokens: 0 }
    },
    output_tokens_details: { reasoning_tokens: 1000 }
  };
  expect(actualReportAttemptCost({ model: "gpt-6-luna", regional_processing: false, usage })).toBe(
    2000000
  );
  expect(
    actualReportAttemptCost({
      model: "gpt-6-luna",
      regional_processing: true,
      usage: {
        ...usage,
        input_tokens: 1,
        output_tokens: 1,
        total_tokens: 2,
        output_tokens_details: { reasoning_tokens: 0 }
      }
    })
  ).toBe(660);
});
it("rounds fractional regional nanodollars upward", () => {
  expect(
    actualReportAttemptCost({
      model: "gpt-6-luna",
      regional_processing: true,
      usage: {
        input_tokens: 1,
        output_tokens: 0,
        total_tokens: 1,
        input_tokens_details: {
          cached_tokens: 0,
          cache_write_tokens: 1,
          cache_write_tokens_details: { ttl_30m_tokens: 1, ttl_12h_tokens: 0 }
        },
        output_tokens_details: { reasoning_tokens: 0 }
      }
    })
  ).toBe(138);
});

it.each([
  {
    cached_tokens: 11,
    cache_write_tokens: 0,
    cache_write_tokens_details: { ttl_30m_tokens: 0, ttl_12h_tokens: 0 }
  },
  {
    cached_tokens: 0,
    cache_write_tokens: 4,
    cache_write_tokens_details: { ttl_30m_tokens: 3, ttl_12h_tokens: 2 }
  }
])(
  "refuses inconsistent usage rather than treating unknown charges as free %j",
  (input_tokens_details) => {
    expect(() =>
      actualReportAttemptCost({
        model: "gpt-6-luna",
        regional_processing: false,
        usage: {
          input_tokens: 10,
          output_tokens: 1,
          total_tokens: 11,
          input_tokens_details,
          output_tokens_details: { reasoning_tokens: 0 }
        }
      })
    ).toThrow();
  }
);
it("refuses unsupported models, long context, unsafe numbers and unbounded attempts", () => {
  const profile = {
    model: "gpt-6-luna" as const,
    max_input_tokens: 40000,
    max_output_tokens: 8000,
    max_paid_attempts: 2,
    regional_processing: false
  };
  expect(() => maximumReportRunCost({ ...profile, max_input_tokens: 300000 })).toThrow();
  expect(() => maximumReportRunCost({ ...profile, max_paid_attempts: 8 })).toThrow();
  expect(() => maximumReportRunCost({ ...profile, max_output_tokens: NaN })).toThrow();
});
it("reserves all forty production Terra runs below the shared monthly dollar with input headroom", () => {
  const profile = reportModelProfile("gpt-6.1-terra");
  expect(profile).toMatchObject({
    max_input_tokens: 12000,
    max_output_tokens: 1500,
    max_paid_attempts: 1
  });
  expect(maximumReportRunCost(profile).run_nano_usd * 40).toBe(990000000);
});
