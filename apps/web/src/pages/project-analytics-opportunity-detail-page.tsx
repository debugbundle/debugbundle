import { ArrowLeftIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useOutletContext, useParams } from "react-router-dom";

import {
  analyticsBundleStateVariant,
  formatAnalyticsBundleState,
  formatAnalyticsDate,
  formatAnalyticsLabel
} from "../components/system/analytics-opportunities-table.js";
import type { ProjectContext } from "../components/system/project-layout.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
import {
  getProjectAnalyticsOpportunity,
  type AnalyticsOpportunityRecord
} from "../lib/api.js";

const INTEGER_FORMAT = new Intl.NumberFormat();
const PERCENT_FORMAT = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1
});

interface EvidenceItem {
  label: string;
  value: string;
  mono?: boolean;
}

export function ProjectAnalyticsOpportunityDetailPage(): JSX.Element {
  const { projectId } = useOutletContext<ProjectContext>();
  const { opportunityId } = useParams<{ opportunityId: string }>();
  const [opportunity, setOpportunity] = useState<AnalyticsOpportunityRecord | null>(null);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (opportunityId === undefined) return;

    let active = true;
    setOpportunity(null);
    setHasError(false);

    void getProjectAnalyticsOpportunity(projectId, opportunityId)
      .then((response) => {
        if (active) setOpportunity(response.opportunity);
      })
      .catch(() => {
        if (active) setHasError(true);
      });

    return () => {
      active = false;
    };
  }, [attempt, opportunityId, projectId]);

  if (opportunityId === undefined) {
    return <Navigate replace to={`/projects/${projectId}/analytics/opportunities`} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to={`/projects/${projectId}/analytics/opportunities`}>
            <ArrowLeftIcon data-icon="inline-start" />
            Back to opportunities
          </Link>
        </Button>
      </div>

      {opportunity === null && !hasError ? <OpportunityDetailSkeleton /> : null}

      {hasError ? (
        <Notice title="Could not load analytics opportunity" tone="destructive">
          <div className="flex flex-col items-start gap-2">
            <p>The opportunity is temporarily unavailable or no longer accessible.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAttempt((current) => current + 1)}
            >
              Retry analytics opportunity
            </Button>
          </div>
        </Notice>
      ) : null}

      {opportunity === null ? null : (
        <OpportunityDetailContent projectId={projectId} opportunity={opportunity} />
      )}
    </div>
  );
}

