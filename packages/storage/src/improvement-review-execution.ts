import { createHash } from "node:crypto";
import { planningDigest } from "../../smart-improvements/src/review-planning.js";
import { collectImprovementReviewContext } from "./improvement-review-context.js";
import {
  reviewContext,
  reviewContextSnapshot,
  validateRowReviewGuidance
} from "./improvement-review-planning.js";
import { z } from "zod";
import {
  ReviewArtifactSchema,
  ReviewFactsSchema,
  reviewEvidenceDigest,
  reviewPolicy,
  reviewPriorities,
  type ReviewArtifact,
  type ReviewGuidance
} from "../../smart-improvements/src/review.js";
import { AcceptedReportScopeSchema } from "../../smart-reports/src/report-definition.js";
import { lastCompletedReportPeriod } from "../../smart-reports/src/report-period.js";
import { maximumReportRunCost } from "../../smart-reports/src/model-cost.js";
import { reportModelProfile } from "../../smart-reports/src/model-request.js";
import {
  collectImprovementReviewFacts,
  reviewPrivacySnapshot
} from "./improvement-review-facts.js";
import { readReportIdentities } from "./report-identity-store.js";
import { createWorkerJobStore, type WorkerJobClaim } from "./worker-job-store.js";
import {
  lockReviewOrganization,
  requireReviewWork,
  reviewDate,
  type ReviewRow
} from "./improvement-review-access.js";
import { resolveBillingUsageWindow } from "./billing-allowance-window.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";
export const ReviewJobPayloadSchema = z
  .object({
    review_id: z.uuid(),
    organization_id: z.uuid(),
    project_id: z.uuid(),
    initiating_authority: z.unknown()
  })
  .strict();
const nano = (value: unknown): number => z.coerce.number().int().safe().nonnegative().parse(value);
const iso = (value: unknown): string | null =>
  value === null ? null : reviewDate(value).toISOString();
