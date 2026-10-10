import { HealthStatusProjectRow } from "../components/system/health-status-view.js";
import { ChevronRightIcon, HeartPulseIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { PageHeader } from "../components/system/page-header.js";
import { useHeaderActions } from "../components/system/header-actions-context.js";
import { ProjectNameWithAccessIndicator } from "../components/system/project-name-with-access-indicator.js";
import { ResourceListState } from "../components/system/resource-list-state.js";
import { TableRefreshButton } from "../components/system/table-refresh-button.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "../components/ui/empty.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
import {
  isInvalidSessionError,
  listProjectAvailabilityCheckDailyRollups,
  listProjectAvailabilityChecks,
  listProjects,
  type AvailabilityCheckRecord
} from "../lib/api.js";
import { isSharedProjectAccessSuspended } from "../lib/project-access.js";
import {
  buildHealthStatusDayRange,
  buildHealthStatusProjects,
  formatStatusUptime,
  type HealthStatusDayState,
  type HealthStatusProjectSummary,
  type ProjectHealthStatusInput
} from "./health-status-page-utils.js";
import { computeAvailabilityUptimePercentage } from "../lib/health-status-metrics.js";

const STATUS_HISTORY_DAYS = 30;

export function HealthStatusPage(): JSX.Element {
  const [projects, setProjects] = useState<HealthStatusProjectSummary[] | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());
  const dayRange = useMemo(
    () => buildHealthStatusDayRange(new Date(), STATUS_HISTORY_DAYS),
    [refreshCount]
  );
  const isLoading = projects === null;
  const { setAction: setHeaderAction } = useHeaderActions();

  useEffect(() => {
    setHeaderAction({
      pathname: "/health-status",
      content: (
        <TableRefreshButton
          isLoading={isLoading}
          onRefresh={() => setRefreshCount((current) => current + 1)}
        />
      )
    });

    return () => setHeaderAction(null);
  }, [isLoading, setHeaderAction]);

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
      <PageHeader description="Current health and uptime from recorded checks in the last 30 days. Each block represents a day; days without verified results are excluded from uptime." />

      {loadErrorMessage === null ? null : (
        <Notice tone="warning" title="Could not refresh health status">
          {loadErrorMessage}
        </Notice>
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatusMetric label="Projects" value={String(summary.projectCount)} />
        <StatusMetric label="Checks" value={String(summary.checkCount)} />
        <StatusMetric label="30-day uptime" value={formatStatusUptime(summary.uptimePercentage)} />
      </div>

      <Card className="min-w-0">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Health status</CardTitle>
          <p className="text-sm text-muted-foreground">
            {STATUS_HISTORY_DAYS}-day retained history
          </p>
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
                    Create hosted health checks from a project Health tab to populate this status
                    page.
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
                      setExpandedProjectIds((current) =>
                        toggleExpandedProject(current, project.project.project_id)
                      );
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
  const view = {
    key: project.project.project_id,
    name: project.project.name,
    current_state: project.current_state,
    uptime_percentage: project.uptime_percentage,
    last_verified_at: null,
    days: project.days,
    checks: project.checks.map((c) => ({
      key: c.check.check_id,
      name: c.check.name,
      current_state: mapCheckStatusToDayState(c.check.status),
      uptime_percentage: c.uptime_percentage,
      last_verified_at: null,
      days: c.days
    }))
  };
  return (
    <HealthStatusProjectRow
      project={view}
      expanded={expanded}
      onToggle={onToggle}
      name={<ProjectNameWithAccessIndicator project={project.project} showColorTag />}
      subtitle={`${project.checks.length} health check${project.checks.length === 1 ? "" : "s"}${project.active_incident_count > 0 ? ` / ${project.active_incident_count} active incident${project.active_incident_count === 1 ? "" : "s"}` : ""}`}
      action={
        <Button asChild type="button" variant="ghost" size="sm">
          <Link to={`/projects/${project.project.project_id}/health`}>Open</Link>
        </Button>
      }
      checkDescriptions={Object.fromEntries(
        project.checks.map((c) => [
          c.check.check_id,
          [c.check.service_name, c.check.environment].filter(Boolean).join(" / ")
        ])
      )}
    />
  );
}

function StatusMetric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-2 py-3 sm:px-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}

async function loadHealthStatusProjects(dayRange: string[]): Promise<HealthStatusProjectSummary[]> {
  const projects = await listProjects();
  const projectInputs = await Promise.all(
    projects
      .filter((project) => !isSharedProjectAccessSuspended(project))
      .map(async (project): Promise<ProjectHealthStatusInput> => {
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

  return {
    projectCount: projects.length,
    checkCount: projects.reduce((total, project) => total + project.checks.length, 0),
    uptimePercentage: computeAvailabilityUptimePercentage(allDays)
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
