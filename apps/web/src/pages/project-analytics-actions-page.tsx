import { WaypointsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { AnalyticsSectionHeader } from "../components/system/analytics-section-header.js";
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
import { getProjectAnalyticsActions } from "../lib/api-analytics.js";
import type { AnalyticsActionMetricsResponse } from "../../../../packages/shared-types/src/index.js";
import type { ProjectAnalyticsContext } from "./project-analytics-layout.js";

const INTEGER_FORMAT = new Intl.NumberFormat();

export function ProjectAnalyticsActionsPage(): JSX.Element {
  const { projectId, query } = useOutletContext<ProjectAnalyticsContext>();
  const [response, setResponse] = useState<AnalyticsActionMetricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    setResponse(null);
  }, [projectId, queryKey]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setHasError(false);

    void getProjectAnalyticsActions(projectId, query)
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
      <AnalyticsSectionHeader
        title="Action metrics"
        description="Compare action, conversion and marker events with unique session reach."
        isLoading={isLoading}
        onRefresh={() => setAttempt((current) => current + 1)}
      />

      {isLoading && response === null ? <Skeleton className="h-64 w-full" /> : null}

      {hasError ? (
        <Notice title="Could not load action metrics" tone="destructive">
          <div className="flex flex-col items-start gap-2">
            <p>
              Aggregate action metrics are temporarily unavailable. Analytics capture continues.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAttempt((current) => current + 1)}
            >
              Retry action metrics
            </Button>
          </div>
        </Notice>
      ) : null}

      {response !== null && response.actions.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WaypointsIcon />
            </EmptyMedia>
            <EmptyTitle>No action activity in this window</EmptyTitle>
            <EmptyDescription>
              Action metrics appear after analytics capture receives action, conversion or marker
              events.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {response !== null && response.actions.length > 0 ? (
        <Table aria-label="Action metrics">
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Events</TableHead>
              <TableHead>Unique sessions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {response.actions.map((action) => (
              <TableRow key={`${action.kind}:${action.action_key}`}>
                <TableCell>{action.action_key}</TableCell>
                <TableCell>{action.kind}</TableCell>
                <TableCell>{INTEGER_FORMAT.format(action.event_count)}</TableCell>
                <TableCell>{INTEGER_FORMAT.format(action.unique_sessions)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
