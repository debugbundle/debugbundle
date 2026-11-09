import { FileTextIcon, HistoryIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { hasBusinessEntitlement } from "../../../../packages/shared-types/src/tier-capabilities.js";
import { ReportAllowanceCard } from "../components/system/report-allowance-card.js";
import type { ReportAllowance } from "../../../../packages/smart-reports/src/report-allowance.js";
import { useReportContext } from "../lib/use-report-context.js";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { ReportDefinitionRecord } from "../../../../packages/smart-reports/src/report-definition.js";
import type { ReportRunRecord } from "../../../../packages/smart-reports/src/report-run.js";
import { reportApi, reportScope, reportErrorMessage } from "../lib/report-api.js";
import { useSession } from "../lib/session.js";
import { listProjects, type ProjectRecord } from "../lib/api.js";
import { reportManageableProjects } from "../lib/report-access.js";
import { PageHeader } from "../components/system/page-header.js";
import { useHeaderActions } from "../components/system/header-actions-context.js";
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
  const { pathname } = useLocation();
  const { setAction: setHeaderAction } = useHeaderActions();
  const { session } = useSession(),
    hasReportAccess = hasBusinessEntitlement(session?.organization_plan, session?.self_hosted),
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
        !hasBusinessEntitlement(session.organization_plan, session.self_hosted)
      ? { to: "/billing", label: "View plans" }
      : { to: "/projects", label: "Open projects" };
  const firstDefinition = visible?.definitions[0]?.id;
  useEffect(() => {
    if (!canCreate) return;
    setHeaderAction({
      pathname,
      content: (
        <Button size="sm" asChild>
          <Link to="/reports/definitions/new">
            <PlusIcon data-icon="inline-start" />
            Create report
          </Link>
        </Button>
      )
    });
    return () => setHeaderAction(null);
  }, [canCreate, pathname, setHeaderAction]);
  useEffect(() => {
    let active = true;
    setAllowance(null);
    if (
      !firstDefinition ||
      !session ||
      !hasBusinessEntitlement(session.organization_plan, session.self_hosted)
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
      <PageHeader description="Review completed periods, resolved work and next priorities across your selected projects." />
      {!hasReportAccess ? (
        <PlanUpgradeCallout
          eyebrow="Business plan"
          title="Upgrade to unlock Smart Reports"
          description="Smart Reports are available on Business. Upgrade to review completed work, major issues and next priorities across your projects. Authorised saved reports remain available until their expiry."
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
          {hasReportAccess || visible.definitions.length > 0 ? (
            <section className="flex flex-col gap-4" aria-label="Report definitions">
              {visible.definitions.length ? (
                <h2 className="text-xl font-semibold">Report definitions</h2>
              ) : null}
              {visible.definitions.map((definition) => {
                const manage =
                  hasBusinessEntitlement(session?.organization_plan, session?.self_hosted) &&
                  definition.scope.every((item) =>
                    manageable.some((project) => project.project_id === item.project_id)
                  );
                return (
                  <Card key={definition.id}>
                    <CardHeader>
                      <CardTitle>{definition.name}</CardTitle>
                      <CardDescription>
                        {definition.cadence} · {definition.scope.length} selected projects ·{" "}
                        {definition.privacy_mode} evidence ·{" "}
                        {definition.enabled ? "Scheduled" : "Manual"}
                        {definition.next_due_at ? ` · Next delivery ${definition.next_due_at}` : ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      {definition.pause_reason || definition.requires_owner_review ? (
                        <Notice tone="warning">
                          Paused:{" "}
                          {definition.pause_reason?.replaceAll("_", " ") ?? "Owner review required"}
                          . The Owner must review access and resume this schedule.
                        </Notice>
                      ) : null}
                      {manage ? (
                        <>
                          <Button asChild variant="outline">
                            <Link to={`/reports/definitions/${definition.id}/edit`}>
                              Edit {definition.name}
                            </Link>
                          </Button>
                          <ReportDefinitionActions definition={definition} />
                        </>
                      ) : null}
                    </CardContent>
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
                            : hasBusinessEntitlement(
                                  session?.organization_plan,
                                  session?.self_hosted
                                )
                              ? "No report definitions are available for your projects yet."
                              : "Smart Reports bring together completed work and next priorities. Create new reports on Business."}
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
          {hasReportAccess || visible.runs.length > 0 || visible.cursor ? (
            <Card role="region" aria-label="Report history">
              <CardHeader>
                <CardTitle>Report history</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {visible.runs.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Report</TableHead>
                        <TableHead>Period (UTC)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Expiry</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.runs.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell>
                            <Link
                              className="underline underline-offset-4"
                              aria-label={`Open ${run.name}`}
                              to={`/reports/${run.organization_id}/${run.id}`}
                            >
                              {run.name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {run.period.starts_at.slice(0, 10)} to {run.period.ends_at.slice(0, 10)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{run.status.replaceAll("_", " ")}</Badge>
                            {run.skip_reason ? (
                              <p className="text-xs text-muted-foreground">
                                {run.skip_reason.replaceAll("_", " ")}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell>{run.expires_at?.slice(0, 10) ?? "Not published"}</TableCell>
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
        </>
      ) : null}
    </div>
  );
}
