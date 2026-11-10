/** Operator-only codes. Never persist provider bodies, rejected text or exception
 * messages. Keep diagnostics outside the established immutable receipt hash. */
export const REPORT_MODEL_DIAGNOSTIC_CODES = [
  "report_output_incomplete",
  "report_model_refused",
  "report_unexpected_model_output",
  "report_invalid_model_message",
  "report_invalid_json",
  "report_invalid_narrative",
  "report_untrusted_link",
  "report_numeric_prose",
  "report_unsafe_prose",
  "report_unknown_reference",
  "report_claim_not_supported",
  "report_priority_not_supported",
  "report_priority_missing",
  "report_coverage_missing",
  "report_usage_unavailable",
  "report_provider_outcome_unknown",
  "report_unexpected_billing_profile",
  "report_usage_out_of_bounds",
  "report_diagnostic_unavailable"
] as const;
const codes = new Set<string>(REPORT_MODEL_DIAGNOSTIC_CODES);
export function safeReportModelDiagnostic(reason: unknown): string {
  return typeof reason === "string" &&
    (codes.has(reason) || /^report_provider_http_[1-5][0-9]{2}$/.test(reason))
    ? reason
    : "report_diagnostic_unavailable";
}
