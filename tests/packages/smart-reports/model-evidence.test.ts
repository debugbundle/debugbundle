import { describe, expect, it } from "vitest";
import cases from "../../../evals/smart-reports/cases.json" with { type: "json" };
import {
  prepareReportModelInput,
  ReportModelFactsSchema
} from "../../../packages/smart-reports/src/model-evidence.js";
import {
  reportNarrativeSchemaForFacts,
  validateReportNarrative
} from "../../../packages/smart-reports/src/model-narrative.js";
function output(ref = "p01_coverage") {
  return {
    version: 1,
    overview: {
      text: "The available evidence describes the observed period.",
      evidence_refs: [ref]
    },
    highlights: [],
    priorities: [],
    limitations: []
  };
}
describe("Smart Report model boundary", () => {
  it("accepts every fixed synthetic fact case before a paid evaluation", () => {
    for (const fixture of cases.cases)
      expect(ReportModelFactsSchema.safeParse(fixture.facts).success, fixture.id).toBe(true);
  });
  it("supplies server-computed daily comparisons and keeps missing baselines unavailable", () => {
    const quiet = prepareReportModelInput(cases.cases[0]!.facts);
    expect(quiet.metrics.find((metric) => metric.ref === "p01_sessions")?.comparison).toMatchObject(
      { current_per_day: 10, previous_per_day: 10, rate_direction: "unchanged" }
    );
    const partial = prepareReportModelInput(
      cases.cases.find((fixture) => fixture.id === "analytics-gaps")!.facts
    );
    expect(partial.metrics[0]?.comparison).toMatchObject({
      comparison_available: false,
      percent_change: null,
      rate_direction: "unavailable"
    });
  });
  it("compares outstanding-issue snapshots without inventing daily activity rates", () => {
    const restricted = prepareReportModelInput(
      cases.cases.find((fixture) => fixture.id === "restricted")!.facts
    );
    expect(restricted.metrics[0]?.comparison).toMatchObject({
      metric_semantics: "snapshot",
      comparison_available: true,
      absolute_change: 0,
      current_per_day: null,
      previous_per_day: null,
      rate_direction: "unavailable",
      value_direction: "unchanged"
    });
  });
  it("sanitises egress again and excludes source text in restricted mode", () => {
    const adversarial = cases.cases.find((fixture) => fixture.id === "adversarial-context")!;
    const prepared = prepareReportModelInput(adversarial.facts);
    expect(JSON.stringify(prepared)).not.toContain("synthetic-fixture-secret");
    expect(JSON.stringify(prepared)).not.toContain("untrusted.example.test");
    expect(prepared.evidence[0]?.context).toContain("REPORT_INJECTION_CANARY");
    const restricted = cases.cases.find((fixture) => fixture.id === "restricted")!.facts;
    const source = {
      ...restricted,
      evidence: restricted.evidence.map((item) => ({
        ...item,
        title: "Sensitive captured title",
        context: "Sensitive captured narrative"
      }))
    };
    const limited = prepareReportModelInput(source);
    expect(limited.evidence[0]?.context).toBeNull();
    expect(JSON.stringify(limited)).not.toContain("Sensitive captured");
  });
  it("rejects invented references, numeric prose and arbitrary links", () => {
    const quiet = prepareReportModelInput(cases.cases[0]!.facts);
    expect(validateReportNarrative(quiet, output())).toMatchObject({ version: 1 });
    expect(() => validateReportNarrative(quiet, output("p99_secret"))).toThrow(
      "report_unknown_reference"
    );
    expect(() =>
      validateReportNarrative(quiet, {
        ...output(),
        overview: { text: "There were 999 failures.", evidence_refs: ["p01_coverage"] }
      })
    ).toThrow("report_numeric_prose");
    expect(() =>
      validateReportNarrative(quiet, {
        ...output(),
        overview: {
          text: "Read https://untrusted.example.test for details.",
          evidence_refs: ["p01_coverage"]
        }
      })
    ).toThrow("report_untrusted_link");
  });
  it("constrains reference membership and numeric prose in the requested output schema", () => {
    const quiet = prepareReportModelInput(cases.cases[0]!.facts),
      schema = reportNarrativeSchemaForFacts(quiet);
    expect(schema.safeParse(output()).success).toBe(true);
    expect(schema.safeParse(output("p01")).success).toBe(false);
    expect(
      schema.safeParse({
        ...output(),
        overview: { text: "There were 999 failures.", evidence_refs: ["p01_coverage"] }
      }).success
    ).toBe(false);
    expect(
      schema.safeParse({
        ...output(),
        priorities: [
          {
            title: "Investigate",
            action: "Review the data.",
            rationale: "Check the state.",
            evidence_refs: ["p01_coverage"]
          }
        ]
      }).success
    ).toBe(false);
    const monthly = prepareReportModelInput(
      cases.cases.find((fixture) => fixture.id === "ten-project-full-month")!.facts
    );
    expect(reportNarrativeSchemaForFacts(monthly).safeParse(output()).success).toBe(false);
    expect(
      reportNarrativeSchemaForFacts(monthly).safeParse({
        ...output(),
        limitations: [{ text: "The source selection is bounded.", evidence_refs: ["p01_coverage"] }]
      }).success
    ).toBe(true);
  });
  it("refuses invented solved/recovery claims and missing old critical priorities", () => {
    const active = prepareReportModelInput(
      cases.cases.find((fixture) => fixture.id === "adversarial-context")!.facts
    );
    expect(() => validateReportNarrative(active, output())).toThrow("report_priority_missing");
    const base = {
      ...output(),
      priorities: [
        {
          title: "Investigate the active failure",
          action: "Reproduce the captured failure in a bounded environment.",
          rationale: "The incident remains active.",
          evidence_refs: ["p01_attack"]
        }
      ]
    };
    expect(validateReportNarrative(active, base)).toMatchObject({ version: 1 });
    expect(() =>
      validateReportNarrative(active, {
        ...base,
        highlights: [
          {
            kind: "recorded_resolution",
            text: "The failure is resolved.",
            evidence_refs: ["p01_attack"]
          }
        ]
      })
    ).toThrow("report_claim_not_supported");
    expect(() =>
      validateReportNarrative(active, {
        ...base,
        highlights: [
          {
            kind: "observed_recovery",
            text: "The endpoint recovered.",
            evidence_refs: ["p01_attack"]
          }
        ]
      })
    ).toThrow("report_claim_not_supported");
  });
  it("places critical actions first while preserving equal-severity model ordering", () => {
    const facts = prepareReportModelInput(
      cases.cases.find((fixture) => fixture.id === "ten-project-full-month")!.facts
    );
    const priorities = facts.projects.map((project) => ({
      title: "Investigate the active issue",
      action: "Perform a bounded reproduction and verify the outcome.",
      rationale: "The issue remains active.",
      evidence_refs: [`${project.ref}_old`]
    }));
    const result = validateReportNarrative(facts, {
      ...output(),
      priorities,
      limitations: [{ text: "The selection is bounded.", evidence_refs: ["p01_coverage"] }]
    });
    expect(result.priorities[0]?.evidence_refs).toEqual(["p10_old"]);
    expect(result.priorities.slice(1, 3).map((priority) => priority.evidence_refs[0])).toEqual([
      "p01_old",
      "p02_old"
    ]);
  });
});
