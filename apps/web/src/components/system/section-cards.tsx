import { BellRingIcon, CalendarDaysIcon, RotateCcwIcon, SirenIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { listProjects, type ProjectRecord } from "../../lib/api.js";
import { getActiveIncidentCount } from "../../lib/project-metrics.js";

interface DashboardMetrics {
  activeIncidents: number;
  regressedIncidents: number;
  attentionIncidentsToday: number;
  openedIncidentsMonth: number;
}

function aggregateProjectMetrics(projects: ProjectRecord[]): DashboardMetrics {
  return projects.reduce<DashboardMetrics>(
    (totals, project) => ({
      activeIncidents: totals.activeIncidents + getActiveIncidentCount(project.metrics),
      regressedIncidents: totals.regressedIncidents + project.metrics.regressed_incidents,
      attentionIncidentsToday: totals.attentionIncidentsToday + project.metrics.attention_incidents_today,
      openedIncidentsMonth: totals.openedIncidentsMonth + project.metrics.opened_incidents_month
    }),
    {
      activeIncidents: 0,
      regressedIncidents: 0,
      attentionIncidentsToday: 0,
      openedIncidentsMonth: 0
    }
  );
}

export function SectionCards(): JSX.Element {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const projects = await listProjects();
        setMetrics(aggregateProjectMetrics(projects));
      } catch {
        setMetrics({
          activeIncidents: 0,
          regressedIncidents: 0,
          attentionIncidentsToday: 0,
          openedIncidentsMonth: 0
        });
      }
    })();
  }, []);

  const activeIncidents = metrics?.activeIncidents;
  const attentionToday = metrics?.attentionIncidentsToday;
  const openedMonth = metrics?.openedIncidentsMonth;
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
              {activeIncidents !== undefined ? "Open or regressed incidents across all projects" : "Loading\u2026"}
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
              {attentionToday !== undefined ? "Opened or regressed today across all projects" : "Loading\u2026"}
            </p>
          </CardContent>
        </Card>
      </button>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription>Opened this month</CardDescription>
          <CalendarDaysIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl tabular-nums">
            {openedMonth !== undefined ? openedMonth.toLocaleString() : "\u2014"}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {openedMonth !== undefined ? "Incidents opened this month across all projects" : "Loading\u2026"}
          </p>
        </CardContent>
      </Card>

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
            {regressedIncidents !== undefined ? "Current regressed incidents across all projects" : "Loading\u2026"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
