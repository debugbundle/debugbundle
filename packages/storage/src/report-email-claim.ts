import { z } from "zod";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import { AcceptedReportScopeSchema } from "../../smart-reports/src/report-definition.js";
import { createWorkerJobStore, type WorkerJobClaim } from "./worker-job-store.js";
import { authorizeStoredReportRun } from "./report-run-execution.js";
import { readPublishedReportRun } from "./report-published-run.js";
import { createNotificationPreferencesStore } from "./notification-preferences-store.js";
import type { Queryable } from "./types.js";
export const ReportEmailJobPayloadSchema = z
  .object({ organization_id: z.uuid(), delivery_id: z.uuid() })
  .strict();
export type ReportEmailRow = Record<string, unknown>;
export class ReportEmailSuppressed extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ReportEmailSuppressed";
  }
}
/** Organisation and the actual durable job precede the run and delivery locks. */
export async function lockReportEmailClaim(
  tx: Queryable,
  claim: WorkerJobClaim
): Promise<{ delivery: ReportEmailRow; run: ReportEmailRow | null }> {
  if (claim.name !== "deliver-smart-report-email") throw new Error("report_email_claim_invalid");
  const payload = ReportEmailJobPayloadSchema.parse(claim.payload);
  await tx.query("SET LOCAL lock_timeout='5s'", []);
  await tx.query("SET LOCAL statement_timeout='10s'", []);
  await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [payload.organization_id]);
  await createWorkerJobStore(tx).lock(claim);
  const identity = (
    await tx.query<ReportEmailRow>(
      "SELECT run_id FROM report_email_deliveries WHERE id=$1 AND organization_id=$2 AND job_id=$3",
      [payload.delivery_id, payload.organization_id, claim.id]
    )
  ).rows[0];
  if (!identity) throw new ReportEmailSuppressed("report_unavailable");
  const run =
    identity["run_id"] === null
      ? null
      : ((
          await tx.query<ReportEmailRow>(
            "SELECT * FROM report_runs WHERE id=$1 AND organization_id=$2 FOR UPDATE",
            [identity["run_id"], payload.organization_id]
          )
        ).rows[0] ?? null);
  const delivery = (
    await tx.query<ReportEmailRow>(
      "SELECT * FROM report_email_deliveries WHERE id=$1 AND organization_id=$2 AND job_id=$3 FOR UPDATE",
      [payload.delivery_id, payload.organization_id, claim.id]
    )
  ).rows[0];
  if (!delivery) throw new ReportEmailSuppressed("report_unavailable");
  return { delivery, run };
}
/** A recipient's personal policy supplements the saved creator and entire scope. */
export async function requireReportEmailRecipient(
  tx: Queryable,
  delivery: ReportEmailRow,
  run: ReportEmailRow | null
): Promise<string> {
  if (!run || delivery["recipient_user_id"] === null)
    throw new ReportEmailSuppressed("recipient_unavailable");
  if (
    (
      await tx.query(
        "SELECT id FROM report_email_deliveries WHERE id=$1 AND send_deadline_at>clock_timestamp()",
        [delivery["id"]]
      )
    ).rows.length !== 1
  )
    throw new ReportEmailSuppressed("delivery_expired");
  if (
    run["send_email"] !== true ||
    run["ready_sha256"] !== delivery["expected_ready_sha256"] ||
    !z
      .array(z.uuid())
      .parse(run["recipient_user_ids"])
      .includes(z.uuid().parse(delivery["recipient_user_id"]))
  )
    throw new ReportEmailSuppressed("report_unavailable");
  try {
    await authorizeStoredReportRun(tx, run);
  } catch (error) {
    if (error instanceof SmartReportError)
      throw new ReportEmailSuppressed(
        error.code === "upgrade_required" ? "plan_lost" : "creator_access_lost"
      );
    throw error;
  }
  const user = (
    await tx.query<{ email: string }>(
      "SELECT email FROM users WHERE id=$1 AND email_verified_at IS NOT NULL",
      [delivery["recipient_user_id"]]
    )
  ).rows[0];
  if (!user || !z.email().safeParse(user.email).success)
    throw new ReportEmailSuppressed("recipient_unavailable");
  try {
    await readPublishedReportRun(tx, {
      organization_id: z.uuid().parse(delivery["organization_id"]),
      id: z.uuid().parse(delivery["run_id"]),
      initiator: {
        version: 1,
        kind: "browser_session",
        user_id: z.uuid().parse(delivery["recipient_user_id"])
      }
    });
  } catch (error) {
    if (error instanceof SmartReportError) throw new ReportEmailSuppressed("recipient_access_lost");
    throw error;
  }
  const preferences = createNotificationPreferencesStore(tx);
  // Notification policy is canonical-project scoped; exact retained origins
  // were independently checked as a whole by both authorisation gates above.
  for (const project of AcceptedReportScopeSchema.parse(run["accepted_scope"])) {
    const decision = await preferences.decide({
      project_id: project.project_id,
      channel: "email",
      recipient: user.email,
      occurred_at: new Date(String(run["published_at"])).toISOString()
    });
    if (decision.mode === "off") throw new ReportEmailSuppressed("notification_suppressed");
  }
  return user.email;
}
