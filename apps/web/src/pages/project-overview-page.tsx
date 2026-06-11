import { BellRingIcon, CalendarDaysIcon, DownloadIcon, PackageIcon, RotateCcwIcon, SirenIcon } from "lucide-react";
import { useMemo, useState, type MouseEvent } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";

import { CursorPaginationControls } from "../components/system/cursor-pagination-controls.js";
import { ProjectSetupSummaryGrid } from "../components/system/project-setup-summary-grid.js";
import { ResourceListState } from "../components/system/resource-list-state.js";
import {
  SelectableTableActions,
  StickyMobileTableActions,
  shouldIgnoreTableRowActivation,
  useVisibleRowSelection
} from "../components/system/selectable-table-actions.js";
import { SortableTableHead, toggleSort, type SortState } from "../components/system/sortable-table-head.js";
import { TableRefreshButton } from "../components/system/table-refresh-button.js";
import type { ProjectContext } from "../components/system/project-layout.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../components/ui/empty.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import {
  bulkReopenIncidents,
  bulkResolveIncidents,
  getIncidentBundle,
  listProjectIncidents,
  type IncidentRecord,
  type ProjectRecord
} from "../lib/api.js";
import { formatIncidentMatchedFields } from "../lib/incident-copy.js";
import { formatProjectRelationship, getProjectEffectiveRole, getProjectOwnerEmail, isSharedProject } from "../lib/project-access.js";
import { showErrorToast, showInfoToast, showSuccessToast } from "../lib/notify.js";
import { useCursorPagination } from "../lib/use-cursor-pagination.js";

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
        <CardContent className="space-y-4">
          <DetailRow label="Access" value={formatProjectRelationship(project)} />
          <DetailRow label="Your role" value={getProjectEffectiveRole(project)} />
          {isSharedProject(project) && getProjectOwnerEmail(project) !== null ? (
            <DetailRow label="Owner" value={getProjectOwnerEmail(project)!} />
          ) : null}
          <DetailRow label="Slug" value={project.slug} />
          <DetailRow label="Project default environment" value={project.environment_default} />
          <DetailRow label="Created" value={formatDate(project.created_at)} />

          <div className="space-y-4 border-t border-border/80 pt-4">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-foreground">Setup at a glance</h3>
              <p className="text-sm text-muted-foreground">
                Current counts and enabled states for the main automation and capture surfaces on this project.
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
  const openIncidents = project.metrics.open_incidents;
  const openedToday = project.metrics.opened_incidents_today;
  const openedMonth = project.metrics.opened_incidents_month;
  const regressedIncidents = project.metrics.regressed_incidents;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription>Open incidents</CardDescription>
          <SirenIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl tabular-nums">{openIncidents.toLocaleString()}</CardTitle>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-xs">Current</Badge>
            Unresolved incidents in this project
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription>New incidents today</CardDescription>
          <BellRingIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl tabular-nums">{openedToday.toLocaleString()}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Incidents first seen today in this project</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription>Opened this month</CardDescription>
          <CalendarDaysIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl tabular-nums">{openedMonth.toLocaleString()}</CardTitle>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-xs">This month</Badge>
            Incidents opened this month in this project
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription>Regressed incidents</CardDescription>
          <RotateCcwIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl tabular-nums">{regressedIncidents.toLocaleString()}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Current regressed incidents in this project</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function ProjectIncidentsPage(): JSX.Element {
  const navigate = useNavigate();
  const { projectId } = useOutletContext<ProjectContext>();
  const [statusFilter, setStatusFilter] = useState<ProjectIncidentStatusFilter>("open");
  const [sort, setSort] = useState<SortState<ProjectIncidentSortField>>({
    field: "last_seen_at",
    direction: "desc"
  });
  const [bulkAction, setBulkAction] = useState<"resolved" | "unresolved" | null>(null);
  const { items: incidents, isLoading, page, hasNextPage, goToNextPage, goToPreviousPage, refreshPage } = useCursorPagination(
    async (cursor) => {
      const response = await listProjectIncidents(projectId, 20, cursor ?? undefined, statusFilter === "all" ? undefined : statusFilter);
      return {
        items: response.incidents,
        nextCursor: response.nextCursor
      };
    },
    [projectId, statusFilter]
  );
  const sortedIncidents = useMemo(() => sortProjectIncidents(incidents, sort), [incidents, sort]);
  const emptyState = getProjectIncidentEmptyState(statusFilter);
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
    <div className="space-y-4">
      <Card className="min-w-0">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex w-full items-start justify-between gap-3 sm:block sm:w-auto">
            <div className="space-y-1.5">
              <CardTitle>Project incidents</CardTitle>
              <CardDescription>Grouped failures for this project.</CardDescription>
            </div>
            <TableRefreshButton isLoading={isLoading} onRefresh={() => void refreshPage()} mobileIconOnly className="shrink-0 sm:hidden" />
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
            <TableRefreshButton isLoading={isLoading} onRefresh={() => void refreshPage()} className="hidden sm:inline-flex" />
            <label id="project-incidents-status-filter-label" htmlFor="project-incidents-status-filter" className="sr-only sm:not-sr-only sm:text-sm sm:font-medium sm:text-foreground">
              Status
            </label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ProjectIncidentStatusFilter)}>
              <SelectTrigger
                id="project-incidents-status-filter"
                aria-labelledby="project-incidents-status-filter-label project-incidents-status-filter"
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
                <IncidentTable
                  incidents={sortedIncidents}
                  sort={sort}
                  onSortChange={(field) => setSort((current) => toggleSort(current, field))}
                  selectedIncidentIds={selection.selectedIdSet}
                  onToggleIncidentSelection={selection.toggleId}
                  onIncidentRowClick={(event, incident) => {
                    if (shouldIgnoreTableRowActivation(event.target)) {
                      return;
                    }

                    void navigate(`/projects/${incident.project_id}/incidents/${incident.incident_id}`);
                  }}
                />
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

      {incidents !== null && incidents.length > 0 ? (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => exportIncidentsAsCsv(incidents)}>
            Export incidents as CSV
          </Button>
        </div>
      ) : null}
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