function OpportunityDetailContent({
  projectId,
  opportunity
}: {
  projectId: string;
  opportunity: AnalyticsOpportunityRecord;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={opportunity.severity === "high" ? "warning" : "outline"}>
            {formatAnalyticsLabel(opportunity.severity)} severity
          </Badge>
          <Badge variant="outline">{formatAnalyticsLabel(opportunity.status)}</Badge>
          <Badge variant="secondary">{formatAnalyticsLabel(opportunity.kind)}</Badge>
        </div>
        <div className="flex max-w-3xl flex-col gap-2">
          <h2 className="text-xl font-semibold">{opportunity.title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{opportunity.summary}</p>
        </div>
      </header>

      <section aria-labelledby="opportunity-context-heading" className="flex flex-col gap-4">
        <h3 id="opportunity-context-heading" className="text-base font-medium">
          Opportunity context
        </h3>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailValue label="Confidence" value={PERCENT_FORMAT.format(opportunity.confidence)} />
          <DetailValue label="Service" value={opportunity.service ?? "All services"} />
          <DetailValue
            label="Environment"
            value={opportunity.environment ?? "All environments"}
          />
          <DetailValue label="First detected" value={formatAnalyticsDate(opportunity.first_detected_at)} />
          <DetailValue label="Last detected" value={formatAnalyticsDate(opportunity.last_detected_at)} />
          {opportunity.resolved_at === null ? null : (
            <DetailValue label="Resolved" value={formatAnalyticsDate(opportunity.resolved_at)} />
          )}
          {opportunity.snoozed_until === null ? null : (
            <DetailValue label="Snoozed until" value={formatAnalyticsDate(opportunity.snoozed_until)} />
          )}
        </dl>
      </section>

      <AggregateEvidence evidence={opportunity.evidence} />

      <section aria-labelledby="opportunity-related-heading" className="flex flex-col gap-4">
        <h3 id="opportunity-related-heading" className="text-base font-medium">
          Related context
        </h3>
        {opportunity.related_incident_ids.length === 0 &&
        opportunity.related_deploy_ids.length === 0 ? (
          <p className="text-sm text-muted-foreground">No incidents or deploys are linked.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {opportunity.related_incident_ids.length === 0 ? null : (
              <div className="flex flex-wrap gap-2">
                {opportunity.related_incident_ids.map((incidentId, index) => (
                  <Button key={incidentId} asChild variant="outline" size="sm">
                    <Link to={`/projects/${projectId}/incidents/${incidentId}`}>
                      View related incident {index + 1}
                    </Link>
                  </Button>
                ))}
              </div>
            )}
            {opportunity.related_deploy_ids.length === 0 ? null : (
              <div className="flex flex-wrap items-center gap-2" aria-label="Related deploys">
                <span className="text-sm text-muted-foreground">Deploys</span>
                {opportunity.related_deploy_ids.map((deployId) => (
                  <Badge key={deployId} variant="outline" className="font-mono">
                    {deployId}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="opportunity-bundle-heading" className="flex flex-col gap-4">
        <h3 id="opportunity-bundle-heading" className="text-base font-medium">
          AnalyticsBundle
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={analyticsBundleStateVariant(opportunity.bundle_status)}>
            {formatAnalyticsBundleState(opportunity.bundle_status)}
          </Badge>
          {opportunity.bundle_updated_at === null ? null : (
            <span className="text-sm text-muted-foreground">
              Updated {formatAnalyticsDate(opportunity.bundle_updated_at)}
            </span>
          )}
        </div>
        {opportunity.bundle_failure_reason === null ? null : (
          <Notice title="AnalyticsBundle generation failed" tone="destructive">
            {opportunity.bundle_failure_reason}
          </Notice>
        )}
      </section>
    </div>
  );
}

function AggregateEvidence({ evidence }: { evidence: Record<string, unknown> }): JSX.Element {
  const items = readEvidenceItems(evidence);
  const window = readRecord(evidence["analysis_window"]);
  const from = readString(window?.["from"]);
  const to = readString(window?.["to"]);

  return (
    <section aria-label="Aggregate evidence" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-medium">Aggregate evidence</h3>
        <p className="text-sm text-muted-foreground">
          Bounded rollup values used by the deterministic opportunity evaluator.
        </p>
      </div>
      {from === null || to === null ? null : (
        <p className="text-sm text-muted-foreground">
          Analysis window: {formatAnalyticsDate(from)} to {formatAnalyticsDate(to)}
        </p>
      )}
      {items.length === 0 ? (
        <Notice title="Structured evidence unavailable">
          This opportunity kind has no displayable aggregate evidence fields.
        </Notice>
      ) : (
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <DetailValue key={item.label} {...item} />
          ))}
        </dl>
      )}
    </section>
  );
}

function readEvidenceItems(evidence: Record<string, unknown>): EvidenceItem[] {
  const thresholds = readRecord(evidence["thresholds"]);
  const funnelKey = readString(evidence["funnel_key"]);
  const markerKey = readString(evidence["marker_key"]);
  const fromRoute = readString(evidence["from_route_key"]);

  if (funnelKey !== null) {
    return compactEvidenceItems([
      textEvidence("Funnel", funnelKey, true),
      textEvidence("Step", readString(evidence["step_key"]), true),
      integerEvidence("Step order", readNumber(evidence["step_order"])),
      integerEvidence("Sessions entered", readNumber(evidence["sessions_entered"])),
      integerEvidence("Sessions completed", readNumber(evidence["sessions_completed"])),
      integerEvidence("Dropoffs", readNumber(evidence["dropoffs"])),
      percentEvidence("Dropoff rate", readNumber(evidence["dropoff_rate"])),
      integerEvidence("Minimum sessions", readNumber(thresholds?.["min_sessions"])),
      integerEvidence("Minimum dropoffs", readNumber(thresholds?.["min_dropoffs"])),
      percentEvidence("Minimum dropoff rate", readNumber(thresholds?.["min_dropoff_rate"]))
    ]);
  }

  if (markerKey !== null) {
    return compactEvidenceItems([
      textEvidence("Marker", markerKey, true),
      textEvidence("Route", readString(evidence["route_key"]), true),
      integerEvidence("Events", readNumber(evidence["event_count"])),
      integerEvidence("Unique sessions", readNumber(evidence["unique_sessions"])),
      integerEvidence("Minimum events", readNumber(thresholds?.["min_events"])),
      integerEvidence("Minimum unique sessions", readNumber(thresholds?.["min_unique_sessions"]))
    ]);
  }

  if (fromRoute !== null) {
    return compactEvidenceItems([
      textEvidence("From route", fromRoute, true),
      textEvidence("To route", readString(evidence["to_route_key"]), true),
      integerEvidence("Forward transitions", readNumber(evidence["forward_transition_count"])),
      integerEvidence("Reverse transitions", readNumber(evidence["reverse_transition_count"])),
      integerEvidence("Loop transitions", readNumber(evidence["total_loop_transitions"])),
      integerEvidence("Unique sessions", readNumber(evidence["unique_sessions"])),
      integerEvidence(
        "Minimum loop transitions",
        readNumber(thresholds?.["min_loop_transitions"])
      ),
      integerEvidence("Minimum unique sessions", readNumber(thresholds?.["min_unique_sessions"])),
      integerEvidence(
        "Minimum reverse transitions",
        readNumber(thresholds?.["min_reverse_transitions"])
      )
    ]);
  }

  return [];
}

function DetailValue({ label, value, mono = false }: EvidenceItem): JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-words text-sm${mono ? " font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function compactEvidenceItems(items: Array<EvidenceItem | null>): EvidenceItem[] {
  return items.filter((item): item is EvidenceItem => item !== null);
}

function textEvidence(label: string, value: string | null, mono = false): EvidenceItem | null {
  return value === null ? null : { label, value, mono };
}

function integerEvidence(label: string, value: number | null): EvidenceItem | null {
  return value === null ? null : { label, value: INTEGER_FORMAT.format(value) };
}

function percentEvidence(label: string, value: number | null): EvidenceItem | null {
  return value === null ? null : { label, value: PERCENT_FORMAT.format(value) };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function OpportunityDetailSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-4" aria-label="Loading analytics opportunity">
      <Skeleton className="h-7 w-80 max-w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
