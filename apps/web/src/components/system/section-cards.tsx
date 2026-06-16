import { BellRingIcon, CalendarDaysIcon, RotateCcwIcon, SirenIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { listProjects, type ProjectRecord } from "../../lib/api.js";

interface DashboardMetrics {
  openIncidents: number;
  regressedIncidents: number;
  openedIncidentsToday: number;
  openedIncidentsMonth: number;
}

function aggregateProjectMetrics(projects: ProjectRecord[]): DashboardMetrics {
  return projects.reduce<DashboardMetrics>(
    (totals, project) => ({
      openIncidents: totals.openIncidents + project.metrics.open_incidents,
      regressedIncidents: totals.regressedIncidents + project.metrics.regressed_incidents,
      openedIncidentsToday: totals.openedIncidentsToday + project.metrics.opened_incidents_today,
      openedIncidentsMonth: totals.openedIncidentsMonth + project.metrics.opened_incidents_month
    }),
    {
      openIncidents: 0,
      regressedIncidents: 0,
      openedIncidentsToday: 0,
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
          openIncidents: 0,
          regressedIncidents: 0,
          openedIncidentsToday: 0,
          openedIncidentsMonth: 0
        });
      }
    })();
  }, []);

  const openIncidents = metrics?.openIncidents;
  const openedToday = metrics?.openedIncidentsToday;
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
            <CardDescription>Open incidents</CardDescription>
            <SirenIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <CardTitle className="text-2xl tabular-nums">
              {openIncidents !== undefined ? openIncidents.toLocaleString() : "\u2014"}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {openIncidents !== undefined ? "Current unresolved incidents across all projects" : "Loading\u2026"}
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
            <CardDescription>New incidents today</CardDescription>
            <BellRingIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <CardTitle className="text-2xl tabular-nums">
              {openedToday !== undefined ? openedToday.toLocaleString() : "\u2014"}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {openedToday !== undefined ? "Incidents first seen today across all projects" : "Loading\u2026"}
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
