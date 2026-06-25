import { FolderKanbanIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "../components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../components/ui/dialog.js";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "../components/ui/empty.js";
import { Skeleton } from "../components/ui/skeleton.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../components/ui/table.js";
import {
  isInvalidSessionError,
  listProjects,
  type BillingSummaryRecord,
  type ProjectRecord
} from "../lib/api.js";
import { getProjectRelationship } from "../lib/project-access.js";
import { formatDate } from "./billing-page-helpers.js";

interface RawIngestedEventsBreakdownDialogProps {
  billing: BillingSummaryRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RawIngestedEventsBreakdownDialog({
  billing,
  open,
  onOpenChange
}: RawIngestedEventsBreakdownDialogProps): JSX.Element {
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || projects !== null) {
      return;
    }

    let cancelled = false;
    setErrorMessage(null);

    void (async () => {
      try {
        const nextProjects = await listProjects();
        if (!cancelled) {
          setProjects(
            nextProjects.filter((project) => getProjectRelationship(project) !== "shared")
          );
        }
      } catch (error) {
        if (isInvalidSessionError(error)) {
          return;
        }

        if (!cancelled) {
          setErrorMessage("Could not load project usage details.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, projects]);

  const sortedProjects = useMemo(
    () =>
      [...(projects ?? [])].sort(
        (left, right) =>
          right.metrics.monthly_raw_ingested_events - left.metrics.monthly_raw_ingested_events ||
          left.name.localeCompare(right.name)
      ),
    [projects]
  );
  const projectsWithUsage = sortedProjects.filter(
    (project) => project.metrics.monthly_raw_ingested_events > 0
  );
  const visibleProjects = projectsWithUsage.slice(0, 10);
  const visibleProjectUsage = visibleProjects.reduce(
    (total, project) => total + project.metrics.monthly_raw_ingested_events,
    0
  );
  const allowance = billing.allowances.monthly_raw_ingested_events;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[calc(100vh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Raw ingested events breakdown</DialogTitle>
          <DialogDescription>
            Current billing window: {formatDate(billing.usage_window.starts_at)} to{" "}
            {formatDate(billing.usage_window.ends_at)}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <UsageSummaryItem label="Used" value={allowance.used.toLocaleString()} />
            <UsageSummaryItem label="Limit" value={allowance.limit.toLocaleString()} />
            <UsageSummaryItem
              label="Usage"
              value={formatUsagePercent(allowance.used, allowance.limit)}
            />
          </div>

          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">Where to reduce volume</p>
            <p className="text-muted-foreground">
              Start with the highest-volume project. Request telemetry, verbose logs, recurring
              browser resource errors, and known third-party noise are usually the fastest places to
              tune capture policy or add capture rules.
            </p>
          </div>

          {errorMessage === null ? null : (
            <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          {projects === null && errorMessage === null ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : visibleProjects.length === 0 ? (
            <Empty className="border border-dashed border-border/80">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderKanbanIcon />
                </EmptyMedia>
                <EmptyTitle>No project usage recorded</EmptyTitle>
                <EmptyDescription>
                  This account has no project-level raw ingested event usage in the current billing
                  window yet.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Projects by ingested events</p>
                  <p className="text-xs text-muted-foreground">
                    Top {visibleProjects.length} project{visibleProjects.length === 1 ? "" : "s"}{" "}
                    account for {visibleProjectUsage.toLocaleString()} of{" "}
                    {allowance.used.toLocaleString()} counted events.
                  </p>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Ingested events</TableHead>
                    <TableHead>Share</TableHead>
                    <TableHead>Bundle requests</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleProjects.map((project) => (
                    <TableRow key={project.project_id}>
                      <TableCell className="font-medium">
                        <Link
                          className="underline-offset-4 hover:underline"
                          to={`/projects/${project.project_id}`}
                        >
                          {project.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {project.metrics.monthly_raw_ingested_events.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatUsagePercent(
                          project.metrics.monthly_raw_ingested_events,
                          allowance.used
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {project.metrics.monthly_bundle_requests.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild type="button" variant="ghost" size="sm">
                          <Link to={`/projects/${project.project_id}/settings`}>Open settings</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

function UsageSummaryItem({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function formatUsagePercent(used: number, limit: number): string {
  if (limit <= 0) {
    return "0%";
  }

  return `${Math.round((used / limit) * 100)}%`;
}
