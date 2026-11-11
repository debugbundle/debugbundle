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
export function reportRunPresentation(
  run: Pick<ReportRunRecord, "status" | "skip_reason"> & Partial<Pick<ReportRunRecord, "ai_status">>
): {
  label: string;
  description: string;
  tone: "info" | "warning" | "destructive" | "success";
} {
  switch (run.status) {
    case "ready":
      return {
        label: "Ready",
        description:
          run.ai_status === "unavailable"
            ? "Your factual report is ready."
            : "Recorded facts and AI analysis are available.",
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
export function reportAnalysisExplanation(
  reason: ReportDocument["analysis"]["reason"],
  status?: ReportDocument["analysis"]["status"]
): string {
  if (status === "not_requested")
    return "This report is generated from recorded facts. AI analysis is not included.";
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
  focus: ReportDocument["report"]["facts"]["evidence"];
  happened: ReportDocument["report"]["facts"]["evidence"];
  solved: ReportDocument["report"]["facts"]["evidence"];
  coming: string;
} {
  const facts = doc.report.facts,
    severity = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 },
    outstanding = facts.evidence
      .filter((item) => item.status === "open" || item.status === "regressed")
      .sort((a, b) => severity[a.severity] - severity[b.severity]),
    urgent = outstanding.filter((item) => item.severity === "critical" || item.severity === "high");
  return {
    urgent,
    // Keep every selected urgent item; use remaining focus slots for concrete
    // lower-severity work in intentional factual reports. Business stays fixed.
    focus:
      doc.analysis.status === "not_requested"
        ? outstanding.slice(0, Math.max(5, urgent.length))
        : urgent,
    happened: facts.evidence.filter((item) =>
      item.period_events.some((event) => ["new", "regressed", "reopened"].includes(event))
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

/** A concise per-project digest of saved facts, shared by web/HTML/PDF. Never
 * pool visitor identities or check downtime across projects, infer a cause, or
 * interpret missing/partial observations as healthy or comparable trends. */
export function reportFactualHighlights(
  doc: ReportDocument
): Array<{ text: string; evidence_refs: string[] }> {
  if (doc.analysis.status !== "not_requested") return [];
  return doc.report.facts.projects.map((project) => {
    const selected = doc.report.facts.metrics.filter(
        (metric) => metric.project_ref === project.ref
      ),
      refs = [project.coverage_ref],
      statements: string[] = [];
    for (const key of [
      "new_incidents",
      "regressions",
      "distinct_resolved_incidents",
      "analytics_sessions"
    ] as const) {
      const metric = selected.find((item) => item.key === key);
      if (!metric) continue;
      refs.push(metric.ref);
      let line = `${reportMetricLabels[key]}: ${formatReportValue(metric.current, metric.current_complete)}`;
      if (
        (key === "new_incidents" || key === "analytics_sessions") &&
        metric.current_complete &&
        metric.previous_complete &&
        metric.comparison?.comparison_available &&
        metric.comparison.current_per_day !== null &&
        metric.comparison.previous_per_day !== null
      )
        line += ` (daily rate ${reportNumber.format(metric.comparison.current_per_day)} vs ${reportNumber.format(metric.comparison.previous_per_day)})`;
      statements.push(line);
    }
    const total = selected.find((item) => item.key === "total_checks"),
      successful = selected.find((item) => item.key === "successful_checks");
    if (
      total?.current !== null &&
      total?.current !== undefined &&
      total.current > 0 &&
      successful?.current !== null &&
      successful?.current !== undefined
    ) {
      refs.push(total.ref, successful.ref);
      statements.push(
        `Successful health checks: ${reportNumber.format(successful.current)} of ${reportNumber.format(total.current)} observed${total.current_complete && successful.current_complete ? "" : " (partial)"}; this is monitored-check coverage, not account uptime`
      );
    }
    if (!statements.length)
      statements.push("No selected metric observations; missing data is unknown");
    statements.push(
      `Coverage: lifecycle ${project.coverage.lifecycle}, availability ${project.coverage.availability}, analytics ${project.coverage.analytics}`
    );
    return { text: `${project.name} — ${statements.join(". ")}.`, evidence_refs: refs };
  });
}
