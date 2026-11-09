import { createReportCollectorStore } from "../../../packages/storage/src/report-collector-store.js";
import { configureSmartReports } from "../../../packages/smart-reports/src/report-runtime-config.js";
import { createReportSchedulerStore } from "../../../packages/storage/src/report-scheduler-store.js";
import { createReportArtifactStore } from "../../../packages/storage/src/report-artifact-store.js";
import type {
  ObjectStoreClient,
  ObjectStoreReader,
  Queryable
} from "../../../packages/storage/src/types.js";
import { processNextSmartReportJob } from "./smart-report-processor.js";
import { maintainNextReportRun } from "../../../packages/storage/src/report-run-retention.js";
import { processNextSmartReportPdfJob } from "./smart-report-pdf-processor.js";
import { createReportEmailStore } from "../../../packages/storage/src/report-email-store.js";
import { createSmartReportEmailSender } from "./smart-report-email-processor.js";
import type { ReportEmailSend } from "../../../packages/smart-reports/src/report-email.js";
/** One pass runs at most one generation, PDF or email task in the existing serial
 * report lane. Archives and cleanup continue with generation/email egress off.
 * One bounded DB collection batch runs at most every five seconds with reports enabled.
 * Empty artifact/delivery polls back off five seconds; housekeeping one minute. */
export function createSmartReportProcessor(input: {
  db: Queryable;
  objects: ObjectStoreClient & ObjectStoreReader;
  env: NodeJS.ProcessEnv;
  emailSend?: ReportEmailSend | null;
}): () => Promise<{ processed: boolean }> {
  const config = configureSmartReports(input.env);
  const scheduler = createReportSchedulerStore(input.db, {
      profile: config.profile,
      monthly_budget_nano_usd: config.monthly_budget_nano_usd
    }),
    collector = createReportCollectorStore(input.db),
    artifacts = createReportArtifactStore(input.db),
    emails = createReportEmailStore(input.db, input.objects),
    emailSend =
      input.emailSend === undefined ? createSmartReportEmailSender(input.env) : input.emailSend;
  let nextMaintenanceAt = 0,
    nextCollectionAt = 0;
  let nextPdfAt = 0,
    nextEmailAt = 0,
    nextWork = 0;
  async function pdf(): Promise<{ processed: boolean }> {
    if (Date.now() < nextPdfAt) return { processed: false };
    const result = await processNextSmartReportPdfJob({
      db: input.db,
      objects: input.objects,
      ...(input.env["APP_BASE_URL"] === undefined
        ? {}
        : { dashboardBaseUrl: input.env["APP_BASE_URL"] })
    });
    nextPdfAt = result.processed ? 0 : Date.now() + 5000;
    return result;
  }
  const generate = (): Promise<{ processed: boolean }> =>
    processNextSmartReportJob({ db: input.db, objects: input.objects, model: config.model });
  async function email(): Promise<{ processed: boolean }> {
    if (!emailSend || Date.now() < nextEmailAt) return { processed: false };
    const result = await emails.processNext(emailSend);
    nextEmailAt = result.processed ? 0 : Date.now() + 5000;
    return result;
  }
  const tasks = [pdf, generate, email];
  return async () => {
    try {
      let maintained = false,
        cleaned = false,
        pruned = 0;
      if (Date.now() >= nextMaintenanceAt) {
        maintained = await maintainNextReportRun(input.db);
        cleaned = await artifacts.cleanupNext(input.objects);
        pruned = await emails.prune();
        nextMaintenanceAt = maintained || cleaned || pruned > 0 ? 0 : Date.now() + 60000;
      }
      if (!config.enabled) {
        const prepared = await pdf();
        return { processed: maintained || cleaned || pruned > 0 || prepared.processed };
      }
      let collected = false;
      if (Date.now() >= nextCollectionAt) {
        collected = (await collector.processNext({ now: new Date().toISOString() })).processed;
        nextCollectionAt = Date.now() + 5000;
      }
      const scheduled = await scheduler.scheduleNext();
      const scheduledEmail = await emails.scheduleNext();
      for (let offset = 0; offset < tasks.length; offset++) {
        const index = (nextWork + offset) % tasks.length,
          result = await tasks[index]!();
        if (result.processed) {
          nextWork = (index + 1) % tasks.length;
          return { processed: true };
        }
      }
      return {
        processed:
          collected ||
          scheduled.processed ||
          scheduledEmail.processed ||
          cleaned ||
          maintained ||
          pruned > 0
      };
    } catch {
      throw new Error("smart_report_lane_unavailable");
    }
  };
}
