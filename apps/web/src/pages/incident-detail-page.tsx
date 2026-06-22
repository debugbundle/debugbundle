import { ArrowLeftIcon, ClipboardCopyIcon, DownloadIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { CalloutCard } from "../components/system/callout-card.js";
import { IncidentCaptureRuleSuggestionsDialog } from "../components/system/incident-capture-rule-suggestions-dialog.js";
import { HighlightedCodeBlock } from "../components/system/highlighted-code-block.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip.js";
import {
  getIncident,
  getIncidentBundle,
  getIncidentReproduction,
  resolveIncident,
  type BundleRecord,
  type IncidentRecord
} from "../lib/api.js";
import { formatIncidentMatchedFields } from "../lib/incident-copy.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { useDelayedVisibility } from "../lib/use-delayed-visibility.js";
import { cn } from "../lib/utils.js";

const ARTIFACT_POLL_INTERVAL_MS = 2_000;

export function IncidentDetailPage(): JSX.Element {
  const { incidentId, projectId } = useParams<{ incidentId: string; projectId?: string }>();
  const location = useLocation();
  const [incident, setIncident] = useState<IncidentRecord | null | undefined>(undefined);
  const [error, setError] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isCaptureRulesOpen, setIsCaptureRulesOpen] = useState(false);
  const backDestination = resolveIncidentBackDestination(location.pathname, projectId);
  const backLabel = resolveIncidentBackLabel(location.pathname, projectId);
  const showIncidentLoading = useDelayedVisibility(incident === undefined);

  useEffect(() => {
    if (incidentId === undefined) return;

    void (async () => {
      try {
        const result = await getIncident(incidentId);
        setIncident(result);
      } catch {
        setError(true);
        setIncident(null);
      }
    })();
  }, [incidentId]);

  if (incidentId === undefined) {
    return <Navigate replace to="/incidents" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to={backDestination}>
            <ArrowLeftIcon className="size-4" />
            {backLabel}
          </Link>
        </Button>
      </div>

      {incident === undefined ? (
        showIncidentLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-96" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : null
      ) : error || incident === null ? (
        <CalloutCard
          eyebrow="Not found"
          title="Incident not available"
          description="This incident could not be found in the current workspace. It may have been removed or you may not have access."
          tone="warning"
        >
          <Button asChild type="button" variant="outline">
            <Link to={backDestination}>{backLabel}</Link>
          </Button>
        </CalloutCard>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{incident.title}</h2>
              <p className="text-sm text-muted-foreground">
                {formatIncidentMatchedFields(incident.matched_fields)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {incident.status !== "resolved" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isResolving}
                  onClick={() => {
                    setIsResolving(true);
                    void (async () => {
                      try {
                        const resolved = await resolveIncident(incident.incident_id);
                        setIncident(resolved);
                        showSuccessToast("Incident resolved successfully.");
                      } catch {
                        showErrorToast("Could not resolve incident.");
                      } finally {
                        setIsResolving(false);
                      }
                    })();
                  }}
                >
                  {isResolving ? "Resolving..." : "Mark resolved"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCaptureRulesOpen(true)}
              >
                Capture rules
              </Button>
              <Badge variant={severityVariantMap[incident.severity]}>{incident.severity}</Badge>
              <Badge variant={statusVariantMap[incident.status]}>{incident.status}</Badge>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Occurrences" value={String(incident.occurrence_count)} />
            <MetricCard label="Environment" value={incident.environment} />
            <MetricCard label="First seen" value={formatDate(incident.first_seen_at)} />
            <MetricCard label="Last seen" value={formatDate(incident.last_seen_at)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <DetailRow
              label="Project"
              value={incident.project_name}
              linkTo={`/projects/${incident.project_id}`}
            />
            <DetailRow label="Service" value={incident.service_name ?? "Unknown service"} />
            <DetailRow
              label="Incident"
              value={incident.incident_id}
              truncateValue
              copyValue={incident.incident_id}
              copyLabel="Copy incident ID"
            />
            <DetailRow
              label="Fingerprint"
              value={incident.fingerprint}
              truncateValue
              valueSuffix={formatFingerprintVersion(incident.fingerprint_version)}
            />
            {incident.spike_detected_at !== null ? (
              <DetailRow label="Spike detected" value={formatDate(incident.spike_detected_at)} />
            ) : null}
            {incident.resolved_at != null ? (
              <DetailRow label="Resolved" value={formatDate(incident.resolved_at)} />
            ) : null}
            {incident.regressed_at !== null ? (
              <DetailRow label="Regressed" value={formatDate(incident.regressed_at)} />
            ) : null}
          </div>

          <Tabs defaultValue="bundle">
            <TabsList>
              <TabsTrigger value="bundle">Debug Bundle</TabsTrigger>
              <TabsTrigger value="reproduction">Reproduction</TabsTrigger>
            </TabsList>

            <TabsContent value="bundle" className="mt-6">
              <BundleTab incidentId={incidentId} />
            </TabsContent>

            <TabsContent value="reproduction" className="mt-6">
              <ReproductionTab incidentId={incidentId} />
            </TabsContent>
          </Tabs>

          <IncidentCaptureRuleSuggestionsDialog
            incidentId={incident.incident_id}
            open={isCaptureRulesOpen}
            onOpenChange={setIsCaptureRulesOpen}
            {...(projectId === undefined ? {} : { projectId })}
          />
        </>
      )}
    </div>
  );
}

function BundleTab({ incidentId }: { incidentId: string }): JSX.Element {
  const [bundleState, setBundleState] = useState<
    | { status: "loading" }
    | { status: "ready"; bundle: BundleRecord }
    | { status: "pending" | "failed" | "error" }
  >({ status: "loading" });
  const showBundleLoading = useDelayedVisibility(bundleState.status === "loading");

  useEffect(() => {
    setBundleState({ status: "loading" });

    return startArtifactPolling({
      load: () => getIncidentBundle(incidentId),
      setState: setBundleState
    });
  }, [incidentId]);

  if (bundleState.status === "loading") {
    return showBundleLoading ? (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" />
            Loading bundle...
          </div>
        </CardContent>
      </Card>
    ) : (
      <></>
    );
  }

  if (bundleState.status === "pending") {
    return (
      <CalloutCard
        eyebrow="Processing"
        title="Bundle is being generated"
        description="The worker is still processing this incident. The debug bundle will appear here once generation completes."
        tone="neutral"
        titleAccessory={
          <LoaderCircleIcon
            className="size-4 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        }
      />
    );
  }

  if (bundleState.status !== "ready") {
    return (
      <CalloutCard
        eyebrow="Unavailable"
        title="Bundle generation failed"
        description="The debug bundle could not be generated for this incident. This may be due to missing event data or a processing error."
        tone="warning"
      />
    );
  }

  const bundleJson = JSON.stringify(bundleState.bundle, null, 2);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Debug bundle</CardTitle>
          <CardDescription>Full bundle artifact for this incident.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void copyToClipboard(bundleJson);
            }}
          >
            <ClipboardCopyIcon className="size-4" />
            Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadJson(bundleJson, `bundle-${incidentId}.json`)}
          >
            <DownloadIcon className="size-4" />
            Download
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <HighlightedCodeBlock code={bundleJson} />
      </CardContent>
    </Card>
  );
}

