import type { ReportDocument } from "./report-document.js";
import type { ReportModelMetric } from "./model-evidence.js";
import type { ReportPeriod } from "./report-period.js";
import type { ReportRunRecord } from "./report-run.js";
const date = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});
const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC"
});
export const reportDateLabel = (at: string): string => date.format(new Date(at));
export const reportTimeLabel = (at: string): string => `${dateTime.format(new Date(at))} UTC`;
/** Display the included calendar dates while retaining half-open UTC facts. */
export function reportPeriodLabel(period: ReportPeriod): string {
  const start = new Date(period.starts_at),
    end = new Date(Date.parse(period.ends_at) - 1);
  return `${date.format(start) === date.format(end) ? date.format(start) : date.formatRange(start, end).replace(/\s*–\s*/g, "–")} UTC`;
}
export function reportRunPresentation(run: Pick<ReportRunRecord, "status" | "skip_reason">): {
  label: string;
  description: string;
  tone: "info" | "warning" | "destructive" | "success";
} {
  switch (run.status) {
    case "ready":
      return {
        label: "Ready",
        description: "Recorded facts and AI analysis are available.",
        tone: "success"
      };
    case "factual_only":
      return {
        label: "Facts only",
        description: "Recorded facts are available. AI analysis is unavailable for this report.",
        tone: "info"
      };
    case "queued":
      return {
        label: "Queued",
        description:
          "Your report is waiting to be generated. The report will appear automatically when it is ready.",
        tone: "info"
      };
    case "processing":
      return {
        label: "Generating",
        description:
          "Your report is being prepared. The report will appear automatically when it is ready.",
        tone: "info"
      };
    case "failed":
      return {
        label: "Failed",
        description:
          "This report could not be completed. Regenerating creates a new report and uses another generation; it is never done automatically.",
        tone: "destructive"
      };
    case "skipped_quota":
      return {
        label: "Skipped",
        description:
          run.skip_reason === "ai_budget"
            ? "The workspace AI budget was reached. No report was generated."
            : "The workspace report allowance was reached. No report was generated.",
        tone: "warning"
      };
    case "paused_access":
      return {
        label: "Paused",
        description:
          "Generation stopped because access or eligibility changed. An administrator must review the saved report settings.",
        tone: "warning"
      };
    case "cancelled":
      return {
        label: "Cancelled",
        description:
          "Generation was cancelled. Any already paid or uncertain AI attempt remains accounted for.",
        tone: "info"
      };
    case "expired":
      return {
        label: "Expired",
        description: "This report has reached the end of its retention period.",
        tone: "info"
      };
  }
}
/** Fixed customer copy; internal diagnostics never cross the report boundary. */
export function reportAnalysisExplanation(reason: ReportDocument["analysis"]["reason"]): string {
  const explanations = {
    model_unavailable: "AI analysis is unavailable for this report.",
    input_limit:
      "AI analysis is unavailable because this report exceeds the supported input limit.",
    preflight_unavailable:
      "AI analysis is unavailable because the provider could not confirm that the request could be processed safely.",
    model_rejected:
      "AI analysis is unavailable because the generated response could not be used for this report.",
    model_uncertain:
      "AI analysis is unavailable because the provider response could not be confirmed.",
    saved_response_unavailable:
      "AI analysis is unavailable because the saved response could not be recovered."
  };
  return `${explanations[reason ?? "model_unavailable"]} The recorded facts, resolutions and selected outstanding work remain available.${reason === "model_rejected" || reason === "model_uncertain" || reason === "saved_response_unavailable" ? " No automatic paid retry will be made." : ""}`;
}
export const reportNumber = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
export const reportMetricLabels: Record<ReportModelMetric["key"], string> = {
  new_incidents: "New incidents",
  resolution_events: "Recorded resolution events",
  distinct_resolved_incidents: "Distinct resolved incidents",
  regressions: "Regressions",
  new_improvements: "New improvements",
  resolved_improvements: "Resolved improvements",
  open_high_incidents: "Open high incidents at period end",
  open_critical_incidents: "Open critical incidents at period end",
  successful_checks: "Successful health checks",
  total_checks: "Observed health checks",
  estimated_check_downtime_seconds: "Estimated check downtime (seconds)",
  analytics_sessions: "Captured sessions",
  analytics_events: "Captured analytics events",
  analytics_page_views: "Captured page views",
  daily_active_visitor_days: "Daily active visitor-days"
};
export const formatReportValue = (value: number | null, complete: boolean): string =>
  value === null ? "Unknown" : `${reportNumber.format(value)}${complete ? "" : " (partial)"}`;
export function reportMetricComparison(item: ReportModelMetric): { change: string; daily: string } {
  const comparison = item.comparison;
  return {
    change:
      comparison?.comparison_available && comparison.absolute_change !== null
        ? `${reportNumber.format(comparison.absolute_change)}${comparison.percent_change === null ? "" : ` (${reportNumber.format(comparison.percent_change)}%)`}`
        : "Not comparable",
    daily:
      comparison?.metric_semantics === "snapshot"
        ? "Snapshot"
        : comparison?.comparison_available
          ? `${formatReportValue(comparison.current_per_day, true)} / ${formatReportValue(comparison.previous_per_day, true)}`
          : "Unknown"
  };
}
export function reportEvidenceSections(doc: ReportDocument): {
  urgent: ReportDocument["report"]["facts"]["evidence"];
  solved: ReportDocument["report"]["facts"]["evidence"];
  coming: string;
} {
  const facts = doc.report.facts;
  return {
    urgent: facts.evidence
      .filter(
        (item) =>
          (item.status === "open" || item.status === "regressed") &&
          (item.severity === "high" || item.severity === "critical")
      )
      .sort((a, b) => Number(b.severity === "critical") - Number(a.severity === "critical")),
    solved: facts.evidence.filter(
      (item) =>
        (item.status === "resolved" && item.period_events.includes("resolved")) ||
        (item.status === "observed_recovery" && item.period_events.includes("observed_recovery"))
    ),
    coming:
      facts.period.kind === "daily" ? "day" : facts.period.kind === "weekly" ? "week" : "month"
  };
}
