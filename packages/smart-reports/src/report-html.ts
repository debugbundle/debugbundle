import {
  reportMetricLabels,
  reportMetricComparison,
  formatReportValue,
  reportEvidenceSections,
  reportAnalysisExplanation,
  reportPeriodLabel,
  reportTimeLabel
} from "./report-presentation.js";
import { ReportDocumentSchema, type ReportDocument } from "./report-document.js";
import { reportLinkLocation } from "./report-content.js";
import type { ReportModelEvidence, ReportModelMetric } from "./model-evidence.js";
const escape = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const css = `:root{--background:#fff;--foreground:#171717;--muted:#737373;--border:#e5e5e5;--radius:.625rem}*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--foreground);font:15px/1.6 Arial,Helvetica,sans-serif}main{max-width:1100px;margin:auto;padding:32px 20px}header{border-bottom:1px solid var(--border);margin-bottom:28px;padding-bottom:20px}h1{font-size:28px;line-height:1.2;margin:4px 0 12px}h2{font-size:21px;line-height:1.3;margin:28px 0 12px}h3{font-size:17px;line-height:1.4;margin:20px 0 8px}p{margin:8px 0}.muted,.meta{color:var(--muted)}.notice{padding:14px 16px;border:1px solid var(--border);border-radius:var(--radius);margin:16px 0}.table-scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:36rem;font-size:13px;text-align:left}th,td{vertical-align:top;padding:9px 10px;border-bottom:1px solid var(--border);overflow-wrap:anywhere}th{font-weight:600}th:first-child{width:34%}ul{padding-left:22px}li{margin:10px 0}a{color:inherit;text-decoration:underline;text-underline-offset:3px}a:focus-visible{outline:2px solid currentColor;outline-offset:3px}.source{border-top:1px solid var(--border);padding:12px 0;break-inside:avoid}.context{white-space:pre-wrap;overflow-wrap:anywhere}.refs{font-size:12px}.skip{position:absolute;top:-100px}.skip:focus{top:8px;left:8px;background:white;padding:8px}footer{margin-top:32px;border-top:1px solid var(--border);padding-top:12px;font-size:12px;color:var(--muted)}@media(max-width:600px){main{padding:24px 16px}h1{font-size:24px}}@media print{@page{size:A4;margin:16mm}body{font-size:10pt}main{max-width:none;padding:0}table{min-width:0;table-layout:fixed;font-size:8pt}thead{display:table-header-group}tr,.notice{break-inside:avoid}h2,h3{break-after:avoid}.table-scroll{overflow:visible}a{overflow-wrap:anywhere}.skip{display:none}}`;
const refs = (items: string[]): string =>
  `<span class="refs">${items.map((ref) => `<a href="#ref-${escape(ref)}">${escape(ref)}</a>`).join(" · ")}</span>`;
