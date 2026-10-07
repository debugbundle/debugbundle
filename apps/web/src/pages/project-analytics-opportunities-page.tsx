import { LightbulbIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { AnalyticsOpportunitiesTable } from "../components/system/analytics-opportunities-table.js";
import {
  WorkspaceAnalyticsFilters,
  createWorkspaceAnalyticsFilters
} from "../components/system/workspace-analytics-filters.js";
import { BoundedListLimit } from "../components/system/bounded-list-limit.js";
import type { AnalyticsOpportunityInventoryQuery } from "../lib/api.js";
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
import { listAnalyticsOpportunities } from "../lib/api.js";
import { useCursorPagination } from "../lib/use-cursor-pagination.js";
import type { ProjectAnalyticsContext } from "./project-analytics-layout.js";

import { analyticsInventoryWindow } from "../lib/analytics-filter-form.js";

export function ProjectAnalyticsOpportunitiesPage(): JSX.Element {
  const { projectId, query } = useOutletContext<ProjectAnalyticsContext>();
  const [draftFilters, setDraftFilters] = useState(() => ({
    ...createWorkspaceAnalyticsFilters("opportunities"),
    status: "all"
  }));
  const [filters, setFilters] = useState(draftFilters);
  const [limit, setLimit] = useState(20);
  const queryKey = JSON.stringify(query);
  const detectedWindow = useMemo(() => analyticsInventoryWindow(query), [queryKey]);
  const pagination = useCursorPagination(
    async (cursor) => {
      const response = await listAnalyticsOpportunities({
        projectId,
        status: filters.status as NonNullable<AnalyticsOpportunityInventoryQuery["status"]>,
        limit,
        ...(filters.severity === "all"
          ? {}
          : {
              severity: filters.severity as NonNullable<
                AnalyticsOpportunityInventoryQuery["severity"]
              >
            }),
        ...(filters.bundleStatus === "all"
          ? {}
          : {
              bundleStatus: filters.bundleStatus as NonNullable<
                AnalyticsOpportunityInventoryQuery["bundleStatus"]
              >
            }),
        ...(filters.kind === "all"
          ? {}
          : { kind: filters.kind as NonNullable<AnalyticsOpportunityInventoryQuery["kind"]> }),
        from: detectedWindow.from,
        to: detectedWindow.to,
        ...(query.service === undefined ? {} : { service: query.service }),
        ...(query.environment === undefined ? {} : { environment: query.environment }),
        ...(cursor === null ? {} : { cursor })
      });
      return {
        items: response.opportunities,
        nextCursor: response.next_cursor,
        totalPages: response.total_pages
      };
    },
    [projectId, queryKey, detectedWindow, filters, limit]
  );

  return (
    <div className="flex flex-col gap-6">
      <AnalyticsSectionHeader
        title="Analytics opportunities"
        description="Review deterministic improvement signals found in aggregate product usage."
        isLoading={pagination.isLoading}
        onRefresh={pagination.refreshPage}
      />

      <WorkspaceAnalyticsFilters
        mode="opportunities"
        fixedScope
        projects={[]}
        value={draftFilters}
        activeFilterCount={
          [filters.status, filters.kind, filters.severity, filters.bundleStatus].filter(
            (value) => value !== "all"
          ).length
        }
        onChange={setDraftFilters}
        onApply={() => setFilters(draftFilters)}
        onReset={() => {
          const defaults = { ...createWorkspaceAnalyticsFilters("opportunities"), status: "all" };
          setFilters(defaults);
          setDraftFilters(defaults);
        }}
        onDismiss={() => setDraftFilters(filters)}
      />
      <BoundedListLimit
        id="analytics-opportunities-limit"
        label="Inventory page limit"
        paginated
        value={limit}
        onChange={setLimit}
        disabled={pagination.isLoading}
      />
      {pagination.hasError ? (
        <Notice title="Could not load project analytics opportunities" tone="destructive">
          <div className="flex flex-col items-start gap-2">
            <p>The project opportunity inventory is temporarily unavailable.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void pagination.refreshPage()}
            >
              Retry project analytics opportunities
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
                  <LightbulbIcon />
                </EmptyMedia>
                <EmptyTitle>No analytics opportunities in this project</EmptyTitle>
                <EmptyDescription>
                  Opportunities appear when aggregate behavior crosses a supported analysis
                  threshold in the selected window.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
        >
          {(opportunities) => (
            <div className="flex flex-col gap-4">
              <AnalyticsOpportunitiesTable
                opportunities={opportunities}
                ariaLabel="Project analytics opportunities"
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
    <div className="flex flex-col gap-3" aria-label="Loading project analytics opportunities">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
