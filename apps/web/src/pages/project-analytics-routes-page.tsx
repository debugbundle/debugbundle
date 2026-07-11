import { RouteIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { TableRefreshButton } from "../components/system/table-refresh-button.js";
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
  type ProjectAnalyticsRouteMetricsResponse
} from "../lib/api.js";
import type { ProjectAnalyticsContext } from "./project-analytics-layout.js";

const INTEGER_FORMAT = new Intl.NumberFormat();

export function ProjectAnalyticsRoutesPage(): JSX.Element {
  const { projectId, query } = useOutletContext<ProjectAnalyticsContext>();
  const [response, setResponse] = useState<ProjectAnalyticsRouteMetricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setHasError(false);

    void getProjectAnalyticsRoutes(projectId, query)
      .then((result) => {
        if (active) setResponse(result);
      })
      .catch(() => {
        if (active) {
          setResponse(null);
          setHasError(true);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attempt, projectId, queryKey]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">Route analytics</h2>
        <p className="text-sm text-muted-foreground">
          Compare navigation volume, exits, bounce signals, and incident-linked sessions.
        </p>
      </div>

      <div className="flex justify-end">
        <TableRefreshButton
          isLoading={isLoading}
          label="Refresh route analytics"
          onRefresh={() => setAttempt((current) => current + 1)}
        />
      </div>

      {isLoading && response === null ? <Skeleton className="h-64 w-full" /> : null}

      {hasError ? (
        <Notice title="Could not load route analytics" tone="destructive">
          <div className="flex flex-col items-start gap-2">
            <p>Aggregate route metrics are temporarily unavailable. Analytics capture continues.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAttempt((current) => current + 1)}
            >
              Retry route analytics
            </Button>
          </div>
        </Notice>
      ) : null}

      {response !== null && response.routes.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <RouteIcon />
            </EmptyMedia>
            <EmptyTitle>No route activity in this window</EmptyTitle>
            <EmptyDescription>
              Route metrics appear after analytics capture receives page views or route changes.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {response !== null && response.routes.length > 0 ? (
        <Table aria-label="Route metrics">
          <TableHeader>
            <TableRow>
              <TableHead>Route</TableHead>
              <TableHead className="text-right">Page views</TableHead>
              <TableHead className="text-right">Unique sessions</TableHead>
              <TableHead className="text-right">Entrances</TableHead>
              <TableHead className="text-right">Exits</TableHead>
              <TableHead className="text-right">Bounces</TableHead>
              <TableHead className="text-right">Incident-linked sessions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {response.routes.map((route) => (
              <TableRow key={route.route_key}>
                <TableCell className="max-w-72 truncate font-mono text-xs">
                  {route.route_key}
                </TableCell>
                <MetricCell value={route.pageviews} />
                <MetricCell value={route.unique_sessions} />
                <MetricCell value={route.entrances} />
                <MetricCell value={route.exits} />
                <MetricCell value={route.bounces} />
                <MetricCell value={route.linked_incident_sessions} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}

function MetricCell({ value }: { value: number }): JSX.Element {
  return (
    <TableCell className="text-right tabular-nums">{INTEGER_FORMAT.format(value)}</TableCell>
  );
}
