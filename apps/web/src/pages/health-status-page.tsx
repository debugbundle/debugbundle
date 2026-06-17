import {
  ChevronDownIcon,
  ChevronRightIcon,
  HeartPulseIcon
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { PageHeader } from "../components/system/page-header.js";
import { ProjectNameWithAccessIndicator } from "../components/system/project-name-with-access-indicator.js";
import { ResourceListState } from "../components/system/resource-list-state.js";
import { TableRefreshButton } from "../components/system/table-refresh-button.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../components/ui/empty.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip.js";
import {
  isInvalidSessionError,
  listProjectAvailabilityCheckDailyRollups,
  listProjectAvailabilityChecks,
  listProjects,
  type AvailabilityCheckRecord
} from "../lib/api.js";
import { isSharedProjectAccessSuspended } from "../lib/project-access.js";
import { cn } from "../lib/utils.js";
import {
  buildHealthStatusDayRange,
  buildHealthStatusProjects,
  formatHealthStatusLabel,
  formatStatusDayLabel,
  formatStatusUptime,
  type HealthStatusDay,
  type HealthStatusDayState,
  type HealthStatusProjectSummary,
  type ProjectHealthStatusInput
} from "./health-status-page-utils.js";

const STATUS_HISTORY_DAYS = 30;

export function HealthStatusPage(): JSX.Element {
  const [projects, setProjects] = useState<HealthStatusProjectSummary[] | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());
  const dayRange = useMemo(() => buildHealthStatusDayRange(new Date(), STATUS_HISTORY_DAYS), [refreshCount]);
  const isLoading = projects === null;

  useEffect(() => {
    let canceled = false;

    void (async () => {
      setLoadErrorMessage(null);
      setProjects(null);

      try {
        const nextProjects = await loadHealthStatusProjects(dayRange);
        if (!canceled) {
          setProjects(nextProjects);
          setExpandedProjectIds(defaultExpandedProjectIds(nextProjects));
        }
      } catch (error) {
        if (isInvalidSessionError(error)) {
          return;
        }
        if (!canceled) {
          setProjects([]);
          setLoadErrorMessage("Health status could not be loaded.");
        }
      }
    })();

    return () => {
      canceled = true;
    };
  }, [dayRange]);

  const summary = useMemo(() => buildWorkspaceSummary(projects ?? []), [projects]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Workspace health status across hosted availability checks. Each block summarizes one retained day of check history."
        actions={
          <TableRefreshButton
            isLoading={isLoading}
            onRefresh={() => setRefreshCount((current) => current + 1)}
          />
        }
      />

      {loadErrorMessage === null ? null : (
        <Notice tone="warning" title="Could not refresh health status">
          {loadErrorMessage}
        </Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatusMetric label="Projects" value={String(summary.projectCount)} />
        <StatusMetric label="Checks" value={String(summary.checkCount)} />
        <StatusMetric label="Uptime" value={formatStatusUptime(summary.uptimePercentage)} />
      </div>

      <Card className="min-w-0">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Health status</CardTitle>
          <p className="text-sm text-muted-foreground">{STATUS_HISTORY_DAYS}-day retained history</p>
        </CardHeader>
        <CardContent>
          <ResourceListState
            items={projects}
            loading={
              <div className="flex flex-col gap-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            }
            empty={
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HeartPulseIcon />
                  </EmptyMedia>
                  <EmptyTitle>No health checks yet</EmptyTitle>
                  <EmptyDescription>
                    Create hosted health checks from a project Health tab to populate this status page.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button asChild type="button" variant="outline">
                    <Link to="/projects">
                      Open projects
                      <ChevronRightIcon data-icon="inline-end" />
                    </Link>
                  </Button>
                </EmptyContent>
              </Empty>
            }
          >
            {(items) => (
              <div className="flex flex-col divide-y divide-border">
                {items.map((project) => (
                  <ProjectStatusRow
                    key={project.project.project_id}
                    project={project}
                    expanded={expandedProjectIds.has(project.project.project_id)}
                    onToggle={() => {
                      setExpandedProjectIds((current) => toggleExpandedProject(current, project.project.project_id));
                    }}
                  />
                ))}
              </div>
            )}
          </ResourceListState>
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectStatusRow({
  project,
  expanded,
  onToggle
}: {
  project: HealthStatusProjectSummary;
  expanded: boolean;
  onToggle: () => void;
}): JSX.Element {
  const canExpand = project.checks.length > 1;

  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-5">
        <div className="flex min-w-0 items-center gap-2 lg:max-w-sm lg:shrink-0">
          {canExpand ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`${expanded ? "Collapse" : "Expand"} ${project.project.name} checks`}
              aria-expanded={expanded}
              onClick={onToggle}
            >
              {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </Button>
          ) : null}
          <div className="min-w-0">
            <ProjectNameWithAccessIndicator project={project.project} showColorTag />
            <p className="text-xs text-muted-foreground">
              {project.checks.length} health check{project.checks.length === 1 ? "" : "s"}
              {project.active_incident_count > 0
                ? ` / ${project.active_incident_count} active incident${project.active_incident_count === 1 ? "" : "s"}`
                : ""}
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <StatusHistoryStrip days={project.days} label={`${project.project.name} health history`} />
        </div>

        <div className="flex items-center justify-between gap-3 lg:shrink-0 lg:justify-end">
          <StatusBadge state={project.current_state} />
          <div className="min-w-24 text-right">
            <p className="text-sm font-medium text-foreground">{formatStatusUptime(project.uptime_percentage)}</p>
            <p className="text-xs text-muted-foreground">uptime</p>
          </div>
          <Button asChild type="button" variant="ghost" size="sm">
            <Link to={`/projects/${project.project.project_id}/health`}>Open</Link>
          </Button>
        </div>
      </div>

      {canExpand && expanded ? (
        <div className="ml-0 flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-3 sm:ml-9">
          {project.checks.map((checkSummary) => (
            <CheckStatusRow key={checkSummary.check.check_id} summary={checkSummary} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CheckStatusRow({ summary }: { summary: HealthStatusProjectSummary["checks"][number] }): JSX.Element {
  const check = summary.check;

  return (
    <div className="flex flex-col gap-3 rounded-md px-1 py-2 lg:flex-row lg:items-center lg:gap-5">
      <div className="min-w-0 lg:max-w-xs lg:shrink-0">
        <p className="truncate text-sm font-medium text-foreground">{check.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[check.service_name, check.environment].filter(Boolean).join(" / ")}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <StatusHistoryStrip days={summary.days} label={`${check.name} health history`} compact />
      </div>
      <div className="flex items-center justify-between gap-3 lg:shrink-0 lg:justify-end">
        <StatusBadge state={mapCheckStatusToDayState(check.status)} />
        <p className="min-w-24 text-right text-sm text-muted-foreground">{formatStatusUptime(summary.uptime_percentage)}</p>
      </div>
    </div>
  );
}

function StatusHistoryStrip({
  days,
  label,
  compact = false
}: {
  days: HealthStatusDay[];
  label: string;
  compact?: boolean;
}): JSX.Element {
  return (
    <div className="min-w-0 w-full" role="img" aria-label={label}>
      <div className="flex min-w-0 w-full gap-0.5">
        {days.map((day) => (
          <Tooltip key={day.day}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={formatStatusDayLabel(day)}
                className={cn(
                  "h-5 min-w-1 flex-1 rounded-[2px] border outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  compact ? "sm:h-4" : "sm:h-5",
                  statusDayClassName(day)
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              {formatStatusDayLabel(day)}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ state }: { state: HealthStatusDayState }): JSX.Element {
  return <Badge variant={statusBadgeVariant(state)}>{formatHealthStatusLabel(state)}</Badge>;
}

function StatusMetric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

async function loadHealthStatusProjects(dayRange: string[]): Promise<HealthStatusProjectSummary[]> {
  const projects = await listProjects();
  const projectInputs = await Promise.all(
    projects.filter((project) => !isSharedProjectAccessSuspended(project)).map(async (project): Promise<ProjectHealthStatusInput> => {
      const { checks } = await listProjectAvailabilityChecks(project.project_id, 100);
      const rollupEntries = await Promise.all(
        checks.map(async (check) => {
          const rollups = await listProjectAvailabilityCheckDailyRollups(
            project.project_id,
            check.check_id,
            STATUS_HISTORY_DAYS
          );
          return [check.check_id, rollups] as const;
        })
      );

      return {
        project,
        checks,
        rollupsByCheckId: new Map(rollupEntries)
      };
    })
  );

  return buildHealthStatusProjects(projectInputs, dayRange);
}

function buildWorkspaceSummary(projects: HealthStatusProjectSummary[]): {
  projectCount: number;
  checkCount: number;
  uptimePercentage: number | null;
} {
  const allDays = projects.flatMap((project) => project.days);
  const totalChecks = allDays.reduce((total, day) => total + day.total_checks, 0);
  const failedChecks = allDays.reduce((total, day) => total + day.failed_checks, 0);

  return {
    projectCount: projects.length,
    checkCount: projects.reduce((total, project) => total + project.checks.length, 0),
    uptimePercentage: totalChecks === 0 ? null : ((totalChecks - failedChecks) / totalChecks) * 100
  };
}

function defaultExpandedProjectIds(projects: HealthStatusProjectSummary[]): Set<string> {
  return new Set(
    projects
      .filter((project) => project.current_state === "down" || project.checks.length > 1)
      .map((project) => project.project.project_id)
  );
}

function toggleExpandedProject(current: Set<string>, projectId: string): Set<string> {
  const next = new Set(current);
  if (next.has(projectId)) {
    next.delete(projectId);
  } else {
    next.add(projectId);
  }
  return next;
}

function mapCheckStatusToDayState(status: AvailabilityCheckRecord["status"]): HealthStatusDayState {
  if (status === "passing") {
    return "operational";
  }
  if (status === "failing") {
    return "down";
  }
  return status;
}

function statusBadgeVariant(
  state: HealthStatusDayState
): "outline" | "secondary" | "success" | "warning" | "destructive" {
  if (state === "operational") {
    return "success";
  }
  if (state === "degraded") {
    return "warning";
  }
  if (state === "down") {
    return "destructive";
  }
  if (state === "paused") {
    return "secondary";
  }
  return "outline";
}

function statusDayClassName(day: HealthStatusDay): string {
  if (day.impact === "outage") {
    return "border-destructive/80 bg-destructive";
  }
  if (day.impact === "elevated") {
    return "border-warning bg-warning";
  }
  if (day.impact === "minor") {
    return "border-warning/60 bg-warning/55";
  }
  if (day.state === "operational") {
    return "border-success/80 bg-success";
  }
  if (day.state === "paused") {
    return "border-border bg-muted";
  }
  return "border-border/60 bg-muted/40";
}
