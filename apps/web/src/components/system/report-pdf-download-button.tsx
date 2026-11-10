import { useCallback, useEffect, useRef, useState } from "react";
import type { ReportPdfState } from "../../../../../packages/smart-reports/src/report-pdf.js";
import { reportApi, reportErrorMessage, reportScope } from "../../lib/report-api.js";
import { useReportContext } from "../../lib/use-report-context.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { PendingButton } from "./pending-button.js";

/** A click owns one download intent. Preparation reuses canonical output and
 * status reads never create another job or purchase AI. Parent keys this by
 * browser identity as well as run, so late bytes cannot download after switching. */
export function ReportPdfDownloadButton({
  organizationId,
  runId,
  pdf,
  onPdfChange,
  onError
}: {
  organizationId: string;
  runId: string;
  pdf: ReportPdfState | null;
  onPdfChange: (pdf: ReportPdfState) => void;
  onError: (message: string | null) => void;
}): JSX.Element {
  const key = `${organizationId}:${runId}`,
    current = useReportContext(key);
  const { pending, run } = usePendingAction();
  const [requested, setRequested] = useState(false),
    [pollFailed, setPollFailed] = useState(false);
  const intent = useRef<string | null>(null);
  const preparing = pdf?.status === "queued" || pdf?.status === "processing";
  const fail = useCallback(
    (reason: unknown): void => {
      if (current.current !== key) return;
      intent.current = null;
      setRequested(false);
      setPollFailed(true);
      onError(reportErrorMessage(reason));
    },
    [current, key, onError]
  );
  const download = useCallback(async (): Promise<void> => {
    try {
      const body = await reportApi.pdf.download({ ...reportScope(organizationId), runId });
      if (current.current !== key) return;
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(body)], { type: "application/pdf" })
      );
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "report.pdf";
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (reason) {
      fail(reason);
    }
  }, [organizationId, runId, current, key, fail]);
  useEffect(() => {
    if (pdf?.status !== "ready" || pending || intent.current !== key) return;
    // Consume synchronously before React/effect replay can start another save.
    intent.current = null;
    setRequested(false);
    void run(download);
  }, [pdf?.status, pending, key, run, download]);
  useEffect(() => {
    if (!preparing || pollFailed) return;
    let active = true,
      count = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = (): void => {
      timer = setTimeout(
        () => {
          void reportApi.pdf
            .status({ ...reportScope(organizationId), runId })
            .then((next) => {
              if (!active || current.current !== key) return;
              onPdfChange(next);
              if (next.status === "queued" || next.status === "processing") {
                count++;
                poll();
              } else if (next.status === "failed" || next.status === "not_requested") {
                intent.current = null;
                setRequested(false);
                setPollFailed(true);
                onError(
                  "PDF preparation failed. Try Download PDF again; the online report remains available."
                );
              }
            })
            .catch((reason: unknown) => {
              if (active) fail(reason);
            });
        },
        count < 15 ? 2000 : 5000
      );
    };
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [preparing, pollFailed, organizationId, runId, current, key, onPdfChange, onError, fail]);
  const start = (): void => {
    void run(async () => {
      onError(null);
      try {
        if (pdf?.status === "ready") {
          await download();
          return;
        }
        intent.current = key;
        setRequested(true);
        setPollFailed(false);
        if (preparing) return;
        const next = await reportApi.pdf.request({ ...reportScope(organizationId), runId });
        if (current.current !== key) return;
        onPdfChange(next);
        if (next.status === "failed" || next.status === "not_requested") {
          intent.current = null;
          setRequested(false);
          onError(
            "PDF preparation failed. Try Download PDF again; the online report remains available."
          );
        }
      } catch (reason) {
        fail(reason);
      }
    });
  };
  return (
    <PendingButton
      pending={pending || requested || (preparing && !pollFailed)}
      pendingLabel="Preparing PDF..."
      onClick={start}
    >
      Download PDF
    </PendingButton>
  );
}
