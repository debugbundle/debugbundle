import type { ReportDocument } from "./report-document.js";
import type { ReportModelMetric } from "./model-evidence.js";
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
  estimated_check_downtime_seconds: "Estimated downtime (seconds)",
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
    urgent: facts.evidence.filter(
      (item) =>
        (item.status === "open" || item.status === "regressed") &&
        (item.severity === "high" || item.severity === "critical")
    ),
    solved: facts.evidence.filter(
      (item) =>
        (item.status === "resolved" && item.period_events.includes("resolved")) ||
        (item.status === "observed_recovery" && item.period_events.includes("observed_recovery"))
    ),
    coming:
      facts.period.kind === "daily" ? "day" : facts.period.kind === "weekly" ? "week" : "month"
  };
}
