import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ReportEmailDeliverySchema,
  ReportEmailReceiptSchema,
  ReportEmailTransportError,
  type ReportEmailDelivery,
  type ReportEmailSend
} from "../../smart-reports/src/report-email.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import {
  ReportContentInputSchema,
  readPublishedReportRun,
  type ReportContentInput
} from "./report-published-run.js";
import { createReportContentStore } from "./report-content-store.js";
import { createPostgresBillingStore } from "./billing-store.js";
import {
  lockReportEmailClaim,
  requireReportEmailRecipient,
  ReportEmailJobPayloadSchema,
  ReportEmailSuppressed,
  type ReportEmailRow
} from "./report-email-claim.js";
import { createWorkerJobStore, type WorkerJobClaim } from "./worker-job-store.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable, ObjectStoreReader } from "./types.js";
const iso = (value: unknown): string | null =>
  value === null
    ? null
    : (value instanceof Date ? value : new Date(z.string().parse(value))).toISOString();
function record(row: ReportEmailRow): ReportEmailDelivery {
  return ReportEmailDeliverySchema.parse({
    id: row["id"],
    run_id: row["run_id"],
    recipient_user_id: row["recipient_user_id"],
    status: row["status"],
    reason: row["reason"],
    created_at: iso(row["created_at"]),
    updated_at: iso(row["updated_at"]),
    accepted_at: iso(row["accepted_at"])
  });
}
export interface ReportEmailStore {
  scheduleNext(): Promise<{ processed: boolean }>;
  processNext(send: ReportEmailSend): Promise<{ processed: boolean }>;
  list(input: ReportContentInput): Promise<ReportEmailDelivery[]>;
  prune(limit?: number): Promise<number>;
}
/** Only receipt/lease changes are transactional. Source reads, rendering and
 * provider I/O run outside database locks. A durable intent prevents resend. */
