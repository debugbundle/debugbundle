import { PackageIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { AnalyticsBundlesTable } from "../components/system/analytics-bundles-table.js";
import {
  WorkspaceAnalyticsFilters,
  createWorkspaceAnalyticsFilters
} from "../components/system/workspace-analytics-filters.js";
import { BoundedListLimit } from "../components/system/bounded-list-limit.js";
import type { AnalyticsBundleInventoryQuery } from "../lib/api.js";
import { AnalyticsSectionHeader } from "../components/system/analytics-section-header.js";
import { CursorPaginationControls } from "../components/system/cursor-pagination-controls.js";
import { ResourceListState } from "../components/system/resource-list-state.js";
import { Button } from "../components/ui/button.js";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "../components/ui/empty.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { listAnalyticsBundles } from "../lib/api.js";
import { useCursorPagination } from "../lib/use-cursor-pagination.js";
import type { ProjectAnalyticsContext } from "./project-analytics-layout.js";

import { analyticsInventoryWindow } from "../lib/analytics-filter-form.js";

export function ProjectAnalyticsBundlesPage(): JSX.Element {
  const { projectId, query } = useOutletContext<ProjectAnalyticsContext>();
  const [draftFilters, setDraftFilters] = useState(() => ({
    ...createWorkspaceAnalyticsFilters("bundles"),
    status: "all"
  }));
  const [filters, setFilters] = useState(draftFilters);
  const [limit, setLimit] = useState(20);
  const queryKey = JSON.stringify(query);
  const window = useMemo(() => analyticsInventoryWindow(query), [queryKey]);
  const pagination = useCursorPagination(
    async (cursor) => {
      const response = await listAnalyticsBundles({
        projectId,
        status: filters.status as NonNullable<AnalyticsBundleInventoryQuery["status"]>,
        limit,
        ...(filters.kind === "all"
          ? {}
          : { kind: filters.kind as NonNullable<AnalyticsBundleInventoryQuery["kind"]> }),
        from: window.from,
        to: window.to,
        ...(query.service === undefined ? {} : { service: query.service }),
        ...(query.environment === undefined ? {} : { environment: query.environment }),
        ...(cursor === null ? {} : { cursor })
      });
      return {
        items: response.bundles,
        nextCursor: response.next_cursor,
        totalPages: response.total_pages
      };
    },
    [projectId, queryKey, window, filters, limit]
  );

  return (
    <div className="flex flex-col gap-6">
      <AnalyticsSectionHeader
        title="Generated analytics bundles"
        description="Review ready analysis artifacts and track generations still being processed."
        isLoading={pagination.isLoading}
        onRefresh={pagination.refreshPage}
        actions={
          <Button asChild>
            <Link to={`/projects/${projectId}/analytics/bundles/new`}>
              <PlusIcon data-icon="inline-start" />
              Generate analytics bundle
            </Link>
          </Button>
        }
      />
      <WorkspaceAnalyticsFilters
        mode="bundles"
        fixedScope
        projects={[]}
        value={draftFilters}
        activeFilterCount={[filters.status, filters.kind].filter((value) => value !== "all").length}
        onChange={setDraftFilters}
        onApply={() => setFilters(draftFilters)}
        onReset={() => {
          const defaults = { ...createWorkspaceAnalyticsFilters("bundles"), status: "all" };
          setFilters(defaults);
          setDraftFilters(defaults);
        }}
        onDismiss={() => setDraftFilters(filters)}
      />
      <BoundedListLimit
        id="analytics-bundles-limit"
        label="Inventory page limit"
        paginated
        value={limit}
        onChange={setLimit}
        disabled={pagination.isLoading}
      />
      {pagination.hasError ? (
        <Notice title="Could not load project analytics bundles" tone="destructive">
          <div className="flex flex-col items-start gap-2">
            <p>The project analytics bundle inventory is temporarily unavailable.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void pagination.refreshPage()}
            >
              Retry project analytics bundles
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
                <EmptyTitle>No analytics bundles in this project</EmptyTitle>
                <EmptyDescription>
                  Generated, pending, and failed analysis artifacts in this window will appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
        >
          {(bundles) => (
            <div className="flex flex-col gap-4">
              <AnalyticsBundlesTable
                bundles={bundles}
                ariaLabel="Project analytics bundles"
                showProject={false}
              />
              <CursorPaginationControls
                page={pagination.page}
                totalPages={pagination.totalPages}
                hasNextPage={pagination.hasNextPage}
                isLoading={pagination.isLoading}
                onPreviousPage={pagination.goToPreviousPage}
                onNextPage={() => void pagination.goToNextPage()}
              />
            </div>
          )}
        </ResourceListState>
      )}
    </div>
  );
}

function InventorySkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-3" aria-label="Loading project analytics bundles">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
