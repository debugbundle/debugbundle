import { z } from "zod";
export const ReportSourceStateSchema = z
  .object({
    origin_project_id: z.uuid(),
    source_type: z.enum(["incident", "improvement", "health"]),
    source_id: z.uuid(),
    status: z.enum(["open", "resolved", "regressed", "snoozed", "dismissed", "observed_recovery"]),
    severity: z.enum(["critical", "high", "medium", "low", "unknown"]),
    first_seen_at: z.string().datetime().nullable(),
    last_seen_at: z.string().datetime().nullable(),
    source_version_at: z.string().datetime(),
    retained: z.boolean(),
    period_events: z
      .array(z.enum(["new", "resolved", "regressed", "reopened", "observed_recovery"]))
      .max(4)
  })
  .strict()
  .refine(
    (value) =>
      (value.source_type === "health") === (value.status === "observed_recovery") &&
      (value.source_type === "health" || !value.period_events.includes("observed_recovery")),
    { message: "report_source_recovery_invalid" }
  );
const count = z.number().int().safe().nonnegative();
export const ReportSourceSnapshotSchema = z
  .object({
    sources: z.array(ReportSourceStateSchema).max(50),
    known_sources: count,
    open_high_incidents: count,
    open_critical_incidents: count,
    complete: z.boolean()
  })
  .strict();
export type ReportSourceState = z.infer<typeof ReportSourceStateSchema>;
export type ReportSourceSnapshot = z.infer<typeof ReportSourceSnapshotSchema>;
