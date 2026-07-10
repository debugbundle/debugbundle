import { BarChart3Icon, Settings2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import type { ProjectContext } from "../components/system/project-layout.js";
import { TableRefreshButton } from "../components/system/table-refresh-button.js";
import { CalloutCard } from "../components/system/callout-card.js";
import { PlanUpgradeCallout } from "../components/system/plan-upgrade-callout.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import {
  Card,
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
import { Field, FieldGroup, FieldLabel } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { Notice } from "../components/ui/notice.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../components/ui/select.js";
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
  getProjectAnalyticsSettings,
  getProjectAnalyticsSummary,
  listProjectAnalyticsOpportunities,
  type AnalyticsMetricsQuery,
  type AnalyticsOpportunityRecord,
  type ProjectAnalyticsRouteMetricsResponse,
  type ProjectAnalyticsSettingsResponse,
  type ProjectAnalyticsUsageSummaryResponse
} from "../lib/api.js";

interface AnalyticsOverviewData {
  summary: ProjectAnalyticsUsageSummaryResponse;
  routes: ProjectAnalyticsRouteMetricsResponse | null;
  opportunities: AnalyticsOpportunityRecord[] | null;
}

interface AnalyticsFilters {
  last: "7d" | "30d" | "90d";
  service: string;
  environment: string;
}

const INTEGER_FORMAT = new Intl.NumberFormat();

const timeWindowOptions: Array<{ value: AnalyticsFilters["last"]; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" }
];

const defaultFilters: AnalyticsFilters = {
  last: "30d",
  service: "",
  environment: ""
};