export async function readReviewClaim(
  db: Queryable,
  claim: WorkerJobClaim,
  lock = false
): Promise<ReviewRow> {
  if (claim.name !== "generate-improvement-review") throw new Error("review_lease_lost");
  const payload = ReviewJobPayloadSchema.parse(claim.payload);
  if (lock) {
    await lockReviewOrganization(db, payload.organization_id);
  }
  const row = (
    await db.query<ReviewRow>(
      `SELECT r.* FROM improvement_reviews r JOIN worker_jobs j ON j.id=r.processing_job_id
    WHERE r.id=$1 AND r.organization_id=$2 AND r.project_id=$3 AND j.id=$4 AND j.lease_token=$5 AND j.status='running'
    AND j.lease_expires_at>clock_timestamp() AND j.expires_at>clock_timestamp() AND r.status IN ('queued','processing') ${lock ? "FOR UPDATE OF r" : ""}`,
      [payload.review_id, payload.organization_id, payload.project_id, claim.id, claim.token]
    )
  ).rows[0];
  if (!row) throw new Error("review_lease_lost");
  if (lock) await createWorkerJobStore(db).lock(claim);
  await requireReviewWork(db, row);
  return row;
}
function artifact(
  row: ReviewRow,
  status: ReviewArtifact["analysis"],
  guidance: ReviewGuidance | null
): ReviewArtifact {
  const facts = ReviewFactsSchema.parse(row["facts"]);
  return ReviewArtifactSchema.parse({
    schema_version: "improvement_review.v1",
    facts,
    priorities: reviewPriorities(facts),
    guidance,
    analysis: status
  });
}
export interface ImprovementReviewExecutionStore {
  claimNext(): Promise<WorkerJobClaim | null>;
  bind(claim: WorkerJobClaim): Promise<void>;
  check(claim: WorkerJobClaim): Promise<ReviewRow>;
  facts(claim: WorkerJobClaim): Promise<ReviewRow>;
  unchanged(row: ReviewRow): Promise<boolean>;
  reserve(claim: WorkerJobClaim): Promise<boolean>;
  publish(
    claim: WorkerJobClaim,
    input: {
      status: "ready" | "factual_only" | "no_data" | "no_change" | "skipped_quota";
      reason: string | null;
      guidance?: ReviewGuidance | null;
    }
  ): Promise<void>;
  stop(claim: WorkerJobClaim, access: boolean): Promise<void>;
}
export function createImprovementReviewExecutionStore(
  db: Queryable
): ImprovementReviewExecutionStore {
  return {
    async claimNext(): Promise<WorkerJobClaim | null> {
      const next = (
        await db.query<{ processing_job_id: string }>(
          `SELECT r.processing_job_id FROM improvement_reviews r JOIN worker_jobs j ON j.id=r.processing_job_id
        LEFT JOIN LATERAL(SELECT last_claimed_at FROM improvement_reviews previous WHERE previous.organization_id=r.organization_id AND previous.last_claimed_at IS NOT NULL ORDER BY last_claimed_at DESC LIMIT 1) recent ON true
        WHERE r.status IN ('queued','processing') AND NOT r.privacy_invalidated AND r.expires_at>clock_timestamp() AND j.attempts<8 AND j.expires_at>clock_timestamp()
        AND ((j.status='pending' AND j.available_at<=clock_timestamp()) OR (j.status='running' AND j.lease_expires_at<=clock_timestamp()))
        ORDER BY recent.last_claimed_at ASC NULLS FIRST,r.created_at,r.id LIMIT 1`,
          []
        )
      ).rows[0];
      return next
        ? createWorkerJobStore(db).claim("generate-improvement-review", next.processing_job_id)
        : null;
    },
    async bind(claim: WorkerJobClaim): Promise<void> {
      await runInTransaction(db, async (tx) => {
        const row = await readReviewClaim(tx, claim, true);
        await tx.query(
          "UPDATE improvement_reviews SET status='processing',last_claimed_at=clock_timestamp() WHERE id=$1",
          [row["id"]]
        );
      });
    },
    async check(claim: WorkerJobClaim): Promise<ReviewRow> {
      return readReviewClaim(db, claim);
    },
    async facts(claim: WorkerJobClaim): Promise<ReviewRow> {
      const collected = await runInTransaction(db, async (tx) => {
        await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY", []);
        await tx.query("SET LOCAL statement_timeout='30s'", []);
        const row = await readReviewClaim(tx, claim);
        if (row["facts"] !== null) return row;
        const org = await requireReviewWork(tx, row),
          scope = AcceptedReportScopeSchema.parse(row["accepted_scope"]);
        const facts = await collectImprovementReviewFacts(tx, {
          organization_id: String(row["organization_id"]),
          project_id: String(row["project_id"]),
          origins: scope.flatMap((view) => view.origin_project_ids),
          plan: String(org["plan"]),
          period: lastCompletedReportPeriod("weekly", iso(row["period_ends_at"])!),
          cutoff_at: iso(row["cutoff_at"])!,
          privacy_mode: z.enum(["full", "restricted"]).parse(row["privacy_mode"])
        });
        return {
          ...row,
          facts,
          review_context: reviewContextSnapshot(
            facts,
            await collectImprovementReviewContext(
              tx,
              facts,
              scope.flatMap((view) => view.origin_project_ids)
            )
          ),
          privacy_snapshot: await reviewPrivacySnapshot(
            tx,
            scope.flatMap((view) => view.origin_project_ids)
          )
        };
      });
      const facts = ReviewFactsSchema.parse(collected["facts"]),
        digest = reviewEvidenceDigest(facts);
      reviewContext(collected);
      return runInTransaction(db, async (tx) => {
        const row = await readReviewClaim(tx, claim, true);
        if (row["facts"] !== null) {
          reviewContext(row);
          if (reviewEvidenceDigest(ReviewFactsSchema.parse(row["facts"])) !== row["facts_digest"])
            throw new Error("review_facts_integrity_failed");
          return row;
        }
        return (
          await tx.query<ReviewRow>(
            "UPDATE improvement_reviews SET facts=$2::jsonb,facts_digest=$3,privacy_snapshot=$4::jsonb,review_context=$5::jsonb WHERE id=$1 RETURNING *",
            [
              row["id"],
              JSON.stringify(facts),
              digest,
              JSON.stringify(collected["privacy_snapshot"]),
              JSON.stringify(collected["review_context"])
            ]
          )
        ).rows[0]!;
      });
    },
    async unchanged(row: ReviewRow): Promise<boolean> {
      const context = reviewContext(row);
      return (
        (
          await db.query(
            "SELECT id FROM improvement_reviews WHERE organization_id=$1 AND project_id=$2 AND id<>$3 AND facts_digest=$4 AND (review_context->>'digest') IS NOT DISTINCT FROM $5::text AND status IN ('ready','factual_only','no_change') AND artifact IS NOT NULL AND NOT privacy_invalidated AND expires_at>clock_timestamp() LIMIT 1",
            [
              row["organization_id"],
              row["project_id"],
              row["id"],
              row["facts_digest"],
              context ? planningDigest(ReviewFactsSchema.parse(row["facts"]), context) : null
            ]
          )
        ).rows.length > 0
      );
    },
    async reserve(claim: WorkerJobClaim): Promise<boolean> {
      return runInTransaction(db, async (tx) => {
        const row = await readReviewClaim(tx, claim, true),
          current = await requireReviewWork(tx, row);
        if (row["generation_counted"] === true) return true;
        const policy = reviewPolicy(String(current["plan"])),
          principal = maximumReportRunCost(reportModelProfile("gpt-6.1-terra")).attempt_nano_usd;
        const window = resolveBillingUsageWindow({
          now: reviewDate(current["checked_at"]),
          plan: z.enum(["free", "solo", "team", "business"]).parse(current["plan"]),
          billing_interval: z.enum(["month", "year"]).nullable().parse(current["billing_interval"]),
          billing_period_starts_at: iso(current["billing_period_starts_at"]),
          billing_period_ends_at: iso(current["billing_period_ends_at"]),
          billing_allowance_anchor_at: iso(current["billing_allowance_anchor_at"])
        });
        await tx.query(
          "INSERT INTO improvement_review_usage(organization_id,starts_at,ends_at,budget_limit_nano_usd) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [row["organization_id"], window.starts_at, window.ends_at, policy.budget_nano_usd]
        );
        const usage = (
          await tx.query<ReviewRow>(
            "SELECT * FROM improvement_review_usage WHERE organization_id=$1 AND starts_at=$2 FOR UPDATE",
            [row["organization_id"], window.starts_at]
          )
        ).rows[0]!;
        if (
          nano(usage["generations"]) >= policy.generations ||
          nano(usage["held_nano_usd"]) + nano(usage["spent_nano_usd"]) + principal >
            policy.budget_nano_usd
        )
          return false;
        await tx.query(
          "UPDATE improvement_review_usage SET generations=generations+1,held_nano_usd=held_nano_usd+$3,budget_limit_nano_usd=GREATEST(budget_limit_nano_usd,$4) WHERE organization_id=$1 AND starts_at=$2",
          [row["organization_id"], window.starts_at, principal, policy.budget_nano_usd]
        );
        await tx.query(
          "UPDATE improvement_reviews SET ai_window_starts_at=$2,ai_reserved_nano_usd=$3,generation_counted=true WHERE id=$1",
          [row["id"], window.starts_at, principal]
        );
        return true;
      });
    },
    async publish(
      claim: WorkerJobClaim,
      input: {
        status: "ready" | "factual_only" | "no_data" | "no_change" | "skipped_quota";
        reason: string | null;
        guidance?: ReviewGuidance | null;
      }
    ): Promise<void> {
      await runInTransaction(db, async (tx) => {
        const row = await readReviewClaim(tx, claim, true);
        let guidance = input.guidance ?? null,
          status = input.status,
          reason = input.reason;
        if (guidance) {
          try {
            const identities = [
              ...new Set([
                ...z.array(z.string()).parse(row["identities"]),
                ...(await readReportIdentities(tx, row["accepted_scope"]))
              ])
            ];
            guidance = validateRowReviewGuidance(row, guidance, identities);
          } catch {
            guidance = null;
            status = "factual_only";
            reason = "model_rejected";
          }
        }
        const result = artifact(
          row,
          guidance
            ? "available"
            : status === "no_data"
              ? "no_data"
              : status === "no_change"
                ? "no_change"
                : "unavailable",
          guidance
        );
        if (row["paid_attempts"] === 0 && row["generation_counted"] === true) {
          await tx.query(
            "UPDATE improvement_review_usage SET generations=generations-1,held_nano_usd=held_nano_usd-$3 WHERE organization_id=$1 AND starts_at=$2",
            [row["organization_id"], row["ai_window_starts_at"], row["ai_reserved_nano_usd"]]
          );
          await tx.query(
            "UPDATE improvement_reviews SET ai_reserved_nano_usd=0,generation_counted=false WHERE id=$1",
            [row["id"]]
          );
        }
        await tx.query(
          "UPDATE improvement_reviews SET status=$2,reason=$3,artifact=$4::jsonb,artifact_sha256=$5 WHERE id=$1",
          [
            row["id"],
            status,
            reason,
            JSON.stringify(result),
            createHash("sha256").update(JSON.stringify(result)).digest("hex")
          ]
        );
        await tx.query(
          "UPDATE improvement_review_attempts SET validated_guidance=NULL WHERE review_id=$1",
          [row["id"]]
        );
        await createWorkerJobStore(tx).complete(claim);
      });
    },
    async stop(claim: WorkerJobClaim, access: boolean): Promise<void> {
      await runInTransaction(db, async (tx) => {
        const payload = ReviewJobPayloadSchema.parse(claim.payload);
        await lockReviewOrganization(tx, payload.organization_id);
        const row = (
          await tx.query<ReviewRow>(
            "SELECT * FROM improvement_reviews WHERE id=$1 AND processing_job_id=$2 FOR UPDATE",
            [payload.review_id, claim.id]
          )
        ).rows[0];
        await createWorkerJobStore(tx).lock(claim);
        if (row && row["paid_attempts"] === 0 && row["generation_counted"] === true)
          await tx.query(
            "UPDATE improvement_review_usage SET generations=generations-1,held_nano_usd=held_nano_usd-$3 WHERE organization_id=$1 AND starts_at=$2",
            [row["organization_id"], row["ai_window_starts_at"], row["ai_reserved_nano_usd"]]
          );
        await tx.query(
          "UPDATE improvement_reviews SET status=$2,reason=$3,ai_reserved_nano_usd=CASE WHEN paid_attempts=0 THEN 0 ELSE ai_reserved_nano_usd END,generation_counted=CASE WHEN paid_attempts=0 THEN false ELSE generation_counted END WHERE id=$1",
          [
            payload.review_id,
            access ? "paused_access" : "failed",
            access ? "access_changed" : "processing_failed"
          ]
        );
        await tx.query(
          "UPDATE improvement_review_attempts SET validated_guidance=NULL WHERE review_id=$1",
          [payload.review_id]
        );
        await createWorkerJobStore(tx).complete(
          claim,
          access ? "initiator_access_revoked" : "review_processing_failed"
        );
      });
    }
  };
}
