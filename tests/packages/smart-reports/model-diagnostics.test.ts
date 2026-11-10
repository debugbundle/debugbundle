import { describe, expect, it } from "vitest";
import { safeReportModelDiagnostic } from "../../../packages/smart-reports/src/model-diagnostics.js";

describe("safe report model diagnostics", () => {
  it.each([
    "report_output_incomplete",
    "report_model_refused",
    "report_invalid_json",
    "report_invalid_narrative",
    "report_unknown_reference",
    "report_numeric_prose",
    "report_provider_http_429",
    "report_provider_outcome_unknown",
    "report_unexpected_billing_profile"
  ])("preserves the diagnostic code %s", (reason) => {
    expect(safeReportModelDiagnostic(reason)).toBe(reason);
  });

  it.each([
    undefined,
    null,
    { message: "secret" },
    "report_unknown_reference: secret",
    "report_provider_http_429 secret",
    "report_provider_http_999",
    "sk-private-api-key",
    "rejected model text"
  ])("discards arbitrary text without throwing", (reason) => {
    expect(safeReportModelDiagnostic(reason)).toBe("report_diagnostic_unavailable");
  });
});
