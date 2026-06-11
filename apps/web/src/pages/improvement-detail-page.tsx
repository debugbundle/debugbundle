import { ArrowLeftIcon, ClipboardCopyIcon, DownloadIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { CalloutCard } from "../components/system/callout-card.js";
import { HighlightedCodeBlock } from "../components/system/highlighted-code-block.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Skeleton } from "../components/ui/skeleton.js";
import {
  getImprovement,
  getImprovementBundle,
  reopenImprovement,
  resolveImprovement,
  snoozeImprovement,
  type BundleRecord,
  type ImprovementRecord
} from "../lib/api.js";
import { ApiRequestError } from "../lib/api-client.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { useDelayedVisibility } from "../lib/use-delayed-visibility.js";
import { cn } from "../lib/utils.js";
import { formatDate, severityVariantMap, statusVariantMap } from "./improvements-page.js";

const ARTIFACT_POLL_INTERVAL_MS = 2_000;

export function ImprovementDetailPage(): JSX.Element {
  const { improvementId, projectId } = useParams<{ improvementId: string; projectId?: string }>();
  const [improvement, setImprovement] = useState<ImprovementRecord | null | undefined>(undefined);
  const [error, setError] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const showLoading = useDelayedVisibility(improvement === undefined);
  const backDestination = projectId === undefined ? "/improvements" : `/projects/${projectId}/improvements`;
  const backLabel = projectId === undefined ? "Back to improvements" : "Back to project improvements";

  useEffect(() => {
    if (improvementId === undefined) {
      return;
    }

    void (async () => {
      try {
        const result = await getImprovement(improvementId);
        setImprovement(result);
      } catch {
        setError(true);
        setImprovement(null);
      }
    })();
  }, [improvementId]);

  if (improvementId === undefined) {
    return <Navigate replace to="/improvements" />;
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

      {improvement === undefined ? (
        showLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-96" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : null
      ) : error || improvement === null ? (
        <CalloutCard
          eyebrow="Not found"
          title="Improvement not available"
          description="This improvement opportunity could not be found in the current workspace."
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
              <h2 className="text-xl font-semibold">{improvement.title}</h2>
              <p className="text-sm text-muted-foreground">{improvement.summary}</p>
            </div>
            <div className="flex items-center gap-2">
              {improvement.status === "resolved" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isMutating}
                  onClick={() => {
                    setIsMutating(true);
                    void (async () => {
                      try {
                        const reopened = await reopenImprovement(improvement.improvement_id);
                        setImprovement(reopened);
                        showSuccessToast("Improvement reopened successfully.");
                      } catch (error) {
                        showErrorToast(getImprovementMutationErrorMessage("reopen", error));
                      } finally {
                        setIsMutating(false);
                      }
                    })();
                  }}
                >
                  {isMutating ? "Reopening..." : "Reopen"}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isMutating}
                    onClick={() => {
                      setIsMutating(true);
                      void (async () => {
                        try {
                          const snoozedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                          const snoozed = await snoozeImprovement(improvement.improvement_id, snoozedUntil);
                          setImprovement(snoozed);
                          showSuccessToast("Improvement snoozed for 7 days.");
                        } catch (error) {
                          showErrorToast(getImprovementMutationErrorMessage("snooze", error));
                        } finally {
                          setIsMutating(false);
                        }
                      })();
                    }}
                  >
                    {isMutating ? "Snoozing..." : "Snooze 7 days"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isMutating}
                    onClick={() => {
                      setIsMutating(true);
                      void (async () => {
                        try {
                          const resolved = await resolveImprovement(improvement.improvement_id);
                          setImprovement(resolved);
                          showSuccessToast("Improvement resolved successfully.");
                        } catch (error) {
                          showErrorToast(getImprovementMutationErrorMessage("resolve", error));
                        } finally {
                          setIsMutating(false);
                        }
                      })();
                    }}
                  >
                    {isMutating ? "Resolving..." : "Mark resolved"}
                  </Button>
                </>
              )}
              <Badge variant={severityVariantMap[improvement.severity]}>{improvement.severity}</Badge>
              <Badge variant={statusVariantMap[improvement.status]}>{improvement.status}</Badge>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Signals" value={String(improvement.occurrence_count)} />
            <MetricCard label="Confidence" value={`${Math.round(improvement.confidence * 100)}%`} />
            <MetricCard label="Environment" value={improvement.environment} />
            <MetricCard label="Last detected" value={formatDate(improvement.last_detected_at)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <DetailRow label="Project" value={improvement.project_name} linkTo={`/projects/${improvement.project_id}`} />
            <DetailRow label="Service" value={improvement.service_name} />
            <DetailRow label="Kind" value={formatImprovementKind(improvement.kind)} />
            <DetailRow label="Fingerprint" value={improvement.fingerprint} truncateValue />
            <DetailRow label="First detected" value={formatDate(improvement.first_detected_at)} />
            {improvement.resolved_at !== null ? <DetailRow label="Resolved" value={formatDate(improvement.resolved_at)} /> : null}
            {improvement.snoozed_until !== null ? <DetailRow label="Snoozed until" value={formatDate(improvement.snoozed_until)} /> : null}
            {improvement.bundle_updated_at !== null ? <DetailRow label="Bundle updated" value={formatDate(improvement.bundle_updated_at)} /> : null}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Evidence</CardTitle>
              <CardDescription>Deterministic evidence captured for this improvement opportunity.</CardDescription>
            </CardHeader>
            <CardContent>
              <HighlightedCodeBlock code={JSON.stringify(improvement.evidence, null, 2)} />
            </CardContent>
          </Card>

          <ImprovementBundleCard
            projectId={improvement.project_id}
            improvementId={improvement.improvement_id}
            relatedIncidentIds={improvement.related_incident_ids}
            occurrenceCount={improvement.occurrence_count}
            evidence={improvement.evidence}
          />
        </>
      )}
    </div>
  );
}

