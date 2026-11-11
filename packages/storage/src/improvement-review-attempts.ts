import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  PreparedReviewAttempt,
  ReviewModelOutcome
} from "../../smart-improvements/src/model-client.js";
import {
  ReviewFactsSchema,
  validateReviewGuidance,
  type ReviewGuidance
} from "../../smart-improvements/src/review.js";
import {
  actualReportAttemptCost,
  maximumReportRunCost,
  ReportAttemptProfileSchema,
  ReportModelUsageSchema
} from "../../smart-reports/src/model-cost.js";
import { reportModelProfile } from "../../smart-reports/src/model-request.js";
import { readReviewClaim } from "./improvement-review-execution.js";
import { requireReviewWork, type ReviewRow } from "./improvement-review-access.js";
import { readReportIdentities } from "./report-identity-store.js";
import { type WorkerJobClaim } from "./worker-job-store.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";
const nano = (value: unknown): number => z.coerce.number().int().safe().nonnegative().parse(value);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const responseId = z.string().regex(/^resp_[A-Za-z0-9_-]{1,200}$/);
export interface ImprovementReviewAttemptStore {
  read(reviewId: string): Promise<ReviewRow | null>;
  begin(claim: WorkerJobClaim, prepared: PreparedReviewAttempt): Promise<string>;
  settle(
    id: string,
    outcome: ReviewModelOutcome
  ): Promise<{ state: "succeeded" | "rejected" | "uncertain"; guidance: ReviewGuidance | null }>;
}
export function createImprovementReviewAttemptStore(db: Queryable): ImprovementReviewAttemptStore {
  return {
    async read(reviewId: string): Promise<ReviewRow | null> {
      return (
        (
          await db.query<ReviewRow>(
            "SELECT * FROM improvement_review_attempts WHERE review_id=$1",
            [z.uuid().parse(reviewId)]
          )
        ).rows[0] ?? null
      );
    },
    async begin(claim: WorkerJobClaim, prepared: PreparedReviewAttempt): Promise<string> {
      const profile = ReportAttemptProfileSchema.parse(prepared.profile),
        principal = maximumReportRunCost(profile).attempt_nano_usd;
      if (
        JSON.stringify(profile) !== JSON.stringify(reportModelProfile("gpt-6.1-terra")) ||
        prepared.maximum_nano_usd !== principal
      )
        throw new Error("review_profile_invalid");
      const requestHash = hash.parse(prepared.request_hash),
        tokens = z.number().int().min(1).max(12000).parse(prepared.input_tokens);
      return runInTransaction(db, async (tx) => {
        const row = await readReviewClaim(tx, claim, true);
        if (
          row["paid_attempts"] !== 0 ||
          row["generation_counted"] !== true ||
          nano(row["ai_reserved_nano_usd"]) !== principal ||
          row["facts_digest"] === null
        )
          throw new Error("review_attempt_not_admitted");
        const id = randomUUID();
        await tx.query(
          `INSERT INTO improvement_review_attempts(id,review_id,organization_id,window_starts_at,lease_token,request_sha256,facts_digest,profile,input_tokens,principal_nano_usd)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
          [
            id,
            row["id"],
            row["organization_id"],
            row["ai_window_starts_at"],
            claim.token,
            requestHash,
            row["facts_digest"],
            JSON.stringify(profile),
            tokens,
            principal
          ]
        );
        await tx.query("UPDATE improvement_reviews SET paid_attempts=1 WHERE id=$1", [row["id"]]);
        return id;
      });
    },
    async settle(
      id: string,
      outcome: ReviewModelOutcome
    ): Promise<{ state: "succeeded" | "rejected" | "uncertain"; guidance: ReviewGuidance | null }> {
      const route = (
        await db.query<{ organization_id: string; review_id: string | null }>(
          "SELECT organization_id,review_id FROM improvement_review_attempts WHERE id=$1",
          [z.uuid().parse(id)]
        )
      ).rows[0];
      if (!route) throw new Error("review_attempt_not_found");
      return runInTransaction(db, async (tx) => {
        await tx.query("SET LOCAL lock_timeout='5s'", []);
        await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
          route.organization_id
        ]);
        // Content deletion locks the review before clearing its attempt buffer.
        // Match that order so privacy changes cannot deadlock known settlement.
        const row = route.review_id
          ? (
              await tx.query<ReviewRow>(
                "SELECT * FROM improvement_reviews WHERE id=$1 FOR UPDATE",
                [route.review_id]
              )
            ).rows[0]
          : undefined;
        const attempt = (
          await tx.query<ReviewRow>(
            "SELECT * FROM improvement_review_attempts WHERE id=$1 FOR UPDATE",
            [id]
          )
        ).rows[0]!;
        if (outcome.state === "uncertain") {
          if (nano(attempt["principal_nano_usd"]) !== outcome.maximum_nano_usd)
            throw new Error("review_receipt_mismatch");
          if (["sending", "uncertain"].includes(String(attempt["state"])))
            await tx.query(
              "UPDATE improvement_review_attempts SET state='uncertain',diagnostic_code=COALESCE(diagnostic_code,'review_provider_outcome_unknown') WHERE id=$1",
              [id]
            );
          return { state: "uncertain", guidance: null };
        }
        const usage = ReportModelUsageSchema.parse(outcome.usage),
          profile = ReportAttemptProfileSchema.parse(attempt["profile"]);
        if (
          usage.input_tokens > profile.max_input_tokens ||
          usage.output_tokens > profile.max_output_tokens ||
          usage.input_tokens_details.cache_write_tokens_details.ttl_12h_tokens !== 0
        )
          throw new Error("review_receipt_mismatch");
        const cost = actualReportAttemptCost({
          model: profile.model,
          regional_processing: profile.regional_processing,
          usage
        });
        if (cost !== nano(outcome.cost_nano_usd) || cost > nano(attempt["principal_nano_usd"]))
          throw new Error("review_receipt_mismatch");
        // Financial identity excludes prose/privacy state. Later read projection or
        // duplicate settlement cannot rewrite this receipt after a policy change.
        const receipt = createHash("sha256")
          .update(
            JSON.stringify({
              state: outcome.state,
              usage,
              cost_nano_usd: cost,
              provider_response_id: responseId.parse(outcome.provider_response_id)
            })
          )
          .digest("hex");
        if (["succeeded", "rejected"].includes(String(attempt["state"]))) {
          if (attempt["outcome_sha256"] !== receipt) throw new Error("review_receipt_mismatch");
          return { state: attempt["state"] as "succeeded" | "rejected", guidance: null };
        }
        let guidance: ReviewGuidance | null = null,
          state: "succeeded" | "rejected" = outcome.state;
        if (outcome.state === "succeeded") {
          if (!row) state = "rejected";
          else {
            try {
              const identities = [
                ...new Set([
                  ...z.array(z.string()).parse(row["identities"]),
                  ...(await readReportIdentities(tx, row["accepted_scope"]))
                ])
              ];
              guidance = validateReviewGuidance(
                ReviewFactsSchema.parse(row["facts"]),
                outcome.guidance,
                identities
              );
            } catch {
              state = "rejected";
            }
          }
        }
        let retain = false;
        if (row && guidance && row["status"] === "processing") {
          const job = (
            await tx.query(
              "SELECT id FROM worker_jobs WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_expires_at>clock_timestamp()",
              [row["processing_job_id"], attempt["lease_token"]]
            )
          ).rows;
          if (job.length) {
            try {
              await requireReviewWork(tx, row);
              retain = true;
            } catch {
              /* Settlement still owns known usage after revocation. */
            }
          }
        }
        await tx.query(
          `UPDATE improvement_review_attempts SET state=$2,usage=$3::jsonb,cost_nano_usd=$4,outcome_sha256=$5,provider_response_id=$6,
          validated_guidance=$7::jsonb,diagnostic_code=$8,settled_at=clock_timestamp() WHERE id=$1`,
          [
            id,
            state,
            JSON.stringify(usage),
            cost,
            receipt,
            outcome.provider_response_id,
            retain ? JSON.stringify(guidance) : null,
            state === "rejected" ? "review_output_rejected" : null
          ]
        );
        await tx.query(
          "UPDATE improvement_review_usage SET held_nano_usd=held_nano_usd-$3,spent_nano_usd=spent_nano_usd+$4 WHERE organization_id=$1 AND starts_at=$2",
          [route.organization_id, attempt["window_starts_at"], attempt["principal_nano_usd"], cost]
        );
        if (row)
          await tx.query("UPDATE improvement_reviews SET ai_reserved_nano_usd=0 WHERE id=$1", [
            row["id"]
          ]);
        return { state, guidance: retain ? guidance : null };
      });
    }
  };
}
