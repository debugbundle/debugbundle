import { LightbulbIcon } from "lucide-react";
import { useMemo } from "react";
import { useOutletContext } from "react-router-dom";

import { AnalyticsOpportunitiesTable } from "../components/system/analytics-opportunities-table.js";
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

const WINDOW_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;

export function ProjectAnalyticsOpportunitiesPage(): JSX.Element {
  const { projectId, query } = useOutletContext<ProjectAnalyticsContext>();
  const queryKey = JSON.stringify(query);
  const detectedWindow = useMemo(() => buildDetectedWindow(query.last ?? "30d"), [queryKey]);
  const pagination = useCursorPagination(
    async (cursor) => {
      const response = await listAnalyticsOpportunities({
        projectId,
        status: "all",
        limit: 20,
        from: detectedWindow.from,
        to: detectedWindow.to,
        ...(query.service === undefined ? {} : { service: query.service }),
        ...(query.environment === undefined ? {} : { environment: query.environment }),
        ...(cursor === null ? {} : { cursor })
      });
      return { items: response.opportunities, nextCursor: response.next_cursor };
    },
    [projectId, queryKey, detectedWindow]
  );

  return (
    <div className="flex flex-col gap-6">
      <AnalyticsSectionHeader
        title="Analytics opportunities"
        description="Review deterministic improvement signals found in aggregate product usage."
        isLoading={pagination.isLoading}
        onRefresh={pagination.refreshPage}
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

function buildDetectedWindow(last: keyof typeof WINDOW_DAYS): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - WINDOW_DAYS[last] * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
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
