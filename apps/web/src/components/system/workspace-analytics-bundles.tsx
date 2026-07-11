import { PackageIcon } from "lucide-react";
import { useState } from "react";

import {
  listAnalyticsBundles,
  type AnalyticsBundleInventoryQuery,
  type ProjectRecord
} from "../../lib/api.js";
import { useCursorPagination } from "../../lib/use-cursor-pagination.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty.js";
import { Notice } from "../ui/notice.js";
import { Skeleton } from "../ui/skeleton.js";
import { AnalyticsBundlesTable } from "./analytics-bundles-table.js";
import { CursorPaginationControls } from "./cursor-pagination-controls.js";
import { ResourceListState } from "./resource-list-state.js";
import { TableRefreshButton } from "./table-refresh-button.js";
import {
  createWorkspaceAnalyticsFilters,
  toAnalyticsDateEnd,
  toAnalyticsDateStart,
  WorkspaceAnalyticsFilters,
  type WorkspaceAnalyticsFilterValues
} from "./workspace-analytics-filters.js";

export function WorkspaceAnalyticsBundles({
  projects
}: {
  projects: ProjectRecord[];
}): JSX.Element {
  const [draftFilters, setDraftFilters] = useState(() =>
    createWorkspaceAnalyticsFilters("bundles")
  );
  const [filters, setFilters] = useState(draftFilters);
  const pagination = useCursorPagination(
    async (cursor) => {
      const response = await listAnalyticsBundles(buildBundleQuery(filters, cursor));
      return { items: response.bundles, nextCursor: response.next_cursor };
    },
    [filters]
  );

  function resetFilters(): void {
    const nextFilters = createWorkspaceAnalyticsFilters("bundles");
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
  }

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Generated AnalyticsBundles</CardTitle>
          <TableRefreshButton
            isLoading={pagination.isLoading}
            label="Refresh AnalyticsBundles"
            onRefresh={pagination.refreshPage}
          />
        </div>
        <WorkspaceAnalyticsFilters
          mode="bundles"
          projects={projects}
          value={draftFilters}
          onChange={setDraftFilters}
          onApply={() => setFilters(normalizeFilters(draftFilters))}
          onReset={resetFilters}
        />
      </CardHeader>
      <CardContent>
        {pagination.hasError ? (
          <Notice title="Could not load AnalyticsBundles" tone="destructive">
            <div className="flex flex-col items-start gap-2">
              <p>The cross-project AnalyticsBundle inventory is temporarily unavailable.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void pagination.refreshPage()}
              >
                Retry AnalyticsBundles
              </Button>
            </div>
          </Notice>
        ) : (
          <ResourceListState
            items={pagination.items}
            loading={<InventorySkeleton />}
            empty={
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PackageIcon />
                  </EmptyMedia>
                  <EmptyTitle>No AnalyticsBundles match these filters</EmptyTitle>
                  <EmptyDescription>
                    Generated, pending, and failed analysis artifacts will appear here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            }
          >
            {(bundles) => (
              <div className="flex flex-col gap-4">
                <AnalyticsBundlesTable bundles={bundles} />
                <CursorPaginationControls
                  page={pagination.page}
                  hasNextPage={pagination.hasNextPage}
                  isLoading={pagination.isLoading}
                  onPreviousPage={pagination.goToPreviousPage}
                  onNextPage={() => void pagination.goToNextPage()}
                />
              </div>
            )}
          </ResourceListState>
        )}
      </CardContent>
    </Card>
  );
}

function buildBundleQuery(
  filters: WorkspaceAnalyticsFilterValues,
  cursor: string | null
): AnalyticsBundleInventoryQuery {
  const from = toAnalyticsDateStart(filters.from);
  const to = toAnalyticsDateEnd(filters.to);
  return {
    limit: 20,
    status: filters.status as Exclude<AnalyticsBundleInventoryQuery["status"], undefined>,
    ...(filters.projectId === "all" ? {} : { projectId: filters.projectId }),
    ...(filters.kind === "all"
      ? {}
      : { kind: filters.kind as Exclude<AnalyticsBundleInventoryQuery["kind"], undefined> }),
    ...(filters.service.length === 0 ? {} : { service: filters.service }),
    ...(filters.environment.length === 0 ? {} : { environment: filters.environment }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(cursor === null ? {} : { cursor })
  };
}

function normalizeFilters(filters: WorkspaceAnalyticsFilterValues): WorkspaceAnalyticsFilterValues {
  return {
    ...filters,
    service: filters.service.trim(),
    environment: filters.environment.trim()
  };
}

function InventorySkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-3" aria-label="Loading AnalyticsBundles">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
