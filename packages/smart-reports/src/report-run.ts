import { z } from "zod";
import { AcceptedReportScopeSchema, ReportRecipientIdsSchema } from "./report-definition.js";
import { ReportPeriodSchema } from "./report-period.js";
export const ReportRunKindSchema = z.enum(["manual", "scheduled", "regeneration"]);
export const ReportRunStatusSchema = z.enum([
  "queued",
  "processing",
  "ready",
  "factual_only",
  "failed",
  "skipped_quota",
  "paused_access",
  "cancelled",
  "expired"
]);
export const ReportAiStatusSchema = z.enum([
  "unavailable",
  "pending",
  "succeeded",
  "failed",
  "uncertain"
]);
export const ReportRunCommandSchema = z
  .object({
    request_id: z.uuid(),
    definition_id: z.uuid(),
    expected_version: z.number().int().positive(),
    period: ReportPeriodSchema,
    regenerate_from_run_id: z.uuid().optional(),
    send_email: z.boolean().default(false),
    expected_organization_id: z.uuid().optional()
  })
  .strict();
export const ReportRunRecordSchema = z
  .object({
    id: z.uuid(),
    organization_id: z.uuid(),
    definition_id: z.uuid(),
    definition_version: z.number().int().positive(),
    name: z.string().min(1).max(120),
    scope: AcceptedReportScopeSchema,
    recipient_user_ids: ReportRecipientIdsSchema,
    privacy_mode: z.enum(["full", "restricted"]),
    period: ReportPeriodSchema,
    kind: ReportRunKindSchema,
    status: ReportRunStatusSchema,
    skip_reason: z.enum(["generation_quota", "ai_budget"]).nullable(),
    ai_status: ReportAiStatusSchema,
    generation_counted: z.boolean(),
    send_email: z.boolean(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    published_at: z.string().datetime().nullable(),
    expires_at: z.string().datetime().nullable()
  })
  .strict();
export type ReportRunRecord = z.infer<typeof ReportRunRecordSchema>;
