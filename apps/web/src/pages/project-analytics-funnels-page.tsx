import { ChevronDownIcon, ChevronRightIcon, GitForkIcon } from "lucide-react";
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
  getProjectAnalyticsFunnel,
  getProjectAnalyticsFunnels,
  type ProjectAnalyticsFunnelAnalysisResponse,
  type ProjectAnalyticsFunnelMetric,
  type ProjectAnalyticsFunnelStepMetric,
  type ProjectAnalyticsFunnelsResponse
} from "../lib/api.js";
import type { ProjectAnalyticsContext } from "./project-analytics-layout.js";

const INTEGER_FORMAT = new Intl.NumberFormat();
const PERCENT_FORMAT = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1
});

export function ProjectAnalyticsFunnelsPage(): JSX.Element {
  const { projectId, query } = useOutletContext<ProjectAnalyticsContext>();
  const [response, setResponse] = useState<ProjectAnalyticsFunnelsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selectedFunnelKey, setSelectedFunnelKey] = useState<string | null>(null);
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setHasError(false);

    void getProjectAnalyticsFunnels(projectId, query)
      .then((result) => {
        if (active) {
          setResponse(result);
          setSelectedFunnelKey((current) =>
            current !== null && !result.funnels.some((funnel) => funnel.funnel_key === current)
              ? null
              : current
          );
        }
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
        <h2 className="text-lg font-medium">Funnel analytics</h2>
        <p className="text-sm text-muted-foreground">
          Compare entries, completions, and dropoffs, then inspect each funnel step.
        </p>
      </div>

      <div className="flex justify-end">
        <TableRefreshButton
          isLoading={isLoading}
          label="Refresh funnel analytics"
          onRefresh={() => setAttempt((current) => current + 1)}
        />
      </div>

      {isLoading && response === null ? <Skeleton className="h-64 w-full" /> : null}

      {hasError ? (
        <Notice title="Could not load funnel analytics" tone="destructive">
          <div className="flex flex-col items-start gap-2">
            <p>Aggregate funnel metrics are temporarily unavailable. Analytics capture continues.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAttempt((current) => current + 1)}
            >
              Retry funnel analytics
            </Button>
          </div>
        </Notice>
      ) : null}

      {response !== null && response.funnels.length === 0 ? <FunnelEmptyState /> : null}

      {response !== null && response.funnels.length > 0 ? (
        <>
          <FunnelSummaryTable
            funnels={response.funnels}
            selectedFunnelKey={selectedFunnelKey}
            onSelect={(funnelKey) =>
              setSelectedFunnelKey((current) => (current === funnelKey ? null : funnelKey))
            }
          />
          {selectedFunnelKey === null ? null : (
            <FunnelStepAnalysis
              projectId={projectId}
              funnelKey={selectedFunnelKey}
              query={query}
              queryKey={queryKey}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

function FunnelSummaryTable({
  funnels,
  selectedFunnelKey,
  onSelect
}: {
  funnels: ProjectAnalyticsFunnelMetric[];
  selectedFunnelKey: string | null;
  onSelect: (funnelKey: string) => void;
}): JSX.Element {
  return (
    <Table aria-label="Funnel metrics">
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <span className="sr-only">Steps</span>
          </TableHead>
          <TableHead>Funnel</TableHead>
          <TableHead className="text-right">Entered</TableHead>
          <TableHead className="text-right">Completed</TableHead>
          <TableHead className="text-right">Dropoffs</TableHead>
          <TableHead className="text-right">Conversion rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {funnels.map((funnel) => {
          const isSelected = selectedFunnelKey === funnel.funnel_key;
          return (
            <TableRow key={funnel.funnel_key} data-state={isSelected ? "selected" : undefined}>
              <TableCell>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${isSelected ? "Hide" : "View"} steps for ${funnel.funnel_key}`}
                  aria-expanded={isSelected}
                  aria-controls="analytics-funnel-step-analysis"
                  onClick={() => onSelect(funnel.funnel_key)}
                >
                  {isSelected ? <ChevronDownIcon /> : <ChevronRightIcon />}
                </Button>
              </TableCell>
              <TableCell className="font-medium">{funnel.funnel_key}</TableCell>
              <MetricCell value={funnel.sessions_entered} />
              <MetricCell value={funnel.sessions_completed} />
              <MetricCell value={funnel.dropoffs} />
              <TableCell className="text-right tabular-nums">
                {PERCENT_FORMAT.format(funnel.conversion_rate)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function FunnelStepAnalysis({
  projectId,
  funnelKey,
  query,
  queryKey
}: {
  projectId: string;
  funnelKey: string;
  query: ProjectAnalyticsContext["query"];
  queryKey: string;
}): JSX.Element {
  const [response, setResponse] = useState<ProjectAnalyticsFunnelAnalysisResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const title = formatFunnelTitle(funnelKey);

  useEffect(() => {
    let active = true;
    setResponse(null);
    setIsLoading(true);
    setHasError(false);

    void getProjectAnalyticsFunnel(projectId, funnelKey, query)
      .then((result) => {
        if (active) setResponse(result);
      })
      .catch(() => {
        if (active) setHasError(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attempt, funnelKey, projectId, queryKey]);

  return (
    <section
      id="analytics-funnel-step-analysis"
      className="flex flex-col gap-4"
      aria-labelledby="analytics-funnel-steps-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 id="analytics-funnel-steps-heading" className="text-base font-medium">
            {title} funnel steps
          </h3>
          <p className="text-sm text-muted-foreground">
            Ordered completion and dropoff metrics for each captured step.
          </p>
        </div>
        <TableRefreshButton
          isLoading={isLoading}
          label={`Refresh ${funnelKey} steps`}
          onRefresh={() => setAttempt((current) => current + 1)}
        />
      </div>

      {isLoading ? <Skeleton className="h-48 w-full" /> : null}
      {hasError ? (
        <Notice title={`Could not load ${funnelKey} steps`} tone="destructive">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAttempt((current) => current + 1)}
          >
            Retry {funnelKey} steps
          </Button>
        </Notice>
      ) : null}
      {response !== null && response.steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">No captured steps in this window.</p>
      ) : null}
      {response !== null && response.steps.length > 0 ? (
        <FunnelStepsTable title={title} steps={response.steps} />
      ) : null}
    </section>
  );
}

function FunnelStepsTable({
  title,
  steps
}: {
  title: string;
  steps: ProjectAnalyticsFunnelStepMetric[];
}): JSX.Element {
  const orderedSteps = [...steps].sort(
    (left, right) => left.step_order - right.step_order || left.step_key.localeCompare(right.step_key)
  );
  return (
    <Table aria-label={`${title} funnel steps`}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Order</TableHead>
          <TableHead>Step</TableHead>
          <TableHead className="text-right">Entered</TableHead>
          <TableHead className="text-right">Completed</TableHead>
          <TableHead className="text-right">Dropoffs</TableHead>
          <TableHead className="text-right">Conversion rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orderedSteps.map((step) => (
          <TableRow key={`${step.step_order}:${step.step_key}`}>
            <TableCell className="tabular-nums">{step.step_order + 1}</TableCell>
            <TableCell className="font-medium">{step.step_key}</TableCell>
            <MetricCell value={step.sessions_entered} />
            <MetricCell value={step.sessions_completed} />
            <MetricCell value={step.dropoffs} />
            <TableCell className="text-right tabular-nums">
              {PERCENT_FORMAT.format(step.conversion_rate)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MetricCell({ value }: { value: number }): JSX.Element {
  return <TableCell className="text-right tabular-nums">{INTEGER_FORMAT.format(value)}</TableCell>;
}

function FunnelEmptyState(): JSX.Element {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <GitForkIcon />
        </EmptyMedia>
        <EmptyTitle>No funnel activity in this window</EmptyTitle>
        <EmptyDescription>
          Funnel metrics appear after analytics capture receives funnel-step events.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function formatFunnelTitle(value: string): string {
  return value
    .split(/[_-]/u)
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