export function ProjectAnalyticsPage(): JSX.Element {
  const { project, projectId } = useOutletContext<ProjectContext>();
  const [settings, setSettings] = useState<ProjectAnalyticsSettingsResponse | null>(null);
  const [settingsError, setSettingsError] = useState(false);
  const [settingsAttempt, setSettingsAttempt] = useState(0);
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [filters, setFilters] = useState(defaultFilters);
  const [overview, setOverview] = useState<AnalyticsOverviewData | null>(null);
  const [overviewError, setOverviewError] = useState(false);
  const [overviewAttempt, setOverviewAttempt] = useState(0);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setSettings(null);
    setSettingsError(false);

    void getProjectAnalyticsSettings(projectId)
      .then((response) => {
        if (active) setSettings(response);
      })
      .catch(() => {
        if (active) setSettingsError(true);
      });

    return () => {
      active = false;
    };
  }, [projectId, settingsAttempt]);

  useEffect(() => {
    if (settings === null || !settings.analytics_available || !settings.settings.enabled) {
      setOverview(null);
      setOverviewError(false);
      setIsOverviewLoading(false);
      return;
    }

    let active = true;
    const query: AnalyticsMetricsQuery = {
      last: filters.last,
      granularity: "day",
      limit: 5,
      ...(filters.service.length === 0 ? {} : { service: filters.service }),
      ...(filters.environment.length === 0 ? {} : { environment: filters.environment })
    };

    setIsOverviewLoading(true);
    setOverviewError(false);

    void Promise.allSettled([
      getProjectAnalyticsSummary(projectId, query),
      getProjectAnalyticsRoutes(projectId, query),
      listProjectAnalyticsOpportunities(projectId, 5)
    ])
      .then(([summaryResult, routesResult, opportunitiesResult]) => {
        if (!active) {
          return;
        }

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
  }, [filters, overviewAttempt, projectId, settings]);

  const isEmpty =
    overview !== null &&
    overview.summary.summary.sessions === 0 &&
    overview.summary.summary.pageviews === 0 &&
    overview.summary.summary.conversions === 0 &&
    overview.routes !== null &&
    overview.routes.routes.length === 0 &&
    overview.opportunities !== null &&
    overview.opportunities.length === 0;

  function applyFilters(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFilters({
      last: draftFilters.last,
      service: draftFilters.service.trim(),
      environment: draftFilters.environment.trim()
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">Analytics overview</h2>
        <p className="text-sm text-muted-foreground">
          Aggregate product usage, navigation, and improvement signals for this project.
        </p>
      </div>

      {settings === null && !settingsError ? <AnalyticsOverviewSkeleton /> : null}

      {settingsError ? (
        <Notice title="Analytics settings unavailable" tone="destructive">
          <div className="flex flex-col items-start gap-2">
            <p>Could not determine whether analytics is available for this project.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSettingsAttempt((attempt) => attempt + 1)}
            >
              Retry
            </Button>
          </div>
        </Notice>
      ) : null}

      {settings !== null && !settings.analytics_available ? (
        <PlanUpgradeCallout
          title="Upgrade to Solo or Team to unlock product analytics"
          description="Product analytics capture, aggregate metrics, journey evidence, and AnalyticsBundles are available on paid plans."
        />
      ) : null}

      {settings !== null && settings.analytics_available && !settings.settings.enabled ? (
        <CalloutCard
          eyebrow="Analytics disabled"
          title="Analytics capture is off"
          description="Enable project analytics before aggregate usage and journey signals can appear here. Debug incident capture remains independent."
          tone="neutral"
        >
          <div className="flex flex-wrap gap-2">
            <Button asChild type="button" variant="outline" size="sm">
              <Link to={`/projects/${projectId}/settings`}>
                <Settings2Icon data-icon="inline-start" />
                Open analytics settings
              </Link>
            </Button>
          </div>
        </CalloutCard>
      ) : null}

      {settings !== null && settings.analytics_available && settings.settings.enabled ? (
        <>
          <form className="flex flex-col gap-4" onSubmit={applyFilters}>
            <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[12rem_1fr_1fr_auto] lg:items-end">
              <Field>
                <FieldLabel id="analytics-window-label" htmlFor="analytics-window">
                  Time window
                </FieldLabel>
                <Select
                  value={draftFilters.last}
                  onValueChange={(last) =>
                    setDraftFilters((current) => ({
                      ...current,
                      last: last as AnalyticsFilters["last"]
                    }))
                  }
                >
                  <SelectTrigger
                    id="analytics-window"
                    aria-labelledby="analytics-window-label analytics-window"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectGroup>
                      {timeWindowOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="analytics-service">Service</FieldLabel>
                <Input
                  id="analytics-service"
                  value={draftFilters.service}
                  placeholder="All services"
                  maxLength={120}
                  onChange={(event) =>
                    setDraftFilters((current) => ({ ...current, service: event.target.value }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="analytics-environment">Environment</FieldLabel>
                <Input
                  id="analytics-environment"
                  value={draftFilters.environment}
                  placeholder={project.environment_default}
                  maxLength={120}
                  onChange={(event) =>
                    setDraftFilters((current) => ({ ...current, environment: event.target.value }))
                  }
                />
              </Field>
              <Button type="submit" variant="outline" disabled={isOverviewLoading}>
                Apply filters
              </Button>
            </FieldGroup>
          </form>

          <div className="flex justify-end">
            <TableRefreshButton
              isLoading={isOverviewLoading}
              label="Refresh analytics overview"
              onRefresh={() => setOverviewAttempt((attempt) => attempt + 1)}
            />
          </div>

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
                  Analytics starts after opted-in browser capture sends events that match the
                  current project settings.
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
        </>
      ) : null}
    </div>
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
        <section
          className="flex min-w-0 flex-col gap-3"
          aria-labelledby="analytics-top-routes-title"
        >
          <h3 id="analytics-top-routes-title" className="text-base font-medium">
            Top routes
          </h3>
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
        </section>

        <section
          className="flex min-w-0 flex-col gap-3"
          aria-labelledby="analytics-top-devices-title"
        >
          <h3 id="analytics-top-devices-title" className="text-base font-medium">
            Top devices
          </h3>
          {overview.summary.breakdowns.device_types.length === 0 ? (
            <p className="text-sm text-muted-foreground">No device activity in this window.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.summary.breakdowns.device_types.map((device) => (
                  <TableRow key={device.value}>
                    <TableCell>{formatLabel(device.value)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {INTEGER_FORMAT.format(device.sessions)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {INTEGER_FORMAT.format(device.pageviews)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>

      <section
        className="flex min-w-0 flex-col gap-3"
        aria-labelledby="analytics-open-opportunities-title"
      >
        <h3 id="analytics-open-opportunities-title" className="text-base font-medium">
          Open opportunities
        </h3>
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
                      <span className="font-medium whitespace-normal">{opportunity.title}</span>
                      <span className="text-xs text-muted-foreground whitespace-normal">
                        {opportunity.summary}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{formatLabel(opportunity.kind)}</TableCell>
                  <TableCell>
                    <Badge variant={opportunity.severity === "high" ? "warning" : "outline"}>
                      {formatLabel(opportunity.severity)}
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
      </section>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <CardTitle className="text-2xl tabular-nums">{INTEGER_FORMAT.format(value)}</CardTitle>
      </CardContent>
    </Card>
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

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((part) => (part.length === 0 ? part : `${part[0]!.toUpperCase()}${part.slice(1)}`))
    .join(" ");
}
