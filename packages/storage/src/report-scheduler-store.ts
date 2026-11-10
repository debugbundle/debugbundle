import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NotificationScheduleSchema } from "../../shared-types/src/notification-preferences.js";
import {
  ReportCadenceSchema,
  lastCompletedReportPeriod
} from "../../smart-reports/src/report-period.js";
import { nextReportSchedule } from "../../smart-reports/src/report-schedule.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import type { ReportAttemptProfile } from "../../smart-reports/src/model-cost.js";
import { ProjectJobInitiatorSchema } from "./project-job-authorization.js";
import { createReportRunAdmissionStore } from "./report-run-admission.js";
import { createSavepointQueryable } from "./savepoint-queryable.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";
export interface ReportSchedulerStore {
  scheduleNext(): Promise<{ processed: boolean }>;
}
const iso = (value: unknown): string =>
  (value instanceof Date ? value : new Date(z.string().parse(value))).toISOString();

/** Claim one due period, retaining UTC identity beside local delivery time.
 * Organisations with no recent admission go first; busy organisation locks are
 * skipped. One transaction owns admission and period advancement, with no
 * provider work. Restart/repeated local DST minutes cannot duplicate a period.
 * Resume the one persisted overdue period, then move to a future delivery;
 * outage recovery must not consume the allowance in a historical catch-up burst. */
export function createReportSchedulerStore(
  db: Queryable,
  options: { profile: ReportAttemptProfile | null; monthly_budget_nano_usd?: number }
): ReportSchedulerStore {
  return {
    async scheduleNext() {
      return runInTransaction(db, async (connection) => {
        const tx = createSavepointQueryable(connection);
        await tx.query("SET LOCAL lock_timeout='5s'", []);
        await tx.query("SET LOCAL statement_timeout='10s'", []);
        const candidate = (
          await tx.query<{ id: string; organization_id: string }>(
            `SELECT d.id,d.organization_id FROM report_definitions d JOIN organizations o ON o.id=d.organization_id
          LEFT JOIN LATERAL(SELECT created_at FROM report_runs previous WHERE previous.organization_id=o.id ORDER BY created_at DESC LIMIT 1) recent ON true
          WHERE d.enabled AND d.paused_at IS NULL AND NOT d.requires_owner_review AND d.next_due_at<=clock_timestamp()
          ORDER BY recent.created_at ASC NULLS FIRST,d.next_due_at,d.id FOR UPDATE OF o SKIP LOCKED LIMIT 1`,
            []
          )
        ).rows[0];
        if (!candidate) return { processed: false };
        const definition = (
          await tx.query<Record<string, unknown>>(
            `SELECT *,clock_timestamp() AS checked_at FROM report_definitions WHERE id=$1 AND organization_id=$2 AND enabled AND paused_at IS NULL AND NOT requires_owner_review AND next_due_at<=clock_timestamp() FOR UPDATE`,
            [candidate.id, candidate.organization_id]
          )
        ).rows[0];
        if (!definition) return { processed: false };
        const cadence = ReportCadenceSchema.parse(definition["cadence"]),
          period = lastCompletedReportPeriod(cadence, iso(definition["next_period_ends_at"]));
        if (period.ends_at !== iso(definition["next_period_ends_at"]))
          throw new Error("report_schedule_period_invalid");
        try {
          await createReportRunAdmissionStore(tx, {
            ...options,
            record_scheduled_quota_skips: true
          }).admit({
            organization_id: candidate.organization_id,
            definition_id: candidate.id,
            initiator: ProjectJobInitiatorSchema.parse(definition["initiating_authority"]),
            request_id: randomUUID(),
            expected_version: z.number().int().positive().parse(definition["version"]),
            period,
            kind: "scheduled"
          });
        } catch (error) {
          if (
            !(error instanceof SmartReportError) ||
            ![
              "forbidden",
              "email_verification_required",
              "invalid_report_scope",
              "invalid_report_recipient",
              "upgrade_required"
            ].includes(error.code)
          )
            throw error;
          const planLost = error.code === "upgrade_required";
          await tx.query(
            `UPDATE report_definitions SET paused_at=clock_timestamp(),pause_reason=$2,requires_owner_review=$3,version=version+1,updated_at=clock_timestamp() WHERE id=$1`,
            [
              candidate.id,
              planLost
                ? "plan_lost"
                : error.code === "invalid_report_scope" || error.code === "invalid_report_recipient"
                  ? "scope_unavailable"
                  : "creator_access_lost",
              planLost
            ]
          );
          return { processed: true };
        }
        const next = nextReportSchedule({
          cadence,
          schedule: NotificationScheduleSchema.parse(definition["schedule"]),
          after: new Date(
            Math.max(
              Date.parse(iso(definition["next_due_at"])),
              Date.parse(iso(definition["checked_at"]))
            )
          ).toISOString()
        });
        if (Date.parse(next.period.ends_at) <= Date.parse(period.ends_at))
          throw new Error("report_schedule_not_advanced");
        await tx.query(
          "UPDATE report_definitions SET next_due_at=$2,next_period_ends_at=$3 WHERE id=$1",
          [candidate.id, next.due_at, next.period.ends_at]
        );
        return { processed: true };
      });
    }
  };
}