function ReproductionTab({ incidentId }: { incidentId: string }): JSX.Element {
  const [reproState, setReproState] = useState<
    | { status: "loading" }
    | { status: "ready"; reproduction: Record<string, unknown> }
    | { status: "pending" | "failed" | "error" }
  >({ status: "loading" });
  const showReproductionLoading = useDelayedVisibility(reproState.status === "loading");

  useEffect(() => {
    setReproState({ status: "loading" });

    return startArtifactPolling({
      load: () => getIncidentReproduction(incidentId),
      setState: setReproState
    });
  }, [incidentId]);

  if (reproState.status === "loading") {
    return showReproductionLoading ? (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" />
            Loading reproduction...
          </div>
        </CardContent>
      </Card>
    ) : (
      <></>
    );
  }

  if (reproState.status === "pending") {
    return (
      <CalloutCard
        eyebrow="Processing"
        title="Reproduction is being generated"
        description="The reproduction artifact will appear here once the worker finishes processing."
        tone="neutral"
        titleAccessory={
          <LoaderCircleIcon
            className="size-4 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        }
      />
    );
  }

  if (reproState.status !== "ready") {
    return (
      <CalloutCard
        eyebrow="Unavailable"
        title="Reproduction not available"
        description="No reproduction artifact is available for this incident."
        tone="warning"
      />
    );
  }

  const reproJson = JSON.stringify(reproState.reproduction, null, 2);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Reproduction</CardTitle>
          <CardDescription>Steps and artifacts to reproduce this incident.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void copyToClipboard(reproJson);
            }}
          >
            <ClipboardCopyIcon className="size-4" />
            Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadJson(reproJson, `reproduction-${incidentId}.json`)}
          >
            <DownloadIcon className="size-4" />
            Download
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <HighlightedCodeBlock code={reproJson} />
      </CardContent>
    </Card>
  );
}

