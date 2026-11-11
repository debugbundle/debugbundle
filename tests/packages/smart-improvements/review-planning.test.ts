import { expect, it } from "vitest";
import { reviewFactsFixture } from "../../helpers/improvement-reviews.js";
import { ReviewArtifactSchema } from "../../../packages/smart-improvements/src/review-contract.js";
import {
  ReviewContextSchema,
  ReviewPlanDocumentSchema
} from "../../../packages/smart-improvements/src/review-planning-contract.js";
import {
  planReview,
  planningDigest,
  validatePlannedGuidance
} from "../../../packages/smart-improvements/src/review-planning.js";

function fixture() {
  const facts = reviewFactsFixture();
  const context = ReviewContextSchema.parse({
    version: 1,
    signals: [
      {
        source_ref: "e1",
        detector: "incident",
        first_observed_at: null,
        last_observed_at: facts.cutoff_at,
        confidence: null,
        measurements: [],
        related_refs: []
      }
    ],
    configuration: {
      coverage: "unavailable",
      origins: [],
      rules: [],
      alerts: [],
      active_probes: null,
      sdk_local: "not_observed"
    }
  });
  return { facts, context };
}
it.each([false, true])(
  "rejects repeated investigation checks even when reordered: %s",
  (reverse) => {
    const { facts, context } = fixture();
    facts.sources.push({ ...facts.sources[0]!, ref: "e2" });
    context.signals.push({ ...context.signals[0]!, source_ref: "e2" });
    const checks = [
      "Inspect the retained failure and current recovery evidence.",
      "Compare the failing response with the last successful observation."
    ];
    const repeated = checks.map((c) => `  ${c.toUpperCase()}  `);
    if (reverse) repeated.reverse();
    expect(() =>
      validatePlannedGuidance(facts, context, {
        version: 1,
        investigations: [
          { title: "Inspect the failure", hypothesis: null, checks, evidence_refs: ["e1"] },
          {
            title: "Inspect the other failure",
            hypothesis: null,
            checks: repeated,
            evidence_refs: ["e2"]
          }
        ]
      })
    ).toThrow("review_duplicate_guidance");
  }
);
it("permits distinct checks for independent monitors without merging their references", () => {
  const { facts, context } = fixture();
  facts.sources.push({ ...facts.sources[0]!, ref: "e2" });
  context.signals.push({ ...context.signals[0]!, source_ref: "e2" });
  const investigations = [
    {
      title: "Inspect failure response changes",
      hypothesis: null,
      checks: ["Compare failing responses with the selected monitor's last successful responses."],
      evidence_refs: ["e1"]
    },
    {
      title: "Check independent recovery",
      hypothesis: null,
      checks: [
        "Check whether this monitor remains failing after the other monitored check recovers."
      ],
      evidence_refs: ["e2"]
    }
  ];
  expect(validatePlannedGuidance(facts, context, { version: 1, investigations })).toEqual({
    version: 1,
    investigations
  });
});
it("gives factual monitor plans a comparable recovery and regression check", () => {
  const { facts, context } = fixture();
  facts.sources[0]!.kind = "health";
  facts.sources[0]!.status = "failing";
  const plan = planReview(facts, context)[0]!;
  expect(plan.inspection).toContain("last successful");
  expect(plan.inspection).toContain("observation windows");
  expect(plan.verification).toContain("previously successful checks");
  expect(plan.verification).toContain("quiet period");
});
it("keeps a recurring critical failure above noise and never classifies frequency as harmless", () => {
  const { facts, context } = fixture();
  facts.sources[0]!.count = 999;
  expect(planReview(facts, context)[0]).toMatchObject({
    action: "investigate_failure",
    source_refs: ["e1"]
  });
  expect(planReview(facts, context)[0]!.verification).toContain("regression");
});
it("groups a recorded incident/opportunity pair without inventing links", () => {
  const { facts, context } = fixture();
  facts.sources.push({
    ...facts.sources[0]!,
    ref: "e2",
    kind: "improvement",
    related_refs: ["e1"]
  });
  context.signals.push({
    ...context.signals[0]!,
    source_ref: "e2",
    detector: "recurring_incident",
    related_refs: ["e1"]
  });
  expect(planReview(facts, context)).toHaveLength(1);
  expect(planReview(facts, context)[0]!.source_refs).toEqual(["e1", "e2"]);
  context.signals[1]!.related_refs = [];
  facts.sources[1]!.related_refs = [];
  expect(planReview(facts, context)).toHaveLength(2);
});
it("offers conditional noise review for a warning hotspot and explains demotion separately from volume", () => {
  const { facts, context } = fixture();
  facts.sources[0]!.kind = "improvement";
  facts.sources[0]!.severity = "low";
  context.signals[0]!.detector = "warning_hotspot";
  const plan = planReview(facts, context)[0]!;
  expect(plan.action).toBe("review_noise");
  expect(plan.inspection).toContain("expected");
  expect(plan.controls.find((item) => item.control === "capture_rules")?.check).toContain("demote");
  expect(plan.verification).toContain("genuine failures");
});
it("uses measured flow evidence and asks for evidence when denominators are missing", () => {
  const { facts, context } = fixture();
  facts.sources[0]!.kind = "analytics";
  context.signals[0]!.detector = "funnel_dropoff";
  expect(planReview(facts, context)[0]!.action).toBe("collect_evidence");
  facts.analytics.coverage = "complete";
  context.signals[0]!.window = { starts_at: facts.period.starts_at, ends_at: facts.period.ends_at };
  context.signals[0]!.measurements.push({
    key: "sessions_entered",
    value: 40,
    unit: "count",
    basis: "period"
  });
  expect(planReview(facts, context)[0]!.action).toBe("improve_flow");
});
it("keeps the plan document separate from the unchanged strict bundle export", () => {
  const { facts, context } = fixture();
  const artifact = ReviewPlanDocumentSchema.parse({
    schema_version: "improvement_review.v1",
    facts,
    context,
    plans: planReview(facts, context),
    priorities: [],
    guidance: null,
    analysis: "unavailable"
  });
  const { context: _context, plans: _plans, ...legacy } = artifact;
  void _context;
  void _plans;
  expect(ReviewArtifactSchema.parse(legacy)).toEqual(legacy);
  expect(legacy).not.toHaveProperty("context");
  expect(legacy.guidance).toBeNull();
  expect(() =>
    ReviewPlanDocumentSchema.parse({
      ...artifact,
      context: { ...context, signals: [{ ...context.signals[0], source_ref: "e9" }] }
    })
  ).toThrow();
});
it("ignores equivalent configuration timestamps in unchanged-evidence detection", () => {
  const { facts, context } = fixture();
  context.configuration.origins = [
    {
      origin_project_id: facts.project_id,
      policy_at: facts.cutoff_at,
      preset: "balanced",
      logs: "warning",
      requests: "failures_only",
      breadcrumbs: "local_only",
      diagnostic_capture: false,
      promoted_client_error_rules: 0,
      sensitivity: "balanced"
    }
  ];
  const digest = planningDigest(facts, context);
  facts.cutoff_at = "2026-11-16T09:00:00.000Z";
  context.configuration.origins[0]!.policy_at = facts.cutoff_at;
  expect(planningDigest(facts, context)).toBe(digest);
  context.configuration.active_probes = 1;
  expect(planningDigest(facts, context)).not.toBe(digest);
});
it("keeps deterministic ties and the investigation ceiling independent from evidence iteration order", () => {
  const { facts, context } = fixture();
  const source = facts.sources[0]!,
    signal = context.signals[0]!;
  facts.sources = Array.from({ length: 8 }, (_, i) => ({ ...source, ref: `e${i + 1}` }));
  context.signals = facts.sources.map((s) => ({ ...signal, source_ref: s.ref }));
  const plans = planReview(facts, context);
  expect(plans.map((p) => p.source_refs)).toEqual([["e1"], ["e2"], ["e3"], ["e4"], ["e5"]]);
  facts.sources.reverse();
  context.signals.reverse();
  expect(planReview(facts, context)).toEqual(plans);
});
it("shows a newly expired rule in factual plans without purchasing unchanged evidence again", () => {
  const { facts, context } = fixture();
  facts.sources[0]!.severity = "medium";
  context.configuration.rules.push({
    ref: "r1",
    origin_project_id: facts.project_id,
    action: "demote",
    enabled: true,
    expires_at: "2026-11-10T00:00:00.000Z",
    sample_rate: null,
    lifetime_hits: 0,
    source_refs: ["e1"]
  });
  const digest = planningDigest(facts, context);
  const ruleCheck = () =>
    planReview(facts, context)[0]!.controls.find((c) => c.control === "capture_rules")!.check;
  expect(ruleCheck()).toContain("demote (enabled)");
  facts.cutoff_at = "2026-11-16T09:00:00.000Z";
  expect(planningDigest(facts, context)).toBe(digest);
  expect(ruleCheck()).toContain("demote (expired)");
});
it("selects linked recurrence groups deterministically at the reference ceiling", () => {
  const { facts, context } = fixture();
  const source = facts.sources[0]!,
    signal = context.signals[0]!;
  for (let i = 2; i <= 8; i++) {
    facts.sources.push({ ...source, ref: `e${i}`, kind: "improvement", related_refs: ["e1"] });
    context.signals.push({
      ...signal,
      source_ref: `e${i}`,
      detector: "recurring_incident",
      related_refs: ["e1"]
    });
  }
  const plans = planReview(facts, context);
  expect(plans[0]!.source_refs).toEqual(["e1", "e2", "e3", "e4", "e5"]);
  expect(plans.flatMap((p) => p.source_refs)).toHaveLength(8);
  facts.sources.reverse();
  context.signals.reverse();
  expect(planReview(facts, context)).toEqual(plans);
});
