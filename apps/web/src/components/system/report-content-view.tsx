import type { ReportContentView as Content } from "../../../../../packages/smart-reports/src/report-content.js";
import {
  formatReportValue,
  reportMetricComparison,
  reportMetricLabels,
  reportEvidenceSections
} from "../../../../../packages/smart-reports/src/report-presentation.js";
import { buildApiUrl } from "../../lib/api-client.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card.js";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
  TableCaption
} from "../ui/table.js";
import { Notice } from "../ui/notice.js";
import { Badge } from "../ui/badge.js";
type Evidence = Content["document"]["report"]["facts"]["evidence"];
function EvidenceList({ items }: { items: Evidence }): JSX.Element {
  return items.length ? (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.ref}>
          <a className="underline underline-offset-4" href={`#ref-${item.ref}`}>
            {item.title}
          </a>{" "}
          <Badge variant="outline">
            {item.severity} · {item.status.replaceAll("_", " ")}
          </Badge>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">
      No selected evidence in this category. Check coverage before interpreting missing
      observations.
    </p>
  );
}
function References({ values }: { values: string[] }): JSX.Element {
  return (
    <span className="text-xs text-muted-foreground">
      {values.map((value, index) => (
        <span key={value}>
          {index ? " · " : " "}
          <a className="underline underline-offset-4" href={`#ref-${value}`}>
            {value}
          </a>
        </span>
      ))}
    </span>
  );
}
/** React escapes all source/model prose. Links use server identities, never prose URLs. */
export function ReportContentView({ view }: { view: Content }): JSX.Element {
  const doc = view.document,
    { facts } = doc.report,
    { narrative } = doc,
    { solved, urgent, coming } = reportEvidenceSections(doc);
  return (
    <article className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold">{doc.name}</h2>
        <p>
          {facts.period.starts_at.slice(0, 10)} to {facts.period.ends_at.slice(0, 10)} UTC (end
          exclusive)
        </p>
        <p className="text-sm text-muted-foreground">
          Previous: {facts.previous_period.starts_at.slice(0, 10)} to{" "}
          {facts.previous_period.ends_at.slice(0, 10)} · Data cutoff: {facts.cutoff_at}
        </p>
        <Badge variant="outline">{facts.privacy_mode} evidence mode</Badge>
      </header>
      {narrative ? (
        <section aria-label="Overview">
          <p>
            {narrative.overview.text}
            <References values={narrative.overview.evidence_refs} />
          </p>
          {narrative.highlights.length ? (
            <ul className="mt-4 flex flex-col gap-3">
              {narrative.highlights.map((item, index) => (
                <li key={index}>
                  <Badge variant="outline">{item.kind.replaceAll("_", " ")}</Badge> {item.text}
                  <References values={item.evidence_refs} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : (
        <Notice title="Factual report">
          AI analysis is unavailable ({doc.analysis.reason?.replaceAll("_", " ")}). The recorded
          facts below remain available.
        </Notice>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Recorded resolutions</CardTitle>
          <CardDescription>
            Saved workflow resolutions and observed health recoveries are different signals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EvidenceList items={solved} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Focus for the coming {coming}</CardTitle>
          <CardDescription>
            Prioritise outstanding high and critical issues using the retained evidence.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <EvidenceList items={urgent} />
          {narrative?.priorities.map((item, index) => (
            <section key={index}>
              <h3 className="font-medium">{item.title}</h3>
              <p>{item.action}</p>
              <p className="text-sm text-muted-foreground">
                {item.rationale}
                <References values={item.evidence_refs} />
              </p>
            </section>
          ))}
        </CardContent>
      </Card>
      <section className="flex flex-col gap-4" aria-label="Period comparison">
        <h2 className="text-xl font-semibold">Period comparison</h2>
        <p className="text-sm text-muted-foreground">
          Compare daily rates for unequal periods. Open issue counts are snapshots. Partial
          observations are not complete totals; missing data is unknown.
        </p>
        {facts.projects.map((project) => (
          <Card key={project.ref}>
            <CardHeader>
              <CardTitle>{project.name}</CardTitle>
              <CardDescription id={`ref-${project.coverage_ref}`}>
                Lifecycle: {project.coverage.lifecycle} · Health: {project.coverage.availability} ·
                Analytics: {project.coverage.analytics}
                {project.notes.map((note, index) => (
                  <span className="block" key={index}>
                    {note}
                  </span>
                ))}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableCaption>{project.name} — report period and previous period</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>Previous</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Daily rate, current / previous</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {facts.metrics
                    .filter((item) => item.project_ref === project.ref)
                    .map((item) => {
                      const comparison = reportMetricComparison(item);
                      return (
                        <TableRow id={`ref-${item.ref}`} key={item.ref}>
                          <TableCell className="whitespace-normal font-medium">
                            {reportMetricLabels[item.key]}
                            {item.notes.map((note, index) => (
                              <span className="block text-xs text-muted-foreground" key={index}>
                                {note}
                              </span>
                            ))}
                          </TableCell>
                          <TableCell>
                            {formatReportValue(item.current, item.current_complete)}
                          </TableCell>
                          <TableCell>
                            {formatReportValue(item.previous, item.previous_complete)}
                          </TableCell>
                          <TableCell>{comparison.change}</TableCell>
                          <TableCell>{comparison.daily}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="flex flex-col gap-4" aria-label="Selected evidence">
        <h2 className="text-xl font-semibold">Selected evidence</h2>
        {facts.evidence.map((item) => {
          const source = doc.report.sources.find((source) => source.ref === item.ref);
          return (
            <Card id={`ref-${item.ref}`} key={item.ref}>
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>
                  {item.type} · {item.severity} · {item.status.replaceAll("_", " ")} · {item.ref}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {item.context ? (
                  <p className="whitespace-pre-wrap break-words">{item.context}</p>
                ) : null}
                {source && view.available_source_refs.includes(item.ref) ? (
                  <a
                    className="text-sm underline underline-offset-4"
                    href={buildApiUrl(
                      `/v1/organizations/${doc.report.organization_id}/reports/${doc.run_id}/sources/${item.ref}`
                    )}
                  >
                    Open source evidence
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">Source evidence unavailable</p>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!facts.evidence.length ? (
          <p className="text-sm text-muted-foreground">No source details were selected.</p>
        ) : null}
      </section>
      <section className="flex flex-col gap-3" aria-label="Coverage and limitations">
        <h2 className="text-xl font-semibold">Coverage and limitations</h2>
        <ul className="flex flex-col gap-2">
          {[
            ...facts.selection_notes,
            ...(narrative?.limitations.map((item) => item.text) ?? [])
          ].map((text, index) => (
            <li key={index}>{text}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Recorded resolution is a saved workflow action; observed recovery is a successful
          monitored response. Neither establishes causation. Source links require current access and
          retained evidence. This report expires {doc.report.expires_at}.
        </p>
      </section>
    </article>
  );
}
