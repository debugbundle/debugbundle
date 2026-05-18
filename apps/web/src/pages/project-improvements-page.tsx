import { SparklesIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { CursorPaginationControls } from "../components/system/cursor-pagination-controls.js";
import { HostedImprovementsUpgradeCallout } from "../components/system/hosted-improvements-upgrade-callout.js";
import { ResourceListState } from "../components/system/resource-list-state.js";
import { toggleSort, type SortState } from "../components/system/sortable-table-head.js";
import { TableRefreshButton } from "../components/system/table-refresh-button.js";
import type { ProjectContext } from "../components/system/project-layout.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../components/ui/empty.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { listProjectImprovements } from "../lib/api.js";
import { useCursorPagination } from "../lib/use-cursor-pagination.js";
import {
  ImprovementsTable,
  type ImprovementSortField,
  type ImprovementStatusFilter
} from "./improvements-page.js";

const IMPROVEMENT_STATUS_FILTER_OPTIONS: Array<{ value: ImprovementStatusFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "all", label: "All statuses" },
  { value: "resolved", label: "Resolved" },
  { value: "snoozed", label: "Snoozed" }
];

export function ProjectImprovementsPage(): JSX.Element {
  const { project, projectId } = useOutletContext<ProjectContext>();
  const [statusFilter, setStatusFilter] = useState<ImprovementStatusFilter>("open");
  const [sort, setSort] = useState<SortState<ImprovementSortField>>({
    field: "last_detected_at",
    direction: "desc"
  });
  const hostedImprovementsEnabled = project.organization_plan !== "free";
  const { items: improvements, isLoading, page, hasNextPage, goToNextPage, goToPreviousPage, refreshPage } = useCursorPagination(
    async (cursor) => {
      if (!hostedImprovementsEnabled) {
        return {
          items: [],
          nextCursor: null
        };
      }

      const response = await listProjectImprovements(projectId, 20, cursor ?? undefined, statusFilter === "all" ? undefined : statusFilter);
      return {
        items: response.improvements,
        nextCursor: response.nextCursor
      };
    },
    [projectId, statusFilter, hostedImprovementsEnabled]
  );

  const sortedImprovements = useMemo(() => {
    if (improvements === null) {
      return [];
    }

    const severityRank = { low: 0, medium: 1, high: 2, critical: 3 } as const;
    const statusRank = { open: 0, snoozed: 1, resolved: 2 } as const;
    const sorted = [...improvements].sort((left, right) => {
      switch (sort.field) {
        case "title":
          return left.title.localeCompare(right.title);
        case "project_name":
          return left.project_name.localeCompare(right.project_name);
        case "service_name":
          return left.service_name.localeCompare(right.service_name);
        case "severity":
          return severityRank[left.severity] - severityRank[right.severity];
        case "status":
          return statusRank[left.status] - statusRank[right.status];
        case "occurrence_count":
          return left.occurrence_count - right.occurrence_count;
        case "last_detected_at":
          return new Date(left.last_detected_at).getTime() - new Date(right.last_detected_at).getTime();
      }
    });

    return sort.direction === "asc" ? sorted : sorted.reverse();
  }, [improvements, sort]);

  return (
    <div className="space-y-4">
      {!hostedImprovementsEnabled ? (
        <HostedImprovementsUpgradeCallout scope="project" />
      ) : (
        <Card className="min-w-0">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle>Project improvements</CardTitle>
              <CardDescription>Deterministic improvement opportunities for this project.</CardDescription>
            </div>
            <div className="flex items-center gap-2 sm:justify-end">
              <TableRefreshButton isLoading={isLoading} onRefresh={() => void refreshPage()} />
              <label id="project-improvements-status-filter-label" htmlFor="project-improvements-status-filter" className="text-sm font-medium text-foreground">
                Status
              </label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ImprovementStatusFilter)}>
                <SelectTrigger
                  id="project-improvements-status-filter"
                  aria-labelledby="project-improvements-status-filter-label project-improvements-status-filter"
                  className="min-w-40"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {IMPROVEMENT_STATUS_FILTER_OPTIONS.map((option) => (
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
              items={improvements}
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
                      <SparklesIcon />
                    </EmptyMedia>
                    <EmptyTitle>No improvements for this filter</EmptyTitle>
                    <EmptyDescription>Improvement opportunities will appear here when hosted analysis has enough signal for this project.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              }
            >
              {() => (
                <div className="space-y-4">
                  <ImprovementsTable improvements={sortedImprovements} sort={sort} onSortChange={(field) => setSort((current) => toggleSort(current, field))} projectScoped />
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
      )}
    </div>
  );
}
