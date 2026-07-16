import { BarChart3Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { opportunityDetailPath } from "../components/system/analytics-opportunities-table.js";
import { TableRefreshButton } from "../components/system/table-refresh-button.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card.js";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "../components/ui/empty.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../components/ui/table.js";
import {
  getProjectAnalyticsRoutes,
  getProjectAnalyticsSummary,
  listProjectAnalyticsOpportunities,
  type AnalyticsOpportunityRecord,
  type ProjectAnalyticsRouteMetricsResponse,
  type ProjectAnalyticsUsageSummaryResponse
} from "../lib/api.js";
import type { ProjectAnalyticsContext } from "./project-analytics-layout.js";

interface AnalyticsOverviewData {
  summary: ProjectAnalyticsUsageSummaryResponse;
  routes: ProjectAnalyticsRouteMetricsResponse | null;
  opportunities: AnalyticsOpportunityRecord[] | null;
}

const INTEGER_FORMAT = new Intl.NumberFormat();

export function ProjectAnalyticsPage(): JSX.Element {
  const { projectId, query } = useOutletContext<ProjectAnalyticsContext>();
  const [overview, setOverview] = useState<AnalyticsOverviewData | null>(null);
  const [overviewError, setOverviewError] = useState(false);
  const [overviewAttempt, setOverviewAttempt] = useState(0);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let active = true;
    setIsOverviewLoading(true);
    setOverviewError(false);

    void Promise.allSettled([
      getProjectAnalyticsSummary(projectId, query),
      getProjectAnalyticsRoutes(projectId, query),
      listProjectAnalyticsOpportunities(projectId, 5)
    ])
      .then(([summaryResult, routesResult, opportunitiesResult]) => {
        if (!active) return;
        if (summaryResult.status === "rejected") {
          setOverview(null);
          setOverviewError(true);
          return;
        }

        setOverview({
          summary: summaryResult.value,
          routes: routesResult.status === "fulfilled" ? routesResult.value : null,
          opportunities:
            opportunitiesResult.status === "fulfilled"
              ? opportunitiesResult.value.opportunities
              : null
        });
      })
      .finally(() => {
        if (active) setIsOverviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [overviewAttempt, projectId, queryKey]);

  const isEmpty =
    overview !== null &&
    overview.summary.summary.sessions === 0 &&
    overview.summary.summary.pageviews === 0 &&
    overview.summary.summary.conversions === 0 &&
    overview.routes !== null &&
    overview.routes.routes.length === 0 &&
    overview.opportunities !== null &&
    overview.opportunities.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardAction>
          <TableRefreshButton
            isLoading={isOverviewLoading}
            onRefresh={() => setOverviewAttempt((attempt) => attempt + 1)}
            mobileIconOnly
          />
        </CardAction>
        <CardTitle>Analytics overview</CardTitle>
        <CardDescription>
          Aggregate product usage, navigation, and improvement signals for this project.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {isOverviewLoading && overview === null ? <AnalyticsOverviewSkeleton /> : null}

        {overviewError ? (
          <Notice title="Could not load analytics overview" tone="destructive">
            <div className="flex flex-col items-start gap-2">
              <p>
                The aggregate analytics reads failed. Existing debug and analytics capture are
                unaffected.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOverviewAttempt((attempt) => attempt + 1)}
              >
                Retry analytics overview
              </Button>
            </div>
          </Notice>
        ) : null}

        {isEmpty ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BarChart3Icon />
              </EmptyMedia>
              <EmptyTitle>No analytics activity in this window</EmptyTitle>
              <EmptyDescription>
                Analytics starts after opted-in browser capture sends events that match the current
                project settings.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild type="button" variant="outline" size="sm">
                <Link to={`/projects/${projectId}/settings`}>Review analytics settings</Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : null}

        {overview !== null && !isEmpty ? <AnalyticsOverviewContent overview={overview} /> : null}
      </CardContent>
    </Card>
  );
}

