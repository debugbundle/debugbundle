import { ActivityIcon, BugIcon, DownloadIcon, InboxIcon, PackageIcon, SirenIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { CursorPaginationControls } from "../components/system/cursor-pagination-controls.js";
import { ResourceListState } from "../components/system/resource-list-state.js";
import { SortableTableHead, toggleSort, type SortState } from "../components/system/sortable-table-head.js";
import type { ProjectContext } from "../components/system/project-layout.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../components/ui/empty.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import {
  getIncidentBundle,
  listProjectIncidents,
  type IncidentRecord,
  type ProjectRecord
} from "../lib/api.js";
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
          <CardDescription>Project identity and the default environment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DetailRow label="Slug" value={project.slug} />
          <DetailRow label="Project default environment" value={project.environment_default} />
          <DetailRow label="Created" value={formatDate(project.created_at)} />
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectStatCards({ project }: { project: ProjectRecord }): JSX.Element {
  const bundleRequests = project.metrics.monthly_bundle_requests;
  const rawEvents = project.metrics.monthly_raw_ingested_events;
  const retainedBundles = project.metrics.retained_bundles;
  const alertDeliveries = project.metrics.monthly_alert_deliveries;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription>Bundle Requests</CardDescription>
          <BugIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl tabular-nums">{bundleRequests.toLocaleString()}</CardTitle>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-xs">This month</Badge>
            Project-scoped generated bundles
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription>Ingested Events</CardDescription>
          <InboxIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl tabular-nums">{rawEvents.toLocaleString()}</CardTitle>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {rawEvents > 0 ? <TrendingUpIcon className="size-3" /> : <TrendingDownIcon className="size-3" />}
            Raw events ingested this month
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription>Retained Bundles</CardDescription>
          <ActivityIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl tabular-nums">{retainedBundles.toLocaleString()}</CardTitle>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-xs">Current</Badge>
            Distinct incidents with retained bundles
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription>Alert Deliveries</CardDescription>
          <ActivityIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl tabular-nums">{alertDeliveries.toLocaleString()}</CardTitle>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {alertDeliveries > 0 ? <TrendingUpIcon className="size-3" /> : <TrendingDownIcon className="size-3" />}
            Alert deliveries this month
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function ProjectIncidentsPage(): JSX.Element {
  const { projectId } = useOutletContext<ProjectContext>();
  const [statusFilter, setStatusFilter] = useState<ProjectIncidentStatusFilter>("open");
  const [sort, setSort] = useState<SortState<ProjectIncidentSortField>>({
    field: "last_seen_at",
    direction: "desc"
  });
  const { items: incidents, isLoading, page, hasNextPage, goToNextPage, goToPreviousPage } = useCursorPagination(
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

  return (
    <div className="space-y-4">
      <Card className="min-w-0">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Project incidents</CardTitle>
            <CardDescription>Grouped failures for this project.</CardDescription>
          </div>
          <div className="flex items-center gap-2 sm:justify-end">
            <label htmlFor="project-incidents-status-filter" className="text-sm font-medium text-foreground">
              Status
            </label>
            <select
              id="project-incidents-status-filter"
              className={filterSelectClassName}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.currentTarget.value as ProjectIncidentStatusFilter)}
            >
              {INCIDENT_STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
              </Empty>
            }
          >
            {() => (
              <div className="space-y-4">
                <IncidentTable incidents={sortedIncidents} sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} />
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
  const { items: incidents, isLoading, page, hasNextPage, goToNextPage, goToPreviousPage } = useCursorPagination(
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
          <div className="space-y-1.5">
            <CardTitle>Debug bundles</CardTitle>
            <CardDescription>
              Open or download bundles for incidents in this project.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 sm:justify-end">
            <label htmlFor="project-bundles-status-filter" className="text-sm font-medium text-foreground">
              Status
            </label>
            <select
              id="project-bundles-status-filter"
              className={filterSelectClassName}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.currentTarget.value as ProjectIncidentStatusFilter)}
            >
              {INCIDENT_STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
  onSortChange
}: {
  incidents: IncidentRecord[];
  sort: SortState<ProjectIncidentSortField>;
  onSortChange: (field: ProjectIncidentSortField) => void;
}): JSX.Element {
  return (
    <Table className="min-w-[760px] md:min-w-0 md:table-fixed">
      <TableHeader>
        <TableRow>
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
          <TableRow key={incident.incident_id}>
            <TableCell className="align-top whitespace-normal">
              <Link to={`/projects/${incident.project_id}/incidents/${incident.incident_id}`} className="font-medium text-foreground hover:underline">
                {incident.title}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground whitespace-normal break-words">{incident.matched_fields.join(", ")}</p>
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

const filterSelectClassName =
  "flex h-10 min-w-40 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60";

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
