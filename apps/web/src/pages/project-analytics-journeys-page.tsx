import { WaypointsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

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
  getProjectAnalyticsJourneyPatterns,
  type ProjectAnalyticsJourneyPatternsResponse
} from "../lib/api.js";
import type { ProjectAnalyticsContext } from "./project-analytics-layout.js";

const INTEGER_FORMAT = new Intl.NumberFormat();
const PERCENT_FORMAT = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1
});

export function ProjectAnalyticsJourneysPage(): JSX.Element {
  const { projectId, query } = useOutletContext<ProjectAnalyticsContext>();
  const [response, setResponse] = useState<ProjectAnalyticsJourneyPatternsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setHasError(false);

    void getProjectAnalyticsJourneyPatterns(projectId, query)
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
        <h2 className="text-lg font-medium">Journey patterns</h2>
        <p className="text-sm text-muted-foreground">
          Compare common route transitions and inspect the retained structured samples behind them.
        </p>
      </div>

      <div className="flex justify-end">
        <TableRefreshButton
          isLoading={isLoading}
          label="Refresh journey patterns"
          onRefresh={() => setAttempt((current) => current + 1)}
        />
      </div>

      {isLoading && response === null ? <Skeleton className="h-64 w-full" /> : null}

      {hasError ? (
        <Notice title="Could not load journey patterns" tone="destructive">
          <div className="flex flex-col items-start gap-2">
            <p>Aggregate journey transitions are temporarily unavailable.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAttempt((current) => current + 1)}
            >
              Retry journey patterns
            </Button>
          </div>
        </Notice>
      ) : null}

      {response !== null && response.patterns.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WaypointsIcon />
            </EmptyMedia>
            <EmptyTitle>No journey transitions in this window</EmptyTitle>
            <EmptyDescription>
              Journey patterns appear after analytics capture observes navigation between routes.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {response !== null && response.patterns.length > 0 ? (
        <Table aria-label="Journey patterns">
          <TableHeader>
            <TableRow>
              <TableHead>From route</TableHead>
              <TableHead>To route</TableHead>
              <TableHead className="text-right">Transitions</TableHead>
              <TableHead className="text-right">Unique sessions</TableHead>
              <TableHead className="text-right">Share</TableHead>
              <TableHead>Retained samples</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {response.patterns.map((pattern) => (
              <TableRow key={`${pattern.from_route_key}:${pattern.to_route_key}`}>
                <TableCell className="max-w-64 truncate font-mono text-xs">
                  {pattern.from_route_key}
                </TableCell>
                <TableCell className="max-w-64 truncate font-mono text-xs">
                  {pattern.to_route_key}
                </TableCell>
                <MetricCell value={pattern.transition_count} />
                <MetricCell value={pattern.unique_sessions} />
                <TableCell className="text-right tabular-nums">
                  {PERCENT_FORMAT.format(pattern.transition_share)}
                </TableCell>
                <TableCell>
                  {pattern.sample_ids.length === 0 ? (
                    <span className="text-sm text-muted-foreground">None retained</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {pattern.sample_ids.map((sampleId, index) => (
                        <Button key={sampleId} asChild variant="outline" size="xs">
                          <Link to={`/projects/${projectId}/analytics/journeys/${sampleId}`}>
                            Sample {index + 1}
                          </Link>
                        </Button>
                      ))}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}

function MetricCell({ value }: { value: number }): JSX.Element {
  return <TableCell className="text-right tabular-nums">{INTEGER_FORMAT.format(value)}</TableCell>;
}
