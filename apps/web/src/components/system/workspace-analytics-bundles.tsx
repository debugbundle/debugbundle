import { PackageIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  listAnalyticsBundles,
  type AnalyticsBundleGenerationRecord,
  type AnalyticsBundleInventoryQuery,
  type ProjectRecord
} from "../../lib/api.js";
import { useCursorPagination } from "../../lib/use-cursor-pagination.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "../ui/empty.js";
import { Notice } from "../ui/notice.js";
import { Skeleton } from "../ui/skeleton.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../ui/table.js";
import { CursorPaginationControls } from "./cursor-pagination-controls.js";
import { ProjectColorTagDot } from "./project-color-tag-dot.js";
import { ResourceListState } from "./resource-list-state.js";
import { TableRefreshButton } from "./table-refresh-button.js";
import {
  createWorkspaceAnalyticsFilters,
  toAnalyticsDateEnd,
  toAnalyticsDateStart,
  WorkspaceAnalyticsFilters,
  type WorkspaceAnalyticsFilterValues
} from "./workspace-analytics-filters.js";

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
});

export function WorkspaceAnalyticsBundles({ projects }: { projects: ProjectRecord[] }): JSX.Element {
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
                <BundlesTable bundles={bundles} />
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

function BundlesTable({ bundles }: { bundles: AnalyticsBundleGenerationRecord[] }): JSX.Element {
  return (
    <Table aria-label="AnalyticsBundles" className="min-w-[1050px]">
      <TableHeader>
        <TableRow>
          <TableHead>Analysis</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Service</TableHead>
          <TableHead>Environment</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Related opportunity</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Completed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bundles.map((bundle) => {
          const scope = readBundleScope(bundle.analysis_spec);
          return (
            <TableRow key={bundle.generation_id}>
              <TableCell>
                <Link
                  to={`/projects/${bundle.project_id}/analytics`}
                  className="font-medium text-foreground hover:underline"
                >
                  {formatLabel(bundle.analysis_kind)}
                </Link>
                {bundle.failure_reason === null ? null : (
                  <p className="mt-1 max-w-72 text-xs text-muted-foreground whitespace-normal">
                    {bundle.failure_reason}
                  </p>
                )}
              </TableCell>
              <TableCell>
                <Link
                  to={`/projects/${bundle.project_id}/analytics`}
                  className="inline-flex items-center gap-2 hover:underline"
                >
                  <ProjectColorTagDot colorTag={bundle.project_color_tag ?? null} />
                  {bundle.project_name ?? bundle.project_id}
                </Link>
              </TableCell>
              <TableCell>{scope.service ?? "All"}</TableCell>
              <TableCell>{scope.environment ?? "All"}</TableCell>
              <TableCell>
                <Badge variant={bundleStateVariant(bundle.status)}>
                  {bundle.status === "completed" ? "Ready" : formatLabel(bundle.status)}
                </Badge>
              </TableCell>
              <TableCell>
                {bundle.opportunity_id === null ? "None" : shortIdentifier(bundle.opportunity_id)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {DATE_FORMAT.format(new Date(bundle.created_at))}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {bundle.completed_at === null
                  ? "Not completed"
                  : DATE_FORMAT.format(new Date(bundle.completed_at))}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
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

function readBundleScope(analysisSpec: Record<string, unknown>): {
  service: string | null;
  environment: string | null;
} {
  const filters = analysisSpec["filters"];
  if (typeof filters !== "object" || filters === null || Array.isArray(filters)) {
    return { service: null, environment: null };
  }
  const record = filters as Record<string, unknown>;
  return {
    service: typeof record["service"] === "string" ? record["service"] : null,
    environment: typeof record["environment"] === "string" ? record["environment"] : null
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

function bundleStateVariant(
  value: AnalyticsBundleGenerationRecord["status"]
): "default" | "destructive" | "secondary" {
  if (value === "completed") return "default";
  if (value === "failed") return "destructive";
  return "secondary";
}

function shortIdentifier(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 8)}...`;
}

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((part) => (part.length === 0 ? part : `${part[0]!.toUpperCase()}${part.slice(1)}`))
    .join(" ");
}
