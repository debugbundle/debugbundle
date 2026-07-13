import { ArrowLeftIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useOutletContext, useParams } from "react-router-dom";

import {
  formatAnalyticsDate,
  formatAnalyticsLabel
} from "../components/system/analytics-bundles-table.js";
import type { ProjectContext } from "../components/system/project-layout.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { getProjectAnalyticsBundle, type ProjectAnalyticsBundleResponse } from "../lib/api.js";

const INTEGER_FORMAT = new Intl.NumberFormat();
const PERCENT_FORMAT = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1
});

export function ProjectAnalyticsBundleDetailPage(): JSX.Element {
  const { projectId } = useOutletContext<ProjectContext>();
  const { generationId } = useParams<{ generationId: string }>();
  const [response, setResponse] = useState<ProjectAnalyticsBundleResponse | null>(null);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (generationId === undefined) return;
    let active = true;
    setResponse(null);
    setHasError(false);

    void getProjectAnalyticsBundle(projectId, generationId)
      .then((value) => {
        if (active) setResponse(value);
      })
      .catch(() => {
        if (active) setHasError(true);
      });

    return () => {
      active = false;
    };
  }, [attempt, generationId, projectId]);

  if (generationId === undefined) {
    return <Navigate replace to={`/projects/${projectId}/analytics/bundles`} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to={`/projects/${projectId}/analytics/bundles`}>
            <ArrowLeftIcon data-icon="inline-start" />
            Back to analytics bundles
          </Link>
        </Button>
      </div>

      {response === null && !hasError ? <DetailSkeleton /> : null}
      {hasError ? (
        <Notice title="Could not load analytics bundle" tone="destructive">
          <div className="flex flex-col items-start gap-2">
            <p>The artifact is temporarily unavailable or no longer accessible.</p>
            <RefreshButton onRefresh={() => setAttempt((current) => current + 1)} />
          </div>
        </Notice>
      ) : null}
      {response === null ? null : "status" in response ? (
        <GenerationState
          response={response}
          onRefresh={() => setAttempt((current) => current + 1)}
        />
      ) : (
        <ReadyBundle projectId={projectId} bundle={response} />
      )}
    </div>
  );
}

function GenerationState({
  response,
  onRefresh
}: {
  response: Extract<ProjectAnalyticsBundleResponse, { status: string }>;
  onRefresh: () => void;
}): JSX.Element {
  if (response.status === "failed") {
    return (
      <Notice title="Generation failed" tone="destructive">
        <div className="flex flex-col items-start gap-3">
          <p>{formatAnalyticsLabel(response.reason)}</p>
          <RefreshButton onRefresh={onRefresh} />
        </div>
      </Notice>
    );
  }
  return (
    <Notice title="Processing">
      <div className="flex flex-col items-start gap-3">
        <p>The deterministic artifact is still being generated.</p>
        <RefreshButton onRefresh={onRefresh} />
      </div>
    </Notice>
  );
}

function RefreshButton({ onRefresh }: { onRefresh: () => void }): JSX.Element {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
      <RefreshCwIcon data-icon="inline-start" />
      Refresh
    </Button>
  );
}

