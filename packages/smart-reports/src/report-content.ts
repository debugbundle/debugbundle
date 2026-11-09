import { z } from "zod";
import { ReportDocumentSchema } from "./report-document.js";
import { ReportReferenceSchema } from "./model-evidence.js";
export const ReportContentViewSchema = z
  .object({
    document: ReportDocumentSchema,
    available_source_refs: z.array(ReportReferenceSchema).max(100)
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.available_source_refs).size !== value.available_source_refs.length ||
      value.available_source_refs.some(
        (ref) => !value.document.report.sources.some((source) => source.ref === ref)
      )
    )
      ctx.addIssue({ code: "custom", message: "report_source_reference_invalid" });
  });
export type ReportContentView = z.infer<typeof ReportContentViewSchema>;

/** Link bases come from trusted operator/auth configuration, never report text. */
export function reportLinkLocation(path: string, base?: string): string {
  if (!/^\/(?:v1\/organizations|projects)\//.test(path) || path.includes("\\"))
    throw new Error("report_link_path_invalid");
  if (base === undefined) return path;
  const target = new URL(base);
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  )
    throw new Error("report_link_base_invalid");
  return new URL(path, target).toString();
}
