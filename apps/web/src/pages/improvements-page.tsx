import { ChevronRightIcon, SparklesIcon } from "lucide-react";
import { useMemo, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { CursorPaginationControls } from "../components/system/cursor-pagination-controls.js";
import { HostedImprovementsUpgradeCallout } from "../components/system/hosted-improvements-upgrade-callout.js";
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
import { listImprovements, reopenImprovement, resolveImprovement, type ImprovementRecord } from "../lib/api.js";
import { showErrorToast, showInfoToast, showSuccessToast } from "../lib/notify.js";
import { runRateLimitedBulkAction } from "../lib/rate-limited-bulk-actions.js";
import { useCursorPagination } from "../lib/use-cursor-pagination.js";
import { useSession } from "../lib/session.js";

export function ImprovementsPage(): JSX.Element {
  const navigate = useNavigate();
  const { session } = useSession();
  const [statusFilter, setStatusFilter] = useState<ImprovementStatusFilter>("open");
  const [sort, setSort] = useState<SortState<ImprovementSortField>>({
    field: "last_detected_at",
    direction: "desc"
  });
  const [bulkAction, setBulkAction] = useState<"resolved" | "unresolved" | null>(null);
  const hostedImprovementsEnabled = session?.organization_plan === "solo" || session?.organization_plan === "team";
  const { items: improvements, isLoading, page, hasNextPage, goToNextPage, goToPreviousPage, refreshPage } = useCursorPagination(
    async (cursor) => {
      if (!hostedImprovementsEnabled) {
        return {
          items: [],
          nextCursor: null
        };
      }

      const response = await listImprovements({
        limit: 20,
        ...(cursor === null ? {} : { cursor }),
        ...(statusFilter === "all" ? {} : { status: statusFilter })
      });
      return {
        items: response.improvements,
        nextCursor: response.nextCursor
      };
    },
    [statusFilter, hostedImprovementsEnabled]
  );

  const sortedImprovements = useMemo(() => sortImprovements(improvements, sort), [improvements, sort]);
  const emptyState = getWorkspaceImprovementEmptyState(statusFilter);
  const selection = useVisibleRowSelection(useMemo(() => sortedImprovements.map((improvement) => improvement.improvement_id), [sortedImprovements]));
  const selectedImprovements = useMemo(
    () => sortedImprovements.filter((improvement) => selection.selectedIdSet.has(improvement.improvement_id)),
    [sortedImprovements, selection.selectedIdSet]
  );

  async function handleBulkImprovementAction(action: "resolved" | "unresolved"): Promise<void> {
    const improvementsToUpdate = selectedImprovements.filter((improvement) =>
      action === "resolved" ? improvement.status !== "resolved" : improvement.status !== "open"
    );

    if (improvementsToUpdate.length === 0) {
      return;
    }

    setBulkAction(action);

    try {
      const results = await runRateLimitedBulkAction({
        items: improvementsToUpdate,
        execute: (improvement) =>
          action === "resolved"
            ? resolveImprovement(improvement.improvement_id)
            : reopenImprovement(improvement.improvement_id)
      });
      const successCount = results.filter((result) => result.status === "fulfilled").length;

      if (successCount > 0) {
        selection.clearSelection();
        await refreshPage();
      }

      if (successCount === improvementsToUpdate.length) {
        showSuccessToast(`Marked ${successCount} improvement${successCount === 1 ? "" : "s"} as ${action}.`);
      } else if (successCount > 0) {
        showInfoToast(`Marked ${successCount} of ${improvementsToUpdate.length} improvements as ${action}.`);
      } else {
        showErrorToast(`Could not mark the selected improvements as ${action}.`);
      }
    } catch {
      showErrorToast(`Could not mark the selected improvements as ${action}.`);
    } finally {
      setBulkAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader description="Improvement opportunities across this workspace. Review deterministic hardening signals and open the generated bundle when one is available." />

      {!hostedImprovementsEnabled ? (
        <HostedImprovementsUpgradeCallout scope="workspace" />
      ) : (
        <Card className="min-w-0">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
              <CardTitle>Improvement inventory</CardTitle>
              <TableRefreshButton isLoading={isLoading} onRefresh={refreshPage} mobileIconOnly className="shrink-0 sm:hidden" />
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
              <TableRefreshButton isLoading={isLoading} onRefresh={refreshPage} className="hidden sm:inline-flex" />
              <label id="workspace-improvements-status-filter-label" htmlFor="workspace-improvements-status-filter" className="sr-only sm:not-sr-only sm:text-sm sm:font-medium sm:text-foreground">
                Status
              </label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ImprovementStatusFilter)}>
                <SelectTrigger
                  id="workspace-improvements-status-filter"
                  aria-labelledby="workspace-improvements-status-filter-label workspace-improvements-status-filter"
                  className="w-full sm:w-fit sm:min-w-40"
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
          <CardContent className={selection.selectedCount > 0 ? "pb-28 sm:pb-6" : undefined}>
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
                      itemLabel="improvement"
                      totalCount={sortedImprovements.length}
                      selectedCount={selection.selectedCount}
                      allSelected={selection.allSelected}
                      isBusy={bulkAction !== null}
                      primaryActionLabel={bulkAction === "resolved" ? "Marking resolved..." : "Mark selected resolved"}
                      secondaryActionLabel={bulkAction === "unresolved" ? "Marking unresolved..." : "Mark selected unresolved"}
                      primaryActionDisabled={selection.selectedCount === 0 || selectedImprovements.every((improvement) => improvement.status === "resolved")}
                      secondaryActionDisabled={selection.selectedCount === 0 || selectedImprovements.every((improvement) => improvement.status === "open")}
                      onToggleSelectAll={selection.toggleSelectAll}
                      onClearSelection={selection.clearSelection}
                      onPrimaryAction={() => {
                        void handleBulkImprovementAction("resolved");
                      }}
                      onSecondaryAction={() => {
                        void handleBulkImprovementAction("unresolved");
                      }}
                    />
                  </div>
                  <ImprovementsTable
                    improvements={sortedImprovements}
                    sort={sort}
                    onSortChange={(field) => setSort((current) => toggleSort(current, field))}
                    selectedImprovementIds={selection.selectedIdSet}
                    onToggleImprovementSelection={selection.toggleId}
                    onImprovementRowClick={(event, improvement) => {
                      if (shouldIgnoreTableRowActivation(event.target)) {
                        return;
                      }

                      void navigate(`/projects/${improvement.project_id}/improvements/${improvement.improvement_id}`);
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
      )}
      <StickyMobileTableActions
        selectedCount={selection.selectedCount}
        totalCount={sortedImprovements.length}
        allSelected={selection.allSelected}
        isBusy={bulkAction !== null}
        primaryActionLabel={bulkAction === "resolved" ? "Marking resolved..." : "Mark resolved"}
        secondaryActionLabel={bulkAction === "unresolved" ? "Marking unresolved..." : "Mark unresolved"}
        primaryActionDisabled={selection.selectedCount === 0 || selectedImprovements.every((improvement) => improvement.status === "resolved")}
        secondaryActionDisabled={selection.selectedCount === 0 || selectedImprovements.every((improvement) => improvement.status === "open")}
        onToggleSelectAll={selection.toggleSelectAll}
        onClearSelection={selection.clearSelection}
        onPrimaryAction={() => {
          void handleBulkImprovementAction("resolved");
        }}
        onSecondaryAction={() => {
          void handleBulkImprovementAction("unresolved");
        }}
      />
    </div>
  );
}

export function ImprovementsTable(input: {
  improvements: ImprovementRecord[];
  sort: SortState<ImprovementSortField>;
  onSortChange: (field: ImprovementSortField) => void;
  selectedImprovementIds: Set<string>;
  onToggleImprovementSelection: (improvementId: string) => void;
  onImprovementRowClick: (event: MouseEvent<HTMLTableRowElement>, improvement: ImprovementRecord) => void;
  projectScoped?: boolean;
}): JSX.Element {
  const {
    improvements,
    sort,
    onSortChange,
    selectedImprovementIds,
    onToggleImprovementSelection,
    onImprovementRowClick,
    projectScoped = false
  } = input;

  return (
    <Table className="min-w-[920px]">
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <span className="sr-only">Select improvements</span>
          </TableHead>
          <SortableTableHead label="Improvement" field="title" sort={sort} onSortChange={onSortChange} className="w-[30%]" />
          {!projectScoped ? (
            <SortableTableHead label="Project" field="project_name" sort={sort} onSortChange={onSortChange} className="w-[15%]" />
          ) : null}
          <SortableTableHead label="Service" field="service_name" sort={sort} onSortChange={onSortChange} className="w-[16%]" />
          <SortableTableHead label="Severity" field="severity" sort={sort} onSortChange={onSortChange} />
          <SortableTableHead label="Status" field="status" sort={sort} onSortChange={onSortChange} />
          <SortableTableHead label="Occurrences" field="occurrence_count" sort={sort} onSortChange={onSortChange} className="whitespace-nowrap" />
          <SortableTableHead label="Last detected" field="last_detected_at" sort={sort} onSortChange={onSortChange} className="text-right whitespace-nowrap" align="right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {improvements.map((improvement) => (
          <TableRow
            key={improvement.improvement_id}
            className="cursor-pointer"
            data-state={selectedImprovementIds.has(improvement.improvement_id) ? "selected" : undefined}
            onClick={(event) => {
              onImprovementRowClick(event, improvement);
            }}
          >
            <TableCell className="align-middle" data-row-interactive="true">
              <input
                type="checkbox"
                aria-label={`Select improvement ${improvement.title}`}
                checked={selectedImprovementIds.has(improvement.improvement_id)}
                onChange={() => {
                  onToggleImprovementSelection(improvement.improvement_id);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              />
            </TableCell>
            <TableCell className="align-top whitespace-normal">
              <Link
                to={projectScoped ? `/projects/${improvement.project_id}/improvements/${improvement.improvement_id}` : `/projects/${improvement.project_id}/improvements/${improvement.improvement_id}`}
                className="font-medium text-foreground hover:underline"
                data-row-interactive="true"
              >
                {improvement.title}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground whitespace-normal break-words">{improvement.summary}</p>
            </TableCell>
            {!projectScoped ? (
              <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-middle">
                <Link to={`/projects/${improvement.project_id}`} className="hover:underline" data-row-interactive="true">
                  {improvement.project_name}
                </Link>
              </TableCell>
            ) : null}
            <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-middle">
              {improvement.service_name}
            </TableCell>
            <TableCell>
              <Badge variant={severityVariantMap[improvement.severity]}>{improvement.severity}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariantMap[improvement.status]}>{improvement.status}</Badge>
            </TableCell>
            <TableCell className="whitespace-nowrap">{formatOccurrenceSummary(improvement.occurrence_count)}</TableCell>
            <TableCell className="pr-3 text-right text-sm text-muted-foreground whitespace-nowrap">{formatDate(improvement.last_detected_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export const severityVariantMap: Record<ImprovementRecord["severity"], "secondary" | "warning" | "destructive"> = {
  low: "secondary",
  medium: "secondary",
  high: "warning",
  critical: "destructive"
};

export const statusVariantMap: Record<ImprovementRecord["status"], "secondary" | "warning" | "success"> = {
  open: "warning",
  resolved: "success",
  snoozed: "secondary"
};

export function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatOccurrenceSummary(value: number): string {
  return `${value} signal${value === 1 ? "" : "s"}`;
}

type ImprovementSortField =
  | "title"
  | "project_name"
  | "service_name"
  | "severity"
  | "status"
  | "occurrence_count"
  | "last_detected_at";
type ImprovementStatusFilter = ImprovementRecord["status"] | "all";

const IMPROVEMENT_STATUS_FILTER_OPTIONS: Array<{ value: ImprovementStatusFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "all", label: "All statuses" },
  { value: "resolved", label: "Resolved" },
  { value: "snoozed", label: "Snoozed" }
];

function getWorkspaceImprovementEmptyState(statusFilter: ImprovementStatusFilter): { title: string; description: string } {
  switch (statusFilter) {
    case "open":
      return {
        title: "No open improvements",
        description: "Deterministic improvement opportunities will appear here once hosted analysis detects recurring warning or hardening signals."
      };
    case "resolved":
      return {
        title: "No resolved improvements",
        description: "Resolved improvement opportunities will appear here after hardening work has been reviewed and closed."
      };
    case "snoozed":
      return {
        title: "No snoozed improvements",
        description: "Snoozed improvement opportunities will appear here when recurring work is intentionally deferred."
      };
    case "all":
      return {
        title: "No improvements captured yet",
        description: "Improvement opportunities will appear here once hosted analysis has enough signal to generate them."
      };
  }
}

function sortImprovements(
  improvements: ImprovementRecord[] | null,
  sort: SortState<ImprovementSortField>
): ImprovementRecord[] {
  if (improvements === null) {
    return [];
  }

  const severityRank: Record<ImprovementRecord["severity"], number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3
  };
  const statusRank: Record<ImprovementRecord["status"], number> = {
    open: 0,
    snoozed: 1,
    resolved: 2
  };

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
}

export type { ImprovementSortField, ImprovementStatusFilter };