function ReadyBundle({
  projectId,
  bundle
}: {
  projectId: string;
  bundle: Exclude<ProjectAnalyticsBundleResponse, { status: string }>;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex max-w-3xl flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge>Ready</Badge>
          <Badge variant="secondary">{formatAnalyticsLabel(bundle.analysis_kind)}</Badge>
          <Badge variant="outline">
            {formatAnalyticsLabel(bundle.summary.confidence)} confidence
          </Badge>
          <Badge variant={bundle.summary.severity === "high" ? "warning" : "outline"}>
            {formatAnalyticsLabel(bundle.summary.severity)} severity
          </Badge>
        </div>
        <h2 className="text-xl font-semibold">{bundle.summary.title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {bundle.summary.description}
        </p>
      </header>

      <section aria-labelledby="bundle-context-heading" className="flex flex-col gap-4">
        <h3 id="bundle-context-heading" className="text-base font-medium">
          Analysis context
        </h3>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailValue label="Service" value={bundle.project.service ?? "All services"} />
          <DetailValue
            label="Environment"
            value={bundle.project.environment ?? "All environments"}
          />
          <DetailValue label="From" value={formatAnalyticsDate(bundle.analysis_window.from)} />
          <DetailValue label="To" value={formatAnalyticsDate(bundle.analysis_window.to)} />
          <DetailValue
            label="Granularity"
            value={formatAnalyticsLabel(bundle.analysis_window.granularity)}
          />
        </dl>
      </section>

      <section aria-labelledby="bundle-metrics-heading" className="flex flex-col gap-4">
        <h3 id="bundle-metrics-heading" className="text-base font-medium">
          Metrics
        </h3>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailValue
            label="Sessions analyzed"
            value={INTEGER_FORMAT.format(bundle.metrics.sessions_analyzed)}
          />
          <DetailValue
            label="Affected sessions"
            value={
              bundle.metrics.affected_sessions === null
                ? "Not applicable"
                : INTEGER_FORMAT.format(bundle.metrics.affected_sessions)
            }
          />
          {readSafeMetrics(bundle.metrics.baseline, "Baseline").map((item) => (
            <DetailValue key={item.label} {...item} />
          ))}
          {readSafeMetrics(bundle.metrics.current, "Current").map((item) => (
            <DetailValue key={item.label} {...item} />
          ))}
        </dl>
      </section>

      <SegmentsSection segments={bundle.segments} />
      <PatternsSection patterns={bundle.journey_patterns} />
      <JourneysSection journeys={bundle.representative_journeys} />
      <RelatedSection
        projectId={projectId}
        incidents={bundle.linked_incidents}
        deploys={bundle.linked_deploys}
      />
      <RecommendationsSection recommendations={bundle.recommendations} />
      <section aria-labelledby="bundle-redaction-heading" className="flex flex-col gap-3">
        <h3 id="bundle-redaction-heading" className="text-base font-medium">
          Privacy controls
        </h3>
        <div className="flex flex-wrap gap-2">
          {bundle.redaction.rules_applied.map((rule) => (
            <Badge key={rule} variant="outline">
              {rule}
            </Badge>
          ))}
        </div>
        {bundle.redaction.omitted_fields.length === 0 ? null : (
          <p className="text-sm text-muted-foreground">
            Omitted fields: {bundle.redaction.omitted_fields.map(formatAnalyticsLabel).join(", ")}
          </p>
        )}
      </section>
    </div>
  );
}

interface DetailItem {
  label: string;
  value: string;
}

const SAFE_METRIC_KEYS = new Set([
  "conversion_rate",
  "pageviews",
  "active_visitors",
  "new_visitors",
  "returning_visitors",
  "exits",
  "conversions",
  "affected_sessions",
  "unique_sessions",
  "sessions_entered",
  "sessions_completed",
  "dropoffs",
  "transition_count",
  "transition_share",
  "linked_incident_sessions",
  "event_count"
]);

function readSafeMetrics(record: Record<string, unknown>, prefix: string): DetailItem[] {
  return Object.entries(record).flatMap(([key, value]) => {
    if (!SAFE_METRIC_KEYS.has(key) || typeof value !== "number" || !Number.isFinite(value))
      return [];
    const formatted =
      key.endsWith("_rate") || key.endsWith("_share")
        ? PERCENT_FORMAT.format(value)
        : INTEGER_FORMAT.format(value);
    return [{ label: `${prefix} ${formatAnalyticsLabel(key)}`, value: formatted }];
  });
}

function SegmentsSection({
  segments
}: {
  segments: Record<string, unknown>[];
}): JSX.Element | null {
  const items = segments.map(readSegment).filter((item): item is SegmentItem => item !== null);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="bundle-segments-heading" className="flex flex-col gap-4">
      <h3 id="bundle-segments-heading" className="text-base font-medium">
        Segments
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <div
            key={`${item.dimension}-${item.value}-${index}`}
            className="border-l-2 border-border pl-3"
          >
            <p className="text-sm font-medium">{item.value}</p>
            <p className="text-xs text-muted-foreground">{formatAnalyticsLabel(item.dimension)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.metrics.join(" · ")}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

interface SegmentItem {
  dimension: string;
  value: string;
  metrics: string[];
}
function readSegment(record: Record<string, unknown>): SegmentItem | null {
  const dimension = readString(record["dimension"]);
  const value = readString(record["value"]);
  if (dimension === null || value === null) return null;
  const metrics = ["sessions", "pageviews", "affected_sessions"].flatMap((key) => {
    const number = readNumber(record[key]);
    return number === null
      ? []
      : [`${INTEGER_FORMAT.format(number)} ${formatAnalyticsLabel(key).toLowerCase()}`];
  });
  return { dimension, value, metrics };
}

function PatternsSection({
  patterns
}: {
  patterns: Record<string, unknown>[];
}): JSX.Element | null {
  const items = patterns.map(readPattern).filter((item): item is PatternItem => item !== null);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="bundle-patterns-heading" className="flex flex-col gap-4">
      <h3 id="bundle-patterns-heading" className="text-base font-medium">
        Journey patterns
      </h3>
      <div className="flex flex-col divide-y divide-border border-y">
        {items.map((item, index) => (
          <div
            key={`${item.from}-${item.to}-${index}`}
            className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <p className="font-mono text-sm">
              {item.from} → {item.to}
            </p>
            <p className="flex gap-2 text-sm text-muted-foreground">
              {item.count === null ? null : (
                <span>{INTEGER_FORMAT.format(item.count)} transitions</span>
              )}
              {item.share === null ? null : <span>{PERCENT_FORMAT.format(item.share)}</span>}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

interface PatternItem {
  from: string;
  to: string;
  count: number | null;
  share: number | null;
}
function readPattern(record: Record<string, unknown>): PatternItem | null {
  const from = readString(record["from_route_key"]);
  const to = readString(record["to_route_key"]);
  if (from === null || to === null) return null;
  return {
    from,
    to,
    count: readNumber(record["transition_count"]),
    share: readNumber(record["transition_share"])
  };
}

function JourneysSection({
  journeys
}: {
  journeys: Record<string, unknown>[];
}): JSX.Element | null {
  const items = journeys
    .map(readJourney)
    .filter((item): item is JourneyItem => item !== null)
    .sort((left, right) => left.rank - right.rank);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="bundle-journeys-heading" className="flex flex-col gap-4">
      <h3 id="bundle-journeys-heading" className="text-base font-medium">
        Representative journeys
      </h3>
      <ol
        aria-label="Representative journeys"
        className="flex flex-col divide-y divide-border border-y"
      >
        {items.map((journey) => (
          <li key={journey.rank} className="flex flex-col gap-3 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Rank {journey.rank}</Badge>
              {journey.basis === null ? null : (
                <span className="text-sm text-muted-foreground">
                  Selected by {formatAnalyticsLabel(journey.basis).toLowerCase()}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {journey.events.map((event, index) => (
                <div
                  key={index}
                  className="grid gap-1 border-l-2 border-border pl-3 sm:grid-cols-[10rem_1fr]"
                >
                  <span className="text-xs text-muted-foreground">
                    {event.occurredAt === null
                      ? `Event ${index + 1}`
                      : formatAnalyticsDate(event.occurredAt)}
                  </span>
                  <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-sm">
                    <span>{formatAnalyticsLabel(event.kind)}</span>
                    {event.route === null ? null : (
                      <span className="break-all font-mono">{event.route}</span>
                    )}
                    {event.action === null ? null : (
                      <span>{formatAnalyticsLabel(event.action)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface JourneyItem {
  rank: number;
  basis: string | null;
  events: JourneyEvent[];
}
interface JourneyEvent {
  occurredAt: string | null;
  kind: string;
  route: string | null;
  action: string | null;
}
function readJourney(record: Record<string, unknown>): JourneyItem | null {
  const rank = readNumber(record["selection_rank"]);
  if (rank === null) return null;
  const timeline = readRecord(record["timeline"]);
  const events =
    timeline === null
      ? []
      : Object.keys(timeline)
          .sort()
          .flatMap((key) => {
            const event = readRecord(timeline[key]);
            const kind = event === null ? null : readString(event["kind"]);
            if (event === null || kind === null) return [];
            return [
              {
                occurredAt: readString(event["occurred_at"]),
                kind,
                route: readString(event["route"]),
                action:
                  readString(event["action_key"]) ??
                  readString(event["funnel_key"]) ??
                  readString(event["marker_key"])
              }
            ];
          });
  return { rank, basis: readString(record["selection_basis"]), events };
}

function RelatedSection({
  projectId,
  incidents,
  deploys
}: {
  projectId: string;
  incidents: Record<string, unknown>[];
  deploys: Record<string, unknown>[];
}): JSX.Element | null {
  const incidentItems = incidents.flatMap((record, index) => {
    const id = readString(record["incident_id"]);
    return id === null
      ? []
      : [{ id, title: readString(record["title"]) ?? `Related incident ${index + 1}` }];
  });
  const deployItems = deploys.flatMap((record) => {
    const id = readString(record["deploy_id"]);
    return id === null ? [] : [id];
  });
  if (incidentItems.length === 0 && deployItems.length === 0) return null;
  return (
    <section aria-labelledby="bundle-related-heading" className="flex flex-col gap-4">
      <h3 id="bundle-related-heading" className="text-base font-medium">
        Related context
      </h3>
      <div className="flex flex-wrap gap-2">
        {incidentItems.map((incident) => (
          <Button key={incident.id} asChild variant="outline" size="sm">
            <Link to={`/projects/${projectId}/incidents/${incident.id}`}>{incident.title}</Link>
          </Button>
        ))}
        {deployItems.map((deploy) => (
          <Badge key={deploy} variant="outline" className="font-mono">
            {deploy}
          </Badge>
        ))}
      </div>
    </section>
  );
}

function RecommendationsSection({
  recommendations
}: {
  recommendations: Record<string, unknown>[];
}): JSX.Element | null {
  const items = recommendations
    .flatMap((record) => {
      const priority = readNumber(record["priority"]);
      const action = readString(record["action"]);
      const rationale = readString(record["rationale"]);
      return priority === null || action === null || rationale === null
        ? []
        : [{ priority, action, rationale }];
    })
    .sort((left, right) => left.priority - right.priority);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="bundle-recommendations-heading" className="flex flex-col gap-4">
      <h3 id="bundle-recommendations-heading" className="text-base font-medium">
        Recommendations
      </h3>
      <ol className="flex flex-col gap-4">
        {items.map((item) => (
          <li key={`${item.priority}-${item.action}`} className="border-l-2 border-border pl-3">
            <p className="font-medium">{formatAnalyticsLabel(item.action)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.rationale}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DetailValue({ label, value }: DetailItem): JSX.Element {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
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

function DetailSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-4" aria-label="Loading analytics bundle">
      <Skeleton className="h-8 w-80 max-w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
