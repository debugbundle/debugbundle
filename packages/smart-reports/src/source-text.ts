import { z } from "zod";
import { MAX_SMART_REPORT_PROJECTS } from "../../shared-types/src/smart-report-limits.js";
import { redactReportData } from "./report-redaction.js";

export const REPORT_SOURCE_TEXT_GROUP_LIMITS = { urgent: 20, resolved: 15, recent: 15 } as const;
export const MAX_REPORT_SOURCE_TEXT_PER_VIEW = 50;
export const MAX_REPORT_SOURCE_TEXT_PER_DEFINITION =
  MAX_REPORT_SOURCE_TEXT_PER_VIEW * MAX_SMART_REPORT_PROJECTS;
export const ReportSourceTypeSchema = z.enum(["incident", "improvement"]);
const sourceSchema = z
  .object({
    selected_project_id: z.uuid(),
    origin_project_id: z.uuid(),
    source_type: ReportSourceTypeSchema,
    source_id: z.uuid(),
    source_version_at: z.string().datetime(),
    source_content_at: z.string().datetime(),
    first_seen_at: z.string().datetime(),
    last_seen_at: z.string().datetime(),
    status: z.enum(["open", "resolved", "regressed", "snoozed", "dismissed"]),
    severity: z.enum(["critical", "high", "medium", "low", "unknown"]),
    title: z.string().min(1).max(8192),
    context: z.string().max(16384).nullable(),
    privacy_mode: z.enum(["full", "restricted"]),
    source_collection_consent: z.boolean(),
    retention_days: z.number().int().min(1).max(90),
    now: z.string().datetime()
  })
  .strict()
  .refine((value) => Date.parse(value.first_seen_at) <= Date.parse(value.last_seen_at), {
    message: "report_source_time_invalid"
  });
export const ReportSourceTextSchema = z
  .object({
    selected_project_id: z.uuid(),
    origin_project_id: z.uuid(),
    source_type: ReportSourceTypeSchema,
    source_id: z.uuid(),
    source_version_at: z.string().datetime(),
    source_content_at: z.string().datetime(),
    first_seen_at: z.string().datetime(),
    last_seen_at: z.string().datetime(),
    status: sourceSchema.shape.status,
    severity: sourceSchema.shape.severity,
    title: z.string().min(1).max(160),
    context: z.string().max(1600).nullable(),
    context_origin: z.enum(["metadata", "bundle"]).default("metadata"),
    context_bundle_generation: z.number().int().positive().nullable().default(null),
    summary_group: z.enum(["urgent", "resolved", "recent"]),
    captured_at: z.string().datetime(),
    text_expires_at: z.string().datetime()
  })
  .strict()
  .refine(
    (value) => (value.context_origin === "bundle") === (value.context_bundle_generation !== null),
    { message: "report_source_context_invalid" }
  );
export type ReportSourceText = z.infer<typeof ReportSourceTextSchema>;
function boundedText(value: string, limit: number): string {
  let result = "";
  for (const character of value) {
    if (result.length + character.length > limit) break;
    result += character;
  }
  return result;
}
/** A reusable summary never renews the lifetime of its original content. The
 * store supplies current entitlement, scope, consent and source-row identity. */
export function createReportSourceText(raw: z.input<typeof sourceSchema>): ReportSourceText | null {
  const input = sourceSchema.parse(raw);
  if (input.privacy_mode !== "full" || !input.source_collection_consent) return null;
  const now = Date.parse(input.now),
    contentAt = Date.parse(input.source_content_at);
  const expires = contentAt + input.retention_days * 86_400_000;
  if (
    expires <= now ||
    contentAt > now ||
    Date.parse(input.source_version_at) > now ||
    Date.parse(input.last_seen_at) > now
  )
    return null;
  const text = z
    .object({ title: z.string(), context: z.string().nullable() })
    .strict()
    .parse(redactReportData({ title: input.title, context: input.context }, 32 * 1024));
  return ReportSourceTextSchema.parse({
    selected_project_id: input.selected_project_id,
    origin_project_id: input.origin_project_id,
    source_type: input.source_type,
    source_id: input.source_id,
    source_version_at: input.source_version_at,
    source_content_at: input.source_content_at,
    first_seen_at: input.first_seen_at,
    last_seen_at: input.last_seen_at,
    status: input.status,
    severity: input.severity,
    title: boundedText(text.title, 160),
    context: text.context === null ? null : boundedText(text.context, 1600),
    summary_group:
      input.status === "resolved"
        ? "resolved"
        : ["open", "regressed"].includes(input.status) &&
            ["critical", "high"].includes(input.severity)
          ? "urgent"
          : "recent",
    captured_at: input.now,
    text_expires_at: new Date(expires).toISOString()
  });
}
