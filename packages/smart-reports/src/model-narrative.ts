import { z } from "zod";
import {
  ReportReferenceSchema,
  ReportModelFactsSchema,
  type ReportModelFacts,
  type ReportModelEvidence
} from "./model-evidence.js";
const refs = z
  .array(ReportReferenceSchema)
  .min(1)
  .max(10)
  .refine((value) => new Set(value).size === value.length, {
    message: "duplicate_report_reference"
  });
const line = z.object({ text: z.string().trim().min(1).max(700), evidence_refs: refs }).strict();
export const ReportNarrativeSchema = z
  .object({
    version: z.literal(1),
    overview: line,
    highlights: z
      .array(
        line.extend({
          kind: z.enum([
            "happened",
            "recorded_resolution",
            "observed_recovery",
            "outstanding",
            "inference"
          ])
        })
      )
      .max(10),
    priorities: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(100),
            action: z.string().trim().min(1).max(300),
            rationale: z.string().trim().min(1).max(400),
            evidence_refs: refs
          })
          .strict()
      )
      .max(10),
    limitations: z.array(line).max(10)
  })
  .strict();
export type ReportNarrative = z.infer<typeof ReportNarrativeSchema>;
/** Constrain the provider's decoder to admitted references. Local validation
 * still rechecks claim kinds, coverage and priorities before publication. */
export function reportNarrativeSchemaForFacts(raw: ReportModelFacts): z.ZodType<ReportNarrative> {
  const facts = ReportModelFactsSchema.parse(raw);
  const allowed = [
    ...new Set([
      ...facts.projects.map((project) => project.coverage_ref),
      ...facts.metrics.map((metric) => metric.ref),
      ...facts.evidence.map((item) => item.ref)
    ])
  ].sort();
  const activeIds = facts.evidence
    .filter((item) => item.status === "open" || item.status === "regressed")
    .map((item) => item.ref)
    .sort();
  const references = z
    .array(z.enum(allowed as [string, ...string[]]))
    .min(1)
    .max(10);
  const priorityReferences =
    activeIds.length === 0
      ? references
      : z
          .array(z.enum(activeIds as [string, ...string[]]))
          .min(1)
          .max(10);
  const pattern = /^[^0-9<>]*$/;
  const boundedLine = line.extend({
    text: line.shape.text.regex(pattern),
    evidence_refs: references
  });
  const limitations = z.array(boundedLine).max(10);
  const needsCoverageNote =
    facts.selection_notes.length > 0 ||
    facts.privacy_mode === "restricted" ||
    facts.projects.some((project) =>
      Object.values(project.coverage).some((value) => value !== "complete")
    );
  const priority = ReportNarrativeSchema.shape.priorities.element;
  return ReportNarrativeSchema.extend({
    overview: boundedLine,
    highlights: z
      .array(
        boundedLine.extend({ kind: ReportNarrativeSchema.shape.highlights.element.shape.kind })
      )
      .max(10),
    priorities: z
      .array(
        priority.extend({
          title: priority.shape.title.regex(pattern),
          action: priority.shape.action.regex(pattern),
          rationale: priority.shape.rationale.regex(pattern),
          evidence_refs: priorityReferences
        })
      )
      .max(activeIds.length === 0 ? 0 : 10),
    limitations: needsCoverageNote ? limitations.min(1) : limitations
  });
}
export function reportNarrativeJsonSchema(facts: ReportModelFacts): Record<string, unknown> {
  // Provider Structured Outputs supports definitions/references. Share the
  // admitted enum instead of paying to repeat it in every narrative section.
  const document: Record<string, unknown> = {
    ...z.toJSONSchema(reportNarrativeSchemaForFacts(facts), {
      target: "draft-2020-12",
      io: "input",
      reused: "ref"
    })
  };
  delete document["$schema"];
  return document;
}
function active(item: ReportModelEvidence): boolean {
  return item.status === "open" || item.status === "regressed";
}
function checkText(value: string): void {
  if (/https?:\/\/|www\.|<[^>]*>/i.test(value)) throw new Error("report_untrusted_link");
  // Numeric tables belong to immutable server facts, not generated prose. This
  // also avoids accidental arithmetic/rounding changes across output formats.
  if (
    /\d|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|hundred|thousand|million|billion|percent|percentage)\b/i.test(
      value
    )
  )
    throw new Error("report_numeric_prose");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    throw new Error("report_unsafe_prose");
}
/** Reference and claim-kind checks are deterministic. Qualitative prose still
 * needs the frozen evaluation's factual review; this is not a semantic oracle. */
