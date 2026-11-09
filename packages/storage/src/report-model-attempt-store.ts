import { createHash } from "node:crypto";
import { z } from "zod";
import {
  actualReportAttemptCost,
  maximumReportRunCost,
  ReportAttemptProfileSchema,
  ReportModelUsageSchema
} from "../../smart-reports/src/model-cost.js";
import { reportModelProfile } from "../../smart-reports/src/model-request.js";
import { ReportNarrativeSchema } from "../../smart-reports/src/model-narrative.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import type { ReportModelAttemptOutcome } from "../../smart-reports/src/model-client.js";
import { authorizeStoredReportRun, lockReportRunClaim } from "./report-run-execution.js";
import { runInTransaction } from "./transaction.js";
import type { WorkerJobClaim } from "./worker-job-store.js";
import type { Queryable } from "./types.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const BeginSchema = z
  .object({
    attempt_id: z.uuid(),
    facts_sha256: hash,
    request_sha256: hash,
    profile: ReportAttemptProfileSchema,
    input_tokens: z.number().int().min(1).max(12000)
  })
  .strict();
const KnownSchema = z
  .object({
    state: z.enum(["succeeded", "rejected"]),
    usage: ReportModelUsageSchema,
    cost_nano_usd: z.number().int().safe().nonnegative(),
    provider_response_id: z.string().regex(/^resp_[A-Za-z0-9_-]{1,200}$/),
    narrative: ReportNarrativeSchema.optional()
  })
  .strict();
const nano = (value: unknown): number => z.coerce.number().int().safe().nonnegative().parse(value);
export interface ReportModelAttemptStore {
  begin(claim: WorkerJobClaim, raw: z.infer<typeof BeginSchema>): Promise<void>;
  settle(raw: { attempt_id: string; outcome: ReportModelAttemptOutcome }): Promise<void>;
}

/** One fixed Terra intent per logical run. The committed sending row precedes
 * HTTP; a crash at that boundary is uncertain and never funds a blind retry.
 * Settlement owns billing receipts independently of permission to publish. */
