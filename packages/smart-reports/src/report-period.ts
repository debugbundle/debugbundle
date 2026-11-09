import { z } from "zod";

export const ReportCadenceSchema = z.enum(["daily", "weekly", "monthly"]);
export type ReportCadence = z.infer<typeof ReportCadenceSchema>;
const DAY = 86_400_000;
function boundary(kind: ReportCadence, at: Date): Date {
  const result = new Date(at);
  result.setUTCHours(0, 0, 0, 0);
  if (kind === "monthly") result.setUTCDate(1);
  if (kind === "weekly") result.setUTCDate(result.getUTCDate() - ((result.getUTCDay() + 6) % 7));
  return result;
}
function before(kind: ReportCadence, end: Date): Date {
  const start = new Date(end);
  if (kind === "monthly") start.setUTCMonth(start.getUTCMonth() - 1);
  else start.setUTCDate(start.getUTCDate() - (kind === "weekly" ? 7 : 1));
  return start;
}
export const ReportPeriodSchema = z
  .object({
    kind: ReportCadenceSchema,
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime(),
    duration_days: z.number().int().min(1).max(31)
  })
  .strict()
  .superRefine((value, context) => {
    const start = new Date(value.starts_at),
      end = new Date(value.ends_at);
    if (
      boundary(value.kind, start).getTime() !== start.getTime() ||
      boundary(value.kind, end).getTime() !== end.getTime() ||
      before(value.kind, end).getTime() !== start.getTime() ||
      (end.getTime() - start.getTime()) / DAY !== value.duration_days
    ) {
      context.addIssue({ code: "custom", message: "report_period_invalid" });
    }
  });
export type ReportPeriod = z.infer<typeof ReportPeriodSchema>;
function endingAt(kind: ReportCadence, end: Date): ReportPeriod {
  const start = before(kind, end);
  return ReportPeriodSchema.parse({
    kind,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    duration_days: (end.getTime() - start.getTime()) / DAY
  });
}
/** Reporting periods are UTC and half-open. Delivery's local timezone never
 * changes their facts, even across daylight-saving transitions. */
export function lastCompletedReportPeriod(kind: ReportCadence, now: string): ReportPeriod {
  ReportCadenceSchema.parse(kind);
  z.string().datetime().parse(now);
  return endingAt(kind, boundary(kind, new Date(now)));
}
export function previousReportPeriod(raw: ReportPeriod): ReportPeriod {
  const current = ReportPeriodSchema.parse(raw);
  return endingAt(current.kind, new Date(current.starts_at));
}
const ComparisonInputSchema = z
  .object({
    current: z.number().int().safe().min(0).max(1_000_000_000_000),
    previous: z.number().int().safe().min(0).max(1_000_000_000_000),
    current_period: ReportPeriodSchema,
    previous_period: ReportPeriodSchema,
    current_complete: z.boolean(),
    previous_complete: z.boolean()
  })
  .strict()
  .refine(
    (value) =>
      value.current_period.kind === value.previous_period.kind &&
      value.previous_period.ends_at === value.current_period.starts_at,
    { message: "report_comparison_periods_invalid" }
  );
export interface ReportMetricComparison {
  comparison_available: boolean;
  absolute_change: number | null;
  percent_change: number | null;
  current_per_day: number | null;
  previous_per_day: number | null;
  unequal_period_lengths: boolean;
}
/** A missing baseline is unknown, never a zero. Unequal calendar months retain
 * raw totals while exposing per-day rates; zero baselines have no percentage. */
export function compareReportMetric(
  raw: z.infer<typeof ComparisonInputSchema>
): ReportMetricComparison {
  const input = ComparisonInputSchema.parse(raw);
  const available = input.current_complete && input.previous_complete;
  const delta = input.current - input.previous;
  return {
    comparison_available: available,
    absolute_change: available ? delta : null,
    percent_change: available && input.previous > 0 ? (100 * delta) / input.previous : null,
    current_per_day: input.current_complete
      ? input.current / input.current_period.duration_days
      : null,
    previous_per_day: input.previous_complete
      ? input.previous / input.previous_period.duration_days
      : null,
    unequal_period_lengths:
      input.current_period.duration_days !== input.previous_period.duration_days
  };
}
