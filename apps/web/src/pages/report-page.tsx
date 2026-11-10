import { useReportContext } from "../lib/use-report-context.js";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { z } from "zod";
import type { ReportRunRecord } from "../../../../packages/smart-reports/src/report-run.js";
import type { ReportContentView } from "../../../../packages/smart-reports/src/report-content.js";
import type { ReportPdfState } from "../../../../packages/smart-reports/src/report-pdf.js";
import { reportApi, reportScope, reportErrorMessage, reportHtmlUrl } from "../lib/report-api.js";
import { useSession } from "../lib/session.js";
import { listProjects, type ProjectRecord } from "../lib/api.js";
import { reportManageableProjects } from "../lib/report-access.js";
import { ReportRunActions } from "../components/system/report-run-actions.js";
import { ReportContentView as ContentView } from "../components/system/report-content-view.js";
import { PageHeader } from "../components/system/page-header.js";
import {
  reportRunPresentation,
  reportPeriodLabel
} from "../../../../packages/smart-reports/src/report-presentation.js";
import { TitleBadgeRow } from "../components/system/title-badge-row.js";
import { ReportRunStatus } from "../components/system/report-run-status.js";
import { ReportPdfDownloadButton } from "../components/system/report-pdf-download-button.js";
import { LoadErrorCallout } from "../components/system/load-error-callout.js";
import { Button } from "../components/ui/button.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { ReportDeliveryStates } from "../components/system/report-delivery-states.js";
import type { ReportEmailDelivery } from "../../../../packages/smart-reports/src/report-email.js";
import { ReportApiError } from "../../../../packages/report-client/src/index.js";
type Data = {
  projects: ProjectRecord[];
  key: string;
  run: ReportRunRecord;
  view: ReportContentView | null;
  pdf: ReportPdfState | null;
  deliveries: ReportEmailDelivery[] | null;
};
/** Read only the saved outputs. A slow/private object read can be retried
 * independently of generation, without preparing PDF or buying more analysis. */
async function readOutputs(
  identity: Parameters<typeof reportApi.runs.get>[0],
  record: ReportRunRecord
): Promise<Pick<Data, "view" | "pdf" | "deliveries"> & { pdfUnavailable: boolean }> {
  if (!["ready", "factual_only"].includes(record.status))
    return { view: null, pdf: null, deliveries: [], pdfUnavailable: false };
  let pdfUnavailable = false;
  const [view, pdf, deliveries] = await Promise.all([
    reportApi.runs.content(identity),
    reportApi.pdf.status(identity).catch(() => {
      pdfUnavailable = true;
      return null;
    }),
    record.send_email ? reportApi.deliveries.list(identity).catch(() => null) : Promise.resolve([])
  ]);
  return { view, pdf, deliveries, pdfUnavailable };
}
const pdfUnavailableMessage =
  "PDF status could not be loaded. Refresh to try again; you can still read the report online.";