export function createReportEmailStore(
  db: Queryable,
  objects: ObjectStoreReader
): ReportEmailStore {
  const jobs = createWorkerJobStore(db),
    content = createReportContentStore(db, objects);
  async function prepare(
    claim: WorkerJobClaim,
    reserve: boolean
  ): Promise<{
    recipient: string;
    recipientId: string;
    runId: string;
    attemptId: string | null;
  } | null> {
    return runInTransaction(db, async (tx) => {
      const { delivery, run } = await lockReportEmailClaim(tx, claim);
      if (delivery["status"] !== "queued") {
        if (delivery["status"] === "sending")
          await tx.query(
            "UPDATE report_email_deliveries SET status='uncertain',reason='worker_recovered',updated_at=clock_timestamp() WHERE id=$1",
            [delivery["id"]]
          );
        await createWorkerJobStore(tx).complete(claim);
        return null;
      }
      try {
        const recipient = await requireReportEmailRecipient(tx, delivery, run);
        if (!run) throw new ReportEmailSuppressed("report_unavailable");
        await tx.query("UPDATE report_runs SET last_claimed_at=clock_timestamp() WHERE id=$1", [
          run["id"]
        ]);
        let attemptId: string | null = null;
        if (reserve) {
          const now = (await tx.query<{ now: Date }>("SELECT clock_timestamp() AS now", []))
            .rows[0]!.now;
          const summary = await createPostgresBillingStore(tx).getBillingSummaryForOrganization({
            organization_id: z.uuid().parse(delivery["organization_id"]),
            now: now.toISOString()
          });
          if (
            !summary ||
            summary.allowances.monthly_alert_deliveries.used >=
              summary.allowances.monthly_alert_deliveries.limit
          )
            throw new ReportEmailSuppressed("notification_allowance_exhausted");
          // This is the last lease/deadline check before committing the send intent.
          await createWorkerJobStore(tx).lock(claim);
          if (
            (
              await tx.query(
                "SELECT id FROM report_email_deliveries WHERE id=$1 AND send_deadline_at>clock_timestamp()",
                [delivery["id"]]
              )
            ).rows.length !== 1
          )
            throw new ReportEmailSuppressed("delivery_expired");
          attemptId = randomUUID();
          await tx.query(
            `UPDATE report_email_deliveries SET status='sending',attempt_id=$2,reason=NULL,allowance_state='held',
      allowance_window_starts_at=$3,allowance_window_ends_at=$4,allowance_reserved_at=clock_timestamp(),updated_at=clock_timestamp(),
      expires_at=GREATEST(expires_at,$4::timestamptz+interval '1 day') WHERE id=$1`,
            [
              delivery["id"],
              attemptId,
              summary.usage_window.starts_at,
              summary.usage_window.ends_at
            ]
          );
        }
        return {
          recipient,
          recipientId: z.uuid().parse(delivery["recipient_user_id"]),
          runId: z.uuid().parse(run["id"]),
          attemptId
        };
      } catch (error) {
        if (!(error instanceof ReportEmailSuppressed)) throw error;
        await tx.query(
          "UPDATE report_email_deliveries SET status='suppressed',reason=$2,allowance_state=CASE WHEN allowance_state='held' THEN 'released' ELSE allowance_state END,updated_at=clock_timestamp() WHERE id=$1 AND status='queued'",
          [delivery["id"], error.code]
        );
        await createWorkerJobStore(tx).complete(claim);
        return null;
      }
    });
  }
  async function settle(
    claim: WorkerJobClaim,
    attemptId: string,
    state: "accepted" | "rejected" | "uncertain",
    providerId: string | null
  ): Promise<void> {
    const payload = ReportEmailJobPayloadSchema.parse(claim.payload);
    await runInTransaction(db, async (tx) => {
      // Known acceptance can settle after access loss, lease expiry or deletion.
      // The internal attempt identity still has to match the committed send intent.
      await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        payload.organization_id
      ]);
      await tx.query(
        `UPDATE report_email_deliveries SET
    status=CASE WHEN $3='accepted' THEN 'accepted' WHEN $3='uncertain' THEN 'uncertain'
      WHEN run_id IS NULL OR send_deadline_at<=clock_timestamp() OR $5>=8 OR NOT EXISTS(SELECT 1 FROM report_runs r WHERE r.id=report_email_deliveries.run_id AND r.status IN ('ready','factual_only') AND r.privacy_invalidated_at IS NULL) THEN 'failed' ELSE 'queued' END,
    reason=CASE WHEN $3='accepted' THEN NULL WHEN $3='uncertain' THEN 'provider_uncertain' ELSE 'provider_rejected' END,
    allowance_state=CASE WHEN $3='accepted' THEN 'charged' WHEN $3='rejected' THEN 'released' ELSE 'held' END,
    provider_message_id=CASE WHEN $3='accepted' THEN $4 ELSE NULL END,
    attempt_id=CASE WHEN $3='rejected' THEN NULL ELSE attempt_id END,
    accepted_at=CASE WHEN $3='accepted' THEN clock_timestamp() ELSE accepted_at END,updated_at=clock_timestamp()
    WHERE id=$1 AND attempt_id=$2 AND status IN ('sending','uncertain')`,
        [payload.delivery_id, attemptId, state, providerId, claim.attempts]
      );
    });
  }
  return {
    async scheduleNext() {
      const candidate = (
        await db.query<{ id: string; organization_id: string }>(
          `SELECT id,organization_id FROM report_runs WHERE send_email AND email_scheduled_at IS NULL AND status IN ('ready','factual_only') ORDER BY published_at,organization_id,id LIMIT 1`,
          []
        )
      ).rows[0];
      if (!candidate) return { processed: false };
      return runInTransaction(db, async (tx) => {
        await tx.query("SET LOCAL lock_timeout='5s'", []);
        await tx.query("SET LOCAL statement_timeout='10s'", []);
        await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
          candidate.organization_id
        ]);
        const row = (
          await tx.query<ReportEmailRow>(
            `SELECT *,LEAST(expires_at,published_at+interval '24 hours') AS send_deadline,
     LEAST(expires_at,published_at+interval '24 hours')>clock_timestamp() AS timely FROM report_runs WHERE id=$1 AND organization_id=$2 AND send_email AND email_scheduled_at IS NULL AND status IN ('ready','factual_only') FOR UPDATE`,
            [candidate.id, candidate.organization_id]
          )
        ).rows[0];
        if (!row) return { processed: false };
        for (const recipient of z.array(z.uuid()).max(10).parse(row["recipient_user_ids"])) {
          const exists =
              (await tx.query("SELECT id FROM users WHERE id=$1", [recipient])).rows.length === 1,
            id = randomUUID(),
            active = exists && row["timely"] === true;
          const created = await tx.query(
            `INSERT INTO report_email_deliveries(id,organization_id,run_id,recipient_user_id,expected_ready_sha256,status,reason,send_deadline_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(run_id,recipient_user_id) DO NOTHING RETURNING id`,
            [
              id,
              candidate.organization_id,
              candidate.id,
              exists ? recipient : null,
              row["ready_sha256"],
              active ? "queued" : "suppressed",
              active ? null : exists ? "delivery_expired" : "recipient_unavailable",
              row["send_deadline"],
              row["expires_at"]
            ]
          );
          if (created.rows.length && active) {
            const jobId = await createWorkerJobStore(tx).enqueue("deliver-smart-report-email", {
              organization_id: candidate.organization_id,
              delivery_id: id
            });
            await tx.query("UPDATE worker_jobs SET expires_at=$2 WHERE id=$1", [
              jobId,
              row["send_deadline"]
            ]);
            await tx.query("UPDATE report_email_deliveries SET job_id=$2 WHERE id=$1", [id, jobId]);
          }
        }
        await tx.query("UPDATE report_runs SET email_scheduled_at=clock_timestamp() WHERE id=$1", [
          candidate.id
        ]);
        return { processed: true };
      });
    },
    async processNext(send) {
      const candidate = (
        await db.query<{ job_id: string }>(
          `SELECT e.job_id FROM report_email_deliveries e JOIN worker_jobs j ON j.id=e.job_id
    LEFT JOIN report_runs r ON r.id=e.run_id
    LEFT JOIN LATERAL(SELECT last_claimed_at FROM report_runs previous WHERE previous.organization_id=e.organization_id AND last_claimed_at IS NOT NULL ORDER BY last_claimed_at DESC LIMIT 1) recent ON true
    WHERE j.job_name='deliver-smart-report-email' AND j.expires_at>clock_timestamp() AND j.attempts<8
    AND ((j.status='pending' AND j.available_at<=clock_timestamp()) OR (j.status='running' AND j.lease_expires_at<=clock_timestamp()))
    ORDER BY recent.last_claimed_at ASC NULLS FIRST,e.created_at,e.id LIMIT 1`,
          []
        )
      ).rows[0];
      const claim = candidate
        ? await jobs.claim("deliver-smart-report-email", candidate.job_id)
        : null;
      if (!claim) return { processed: false };
      const payload = ReportEmailJobPayloadSchema.parse(claim.payload);
      try {
        const checked = await prepare(claim, false);
        if (!checked) return { processed: true };
        const view = await content.view({
          organization_id: payload.organization_id,
          id: checked.runId,
          initiator: { version: 1, kind: "browser_session", user_id: checked.recipientId }
        });
        const admitted = await prepare(claim, true);
        if (!admitted?.attemptId) return { processed: true };
        let state: "accepted" | "rejected" | "uncertain" = "uncertain",
          providerId: string | null = null;
        try {
          const receipt = ReportEmailReceiptSchema.parse(
            await send({ recipient: admitted.recipient, view })
          );
          state = "accepted";
          providerId = receipt.provider_message_id;
        } catch (error) {
          state =
            error instanceof ReportEmailTransportError && error.state === "rejected"
              ? "rejected"
              : "uncertain";
        }
        await settle(claim, admitted.attemptId, state, providerId);
        if (state === "rejected") await jobs.fail(claim).catch(() => undefined);
        else await jobs.complete(claim).catch(() => undefined);
        return { processed: true };
      } catch (error) {
        const current = (
          await db.query<ReportEmailRow>(
            "SELECT status,attempt_id FROM report_email_deliveries WHERE id=$1",
            [payload.delivery_id]
          )
        ).rows[0];
        if (current?.["status"] === "sending") {
          await settle(claim, z.uuid().parse(current["attempt_id"]), "uncertain", null);
          await jobs.complete(claim).catch(() => undefined);
          return { processed: true };
        }
        if (error instanceof ReportEmailSuppressed || error instanceof SmartReportError) {
          await db.query(
            "UPDATE report_email_deliveries SET status='suppressed',reason='report_unavailable',updated_at=clock_timestamp() WHERE id=$1 AND status='queued'",
            [payload.delivery_id]
          );
          await jobs.complete(claim).catch(() => undefined);
          return { processed: true };
        }
        const terminal = (
          await db.query<{ status: string }>("SELECT status FROM worker_jobs WHERE id=$1", [
            claim.id
          ])
        ).rows[0]?.status;
        if (terminal === "skipped" || terminal === "completed") return { processed: true };
        await jobs.fail(claim);
        throw new Error("report_email_processing_unavailable");
      }
    },
    async list(raw) {
      const input = ReportContentInputSchema.parse(raw);
      await readPublishedReportRun(db, input);
      const rows = (
        await db.query<ReportEmailRow>(
          "SELECT * FROM report_email_deliveries WHERE organization_id=$1 AND run_id=$2 ORDER BY created_at,id LIMIT 10",
          [input.organization_id, input.id]
        )
      ).rows;
      await readPublishedReportRun(db, input);
      return rows.map(record);
    },
    async prune(limit = 100) {
      z.number().int().min(1).max(1000).parse(limit);
      const expired = await db.query(
        `WITH selected AS(SELECT id FROM report_email_deliveries WHERE status='queued' AND send_deadline_at<=clock_timestamp()
      ORDER BY send_deadline_at,id FOR UPDATE SKIP LOCKED LIMIT $1)
      UPDATE report_email_deliveries d SET status='failed',reason='delivery_expired',updated_at=clock_timestamp()
      FROM selected s WHERE d.id=s.id RETURNING d.id`,
        [limit]
      );
      const rows = await db.query(
        `WITH selected AS(SELECT id FROM report_email_deliveries WHERE expires_at<=clock_timestamp()
    AND (allowance_window_ends_at IS NULL OR allowance_window_ends_at<=clock_timestamp()) ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT $1)
    DELETE FROM report_email_deliveries d USING selected s WHERE d.id=s.id RETURNING d.id`,
        [limit]
      );
      return expired.rows.length + rows.rows.length;
    }
  };
}
