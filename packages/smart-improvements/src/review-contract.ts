import { z } from "zod";
import { ReportPeriodSchema } from "../../smart-reports/src/report-period.js";
import { AcceptedReportScopeSchema } from "../../smart-reports/src/report-definition.js";
import { isSelfHostMode } from "../../shared-types/src/tier-capabilities.js";

export function reviewPolicy(
  plan: string,
  selfHosted = isSelfHostMode()
): { available: boolean; projects: number; generations: number; budget_nano_usd: number } {
  return {
    available: selfHosted || plan === "team" || plan === "business",
    projects: selfHosted ? 10 : plan === "business" ? 10 : plan === "team" ? 5 : 0,
    generations: selfHosted ? 50 : plan === "business" ? 50 : plan === "team" ? 25 : 0,
    budget_nano_usd:
      selfHosted || plan === "business" ? 1_500_000_000 : plan === "team" ? 750_000_000 : 0
  };
}
export const ReviewSettingsCommandSchema = z
  .object({
    expected_version: z.number().int().nonnegative(),
    enabled: z.boolean(),
    project_ids: z
      .array(z.uuid())
      .max(10)
      .refine((ids) => new Set(ids).size === ids.length),
    privacy_mode: z.enum(["restricted", "full"]).default("restricted"),
    source_consent: z.boolean(),
    expected_organization_id: z.uuid().optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.enabled && (!value.source_consent || value.project_ids.length === 0))
      ctx.addIssue({ code: "custom", message: "review_consent_required" });
  });
export const ReviewSettingsSchema = z
  .object({
    version: z.number().int().nonnegative(),
    enabled: z.boolean(),
    scope: z.array(AcceptedReportScopeSchema.element).max(10),
    privacy_mode: z.enum(["restricted", "full"]),
    source_consent: z.boolean(),
    next_due_at: z.string().datetime().nullable(),
    requires_review: z.boolean()
  })
  .strict();
export const ReviewSourceSchema = z
  .object({
    ref: z.string().regex(/^e[1-9][0-9]?$/),
    kind: z.enum(["incident", "improvement", "analytics", "health"]),
    origin_project_id: z.uuid(),
    source_id: z.uuid().nullable(),
    related_refs: z
      .array(z.string().regex(/^e[1-9][0-9]?$/))
      .max(8)
      .optional(),
    title: z.string().min(1).max(160),
    context: z.string().max(600).nullable(),
    status: z.string().min(1).max(40),
    severity: z.enum(["critical", "high", "medium", "low", "unknown"]),
    count: z.number().int().safe().nonnegative().nullable(),
    observation: z.string().min(1).max(500)
  })
  .strict();
export const ReviewFactsSchema = z
  .object({
    version: z.literal(1),
    project_id: z.uuid(),
    period: ReportPeriodSchema,
    cutoff_at: z.string().datetime(),
    privacy_mode: z.enum(["full", "restricted"]),
    sources: z.array(ReviewSourceSchema).max(25),
    analytics: z
      .object({
        coverage: z.enum(["complete", "partial", "unavailable"]),
        sessions: z.number().int().safe().nonnegative().nullable(),
        page_views: z.number().int().safe().nonnegative().nullable()
      })
      .strict(),
    health: z
      .object({
        coverage: z.enum(["partial", "unavailable"]),
        total_checks: z.number().int().safe().nonnegative(),
        successful_checks: z.number().int().safe().nonnegative(),
        estimated_check_downtime_seconds: z.number().nonnegative()
      })
      .strict(),
    limitations: z.array(z.string().min(1).max(300)).max(10)
  })
  .strict()
  .superRefine((facts, ctx) => {
    const refs = new Set(facts.sources.map((item) => item.ref));
    if (
      facts.period.kind !== "weekly" ||
      new Set(facts.sources.map((item) => item.ref)).size !== facts.sources.length ||
      Date.parse(facts.cutoff_at) < Date.parse(facts.period.ends_at) ||
      facts.sources.some(
        (source) =>
          source.related_refs &&
          (new Set(source.related_refs).size !== source.related_refs.length ||
            source.related_refs.some((ref) => ref === source.ref || !refs.has(ref)))
      )
    )
      ctx.addIssue({ code: "custom", message: "review_facts_invalid" });
  });
export type ReviewFacts = z.infer<typeof ReviewFactsSchema>;
const prose = z.string().min(1).max(400);
export const ReviewGuidanceSchema = z
  .object({
    version: z.literal(1),
    investigations: z
      .array(
        z
          .object({
            title: z.string().min(1).max(120),
            hypothesis: prose.nullable(),
            checks: z.array(prose).min(1).max(4),
            evidence_refs: z.array(ReviewSourceSchema.shape.ref).min(1).max(5)
          })
          .strict()
      )
      .max(5)
  })
  .strict();
export type ReviewGuidance = z.infer<typeof ReviewGuidanceSchema>;
export const ReviewStatusSchema = z.enum([
  "queued",
  "processing",
  "ready",
  "factual_only",
  "no_data",
  "no_change",
  "skipped_quota",
  "paused_access",
  "failed"
]);
export const ReviewRecordSchema = z
  .object({
    id: z.uuid(),
    project_id: z.uuid(),
    project_name: z.string().min(1).max(160),
    period: ReportPeriodSchema,
    status: ReviewStatusSchema,
    reason: z
      .enum([
        "model_unavailable",
        "model_rejected",
        "model_uncertain",
        "quota",
        "access_changed",
        "processing_failed"
      ])
      .nullable(),
    created_at: z.string().datetime(),
    expires_at: z.string().datetime()
  })
  .strict();
export const ReviewArtifactSchema = z
  .object({
    schema_version: z.literal("improvement_review.v1"),
    facts: ReviewFactsSchema,
    priorities: z
      .array(z.object({ source_ref: ReviewSourceSchema.shape.ref, check: prose }).strict())
      .max(5),
    guidance: ReviewGuidanceSchema.nullable(),
    analysis: z.enum(["available", "unavailable", "no_data", "no_change"])
  })
  .strict()
  .superRefine((artifact, ctx) => {
    const refs = new Set(artifact.facts.sources.map((source) => source.ref));
    if (
      artifact.priorities.some((priority) => !refs.has(priority.source_ref)) ||
      new Set(artifact.priorities.map((priority) => priority.source_ref)).size !==
        artifact.priorities.length ||
      (artifact.analysis === "available") !== (artifact.guidance !== null) ||
      artifact.guidance?.investigations.some((item) =>
        item.evidence_refs.some((ref) => !refs.has(ref))
      )
    )
      ctx.addIssue({ code: "custom", message: "review_artifact_invalid" });
  });
export type ReviewArtifact = z.infer<typeof ReviewArtifactSchema>;
export type ReviewRecord = z.infer<typeof ReviewRecordSchema>;
export type ReviewSettings = z.infer<typeof ReviewSettingsSchema>;
export const ReviewListQuerySchema = z
  .object({
    project_id: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z
      .string()
      .min(1)
      .max(2048)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional()
  })
  .strict();
export const ReviewAllowanceSchema = z
  .object({
    limit: z.number().int().nonnegative(),
    used: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime()
  })
  .strict()
  .refine((value) => value.remaining === Math.max(0, value.limit - value.used));
