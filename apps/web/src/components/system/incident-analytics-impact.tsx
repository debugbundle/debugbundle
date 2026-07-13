import { ArrowRightIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  ApiRequestError,
  createProjectAnalyticsBundle,
  getProjectAnalyticsIncidentImpact,
  type ProjectAnalyticsIncidentImpactResponse
} from "../../lib/api.js";
import { useDelayedVisibility } from "../../lib/use-delayed-visibility.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Notice } from "../ui/notice.js";
import { Skeleton } from "../ui/skeleton.js";

type ImpactState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; impact: ProjectAnalyticsIncidentImpactResponse };

const expectedUnavailableCodes = new Set([
  "analytics_disabled",
  "analytics_metrics_not_available",
  "upgrade_required"
]);

export function IncidentAnalyticsImpact({
  projectId,
  incidentId
}: {
  projectId: string;
  incidentId: string;
}): JSX.Element | null {
  const navigate = useNavigate();
  const [state, setState] = useState<ImpactState>({ status: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const generatingRef = useRef(false);
  const showLoading = useDelayedVisibility(state.status === "loading");

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    setGenerationError(null);

    void getProjectAnalyticsIncidentImpact(projectId, incidentId)
      .then((impact) => {
        if (active) setState({ status: "ready", impact });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiRequestError && expectedUnavailableCodes.has(error.code)) {
          setState({ status: "unavailable" });
          return;
        }
        setState({ status: "error" });
      });

    return () => {
      active = false;
    };
  }, [incidentId, loadAttempt, projectId]);

  const generateBundle = useCallback(async (): Promise<void> => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setIsGenerating(true);
    setGenerationError(null);

    try {
      const result = await createProjectAnalyticsBundle(projectId, {
        analysisKind: "incident_impact",
        incidentId
      });
      const pendingGenerationId =
        "status" in result.bundle && result.bundle.status === "pending"
          ? result.bundle.bundle_generation_id
          : null;
      const generationId = result.generationId ?? pendingGenerationId;

      if (generationId !== null) {
        void navigate(`/projects/${projectId}/analytics/bundles/${generationId}`);
        return;
      }

      if ("status" in result.bundle && result.bundle.status === "failed") {
        setGenerationError(formatGenerationError(result.bundle.reason));
        return;
      }

      setLoadAttempt((attempt) => attempt + 1);
    } catch (error) {
      setGenerationError(formatGenerationError(error));
    } finally {
      generatingRef.current = false;
      setIsGenerating(false);
    }
  }, [incidentId, navigate, projectId]);

  if (state.status === "unavailable") return null;

  if (state.status === "loading") {
    return showLoading ? <ImpactLoading /> : null;
  }

  if (state.status === "error") {
    return (
      <section
        aria-labelledby="analytics-impact-heading"
        className="flex flex-col gap-3 border-y py-5"
      >
        <h3 id="analytics-impact-heading" className="text-base font-medium">
          Analytics impact
        </h3>
        <Notice title="Could not load analytics impact" tone="destructive">
          Incident debugging remains available. Retry the analytics correlation read separately.
        </Notice>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Retry analytics impact"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            <RefreshCwIcon aria-hidden="true" />
            Retry
          </Button>
        </div>
      </section>
    );
  }

  const { impact } = state;

  return (
    <section
      aria-labelledby="analytics-impact-heading"
      className="flex flex-col gap-5 border-y py-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h3 id="analytics-impact-heading" className="text-base font-medium">
            Analytics impact
          </h3>
          <p className="text-sm text-muted-foreground">
            Correlation-backed product usage affected during this incident window.
          </p>
        </div>
        <BundleAction
          projectId={projectId}
          bundle={impact.analytics_bundle}
          isGenerating={isGenerating}
          onGenerate={() => void generateBundle()}
        />
      </div>

      {generationError === null ? null : (
        <Notice title="Could not generate analytics bundle" tone="destructive">
          {generationError}
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ImpactValue label="Affected sessions" value={String(impact.affected_sessions)} />
        <ImpactValue
          label="Conversion delta"
          value={formatConversionDelta(impact.conversion_delta)}
        />
        <ImpactValue
          label="Analysis window"
          value={`${formatDate(impact.window.from)} to ${formatDate(impact.window.to)}`}
        />
      </div>

      {impact.affected_sessions === 0 ? (
        <p className="text-sm text-muted-foreground">
          No analytics-linked sessions were found for this incident window.
        </p>
      ) : (
        <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
          <ImpactList
            title="Affected routes"
            keyLabel="Route"
            items={impact.affected_routes.map((item) => ({
              key: item.route_key,
              count: item.affected_sessions
            }))}
          />
          <ImpactList
            title="Affected funnels"
            keyLabel="Funnel"
            items={impact.affected_funnels.map((item) => ({
              key: item.funnel_key,
              count: item.affected_sessions
            }))}
          />
          <ImpactList
            title="Top device types"
            keyLabel="Device"
            items={impact.top_device_types.map((item) => ({
              key: item.value,
              count: item.affected_sessions
            }))}
          />
          <ImpactList
            title="Top browsers"
            keyLabel="Browser"
            items={impact.top_browsers.map((item) => ({
              key: item.value,
              count: item.affected_sessions
            }))}
          />
        </div>
      )}

      {impact.journey_patterns.length === 0 ? null : (
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-medium">Linked journey patterns</h4>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Transition</th>
                  <th className="px-3 py-2 text-right font-medium">Affected sessions</th>
                  <th className="px-3 py-2 text-right font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {impact.journey_patterns.map((pattern, patternIndex) => (
                  <tr key={`${pattern.from_route_key}:${pattern.to_route_key}:${patternIndex}`}>
                    <td className="px-3 py-2 font-medium">
                      {pattern.from_route_key} to {pattern.to_route_key}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {pattern.affected_sessions}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        {pattern.sample_ids.map((sampleId, sampleIndex) => (
                          <Link
                            key={sampleId}
                            to={`/projects/${projectId}/analytics/journeys/${sampleId}`}
                            className="font-medium hover:underline"
                          >
                            View journey {sampleIndex + 1}
                          </Link>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {impact.analytics_bundle.failure_reason === null ? null : (
        <Notice title="Analytics bundle generation failed" tone="destructive">
          {impact.analytics_bundle.failure_reason}
        </Notice>
      )}
    </section>
  );
}

function BundleAction({
  projectId,
  bundle,
  isGenerating,
  onGenerate
}: {
  projectId: string;
  bundle: ProjectAnalyticsIncidentImpactResponse["analytics_bundle"];
  isGenerating: boolean;
  onGenerate: () => void;
}): JSX.Element {
  if (bundle.generation_id !== null) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={bundle.status === "failed" ? "destructive" : "secondary"}>
          {formatBundleStatus(bundle.status)}
        </Badge>
        <Button asChild variant="outline" size="sm">
          <Link to={`/projects/${projectId}/analytics/bundles/${bundle.generation_id}`}>
            View analytics bundle
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        </Button>
        {bundle.status === "failed" ? (
          <GenerateButton isGenerating={isGenerating} label="Generate again" onClick={onGenerate} />
        ) : null}
      </div>
    );
  }

  return (
    <GenerateButton
      isGenerating={isGenerating}
      label={bundle.status === "failed" ? "Generate again" : "Generate analytics bundle"}
      onClick={onGenerate}
    />
  );
}

function GenerateButton({
  isGenerating,
  label,
  onClick
}: {
  isGenerating: boolean;
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <Button type="button" variant="outline" size="sm" disabled={isGenerating} onClick={onClick}>
      {isGenerating ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : null}
      {isGenerating ? "Generating..." : label}
    </Button>
  );
}

function ImpactValue({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="break-words text-sm font-semibold">{value}</span>
    </div>
  );
}

function ImpactList({
  title,
  keyLabel,
  items
}: {
  title: string;
  keyLabel: string;
  items: Array<{ key: string; count: number }>;
}): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h4 className="text-sm font-medium">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No correlated {keyLabel.toLowerCase()} data.
        </p>
      ) : (
        <dl className="divide-y rounded-lg border">
          {items.map((item) => (
            <div
              key={item.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2 text-sm"
            >
              <dt className="truncate font-medium" title={item.key}>
                {item.key}
              </dt>
              <dd className="tabular-nums text-muted-foreground">{item.count} sessions</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function ImpactLoading(): JSX.Element {
  return (
    <section aria-label="Loading analytics impact" className="flex flex-col gap-4 border-y py-5">
      <Skeleton className="h-5 w-40" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </section>
  );
}

function formatConversionDelta(
  delta: ProjectAnalyticsIncidentImpactResponse["conversion_delta"]
): string {
  if (delta.availability === "unavailable" || delta.value === null) return "Unavailable";
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(delta.value)} pp`;
}

function formatBundleStatus(
  status: ProjectAnalyticsIncidentImpactResponse["analytics_bundle"]["status"]
): string {
  if (status === "not_requested") return "Not requested";
  return `${status[0]!.toUpperCase()}${status.slice(1)}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function formatGenerationError(error: unknown): string {
  const code =
    error instanceof ApiRequestError ? error.code : typeof error === "string" ? error : null;
  if (code === "analytics_quota_exceeded")
    return "The monthly analytics bundle generation allowance is exhausted.";
  if (code === "analytics_disabled") return "Analytics is disabled for this project.";
  if (code === "upgrade_required") return "This plan does not include analytics bundles.";
  if (code === "incident_not_found") return "This incident is no longer accessible.";
  return "The generation request could not be completed.";
}
