import { useEffect, useState } from "react";
import type { ReviewPlanDocument } from "../../../../../packages/smart-improvements/src/review-planning-contract.js";
import { LightbulbIcon } from "lucide-react";
import {
  reviewPolicy,
  type ReviewSettings,
  type ReviewRecord
} from "../../../../../packages/smart-improvements/src/review-contract.js";
import type { SessionRecord } from "../../lib/api.js";
import { improvementReviewApi, improvementReviewError } from "../../lib/improvement-review-api.js";
import { reportScope } from "../../lib/report-api.js";
import { reportPeriodLabel } from "../../../../../packages/smart-reports/src/report-presentation.js";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent
} from "../ui/card.js";
import { Button } from "../ui/button.js";
import { Badge } from "../ui/badge.js";
import { Skeleton } from "../ui/skeleton.js";
import { Notice } from "../ui/notice.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "../ui/dialog.js";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "../ui/table.js";
import { ResourceEmptyState } from "./resource-empty-state.js";
import { PendingButton } from "./pending-button.js";
import { ImprovementReviewSettingsDialog } from "./improvement-review-settings-dialog.js";
import { ImprovementReviewContent } from "./improvement-review-content.js";
const labels: Record<ReviewRecord["status"], string> = {
  queued: "Queued",
  processing: "Generating",
  ready: "Ready",
  factual_only: "Evidence ready",
  no_data: "No retained evidence",
  no_change: "No new evidence",
  skipped_quota: "Allowance reached",
  paused_access: "Access changed",
  failed: "Failed"
};
type Data = {
  reviews: ReviewRecord[];
  next: string | null;
  settings: ReviewSettings | null;
  allowance: { remaining: number; limit: number } | null;
};
/** Reusable workspace/project review inventory. It owns read-only loading and
 * explicit settings/view intents; opening or refreshing never generates work. */
