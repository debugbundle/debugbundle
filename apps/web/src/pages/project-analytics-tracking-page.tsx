import { ListChecksIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

import type { AnalyticsProjectPlanRecord } from "../../../../packages/shared-types/src/index.js";
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
import { ApiRequestError, getProjectAnalyticsPlan } from "../lib/api.js";
import type { ProjectAnalyticsContext } from "./project-analytics-layout.js";

const INTEGER_FORMAT = new Intl.NumberFormat();

export function ProjectAnalyticsTrackingPage(): JSX.Element {
  const { projectId } = useOutletContext<ProjectAnalyticsContext>();
  const [plan, setPlan] = useState<AnalyticsProjectPlanRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isForbidden, setIsForbidden] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setHasError(false);
    setIsForbidden(false);
    void getProjectAnalyticsPlan(projectId)
      .then((result) => {
        if (active) setPlan(result);
      })
      .catch((error: unknown) => {
        if (active) {
          setPlan(null);
          setIsForbidden(error instanceof ApiRequestError && error.status === 403);
          setHasError(!(error instanceof ApiRequestError && error.status === 403));
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt, projectId]);

  return (
    <div className="flex flex-col gap-6">
      <AnalyticsSectionHeader
        title="Tracking"
        description="Review declared event definitions and accepted producer observations."
        isLoading={isLoading}
        onRefresh={() => setAttempt((current) => current + 1)}
      />
      <Notice title="Measurement coverage">
        Submitted SDK names and versions are not verified. Accepted event counts do not prove that
        the declared business success boundary was reached.
      </Notice>
      {isLoading && plan === null ? <Skeleton className="h-64 w-full" /> : null}
      {hasError ? (
        <Notice title="Could not load tracking plan" tone="destructive">
          <div className="flex flex-col items-start gap-2">
            <p>The current event definitions and producer observations are unavailable.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAttempt((current) => current + 1)}
            >
              Retry tracking plan
            </Button>
          </div>
        </Notice>
      ) : null}
      {isForbidden ? (
        <Notice title="Tracking plan access required">
          A project owner or admin can review event definitions and producer observations.
        </Notice>
      ) : null}
      {plan !== null && plan.producer_observations_truncated ? (
        <Notice title="Producer list shortened">
          More than 300 producer and version groups were observed. This read does not show every
          submitted version.
        </Notice>
      ) : null}
      {plan !== null && plan.catalog.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListChecksIcon />
            </EmptyMedia>
            <EmptyTitle>No event definitions yet</EmptyTitle>
            <EmptyDescription>
              Event definitions will appear here when they are added to this project’s measurement
              plan.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {plan !== null && plan.catalog.length > 0 ? <MeasurementHealthTable plan={plan} /> : null}
    </div>
  );
}

function MeasurementHealthTable({ plan }: { plan: AnalyticsProjectPlanRecord }): JSX.Element {
  return (
    <div className="overflow-x-auto" role="region" aria-label="Measurement health table">
      <Table aria-label="Measurement health">
        <TableHeader>
          <TableRow>
            <TableHead>Event definition</TableHead>
            <TableHead>Declared producers</TableHead>
            <TableHead>Submitted SDKs</TableHead>
            <TableHead className="text-right">Accepted events</TableHead>
            <TableHead>Last observed day</TableHead>
            <TableHead>Source verification</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plan.catalog.map((entry) => {
            const observations = (plan.observations ?? []).filter(
              (item) => item.event_name === entry.name && item.event_revision === entry.revision
            );
            const submitted = (plan.producer_observations ?? []).filter(
              (item) => item.event_name === entry.name && item.event_revision === entry.revision
            );
            const count = observations.reduce(
              (total, item) => total + BigInt(item.observed_count),
              0n
            );
            const lastDay = observations.reduce(
              (latest, item) => (latest > item.last_observed_on ? latest : item.last_observed_on),
              ""
            );
            return (
              <TableRow key={`${entry.name}:${entry.revision}`}>
                <TableCell className="font-medium">
                  <span className="font-mono">{entry.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    Revision {entry.revision}
                  </span>
                </TableCell>
                <TableCell>{entry.producers.join(", ")}</TableCell>
                <TableCell>
                  {submitted.length === 0
                    ? plan.producer_observations === undefined ||
                      plan.producer_observations_truncated
                      ? "Unknown"
                      : "None observed"
                    : [
                        ...new Set(submitted.map((item) => `${item.sdk_name} ${item.sdk_version}`))
                      ].join(", ")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {plan.observations === undefined ? "Unknown" : INTEGER_FORMAT.format(count)}
                </TableCell>
                <TableCell>{lastDay || "Unknown"}</TableCell>
                <TableCell>Not verified</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