function ImprovementBundleCard(input: {
  projectId: string;
  improvementId: string;
  relatedIncidentIds: string[];
  occurrenceCount: number;
  evidence: Record<string, unknown>;
}): JSX.Element {
  const [bundleState, setBundleState] = useState<
    | { status: "loading" }
    | { status: "ready"; bundle: BundleRecord }
    | { status: "pending" }
    | { status: "failed"; reason?: string; related_incident_ids?: string[] }
    | { status: "error" }
  >({ status: "loading" });
  const showLoading = useDelayedVisibility(bundleState.status === "loading");

  useEffect(() => {
    setBundleState({ status: "loading" });

    return startArtifactPolling({
      load: () => getImprovementBundle(input.projectId, input.improvementId),
      setState: setBundleState
    });
  }, [input.improvementId, input.projectId]);

  if (bundleState.status === "loading") {
    return showLoading ? (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" />
            Loading bundle...
          </div>
        </CardContent>
      </Card>
    ) : <></>;
  }

  if (bundleState.status === "pending") {
    return (
      <CalloutCard
        eyebrow="Processing"
        title="Bundle is being generated"
        description="The hosted improvement bundle is still being written for this opportunity."
        tone="neutral"
        titleAccessory={<LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
      />
    );
  }

  if (bundleState.status === "failed" && bundleState.reason === "covered_by_incident_bundle") {
    const incidentIds =
      bundleState.related_incident_ids !== undefined && bundleState.related_incident_ids.length > 0
        ? bundleState.related_incident_ids
        : input.relatedIncidentIds;
    return (
      <CalloutCard
        eyebrow="Incident-backed"
        title="Use the related incident bundle"
        description="This improvement is a prioritization signal for an existing incident, so DebugBundle does not generate a duplicate improvement bundle."
        tone="warning"
      >
        {incidentIds.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {incidentIds.map((incidentId) => (
              <Button key={incidentId} asChild type="button" variant="outline" size="sm">
                <Link to={`/projects/${input.projectId}/incidents/${incidentId}`}>Open incident {incidentId}</Link>
              </Button>
            ))}
          </div>
        ) : null}
      </CalloutCard>
    );
  }

  if (bundleState.status === "error") {
    return (
      <CalloutCard
        eyebrow="Error"
        title="Could not load hosted bundle"
        description="The improvement detail page could not load the hosted bundle right now. The captured evidence panel is still available on this page."
        tone="warning"
      />
    );
  }

  if (bundleState.status !== "ready") {
    if (bundleState.status === "failed" && bundleState.reason === "bundle_not_generated_yet") {
      const threshold = getEvidenceThreshold(input.evidence);
      const progressDescription =
        threshold === null
          ? "This opportunity has not crossed the configured generation threshold yet."
          : `${input.occurrenceCount} of ${threshold} required signals have been observed.`;
      return (
        <CalloutCard
          eyebrow="Not generated"
          title="Bundle not generated yet"
          description={`DebugBundle is tracking this opportunity, but it is below the hosted bundle threshold. ${progressDescription}`}
          tone="neutral"
        />
      );
    }

    if (bundleState.status === "failed") {
      const presentation = getImprovementBundleFailurePresentation(bundleState.reason);
      return (
        <CalloutCard
          eyebrow={presentation.eyebrow}
          title={presentation.title}
          description={presentation.description}
          tone={presentation.tone}
        />
      );
    }

    return (
      <CalloutCard
        eyebrow="Unavailable"
        title="Bundle not available"
        description="A hosted improvement bundle is not available for this opportunity yet."
        tone="warning"
      />
    );
  }

  const bundleJson = JSON.stringify(bundleState.bundle, null, 2);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Improvement bundle</CardTitle>
          <CardDescription>Full improvement bundle artifact for this opportunity.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { void copyToClipboard(bundleJson); }}>
            <ClipboardCopyIcon className="size-4" />
            Copy
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadJson(bundleJson, `improvement-${input.improvementId}.json`)}>
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

