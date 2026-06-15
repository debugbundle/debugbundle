import { ChevronRightIcon, SirenIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { CursorPaginationControls } from "../components/system/cursor-pagination-controls.js";
import { PageHeader } from "../components/system/page-header.js";
import { ResourceListState } from "../components/system/resource-list-state.js";
import {
  SelectableTableActions,
  StickyMobileTableActions,
  shouldIgnoreTableRowActivation,
  useVisibleRowSelection
} from "../components/system/selectable-table-actions.js";
import { SortableTableHead, toggleSort, type SortState } from "../components/system/sortable-table-head.js";
import { TableRefreshButton } from "../components/system/table-refresh-button.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../components/ui/empty.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { bulkReopenIncidents, bulkResolveIncidents, listIncidents, type IncidentRecord } from "../lib/api.js";
import { formatIncidentMatchedFields } from "../lib/incident-copy.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { useCursorPagination } from "../lib/use-cursor-pagination.js";

export function IncidentsPage(): JSX.Element {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<IncidentStatusFilter>("open");
  const [sort, setSort] = useState<SortState<IncidentSortField>>({
    field: "last_seen_at",
    direction: "desc"
  });
  const [bulkAction, setBulkAction] = useState<"resolved" | "unresolved" | null>(null);
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
  const selection = useVisibleRowSelection(useMemo(() => sortedIncidents.map((incident) => incident.incident_id), [sortedIncidents]));
  const selectedIncidents = useMemo(
    () => sortedIncidents.filter((incident) => selection.selectedIdSet.has(incident.incident_id)),
    [sortedIncidents, selection.selectedIdSet]
  );

  async function handleBulkIncidentAction(action: "resolved" | "unresolved"): Promise<void> {
    const incidentsToUpdate = selectedIncidents.filter((incident) =>
      action === "resolved" ? incident.status !== "resolved" : incident.status === "resolved"
    );

    if (incidentsToUpdate.length === 0) {
      return;
    }

    setBulkAction(action);

    try {
      const updatedIncidents =
        action === "resolved"
          ? await bulkResolveIncidents(incidentsToUpdate.map((incident) => incident.incident_id))
          : await bulkReopenIncidents(incidentsToUpdate.map((incident) => incident.incident_id));

      if (updatedIncidents.length > 0) {
        selection.clearSelection();
        await refreshPage();
      }

      showSuccessToast(`Marked ${updatedIncidents.length} incident${updatedIncidents.length === 1 ? "" : "s"} as ${action}.`);
    } catch {
      showErrorToast(`Could not mark the selected incidents as ${action}.`);
    } finally {
      setBulkAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader description="Grouped incident inventory across this workspace. Open any incident to view its debug bundle and reproduction artifacts." />

      <Card className="min-w-0">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
            <CardTitle>Incident inventory</CardTitle>
            <TableRefreshButton
              isLoading={isLoading}
              onRefresh={refreshPage}
              mobileIconOnly
              className="shrink-0 sm:hidden"
            />
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
            <TableRefreshButton isLoading={isLoading} onRefresh={refreshPage} className="hidden sm:inline-flex" />
            <label id="workspace-incidents-status-filter-label" htmlFor="workspace-incidents-status-filter" className="sr-only sm:not-sr-only sm:text-sm sm:font-medium sm:text-foreground">
              Status
            </label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as IncidentStatusFilter)}>
              <SelectTrigger
                id="workspace-incidents-status-filter"
                aria-labelledby="workspace-incidents-status-filter-label workspace-incidents-status-filter"
                className="w-full sm:w-fit sm:min-w-40"
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
        <CardContent className={selection.selectedCount > 0 ? "pb-28 sm:pb-6" : undefined}>
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
                <div className="hidden sm:block">
                  <SelectableTableActions
                    itemLabel="incident"
                    totalCount={sortedIncidents.length}
                    selectedCount={selection.selectedCount}
                    allSelected={selection.allSelected}
                    isBusy={bulkAction !== null}
                    primaryActionLabel={bulkAction === "resolved" ? "Marking resolved..." : "Mark selected resolved"}
                    secondaryActionLabel={bulkAction === "unresolved" ? "Marking unresolved..." : "Mark selected unresolved"}
                    primaryActionDisabled={selection.selectedCount === 0 || selectedIncidents.every((incident) => incident.status === "resolved")}
                    secondaryActionDisabled={selection.selectedCount === 0 || selectedIncidents.every((incident) => incident.status !== "resolved")}
                    onToggleSelectAll={selection.toggleSelectAll}
                    onClearSelection={selection.clearSelection}
                    onPrimaryAction={() => {
                      void handleBulkIncidentAction("resolved");
                    }}
                    onSecondaryAction={() => {
                      void handleBulkIncidentAction("unresolved");
                    }}
                  />
                </div>
                <Table className="min-w-[980px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <span className="sr-only">Select incidents</span>
                      </TableHead>
                      <SortableTableHead label="Incident" field="title" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} className="w-[28%]" />
                      <SortableTableHead label="Project" field="project_name" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} className="w-[13%]" />
                      <SortableTableHead label="Service" field="service_name" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} className="w-[13%]" />
                      <SortableTableHead label="Environment" field="environment" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} className="w-[12%]" />
                      <SortableTableHead label="Severity" field="severity" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} />
                      <SortableTableHead label="Status" field="status" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} />
                      <SortableTableHead label="Occurrences" field="occurrence_count" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} className="whitespace-nowrap" />
                      <SortableTableHead label="Last seen" field="last_seen_at" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} className="text-right whitespace-nowrap" align="right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedIncidents.map((incident) => (
                      <TableRow
                        key={incident.incident_id}
                        className="cursor-pointer"
                        data-state={selection.selectedIdSet.has(incident.incident_id) ? "selected" : undefined}
                        onClick={(event) => {
                          if (shouldIgnoreTableRowActivation(event.target)) {
                            return;
                          }

                          void navigate(`/incidents/${incident.incident_id}`);
                        }}
                      >
                        <TableCell className="align-middle" data-row-interactive="true">
                          <input
                            type="checkbox"
                            aria-label={`Select incident ${incident.title}`}
                            checked={selection.selectedIdSet.has(incident.incident_id)}
                            onChange={() => {
                              selection.toggleId(incident.incident_id);
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                          />
                        </TableCell>
                        <TableCell className="align-top whitespace-normal">
                          <Link to={`/incidents/${incident.incident_id}`} className="font-medium text-foreground hover:underline" data-row-interactive="true">
                            {incident.title}
                          </Link>
                          <p className="mt-1 text-xs text-muted-foreground whitespace-normal break-words">
                            {formatIncidentMatchedFields(incident.matched_fields)}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-middle">
                          <Link to={`/projects/${incident.project_id}`} className="hover:underline" data-row-interactive="true">
                            {incident.project_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-middle">
                          {formatServiceName(incident.service_name)}
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

      <StickyMobileTableActions
        selectedCount={selection.selectedCount}
        totalCount={sortedIncidents.length}
        allSelected={selection.allSelected}
        isBusy={bulkAction !== null}
        primaryActionLabel={bulkAction === "resolved" ? "Marking resolved..." : "Mark resolved"}
        secondaryActionLabel={bulkAction === "unresolved" ? "Marking unresolved..." : "Mark unresolved"}
        primaryActionDisabled={selection.selectedCount === 0 || selectedIncidents.every((incident) => incident.status === "resolved")}
        secondaryActionDisabled={selection.selectedCount === 0 || selectedIncidents.every((incident) => incident.status !== "resolved")}
        onToggleSelectAll={selection.toggleSelectAll}
        onClearSelection={selection.clearSelection}
        onPrimaryAction={() => {
          void handleBulkIncidentAction("resolved");
        }}
        onSecondaryAction={() => {
          void handleBulkIncidentAction("unresolved");
        }}
      />
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

type IncidentSortField = "title" | "project_name" | "service_name" | "environment" | "severity" | "status" | "occurrence_count" | "last_seen_at";
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
      case "environment":
        return left.environment.localeCompare(right.environment);
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
