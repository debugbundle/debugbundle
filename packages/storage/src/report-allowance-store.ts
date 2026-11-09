import { z } from "zod";
import { getTierCapabilities } from "../../shared-types/src/index.js";
import {
  ReportAllowanceSchema,
  forecastRemainingReportRuns,
  type ReportAllowance
} from "../../smart-reports/src/report-allowance.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import { NotificationScheduleSchema } from "../../shared-types/src/notification-preferences.js";
import { ReportCadenceSchema } from "../../smart-reports/src/report-period.js";
import { ProjectJobInitiatorSchema } from "./project-job-authorization.js";
import { canAccessReportScope } from "./report-authorization.js";
import { createReportDefinitionStore } from "./report-definition-store.js";
import { resolveBillingUsageWindow } from "./billing-allowance-window.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";
const InputSchema = z
  .object({
    organization_id: z.uuid(),
    definition_id: z.uuid(),
    initiator: ProjectJobInitiatorSchema
  })
  .strict();
export interface ReportAllowanceStore {
  read(raw: z.infer<typeof InputSchema>): Promise<ReportAllowance>;
}
function iso(value: unknown): string | null {
  return value === null
    ? null
    : (value instanceof Date ? value : new Date(z.string().parse(value))).toISOString();
}
/** A known whole-scope definition anchors access. Aggregate usage is shared;
 * schedule demand includes only current readable definitions and says when that
 * view is partial. No hidden scope, definition names or creator data is returned. */
export function createReportAllowanceStore(
  db: Queryable,
  options: { now?: () => Date } = {}
): ReportAllowanceStore {
  return {
    async read(raw) {
      const input = InputSchema.parse(raw);
      const identity = {
        organization_id: input.organization_id,
        id: input.definition_id,
        initiator: input.initiator
      };
      const result = await runInTransaction(db, async (tx) => {
        await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY", []);
        await tx.query("SET LOCAL statement_timeout='5s'", []);
        if (!(await createReportDefinitionStore(tx).get(identity)))
          throw new SmartReportError("report_not_found");
        const row = (
          await tx.query<Record<string, unknown>>(
            `SELECT plan,billing_interval,billing_period_starts_at,billing_period_ends_at,billing_allowance_anchor_at,clock_timestamp() AS now FROM organizations WHERE id=$1`,
            [input.organization_id]
          )
        ).rows[0];
        if (!row) throw new SmartReportError("forbidden");
        const now = options.now?.() ?? new Date(iso(row["now"])!),
          plan = z.enum(["free", "solo", "team", "business"]).parse(row["plan"]);
        const window = resolveBillingUsageWindow({
          now,
          plan,
          billing_interval: z.enum(["month", "year"]).nullable().parse(row["billing_interval"]),
          billing_period_starts_at: iso(row["billing_period_starts_at"]),
          billing_period_ends_at: iso(row["billing_period_ends_at"]),
          billing_allowance_anchor_at: iso(row["billing_allowance_anchor_at"])
        });
        const usage = (
          await tx.query<{ generations: number }>(
            "SELECT generations FROM report_allowance_windows WHERE organization_id=$1 AND starts_at=$2",
            [input.organization_id, window.starts_at]
          )
        ).rows[0];
        const rows = (
          await tx.query<Record<string, unknown>>(
            `SELECT accepted_scope,initiating_authority,cadence,schedule,next_due_at FROM report_definitions
    WHERE organization_id=$1 AND enabled AND paused_at IS NULL AND NOT requires_owner_review ORDER BY id LIMIT 101`,
            [input.organization_id]
          )
        ).rows;
        let complete = rows.length <= 100;
        const scheduled = [];
        for (const definition of rows.slice(0, 100)) {
          if (
            !(await canAccessReportScope(tx, {
              organization_id: input.organization_id,
              scope: definition["accepted_scope"],
              initiator: input.initiator,
              manage: false
            }))
          ) {
            complete = false;
            continue;
          }
          if (
            definition["schedule"] === null ||
            definition["next_due_at"] === null ||
            !(await canAccessReportScope(tx, {
              organization_id: input.organization_id,
              scope: definition["accepted_scope"],
              initiator: definition["initiating_authority"],
              manage: true
            }))
          )
            continue;
          scheduled.push({
            cadence: ReportCadenceSchema.parse(definition["cadence"]),
            schedule: NotificationScheduleSchema.parse(definition["schedule"]),
            next_due_at: iso(definition["next_due_at"])!
          });
        }
        const caps = getTierCapabilities(plan),
          limit = caps.monthly_smart_report_generations,
          used = z
            .number()
            .int()
            .nonnegative()
            .parse(usage?.generations ?? 0),
          remaining = Math.max(0, limit - used);
        const demand = caps.smart_reports
          ? forecastRemainingReportRuns({
              now: now.toISOString(),
              ends_at: window.ends_at,
              definitions: scheduled
            })
          : 0;
        return ReportAllowanceSchema.parse({
          organization_id: input.organization_id,
          as_of: now.toISOString(),
          window,
          limit,
          used,
          remaining,
          scheduled_remaining: demand,
          scope_complete: complete,
          schedule_exceeds_remaining: demand > remaining
        });
      });
      if (!(await createReportDefinitionStore(db).get(identity)))
        throw new SmartReportError("report_not_found");
      return result;
    }
  };
}
