import { createHash } from "node:crypto";
import {
  ReviewFactsSchema,
  ReviewGuidanceSchema,
  type ReviewFacts,
  type ReviewGuidance,
  type ReviewArtifact
} from "./review-contract.js";
import { redactReportData } from "../../smart-reports/src/report-redaction.js";
import { containsReportIdentity } from "../../smart-reports/src/report-identity.js";
export * from "./review-contract.js";
export function validateReviewGuidance(
  facts: ReviewFacts,
  raw: unknown,
  identities: readonly string[] = []
): ReviewGuidance {
  const guidance = ReviewGuidanceSchema.parse(raw),
    refs = new Set(facts.sources.map((source) => source.ref));
  const seen = new Set<string>();
  for (const item of guidance.investigations) {
    if (
      item.evidence_refs.some((ref) => !refs.has(ref)) ||
      new Set(item.evidence_refs).size !== item.evidence_refs.length
    )
      throw new Error("review_unknown_reference");
    const key = [...item.evidence_refs].sort().join();
    if (seen.has(key)) throw new Error("review_duplicate_guidance");
    seen.add(key);
    // Quantitative claims stay in server facts. Suggestions must not smuggle
    // unverified numbers, URLs, credentials or restricted project identity.
    const text = [item.title, item.hypothesis ?? "", ...item.checks].join(" ");
    if (
      /[\p{N}]|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|percent)\b/iu.test(
        text
      ) ||
      JSON.stringify(redactReportData(item)) !== JSON.stringify(item) ||
      (facts.privacy_mode === "restricted" && containsReportIdentity(item, identities))
    )
      throw new Error("review_unsafe_guidance");
  }
  if (facts.sources.length === 0 && guidance.investigations.length > 0)
    throw new Error("review_unknown_reference");
  return guidance;
}
const order = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 } as const;
export function reviewPriorities(facts: ReviewFacts): ReviewArtifact["priorities"] {
  return [...facts.sources]
    .filter((source) => !["resolved", "snoozed", "dismissed", "healthy"].includes(source.status))
    .sort(
      (a, b) =>
        order[a.severity] - order[b.severity] || a.ref.localeCompare(b.ref, "en", { numeric: true })
    )
    .slice(0, 5)
    .map((source) => ({
      source_ref: source.ref,
      check:
        source.kind === "analytics"
          ? "Inspect the measured flow, denominator, sampling and comparable segments. Reproduce the reported friction before a bounded change; compare subsequent observations with the same coverage."
          : source.kind === "health"
            ? "Inspect the monitored check and retained failure evidence, distinguish overlapping checks from an account outage, and verify current recovery before closing the investigation."
            : source.kind === "improvement"
              ? "Inspect the opportunity and any recorded incident linkage, confirm recurrence in retained evidence, and validate a bounded change against the same detection rule. Linkage does not establish a cause."
              : "Inspect the linked incident evidence and affected execution path, reproduce the observed failure, and add a regression check before validating a bounded fix. The cause remains unverified."
    }));
}
/** Period/cutoff advance independently from evidence. Repeating unchanged known
 * work does not purchase another narrative merely because a week elapsed. */
export function reviewEvidenceDigest(facts: ReviewFacts): string {
  const parsed = ReviewFactsSchema.parse(facts);
  const evidence = {
    version: parsed.version,
    project_id: parsed.project_id,
    privacy_mode: parsed.privacy_mode,
    sources: parsed.sources,
    analytics: parsed.analytics,
    health: parsed.health,
    limitations: parsed.limitations
  };
  return createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
}
