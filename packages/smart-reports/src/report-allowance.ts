import { z } from "zod";
import { NotificationScheduleSchema } from "../../shared-types/src/notification-preferences.js";
import { ReportCadenceSchema } from "./report-period.js";
import { nextReportSchedule } from "./report-schedule.js";
const count = z.number().int().safe().nonnegative();
export const ReportAllowanceSchema = z
  .object({
    organization_id: z.uuid(),
    as_of: z.string().datetime(),
    window: z.object({ starts_at: z.string().datetime(), ends_at: z.string().datetime() }).strict(),
    limit: count,
    used: count,
    remaining: count,
    scheduled_remaining: count,
    scope_complete: z.boolean(),
    schedule_exceeds_remaining: z.boolean()
  })
  .strict()
  .refine(
    (value) =>
      Date.parse(value.window.starts_at) < Date.parse(value.window.ends_at) &&
      value.remaining === Math.max(0, value.limit - value.used) &&
      value.schedule_exceeds_remaining === value.scheduled_remaining > value.remaining,
    { message: "report_allowance_arithmetic_invalid" }
  );
export type ReportAllowance = z.infer<typeof ReportAllowanceSchema>;
const ForecastSchema = z
  .object({
    now: z.string().datetime(),
    ends_at: z.string().datetime(),
    definitions: z
      .array(
        z
          .object({
            cadence: ReportCadenceSchema,
            schedule: NotificationScheduleSchema,
            next_due_at: z.string().datetime()
          })
          .strict()
      )
      .max(100)
  })
  .strict();
/** Forecast current configured delivery times, including one persisted overdue
 * period per definition. This estimates demand; only atomic run admission owns
 * quota. No clock resets, historical catch-up or schedule changes occur here. */
export function forecastRemainingReportRuns(raw: z.infer<typeof ForecastSchema>): number {
  const input = ForecastSchema.parse(raw),
    now = Date.parse(input.now),
    end = Date.parse(input.ends_at);
  if (end <= now) return 0;
  if (end - now > 32 * 86400000) throw new Error("report_forecast_window_invalid");
  let total = 0;
  for (const definition of input.definitions) {
    let due = Date.parse(definition.next_due_at);
    for (let steps = 0; due < end; steps++) {
      if (steps >= 34) throw new Error("report_forecast_bound_exceeded");
      total++;
      due = Date.parse(
        nextReportSchedule({
          cadence: definition.cadence,
          schedule: definition.schedule,
          after: new Date(Math.max(now, due)).toISOString()
        }).due_at
      );
    }
  }
  return total;
}

export const ReportAllowanceResponseSchema = z
  .object({ allowance: ReportAllowanceSchema })
  .strict();
