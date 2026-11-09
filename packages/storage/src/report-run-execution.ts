import { REPORT_TRIAL_ENTITLEMENT_SQL } from "./report-trial-entitlement.js";
import { z } from "zod";
import { getTierCapabilities } from "../../shared-types/src/index.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import { canAccessReportScope } from "./report-authorization.js";
import { reportRunRecord } from "./report-run-record.js";
import { runInTransaction } from "./transaction.js";
import { createWorkerJobStore, type WorkerJobClaim } from "./worker-job-store.js";
import type { Queryable } from "./types.js";
import type { ReportRunRecord } from "../../smart-reports/src/report-run.js";
import {
  ReportProcessingStateSchema,
  type ReportProcessingState
} from "../../smart-reports/src/report-processing.js";
import { releaseUnusedReportAllocation } from "./report-run-budget.js";

export const ReportJobPayloadSchema = z
  .object({
    run_id: z.uuid(),
    organization_id: z.uuid()
  })
  .strict();
export type StoredReportRun = Record<string, unknown>;

/** Snapshot reads hold no locks. A fresh fenced check is still required before
 * every external operation and publication, after source collection finishes. */
export async function readReportRunClaim(
  tx: Queryable,
  claim: WorkerJobClaim
): Promise<StoredReportRun> {
  if (claim.name !== "generate-smart-report") throw new Error("report_job_claim_invalid");
  const payload = ReportJobPayloadSchema.parse(claim.payload);
  const row = (
    await tx.query<StoredReportRun>(
      `SELECT r.*,(r.generation_deadline_at>clock_timestamp()) AS within_deadline FROM report_runs r JOIN worker_jobs j ON j.id=r.processing_job_id
    WHERE r.id=$1 AND r.organization_id=$2 AND j.id=$3 AND j.lease_token=$4
    AND j.status='running' AND j.lease_expires_at>clock_timestamp()`,
      [payload.run_id, payload.organization_id, claim.id, claim.token]
    )
  ).rows[0];
  if (!row) throw new Error("report_run_lease_lost");
  await authorizeStoredReportRun(tx, row);
  if (
    row["lease_token"] !== claim.token ||
    row["status"] !== "processing" ||
    row["within_deadline"] !== true
  )
    throw new Error("report_run_lease_lost");
  return row;
}

/** Ordinary definition edits affect future admissions. Only the current privacy,
 * owner-review and authority fences govern an already accepted immutable scope.
 * Always evaluate the actual saved actor, never an organisation Owner substitute. */
export async function authorizeStoredReportRun(tx: Queryable, run: StoredReportRun): Promise<void> {
  const current = (
    await tx.query<Record<string, unknown>>(
      `SELECT o.plan,o.suspended_at,d.privacy_mode,d.source_collection_consent,d.requires_owner_review
     FROM organizations o JOIN report_definitions d ON d.organization_id=o.id
     WHERE o.id=$1 AND d.id=$2 AND ${REPORT_TRIAL_ENTITLEMENT_SQL}`,
      [run["organization_id"], run["definition_id"]]
    )
  ).rows[0];
  if (!current) throw new SmartReportError("report_not_found");
  if (!getTierCapabilities(z.string().parse(current["plan"])).smart_reports)
    throw new SmartReportError("upgrade_required");
  if (
    run["privacy_invalidated_at"] !== null ||
    current["suspended_at"] !== null ||
    current["requires_owner_review"] === true ||
    (run["privacy_mode"] === "full" &&
      (current["privacy_mode"] !== "full" || current["source_collection_consent"] !== true)) ||
    !(await canAccessReportScope(tx, {
      organization_id: z.uuid().parse(run["organization_id"]),
      scope: run["accepted_scope"],
      initiator: run["initiating_authority"],
      manage: true
    }))
  )
    throw new SmartReportError("forbidden");
}

/** Lock order is organisation, real durable job, run. Copying a token supplied by
 * a caller cannot create a lease: the owning worker_jobs row must be live first. */
export async function lockReportRunClaim(
  tx: Queryable,
  claim: WorkerJobClaim,
  bind = false
): Promise<StoredReportRun> {
  const row = await lockReportClaimIdentity(tx, claim);
  if (!row) throw new SmartReportError("report_not_found");
  await authorizeStoredReportRun(tx, row);
  if (!["queued", "processing"].includes(z.string().parse(row["status"])))
    throw new Error("report_run_not_active");
  if (
    new Date(String(row["generation_deadline_at"])).getTime() <=
    new Date(String(row["checked_at"])).getTime()
  )
    throw new Error("report_generation_deadline_exceeded");
  if (!bind && row["lease_token"] !== claim.token) throw new Error("report_run_lease_lost");
  if (bind) {
    await tx.query(
      "UPDATE report_runs SET status='processing',lease_token=$2,lease_expires_at=$3,last_claimed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1",
      [row["id"], claim.token, row["job_lease_expires_at"]]
    );
    row["status"] = "processing";
    row["lease_token"] = claim.token;
    row["lease_expires_at"] = row["job_lease_expires_at"];
  }
  return row;
}
async function lockReportClaimIdentity(
  tx: Queryable,
  claim: WorkerJobClaim
): Promise<StoredReportRun | undefined> {
  if (claim.name !== "generate-smart-report") throw new Error("report_job_claim_invalid");
  const payload = ReportJobPayloadSchema.parse(claim.payload);
  await tx.query("SET LOCAL lock_timeout='5s'", []);
  await tx.query("SET LOCAL statement_timeout='30s'", []);
  await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [payload.organization_id]);
  await createWorkerJobStore(tx).lock(claim);
  const row = (
    await tx.query<StoredReportRun>(
      `SELECT r.*,j.lease_expires_at AS job_lease_expires_at,clock_timestamp() AS checked_at
     FROM report_runs r JOIN worker_jobs j ON j.id=r.processing_job_id
     WHERE r.id=$1 AND r.organization_id=$2 AND r.processing_job_id=$3 FOR UPDATE OF r`,
      [payload.run_id, payload.organization_id, claim.id]
    )
  ).rows[0];
  return row;
}

