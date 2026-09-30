import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

import type { ProjectSemanticFunnelReportResponse } from "../../../../packages/analytics-engine/src/funnel-report-protocol.js";
import type { AnalyticsProjectPlanRecord } from "../../../../packages/shared-types/src/index.js";
import { AnalyticsSectionHeader } from "../components/system/analytics-section-header.js";
import { ProjectAnalyticsFunnelModes } from "../components/system/project-analytics-funnel-modes.js";
import { Button } from "../components/ui/button.js";
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
  ApiRequestError,
  getProjectAnalyticsPlan,
  getProjectOrderedFunnelReport
} from "../lib/api.js";
import type { ProjectAnalyticsContext } from "./project-analytics-layout.js";

const INTEGER = new Intl.NumberFormat();

export function ProjectAnalyticsOrderedFunnelsPage(): JSX.Element {
  const { projectId, query } = useOutletContext<ProjectAnalyticsContext>();
  const last = query.last ?? "30d";
  const [plan, setPlan] = useState<AnalyticsProjectPlanRecord | null>(null);
  const [planError, setPlanError] = useState<"forbidden" | "failed" | null>(null);
  const [planAttempt, setPlanAttempt] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [result, setResult] = useState<ProjectSemanticFunnelReportResponse | null>(null);
  const [reportError, setReportError] = useState<"forbidden" | "history" | "failed" | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportAttempt, setReportAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setPlan(null);
    setPlanError(null);
    setSelectedKey(null);
    setResult(null);
    void getProjectAnalyticsPlan(projectId)
      .then((value) => {
        if (!active) return;
        setPlan(value);
        setSelectedKey(
          value.reports.find((item) => item.definition.kind === "ordered_funnel")?.definition.key ??
            null
        );
      })
      .catch((error: unknown) => {
        if (active)
          setPlanError(
            error instanceof ApiRequestError && error.status === 403 ? "forbidden" : "failed"
          );
      });
    return () => {
      active = false;
    };
  }, [projectId, planAttempt]);

  useEffect(() => {
    if (selectedKey === null) return;
    let active = true;
    setReportLoading(true);
    setReportError(null);
    setResult(null);
    void getProjectOrderedFunnelReport(projectId, selectedKey, last)
      .then((value) => {
        if (active) setResult(value);
      })
      .catch((error: unknown) => {
        if (active)
          setReportError(
            error instanceof ApiRequestError && error.status === 403
              ? "forbidden"
              : error instanceof ApiRequestError &&
                  error.code === "analytics_report_insufficient_history"
                ? "history"
                : "failed"
          );
      })
      .finally(() => {
        if (active) setReportLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, selectedKey, last, reportAttempt]);

  const definitions =
    plan?.reports.filter((item) => item.definition.kind === "ordered_funnel") ?? [];
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsSectionHeader
        title="Ordered funnels"
        description="Follow the same subjects through the defined steps in order."
        isLoading={reportLoading}
        onRefresh={() =>
          plan === null ? setPlanAttempt((n) => n + 1) : setReportAttempt((n) => n + 1)
        }
      />
      <ProjectAnalyticsFunnelModes projectId={projectId} value="ordered" />
      <Notice title="Project scope">
        This report includes all services and environments in this project.
      </Notice>
      {plan === null && planError === null ? <Skeleton className="h-40 w-full" /> : null}
      {planError !== null ? (
        <Notice
          title={
            planError === "forbidden"
              ? "Report access required"
              : "Could not load funnel definitions"
          }
          tone={planError === "failed" ? "destructive" : "info"}
        >
          {planError === "forbidden" ? (
            "A project owner or admin can review ordered funnel definitions."
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPlanAttempt((n) => n + 1)}
            >
              Retry funnel definitions
            </Button>
          )}
        </Notice>
      ) : null}
      {plan !== null && definitions.length === 0 ? (
        <Notice title="No ordered funnels">
          Create an ordered funnel in the measurement plan to follow ordered completion.
        </Notice>
      ) : null}
      {definitions.length > 0 ? (
        <div className="flex flex-col gap-4">
          {definitions.length > 1 ? (
            <Select value={selectedKey ?? ""} onValueChange={setSelectedKey}>
              <SelectTrigger aria-label="Ordered funnel">
                <SelectValue placeholder="Choose a funnel" />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {definitions.map((item) => (
                    <SelectItem key={item.definition.key} value={item.definition.key}>
                      {item.definition.display_name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : null}
          <h3 className="text-lg font-semibold">
            {
              definitions.find((item) => item.definition.key === selectedKey)?.definition
                .display_name
            }
          </h3>
          {reportLoading && result === null ? <Skeleton className="h-48 w-full" /> : null}
          {reportError !== null ? (
            <Notice
              title={
                reportError === "forbidden"
                  ? "Report access required"
                  : reportError === "history"
                    ? "More history needed"
                    : "Could not load ordered funnel"
              }
              tone={reportError === "failed" ? "destructive" : "info"}
            >
              {reportError === "forbidden" ? (
                "A project owner or admin can read this report."
              ) : reportError === "history" ? (
                "This time window begins before the funnel definition became available. Choose a shorter window after more history is collected."
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setReportAttempt((n) => n + 1)}
                >
                  Retry ordered funnel
                </Button>
              )}
            </Notice>
          ) : null}
          {result !== null ? <OrderedFunnelResult result={result} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function OrderedFunnelResult({
  result
}: {
  result: ProjectSemanticFunnelReportResponse;
}): JSX.Element {
  if (result.report.status === "unavailable") {
    const reason = result.report.reason.replaceAll("_", " ");
    return (
      <Notice title="Ordered funnel unavailable">
        The report cannot be calculated yet: {reason}.
      </Notice>
    );
  }
  const { report, evidence } = result;
  return (
    <div className="flex flex-col gap-4">
      <Notice
        title={
          report.quality === "exact"
            ? "Measurement coverage verified"
            : "Partial measurement coverage"
        }
        tone={report.quality === "exact" ? "success" : "warning"}
      >
        Source coverage is {evidence.source_coverage}. Unprojected events: {evidence.pending_events}
        {evidence.failed_events !== "0" ? ` (${evidence.failed_events} failed processing)` : ""};
        lost events: {evidence.lost_events}; excluded events: {evidence.excluded_events}; erasure
        tasks: {evidence.erasure_tasks}. Observed through{" "}
        {new Date(report.observation_cutoff).toLocaleString()}.
      </Notice>
      <p>
        {INTEGER.format(report.population.completed)} of {INTEGER.format(report.population.entered)}{" "}
        entered{" "}
        {report.subject === "session"
          ? "sessions"
          : report.subject === "anonymous"
            ? "anonymous subjects"
            : report.subject === "user"
              ? "users"
              : "accounts"}{" "}
        completed. Open: {INTEGER.format(report.population.open)}; expired:{" "}
        {INTEGER.format(report.population.expired)}; unknown:{" "}
        {INTEGER.format(report.population.unknown)}.
      </p>
      <div className="overflow-x-auto" role="region" aria-label="Ordered funnel step results">
        <Table aria-label="Ordered funnel steps">
          <TableHeader>
            <TableRow>
              <TableHead>Step</TableHead>
              <TableHead className="text-right">Reached sessions</TableHead>
              <TableHead className="text-right">Of entered</TableHead>
              <TableHead className="text-right">Of previous step</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.steps.map((step) => (
              <TableRow key={step.key}>
                <TableCell className="font-medium">{step.key}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {INTEGER.format(step.reached)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {step.overall === null
                    ? "—"
                    : `${step.overall.numerator}/${step.overall.denominator}`}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {step.previous === null
                    ? "—"
                    : `${step.previous.numerator}/${step.previous.denominator}`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