function AnalyticsOverviewContent({ overview }: { overview: AnalyticsOverviewData }): JSX.Element {
  const summary = overview.summary.summary;
  const isPartial = overview.routes === null || overview.opportunities === null;
  return (
    <>
      {isPartial ? (
        <Notice title="Some analytics previews are unavailable" tone="warning">
          Summary metrics are current, but one or more route or opportunity previews could not be
          loaded. Refresh to try again.
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Sessions" value={summary.sessions} />
        <MetricCard label="Active visitors" value={summary.active_visitors} />
        <MetricCard label="Page views" value={summary.pageviews} />
        <MetricCard label="Conversions" value={summary.conversions} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <MetricTableSection title="Top routes" id="analytics-top-routes-title">
          {overview.routes === null ? (
            <p className="text-sm text-muted-foreground">Route preview unavailable.</p>
          ) : overview.routes.routes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No route activity in this window.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.routes.routes.map((route) => (
                  <TableRow key={route.route_key}>
                    <TableCell className="max-w-64 truncate font-mono text-xs">
                      {route.route_key}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {INTEGER_FORMAT.format(route.unique_sessions)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {INTEGER_FORMAT.format(route.pageviews)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </MetricTableSection>

        <MetricTableSection title="Top devices" id="analytics-top-devices-title">
          {overview.summary.breakdowns.device_types.length === 0 ? (
            <p className="text-sm text-muted-foreground">No device activity in this window.</p>
          ) : (
            <SegmentTable segments={overview.summary.breakdowns.device_types} />
          )}
        </MetricTableSection>
      </div>

      <MetricTableSection
        title="Open opportunities"
        id="analytics-open-opportunities-title"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link to={`/projects/${summary.project_id}/analytics/opportunities`}>View all</Link>
          </Button>
        }
      >
        {overview.opportunities === null ? (
          <p className="text-sm text-muted-foreground">Opportunity preview unavailable.</p>
        ) : overview.opportunities.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No open analytics opportunities in this project.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Opportunity</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead className="text-right">Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.opportunities.map((opportunity) => (
                <TableRow key={opportunity.opportunity_id}>
                  <TableCell>
                    <div className="flex max-w-xl flex-col gap-1">
                      <Link
                        to={opportunityDetailPath(opportunity)}
                        className="font-medium whitespace-normal hover:underline"
                      >
                        {opportunity.title}
                      </Link>
                      <span className="text-xs text-muted-foreground whitespace-normal">
                        {opportunity.summary}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{formatAnalyticsLabel(opportunity.kind)}</TableCell>
                  <TableCell>
                    <Badge variant={opportunity.severity === "high" ? "warning" : "outline"}>
                      {formatAnalyticsLabel(opportunity.severity)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Math.round(opportunity.confidence * 100)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </MetricTableSection>
    </>
  );
}

function MetricTableSection({
  title,
  id,
  children,
  action
}: {
  title: string;
  id: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}): JSX.Element {
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby={id}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={id} className="text-base font-medium">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function SegmentTable({
  segments
}: {
  segments: ProjectAnalyticsUsageSummaryResponse["breakdowns"]["device_types"];
}): JSX.Element {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Device</TableHead>
          <TableHead className="text-right">Sessions</TableHead>
          <TableHead className="text-right">Views</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {segments.map((segment) => (
          <TableRow key={segment.value}>
            <TableCell>{formatAnalyticsLabel(segment.value)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {INTEGER_FORMAT.format(segment.sessions)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {INTEGER_FORMAT.format(segment.pageviews)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MetricCard({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border/80 bg-background/60 px-4 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-medium tabular-nums text-foreground">
        {INTEGER_FORMAT.format(value)}
      </p>
    </div>
  );
}

function AnalyticsOverviewSkeleton(): JSX.Element {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      aria-label="Loading analytics overview"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-24 w-full" />
      ))}
    </div>
  );
}

export function formatAnalyticsLabel(value: string): string {
  return value
    .split("_")
    .map((part) => (part.length === 0 ? part : `${part[0]!.toUpperCase()}${part.slice(1)}`))
    .join(" ");
}
