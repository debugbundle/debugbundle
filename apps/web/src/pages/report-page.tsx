import { useReportContext } from "../lib/use-report-context.js";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import type { ReportRunRecord } from "../../../../packages/smart-reports/src/report-run.js";
import type { ReportContentView } from "../../../../packages/smart-reports/src/report-content.js";
import type { ReportPdfState } from "../../../../packages/smart-reports/src/report-pdf.js";
import {
  reportApi,
  reportScope,
  reportErrorMessage,
  reportHtmlUrl,
  reportPdfFileUrl
} from "../lib/report-api.js";
import { useSession } from "../lib/session.js";
import { listProjects, type ProjectRecord } from "../lib/api.js";
import { reportManageableProjects } from "../lib/report-access.js";
import { ReportRunActions } from "../components/system/report-run-actions.js";
import { usePendingAction } from "../lib/use-pending-action.js";
import { ReportContentView as ContentView } from "../components/system/report-content-view.js";
import { PageHeader } from "../components/system/page-header.js";
import { PendingButton } from "../components/system/pending-button.js";
import { LoadErrorCallout } from "../components/system/load-error-callout.js";
import { Button } from "../components/ui/button.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { ReportDeliveryStates } from "../components/system/report-delivery-states.js";
import type { ReportEmailDelivery } from "../../../../packages/smart-reports/src/report-email.js";
type Data = {
  projects: ProjectRecord[];
  key: string;
  run: ReportRunRecord;
  view: ReportContentView | null;
  pdf: ReportPdfState | null;
  deliveries: ReportEmailDelivery[] | null;
};
export function ReportPage(): JSX.Element {
  const { organizationId, runId } = useParams(),
    { session } = useSession(),
    key = `${session?.user_id}:${session?.organization_id}:${organizationId}:${runId}`,
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState<string | null>(null),
    [pdfError, setPdfError] = useState<string | null>(null),
    [revision, setRevision] = useState(0),
    { pending, run } = usePendingAction(),
    current = useReportContext(key);
  const valid = z.uuid().safeParse(organizationId).success && z.uuid().safeParse(runId).success;
  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    setPdfError(null);
    if (!valid || !organizationId || !runId) return;
    const identity = { ...reportScope(organizationId), runId };
    void reportApi.runs
      .get(identity)
      .then(async (record) => {
        const ready = ["ready", "factual_only"].includes(record.status);
        const [view, projects, pdf, deliveries] = await Promise.all([
          ready ? reportApi.runs.content(identity) : Promise.resolve(null),
          listProjects().catch(() => []),
          ready
            ? reportApi.pdf.status(identity).catch(() => {
                if (active)
                  setPdfError(
                    "PDF status could not be loaded. Refresh to try again; you can still read the report online."
                  );
                return null;
              })
            : Promise.resolve(null),
          ready && record.send_email
            ? reportApi.deliveries.list(identity).catch(() => null)
            : Promise.resolve([])
        ]);
        if (active) setData({ key, run: record, view, pdf, projects, deliveries });
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
  useEffect(() => {
    if (!organizationId || !runId || !["queued", "processing"].includes(pdfStatus ?? "")) return;
    let active = true,
      count = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = (): void => {
      timer = setTimeout(() => {
        void reportApi.pdf
          .status({ ...reportScope(organizationId), runId })
          .then((pdf) => {
            if (active && current.current === key) {
              setData((previous) => (previous?.key === key ? { ...previous, pdf } : previous));
              if (["queued", "processing"].includes(pdf.status) && ++count < 15) poll();
            }
          })
          .catch((reason) => {
            if (active && current.current === key) setPdfError(reportErrorMessage(reason));
          });
      }, 2000);
    };
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, organizationId, runId, pdfStatus]);
  const prepare = (): void => {
    if (!organizationId || !runId) return;
    const context = key;
    void run(async () => {
      setPdfError(null);
      try {
        const pdf = await reportApi.pdf.request({ ...reportScope(organizationId), runId });
        if (current.current === context)
          setData((previous) => (previous?.key === context ? { ...previous, pdf } : previous));
      } catch (reason) {
        if (current.current === context) setPdfError(reportErrorMessage(reason));
      }
    });
  };
  if (!valid) return <Notice tone="destructive">Invalid report location.</Notice>;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        description="Read the report online or download a PDF. Your project access and the report’s expiry apply to every format."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/reports">All reports</Link>
            </Button>
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
                {pdfStatus === "ready" ? (
                  <Button asChild>
                    <a href={reportPdfFileUrl(organizationId, runId)}>Download PDF</a>
                  </Button>
                ) : (
                  <PendingButton
                    pending={pending}
                    pendingLabel="Queueing PDF"
                    onClick={prepare}
                    disabled={pdfStatus === "queued" || pdfStatus === "processing"}
                  >
                    {pdfStatus === "failed" ? "Retry PDF" : "Prepare PDF"}
                  </PendingButton>
                )}
              </>
            ) : null}
          </>
        }
      />
      {error ? (
        <LoadErrorCallout
          title={error}
          pending={false}
          onRetry={() => setRevision((value) => value + 1)}
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
      {pdfError ? <Notice tone="destructive">{pdfError}</Notice> : null}
      {pdfStatus === "queued" || pdfStatus === "processing" ? (
        <Notice aria-label="PDF preparation status">
          Preparing PDF — {pdfStatus}. This does not use another generation or AI call. Refresh if
          preparation takes longer.
        </Notice>
      ) : null}
      {pdfStatus === "failed" ? (
        <Notice tone="warning">
          PDF preparation failed. You can retry after the short retry cooldown; the online report
          remains available.
        </Notice>
      ) : null}
      {!visible && !error ? <Skeleton className="h-48 w-full" /> : null}
      {visible?.view ? (
        <ContentView view={visible.view} />
      ) : visible ? (
        <Notice title={visible.run.status.replaceAll("_", " ")}>
          This report has no readable published content yet.
          {visible.run.skip_reason ? ` ${visible.run.skip_reason.replaceAll("_", " ")}.` : ""}{" "}
          Refresh to read its current status.
        </Notice>
      ) : null}
      {visible?.view && visible.run.send_email ? (
        <ReportDeliveryStates
          deliveries={visible.deliveries}
          recipientIds={visible.run.recipient_user_ids}
          {...(session?.user_id === undefined ? {} : { currentUserId: session.user_id })}
        />
      ) : null}
    </div>
  );
}
