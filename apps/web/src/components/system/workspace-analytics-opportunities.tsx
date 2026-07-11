import { LightbulbIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  listAnalyticsOpportunities,
  type AnalyticsOpportunityInventoryQuery,
  type AnalyticsOpportunityRecord,
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

const PERCENT_FORMAT = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 0
});
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
});

export function WorkspaceAnalyticsOpportunities({
  projects
}: {
  projects: ProjectRecord[];
}): JSX.Element {
  const [draftFilters, setDraftFilters] = useState(() =>
    createWorkspaceAnalyticsFilters("opportunities")
  );
  const [filters, setFilters] = useState(draftFilters);
  const pagination = useCursorPagination(
    async (cursor) => {
      const response = await listAnalyticsOpportunities(buildOpportunityQuery(filters, cursor));
      return { items: response.opportunities, nextCursor: response.next_cursor };
    },
    [filters]
  );

  function resetFilters(): void {
    const nextFilters = createWorkspaceAnalyticsFilters("opportunities");
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
  }

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Analytics opportunities</CardTitle>
          <TableRefreshButton
            isLoading={pagination.isLoading}
            label="Refresh analytics opportunities"
            onRefresh={pagination.refreshPage}
          />
        </div>
        <WorkspaceAnalyticsFilters
          mode="opportunities"
          projects={projects}
          value={draftFilters}
          onChange={setDraftFilters}
          onApply={() => setFilters(normalizeFilters(draftFilters))}
          onReset={resetFilters}
        />
      </CardHeader>
      <CardContent>
        {pagination.hasError ? (
          <Notice title="Could not load analytics opportunities" tone="destructive">
            <div className="flex flex-col items-start gap-2">
              <p>The cross-project analytics opportunity inventory is temporarily unavailable.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void pagination.refreshPage()}
              >
                Retry analytics opportunities
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
                  <EmptyTitle>No analytics opportunities match these filters</EmptyTitle>
                  <EmptyDescription>
                    Adjust the filters or wait for aggregate usage patterns to cross a supported
                    analysis threshold.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            }
          >
            {(opportunities) => (
              <div className="flex flex-col gap-4">
                <OpportunitiesTable opportunities={opportunities} />
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

function OpportunitiesTable({
  opportunities
}: {
  opportunities: AnalyticsOpportunityRecord[];
}): JSX.Element {
  return (
    <Table aria-label="Analytics opportunities" className="min-w-[1180px]">
      <TableHeader>
        <TableRow>
          <TableHead>Opportunity</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Service</TableHead>
          <TableHead>Environment</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Bundle state</TableHead>
          <TableHead className="text-right">Confidence</TableHead>
          <TableHead className="text-right">Last detected</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {opportunities.map((opportunity) => (
          <TableRow key={opportunity.opportunity_id}>
            <TableCell className="max-w-80 whitespace-normal">
              <Link
                to={`/projects/${opportunity.project_id}/analytics`}
                className="font-medium text-foreground hover:underline"
              >
                {opportunity.title}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground whitespace-normal">
                {opportunity.summary}
              </p>
            </TableCell>
            <TableCell>
              <Link
                to={`/projects/${opportunity.project_id}/analytics`}
                className="inline-flex items-center gap-2 hover:underline"
              >
                <ProjectColorTagDot colorTag={opportunity.project_color_tag} />
                {opportunity.project_name}
              </Link>
            </TableCell>
            <TableCell>{opportunity.service ?? "All"}</TableCell>
            <TableCell>{opportunity.environment ?? "All"}</TableCell>
            <TableCell>{formatLabel(opportunity.kind)}</TableCell>
            <TableCell>
              <Badge variant={opportunity.severity === "high" ? "warning" : "outline"}>
                {formatLabel(opportunity.severity)}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{formatLabel(opportunity.status)}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant={bundleStateVariant(opportunity.bundle_status)}>
                {formatBundleState(opportunity.bundle_status)}
              </Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {PERCENT_FORMAT.format(opportunity.confidence)}
            </TableCell>
            <TableCell className="text-right whitespace-nowrap">
              {DATE_FORMAT.format(new Date(opportunity.last_detected_at))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function buildOpportunityQuery(
  filters: WorkspaceAnalyticsFilterValues,
  cursor: string | null
): AnalyticsOpportunityInventoryQuery {
  const from = toAnalyticsDateStart(filters.from);
  const to = toAnalyticsDateEnd(filters.to);
  return {
    limit: 20,
    status: filters.status as Exclude<AnalyticsOpportunityInventoryQuery["status"], undefined>,
    ...(filters.projectId === "all" ? {} : { projectId: filters.projectId }),
    ...(filters.kind === "all"
      ? {}
      : {
          kind: filters.kind as Exclude<AnalyticsOpportunityInventoryQuery["kind"], undefined>
        }),
    ...(filters.service.length === 0 ? {} : { service: filters.service }),
    ...(filters.environment.length === 0 ? {} : { environment: filters.environment }),
    ...(filters.severity === "all"
      ? {}
      : {
          severity: filters.severity as Exclude<
            AnalyticsOpportunityInventoryQuery["severity"],
            undefined
          >
        }),
    ...(filters.bundleStatus === "all"
      ? {}
      : {
          bundleStatus:
            filters.bundleStatus as Exclude<
              AnalyticsOpportunityInventoryQuery["bundleStatus"],
              undefined
            >
        }),
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
    <div className="flex flex-col gap-3" aria-label="Loading analytics opportunities">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function formatBundleState(value: AnalyticsOpportunityRecord["bundle_status"]): string {
  if (value === "completed") return "Ready";
  return formatLabel(value);
}

function bundleStateVariant(
  value: AnalyticsOpportunityRecord["bundle_status"]
): "default" | "destructive" | "outline" | "secondary" {
  if (value === "completed") return "default";
  if (value === "failed") return "destructive";
  if (value === "pending" || value === "running") return "secondary";
  return "outline";
}

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((part) => (part.length === 0 ? part : `${part[0]!.toUpperCase()}${part.slice(1)}`))
    .join(" ");
}
