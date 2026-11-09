import { afterEach, expect, it, vi } from "vitest";
import { configureSmartReports } from "../../../packages/smart-reports/src/report-runtime-config.js";
const key = "sk-synthetic-report-runtime-key";
afterEach(() => vi.unstubAllEnvs());
it("keeps the report lane and provider disabled by default", () => {
  expect(configureSmartReports({})).toMatchObject({
    enabled: false,
    profile: null,
    model: null,
    monthly_budget_nano_usd: 1000000000
  });
});
it.each([
  {},
  { SMART_REPORT_AI_API_KEY: "invalid" },
  { SMART_REPORT_AI_API_KEY: key, SMART_REPORT_AI_MONTHLY_BUDGET_NANO_USD: "NaN" },
  { SMART_REPORT_AI_API_KEY: key, SMART_REPORT_AI_MONTHLY_BUDGET_NANO_USD: "1000000001" },
  { SMART_REPORT_AI_API_KEY: key, SMART_REPORT_AI_MONTHLY_BUDGET_NANO_USD: "0" }
])(
  "keeps optional misconfigured AI factual without breaking reporting configuration: %j",
  (options) => {
    vi.stubEnv("SELFHOST_MODE", "false");
    expect(
      configureSmartReports({
        SMART_REPORTS_ENABLED: "true",
        SMART_REPORT_AI_ENABLED: "true",
        ...options
      })
    ).toMatchObject({ enabled: true, profile: null, model: null });
  }
);
it("uses the evaluated fixed profile and never serialises the key in configuration", () => {
  vi.stubEnv("SELFHOST_MODE", "false");
  const config = configureSmartReports({
    SMART_REPORTS_ENABLED: "true",
    SMART_REPORT_AI_ENABLED: "true",
    SMART_REPORT_AI_API_KEY: key
  });
  expect(config.profile).toMatchObject({
    model: "gpt-6.1-terra",
    max_input_tokens: 12000,
    max_output_tokens: 1500,
    max_paid_attempts: 1
  });
  expect(config.model).not.toBeNull();
  expect(JSON.stringify(config)).not.toContain(key);
});
it("allows an explicitly configured self-hosted operator budget without changing the hosted ceiling", () => {
  vi.stubEnv("SELFHOST_MODE", "true");
  expect(
    configureSmartReports({
      SMART_REPORTS_ENABLED: "true",
      SMART_REPORT_AI_ENABLED: "true",
      SMART_REPORT_AI_API_KEY: key,
      SMART_REPORT_AI_MONTHLY_BUDGET_NANO_USD: "2000000000"
    })
  ).toMatchObject({ monthly_budget_nano_usd: 2000000000, profile: { model: "gpt-6.1-terra" } });
});
