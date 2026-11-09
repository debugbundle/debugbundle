import {
  ReportDocumentSchema,
  type ReportDocument
} from "../../smart-reports/src/report-document.js";
import { reportDashboardLocation } from "../../smart-reports/src/report-navigation.js";
import {
  formatReportValue,
  reportMetricComparison,
  reportMetricLabels,
  reportEvidenceSections
} from "../../smart-reports/src/report-presentation.js";
import {
  escapeHtml,
  renderEmailLayout,
  renderEmailButton,
  renderEmailKeyValueList,
  renderEmailParagraph,
  renderEmailSubheading,
  renderEmailOrderedList,
  renderEmailTextLink
} from "./email-layout.js";
type Rendered = { subject: string; text: string; html: string };
/** A bounded overview of the saved canonical report. Rendering never calls AI,
 * grants access or adds a recipient; delivery must fence those separately. */
export function renderSmartReportEmail(input: {
  document: ReportDocument;
  appBaseUrl: string;
  brandMarkUrl?: string;
}): Rendered {
  const doc = ReportDocumentSchema.parse(input.document),
    { facts } = doc.report,
    { narrative } = doc,
    { solved, urgent, coming } = reportEvidenceSections(doc),
    location = reportDashboardLocation(doc.report.organization_id, doc.run_id, input.appBaseUrl);
  const period = `${facts.period.starts_at.slice(0, 10)} to ${facts.period.ends_at.slice(0, 10)} (end exclusive, UTC)`,
    overview =
      narrative?.overview.text ??
      "AI analysis unavailable. This report retains its recorded facts, resolutions and selected outstanding work.",
    scope = `${facts.projects.length} selected projects · ${facts.privacy_mode} evidence mode`,
    text: string[] = [
      `DebugBundle ${facts.period.kind} report`,
      doc.name,
      period,
      scope,
      "",
      overview
    ],
    body: string[] = [
      renderEmailParagraph(escapeHtml(period)),
      renderEmailParagraph(escapeHtml(scope)),
      renderEmailParagraph(escapeHtml(overview)),
      renderEmailButton({ label: "Read report · HTML and PDF", url: location })
    ];
  const reference = (text: string, ref: string): string =>
    `${escapeHtml(text)} ${renderEmailTextLink({ label: "Evidence", url: `${location}#ref-${ref}` })}`;
  if (narrative?.highlights.length) {
    const highlights = narrative.highlights.slice(0, 3);
    text.push(
      "",
      "Major events",
      ...highlights.map((item) => `${item.kind.replaceAll("_", " ")}: ${item.text}`)
    );
    body.push(
      renderEmailSubheading("Major events"),
      renderEmailOrderedList(
        highlights.map((item) => escapeHtml(`${item.kind.replaceAll("_", " ")}: ${item.text}`))
      )
    );
  }
  function evidence(title: string, items: typeof solved): void {
    text.push("", title);
    body.push(renderEmailSubheading(title));
    if (!items.length) {
      const empty =
        "No selected evidence in this category. Check the full report’s coverage before interpreting missing observations.";
      text.push(empty);
      body.push(renderEmailParagraph(escapeHtml(empty)));
      return;
    }
    const selected = items.slice(0, 3);
    text.push(
      ...selected.map(
        (item) => `${item.title} — ${item.severity}, ${item.status.replaceAll("_", " ")}`
      )
    );
    body.push(
      renderEmailOrderedList(
        selected.map((item) =>
          reference(
            `${item.title} — ${item.severity}, ${item.status.replaceAll("_", " ")}`,
            item.ref
          )
        )
      )
    );
  }
  evidence("Recorded resolutions", solved);
  evidence(
    `Focus for the coming ${coming}`,
    [...urgent].sort(
      (a, b) => Number(b.severity === "critical") - Number(a.severity === "critical")
    )
  );
  if (narrative?.priorities.length) {
    const priorities = narrative.priorities.slice(0, 3);
    text.push(...priorities.map((item) => `${item.title}: ${item.action} ${item.rationale}`));
    body.push(
      renderEmailOrderedList(
        priorities.map((item) => escapeHtml(`${item.title}: ${item.action} ${item.rationale}`))
      )
    );
  }
  text.push(
    "",
    "Current / previous",
    "Open issue counts are period-end snapshots. Partial observations are not complete totals; missing data is unknown."
  );
  body.push(
    renderEmailSubheading("Current / previous"),
    renderEmailParagraph(
      "Open issue counts are period-end snapshots. Partial observations are not complete totals; missing data is unknown. The full report includes daily rates for unequal reporting periods."
    )
  );
  const keys = new Set([
    "new_incidents",
    "distinct_resolved_incidents",
    "open_high_incidents",
    "open_critical_incidents"
  ]);
  for (const project of facts.projects) {
    const metrics = facts.metrics.filter(
        (item) => item.project_ref === project.ref && keys.has(item.key)
      ),
      coverage = `Lifecycle: ${project.coverage.lifecycle} · Health: ${project.coverage.availability} · Analytics: ${project.coverage.analytics}`;
    text.push("", project.name, coverage);
    body.push(renderEmailSubheading(project.name), renderEmailParagraph(escapeHtml(coverage)));
    body.push(
      renderEmailKeyValueList(
        metrics.map((metric) => {
          const value = `${formatReportValue(metric.current, metric.current_complete)} / ${formatReportValue(metric.previous, metric.previous_complete)}; change: ${reportMetricComparison(metric).change}`;
          text.push(`${reportMetricLabels[metric.key]}: ${value}`);
          return { label: reportMetricLabels[metric.key], valueHtml: escapeHtml(value) };
        })
      )
    );
  }
  const limitations = [
    ...facts.selection_notes,
    ...(narrative?.limitations.map((item) => item.text) ?? [])
  ].slice(0, 3);
  if (limitations.length) {
    text.push("", "Coverage notes", ...limitations);
    body.push(
      renderEmailSubheading("Coverage notes"),
      renderEmailOrderedList(limitations.map(escapeHtml))
    );
  }
  const footer = `Recorded resolution is a saved workflow action; observed recovery is a successful monitored response. Neither establishes causation. This is a selected overview; open the authenticated report for all facts, sources, HTML and downloadable PDF. Source evidence follows its own retention; the separate report retention ends ${doc.report.expires_at}.`;
  text.push("", footer, location);
  body.push(renderEmailParagraph(escapeHtml(footer)));
  const html = renderEmailLayout({
    title: doc.name,
    eyebrow: `${facts.period.kind} report`,
    preheader: `${scope}. Recorded resolutions and priorities for the coming ${coming}.`,
    bodyHtml: body.join(""),
    ...(input.brandMarkUrl === undefined ? {} : { brandMarkUrl: input.brandMarkUrl })
  });
  if (new TextEncoder().encode(html).length > 128 * 1024)
    throw new Error("report_email_size_exceeded");
  return {
    subject: `[DebugBundle ${facts.period.kind}] ${doc.name.replace(/[\u0000-\u001f\u007f]+/g, " ").trim()}`,
    text: text.join("\n"),
    html
  };
}