export function createReportModelAttemptStore(db: Queryable): ReportModelAttemptStore {
  return {
    async begin(claim: WorkerJobClaim, raw: z.infer<typeof BeginSchema>): Promise<void> {
      const input = BeginSchema.parse(raw),
        expected = reportModelProfile("gpt-6.1-terra");
      if (JSON.stringify(input.profile) !== JSON.stringify(expected))
        throw new Error("report_model_profile_not_selected");
      const principal = maximumReportRunCost(input.profile).attempt_nano_usd;
      await runInTransaction(db, async (tx) => {
        const run = await lockReportRunClaim(tx, claim);
        if (
          run["facts_sha256"] !== input.facts_sha256 ||
          typeof run["facts_object_key"] !== "string"
        )
          throw new Error("report_facts_not_frozen");
        if (run["paid_attempts"] !== 0 || run["ai_status"] !== "pending")
          throw new Error("report_paid_attempt_already_admitted");
        if (
          JSON.stringify(ReportAttemptProfileSchema.parse(run["ai_profile"])) !==
            JSON.stringify(input.profile) ||
          nano(run["ai_reserved_nano_usd"]) !== principal
        )
          throw new Error("report_attempt_allocation_mismatch");
        await tx.query(
          `INSERT INTO report_model_attempts(id,run_id,organization_id,window_starts_at,worker_lease_token,request_sha256,facts_sha256,profile,input_tokens,principal_nano_usd)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
          [
            input.attempt_id,
            run["id"],
            run["organization_id"],
            run["window_starts_at"],
            claim.token,
            input.request_sha256,
            input.facts_sha256,
            JSON.stringify(input.profile),
            input.input_tokens,
            principal
          ]
        );
        await tx.query(
          "UPDATE report_runs SET paid_attempts=paid_attempts+1,updated_at=clock_timestamp() WHERE id=$1",
          [run["id"]]
        );
      });
    },
    async settle(raw: { attempt_id: string; outcome: ReportModelAttemptOutcome }): Promise<void> {
      const id = z.uuid().parse(raw.attempt_id),
        outcome = raw.outcome;
      // Read only the routing identity before taking locks in the same order as
      // admission. The immutable receipt itself is reloaded under the lock.
      const route = (
        await db.query<{ organization_id: string }>(
          "SELECT organization_id FROM report_model_attempts WHERE id=$1",
          [id]
        )
      ).rows[0];
      if (!route) throw new Error("report_attempt_not_found");
      await runInTransaction(db, async (tx) => {
        await tx.query("SET LOCAL lock_timeout='5s'", []);
        await tx.query("SET LOCAL statement_timeout='30s'", []);
        await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
          route.organization_id
        ]);
        const attempt = (
          await tx.query<Record<string, unknown>>(
            "SELECT * FROM report_model_attempts WHERE id=$1 AND organization_id=$2 FOR UPDATE",
            [id, route.organization_id]
          )
        ).rows[0];
        if (!attempt) throw new Error("report_attempt_not_found");
        if (outcome.state === "uncertain") {
          if (!["sending", "uncertain"].includes(String(attempt["state"]))) return;
          if (outcome.maximum_nano_usd !== nano(attempt["principal_nano_usd"]))
            throw new Error("report_attempt_allocation_mismatch");
          await tx.query("UPDATE report_model_attempts SET state='uncertain' WHERE id=$1", [id]);
          await tx.query(
            "UPDATE report_runs SET ai_status='uncertain',updated_at=clock_timestamp() WHERE id=$1",
            [attempt["run_id"]]
          );
          return;
        }
        const known = KnownSchema.parse({
          state: outcome.state,
          usage: outcome.usage,
          cost_nano_usd: outcome.cost_nano_usd,
          provider_response_id: outcome.provider_response_id,
          ...(outcome.state === "succeeded" ? { narrative: outcome.narrative } : {})
        });
        if ((known.state === "succeeded") !== (known.narrative !== undefined))
          throw new Error("report_attempt_narrative_missing");
        const profile = ReportAttemptProfileSchema.parse(attempt["profile"]),
          usage = known.usage;
        if (
          usage.input_tokens > profile.max_input_tokens ||
          usage.output_tokens > profile.max_output_tokens ||
          usage.input_tokens_details.cache_write_tokens_details.ttl_12h_tokens !== 0
        )
          throw new Error("report_attempt_usage_out_of_bounds");
        const cost = actualReportAttemptCost({
          model: profile.model,
          regional_processing: profile.regional_processing,
          usage
        });
        if (cost !== known.cost_nano_usd || cost > nano(attempt["principal_nano_usd"]))
          throw new Error("report_attempt_cost_mismatch");
        const receiptHash = createHash("sha256").update(JSON.stringify(known)).digest("hex");
        if (["succeeded", "rejected"].includes(String(attempt["state"]))) {
          if (attempt["outcome_sha256"] !== receiptHash)
            throw new Error("report_attempt_receipt_conflict");
          return;
        }
        const run = (
          await tx.query<Record<string, unknown>>(
            "SELECT * FROM report_runs WHERE id=$1 AND organization_id=$2 FOR UPDATE",
            [attempt["run_id"], route.organization_id]
          )
        ).rows[0];
        let retain = false;
        if (
          run &&
          run["status"] === "processing" &&
          run["lease_token"] === attempt["worker_lease_token"]
        ) {
          const live =
            (
              await tx.query(
                "SELECT id FROM worker_jobs WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_expires_at>clock_timestamp()",
                [run["processing_job_id"], attempt["worker_lease_token"]]
              )
            ).rows.length === 1;
          if (live) {
            try {
              await authorizeStoredReportRun(tx, run);
              retain = true;
            } catch (error) {
              if (!(error instanceof SmartReportError)) throw error;
            }
          }
        }
        const narrative = retain && known.narrative ? JSON.stringify(known.narrative) : null;
        if (narrative !== null && Buffer.byteLength(narrative) > 60000)
          throw new Error("report_attempt_narrative_too_large");
        await tx.query(
          `UPDATE report_model_attempts SET state=$2,outcome_sha256=$3,usage=$4::jsonb,cost_nano_usd=$5,provider_response_id=$6,narrative_json=$7::jsonb,settled_at=clock_timestamp() WHERE id=$1`,
          [
            id,
            known.state,
            receiptHash,
            JSON.stringify(usage),
            cost,
            known.provider_response_id,
            narrative
          ]
        );
        await tx.query(
          "UPDATE report_allowance_windows SET held_nano_usd=held_nano_usd-$3,spent_nano_usd=spent_nano_usd+$4 WHERE organization_id=$1 AND starts_at=$2",
          [
            route.organization_id,
            attempt["window_starts_at"],
            nano(attempt["principal_nano_usd"]),
            cost
          ]
        );
        if (run)
          await tx.query(
            "UPDATE report_runs SET ai_reserved_nano_usd=0,ai_status=$2,updated_at=clock_timestamp() WHERE id=$1",
            [attempt["run_id"], known.state === "succeeded" ? "succeeded" : "failed"]
          );
      });
    }
  };
}
