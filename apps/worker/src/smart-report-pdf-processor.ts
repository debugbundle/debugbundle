import { createReportPdfStore } from "../../../packages/storage/src/report-pdf-store.js";
import { renderReportPdfInChild } from "../../../packages/smart-reports/src/report-pdf-process.js";
import { reportDashboardLocation } from "../../../packages/smart-reports/src/report-navigation.js";
import type { ReportContentView } from "../../../packages/smart-reports/src/report-content.js";
import type {
  Queryable,
  ObjectStoreClient,
  ObjectStoreReader
} from "../../../packages/storage/src/types.js";
/** Invoked by the existing serial report lane; never the incident/delivery lane. */
export async function processNextSmartReportPdfJob(input: {
  db: Queryable;
  objects: ObjectStoreClient & ObjectStoreReader;
  render?: (view: ReportContentView) => Promise<Buffer>;
  dashboardBaseUrl?: string;
}): Promise<{ processed: boolean }> {
  return createReportPdfStore(input.db, input.objects).processNext(
    input.render ??
      ((view) =>
        renderReportPdfInChild(
          view,
          input.dashboardBaseUrl === undefined
            ? {}
            : {
                onlineReportUrl: reportDashboardLocation(
                  view.document.report.organization_id,
                  view.document.run_id,
                  input.dashboardBaseUrl
                )
              }
        ))
  );
}
