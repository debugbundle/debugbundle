import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type {
  AnalyticsFlowDefinition,
  AnalyticsFlowDefinitionInput,
  AnalyticsFlowReport
} from "../../../../packages/shared-types/src/index.js";
import { AnalyticsFlowForm } from "../components/system/analytics-flow-form.js";
import { TableRefreshButton } from "../components/system/table-refresh-button.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../components/ui/select.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../components/ui/table.js";
import { ApiRequestError } from "../lib/api.js";
import {
  listProjectAnalyticsFlows,
  saveProjectAnalyticsFlow,
  archiveProjectAnalyticsFlow,
  getProjectAnalyticsFlowReport
} from "../lib/api-flows.js";
import type { ProjectAnalyticsContext } from "./project-analytics-layout.js";
function message(error: unknown): string {
  return error instanceof ApiRequestError && [401, 403, 404].includes(error.status)
    ? "You do not have access to this project's flow data."
    : "The request failed. Try again.";
}
export function ProjectAnalyticsFlowsPage(): JSX.Element {
  const { projectId, query, canManageFlows } = useOutletContext<ProjectAnalyticsContext>();
  const window = query.last ?? "30d";
  const [flows, setFlows] = useState<AnalyticsFlowDefinition[]>([]);
  const [selected, setSelected] = useState("");
  const [report, setReport] = useState<AnalyticsFlowReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<AnalyticsFlowDefinitionInput | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    setSelected("");
    setEditing(null);
    setReport(null);
  }, [projectId]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setReport(null);
    void listProjectAnalyticsFlows(projectId)
      .then((values) => {
        if (active) {
          setFlows(values);
          setSelected((old) =>
            values.some((flow) => flow.flow_key === old) ? old : (values[0]?.flow_key ?? "")
          );
        }
      })
      .catch((reason) => {
        if (active) {
          setFlows([]);
          setError(message(reason));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, attempt]);
  useEffect(() => {
    let active = true;
    setReport(null);
    setReportError(null);
    if (!selected || loading) {
      setReportLoading(false);
      return;
    }
    setReportLoading(true);
    void getProjectAnalyticsFlowReport(projectId, selected, window)
      .then((value) => {
        if (active) setReport(value);
      })
      .catch((reason) => {
        if (active) setReportError(message(reason));
      })
      .finally(() => {
        if (active) setReportLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, selected, window, attempt, loading]);
  const current = flows.find((flow) => flow.flow_key === selected);
  async function save(definition: AnalyticsFlowDefinitionInput): Promise<void> {
    setSaving(true);
    setSaveError(null);
    try {
      await saveProjectAnalyticsFlow(projectId, definition);
      setSelected(definition.flow_key);
      setEditing(null);
      setAttempt((n) => n + 1);
    } catch (reason) {
      setSaveError(message(reason));
    } finally {
      setSaving(false);
    }
  }
  async function archive(): Promise<void> {
    if (!current) return;
    setSaving(true);
    setSaveError(null);
    try {
      await archiveProjectAnalyticsFlow(projectId, current.flow_key);
      setAttempt((n) => n + 1);
    } catch (reason) {
      setSaveError(message(reason));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section aria-labelledby="analytics-flows-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="analytics-flows-heading" className="text-xl font-semibold">
            Acquisition and activation flows
          </h2>
          <p className="text-sm text-muted-foreground">
            Ordered steps across your sites, authentication pages and app. Reports use full UTC
            days.
          </p>
        </div>
        <div className="flex gap-2">
          <TableRefreshButton
            isLoading={loading || reportLoading}
            onRefresh={() => setAttempt((n) => n + 1)}
          />
          {canManageFlows && (
            <Button
              onClick={() => {
                setEditing("new");
                setSaveError(null);
              }}
            >
              Create flow
            </Button>
          )}
        </div>
      </div>
      <Notice tone="info" title="Partial observation">
        Your integration records steps explicitly. Missing capture, expired continuity and unlinked
        arrivals are unknown; a redirect alone does not prove successful login. Reports group
        conversions by the date the flow started and compare the current definition version.
      </Notice>
      {editing !== null && canManageFlows && (
        <Card>
          <CardContent className="pt-6">
            <AnalyticsFlowForm
              key={editing === "new" ? "new" : editing.flow_key}
              {...(editing === "new" ? {} : { initial: editing })}
              busy={saving}
              error={saveError}
              onCancel={() => setEditing(null)}
              onSave={(definition) => void save(definition)}
            />
          </CardContent>
        </Card>
      )}
      {loading ? (
        <Skeleton className="h-40 w-full" aria-label="Loading flows" />
      ) : error ? (
        <Notice tone="destructive" title="Flows unavailable">
          {error}
          <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </Button>
        </Notice>
      ) : flows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No flows yet</EmptyTitle>
            <EmptyDescription>
              {canManageFlows
                ? "Create a flow, then instrument its steps with the Browser SDK or capture API."
                : "A project owner or admin can create a flow."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Select
            value={selected}
            onValueChange={(value) => {
              setSelected(value);
              setEditing(null);
              setSaveError(null);
            }}
          >
            <SelectTrigger aria-label="Flow">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {flows.map((flow) => (
                <SelectItem key={flow.flow_key} value={flow.flow_key}>
                  {flow.display_name}
                  {flow.archived_at ? " (archived)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {current && (
            <Card>
              <CardHeader>
                <CardTitle>{current.display_name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {current.kind} · Version {current.version} · Expires after{" "}
                  {current.timeout_minutes} minutes
                </p>
                {canManageFlows && !current.archived_at && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditing({
                          flow_key: current.flow_key,
                          display_name: current.display_name,
                          kind: current.kind,
                          timeout_minutes: current.timeout_minutes,
                          steps: current.steps
                        });
                        setSaveError(null);
                      }}
                    >
                      Edit flow
                    </Button>
                    <Button variant="outline" disabled={saving} onClick={() => void archive()}>
                      Archive flow
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {saveError && editing === null && (
                  <Notice tone="destructive" title="Unable to archive flow">
                    {saveError}
                  </Notice>
                )}
                {current.archived_at && (
                  <Notice tone="info" title="Archived">
                    New capture is disabled. Retained aggregates remain available.
                  </Notice>
                )}
                {reportLoading ? (
                  <Skeleton className="h-40 w-full" aria-label="Loading flow report" />
                ) : reportError ? (
                  <Notice tone="destructive" title="Report unavailable">
                    {reportError}
                  </Notice>
                ) : (
                  report && (
                    <>
                      <p className="text-sm">
                        {report.starts.toLocaleString()} linked starts (
                        {report.previous_starts.toLocaleString()} previous period),{" "}
                        {report.completions.toLocaleString()} completions.
                      </p>
                      {report.starts === 0 && (
                        <Notice tone="info" title="No linked starts in this window">
                          Unlinked observations are shown separately. Today's starts appear after
                          the UTC day closes.
                        </Notice>
                      )}
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Step</TableHead>
                            <TableHead>Origin</TableHead>
                            <TableHead>Reached</TableHead>
                            <TableHead>Previous</TableHead>
                            <TableHead>Drop-off</TableHead>
                            <TableHead>Unlinked</TableHead>
                            <TableHead>Average time from previous step</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.steps.map((step, index) => (
                            <TableRow key={step.step_key}>
                              <TableCell>{step.display_name}</TableCell>
                              <TableCell>{report.flow.steps[index]?.origin}</TableCell>
                              <TableCell>{step.reached.toLocaleString()}</TableCell>
                              <TableCell>{step.previous_reached.toLocaleString()}</TableCell>
                              <TableCell>
                                {index === report.steps.length - 1
                                  ? "—"
                                  : step.dropoff.toLocaleString()}
                              </TableCell>
                              <TableCell>{step.unlinked.toLocaleString()}</TableCell>
                              <TableCell>
                                {step.average_seconds === null
                                  ? "—"
                                  : `${Math.round(step.average_seconds)}s`}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <h3 className="font-medium">Sources</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Source</TableHead>
                            <TableHead>Campaign</TableHead>
                            <TableHead>Starts</TableHead>
                            <TableHead>Completions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.sources.map((source) => (
                            <TableRow key={JSON.stringify([source.source, source.campaign])}>
                              <TableCell>{source.source}</TableCell>
                              <TableCell>{source.campaign || "—"}</TableCell>
                              <TableCell>{source.starts.toLocaleString()}</TableCell>
                              <TableCell>{source.completions.toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {report.coverage.sources_truncated && (
                        <p className="text-sm text-muted-foreground">
                          Showing the top 50 source/campaign pairs.
                        </p>
                      )}
                    </>
                  )
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </section>
  );
}
