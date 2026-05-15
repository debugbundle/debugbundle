import { ChevronRightIcon, SirenIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { CursorPaginationControls } from "../components/system/cursor-pagination-controls.js";
import { PageHeader } from "../components/system/page-header.js";
import { ResourceListState } from "../components/system/resource-list-state.js";
import { SortableTableHead, toggleSort, type SortState } from "../components/system/sortable-table-head.js";
import { TableRefreshButton } from "../components/system/table-refresh-button.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../components/ui/empty.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../components/ui/table.js";
import { listIncidents, type IncidentRecord } from "../lib/api.js";
import { formatIncidentMatchedFields } from "../lib/incident-copy.js";
import { useCursorPagination } from "../lib/use-cursor-pagination.js";

export function IncidentsPage(): JSX.Element {
  const [statusFilter, setStatusFilter] = useState<IncidentStatusFilter>("open");
  const [sort, setSort] = useState<SortState<IncidentSortField>>({
    field: "last_seen_at",
    direction: "desc"
  });
  const { items: incidents, isLoading, page, hasNextPage, goToNextPage, goToPreviousPage, refreshPage } = useCursorPagination(
    async (cursor) => {
      const response = await listIncidents({
        limit: 20,
        ...(cursor === null ? {} : { cursor }),
        ...(statusFilter === "all" ? {} : { status: statusFilter })
      });
      return {
        items: response.incidents,
        nextCursor: response.nextCursor
      };
    },
    [statusFilter]
  );

  const sortedIncidents = useMemo(() => sortIncidents(incidents, sort), [incidents, sort]);
  const emptyState = getWorkspaceIncidentEmptyState(statusFilter);

  return (
    <div className="space-y-6">
      <PageHeader description="Grouped incident inventory across this workspace. Open any incident to view its debug bundle and reproduction artifacts." />

      <Card className="min-w-0">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Incident inventory</CardTitle>
          <div className="flex items-center gap-2 sm:justify-end">
            <TableRefreshButton isLoading={isLoading} onRefresh={refreshPage} />
            <label id="workspace-incidents-status-filter-label" htmlFor="workspace-incidents-status-filter" className="text-sm font-medium text-foreground">
              Status
            </label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as IncidentStatusFilter)}>
              <SelectTrigger
                id="workspace-incidents-status-filter"
                aria-labelledby="workspace-incidents-status-filter-label workspace-incidents-status-filter"
                className="min-w-40"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {INCIDENT_STATUS_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
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
                  <EmptyTitle>{emptyState.title}</EmptyTitle>
                  <EmptyDescription>{emptyState.description}</EmptyDescription>
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
            {() => (
              <div className="space-y-4">
                <Table className="min-w-[860px]">
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead label="Incident" field="title" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} className="w-[28%]" />
                      <SortableTableHead label="Project" field="project_name" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} className="w-[13%]" />
                      <SortableTableHead label="Service" field="service_name" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} className="w-[13%]" />
                      <SortableTableHead label="Severity" field="severity" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} />
                      <SortableTableHead label="Status" field="status" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} />
                      <SortableTableHead label="Occurrences" field="occurrence_count" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} className="whitespace-nowrap" />
                      <SortableTableHead label="Last seen" field="last_seen_at" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} className="text-right whitespace-nowrap" align="right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedIncidents.map((incident) => (
                      <TableRow key={incident.incident_id} className="cursor-pointer">
                        <TableCell className="align-top whitespace-normal">
                          <Link to={`/incidents/${incident.incident_id}`} className="font-medium text-foreground hover:underline">
                            {incident.title}
                          </Link>
                          <p className="mt-1 text-xs text-muted-foreground whitespace-normal break-words">
                            {formatIncidentMatchedFields(incident.matched_fields)}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-middle">
                          <Link to={`/projects/${incident.project_id}`} className="hover:underline">
                            {incident.project_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-middle">
                          {formatServiceName(incident.service_name)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={severityVariantMap[incident.severity]}>{incident.severity}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariantMap[incident.status]}>{incident.status}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatOccurrenceSummary(incident.occurrence_count)}</TableCell>
                        <TableCell className="pr-3 text-right text-sm text-muted-foreground whitespace-nowrap">{formatDate(incident.last_seen_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <CursorPaginationControls
                  page={page}
                  hasNextPage={hasNextPage}
                  isLoading={isLoading}
                  onPreviousPage={goToPreviousPage}
                  onNextPage={() => void goToNextPage()}
                />
              </div>
            )}
          </ResourceListState>
        </CardContent>
      </Card>
    </div>
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

function formatOccurrenceSummary(value: number): string {
  return `${value} occurrence${value === 1 ? "" : "s"}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatServiceName(value: string | null): string {
  return value ?? "Unknown service";
}

type IncidentSortField = "title" | "project_name" | "service_name" | "severity" | "status" | "occurrence_count" | "last_seen_at";
type IncidentStatusFilter = IncidentRecord["status"] | "all";

const INCIDENT_STATUS_FILTER_OPTIONS: Array<{ value: IncidentStatusFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "all", label: "All statuses" },
  { value: "resolved", label: "Resolved" },
  { value: "regressed", label: "Regressed" }
];

function getWorkspaceIncidentEmptyState(statusFilter: IncidentStatusFilter): { title: string; description: string } {
  switch (statusFilter) {
    case "open":
      return {
        title: "No open incidents",
        description: "Incoming open incidents will appear here once grouped failures are available for this workspace."
      };
    case "resolved":
      return {
        title: "No resolved incidents",
        description: "Resolved incidents will appear here after grouped failures have been reviewed and marked resolved."
      };
    case "regressed":
      return {
        title: "No regressed incidents",
        description: "Regressed incidents will appear here when a resolved issue starts happening again."
      };
    case "all":
      return {
        title: "No incidents captured yet",
        description: "Incoming incidents will appear here once grouped failures are available for this workspace."
      };
  }
}

function sortIncidents(incidents: IncidentRecord[] | null, sort: SortState<IncidentSortField>): IncidentRecord[] {
  if (incidents === null) {
    return [];
  }

  const severityRank: Record<IncidentRecord["severity"], number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3
  };
  const statusRank: Record<IncidentRecord["status"], number> = {
    open: 0,
    regressed: 1,
    resolved: 2
  };

  const sorted = [...incidents].sort((left, right) => {
    switch (sort.field) {
      case "title":
        return left.title.localeCompare(right.title);
      case "project_name":
        return left.project_name.localeCompare(right.project_name);
      case "service_name":
        return formatServiceName(left.service_name).localeCompare(formatServiceName(right.service_name));
      case "severity":
        return severityRank[left.severity] - severityRank[right.severity];
      case "status":
        return statusRank[left.status] - statusRank[right.status];
      case "occurrence_count":
        return left.occurrence_count - right.occurrence_count;
      case "last_seen_at":
        return new Date(left.last_seen_at).getTime() - new Date(right.last_seen_at).getTime();
      default:
        return 0;
    }
  });

  return sort.direction === "asc" ? sorted : sorted.reverse();
}