export function ImprovementReviewSection(props: {
  session: SessionRecord;
  projectId?: string;
}): JSX.Element {
  return (
    <ImprovementReviewInventory
      key={`${props.session.user_id}:${props.session.organization_id}:${props.session.role}:${props.session.organization_plan}:${props.projectId ?? ""}`}
      {...props}
    />
  );
}
function ImprovementReviewInventory({
  session,
  projectId
}: {
  session: SessionRecord;
  projectId?: string;
}): JSX.Element {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState<string | null>(null),
    [revision, setRevision] = useState(0),
    [settingsOpen, setSettingsOpen] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(),
    [selected, setSelected] = useState<ReviewRecord | null>(null),
    [bundle, setBundle] = useState<ReviewPlanDocument | null>(null),
    [viewError, setViewError] = useState<string | null>(null),
    [viewLoading, setViewLoading] = useState(false);
  const policy = reviewPolicy(session.organization_plan, session.self_hosted),
    key = `${session.user_id}:${session.organization_id}:${projectId ?? ""}`;
  const canManageSettings =
    session.role === "owner" &&
    data?.settings != null &&
    (policy.available || data.settings.version > 0);
  const canEnableReviews =
    canManageSettings && policy.available && data?.settings?.enabled === false;
  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    const scope = reportScope(session.organization_id);
    void Promise.allSettled([
      improvementReviewApi.list({
        ...scope,
        query: {
          limit: 10,
          ...(projectId ? { project_id: projectId } : {}),
          ...(cursor ? { cursor } : {})
        }
      }),
      improvementReviewApi.settings(scope),
      improvementReviewApi.allowance(scope)
    ]).then(([reviews, settings, allowance]) => {
      if (!active) return;
      if (reviews.status !== "fulfilled") {
        setError(improvementReviewError(reviews.reason));
        return;
      }
      setData({
        reviews: reviews.value.reviews,
        next: reviews.value.next_cursor,
        settings: settings.status === "fulfilled" ? settings.value : null,
        allowance: allowance.status === "fulfilled" ? allowance.value : null
      });
    });
    return () => {
      active = false;
    };
  }, [key, session.organization_id, projectId, cursor, revision]);
  useEffect(() => {
    let active = true;
    setBundle(null);
    setViewError(null);
    setViewLoading(selected !== null);
    if (selected)
      void improvementReviewApi
        .plan({ ...reportScope(session.organization_id), reviewId: selected.id })
        .then((result) => {
          if (active) {
            setBundle(result.bundle);
            setViewLoading(false);
          }
        })
        .catch((reason) => {
          if (active) {
            setViewError(improvementReviewError(reason));
            setViewLoading(false);
          }
        });
    return () => {
      active = false;
    };
  }, [selected, key, session.organization_id]);
  return (
    <Card>
      <CardHeader className="flex flex-wrap justify-between gap-4">
        <div className="flex min-w-0 max-w-lg flex-1 basis-80 flex-col gap-1">
          <CardTitle>Weekly reviews</CardTitle>
          <CardDescription>
            {policy.available
              ? "Priorities from incidents, analytics and health. No automatic actions."
              : "Included with Team and Business. Authorised saved reviews remain readable until expiry."}
            {data?.allowance ? (
              <span className="block">
                {data.allowance.remaining} of {data.allowance.limit} AI reviews left this month.
              </span>
            ) : null}
          </CardDescription>
        </div>
        <CardAction className="max-w-full">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>
              Refresh weekly reviews
            </Button>
            {canManageSettings ? (
              <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
                Weekly review settings
              </Button>
            ) : null}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <Notice tone="warning" title="Weekly reviews unavailable">
            {error}
          </Notice>
        ) : !data ? (
          <Skeleton className="h-16" />
        ) : (
          <>
            {data.settings?.requires_review ? (
              <Notice tone="warning" title="Review settings need attention">
                The Owner must review the selected scope and consent before automatic reviews
                resume.
              </Notice>
            ) : null}
            {!data.reviews.length ? (
              <ResourceEmptyState
                icon={LightbulbIcon}
                title="No weekly reviews yet"
                {...(canEnableReviews
                  ? { actionLabel: "Enable weekly review", onAction: () => setSettingsOpen(true) }
                  : {})}
                description={
                  data.settings?.enabled
                    ? "The next review covers a completed UTC week. Sparse or missing data is shown explicitly; no data does not mean everything is healthy."
                    : "The workspace Owner can enable weekly reviews with explicit project selection and evidence consent."
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project / UTC week</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.reviews.map((review) => (
                    <TableRow key={review.id}>
                      <TableCell>
                        <span className="block font-medium">{review.project_name}</span>
                        <span className="text-sm text-muted-foreground">
                          {reportPeriodLabel(review.period)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{labels[review.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelected(review)}>
                          View review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {cursor || data.next ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!cursor}
                  onClick={() => setCursor(undefined)}
                >
                  Latest reviews
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data.next}
                  onClick={() => setCursor(data.next ?? undefined)}
                >
                  Older reviews
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
      {data?.settings ? (
        <ImprovementReviewSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={data.settings}
          session={session}
          onSaved={() => {
            setCursor(undefined);
            setRevision((value) => value + 1);
          }}
        />
      ) : null}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent size="lg" className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Weekly improvement review</DialogTitle>
            <DialogDescription>
              {selected
                ? reportPeriodLabel(selected.period)
                : "Saved evidence and suggested checks"}
            </DialogDescription>
          </DialogHeader>
          {viewLoading ? (
            <PendingButton pending pendingLabel="Loading review..." disabled>
              Loading review
            </PendingButton>
          ) : viewError ? (
            <Notice tone="warning" title="Review unavailable">
              {viewError}
            </Notice>
          ) : bundle ? (
            <ImprovementReviewContent bundle={bundle} />
          ) : (
            <Notice
              title={
                selected?.status === "queued" || selected?.status === "processing"
                  ? "Review pending"
                  : "Review unavailable"
              }
            >
              This review is {selected ? labels[selected.status].toLowerCase() : "pending"}. Close
              and refresh the inventory to check again.
            </Notice>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
