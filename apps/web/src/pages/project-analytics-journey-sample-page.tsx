import { ArrowLeftIcon, WaypointsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useOutletContext, useParams } from "react-router-dom";

import type { ProjectContext } from "../components/system/project-layout.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "../components/ui/empty.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
import {
  getProjectAnalyticsJourneySample,
  type ProjectAnalyticsJourneySampleResponse
} from "../lib/api.js";

interface JourneyTimelineEntry {
  kind: string;
  occurredAt: string | null;
  route: string | null;
  previousRoute: string | null;
  signal: string | null;
  deployId: string | null;
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
});

const SAFE_DIMENSIONS = [
  ["device_type", "Device"],
  ["browser_family", "Browser"],
  ["os_family", "Operating system"],
  ["language", "Language"],
  ["locale", "Locale"],
  ["auth_state", "Authentication"],
  ["viewport_bucket", "Viewport"],
  ["referrer_domain", "Referrer"],
  ["region_code", "Region"]
] as const;

export function ProjectAnalyticsJourneySamplePage(): JSX.Element {
  const { projectId } = useOutletContext<ProjectContext>();
  const { sampleId } = useParams<{ sampleId: string }>();
  const [response, setResponse] = useState<ProjectAnalyticsJourneySampleResponse | null>(null);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (sampleId === undefined) return;

    let active = true;
    setResponse(null);
    setHasError(false);

    void getProjectAnalyticsJourneySample(projectId, sampleId)
      .then((result) => {
        if (active) setResponse(result);
      })
      .catch(() => {
        if (active) setHasError(true);
      });

    return () => {
      active = false;
    };
  }, [attempt, projectId, sampleId]);

  if (sampleId === undefined) {
    return <Navigate replace to={`/projects/${projectId}/analytics/journeys`} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to={`/projects/${projectId}/analytics/journeys`}>
            <ArrowLeftIcon data-icon="inline-start" />
            Back to journeys
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">Journey sample</h2>
        <p className="text-sm text-muted-foreground">
          A retained, privacy-safe sequence of route and product signals.
        </p>
      </div>

      {response === null && !hasError ? <Skeleton className="h-72 w-full" /> : null}

      {hasError ? (
        <Notice title="Could not load journey sample" tone="destructive">
          <div className="flex flex-col items-start gap-2">
            <p>The retained journey evidence is temporarily unavailable or has expired.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAttempt((current) => current + 1)}
            >
              Retry journey sample
            </Button>
          </div>
        </Notice>
      ) : null}

      {response === null ? null : <JourneySampleContent response={response} />}
    </div>
  );
}

function JourneySampleContent({
  response
}: {
  response: ProjectAnalyticsJourneySampleResponse;
}): JSX.Element {
  const timeline = normalizeJourneyTimeline(response.journey);
  const dimensions = readSafeDimensions(response.sample.dimensions_summary);

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="journey-context-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 id="journey-context-heading" className="text-base font-medium">
            Sample context
          </h3>
          <p className="text-sm text-muted-foreground">
            Retention and normalized context for this sample.
          </p>
        </div>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetadataValue label="Service" value={response.sample.service ?? "All services"} />
          <MetadataValue
            label="Environment"
            value={response.sample.environment ?? "All environments"}
          />
          <MetadataValue label="First seen" value={formatDateTime(response.sample.first_seen_at)} />
          <MetadataValue label="Last seen" value={formatDateTime(response.sample.last_seen_at)} />
          <MetadataValue label="Expires" value={formatDateTime(response.sample.expires_at)} />
          {dimensions.map((dimension) => (
            <MetadataValue key={dimension.label} label={dimension.label} value={dimension.value} />
          ))}
        </dl>
        {response.sample.analysis_tags.length === 0 ? null : (
          <div className="flex flex-wrap gap-1.5" aria-label="Analysis tags">
            {response.sample.analysis_tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="journey-timeline-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 id="journey-timeline-heading" className="text-base font-medium">
            Structured timeline
          </h3>
          <p className="text-sm text-muted-foreground">
            Normalized events only. Raw interaction text and internal identifiers are excluded.
          </p>
        </div>
        {timeline.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WaypointsIcon />
              </EmptyMedia>
              <EmptyTitle>No retained timeline events</EmptyTitle>
              <EmptyDescription>This sample has no displayable structured events.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ol aria-label="Structured journey timeline" className="divide-y border-y">
            {timeline.map((entry, index) => (
              <li key={`${entry.occurredAt ?? "event"}:${index}`} className="grid gap-3 py-4 sm:grid-cols-[9rem_1fr]">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{formatEventKind(entry.kind)}</span>
                  {entry.occurredAt === null ? null : (
                    <time className="text-xs text-muted-foreground" dateTime={entry.occurredAt}>
                      {formatDateTime(entry.occurredAt)}
                    </time>
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  {entry.route === null ? null : (
                    <span className="break-all font-mono text-sm">{entry.route}</span>
                  )}
                  {entry.previousRoute === null || entry.route === null ? null : (
                    <span className="text-xs text-muted-foreground">
                      Transition: {entry.previousRoute} to {entry.route}
                    </span>
                  )}
                  {entry.signal === null ? null : <span className="text-sm">{entry.signal}</span>}
                  {entry.deployId === null ? null : (
                    <span className="text-xs text-muted-foreground">Deploy {entry.deployId}</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function MetadataValue({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm">{value}</dd>
    </div>
  );
}

function normalizeJourneyTimeline(journey: Record<string, unknown>): JourneyTimelineEntry[] {
  return readTimelineValues(journey).flatMap((value) => {
    if (!isRecord(value)) return [];

    return [
      {
        kind: readString(value["kind"]) ?? "event",
        occurredAt: readString(value["occurred_at"]) ?? readString(value["occurredAt"]),
        route: readRoute(value["route"]),
        previousRoute: readRoute(value["previous_route"] ?? value["previousRoute"]),
        signal: readSignal(value["signal"]),
        deployId: readString(value["deploy_id"]) ?? readString(value["deployId"])
      }
    ];
  });
}

function readTimelineValues(journey: Record<string, unknown>): unknown[] {
  if (Array.isArray(journey["events"])) return journey["events"];
  if (Array.isArray(journey["timeline"])) return journey["timeline"];
  if (!isRecord(journey["timeline"])) return [];
  if (Array.isArray(journey["timeline"]["events"])) return journey["timeline"]["events"];

  return Object.entries(journey["timeline"])
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

function readRoute(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (!isRecord(value)) return null;
  return readString(value["normalized_path"]) ?? readString(value["path"]);
}

function readSignal(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const funnel = readString(value["funnel_key"]) ?? readString(value["funnelKey"]);
  const step = readString(value["step_key"]) ?? readString(value["stepKey"]);
  if (funnel !== null && step !== null) return `${funnel} / ${step}`;

  return (
    readString(value["action_key"]) ??
    readString(value["actionKey"]) ??
    readString(value["conversion_key"]) ??
    readString(value["conversionKey"]) ??
    readString(value["marker_key"]) ??
    readString(value["markerKey"])
  );
}

function readSafeDimensions(
  dimensions: Record<string, unknown>
): Array<{ label: string; value: string }> {
  return SAFE_DIMENSIONS.flatMap(([key, label]) => {
    const value = readString(dimensions[key]);
    return value === null ? [] : [{ label, value }];
  });
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatEventKind(value: string): string {
  return value
    .split(/[_-]/u)
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : DATE_TIME_FORMAT.format(date);
}
