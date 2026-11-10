import { BellRingIcon, HeartPulseIcon, RotateCcwIcon, SirenIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ProjectSetupSummaryGrid } from "../components/system/project-setup-summary-grid.js";
import type { ProjectContext } from "../components/system/project-layout.js";
import { Badge } from "../components/ui/badge.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card.js";
import {
  listProjectAvailabilityCheckDailyRollups,
  listProjectAvailabilityChecks,
  type AvailabilityCheckDailyRollupRecord,
  type ProjectRecord
} from "../lib/api.js";
import {
  summarizeHealthStatusToday,
  type HealthStatusTodaySummary
} from "../lib/health-status-summary.js";
import {
  formatProjectRelationship,
  getProjectEffectiveRole,
  getProjectOwnerEmail,
  isSharedProject
} from "../lib/project-access.js";
import { getActiveIncidentCount } from "../lib/project-metrics.js";
import { formatDate } from "../lib/project-presentation.js";

const HEALTH_STATUS_HISTORY_DAYS = 30;

export function ProjectOverviewPage(): JSX.Element {
  const { project } = useOutletContext<ProjectContext>();

  return (
    <div className="space-y-6">
      <ProjectStatCards project={project} />

      <Card>
        <CardHeader>
          <CardTitle>Project details</CardTitle>
          <CardDescription>Project identity, access, and the default environment.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            <DetailItem label="Access" value={formatProjectRelationship(project)} />
            <DetailItem label="Your role" value={getProjectEffectiveRole(project)} />
            {isSharedProject(project) && getProjectOwnerEmail(project) !== null ? (
              <DetailItem label="Owner" value={getProjectOwnerEmail(project)!} />
            ) : null}
            <DetailItem label="Slug" value={project.slug} />
            <DetailItem label="Project default environment" value={project.environment_default} />
            <DetailItem label="Created" value={formatDate(project.created_at)} />
          </dl>

          <div className="space-y-4 border-t border-border/80 pt-4">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-foreground">Setup at a glance</h3>
              <p className="text-sm text-muted-foreground">
                Current counts and enabled states for the main automation and capture surfaces on
                this project.
              </p>
            </div>
            <ProjectSetupSummaryGrid project={project} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectStatCards({ project }: { project: ProjectRecord }): JSX.Element {
  const [healthStatusToday, setHealthStatusToday] = useState<HealthStatusTodaySummary | null>(null);
  const activeIncidents = getActiveIncidentCount(project.metrics);
  const attentionToday = project.metrics.attention_incidents_today;
  const regressedIncidents = project.metrics.regressed_incidents;

  useEffect(() => {
    let canceled = false;

    void (async () => {
      setHealthStatusToday(null);

      try {
        const response = await listProjectAvailabilityChecks(project.project_id, 100);
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
              return [check.check_id, [] as AvailabilityCheckDailyRollupRecord[]] as const;
            }
          })
        );
        if (!canceled) {
          setHealthStatusToday(
            summarizeHealthStatusToday(
              response.checks,
              new Map<string, AvailabilityCheckDailyRollupRecord[]>(rollupEntries),
              "project"
            )
          );
        }
      } catch {
        if (!canceled) {
          setHealthStatusToday(summarizeHealthStatusToday([], new Map(), "project"));
        }
      }
    })();

    return () => {
      canceled = true;
    };
  }, [project.project_id]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription>Active incidents</CardDescription>
          <SirenIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl tabular-nums">
            {activeIncidents.toLocaleString()}
          </CardTitle>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-xs">
              Current
            </Badge>
            Open or regressed incidents in this project
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription>Incidents today</CardDescription>
          <BellRingIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl tabular-nums">{attentionToday.toLocaleString()}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Opened or regressed today in this project
          </p>
        </CardContent>
      </Card>

      <Link
        to={`/projects/${project.project_id}/health`}
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Card className="h-full cursor-pointer transition-colors hover:bg-muted/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Health status today</CardDescription>
            <HeartPulseIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <CardTitle className="text-2xl">
              {healthStatusToday !== null ? healthStatusToday.value : "\u2014"}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {healthStatusToday !== null ? healthStatusToday.description : "Loading\u2026"}
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
            {regressedIncidents.toLocaleString()}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Current regressed incidents in this project
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}
