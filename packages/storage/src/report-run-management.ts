import { z } from "zod";
import { type ReportRunRecord } from "../../smart-reports/src/report-run.js";
import {
  ReportRunListQuerySchema,
  ReportRunCursorValueSchema
} from "../../smart-reports/src/report-run-api-contract.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import { canAccessReportScope } from "./report-authorization.js";
import { canReadReportScope, ReportReadInitiatorSchema } from "./report-read-authorization.js";
import { ProjectJobInitiatorSchema } from "./project-job-authorization.js";
import { lockReportRunClaim } from "./report-run-execution.js";
import { reportRunRecord } from "./report-run-record.js";
import { createWorkerJobStore, type WorkerJobClaim } from "./worker-job-store.js";
import { runInTransaction } from "./transaction.js";
import { releaseUnusedReportAllocation } from "./report-run-budget.js";
import type { Queryable } from "./types.js";
const ActorSchema = z
  .object({ organization_id: z.uuid(), initiator: ProjectJobInitiatorSchema })
  .strict();
const RunInputSchema = ActorSchema.extend({ id: z.uuid() }).strict();
type RunInput = z.infer<typeof RunInputSchema>;
const ReadActorSchema = ActorSchema.extend({ initiator: ReportReadInitiatorSchema });
const ReadRunSchema = ReadActorSchema.extend({ id: z.uuid() });
type ReadRunInput = z.infer<typeof ReadRunSchema>;
export interface ReportRunManagementStore {
  get(input: ReadRunInput): Promise<ReportRunRecord>;
  list(input: {
    organization_id: string;
    initiator: z.infer<typeof ReportReadInitiatorSchema>;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: ReportRunRecord[]; next_cursor: string | null }>;
  cancel(input: RunInput): Promise<ReportRunRecord>;
  remove(input: RunInput): Promise<void>;
  complete(claim: WorkerJobClaim, options?: { has_narrative: boolean }): Promise<ReportRunRecord>;
}
async function canRead(
  tx: Queryable,
  row: Record<string, unknown>,
  actor: z.infer<typeof ReportReadInitiatorSchema>,
  manage = false
): Promise<boolean> {
  if (!manage)
    return canReadReportScope(tx, {
      organization_id: String(row["organization_id"]),
      scope: row["accepted_scope"],
      initiator: actor
    });
  return canAccessReportScope(tx, {
    organization_id: String(row["organization_id"]),
    scope: row["accepted_scope"],
    initiator: actor,
    manage
  });
}
/** Listing is bounded before per-run whole-scope filtering; it never returns
 * partial narratives or broadens saved origins after consolidation. */
export function createReportRunManagementStore(db: Queryable): ReportRunManagementStore {
  async function load(
    tx: Queryable,
    input: ReadRunInput,
    manage: boolean,
    lock = false
  ): Promise<Record<string, unknown>> {
    const row = (
      await tx.query<Record<string, unknown>>(
        `SELECT * FROM report_runs WHERE organization_id=$1 AND id=$2 ${lock ? "FOR UPDATE" : ""}`,
        [input.organization_id, input.id]
      )
    ).rows[0];
    if (!row || !(await canRead(tx, row, input.initiator, manage)))
      throw new SmartReportError("report_not_found");
    return row;
  }
  return {
    async get(raw) {
      const input = ReadRunSchema.parse(raw);
      return reportRunRecord(await load(db, input, false));
    },
    async list(raw) {
      const input = ReadActorSchema.extend(ReportRunListQuerySchema.shape).strict().parse(raw);
      const cursor =
        input.cursor === undefined
          ? null
          : ReportRunCursorValueSchema.parse(
              JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"))
            );
      const rows = (
        await db.query<Record<string, unknown>>(
          `SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at FROM report_runs WHERE organization_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4`,
          [input.organization_id, cursor?.at ?? null, cursor?.id ?? null, input.limit + 1]
        )
      ).rows;
      const page = rows.slice(0, input.limit),
        last = page.at(-1);
      const allowed: ReportRunRecord[] = [];
      for (const row of page)
        if (await canRead(db, row, input.initiator)) allowed.push(reportRunRecord(row));
      return {
        items: allowed,
        next_cursor:
          rows.length > input.limit && last
            ? Buffer.from(
                JSON.stringify({ at: last["cursor_created_at"], id: last["id"] })
              ).toString("base64url")
            : null
      };
    },
    async cancel(raw) {
      const input = RunInputSchema.parse(raw);
      return runInTransaction(db, async (tx) => {
        await tx.query("SET LOCAL lock_timeout='5s'", []);
        await tx.query("SET LOCAL statement_timeout='30s'", []);
        await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
          input.organization_id
        ]);
        const row = await load(tx, input, true, true);
        if (!["queued", "processing", "paused_access"].includes(String(row["status"])))
          return reportRunRecord(row);
        const unstarted = await releaseUnusedReportAllocation(tx, row, true);
        await tx.query(
          "UPDATE worker_jobs SET status='skipped',payload=NULL,lease_token=NULL,lease_expires_at=NULL,last_error_code='report_cancelled',updated_at=clock_timestamp() WHERE id=$1 AND status IN ('pending','running')",
          [row["processing_job_id"]]
        );
        const updated = (
          await tx.query<Record<string, unknown>>(
            `UPDATE report_runs SET status='cancelled',lease_token=NULL,lease_expires_at=NULL,generation_counted=CASE WHEN $2 THEN false ELSE generation_counted END,
          ai_reserved_nano_usd=CASE WHEN paid_attempts=0 THEN 0 ELSE ai_reserved_nano_usd END,ai_status=CASE WHEN paid_attempts>0 AND ai_status='pending' THEN 'uncertain' ELSE ai_status END,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
            [input.id, unstarted]
          )
        ).rows[0]!;
        await tx.query(
          "UPDATE report_model_attempts SET state='uncertain' WHERE run_id=$1 AND state='sending'",
          [input.id]
        );
        await tx.query(
          "UPDATE report_artifact_objects SET state='deleting',cleanup_after_at=GREATEST(clock_timestamp()+interval '2 minutes',write_deadline_at+interval '2 minutes') WHERE run_id=$1",
          [input.id]
        );
        await tx.query("UPDATE report_model_attempts SET narrative_json=NULL WHERE run_id=$1", [
          input.id
        ]);
        return reportRunRecord(updated);
      });
    },
    async remove(raw) {
      const input = RunInputSchema.parse(raw);
      await runInTransaction(db, async (tx) => {
        await tx.query("SET LOCAL lock_timeout='5s'", []);
        await tx.query("SET LOCAL statement_timeout='30s'", []);
        await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
          input.organization_id
        ]);
        const row = await load(tx, input, true, true);
        await tx.query(
          "UPDATE worker_jobs SET status='skipped',payload=NULL,lease_token=NULL,lease_expires_at=NULL,last_error_code='report_deleted',updated_at=clock_timestamp() WHERE id=$1 AND status IN ('pending','running')",
          [row["processing_job_id"]]
        );
        await tx.query("DELETE FROM report_runs WHERE id=$1", [input.id]);
      });
    },
    async complete(claim, options = { has_narrative: false }) {
      return runInTransaction(db, async (tx) => {
        const row = await lockReportRunClaim(tx, claim);
        const artifacts = (
          await tx.query(
            "SELECT artifact_kind FROM report_artifact_objects WHERE run_id=$1 AND state='attached' AND expires_at>clock_timestamp() AND (object_key=$2 OR object_key=$3)",
            [row["id"], row["facts_object_key"], row["ready_object_key"]]
          )
        ).rows;
        if (artifacts.length !== 2) throw new Error("report_outputs_not_persisted");
        const noPaid = row["paid_attempts"] === 0;
        if (
          row["ai_status"] === "succeeded" &&
          (
            await tx.query(
              "SELECT id FROM report_model_attempts WHERE run_id=$1 AND state='succeeded'",
              [row["id"]]
            )
          ).rows.length !== 1
        )
          throw new Error("report_attempt_receipt_missing");
        if (noPaid) await releaseUnusedReportAllocation(tx, row, false);
        if (!noPaid && row["ai_status"] === "pending")
          await tx.query(
            "UPDATE report_model_attempts SET state='uncertain' WHERE run_id=$1 AND state='sending'",
            [row["id"]]
          );
        const aiStatus =
          row["ai_status"] === "pending" ? (noPaid ? "failed" : "uncertain") : row["ai_status"];
        const updated = (
          await tx.query<Record<string, unknown>>(
            `UPDATE report_runs SET status=$2,ai_status=$3,ai_reserved_nano_usd=CASE WHEN $4 THEN 0 ELSE ai_reserved_nano_usd END,
          published_at=clock_timestamp(),updated_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL WHERE id=$1 RETURNING *`,
            [
              row["id"],
              aiStatus === "succeeded" && options.has_narrative ? "ready" : "factual_only",
              aiStatus,
              noPaid
            ]
          )
        ).rows[0]!;
        await tx.query("UPDATE report_model_attempts SET narrative_json=NULL WHERE run_id=$1", [
          row["id"]
        ]);
        await createWorkerJobStore(tx).complete(claim);
        return reportRunRecord(updated);
      });
    }
  };
}
