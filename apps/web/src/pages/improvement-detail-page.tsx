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
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { useDelayedVisibility } from "../lib/use-delayed-visibility.js";
import { cn } from "../lib/utils.js";
import { formatDate, severityVariantMap, statusVariantMap } from "./improvements-page.js";

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
                      } catch {
                        showErrorToast("Could not reopen improvement.");
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
                        } catch {
                          showErrorToast("Could not snooze improvement.");
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
                        } catch {
                          showErrorToast("Could not resolve improvement.");
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

          <ImprovementBundleCard projectId={improvement.project_id} improvementId={improvement.improvement_id} />
        </>
      )}
    </div>
  );
}

function ImprovementBundleCard(input: { projectId: string; improvementId: string }): JSX.Element {
  const [bundleState, setBundleState] = useState<
    { status: "loading" } | { status: "ready"; bundle: BundleRecord } | { status: "pending" | "failed" | "error" }
  >({ status: "loading" });
  const showLoading = useDelayedVisibility(bundleState.status === "loading");

  useEffect(() => {
    void (async () => {
      try {
        const result = await getImprovementBundle(input.projectId, input.improvementId);
        setBundleState(result);
      } catch {
        setBundleState({ status: "error" });
      }
    })();
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
      />
    );
  }

  if (bundleState.status !== "ready") {
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
