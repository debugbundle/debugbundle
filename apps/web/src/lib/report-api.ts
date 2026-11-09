import {
  createReportApi,
  createReportRunApi,
  createReportPdfApi,
  createReportDeliveryApi,
  reportPdfDownloadPath,
  ReportApiError
} from "../../../../packages/report-client/src/index.js";
import {
  ApiRequestError,
  buildApiUrl,
  buildBrowserSessionHeaders,
  readJson
} from "./api-client.js";
const client = {
  async request({
    method,
    path,
    body
  }: Parameters<Parameters<typeof createReportApi>[0]["request"]>[0]): Promise<{
    status: number;
    body: unknown;
  }> {
    const response = await fetch(buildApiUrl(path), {
      method,
      credentials: "include",
      headers: buildBrowserSessionHeaders(body !== undefined),
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, body: await readJson<unknown>(response) };
  }
};
/** Browser authority stays in the HttpOnly session; this marker is never sent. */
export const reportScope = (
  organizationId: string
): { organizationId: string; bearerToken: string } => ({
  organizationId,
  bearerToken: "browser-session"
});
export const reportApi = {
  definitions: createReportApi(client),
  runs: createReportRunApi(client),
  pdf: createReportPdfApi(client),
  deliveries: createReportDeliveryApi(client)
};
export const reportPdfFileUrl = (organizationId: string, runId: string): string =>
  buildApiUrl(reportPdfDownloadPath({ organizationId, runId }));
export const reportHtmlUrl = (organizationId: string, runId: string): string =>
  buildApiUrl(reportPdfDownloadPath({ organizationId, runId }).replace(/\/pdf\/file$/, "/html"));
const messages: Record<string, string> = {
  report_source_consent_required:
    "Agree to the bounded redacted source collection, or choose restricted mode.",
  invalid_report_input: "Check the report name, scope, recipients and schedule.",
  report_version_conflict:
    "This report definition changed. Reload before saving; your draft is still here.",
  organization_context_changed: "Your workspace changed. Reload Reports before continuing.",
  report_quota_exhausted:
    "The shared monthly report allowance is exhausted. It resets in the next allowance window.",
  report_ai_budget_exhausted: "The report AI budget is fully allocated for this allowance window.",
  report_definition_limit_reached:
    "This workspace already has the maximum number of report definitions.",
  weekly_overlap_confirmation_required:
    "Confirm that the existing weekly digest should continue alongside this report.",
  invalid_report_recipient:
    "Each recipient must be verified and have current read access to every selected project.",
  forbidden: "You do not currently have access to the entire report scope.",
  upgrade_required:
    "New Smart Reports require Business. Authorised retained reports remain available until expiry.",
  report_not_found:
    "This report is unavailable, expired or disabled. Retained archives require access to every original project."
};
export function reportErrorMessage(error: unknown): string {
  return error instanceof ReportApiError || error instanceof ApiRequestError
    ? (messages[error.code] ?? "The report action could not be completed. Refresh or try again.")
    : "The report service could not be reached. Try again.";
}
