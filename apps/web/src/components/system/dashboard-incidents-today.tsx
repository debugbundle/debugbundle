import { SirenIcon } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { formatIncidentMatchedFields } from "../../lib/incident-copy.js";
import { listIncidents, type IncidentRecord } from "../../lib/api.js";
import { getLocalDayWindow, isIncidentAttentionToday } from "../../lib/incidents-today.js";
import {
  shouldIgnoreTableRowActivation
} from "./selectable-table-actions.js";
import { TableRefreshButton } from "./table-refresh-button.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty.js";
import { ProjectColorTagDot } from "./project-color-tag-dot.js";
import { ResourceListState } from "./resource-list-state.js";
import { Skeleton } from "../ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table.js";

export function DashboardIncidentsToday(): JSX.Element {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<IncidentRecord[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let isCancelled = false;

    setIsLoading(true);

    void (async () => {
      try {
        const todayWindow = getLocalDayWindow();
        const response = await listIncidents({
          limit: 100
        });

        if (!isCancelled) {
          const attentionToday = Array.isArray(response.incidents)
            ? response.incidents.filter((incident) => isIncidentAttentionToday(incident, todayWindow)).slice(0, 10)
            : [];
          setIncidents(attentionToday);
        }
      } catch {
        if (!isCancelled) {
          setIncidents([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [refreshToken]);

  return (
    <Card id="dashboard-incidents-today" className="min-w-0">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
          <div className="space-y-1.5">
            <CardTitle>Incidents today</CardTitle>
            <CardDescription>Incidents opened or regressed today across this workspace.</CardDescription>
          </div>
          <TableRefreshButton
            isLoading={isLoading}
            onRefresh={() => setRefreshToken((current) => current + 1)}
            mobileIconOnly
            className="shrink-0 sm:hidden"
          />
        </div>
        <div className="flex items-center gap-2">
          <TableRefreshButton
            isLoading={isLoading}
            onRefresh={() => setRefreshToken((current) => current + 1)}
            className="hidden sm:inline-flex"
          />
          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
            <Link to="/incidents">Open incidents</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ResourceListState
          items={incidents}
          loading={
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          }
          empty={
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SirenIcon />
                </EmptyMedia>
                <EmptyTitle>No incidents today</EmptyTitle>
                <EmptyDescription>Incidents opened or regressed today will appear here.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild type="button" variant="outline">
                  <Link to="/incidents">Open incidents</Link>
                </Button>
              </EmptyContent>
            </Empty>
          }
        >
          {() => (
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[28%]">Incident</TableHead>
                  <TableHead className="w-[13%]">Project</TableHead>
                  <TableHead className="w-[13%]">Service</TableHead>
                  <TableHead className="w-[12%]">Environment</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="whitespace-nowrap">Occurrences</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents?.map((incident) => (
                  <DashboardIncidentRow
                    key={incident.incident_id}
                    incident={incident}
                    onOpen={(event, item) => {
                      if (shouldIgnoreTableRowActivation(event.target)) {
                        return;
                      }

                      void navigate(`/incidents/${item.incident_id}`);
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </ResourceListState>
      </CardContent>
    </Card>
  );
}

function DashboardIncidentRow(input: {
  incident: IncidentRecord;
  onOpen: (event: MouseEvent<HTMLTableRowElement>, incident: IncidentRecord) => void;
}): JSX.Element {
  const { incident } = input;

  return (
    <TableRow className="cursor-pointer" onClick={(event) => input.onOpen(event, incident)}>
      <TableCell className="align-top whitespace-normal">
        <Link to={`/incidents/${incident.incident_id}`} className="font-medium text-foreground hover:underline" data-row-interactive="true">
          {incident.title}
        </Link>
        <p className="mt-1 text-xs text-muted-foreground whitespace-normal break-words">
          {formatIncidentMatchedFields(incident.matched_fields)}
        </p>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-middle">
        <Link to={`/projects/${incident.project_id}`} className="inline-flex items-center gap-2 hover:underline" data-row-interactive="true">
          <ProjectColorTagDot colorTag={incident.project_color_tag} />
          {incident.project_name}
        </Link>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-middle">
        {incident.service_name ?? "Unknown service"}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-middle">
        {incident.environment}
      </TableCell>
      <TableCell>
        <Badge variant={severityVariantMap[incident.severity]}>{incident.severity}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant={statusVariantMap[incident.status]}>{incident.status}</Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap">{incident.occurrence_count.toLocaleString()}</TableCell>
      <TableCell className="pr-3 text-right text-sm text-muted-foreground whitespace-nowrap">
        {new Date(incident.last_seen_at).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short"
        })}
      </TableCell>
    </TableRow>
  );
}

const severityVariantMap: Record<IncidentRecord["severity"], "secondary" | "warning" | "destructive"> = {
  low: "secondary",
  medium: "secondary",
  high: "warning",
  critical: "destructive"
};

const statusVariantMap: Record<IncidentRecord["status"], "secondary" | "warning" | "success"> = {
  open: "warning",
  resolved: "success",
  regressed: "secondary"
};
