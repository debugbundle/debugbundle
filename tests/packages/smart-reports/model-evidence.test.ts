import { describe, expect, it } from "vitest";
import cases from "../../../evals/smart-reports/cases.json" with { type: "json" };
import {
  prepareReportModelInput,
  ReportModelFactsSchema
} from "../../../packages/smart-reports/src/model-evidence.js";
import {
  reportNarrativeSchemaForFacts,
  reportNarrativeJsonSchema,
  validateReportNarrative
} from "../../../packages/smart-reports/src/model-narrative.js";
import { projectReportNarrativeFacts } from "../../../packages/smart-reports/src/model-projection.js";
import {
  containsReportIdentity,
  protectRestrictedReportFacts
} from "../../../packages/smart-reports/src/report-identity.js";

function schemaNode(root: Record<string, unknown>, raw: unknown): Record<string, unknown> {
  let value = raw as Record<string, unknown>;
  for (let depth = 0; depth < 10 && typeof value["$ref"] === "string"; depth++) {
    const ref = value["$ref"];
    expect(ref).toMatch(/^#\//);
    let target: unknown = root;
    for (const key of ref.slice(2).split("/"))
      target = (target as Record<string, unknown>)[key.replaceAll("~1", "/").replaceAll("~0", "~")];
    value = target as Record<string, unknown>;
  }
  expect(value["$ref"]).toBeUndefined();
  return value;
}
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
  it("protects every restricted free-text field without sending the private identity set", () => {
    const facts = ReportModelFactsSchema.parse(cases.cases[0]!.facts);
    facts.privacy_mode = "restricted";
    facts.projects[0]!.name = "HiddenAcme";
    facts.projects[0]!.notes = ["HiddenAcme coverage is partial."];
    facts.metrics[0]!.notes = ["hidden-acme.example checkout observations."];
    facts.selection_notes = ["The PAYMENTS-PRIVATE service has incomplete coverage."];
    const identities = ["HiddenAcme", "hidden-acme.example", "payments-private"];
    const safe = protectRestrictedReportFacts(facts, identities);
    expect(safe.projects[0]!.name).toBe("Project A");
    expect(containsReportIdentity(safe, identities)).toBe(false);
    expect(safe.projects[0]!.coverage).toEqual(facts.projects[0]!.coverage);
    expect(safe.metrics[0]!.current).toBe(facts.metrics[0]!.current);
    expect(facts.projects[0]!.name).toBe("HiddenAcme");
  });
  it("detects Unicode, case, punctuation and overlapping identifiers without substring false positives", () => {
    expect(containsReportIdentity("ＡＣＭＥ—PAY is affected", ["Acme Pay"])).toBe(true);
    expect(containsReportIdentity("HIDDENACME is affected", ["HiddenAcme"])).toBe(true);
    expect(containsReportIdentity("hiddenacme is affected", ["HiddenAcme"])).toBe(true);
    expect(containsReportIdentity("商店東京 needs review", ["商店東京"])).toBe(true);
    expect(containsReportIdentity("CAFÉ SHOP needs review", ["Café-Shop"])).toBe(true);
    expect(
      containsReportIdentity("Review cartography and team workflows", ["Art", "Team", "A"])
    ).toBe(false);
    expect(containsReportIdentity("Project API needs review", ["API"])).toBe(true);
    expect(containsReportIdentity("Review the API response", ["API"])).toBe(false);
    expect(containsReportIdentity("Project A has partial coverage", ["A"])).toBe(false);
    expect(containsReportIdentity("Acme Plus is affected", ["Acme", "Acme Plus"])).toBe(true);
  });
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
  it.each(["recorded_resolution", "observed_recovery", "outstanding"] as const)(
    "excludes unsupported %s reference combinations from the provider schema as well as local validation",
    (kind) => {
      const facts = prepareReportModelInput(cases.cases[0]!.facts);
      for (const ref of ["p01_coverage", "p01_sessions", "p01_resolved"]) {
        const response = {
          ...output(),
          highlights: [
            { kind, text: "The linked observation describes the state.", evidence_refs: [ref] }
          ]
        };
        expect(() => validateReportNarrative(facts, response)).toThrow(
          "report_claim_not_supported"
        );
        expect(reportNarrativeSchemaForFacts(facts).safeParse(response).success).toBe(false);
      }
    }
  );
  it("admits only current period resolutions, observed health recoveries and active outstanding sources for their claim kinds", () => {
    const facts = prepareReportModelInput(
      cases.cases.find((fixture) => fixture.id === "resolution-regression")!.facts
    );
    const health = prepareReportModelInput(
      cases.cases.find((fixture) => fixture.id === "health-gaps")!.facts
    ).evidence[0]!;
    facts.evidence.push(health);
    const schema = reportNarrativeSchemaForFacts(facts);
    const highlight = (kind: string, evidence_refs: string[]) => ({
      ...output(),
      highlights: [
        { kind, text: "The linked observations describe the recorded state.", evidence_refs }
      ]
    });
    expect(schema.safeParse(highlight("recorded_resolution", ["p01_solved"])).success).toBe(true);
    expect(
      schema.safeParse(highlight("recorded_resolution", ["p01_resolution_events"])).success
    ).toBe(true);
    expect(schema.safeParse(highlight("observed_recovery", [health.ref])).success).toBe(true);
    expect(
      schema.safeParse(highlight("outstanding", ["p01_old_critical", "p01_resolve_regress"]))
        .success
    ).toBe(true);
    for (const [kind, refs] of [
      ["recorded_resolution", ["p01_resolve_regress"]],
      ["recorded_resolution", ["p01_resolution_events", "p01_resolve_regress"]],
      ["observed_recovery", ["p01_solved"]],
      ["outstanding", ["p01_solved"]],
      ["outstanding", ["p01_coverage", "p01_resolution_events"]]
    ] as const)
      expect(schema.safeParse(highlight(kind, [...refs])).success).toBe(false);
    // Historical documents keep their existing validator and canonical schema.
    expect(
      validateReportNarrative(facts, {
        ...highlight("recorded_resolution", ["p01_solved", "p01_coverage"]),
        priorities: [
          {
            title: "Review active work",
            action: "Investigate the retained evidence.",
            rationale: "The sources remain active.",
            evidence_refs: ["p01_old_critical"]
          }
        ]
      }).version
    ).toBe(1);
    // The actual wire schema must retain kind-dependent alternatives.
    expect(JSON.stringify(reportNarrativeJsonSchema(facts))).toContain('"anyOf"');
  });
  it("does not enable resolution or recovery claims from unknown counts or observations outside the period", () => {
    for (const current of [0, null]) {
      const raw = ReportModelFactsSchema.parse(cases.cases[0]!.facts);
      const metric = raw.metrics.find((item) => item.ref === "p01_resolved")!;
      metric.current = current;
      metric.current_complete = current !== null;
      const facts = prepareReportModelInput(raw);
      const result = {
        ...output(),
        highlights: [
          {
            kind: "recorded_resolution",
            text: "A workflow resolution was recorded.",
            evidence_refs: ["p01_resolved"]
          }
        ]
      };
      expect(reportNarrativeSchemaForFacts(facts).safeParse(result).success).toBe(false);
      expect(() => validateReportNarrative(facts, result)).toThrow("report_claim_not_supported");
    }
    const health = prepareReportModelInput(
      cases.cases.find((fixture) => fixture.id === "health-gaps")!.facts
    );
    health.evidence[0]!.period_events = [];
    expect(
      reportNarrativeSchemaForFacts(health).safeParse({
        ...output(),
        highlights: [
          {
            kind: "observed_recovery",
            text: "A recovery was observed.",
            evidence_refs: ["p01_recovery"]
          }
        ],
        limitations: [{ text: "Coverage is partial.", evidence_refs: ["p01_coverage"] }]
      }).success
    ).toBe(false);
  });
  it.each(cases.cases)(
    "every special claim/reference admitted by the emitted provider schema is supported in $id",
    (fixture) => {
      const facts = projectReportNarrativeFacts(fixture.facts);
      const json = reportNarrativeJsonSchema(facts);
      const root = schemaNode(json, json);
      const properties = root["properties"] as Record<string, unknown>;
      const highlights = schemaNode(json, properties["highlights"]);
      const item = schemaNode(json, highlights["items"]);
      const variants = Array.isArray(item["anyOf"]) ? (item["anyOf"] as unknown[]) : [item];
      const base = {
        ...output(facts.projects[0]!.coverage_ref),
        limitations: facts.projects.map((project) => ({
          text: "Read the recorded coverage before interpreting observations.",
          evidence_refs: [project.coverage_ref]
        })),
        priorities: facts.projects.flatMap((project) => {
          const refs = facts.evidence
            .filter(
              (source) =>
                source.project_ref === project.ref && ["open", "regressed"].includes(source.status)
            )
            .map((source) => source.ref);
          return refs.length
            ? [
                {
                  title: "Review active work",
                  action: "Investigate the retained evidence.",
                  rationale: "The sources remain active.",
                  evidence_refs: refs
                }
              ]
            : [];
        })
      };
      for (const raw of variants) {
        const variant = schemaNode(json, raw);
        expect(variant["additionalProperties"]).toBe(false);
        const fields = variant["properties"] as Record<string, unknown>;
        const kindSchema = schemaNode(json, fields["kind"]);
        const kinds = (kindSchema["enum"] ?? [kindSchema["const"]]) as string[];
        const references = schemaNode(json, fields["evidence_refs"]);
        const reference = schemaNode(json, references["items"]);
        const admitted = (reference["enum"] ?? [reference["const"]]) as string[];
        expect(admitted.length).toBeGreaterThan(0);
        for (const kind of kinds.filter((kind) =>
          ["recorded_resolution", "observed_recovery", "outstanding"].includes(kind)
        ))
          for (const ref of admitted) {
            const response = {
              ...base,
              highlights: [
                {
                  kind,
                  text: "The linked evidence supports the recorded state.",
                  evidence_refs: [ref]
                }
              ]
            };
            expect(
              () => validateReportNarrative(facts, response),
              `${fixture.id}:${kind}:${ref}`
            ).not.toThrow();
          }
      }
    }
  );
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

it("protects emoji-only and mixed-symbol project identities without treating ordinary punctuation as an identity", () => {
  expect(containsReportIdentity("The 🚀 project needs review.", ["🚀"])).toBe(true);
  expect(containsReportIdentity("🔥Team needs review.", ["🔥 Team"])).toBe(true);
  expect(containsReportIdentity("The plain project needs review.", ["++"])).toBe(false);
});