export function validateReportNarrative(rawFacts: ReportModelFacts, raw: unknown): ReportNarrative {
  const facts = ReportModelFactsSchema.parse(rawFacts),
    result = ReportNarrativeSchema.parse(raw);
  const sources = new Map(facts.evidence.map((item) => [item.ref, item])),
    metrics = new Map(facts.metrics.map((item) => [item.ref, item]));
  const known = new Set([
    ...facts.projects.map((item) => item.coverage_ref),
    ...sources.keys(),
    ...metrics.keys()
  ]);
  const all = [result.overview, ...result.highlights, ...result.limitations, ...result.priorities];
  for (const entry of all) {
    for (const ref of entry.evidence_refs)
      if (!known.has(ref)) throw new Error("report_unknown_reference");
    if ("text" in entry) checkText(entry.text);
    else {
      checkText(entry.title);
      checkText(entry.action);
      checkText(entry.rationale);
    }
  }
  for (const entry of result.highlights) {
    const evidence = entry.evidence_refs.flatMap((ref) =>
      sources.get(ref) ? [sources.get(ref)!] : []
    );
    if (entry.kind === "recorded_resolution") {
      const recordedMetric = entry.evidence_refs.some((ref) => {
        const metric = metrics.get(ref);
        return (
          metric !== undefined &&
          ["resolution_events", "distinct_resolved_incidents", "resolved_improvements"].includes(
            metric.key
          ) &&
          (metric.current ?? 0) > 0
        );
      });
      if (
        (!recordedMetric && evidence.length === 0) ||
        evidence.some(
          (item) => item.status !== "resolved" || !item.period_events.includes("resolved")
        )
      )
        throw new Error("report_claim_not_supported");
    }
    if (
      entry.kind === "observed_recovery" &&
      (evidence.length === 0 ||
        evidence.some(
          (item) =>
            item.type !== "health" ||
            item.status !== "observed_recovery" ||
            !item.period_events.includes("observed_recovery")
        ))
    )
      throw new Error("report_claim_not_supported");
    if (
      entry.kind === "outstanding" &&
      (evidence.length === 0 || evidence.some((item) => !active(item)))
    )
      throw new Error("report_claim_not_supported");
  }
  for (const priority of result.priorities) {
    const evidence = priority.evidence_refs.flatMap((ref) =>
      sources.get(ref) ? [sources.get(ref)!] : []
    );
    if (evidence.length === 0 || evidence.some((item) => !active(item)))
      throw new Error("report_priority_not_supported");
  }
  const priorityRefs = new Set(result.priorities.flatMap((entry) => entry.evidence_refs));
  for (const item of facts.evidence)
    if (active(item) && item.severity === "critical" && !priorityRefs.has(item.ref))
      throw new Error("report_priority_missing");
  for (const project of facts.projects) {
    const urgent = facts.evidence.filter(
      (item) =>
        item.project_ref === project.ref &&
        active(item) &&
        ["critical", "high"].includes(item.severity)
    );
    if (urgent.length > 0 && !urgent.some((item) => priorityRefs.has(item.ref)))
      throw new Error("report_priority_missing");
    if (
      Object.values(project.coverage).some((value) => value !== "complete") &&
      !result.limitations.some((entry) => entry.evidence_refs.includes(project.coverage_ref))
    )
      throw new Error("report_coverage_missing");
  }
  if (
    (facts.selection_notes.length > 0 || facts.privacy_mode === "restricted") &&
    result.limitations.length === 0
  )
    throw new Error("report_coverage_missing");
  // Severity is a server fact. Preserve the model's order within a severity,
  // while preventing a lower-severity action from burying selected critical work.
  const severityRank = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0 } as const;
  result.priorities = result.priorities
    .map((priority, index) => ({
      priority,
      index,
      rank: Math.max(
        ...priority.evidence_refs.map(
          (ref) => severityRank[sources.get(ref)?.severity ?? "unknown"]
        )
      )
    }))
    .sort((left, right) => right.rank - left.rank || left.index - right.index)
    .map((entry) => entry.priority);
  return result;
}
