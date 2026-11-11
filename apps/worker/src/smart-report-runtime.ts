import { createReportCollectorStore } from "../../../packages/storage/src/report-collector-store.js";
import { createImprovementReviewScheduler } from "../../../packages/storage/src/improvement-review-scheduler.js";
import { maintainImprovementReviews } from "../../../packages/storage/src/improvement-review-retention.js";
import { configureImprovementReviews } from "../../../packages/smart-improvements/src/runtime-config.js";
import { processNextImprovementReview } from "./improvement-review-processor.js";
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
  const reviews = configureImprovementReviews(input.env),
    reviewScheduler = createImprovementReviewScheduler(input.db);
  let nextReviewScheduleAt = 0;
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
    config.enabled
      ? processNextSmartReportJob({ db: input.db, objects: input.objects, model: config.model })
      : Promise.resolve({ processed: false });
  async function email(): Promise<{ processed: boolean }> {
    if (!config.enabled || !emailSend || Date.now() < nextEmailAt) return { processed: false };
    const result = await emails.processNext(emailSend);
    nextEmailAt = result.processed ? 0 : Date.now() + 5000;
    return result;
  }
  async function review(): Promise<{ processed: boolean }> {
    if (!reviews.enabled) return { processed: false };
    let scheduled = false;
    if (Date.now() >= nextReviewScheduleAt) {
      scheduled = (await reviewScheduler.scheduleNext()).processed;
      nextReviewScheduleAt = Date.now() + 5000;
    }
    return {
      processed:
        (await processNextImprovementReview({ db: input.db, model: reviews.model })).processed ||
        scheduled
    };
  }
  const tasks = [pdf, generate, email, review];
  return async () => {
    try {
      let maintained = false,
        cleaned = false,
        pruned = 0;
      if (Date.now() >= nextMaintenanceAt) {
        // A housekeeping failure still surfaces, but must not starve existing
        // PDF/report work on every pass. Reads independently enforce expiry.
        nextMaintenanceAt = Date.now() + 60000;
        maintained = await maintainNextReportRun(input.db);
        maintained = (await maintainImprovementReviews(input.db)) || maintained;
        cleaned = await artifacts.cleanupNext(input.objects);
        pruned = await emails.prune();
        nextMaintenanceAt = maintained || cleaned || pruned > 0 ? 0 : Date.now() + 60000;
      }
      if (!config.enabled && !reviews.enabled) {
        const prepared = await pdf();
        return { processed: maintained || cleaned || pruned > 0 || prepared.processed };
      }
      let collected = false;
      if (config.enabled && Date.now() >= nextCollectionAt) {
        collected = (await collector.processNext({ now: new Date().toISOString() })).processed;
        nextCollectionAt = Date.now() + 5000;
      }
      const scheduled = config.enabled ? await scheduler.scheduleNext() : { processed: false };
      const scheduledEmail = config.enabled ? await emails.scheduleNext() : { processed: false };
      const start = nextWork;
      for (let offset = 0; offset < tasks.length; offset++) {
        const index = (start + offset) % tasks.length;
        // Advance before awaiting: a failing optional task must not repeatedly
        // prevent the other report/PDF/email tasks from getting their next turn.
        nextWork = (index + 1) % tasks.length;
        const result = await tasks[index]!();
        if (result.processed) {
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
