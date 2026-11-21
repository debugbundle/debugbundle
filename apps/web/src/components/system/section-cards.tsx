import { BellRingIcon, HeartPulseIcon, RotateCcwIcon, SirenIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import {
  listProjectAvailabilityCheckDailyRollups,
  listProjectAvailabilityChecks,
  listProjects,
  type AvailabilityCheckDailyRollupRecord,
  type ProjectRecord
} from "../../lib/api.js";
import {
  summarizeHealthStatusToday,
  type HealthStatusTodaySummary
} from "../../lib/health-status-summary.js";
import { getActiveIncidentCount } from "../../lib/project-metrics.js";
import { isSharedProjectAccessSuspended } from "../../lib/project-access.js";

const HEALTH_STATUS_HISTORY_DAYS = 30;

interface DashboardMetrics {
  activeIncidents: number;
  regressedIncidents: number;
  attentionIncidentsToday: number;
  healthStatusToday: HealthStatusTodaySummary;
}

async function aggregateProjectMetrics(
  projects: ProjectRecord[],
  isCurrent: () => boolean,
  refresh: boolean
): Promise<{ metrics: DashboardMetrics; healthComplete: boolean }> {
  const incidentMetrics = projects.reduce<Omit<DashboardMetrics, "healthStatusToday">>(
    (totals, project) => ({
      activeIncidents: totals.activeIncidents + getActiveIncidentCount(project.metrics),
      regressedIncidents: totals.regressedIncidents + project.metrics.regressed_incidents,
      attentionIncidentsToday:
        totals.attentionIncidentsToday + project.metrics.attention_incidents_today
    }),
    {
      activeIncidents: 0,
      regressedIncidents: 0,
      attentionIncidentsToday: 0
    }
  );
  let healthComplete = true;
  const availabilityResponses = await Promise.all(
    projects
      .filter((project) => !isSharedProjectAccessSuspended(project))
      .map(async (project) => {
        try {
          const response = await listProjectAvailabilityChecks(project.project_id, 100, {
            refresh
          });
          if (!isCurrent())
            return {
              checks: [],
              rollupsByCheckId: new Map<string, AvailabilityCheckDailyRollupRecord[]>()
            };
          const rollupEntries = await Promise.all(
            response.checks.map(async (check) => {
              try {
                return [
                  check.check_id,
                  await listProjectAvailabilityCheckDailyRollups(
                    project.project_id,
                    check.check_id,
                    HEALTH_STATUS_HISTORY_DAYS
                  )
                ] as const;
              } catch {
                // Missing history affects uptime. The live check still determines current status.
                return [check.check_id, [] as AvailabilityCheckDailyRollupRecord[]] as const;
              }
            })
          );

          return {
            checks: response.checks,
            rollupsByCheckId: new Map<string, AvailabilityCheckDailyRollupRecord[]>(rollupEntries)
          };
        } catch {
          healthComplete = false;
          return {
            checks: [],
            rollupsByCheckId: new Map<string, AvailabilityCheckDailyRollupRecord[]>()
          };
        }
      })
  );
  const rollupsByCheckId = new Map<string, AvailabilityCheckDailyRollupRecord[]>();
  for (const response of availabilityResponses) {
    for (const [checkId, rollups] of response.rollupsByCheckId) {
      rollupsByCheckId.set(checkId, rollups);
    }
  }

  return {
    healthComplete,
    metrics: {
      ...incidentMetrics,
      healthStatusToday: summarizeHealthStatusToday(
        availabilityResponses.flatMap((response) => response.checks),
        rollupsByCheckId,
        "workspace"
      )
    }
  };
}

export function useDashboardMetrics(): {
  projects: ProjectRecord[] | null;
  metrics: DashboardMetrics | null;
  refreshMetrics: (background?: boolean) => Promise<void>;
} {
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const pending = useRef<symbol | null>(null);

  const refreshMetrics = useCallback(async (background = false): Promise<void> => {
    if (pending.current !== null) return;
    const request = Symbol();
    pending.current = request;
    const isCurrent = (): boolean => pending.current === request;

    try {
      const projects = await listProjects(undefined, { refresh: background });
      if (!isCurrent()) return;
      setProjects(projects);
      const next = await aggregateProjectMetrics(projects, isCurrent, background);
      if (!isCurrent()) return;
      setMetrics((previous) => ({
        ...next.metrics,
        healthStatusToday:
          background &&
          !next.healthComplete &&
          next.metrics.healthStatusToday.state !== "down" &&
          previous !== null
            ? previous.healthStatusToday
            : next.metrics.healthStatusToday
      }));
    } catch {
      if (isCurrent() && !background) {
        setProjects([]);
        setMetrics({
          activeIncidents: 0,
          regressedIncidents: 0,
          attentionIncidentsToday: 0,
          healthStatusToday: summarizeHealthStatusToday([], new Map(), "workspace")
        });
      }
    } finally {
      if (isCurrent()) pending.current = null;
    }
  }, []);

  useEffect(() => {
    void refreshMetrics();
    return () => {
      pending.current = null;
    };
  }, [refreshMetrics]);

  return { projects, metrics, refreshMetrics };
}

export function SectionCards({
  metrics,
  attentionToday
}: {
  metrics: DashboardMetrics | null;
  attentionToday: number | undefined;
}): JSX.Element {
  const activeIncidents = metrics?.activeIncidents;
  const healthStatusToday = metrics?.healthStatusToday;
  const regressedIncidents = metrics?.regressedIncidents;

  function scrollToIncidentsToday(): void {
    document.getElementById("dashboard-incidents-today")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Link
        to="/incidents"
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Card className="h-full cursor-pointer transition-colors hover:bg-muted/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Active incidents</CardDescription>
            <SirenIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <CardTitle className="text-2xl tabular-nums">
              {activeIncidents !== undefined ? activeIncidents.toLocaleString() : "\u2014"}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeIncidents !== undefined
                ? "Open or regressed incidents across all projects"
                : "Loading\u2026"}
            </p>
          </CardContent>
        </Card>
      </Link>

      <button
        type="button"
        onClick={scrollToIncidentsToday}
        className="block w-full rounded-xl border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Card className="h-full cursor-pointer transition-colors hover:bg-muted/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Incidents today</CardDescription>
            <BellRingIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <CardTitle className="text-2xl tabular-nums">
              {attentionToday !== undefined ? attentionToday.toLocaleString() : "\u2014"}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {attentionToday !== undefined
                ? "Opened or regressed today across all projects"
                : "Loading\u2026"}
            </p>
          </CardContent>
        </Card>
      </button>

      <Link
        to="/health-status"
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Card className="h-full cursor-pointer transition-colors hover:bg-muted/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Health status today</CardDescription>
            <HeartPulseIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <CardTitle className="text-2xl">
              {healthStatusToday !== undefined ? healthStatusToday.value : "\u2014"}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {healthStatusToday !== undefined ? healthStatusToday.description : "Loading\u2026"}
            </p>
          </CardContent>
        </Card>
      </Link>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription>Regressed incidents</CardDescription>
          <RotateCcwIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl tabular-nums">
            {regressedIncidents !== undefined ? regressedIncidents.toLocaleString() : "\u2014"}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {regressedIncidents !== undefined
              ? "Current regressed incidents across all projects"
              : "Loading\u2026"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
