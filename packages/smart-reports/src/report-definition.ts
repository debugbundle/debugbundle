import {
  MAX_SMART_REPORT_PROJECTS,
  MAX_SMART_REPORT_RECIPIENTS,
  MAX_SMART_REPORT_ORIGINS
} from "../../shared-types/src/smart-report-limits.js";
import { z } from "zod";
import { NotificationScheduleSchema } from "../../shared-types/src/notification-preferences.js";
import { ReportCadenceSchema } from "./report-period.js";
import { ReportOriginIdsSchema } from "./lifecycle-facts.js";

export const ReportProjectIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(MAX_SMART_REPORT_PROJECTS)
  .refine((ids) => new Set(ids).size === ids.length, { message: "duplicate_report_project" });
export const ReportRecipientIdsSchema = z
  .array(z.uuid())
  .max(MAX_SMART_REPORT_RECIPIENTS)
  .refine((ids) => new Set(ids).size === ids.length, { message: "duplicate_report_recipient" });
const fields = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[^\u0000-\u001f\u007f]+$/),
    cadence: ReportCadenceSchema,
    project_ids: ReportProjectIdsSchema,
    recipient_user_ids: ReportRecipientIdsSchema.default([]),
    privacy_mode: z.enum(["full", "restricted"]).default("full"),
    source_collection_consent: z.boolean().default(false),
    schedule: NotificationScheduleSchema.nullable().default(null),
    enabled: z.boolean().default(false),
    // Confirmation keeps the existing digest unchanged. Its own settings remain
    // the explicit path for disabling it; report creation never broadens that action.
    weekly_overlap: z.literal("keep_existing").optional(),
    expected_organization_id: z.uuid().optional()
  })
  .strict();
function validateDefinition(value: z.infer<typeof fields>, context: z.RefinementCtx): void {
  if (value.privacy_mode === "full" && !value.source_collection_consent)
    context.addIssue({
      code: "custom",
      path: ["source_collection_consent"],
      message: "report_source_consent_required"
    });
  if (value.enabled && value.schedule === null)
    context.addIssue({ code: "custom", path: ["schedule"], message: "report_schedule_required" });
}
export const CreateReportDefinitionSchema = fields.superRefine(validateDefinition);
export const ReplaceReportDefinitionSchema = fields
  .extend({
    expected_version: z.number().int().positive(),
    resume_after_review: z.boolean().default(false)
  })
  .superRefine(validateDefinition);
export type CreateReportDefinition = z.infer<typeof CreateReportDefinitionSchema>;
export type ReplaceReportDefinition = z.infer<typeof ReplaceReportDefinitionSchema>;
export const AcceptedReportProjectSchema = z
  .object({ project_id: z.uuid(), origin_project_ids: ReportOriginIdsSchema })
  .strict();
export const AcceptedReportScopeSchema = z
  .array(AcceptedReportProjectSchema)
  .min(1)
  .max(MAX_SMART_REPORT_PROJECTS)
  .refine(
    (projects) => new Set(projects.map((project) => project.project_id)).size === projects.length,
    { message: "duplicate_report_project" }
  )
  .refine(
    (projects) => {
      const origins = projects.flatMap((project) => project.origin_project_ids);
      return new Set(origins).size === origins.length;
    },
    { message: "overlapping_report_origins" }
  )
  .refine(
    (projects) =>
      new Set(projects.flatMap((project) => project.origin_project_ids)).size <=
      MAX_SMART_REPORT_ORIGINS,
    { message: "report_origin_limit_exceeded" }
  );
export type AcceptedReportScope = z.infer<typeof AcceptedReportScopeSchema>;

export const ReportDefinitionRecordSchema = z
  .object({
    id: z.uuid(),
    organization_id: z.uuid(),
    created_by_user_id: z.uuid().nullable(),
    name: fields.shape.name,
    cadence: ReportCadenceSchema,
    scope: AcceptedReportScopeSchema,
    recipient_user_ids: ReportRecipientIdsSchema,
    privacy_mode: z.enum(["full", "restricted"]),
    source_collection_consent: z.boolean(),
    schedule: NotificationScheduleSchema.nullable(),
    enabled: z.boolean(),
    version: z.number().int().positive(),
    next_due_at: z.string().datetime().nullable(),
    next_period_ends_at: z.string().datetime().nullable(),
    requires_owner_review: z.boolean(),
    pause_reason: z.enum(["plan_lost", "creator_access_lost", "scope_unavailable"]).nullable(),
    paused_at: z.string().datetime().nullable(),
    weekly_overlap: z.literal("keep_existing").nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime()
  })
  .strict();
export type ReportDefinitionRecord = z.infer<typeof ReportDefinitionRecordSchema>;
