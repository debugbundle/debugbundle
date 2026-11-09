export class SmartReportError extends Error {
  constructor(
    readonly code:
      | "forbidden"
      | "email_verification_required"
      | "invalid_report_scope"
      | "invalid_report_recipient"
      | "upgrade_required"
      | "report_definition_limit_reached"
      | "report_request_conflict"
      | "report_version_conflict"
      | "organization_context_changed"
      | "weekly_overlap_confirmation_required"
      | "report_not_found"
      | "report_quota_exhausted"
      | "report_ai_budget_exhausted"
      | "report_period_unavailable"
  ) {
    super(code);
    this.name = "SmartReportError";
  }
}
