import { generateSmartReport } from "../../../packages/smart-reports/src/report-generation.js";
import { MAX_REPORT_JSON_BYTES } from "../../../packages/smart-reports/src/report-document.js";
import { SmartReportError } from "../../../packages/smart-reports/src/report-errors.js";
import type { ReportModelClient } from "../../../packages/smart-reports/src/model-client.js";
import { createWorkerJobStore } from "../../../packages/storage/src/worker-job-store.js";
import { createReportRunExecutionStore } from "../../../packages/storage/src/report-run-execution.js";
import { createReportRunManagementStore } from "../../../packages/storage/src/report-run-management.js";
import { createReportArtifactStore } from "../../../packages/storage/src/report-artifact-store.js";
import { createReportFactStore } from "../../../packages/storage/src/report-facts-store.js";
import { createReportContextCollector } from "../../../packages/storage/src/report-context-collector.js";
import { createReportModelAttemptStore } from "../../../packages/storage/src/report-model-attempt-store.js";
import type {
  ObjectStoreClient,
  ObjectStoreReader,
  Queryable
} from "../../../packages/storage/src/types.js";

/** Thin worker binding. The report package owns sequencing and recovery; stores
 * own transactional scope, quota, lease and artifact fences. The caller runs one
 * report at a time in the separate report lane, never the incident loop. */
export async function processNextSmartReportJob(input: {
  db: Queryable;
  objects: ObjectStoreClient & ObjectStoreReader;
  model: ReportModelClient | null;
}): Promise<{ processed: boolean }> {
  const jobs = createWorkerJobStore(input.db),
    execution = createReportRunExecutionStore(input.db),
    claim = await execution.claimNext();
  if (!claim) return { processed: false };
  const artifacts = createReportArtifactStore(input.db),
    attempts = createReportModelAttemptStore(input.db);
  const heartbeatState: { renewal: Promise<void> | null; error: Error | undefined } = {
    renewal: null,
    error: undefined
  };
  const heartbeat = setInterval(() => {
    if (heartbeatState.renewal) return;
    heartbeatState.renewal = execution
      .renew(claim)
      .catch(() => {
        heartbeatState.error = new Error("report_run_lease_lost");
      })
      .finally(() => {
        heartbeatState.renewal = null;
      });
  }, 60000);
  heartbeat.unref();
  try {
    await execution.bind(claim);
    await generateSmartReport(
      {
        state: () => execution.state(claim),
        check: async () => {
          if (heartbeatState.renewal) await heartbeatState.renewal;
          if (heartbeatState.error) throw heartbeatState.error;
          await execution.check(claim);
        },
        facts: () =>
          createReportFactStore(input.db).readRun({ claim, cutoff_at: new Date().toISOString() }),
        context: (report) =>
          createReportContextCollector(input.db, input.objects).collectRun({ claim, report }),
        read: (reference) =>
          input.objects.getObject({
            key: reference.key,
            maxBytes: MAX_REPORT_JSON_BYTES,
            timeoutMs: 15000
          }),
        persist: (kind, body, expires_at) =>
          artifacts.persist(claim, { kind, body, expires_at }, input.objects),
        begin: ({ attempt_id, facts_sha256, prepared }) =>
          attempts.begin(claim, {
            attempt_id,
            facts_sha256,
            request_sha256: prepared.request_hash,
            profile: prepared.profile,
            input_tokens: prepared.input_tokens
          }),
        settle: (result) => attempts.settle(result),
        complete: (options) => createReportRunManagementStore(input.db).complete(claim, options)
      },
      input.model
    );
    return { processed: true };
  } catch (error) {
    if (error instanceof SmartReportError)
      await execution.stop(claim, "paused_access").catch(() => jobs.fail(claim));
    else if (
      claim.attempts >= 8 ||
      (error instanceof Error && error.message === "report_generation_deadline_exceeded")
    )
      await execution.stop(claim, "failed").catch(() => jobs.fail(claim));
    else await jobs.fail(claim);
    throw new Error("report_generation_unavailable");
  } finally {
    clearInterval(heartbeat);
    if (heartbeatState.renewal) await heartbeatState.renewal;
  }
}