export function ProjectBundlesPage(): JSX.Element {
  const { projectId } = useOutletContext<ProjectContext>();
  const [statusFilter, setStatusFilter] = useState<ProjectIncidentStatusFilter>("open");
  const [sort, setSort] = useState<SortState<ProjectBundleSortField>>({
    field: "last_seen_at",
    direction: "desc"
  });
  const { items: incidents, isLoading, page, hasNextPage, goToNextPage, goToPreviousPage, refreshPage } = useCursorPagination(
    async (cursor) => {
      const response = await listProjectIncidents(projectId, 20, cursor ?? undefined, statusFilter === "all" ? undefined : statusFilter);
      return {
        items: response.incidents,
        nextCursor: response.nextCursor
      };
    },
    [projectId, statusFilter]
  );
  const sortedIncidents = useMemo(() => sortProjectBundles(incidents, sort), [incidents, sort]);
  const emptyState = getProjectBundleEmptyState(statusFilter);

  return (
    <div className="space-y-4">
      <Card className="min-w-0">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex w-full items-start justify-between gap-3 sm:block sm:w-auto">
            <div className="space-y-1.5">
              <CardTitle>Debug bundles</CardTitle>
              <CardDescription>
                Open or download bundles for incidents in this project.
              </CardDescription>
            </div>
            <TableRefreshButton isLoading={isLoading} onRefresh={() => void refreshPage()} mobileIconOnly className="shrink-0 sm:hidden" />
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
            <TableRefreshButton isLoading={isLoading} onRefresh={() => void refreshPage()} className="hidden sm:inline-flex" />
            <label id="project-bundles-status-filter-label" htmlFor="project-bundles-status-filter" className="sr-only sm:not-sr-only sm:text-sm sm:font-medium sm:text-foreground">
              Status
            </label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ProjectIncidentStatusFilter)}>
              <SelectTrigger
                id="project-bundles-status-filter"
                aria-labelledby="project-bundles-status-filter-label project-bundles-status-filter"
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
                    <PackageIcon />
                  </EmptyMedia>
                  <EmptyTitle>{emptyState.title}</EmptyTitle>
                  <EmptyDescription>{emptyState.description}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            }
          >
              {() => (
                <div className="space-y-4">
              <Table className="min-w-[920px]">
                <TableHeader>
                  <TableRow>
                      <SortableTableHead label="Incident" field="title" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} />
                      <SortableTableHead label="Severity" field="severity" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} />
                      <SortableTableHead label="Status" field="status" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} />
                      <SortableTableHead label="Last seen" field="last_seen_at" sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} />
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedIncidents.map((incident) => (
                    <TableRow key={incident.incident_id}>
                      <TableCell>
                        <Link to={`/projects/${incident.project_id}/bundles/${incident.incident_id}`} className="font-medium text-foreground hover:underline">
                          {incident.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={severityVariantMap[incident.severity]}>{incident.severity}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariantMap[incident.status]}>{incident.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(incident.last_seen_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button asChild variant="ghost" size="sm">
                            <Link to={`/projects/${incident.project_id}/bundles/${incident.incident_id}`}>
                              View bundle
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => downloadBundle(incident.incident_id)}>
                            <DownloadIcon className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
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

export function IncidentTable({
  incidents,
  sort,
  onSortChange,
  selectedIncidentIds,
  onToggleIncidentSelection,
  onIncidentRowClick
}: {
  incidents: IncidentRecord[];
  sort: SortState<ProjectIncidentSortField>;
  onSortChange: (field: ProjectIncidentSortField) => void;
  selectedIncidentIds: Set<string>;
  onToggleIncidentSelection: (incidentId: string) => void;
  onIncidentRowClick: (event: MouseEvent<HTMLTableRowElement>, incident: IncidentRecord) => void;
}): JSX.Element {
  return (
    <Table className="min-w-[760px] md:min-w-0 md:table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <span className="sr-only">Select incidents</span>
          </TableHead>
          <SortableTableHead label="Incident" field="title" sort={sort} onSortChange={onSortChange} className="w-[34%]" />
          <SortableTableHead label="Service" field="service_name" sort={sort} onSortChange={onSortChange} className="w-[16%]" />
          <SortableTableHead label="Severity" field="severity" sort={sort} onSortChange={onSortChange} />
          <SortableTableHead label="Status" field="status" sort={sort} onSortChange={onSortChange} />
          <SortableTableHead label="Occurrences" field="occurrence_count" sort={sort} onSortChange={onSortChange} className="whitespace-nowrap" />
          <SortableTableHead label="Last seen" field="last_seen_at" sort={sort} onSortChange={onSortChange} className="text-right whitespace-nowrap" align="right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {incidents.map((incident) => (
          <TableRow
            key={incident.incident_id}
            className="cursor-pointer"
            data-state={selectedIncidentIds.has(incident.incident_id) ? "selected" : undefined}
            onClick={(event) => {
              onIncidentRowClick(event, incident);
            }}
          >
            <TableCell className="align-middle" data-row-interactive="true">
              <input
                type="checkbox"
                aria-label={`Select incident ${incident.title}`}
                checked={selectedIncidentIds.has(incident.incident_id)}
                onChange={() => {
                  onToggleIncidentSelection(incident.incident_id);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              />
            </TableCell>
            <TableCell className="align-top whitespace-normal">
              <Link
                to={`/projects/${incident.project_id}/incidents/${incident.incident_id}`}
                className="font-medium text-foreground hover:underline"
                data-row-interactive="true"
              >
                {incident.title}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground whitespace-normal break-words">
                {formatIncidentMatchedFields(incident.matched_fields)}
              </p>
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
            <TableCell className="whitespace-nowrap">{incident.occurrence_count}</TableCell>
            <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap">{formatDate(incident.last_seen_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatServiceName(value: string | null): string {
  return value ?? "Unknown service";
}

type ProjectIncidentSortField = "title" | "service_name" | "severity" | "status" | "occurrence_count" | "last_seen_at";
type ProjectBundleSortField = "title" | "severity" | "status" | "last_seen_at";
type ProjectIncidentStatusFilter = IncidentRecord["status"] | "all";

const INCIDENT_STATUS_FILTER_OPTIONS: Array<{ value: ProjectIncidentStatusFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "all", label: "All statuses" },
  { value: "resolved", label: "Resolved" },
  { value: "regressed", label: "Regressed" }
];

function getProjectIncidentEmptyState(statusFilter: ProjectIncidentStatusFilter): { title: string; description: string } {
  switch (statusFilter) {
    case "open":
      return {
        title: "No open incidents for this project",
        description: "Open incidents will appear here once the SDK starts sending grouped failures for this project."
      };
    case "resolved":
      return {
        title: "No resolved incidents for this project",
        description: "Resolved incidents will appear here after this project’s grouped failures have been reviewed and marked resolved."
      };
    case "regressed":
      return {
        title: "No regressed incidents for this project",
        description: "Regressed incidents will appear here when a resolved issue starts happening again in this project."
      };
    case "all":
      return {
        title: "No incidents for this project",
        description: "Incidents will appear here once the SDK starts sending events for this project."
      };
  }
}

function getProjectBundleEmptyState(statusFilter: ProjectIncidentStatusFilter): { title: string; description: string } {
  switch (statusFilter) {
    case "open":
      return {
        title: "No bundles for open incidents",
        description: "Bundles for open incidents will appear here once this project has processed grouped failures."
      };
    case "resolved":
      return {
        title: "No bundles for resolved incidents",
        description: "Bundles for resolved incidents will appear here after this project’s incidents have been processed and marked resolved."
      };
    case "regressed":
      return {
        title: "No bundles for regressed incidents",
        description: "Bundles for regressed incidents will appear here when a resolved issue starts happening again in this project."
      };
    case "all":
      return {
        title: "No bundles available",
        description: "Bundles are generated when incidents are processed. Start sending events to see bundles here."
      };
  }
}

function sortProjectIncidents(incidents: IncidentRecord[] | null, sort: SortState<ProjectIncidentSortField>): IncidentRecord[] {
  if (incidents === null) {
    return [];
  }

  const sorted = [...incidents].sort((left, right) => compareIncidentLike(left, right, sort.field));
  return sort.direction === "asc" ? sorted : sorted.reverse();
}

function sortProjectBundles(incidents: IncidentRecord[] | null, sort: SortState<ProjectBundleSortField>): IncidentRecord[] {
  if (incidents === null) {
    return [];
  }

  const sorted = [...incidents].sort((left, right) => compareIncidentLike(left, right, sort.field));
  return sort.direction === "asc" ? sorted : sorted.reverse();
}

function compareIncidentLike(
  left: IncidentRecord,
  right: IncidentRecord,
  field: ProjectIncidentSortField | ProjectBundleSortField
): number {
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

  switch (field) {
    case "title":
      return left.title.localeCompare(right.title);
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
}

function DetailRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function downloadBundle(incidentId: string): void {
  void getIncidentBundle(incidentId)
    .then((result) => {
      switch (result.status) {
        case "pending":
          showInfoToast("Bundle is still processing. Try again shortly.");
          return;
        case "failed":
          showErrorToast("Bundle generation failed. The artifact is not available for download.");
          return;
        case "ready":
          break;
      }

      const blob = new Blob([JSON.stringify(result.bundle, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `bundle-${incidentId}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      showSuccessToast(`bundle-${incidentId}.json downloaded successfully.`);
    })
    .catch(() => {
      showErrorToast("Failed to download bundle.");
    });
}

function exportIncidentsAsCsv(incidents: IncidentRecord[]): void {
  const headers = ["incident_id", "title", "project_id", "service_id", "severity", "status", "environment", "occurrence_count", "first_seen_at", "last_seen_at"];
  const rows = incidents.map((i) =>
    [i.incident_id, `"${i.title.replace(/"/g, '""')}"`, i.project_id, i.service_id, i.severity, i.status, i.environment, String(i.occurrence_count), i.first_seen_at, i.last_seen_at].join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "incidents-export.csv";
  a.click();
  URL.revokeObjectURL(a.href);
  showSuccessToast("Incidents exported successfully.");
}