export function ReportPage(): JSX.Element {
  const { organizationId, runId } = useParams(),
    { session } = useSession(),
    key = `${session?.user_id}:${session?.organization_id}:${organizationId}:${runId}`,
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState<string | null>(null),
    [pdfError, setPdfError] = useState<string | null>(null),
    [statusError, setStatusError] = useState<string | null>(null),
    [revision, setRevision] = useState(0),
    current = useReportContext(key);
  const valid = z.uuid().safeParse(organizationId).success && z.uuid().safeParse(runId).success;
  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    setPdfError(null);
    setStatusError(null);
    if (!valid || !organizationId || !runId) return;
    const identity = { ...reportScope(organizationId), runId };
    void reportApi.runs
      .get(identity)
      .then(async (record) => {
        const [outputs, projects] = await Promise.all([
          readOutputs(identity, record),
          listProjects().catch(() => [])
        ]);
        if (active) {
          if (outputs.pdfUnavailable) setPdfError(pdfUnavailableMessage);
          setData({ key, run: record, ...outputs, projects });
        }
      })
      .catch((reason) => {
        if (active) setError(reportErrorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [key, revision, valid, organizationId, runId]);
  const visible = data?.key === key ? data : null,
    pdfStatus = visible?.pdf?.status;
  const manageable = session && visible ? reportManageableProjects(visible.projects, session) : [],
    canManage =
      visible !== null &&
      visible.run.scope.every((item) =>
        manageable.some((project) => project.project_id === item.project_id)
      );
  const generationStatus = visible?.run.status,
    generating = generationStatus === "queued" || generationStatus === "processing";
  useEffect(() => {
    if (!organizationId || !runId || !generating) return;
    let active = true,
      inFlight = false,
      checks = 0,
      failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const identity = { ...reportScope(organizationId), runId };
    const available = (): boolean => document.visibilityState !== "hidden" && navigator.onLine;
    const schedule = (): void => {
      if (!active || !available()) return;
      clearTimeout(timer);
      const delay = failures
        ? Math.min(30000, 2000 * 2 ** Math.min(failures, 4))
        : checks < 15
          ? 2000
          : 5000;
      timer = setTimeout(() => {
        void check();
      }, delay);
    };
    const check = async (): Promise<void> => {
      if (!active || inFlight || !available()) return;
      inFlight = true;
      let again = true;
      checks++;
      try {
        const record = await reportApi.runs.get(identity);
        if (!active || current.current !== key) return;
        if (["queued", "processing"].includes(record.status))
          setData((previous) => (previous?.key === key ? { ...previous, run: record } : previous));
        else {
          const outputs = await readOutputs(identity, record);
          if (!active || current.current !== key) return;
          setData((previous) =>
            previous?.key === key ? { ...previous, run: record, ...outputs } : previous
          );
          if (outputs.pdfUnavailable) setPdfError(pdfUnavailableMessage);
          again = false;
        }
        failures = 0;
        setStatusError(null);
      } catch (reason) {
        if (!active || current.current !== key) return;
        if (reason instanceof ReportApiError && [400, 401, 403, 404, 410].includes(reason.status)) {
          again = false;
          setData(null);
          setError(reportErrorMessage(reason));
          setStatusError(null);
        } else {
          failures++;
          setStatusError(
            "The latest update could not be loaded. We'll keep checking automatically."
          );
        }
      } finally {
        inFlight = false;
        if (again) schedule();
      }
    };
    const resume = (): void => {
      clearTimeout(timer);
      if (available()) void check();
    };
    const offline = (): void => {
      clearTimeout(timer);
      setStatusError(
        "You're offline. We'll keep checking automatically when your connection returns."
      );
    };
    // One in-flight read, bounded intervals and backoff. Slow generation must
    // not lose auto-display after thirty seconds; hidden/offline tabs do no work.
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", offline);
    schedule();
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", offline);
    };
  }, [key, organizationId, runId, generating, revision]);
  const updatePdf = useCallback(
    (pdf: ReportPdfState): void => {
      if (current.current === key)
        setData((previous) => (previous?.key === key ? { ...previous, pdf } : previous));
    },
    [current, key]
  );
  const actions = (
    <>
      <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>
        Refresh report
      </Button>
      {visible?.view && organizationId && runId ? (
        <>
          <Button asChild variant="outline">
            <a
              href={reportHtmlUrl(organizationId, runId)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open report in new tab
            </a>
          </Button>
          <ReportPdfDownloadButton
            key={key}
            organizationId={organizationId}
            runId={runId}
            pdf={visible.pdf}
            onPdfChange={updatePdf}
            onError={setPdfError}
          />
        </>
      ) : null}
    </>
  );
  if (!valid) return <Notice tone="destructive">Invalid report location.</Notice>;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {!visible?.view ? (
        <>
          {visible ? (
            <header className="flex flex-col gap-2">
              <TitleBadgeRow
                title={<h2 className="text-2xl font-semibold">{visible.run.name}</h2>}
                badges={<ReportRunStatus run={visible.run} />}
              />
              <p className="text-sm text-muted-foreground">
                {reportPeriodLabel(visible.run.period)}
              </p>
            </header>
          ) : null}
          <PageHeader actions={actions} />
        </>
      ) : null}
      {error ? (
        <LoadErrorCallout
          title={error}
          pending={false}
          onRetry={() => setRevision((value) => value + 1)}
        />
      ) : null}
      {pdfError ? <Notice tone="destructive">{pdfError}</Notice> : null}
      {statusError ? <Notice tone="warning">{statusError}</Notice> : null}
      {pdfStatus === "failed" && !pdfError ? (
        <Notice tone="warning">
          PDF preparation failed. You can retry after the short retry cooldown; the online report
          remains available.
        </Notice>
      ) : null}
      {!visible && !error ? <Skeleton className="h-48 w-full" /> : null}
      {visible?.view ? (
        <ContentView view={visible.view} actions={actions} />
      ) : visible && generating ? (
        <Notice pending title="Generating report..." aria-label="Report generation status">
          Your report will appear here automatically when it's ready. You can leave this page open.
        </Notice>
      ) : visible ? (
        <Notice
          title={reportRunPresentation(visible.run).label}
          tone={reportRunPresentation(visible.run).tone}
        >
          {reportRunPresentation(visible.run).description} Refresh to check the latest status.
        </Notice>
      ) : null}
      {visible?.view && visible.run.send_email ? (
        <ReportDeliveryStates
          deliveries={visible.deliveries}
          recipientIds={visible.run.recipient_user_ids}
          {...(session?.user_id === undefined ? {} : { currentUserId: session.user_id })}
        />
      ) : null}
      {visible ? (
        <ReportRunActions
          key={`${key}:${visible.run.id}`}
          record={visible.run}
          canManage={canManage}
          onChanged={() => setRevision((value) => value + 1)}
        />
      ) : null}
    </div>
  );
}
