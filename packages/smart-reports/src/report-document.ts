import { z } from "zod";
import { CanonicalReportFactsSchema } from "./report-facts.js";
import { ReportNarrativeSchema, validateReportNarrative } from "./model-narrative.js";
import { ReportModelIdSchema } from "./model-cost.js";
import { projectReportNarrativeFacts } from "./model-projection.js";
export const LegacyReportDocumentBase = z
  .object({
    version: z.literal(1),
    template_version: z.literal(1),
    run_id: z.uuid(),
    name: z.string().min(1).max(120),
    report: CanonicalReportFactsSchema,
    narrative: ReportNarrativeSchema.nullable(),
    analysis: z
      .object({
        status: z.enum(["available", "unavailable"]),
        reason: z
          .enum([
            "model_unavailable",
            "input_limit",
            "preflight_unavailable",
            "model_rejected",
            "model_uncertain",
            "saved_response_unavailable"
          ])
          .nullable(),
        model: ReportModelIdSchema.nullable(),
        request_sha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .nullable()
      })
      .strict()
  })
  .strict();
export const FactualReportDocumentSchema = LegacyReportDocumentBase.extend({
  version: z.literal(2),
  narrative: z.null(),
  analysis: z
    .object({
      status: z.literal("not_requested"),
      reason: z.null(),
      model: z.null(),
      request_sha256: z.null()
    })
    .strict()
});
export const ReportDocumentSchema = z
  .discriminatedUnion("version", [LegacyReportDocumentBase, FactualReportDocumentSchema])
  .superRefine((value, ctx) => {
    if (value.version === 2) return;
    if (
      (value.analysis.status === "available") !== (value.narrative !== null) ||
      (value.analysis.status === "available") !== (value.analysis.reason === null)
    )
      ctx.addIssue({ code: "custom", message: "report_analysis_state_invalid" });
    if (value.narrative !== null) {
      try {
        validateReportNarrative(projectReportNarrativeFacts(value.report.facts), value.narrative);
      } catch {
        ctx.addIssue({ code: "custom", message: "report_document_narrative_invalid" });
      }
    }
  });
export type ReportDocument = z.infer<typeof ReportDocumentSchema>;
/** Old readers retain the exact v1 shape and truthful AI-unavailable semantics.
 * New clients explicitly request v2 to distinguish intended factual success. */
export function legacyReportDocument(
  document: ReportDocument
): z.infer<typeof LegacyReportDocumentBase> {
  return document.version === 1
    ? document
    : LegacyReportDocumentBase.parse({
        ...document,
        version: 1,
        analysis: {
          status: "unavailable",
          reason: "model_unavailable",
          model: null,
          request_sha256: null
        }
      });
}
export const MAX_REPORT_JSON_BYTES = 1024 * 1024;