export interface ReportRunExecutionStore {
  claimNext(): Promise<WorkerJobClaim | null>;
  bind(claim: WorkerJobClaim): Promise<ReportRunRecord>;
  check(claim: WorkerJobClaim): Promise<void>;
  renew(claim: WorkerJobClaim): Promise<void>;
  state(claim: WorkerJobClaim): Promise<ReportProcessingState>;
  stop(claim: WorkerJobClaim, status: "paused_access" | "failed"): Promise<void>;
}
export function createReportRunExecutionStore(db: Queryable): ReportRunExecutionStore {
  return {
    async claimNext() {
      const candidate = (
        await db.query<{ processing_job_id: string }>(
          `SELECT r.processing_job_id FROM report_runs r JOIN worker_jobs j ON j.id=r.processing_job_id
        LEFT JOIN LATERAL(SELECT last_claimed_at FROM report_runs previous WHERE previous.organization_id=r.organization_id AND previous.last_claimed_at IS NOT NULL ORDER BY last_claimed_at DESC LIMIT 1) recent ON true
        WHERE r.status IN ('queued','processing') AND j.job_name='generate-smart-report' AND j.attempts<8 AND j.expires_at>clock_timestamp()
        AND ((j.status='pending' AND j.available_at<=clock_timestamp()) OR (j.status='running' AND j.lease_expires_at<=clock_timestamp()))
        ORDER BY recent.last_claimed_at ASC NULLS FIRST,r.created_at,r.id LIMIT 1`,
          []
        )
      ).rows[0];
      return candidate
        ? createWorkerJobStore(db).claim("generate-smart-report", candidate.processing_job_id)
        : null;
    },
    async stop(claim, status) {
      await runInTransaction(db, async (tx) => {
        const row = await lockReportClaimIdentity(tx, claim),
          jobs = createWorkerJobStore(tx);
        if (row && ["queued", "processing"].includes(String(row["status"]))) {
          const unstarted = await releaseUnusedReportAllocation(tx, row, true);
          await tx.query(
            `UPDATE report_runs SET status=$2,lease_token=NULL,lease_expires_at=NULL,ai_reserved_nano_usd=CASE WHEN paid_attempts=0 THEN 0 ELSE ai_reserved_nano_usd END,
            generation_counted=CASE WHEN $3 THEN false ELSE generation_counted END,ai_status=CASE WHEN paid_attempts>0 AND ai_status='pending' THEN 'uncertain' ELSE ai_status END,updated_at=clock_timestamp() WHERE id=$1`,
            [row["id"], status, unstarted]
          );
          await tx.query(
            "UPDATE report_model_attempts SET narrative_json=NULL,state=CASE WHEN state='sending' THEN 'uncertain' ELSE state END WHERE run_id=$1",
            [row["id"]]
          );
          await tx.query(
            "UPDATE report_artifact_objects SET state='deleting',cleanup_after_at=GREATEST(clock_timestamp()+interval '2 minutes',write_deadline_at+interval '2 minutes') WHERE run_id=$1",
            [row["id"]]
          );
        }
        await jobs.complete(
          claim,
          status === "paused_access" ? "initiator_access_revoked" : "report_generation_failed"
        );
      });
    },
    async state(claim) {
      return runInTransaction(db, async (tx) => {
        await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY", []);
        await tx.query("SET LOCAL statement_timeout='5s'", []);
        const row = await readReportRunClaim(tx, claim),
          attempt = (
            await tx.query<Record<string, unknown>>(
              "SELECT id,state,request_sha256,narrative_json FROM report_model_attempts WHERE run_id=$1",
              [row["id"]]
            )
          ).rows[0];
        return ReportProcessingStateSchema.parse({
          run: reportRunRecord(row),
          profile: row["ai_profile"],
          paid_attempts: row["paid_attempts"],
          facts:
            row["facts_object_key"] === null
              ? null
              : { key: row["facts_object_key"], sha256: row["facts_sha256"] },
          ready:
            row["ready_object_key"] === null
              ? null
              : { key: row["ready_object_key"], sha256: row["ready_sha256"] },
          attempt: attempt
            ? {
                id: attempt["id"],
                state: attempt["state"],
                request_sha256: attempt["request_sha256"],
                narrative: attempt["narrative_json"]
              }
            : null
        });
      });
    },
    async bind(claim: WorkerJobClaim) {
      return runInTransaction(db, async (tx) =>
        reportRunRecord(await lockReportRunClaim(tx, claim, true))
      );
    },
    async check(claim: WorkerJobClaim): Promise<void> {
      await runInTransaction(db, async (tx) => {
        await lockReportRunClaim(tx, claim);
      });
    },
    async renew(claim: WorkerJobClaim): Promise<void> {
      await runInTransaction(db, async (tx) => {
        await lockReportRunClaim(tx, claim);
        await createWorkerJobStore(tx).renew(claim);
        await tx.query(
          "UPDATE report_runs r SET lease_expires_at=j.lease_expires_at FROM worker_jobs j WHERE r.id=$1 AND j.id=r.processing_job_id AND r.lease_token=$2",
          [ReportJobPayloadSchema.parse(claim.payload).run_id, claim.token]
        );
      });
    }
  };
}
