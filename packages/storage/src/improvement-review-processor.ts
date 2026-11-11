import { createImprovementReviewExecutionStore } from "./improvement-review-execution.js";
import { createImprovementReviewAttemptStore } from "./improvement-review-attempts.js";
import { createWorkerJobStore } from "./worker-job-store.js";
import { readReportIdentities } from "./report-identity-store.js";
import { ReviewFactsSchema, ReviewGuidanceSchema } from "../../smart-improvements/src/review.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import {
  maximumReportRunCost,
  ReportAttemptProfileSchema
} from "../../smart-reports/src/model-cost.js";
import type { ReviewModelClient } from "../../smart-improvements/src/model-client.js";
import type { Queryable } from "./types.js";

/** Runs in the existing serial report lane. A paid intent always wins over a
 * generic job retry: recovery reuses validated output or publishes safe facts. */
export async function processNextImprovementReview(input: {
  db: Queryable;
  model: ReviewModelClient | null;
}): Promise<{ processed: boolean }> {
  const execution = createImprovementReviewExecutionStore(input.db),
    attempts = createImprovementReviewAttemptStore(input.db),
    jobs = createWorkerJobStore(input.db);
  const claim = await execution.claimNext();
  if (!claim) return { processed: false };
  const heartbeat: { renewal: Promise<void> | null } = { renewal: null };
  let lost = false;
  const timer = setInterval(() => {
    if (heartbeat.renewal) return;
    heartbeat.renewal = jobs
      .renew(claim)
      .catch(() => {
        lost = true;
      })
      .finally(() => {
        heartbeat.renewal = null;
      });
  }, 60000);
  timer.unref();
  const check = async (): Promise<void> => {
    if (heartbeat.renewal) await heartbeat.renewal;
    if (lost) throw new Error("review_lease_lost");
    await execution.check(claim);
  };
  try {
    await execution.bind(claim);
    const row = await execution.facts(claim),
      facts = ReviewFactsSchema.parse(row["facts"]);
    if (facts.sources.length === 0) {
      await execution.publish(claim, {
        status:
          facts.analytics.sessions === null && facts.health.total_checks === 0
            ? "no_data"
            : "no_change",
        reason: null
      });
      return { processed: true };
    }
    const existing = await attempts.read(String(row["id"]));
    if (row["paid_attempts"] === 1) {
      if (!existing) throw new Error("review_paid_receipt_missing");
      if (existing["state"] === "sending" || existing["state"] === "uncertain") {
        await attempts.settle(String(existing["id"]), {
          state: "uncertain",
          maximum_nano_usd: maximumReportRunCost(
            ReportAttemptProfileSchema.parse(existing["profile"])
          ).attempt_nano_usd
        });
        await execution.publish(claim, { status: "factual_only", reason: "model_uncertain" });
      } else if (existing["state"] === "succeeded" && existing["validated_guidance"] !== null) {
        const guidance = ReviewGuidanceSchema.safeParse(existing["validated_guidance"]);
        await execution.publish(claim, {
          status: guidance.success ? "ready" : "factual_only",
          reason: guidance.success ? null : "model_rejected",
          guidance: guidance.success ? guidance.data : null
        });
      } else await execution.publish(claim, { status: "factual_only", reason: "model_rejected" });
      return { processed: true };
    }
    if (await execution.unchanged(row)) {
      await execution.publish(claim, { status: "no_change", reason: null });
      return { processed: true };
    }
    if (!input.model) {
      await execution.publish(claim, { status: "factual_only", reason: "model_unavailable" });
      return { processed: true };
    }
    if (!(await execution.reserve(claim))) {
      await execution.publish(claim, { status: "skipped_quota", reason: "quota" });
      return { processed: true };
    }
    await check();
    const identities = [
      ...new Set([
        ...(row["identities"] as string[]),
        ...(await readReportIdentities(input.db, row["accepted_scope"]))
      ])
    ];
    let prepared: Awaited<ReturnType<ReviewModelClient["prepare"]>>;
    try {
      prepared = await input.model.prepare({ facts, identities });
    } catch {
      await execution.publish(claim, { status: "factual_only", reason: "model_unavailable" });
      return { processed: true };
    }
    let id: string | null = null;
    const outcome = await prepared.run(async () => {
      await check();
      id = await attempts.begin(claim, prepared);
    });
    if (!id) throw new Error("review_paid_intent_missing");
    const result = await attempts.settle(String(id), outcome);
    await execution.publish(claim, {
      status: result.state === "succeeded" && result.guidance ? "ready" : "factual_only",
      reason:
        result.state === "succeeded" && result.guidance
          ? null
          : result.state === "uncertain"
            ? "model_uncertain"
            : "model_rejected",
      guidance: result.guidance
    });
    return { processed: true };
  } catch (error) {
    if (error instanceof SmartReportError || claim.attempts >= 8)
      await execution.stop(claim, error instanceof SmartReportError).catch(() => jobs.fail(claim));
    else await jobs.fail(claim);
    throw new Error("improvement_review_unavailable");
  } finally {
    clearInterval(timer);
    if (heartbeat.renewal) await heartbeat.renewal;
  }
}
