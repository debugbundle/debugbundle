import { MetadataSeparator } from "../components/system/metadata-separator.js";
import { FileTextIcon, HistoryIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { hasReportEntitlement } from "../../../../packages/shared-types/src/tier-capabilities.js";
import { ReportAllowanceCard } from "../components/system/report-allowance-card.js";
import type { ReportAllowance } from "../../../../packages/smart-reports/src/report-allowance.js";
import { useReportContext } from "../lib/use-report-context.js";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ReportDefinitionRecord } from "../../../../packages/smart-reports/src/report-definition.js";
import type { ReportRunRecord } from "../../../../packages/smart-reports/src/report-run.js";
import { reportApi, reportScope, reportErrorMessage } from "../lib/report-api.js";
import { useSession } from "../lib/session.js";
import { listProjects, type ProjectRecord } from "../lib/api.js";
import { reportManageableProjects } from "../lib/report-access.js";
import { PageHeader } from "../components/system/page-header.js";
import { LoadErrorCallout } from "../components/system/load-error-callout.js";
import { PlanUpgradeCallout } from "../components/system/plan-upgrade-callout.js";
import { ReportDefinitionActions } from "../components/system/report-definition-actions.js";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { Badge } from "../components/ui/badge.js";
import { TitleBadgeRow } from "../components/system/title-badge-row.js";
import { ReportRunStatus } from "../components/system/report-run-status.js";
import {
  reportPeriodLabel,
  reportDateLabel,
  reportTimeLabel
} from "../../../../packages/smart-reports/src/report-presentation.js";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell
} from "../components/ui/table.js";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent
} from "../components/ui/empty.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
type Data = {
  key: string;
  definitions: ReportDefinitionRecord[];
  runs: ReportRunRecord[];
  cursor: string | null;
  projects: ProjectRecord[];
};
export function ReportsPage(): JSX.Element {
  const { session } = useSession(),
    hasReportAccess = hasReportEntitlement(session?.organization_plan, session?.self_hosted),
    key = `${session?.user_id}:${session?.organization_id}:${session?.organization_plan}:${Boolean(session?.self_hosted)}`,
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState<string | null>(null),
    [allowance, setAllowance] = useState<{
      key: string;
      value: ReportAllowance | null;
      error: boolean;
    } | null>(null),
    [revision, setRevision] = useState(0),
    [loadingMore, setLoadingMore] = useState(false),
    current = useReportContext(key);
  useEffect(() => {
    let active = true;
    setData(null);
    setLoadingMore(false);
    setError(null);
    if (!session) return;
    const scope = reportScope(session.organization_id);
    void Promise.all([
      reportApi.definitions.list(scope),
      reportApi.runs.list(scope),
      listProjects()
    ])
      .then(([definitions, history, projects]) => {
        if (active)
          setData({ key, definitions, runs: history.runs, cursor: history.next_cursor, projects });
      })
      .catch((reason) => {
        if (active) setError(reportErrorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [key, revision, session?.organization_id]);
  const visible = data?.key === key ? data : null,
    manageable = session && visible ? reportManageableProjects(visible.projects, session) : [],
    canCreate = hasReportAccess && manageable.length > 0;
  const emptyAction = canCreate
    ? { to: "/reports/definitions/new", label: "Create report" }
    : session?.role === "owner" &&
        !hasReportEntitlement(session.organization_plan, session.self_hosted)
      ? { to: "/billing", label: "View plans" }
      : { to: "/projects", label: "Open projects" };
  const firstDefinition = visible?.definitions[0]?.id;

  useEffect(() => {
    let active = true;
    setAllowance(null);
    if (
      !firstDefinition ||
      !session ||
      !hasReportEntitlement(session.organization_plan, session.self_hosted)
    )
      return;
    void reportApi.definitions
      .allowance({ ...reportScope(session.organization_id), definitionId: firstDefinition })
      .then((value) => {
        if (active) setAllowance({ key, value, error: false });
      })
      .catch(() => {
        if (active) setAllowance({ key, value: null, error: true });
      });
    return () => {
      active = false;
    };
  }, [key, firstDefinition, revision, session?.organization_plan, session?.self_hosted]);
  const more = (): void => {
    if (!visible?.cursor || loadingMore || !session) return;
    const context = key;
    setLoadingMore(true);
    void reportApi.runs
      .list({ ...reportScope(session.organization_id), cursor: visible.cursor })
      .then((history) => {
        if (current.current === context)
          setData((previous) =>
            previous?.key === context
              ? {
                  ...previous,
                  runs: [
                    ...previous.runs,
                    ...history.runs.filter(
                      (run) => !previous.runs.some((item) => item.id === run.id)
                    )
                  ],
                  cursor: history.next_cursor
                }
              : previous
          );
      })
      .catch((reason) => {
        if (current.current === context) setError(reportErrorMessage(reason));
      })
      .finally(() => {
        if (current.current === context) setLoadingMore(false);
      });
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Review completed periods, resolved work and next priorities across your selected projects."
        actions={
          canCreate ? (
            <Button asChild>
              <Link to="/reports/definitions/new">
                <PlusIcon data-icon="inline-start" />
                Create report
              </Link>
            </Button>
          ) : undefined
        }
      />
      {!hasReportAccess ? (
        <PlanUpgradeCallout
          eyebrow="Paid plans"
          title="Upgrade to unlock reports"
          description="Reports are available on Solo, Team and Business. Solo and Team include factual reports; Business adds Smart Reports with AI analysis. Authorised saved reports remain available until their expiry."
        />
      ) : null}
      {error ? (
        <LoadErrorCallout
          title={error}
          pending={false}
          onRetry={() => setRevision((value) => value + 1)}
        />
      ) : null}
      {!visible && !error && hasReportAccess ? <Skeleton className="h-48 w-full" /> : null}
      {visible ? (
        <>
          <ReportAllowanceCard
            value={allowance?.key === key ? allowance.value : null}
            error={allowance?.key === key && allowance.error}
          />
          {hasReportAccess || visible.runs.length > 0 || visible.cursor ? (
            <Card role="region" aria-label="Report history">
              <CardHeader>
                <CardTitle>Report history</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {visible.runs.length ? (
                  <Table className="min-w-160 table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-5/12">Report</TableHead>
                        <TableHead className="w-1/4">Period (UTC)</TableHead>
                        <TableHead className="w-1/6">Status</TableHead>
                        <TableHead className="w-1/6">Expiry</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.runs.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell className="break-words whitespace-normal">
                            <Link
                              className="underline underline-offset-4"
                              aria-label={`Open ${run.name}`}
                              to={`/reports/${run.organization_id}/${run.id}`}
                            >
                              {run.name}
                            </Link>
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {reportPeriodLabel(run.period)}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            <ReportRunStatus
                              run={run}
                              description={
                                ["skipped_quota", "paused_access", "failed"].includes(run.status)
                                  ? "tooltip"
                                  : "none"
                              }
                            />
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {run.expires_at
                              ? `Expires ${reportDateLabel(run.expires_at)}`
                              : "Not published"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <HistoryIcon />
                      </EmptyMedia>
                      <EmptyTitle>No retained reports</EmptyTitle>
                      <EmptyDescription>
                        Completed reports appear here when your current access covers their entire
                        saved scope.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
                {visible.cursor ? (
                  <Button variant="outline" onClick={more} disabled={loadingMore}>
                    {loadingMore ? "Loading reports" : "Load more reports"}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          {hasReportAccess || visible.definitions.length > 0 ? (
            <section className="flex flex-col gap-4" aria-label="Saved reports">
              {visible.definitions.length ? (
                <h2 className="text-xl font-semibold">Saved reports</h2>
              ) : null}
              {visible.definitions.map((definition) => {
                const manage =
                  hasReportEntitlement(session?.organization_plan, session?.self_hosted) &&
                  definition.scope.every((item) =>
                    manageable.some((project) => project.project_id === item.project_id)
                  );
                return (
                  <Card key={definition.id}>
                    <CardHeader>
                      <TitleBadgeRow
                        actionsClassName="ml-0 basis-full justify-start sm:ml-auto sm:basis-auto sm:justify-end"
                        title={<CardTitle>{definition.name}</CardTitle>}
                        badges={
                          <Badge variant="outline">
                            {definition.pause_reason || definition.requires_owner_review
                              ? "Paused"
                              : definition.enabled
                                ? "Scheduled"
                                : "Manual"}
                          </Badge>
                        }
                        actions={
                          manage ? (
                            <>
                              <ReportDefinitionActions definition={definition} />
                              <Button asChild variant="ghost">
                                <Link
                                  aria-label={`Edit ${definition.name} settings`}
                                  to={`/reports/definitions/${definition.id}/edit`}
                                >
                                  Edit settings
                                </Link>
                              </Button>
                            </>
                          ) : null
                        }
                      />
                      <CardDescription>
                        {definition.cadence.charAt(0).toUpperCase() + definition.cadence.slice(1)}
                        <MetadataSeparator />
                        {definition.scope.length}{" "}
                        {definition.scope.length === 1 ? "project" : "projects"}
                        <MetadataSeparator />
                        {definition.privacy_mode === "full"
                          ? "Full evidence"
                          : "Restricted evidence"}
                        {definition.next_due_at && !definition.pause_reason ? (
                          <>
                            <span className="mt-1 block sm:mt-0 sm:inline">
                              <span className="hidden sm:inline">
                                <MetadataSeparator />
                              </span>
                              Next delivery {reportTimeLabel(definition.next_due_at)}
                            </span>
                          </>
                        ) : (
                          ""
                        )}
                      </CardDescription>
                    </CardHeader>
                    {definition.pause_reason || definition.requires_owner_review ? (
                      <CardContent className="flex flex-col gap-4">
                        <Notice tone="warning">
                          Paused:{" "}
                          {definition.pause_reason?.replaceAll("_", " ") ?? "Owner review required"}
                          . The Owner must review access and resume this schedule.
                        </Notice>
                      </CardContent>
                    ) : null}
                  </Card>
                );
              })}
              {!visible.definitions.length ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Report definitions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <FileTextIcon />
                        </EmptyMedia>
                        <EmptyTitle>No report definitions</EmptyTitle>
                        <EmptyDescription>
                          {canCreate
                            ? "Create a report to review resolved work and priorities across your selected projects."
                            : hasReportEntitlement(session?.organization_plan, session?.self_hosted)
                              ? "No report definitions are available for your projects yet."
                              : "Reports bring together completed work and next priorities. Create reports on a paid plan."}
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <Button asChild variant={canCreate ? "default" : "outline"}>
                          <Link to={emptyAction.to}>
                            {canCreate ? <PlusIcon data-icon="inline-start" /> : null}
                            {emptyAction.label}
                            {!canCreate ? <ChevronRightIcon data-icon="inline-end" /> : null}
                          </Link>
                        </Button>
                      </EmptyContent>
                    </Empty>
                  </CardContent>
                </Card>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
