import { z } from "zod";
import { NotificationScheduleSchema } from "../../shared-types/src/notification-preferences.js";
import { nextDailyNotificationAt } from "../../shared-types/src/notification-schedule.js";
import {
  ReportCadenceSchema,
  ReportPeriodSchema,
  lastCompletedReportPeriod,
  type ReportPeriod
} from "./report-period.js";

const DeliveryInputSchema = z
  .object({ period: ReportPeriodSchema, schedule: NotificationScheduleSchema })
  .strict();
/** Facts close at a UTC boundary. Use the first valid configured local minute
 * at or after that boundary, even when it falls on the following local day. */
export function reportDeliveryAt(raw: z.infer<typeof DeliveryInputSchema>): string {
  const input = DeliveryInputSchema.parse(raw);
  return nextDailyNotificationAt(input.schedule, new Date(Date.parse(input.period.ends_at) - 1));
}
const NextInputSchema = z
  .object({
    cadence: ReportCadenceSchema,
    schedule: NotificationScheduleSchema,
    after: z.string().datetime()
  })
  .strict();
/** New schedules choose a future delivery, not an unbounded historical catchup.
 * Persist the returned period alongside due_at; local delivery time alone cannot
 * identify a report's UTC window around offsets and daylight-saving changes. */
export function nextReportSchedule(raw: z.infer<typeof NextInputSchema>): {
  period: ReportPeriod;
  due_at: string;
} {
  const input = NextInputSchema.parse(raw);
  let period = lastCompletedReportPeriod(input.cadence, input.after);
  let due = reportDeliveryAt({ period, schedule: input.schedule });
  if (Date.parse(due) <= Date.parse(input.after)) {
    const nextEnd = new Date(period.ends_at);
    if (input.cadence === "monthly") nextEnd.setUTCMonth(nextEnd.getUTCMonth() + 1);
    else nextEnd.setUTCDate(nextEnd.getUTCDate() + (input.cadence === "weekly" ? 7 : 1));
    period = lastCompletedReportPeriod(input.cadence, nextEnd.toISOString());
    due = reportDeliveryAt({ period, schedule: input.schedule });
  }
  if (Date.parse(due) <= Date.parse(input.after)) throw new Error("report_schedule_unresolvable");
  return { period, due_at: due };
}