function metrics(items: ReportModelMetric[]): string {
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="Period comparison"><table><thead><tr><th scope="col">Metric</th><th scope="col">Report period</th><th scope="col">Previous period</th><th scope="col">Change</th><th scope="col">Daily rate, current / previous</th></tr></thead><tbody>${items
    .map((item) => {
      const { change, daily } = reportMetricComparison(item);
      return `<tr id="ref-${escape(item.ref)}"><th scope="row">${escape(reportMetricLabels[item.key])}${item.notes.length ? `<div class="muted">${item.notes.map(escape).join(" ")}</div>` : ""}</th><td>${escape(formatReportValue(item.current, item.current_complete))}</td><td>${escape(formatReportValue(item.previous, item.previous_complete))}</td><td>${escape(change)}</td><td>${escape(daily)}</td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}
function evidence(items: ReportModelEvidence[], doc: ReportDocument): string {
  return items.length === 0
    ? '<p class="muted">No selected evidence in this category; see coverage before interpreting missing observations.</p>'
    : `<ul>${items.map((item) => `<li><span class="meta">${escape(doc.report.facts.projects.find((project) => project.ref === item.project_ref)?.name ?? "")} · </span><strong>${escape(item.title)}</strong> <span class="meta">${escape(item.severity)} · ${escape(item.status.replaceAll("_", " "))}</span> ${refs([item.ref])}</li>`).join("")}</ul>`;
}
/** Static semantic HTML shares the immutable facts/narrative used by PDF and
 * email. It has no script, remote assets or model-provided URLs/HTML. Source
 * availability is current server-owned state, never inferred from quiet data. */
export function renderReportHtml(
  raw: ReportDocument,
  options: { available_source_refs?: readonly string[]; source_base_url?: string } = {}
): string {
  const doc = ReportDocumentSchema.parse(raw),
    facts = doc.report.facts,
    narrative = doc.narrative;
  const available = new Set(options.available_source_refs ?? []);
  const { urgent, solved, coming } = reportEvidenceSections(doc);
  const period = reportPeriodLabel(facts.period);
  const overview = narrative
    ? `<p>${escape(narrative.overview.text)} ${refs(narrative.overview.evidence_refs)}</p>`
    : `<div class="notice"><strong>Factual report</strong><p>${escape(reportAnalysisExplanation(doc.analysis.reason))}</p></div>`;
  const highlights =
    narrative && narrative.highlights.length
      ? `<h2>What happened</h2><ul>${narrative.highlights.map((item) => `<li><span class="meta">${escape(item.kind.replaceAll("_", " "))}</span> — ${escape(item.text)} ${refs(item.evidence_refs)}</li>`).join("")}</ul>`
      : `<h2>What happened</h2>${evidence(
          facts.evidence.filter((item) =>
            item.period_events.some((event) => ["new", "regressed", "reopened"].includes(event))
          ),
          doc
        )}`;
  const priorities =
    narrative && narrative.priorities.length
      ? `${urgent.length ? evidence(urgent, doc) : ""}<ol>${narrative.priorities.map((item) => `<li><strong>${escape(item.title)}</strong><p>${escape(item.action)}</p><p class="muted">${escape(item.rationale)} ${refs(item.evidence_refs)}</p></li>`).join("")}</ol>`
      : urgent.length
        ? evidence(urgent, doc)
        : "<p>No selected high or critical work is recorded. Incomplete coverage does not establish that no issues exist.</p>";
  const projects = facts.projects
    .map(
      (project) =>
        `<section aria-labelledby="project-${escape(project.ref)}"><h2 id="project-${escape(project.ref)}">${escape(project.name)}</h2><p class="meta" id="ref-${escape(project.coverage_ref)}">Coverage: lifecycle ${escape(project.coverage.lifecycle)} · availability ${escape(project.coverage.availability)} · analytics ${escape(project.coverage.analytics)}</p>${project.notes.map((note) => `<p class="muted">${escape(note)}</p>`).join("")}${metrics(facts.metrics.filter((item) => item.project_ref === project.ref))}</section>`
    )
    .join("");
  const sourceDetails = facts.evidence
    .map((item) => {
      const source = doc.report.sources.find((source) => source.ref === item.ref);
      const href = reportLinkLocation(
        `/v1/organizations/${doc.report.organization_id}/reports/${doc.run_id}/sources/${item.ref}`,
        options.source_base_url
      );
      return `<article class="source" id="ref-${escape(item.ref)}"><h3>${escape(item.title)}</h3><p class="meta">${escape(facts.projects.find((project) => project.ref === item.project_ref)?.name ?? "")} · ${escape(item.type)} · ${escape(item.severity)} · ${escape(item.status.replaceAll("_", " "))} · ${escape(item.ref)}</p>${item.context === null ? "" : `<p class="context">${escape(item.context)}</p>`}<p>${source && available.has(item.ref) ? `<a href="${escape(href)}">Open source evidence</a>` : "Source evidence unavailable"}</p></article>`;
    })
    .join("");
  const limitations = [
    ...facts.selection_notes,
    ...(narrative?.limitations.map((item) => item.text) ?? [])
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(doc.name)} · DebugBundle</title><style>${css}</style></head><body><a class="skip" href="#main">Skip to report</a><main id="main"><header><p class="meta">DebugBundle · ${escape(facts.period.kind)} report · ${escape(facts.privacy_mode)} evidence mode</p><h1>${escape(doc.name)}</h1><p data-period-start="${escape(facts.period.starts_at)}" data-period-end="${escape(facts.period.ends_at)}">${escape(period)}</p><p class="meta">Previous: ${escape(reportPeriodLabel(facts.previous_period))} · Data cutoff: ${escape(reportTimeLabel(facts.cutoff_at))}</p></header><section aria-label="Overview">${overview}</section>${highlights}<section><h2>Focus for the coming ${coming}</h2>${priorities}</section><section><h2>Resolutions and recoveries</h2>${evidence(solved, doc)}</section><section><h2>Period comparison</h2><p class="muted">Period totals can have unequal lengths. Compare daily rates where available; open-issue counts are period-end snapshots. Partial observations are not complete totals, and missing data is unknown.</p>${projects}</section><section><h2>Selected evidence</h2>${sourceDetails || "<p>No source details were selected.</p>"}</section><section><h2>Coverage and limitations</h2>${limitations.length ? `<ul>${limitations.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>` : "<p>Use the per-project coverage and metric notes when interpreting these observations.</p>"}</section><footer>Recorded resolution is a saved workflow action; observed recovery is a successful monitored response. Neither establishes causation. Source links require current access and retained evidence. This report expires ${escape(reportTimeLabel(doc.report.expires_at))}. Version ${doc.version}, template ${doc.template_version}.</footer></main></body></html>`;
}
