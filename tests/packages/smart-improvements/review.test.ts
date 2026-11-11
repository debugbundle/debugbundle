import { describe, expect, it } from "vitest";
import {
  ReviewArtifactSchema,
  ReviewFactsSchema,
  reviewEvidenceDigest,
  reviewPolicy,
  reviewPriorities,
  validateReviewGuidance
} from "../../../packages/smart-improvements/src/review.js";
import { reviewFactsFixture } from "../../helpers/improvement-reviews.js";

describe("weekly improvement evidence", () => {
  it("preserves explicit source relationships but rejects invented or self-referencing links", () => {
    const facts = reviewFactsFixture();
    facts.sources.push({
      ...facts.sources[0]!,
      ref: "e2",
      kind: "improvement",
      related_refs: ["e1"]
    });
    expect(ReviewFactsSchema.parse(facts).sources[1]!.related_refs).toEqual(["e1"]);
    for (const refs of [["e2"], ["e8"], ["e1", "e1"]]) {
      facts.sources[1]!.related_refs = refs;
      expect(ReviewFactsSchema.safeParse(facts).success).toBe(false);
    }
  });
  it("provides concrete source-specific checks for each evidence domain without claiming a fix", () => {
    const facts = reviewFactsFixture();
    facts.sources = ["incident", "improvement", "analytics", "health"].map((kind, index) => ({
      ...facts.sources[0]!,
      kind: kind as (typeof facts.sources)[number]["kind"],
      ref: `e${index + 1}`
    }));
    const priorities = reviewPriorities(facts);
    expect(new Set(priorities.map((item) => item.check)).size).toBe(4);
    expect(priorities[0]!.check).toContain("regression");
    expect(priorities[1]!.check).toContain("recurrence");
    expect(priorities[2]!.check).toContain("denominator");
    expect(priorities[3]!.check).toContain("overlapping");
  });
  it("keeps review allowances independent from report or purchased capacity pools", () => {
    expect(reviewPolicy("team")).toEqual({
      available: true,
      projects: 5,
      generations: 25,
      budget_nano_usd: 750000000
    });
    expect(reviewPolicy("business")).toEqual({
      available: true,
      projects: 10,
      generations: 50,
      budget_nano_usd: 1500000000
    });
    expect(reviewPolicy("solo").available).toBe(false);
  });
  it("does not treat another week of identical unresolved work as new evidence", () => {
    const facts = reviewFactsFixture(),
      next = structuredClone(facts);
    next.period.starts_at = "2026-11-09T00:00:00.000Z";
    next.period.ends_at = "2026-11-16T00:00:00.000Z";
    next.cutoff_at = "2026-11-16T09:00:00.000Z";
    expect(reviewEvidenceDigest(next)).toBe(reviewEvidenceDigest(facts));
    next.sources[0]!.count = 9;
    expect(reviewEvidenceDigest(next)).not.toBe(reviewEvidenceDigest(facts));
  });
  it("keeps priorities bounded, deterministic and linked to actual evidence", () => {
    const facts = reviewFactsFixture();
    expect(reviewPriorities(facts)).toHaveLength(1);
    expect(
      ReviewArtifactSchema.safeParse({
        schema_version: "improvement_review.v1",
        facts,
        priorities: [{ source_ref: "e9", check: "Inspect unknown evidence." }],
        guidance: null,
        analysis: "unavailable"
      }).success
    ).toBe(false);
  });
  it("rejects unknown references, identity leaks, unverified quantities and sensitive prose", () => {
    const facts = reviewFactsFixture(),
      guidance = {
        version: 1,
        investigations: [
          {
            title: "Investigate the failure",
            hypothesis: null,
            checks: ["Inspect the retained evidence."],
            evidence_refs: ["e1"]
          }
        ]
      };
    expect(validateReviewGuidance(facts, guidance)).toEqual(guidance);
    for (const text of [
      "HiddenAcme needs review",
      "Contact owner@example.test",
      "There are nine failures",
      "Use token=secret-value-now",
      "Inspect https://example.test"
    ]) {
      const invalid = structuredClone(guidance);
      invalid.investigations[0]!.title = text;
      expect(() => validateReviewGuidance(facts, invalid, ["HiddenAcme"]), text).toThrow();
    }
    guidance.investigations[0]!.evidence_refs = ["e8"];
    expect(() => validateReviewGuidance(facts, guidance)).toThrow("review_unknown_reference");
  });
});
