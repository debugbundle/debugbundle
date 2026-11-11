import { Link } from "react-router-dom";
import type { ReviewArtifact } from "../../../../../packages/smart-improvements/src/review-contract.js";
import { Notice } from "../ui/notice.js";
import { Badge } from "../ui/badge.js";
/** Shared evidence presentation accepts only the closed saved artifact. Model
 * hypotheses remain labelled suggestions, separate from observed server facts. */
export function ImprovementReviewContent({ bundle }: { bundle: ReviewArtifact }): JSX.Element {
  const sources = new Map(bundle.facts.sources.map((source) => [source.ref, source]));
  const path = (ref: string): string | null => {
    const source = sources.get(ref);
    if (!source?.source_id) return null;
    const root = `/projects/${bundle.facts.project_id}`;
    return source.kind === "health"
      ? `${root}/health`
      : source.kind === "analytics"
        ? `${root}/analytics/opportunities/${source.source_id}`
        : `${root}/${source.kind === "incident" ? "incidents" : "improvements"}/${source.source_id}`;
  };
  return (
    <div className="flex flex-col gap-6">
      <Notice
        title={
          bundle.analysis === "no_data"
            ? "No retained evidence"
            : bundle.analysis === "no_change"
              ? "No new actionable evidence"
              : "Evidence-backed investigation"
        }
      >
        {bundle.analysis === "available"
          ? "Recorded evidence is accompanied by AI investigation suggestions. Hypotheses are unverified."
          : bundle.analysis === "no_data"
            ? "Available evidence does not support an improvement review. Missing observations are unknown."
            : bundle.analysis === "no_change"
              ? "No provider call was needed. Existing unresolved priorities and available observations remain below."
              : "Recorded evidence and deterministic priorities are available. AI guidance is unavailable; no automatic paid retry is made."}
      </Notice>
      {bundle.priorities.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Review priorities">
          <h3 className="font-semibold">Priorities to investigate</h3>
          <ol className="flex list-decimal flex-col gap-3 pl-5">
            {bundle.priorities.map((priority) => {
              const source = sources.get(priority.source_ref)!,
                href = path(priority.source_ref);
              return (
                <li key={priority.source_ref} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {href ? (
                      <Link className="font-medium underline underline-offset-4" to={href}>
                        {source.title}
                      </Link>
                    ) : (
                      <span className="font-medium">{source.title}</span>
                    )}
                    <Badge variant="outline">{source.kind}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{source.observation}</p>
                  {source.count !== null ? (
                    <p className="text-sm">
                      Lifetime observations: {source.count.toLocaleString()}
                    </p>
                  ) : null}
                  <p className="text-sm">{priority.check}</p>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
      {bundle.guidance?.investigations.length ? (
        <section className="flex flex-col gap-3" aria-label="Suggested investigations">
          <h3 className="font-semibold">AI investigation suggestions</h3>
          {bundle.guidance.investigations.map((item, index) => (
            <div key={index} className="flex flex-col gap-2">
              <h4 className="font-medium">{item.title}</h4>
              {item.hypothesis ? (
                <p className="text-sm">
                  <strong>Hypothesis:</strong> {item.hypothesis}
                </p>
              ) : null}
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {item.checks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Evidence:{" "}
                {item.evidence_refs.map((ref) => sources.get(ref)?.title ?? ref).join("; ")}
              </p>
            </div>
          ))}
        </section>
      ) : null}
      <section className="flex flex-col gap-2" aria-label="Review coverage">
        <h3 className="font-semibold">Coverage and limits</h3>
        <p className="text-sm text-muted-foreground">
          Analytics coverage: {bundle.facts.analytics.coverage}. Health coverage:{" "}
          {bundle.facts.health.coverage}. Source links depend on current access and retention.
        </p>
        <p className="text-sm">
          Recorded analytics:{" "}
          {bundle.facts.analytics.sessions === null
            ? "sessions unavailable"
            : `${bundle.facts.analytics.sessions.toLocaleString()} sessions`}
          ;{" "}
          {bundle.facts.analytics.page_views === null
            ? "page views unavailable"
            : `${bundle.facts.analytics.page_views.toLocaleString()} page views`}
          .
          {bundle.facts.health.coverage !== "unavailable"
            ? ` Monitored health: ${bundle.facts.health.successful_checks.toLocaleString()} successful of ${bundle.facts.health.total_checks.toLocaleString()} checks; ${bundle.facts.health.estimated_check_downtime_seconds.toLocaleString()} estimated check downtime seconds.`
            : " Monitored health totals unavailable."}
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {bundle.facts.limitations.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