function getEvidenceThreshold(evidence: Record<string, unknown>): number | null {
  return typeof evidence["threshold"] === "number" ? evidence["threshold"] : null;
}

function MetricCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
  linkTo,
  truncateValue = false
}: {
  label: string;
  value: string;
  linkTo?: string;
  truncateValue?: boolean;
}): JSX.Element {
  const content = linkTo === undefined ? (
    <span className={cn("text-sm text-foreground", truncateValue ? "truncate" : "break-words")} title={truncateValue ? value : undefined}>
      {value}
    </span>
  ) : (
    <Link
      to={linkTo}
      className={cn("text-sm text-foreground hover:underline", truncateValue ? "truncate" : "break-words")}
      title={truncateValue ? value : undefined}
    >
      {value}
    </Link>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

function startArtifactPolling<TArtifactState extends { status: "ready" | "pending" | "failed" }>(input: {
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
        timeout = setTimeout(() => { void loadArtifact(); }, ARTIFACT_POLL_INTERVAL_MS);
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

function formatImprovementKind(kind: ImprovementRecord["kind"]): string {
  switch (kind) {
    case "warning_hotspot":
      return "Warning hotspot";
    case "slow_request":
      return "Slow request";
    case "request_failure_pattern":
      return "Request failure";
    case "recurring_incident":
      return "Recurring incident";
    case "post_deploy_regression":
      return "Post-deploy regression";
  }
}

function getImprovementBundleFailurePresentation(reason: string | undefined): {
  eyebrow: string;
  title: string;
  description: string;
  tone: "neutral" | "warning";
} {
  switch (reason) {
    case "monthly_quota_exceeded":
      return {
        eyebrow: "Quota reached",
        title: "Monthly bundle allowance reached",
        description:
          "This opportunity crossed the hosted generation threshold, but the project has already used its monthly bundle allowance. The captured evidence panel is still available on this page.",
        tone: "warning"
      };
    case "build_error":
      return {
        eyebrow: "Generation failed",
        title: "Bundle generation failed",
        description:
          "DebugBundle could not finish generating the hosted improvement bundle. The captured evidence panel is still available on this page, and a retry will start automatically when the opportunity is requested again.",
        tone: "warning"
      };
    case "bundle_source_unavailable":
      return {
        eyebrow: "Source unavailable",
        title: "Bundle source unavailable",
        description:
          "DebugBundle recorded this improvement, but the retained source event needed to rebuild the hosted bundle is no longer available. The captured evidence panel is still available on this page.",
        tone: "warning"
      };
    case "bundle_generation_disabled":
      return {
        eyebrow: "Generation disabled",
        title: "Hosted bundle generation is disabled",
        description:
          "DebugBundle recorded this improvement, but hosted improvement bundle generation is not currently enabled for this project. The captured evidence panel is still available on this page.",
        tone: "warning"
      };
    case "bundle_artifact_unavailable":
      return {
        eyebrow: "Artifact unavailable",
        title: "Bundle artifact unavailable",
        description:
          "DebugBundle recorded this improvement, but the stored hosted bundle artifact could not be loaded. The captured evidence panel is still available on this page.",
        tone: "warning"
      };
    default:
      return {
        eyebrow: "Unavailable",
        title: "Bundle not available",
        description:
          reason === undefined
            ? "A hosted improvement bundle is not available for this opportunity right now."
            : `A hosted improvement bundle is not available for this opportunity right now. Failure code: ${reason}.`,
        tone: "warning"
      };
  }
}

function getImprovementMutationErrorMessage(
  action: "resolve" | "reopen" | "snooze",
  error: unknown
): string {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case "improvement_not_found":
        return "This improvement is no longer available.";
      case "invalid_snooze_until":
        return "Choose a future snooze time.";
      case "improvement_snooze_unavailable":
        return "Improvement snoozing is unavailable right now.";
      case "improvement_resolution_unavailable":
        return "Improvement resolution is unavailable right now.";
      case "improvement_reopen_unavailable":
        return "Improvement reopening is unavailable right now.";
    }
  }

  switch (action) {
    case "resolve":
      return "Could not resolve improvement.";
    case "reopen":
      return "Could not reopen improvement.";
    case "snooze":
      return "Could not snooze improvement.";
  }
}

async function copyToClipboard(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    showSuccessToast("Copied to clipboard.");
  } catch {
    showErrorToast("Could not copy bundle.");
  }
}

function downloadJson(contents: string, fileName: string): void {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
