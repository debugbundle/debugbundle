import {
  ReviewFactsSchema,
  type ReviewFacts
} from "../../packages/smart-improvements/src/review-contract.js";
import {
  ReviewContextSchema,
  ReviewPlanDocumentSchema
} from "../../packages/smart-improvements/src/review-planning-contract.js";
import { planReview } from "../../packages/smart-improvements/src/review-planning.js";
export function reviewFactsFixture(): ReviewFacts {
  return ReviewFactsSchema.parse({
    version: 1,
    project_id: "22222222-2222-4222-8222-222222222222",
    period: {
      kind: "weekly",
      starts_at: "2026-11-02T00:00:00.000Z",
      ends_at: "2026-11-09T00:00:00.000Z",
      duration_days: 7
    },
    cutoff_at: "2026-11-09T09:00:00.000Z",
    privacy_mode: "restricted",
    sources: [
      {
        ref: "e1",
        kind: "incident",
        origin_project_id: "22222222-2222-4222-8222-222222222222",
        source_id: "33333333-3333-4333-8333-333333333333",
        title: "Critical open incident",
        context: null,
        status: "open",
        severity: "critical",
        count: 8,
        observation: "Retained incident is currently open; the count is lifetime occurrences."
      }
    ],
    analytics: { coverage: "unavailable", sessions: null, page_views: null },
    health: {
      coverage: "unavailable",
      total_checks: 0,
      successful_checks: 0,
      estimated_check_downtime_seconds: 0
    },
    limitations: ["Missing observations are unknown; correlation is not causation."]
  });
}

export function reviewPlanningFixture() {
  const facts = reviewFactsFixture();
  const context = ReviewContextSchema.parse({
    version: 1,
    signals: facts.sources.map((s) => ({
      source_ref: s.ref,
      detector: s.kind,
      first_observed_at: null,
      last_observed_at: facts.cutoff_at,
      confidence: null,
      measurements: [],
      related_refs: []
    })),
    configuration: {
      coverage: "unavailable",
      origins: [],
      rules: [],
      alerts: [],
      active_probes: null,
      sdk_local: "not_observed"
    }
  });
  const document = ReviewPlanDocumentSchema.parse({
    schema_version: "improvement_review.v1",
    facts,
    context,
    plans: planReview(facts, context),
    priorities: [],
    guidance: null,
    analysis: "unavailable"
  });
  return { ...document, context };
}