const severityVariantMap: Record<
  IncidentRecord["severity"],
  "secondary" | "warning" | "destructive"
> = {
  low: "secondary",
  medium: "secondary",
  high: "warning",
  critical: "destructive"
};

const statusVariantMap: Record<IncidentRecord["status"], "secondary" | "warning" | "success"> = {
  open: "warning",
  resolved: "success",
  regressed: "secondary"
};

function MetricCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
  linkTo,
  truncateValue = false,
  valueSuffix,
  copyValue,
  copyLabel = "Copy value"
}: {
  label: string;
  value: string;
  linkTo?: string;
  truncateValue?: boolean;
  valueSuffix?: string;
  copyValue?: string;
  copyLabel?: string;
}): JSX.Element {
  const valueClassName = cn("min-w-0 flex-1 font-medium text-right", truncateValue && "truncate");

  return (
    <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-4 rounded-lg border p-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center justify-end gap-2">
        {linkTo !== undefined ? (
          <Link
            to={linkTo}
            className={cn(valueClassName, "hover:underline")}
            title={truncateValue ? value : undefined}
          >
            {value}
          </Link>
        ) : (
          <span className={valueClassName} title={truncateValue ? value : undefined}>
            {value}
          </span>
        )}
        {valueSuffix !== undefined ? (
          <span className="shrink-0 text-xs text-muted-foreground">{valueSuffix}</span>
        ) : null}
        {copyValue !== undefined ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={copyLabel}
                className="shrink-0"
                onClick={() => {
                  void copyToClipboard(copyValue);
                }}
              >
                <ClipboardCopyIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{copyLabel}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
}

function startArtifactPolling<
  TArtifactState extends { status: "ready" | "pending" | "failed" }
>(input: {
  load: () => Promise<TArtifactState>;
  setState: (state: TArtifactState | { status: "error" }) => void;
}): () => void {
  let cancelled = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  async function loadArtifact(): Promise<void> {
    try {
      const result = await input.load();
      if (cancelled) return;

      input.setState(result);
      if (result.status === "pending") {
        timeout = setTimeout(() => {
          void loadArtifact();
        }, ARTIFACT_POLL_INTERVAL_MS);
      }
    } catch {
      if (!cancelled) {
        input.setState({ status: "error" });
      }
    }
  }

  void loadArtifact();

  return () => {
    cancelled = true;
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatFingerprintVersion(value: string): string {
  return /^v/i.test(value) ? value : `v${value}`;
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showSuccessToast("Copied to clipboard successfully.");
  } catch {
    showErrorToast("Could not copy to clipboard.");
  }
}

function downloadJson(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  showSuccessToast(`${filename} downloaded successfully.`);
}

function resolveIncidentBackDestination(pathname: string, projectId?: string): string {
  if (projectId === undefined) {
    return "/incidents";
  }

  if (pathname.includes("/bundles/")) {
    return `/projects/${projectId}/bundles`;
  }

  return `/projects/${projectId}/incidents`;
}

function resolveIncidentBackLabel(pathname: string, projectId?: string): string {
  if (projectId === undefined) {
    return "Back to incidents";
  }

  if (pathname.includes("/bundles/")) {
    return "Back to bundles";
  }

  return "Back to incidents";
}
