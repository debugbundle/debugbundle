import { expect, it } from "vitest";
import cases from "../../../evals/smart-reports/cases.json" with { type: "json" };
import { projectReportNarrativeFacts } from "../../../packages/smart-reports/src/model-projection.js";
import {
  prepareReportModelInput,
  ReportModelFactsSchema,
  type ReportModelFacts
} from "../../../packages/smart-reports/src/model-evidence.js";
import {
  reportNarrativeSchemaForFacts,
  validateReportNarrative,
  type ReportNarrative
} from "../../../packages/smart-reports/src/model-narrative.js";
import {
  lastCompletedReportPeriod,
  previousReportPeriod
} from "../../../packages/smart-reports/src/report-period.js";

const maximum = cases.cases.find((item) => item.id === "production-maximum-month")!.facts;
const situations = [
  "open",
  "regressed",
  "resolved",
  "snoozed",
  "dismissed",
  "observed_recovery"
] as const;

// Deterministic cartesian coverage, not a paid model evaluation or a semantic
// quality claim: 3 cadences × 2 modes × 10 scopes × 3 coverage × 6 states × 2 scripts.
it.each(
  (["daily", "weekly", "monthly"] as const).flatMap((cadence) =>
    (["full", "restricted"] as const).map((mode) => ({ cadence, mode }))
  )
)(
  "keeps supported $cadence/$mode combinations satisfiable and safe",
  ({ cadence, mode }) => {
    let checked = 0;
    for (let size = 1; size <= 10; size++)
      for (const coverage of ["complete", "partial", "unavailable"] as const)
        for (const status of situations)
          for (const unicode of [false, true]) {
            const source = ReportModelFactsSchema.parse(maximum);
            source.period = lastCompletedReportPeriod(cadence, "2026-11-01T00:00:00.000Z");
            source.previous_period = previousReportPeriod(source.period);
            source.cutoff_at = source.period.ends_at;
            source.privacy_mode = mode;
            source.projects = source.projects.slice(0, size).map((project) => ({
              ...project,
              coverage: { lifecycle: coverage, availability: coverage, analytics: coverage }
            }));
            const refs = new Set(source.projects.map((project) => project.ref));
            source.metrics = source.metrics.filter((item) => refs.has(item.project_ref));
            source.selection_notes = [];
            source.evidence = source.projects.flatMap((project) =>
              Array.from({ length: 4 }, (_, index): ReportModelFacts["evidence"][number] => ({
                ref: `${project.ref}_case${index}`,
                project_ref: project.ref,
                type:
                  status === "observed_recovery"
                    ? "health"
                    : status === "snoozed" || status === "dismissed"
                      ? "improvement"
                      : "incident",
                status,
                severity: index % 2 === 0 ? "critical" : "high",
                period_events:
                  status === "resolved"
                    ? ["resolved"]
                    : status === "regressed"
                      ? ["resolved", "regressed"]
                      : status === "observed_recovery"
                        ? ["observed_recovery"]
                        : [],
                first_seen_at: null,
                last_seen_at: null,
                title: unicode ? "調査対象の障害" : "Source observation",
                context: unicode ? "障害原因".repeat(400) : "Captured evidence. ".repeat(80)
              }))
            );
            const before = structuredClone(source),
              facts = projectReportNarrativeFacts(source);
            expect(source).toEqual(before);
            expect(facts.metrics).toEqual(prepareReportModelInput(source).metrics);
            expect(facts.evidence.length).toBeLessThanOrEqual(size * 3);
            expect(
              facts.evidence.reduce((sum, item) => sum + Buffer.byteLength(item.context ?? ""), 0)
            ).toBeLessThanOrEqual(4500);
            if (mode === "restricted")
              expect(facts.evidence.every((item) => item.context === null)).toBe(true);
            const priorities = facts.projects.flatMap((project) => {
              const active = facts.evidence.filter(
                (item) =>
                  item.project_ref === project.ref && ["open", "regressed"].includes(item.status)
              );
              return active.length
                ? [
                    {
                      title: "Investigate active failures",
                      action: "Review retained evidence and verify recovery.",
                      rationale: "Selected urgent work remains active.",
                      evidence_refs: active.map((item) => item.ref)
                    }
                  ]
                : [];
            });
            const narrative: ReportNarrative = {
              version: 1,
              overview: {
                text: "Review the retained observations and their coverage.",
                evidence_refs: [facts.projects[0]!.coverage_ref]
              },
              highlights: [],
              priorities,
              limitations: [
                {
                  text: "Interpret the selected evidence within its recorded coverage.",
                  evidence_refs: facts.projects.map((project) => project.coverage_ref)
                }
              ]
            };
            expect(reportNarrativeSchemaForFacts(facts).safeParse(narrative).success).toBe(true);
            expect(validateReportNarrative(facts, narrative).priorities).toHaveLength(
              priorities.length
            );
            const unknown = structuredClone(narrative);
            unknown.overview.evidence_refs = ["foreign_reference"];
            expect(() => validateReportNarrative(facts, unknown)).toThrow(
              "report_unknown_reference"
            );
            if (priorities.length)
              expect(() =>
                validateReportNarrative(facts, { ...narrative, priorities: [] })
              ).toThrow("report_priority_missing");
            checked++;
          }
    expect(checked).toBe(360);
  },
  60000
);
