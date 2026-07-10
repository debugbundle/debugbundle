import { describe, expect, it } from "vitest";

import {
  buildAnalyticsBundle,
  stableSerializeAnalyticsBundle,
  type AnalyticsBundleBuildInput
} from "../../../packages/analytics-bundle-engine/src/index.js";
import {
  ANALYTICS_BUNDLE_SCHEMA_VERSION,
  AnalyticsBundleV1Schema
} from "../../../packages/shared-types/src/index.js";

const INPUT_FINGERPRINT = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("analytics-bundle-engine", () => {
  it("builds a schema-valid AnalyticsBundleV1 artifact", (): void => {
    const bundle = buildAnalyticsBundle(createBuildInput());

    expect(bundle.schema_version).toBe(ANALYTICS_BUNDLE_SCHEMA_VERSION);
    expect(bundle.bundle_type).toBe("analytics");
    expect(bundle.metadata).toEqual({ input_fingerprint: INPUT_FINGERPRINT });
    expect(AnalyticsBundleV1Schema.parse(bundle)).toEqual(bundle);
  });

  it("produces byte-identical evidence for equivalent unordered inputs", (): void => {
    const left = buildAnalyticsBundle(createBuildInput({
      metrics: {
        sessions_analyzed: 1200,
        affected_sessions: 180,
        baseline: { conversion_rate: 0.42, sessions: 1180 },
        current: { sessions: 1200, conversion_rate: 0.31 }
      },
      segments: [
        { device_type: "mobile", affected_sessions: 140, nested: { b: 2, a: 1 } },
        { device_type: "desktop", affected_sessions: 40 }
      ],
      journey_patterns: [
        { to_route_key: "/checkout/payment", from_route_key: "/checkout", transition_count: 90 },
        { from_route_key: "/pricing", to_route_key: "/checkout", transition_count: 160 }
      ]
    }));
    const right = buildAnalyticsBundle(createBuildInput({
      metrics: {
        sessions_analyzed: 1200,
        affected_sessions: 180,
        baseline: { sessions: 1180, conversion_rate: 0.42 },
        current: { conversion_rate: 0.31, sessions: 1200 }
      },
      segments: [
        { affected_sessions: 40, device_type: "desktop" },
        { nested: { a: 1, b: 2 }, affected_sessions: 140, device_type: "mobile" }
      ],
      journey_patterns: [
        { transition_count: 160, to_route_key: "/checkout", from_route_key: "/pricing" },
        { transition_count: 90, from_route_key: "/checkout", to_route_key: "/checkout/payment" }
      ]
    }));

    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
    expect(stableSerializeAnalyticsBundle(left)).toBe(stableSerializeAnalyticsBundle(right));
  });

  it("caps and sorts repeated evidence arrays deterministically", (): void => {
    const bundle = buildAnalyticsBundle(createBuildInput({
      recommendations: Array.from({ length: 60 }, (_value, index) => ({
        priority: 60 - index,
        action: `action_${String(60 - index).padStart(2, "0")}`
      }))
    }));

    expect(bundle.recommendations).toHaveLength(50);
    expect(bundle.recommendations[0]).toEqual({ action: "action_01", priority: 1 });
    expect(bundle.recommendations.at(-1)).toEqual({ action: "action_50", priority: 50 });
  });

  it("preserves explicit deterministic representative-journey ranking", (): void => {
    const bundle = buildAnalyticsBundle(createBuildInput({
      representative_journeys: [
        { sample_id: "sample-low", selection_rank: 2 },
        { sample_id: "sample-high", selection_rank: 1 },
        { sample_id: "sample-unranked" }
      ]
    }));

    expect(bundle.representative_journeys).toEqual([
      { sample_id: "sample-high", selection_rank: 1 },
      { sample_id: "sample-low", selection_rank: 2 },
      { sample_id: "sample-unranked" }
    ]);
  });

  it("keeps wall-clock generation timestamps out of metadata", (): void => {
    const bundle = buildAnalyticsBundle(createBuildInput());

    expect(Object.keys(bundle.metadata)).toEqual(["input_fingerprint"]);
    expect(stableSerializeAnalyticsBundle(bundle)).not.toContain("created_at");
    expect(stableSerializeAnalyticsBundle(bundle)).not.toContain("generated_at");
  });

  it("adds privacy redaction defaults when callers do not provide them", (): void => {
    const bundle = buildAnalyticsBundle(createBuildInput({ redaction: undefined }));

    expect(bundle.redaction.rules_applied).toEqual(["analytics-bundle-default-redaction"]);
    expect(bundle.redaction.omitted_fields).toContain("raw_click_text");
    expect(bundle.redaction.omitted_fields).toContain("raw_ip_address");
  });

  it.each([
    ["funnel_dropoff", "inspect_highest_dropoff_step"],
    ["journey_friction", "inspect_repeated_route_loops"],
    ["incident_impact", "prioritize_incidents_by_affected_sessions"],
    ["usage_summary", "review_analytics_evidence"]
  ] as const)("adds a deterministic default recommendation for %s", (analysisKind, expectedAction): void => {
    const bundle = buildAnalyticsBundle(createBuildInput({
      analysis_kind: analysisKind,
      recommendations: undefined
    }));

    expect(bundle.recommendations).toHaveLength(1);
    expect(bundle.recommendations[0]?.["action"]).toBe(expectedAction);
  });
});

function createBuildInput(overrides: Partial<AnalyticsBundleBuildInput> = {}): AnalyticsBundleBuildInput {
  return {
    analysis_kind: "funnel_dropoff",
    input_fingerprint: INPUT_FINGERPRINT,
    project: {
      project_id: "00000000-0000-4000-8000-000000000401",
      service: "marketing-site",
      environment: "production"
    },
    analysis_window: {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-07T00:00:00.000Z",
      granularity: "day"
    },
    summary: {
      title: "Checkout dropoff increased on mobile",
      description: "The checkout funnel lost more sessions at payment on mobile devices.",
      confidence: "high",
      severity: "medium"
    },
    metrics: {
      sessions_analyzed: 1200,
      affected_sessions: 180,
      baseline: {
        conversion_rate: 0.42
      },
      current: {
        conversion_rate: 0.31
      }
    },
    segments: [
      {
        device_type: "mobile",
        affected_sessions: 120
      }
    ],
    journey_patterns: [
      {
        from_route_key: "/checkout",
        to_route_key: "/checkout/payment",
        transition_count: 90
      }
    ],
    representative_journeys: [
      {
        sample_id: "sample-1",
        steps: [
          { type: "route", route_key: "/checkout" },
          { type: "route", route_key: "/checkout/payment" }
        ]
      }
    ],
    linked_incidents: [
      {
        incident_id: "00000000-0000-4000-8000-000000000777",
        title: "Payment API failed"
      }
    ],
    linked_deploys: [
      {
        deployment_id: "deploy-123",
        deployed_at: "2026-07-03T00:00:00.000Z"
      }
    ],
    recommendations: [
      {
        priority: 1,
        action: "inspect_mobile_payment_step"
      }
    ],
    redaction: {
      rules_applied: ["analytics-aggregate-only"],
      omitted_fields: ["form_values", "raw_click_text"]
    },
    ...overrides
  };
}
