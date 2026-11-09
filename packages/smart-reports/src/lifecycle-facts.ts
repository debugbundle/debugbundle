import { MAX_SMART_REPORT_ORIGINS } from "../../shared-types/src/smart-report-limits.js";
import { z } from "zod";
import { ReportPeriodSchema } from "./report-period.js";

export const ReportLifecycleSourceSchema = z.enum(["incident", "improvement"]);
export const ReportOriginIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(MAX_SMART_REPORT_ORIGINS)
  .refine((ids) => new Set(ids).size === ids.length, { message: "duplicate_report_origin" });
export const ReportLifecycleReadSchema = z
  .object({
    definition_id: z.uuid(),
    origin_ids: ReportOriginIdsSchema,
    period: ReportPeriodSchema,
    now: z.string().datetime()
  })
  .strict();
const count = z.number().int().safe().nonnegative();
export const OriginLifecycleSummarySchema = z
  .object({
    project_id: z.uuid(),
    coverage: z.object({
      complete: z.boolean(),
      collected_from: z.string().datetime().nullable(),
      bounded_from: z.string().datetime()
    }),
    incidents: z.object({
      opened: count,
      resolution_events: count,
      distinct_resolved: count,
      regressed: count,
      reopened: count
    }),
    improvements: z.object({
      opened: count,
      resolution_events: count,
      distinct_resolved: count,
      restored: count,
      snoozed: count
    })
  })
  .strict();
export type OriginLifecycleSummary = z.infer<typeof OriginLifecycleSummarySchema>;
export const ReportLifecycleBackfillSchema = z
  .object({
    project_id: z.uuid(),
    source_type: ReportLifecycleSourceSchema,
    after_id: z.uuid().optional(),
    limit: z.number().int().min(1).max(500),
    now: z.string().datetime()
  })
  .strict();
