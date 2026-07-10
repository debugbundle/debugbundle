import { describe, expect, it } from "vitest";

import {
  ANALYTICS_BUNDLE_SCHEMA_VERSION,
  ANALYTICS_EVENT_SCHEMA_VERSION,
  AnalyticsBundleV1Schema,
  AnalyticsEventEnvelopeSchema,
  AnalyticsIncidentImpactResponseSchema,
  AnalyticsJourneyPatternsResponseSchema,
  AnalyticsOpportunitiesListResponseSchema,
  AnalyticsOpportunityResponseSchema,
  EventEnvelopeSchema,
  EventTypeValues,
  MAX_ANALYTICS_CUSTOM_DIMENSIONS_PER_EVENT,
} from "../../../packages/shared-types/src/index.js";

const safeHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function createAnalyticsEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: ANALYTICS_EVENT_SCHEMA_VERSION,
    event_id: "00000000-0000-4000-8000-000000000301",
    event_type: "analytics_event",
    occurred_at: "2026-07-07T10:00:00.000Z",
    sdk_name: "@debugbundle/sdk-browser",
    sdk_version: "1.6.2",
    service: {
      name: "marketing-site",
      runtime: "browser",
      framework: "next",
      environment: "production",
    },
    correlation: {
      session_id: "session-123",
      visitor_id_hash: safeHash,
      user_id_hash: null,
      trace_id: null,
      deploy_id: "deploy-123",
    },
    payload: {
      kind: "page_view",
      route: {
        path: "/pricing",
        normalized_path: "/pricing",
        title: "Pricing",
      },
      dimensions: createDimensions(),
      custom_dimensions: {
        account_tier: "team",
        workspace_size: "50-250",
        onboarding_state: "invited",
      },
    },
    ...overrides,
  };
}

function createDimensions(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    auth_state: "authenticated",
    device_type: "desktop",
    browser_family: "Chrome",
    browser_major: 138,
    os_family: "macOS",
    os_major: 15,
    language: "en",
    locale: "en-US",
    viewport_bucket: "large",
    referrer_domain: "google.com",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "summer",
    country_code: "US",
    region_code: "CA",
    ...overrides,
  };
}

function createAnalyticsBundle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: ANALYTICS_BUNDLE_SCHEMA_VERSION,
    bundle_type: "analytics",
    analysis_kind: "funnel_dropoff",
    project: {
      project_id: "00000000-0000-4000-8000-000000000401",
      service: "marketing-site",
      environment: "production",
    },
    analysis_window: {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-07T00:00:00.000Z",
      granularity: "day",
    },
    summary: {
      title: "Checkout dropoff increased on mobile",
      description: "The checkout funnel lost more sessions at payment on mobile devices.",
      confidence: "high",
      severity: "medium",
    },
    metrics: {
      sessions_analyzed: 1200,
      affected_sessions: 180,
      baseline: {
        conversion_rate: 0.42,
      },
      current: {
        conversion_rate: 0.31,
      },
    },
    segments: [
      {
        device_type: "mobile",
        affected_sessions: 120,
      },
    ],
    journey_patterns: [
      {
        pattern: "pricing -> signup -> checkout_exit",
      },
    ],
    representative_journeys: [
      {
        sample_id: "journey-001",
      },
    ],
    linked_incidents: [
      {
        incident_id: "incident-001",
      },
    ],
    linked_deploys: [
      {
        deploy_id: "deploy-123",
      },
    ],
    recommendations: [
      {
        title: "Review payment form validation",
      },
    ],
    redaction: {
      rules_applied: ["analytics-default"],
      omitted_fields: ["form_values"],
    },
    metadata: {
      input_fingerprint: safeHash,
    },
    ...overrides,
  };
}

describe("analytics event envelope schema", () => {
  it("parses a valid opt-in analytics event without joining debug event types", () => {
    const parsed = AnalyticsEventEnvelopeSchema.parse(createAnalyticsEvent());

    expect(parsed.event_type).toBe("analytics_event");
    expect(parsed.payload.custom_dimensions).toEqual({
      account_tier: "team",
      workspace_size: "50-250",
      onboarding_state: "invited",
    });
    expect(EventTypeValues).not.toContain("analytics_event");
    expect(EventEnvelopeSchema.safeParse(createAnalyticsEvent()).success).toBe(false);
  });

  it("rejects event_class and other ad-hoc root fields", () => {
    const result = AnalyticsEventEnvelopeSchema.safeParse(createAnalyticsEvent({
      event_class: "incident_signal",
    }));

    expect(result.success).toBe(false);
  });

  it("requires session correlation for analytics events", () => {
    const event = createAnalyticsEvent({
      correlation: {
        visitor_id_hash: safeHash,
        user_id_hash: null,
        trace_id: null,
        deploy_id: null,
      },
    });

    expect(AnalyticsEventEnvelopeSchema.safeParse(event).success).toBe(false);
  });

  it("rejects route paths with query strings or fragments", () => {
    const event = createAnalyticsEvent({
      payload: {
        kind: "page_view",
        route: {
          path: "/pricing?token=secret",
          normalized_path: "/pricing#plans",
          title: "Pricing",
        },
        dimensions: createDimensions(),
        custom_dimensions: {},
      },
    });

    expect(AnalyticsEventEnvelopeSchema.safeParse(event).success).toBe(false);
  });

  it("accepts bounded previous route context for route-change analytics", () => {
    const validRouteChange = createAnalyticsEvent({
      payload: {
        kind: "route_change",
        route: {
          path: "/checkout",
          normalized_path: "/checkout",
          title: "Checkout",
        },
        previous_route: {
          path: "/pricing",
          normalized_path: "/pricing",
          title: "Pricing",
        },
        dimensions: createDimensions(),
        custom_dimensions: {},
      },
    });
    const invalidPreviousRoute = createAnalyticsEvent({
      payload: {
        kind: "route_change",
        route: {
          path: "/checkout",
          normalized_path: "/checkout",
          title: "Checkout",
        },
        previous_route: {
          path: "/pricing?token=secret",
          normalized_path: "/pricing",
          title: "Pricing",
        },
        dimensions: createDimensions(),
        custom_dimensions: {},
      },
    });

    expect(AnalyticsEventEnvelopeSchema.safeParse(validRouteChange).success).toBe(true);
    expect(AnalyticsEventEnvelopeSchema.safeParse(invalidPreviousRoute).success).toBe(false);
  });

  it("requires bounded signal keys for action, funnel, conversion, and marker events", () => {
    const actionWithoutKey = createAnalyticsEvent({
      payload: {
        kind: "action",
        dimensions: createDimensions(),
        custom_dimensions: {},
      },
    });
    const validFunnelStep = createAnalyticsEvent({
      payload: {
        kind: "funnel_step",
        signal: {
          funnel_key: "checkout",
          step_key: "payment_submitted",
        },
        dimensions: createDimensions(),
        custom_dimensions: {},
      },
    });

    expect(AnalyticsEventEnvelopeSchema.safeParse(actionWithoutKey).success).toBe(false);
    expect(AnalyticsEventEnvelopeSchema.safeParse(validFunnelStep).success).toBe(true);
  });

  it("rejects sensitive, overlong, or excessive custom dimensions", () => {
    const excessiveCustomDimensions = Object.fromEntries(
      Array.from({ length: MAX_ANALYTICS_CUSTOM_DIMENSIONS_PER_EVENT + 1 }, (_, index) => [
        `dimension_${index}`,
        "allowed",
      ]),
    );
    const excessive = createAnalyticsEvent({
      payload: {
        kind: "page_view",
        route: {
          path: "/pricing",
          normalized_path: "/pricing",
          title: null,
        },
        dimensions: createDimensions(),
        custom_dimensions: excessiveCustomDimensions,
      },
    });
    const sensitive = createAnalyticsEvent({
      payload: {
        kind: "page_view",
        route: {
          path: "/pricing",
          normalized_path: "/pricing",
          title: null,
        },
        dimensions: createDimensions(),
        custom_dimensions: {
          user_id: "123",
        },
      },
    });

    expect(AnalyticsEventEnvelopeSchema.safeParse(excessive).success).toBe(false);
    expect(AnalyticsEventEnvelopeSchema.safeParse(sensitive).success).toBe(false);
  });
});

describe("AnalyticsBundleV1 schema", () => {
  it("parses a deterministic analytics artifact shape", () => {
    const parsed = AnalyticsBundleV1Schema.parse(createAnalyticsBundle());

    expect(parsed.schema_version).toBe(ANALYTICS_BUNDLE_SCHEMA_VERSION);
    expect(parsed.bundle_type).toBe("analytics");
    expect(parsed.metadata.input_fingerprint).toBe(safeHash);
  });

  it("keeps analytics bundles separate from failure and improvement bundles", () => {
    expect(AnalyticsBundleV1Schema.safeParse(createAnalyticsBundle({
      bundle_type: "failure",
    })).success).toBe(false);
  });

  it("keeps wall-clock generation metadata out of deterministic bundle evidence", () => {
    expect(AnalyticsBundleV1Schema.safeParse(createAnalyticsBundle({
      metadata: {
        input_fingerprint: safeHash,
        created_at: "2026-07-07T10:00:00.000Z",
      },
    })).success).toBe(false);
  });
});

describe("analytics journey pattern metrics schema", () => {
  it("parses bounded aggregate journey transition patterns", () => {
    const parsed = AnalyticsJourneyPatternsResponseSchema.parse({
      window: {
        project_id: "00000000-0000-4000-8000-000000000501",
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-07T00:00:00.000Z",
        granularity: "day",
        service: null,
        environment: "production",
      },
      patterns: [
        {
          from_route_key: "/pricing",
          to_route_key: "/checkout",
          transition_count: 30,
          unique_sessions: 18,
          transition_share: 0.6,
          sample_ids: ["00000000-0000-4000-8000-000000000701"],
        },
      ],
    });

    expect(parsed.patterns[0]?.from_route_key).toBe("/pricing");
    expect(parsed.patterns[0]?.sample_ids).toEqual(["00000000-0000-4000-8000-000000000701"]);
  });
});

describe("analytics incident impact metrics schema", () => {
  it("parses bounded aggregate incident impact without claiming an unavailable conversion delta", () => {
    expect(AnalyticsIncidentImpactResponseSchema.parse({
      incident_id: "00000000-0000-4000-8000-000000000701",
      window: {
        project_id: "00000000-0000-4000-8000-000000000501",
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-02T00:00:00.000Z",
        granularity: "day",
        service: "web",
        environment: "production"
      },
      affected_sessions: 4,
      affected_routes: [{ route_key: "/checkout", affected_sessions: 4 }],
      affected_funnels: [{ funnel_key: "checkout", affected_sessions: 3 }],
      top_device_types: [{ value: "mobile", affected_sessions: 3 }],
      top_browsers: [{ value: "Chrome", affected_sessions: 2 }],
      journey_patterns: [{
        from_route_key: "/pricing",
        to_route_key: "/checkout",
        affected_sessions: 2,
        sample_ids: ["00000000-0000-4000-8000-000000000703"]
      }],
      conversion_delta: {
        availability: "unavailable",
        value: null,
        unit: "percentage_points"
      },
      analytics_bundle: {
        status: "pending",
        generation_id: "00000000-0000-4000-8000-000000000702",
        failure_reason: null
      }
    })).toMatchObject({ affected_sessions: 4 });
  });
});

describe("analytics opportunity response schemas", () => {
  const opportunity = {
    opportunity_id: "00000000-0000-4000-8000-000000000601",
    project_id: "00000000-0000-4000-8000-000000000602",
    project_name: "Marketing site",
    project_color_tag: "blue",
    service: "web",
    environment: "production",
    kind: "funnel_dropoff",
    status: "open",
    severity: "medium",
    confidence: 0.82,
    title: "Checkout dropoff increased",
    summary: "Payment-step exits increased for mobile sessions.",
    evidence: {
      sessions: 120,
    },
    related_incident_ids: ["00000000-0000-4000-8000-000000000603"],
    related_deploy_ids: ["deploy-123"],
    first_detected_at: "2026-07-01T00:00:00.000Z",
    last_detected_at: "2026-07-07T00:00:00.000Z",
    resolved_at: null,
    snoozed_until: null,
    bundle_generation_id: null,
    bundle_status: "not_requested",
    bundle_created_at: null,
    bundle_updated_at: null,
    bundle_failure_reason: null,
  };

  it("parses opportunity list and detail responses", () => {
    expect(AnalyticsOpportunitiesListResponseSchema.parse({
      opportunities: [opportunity],
      next_cursor: "2026-07-07T00:00:00.000Z|00000000-0000-4000-8000-000000000601",
    }).opportunities[0]?.kind).toBe("funnel_dropoff");

    expect(AnalyticsOpportunityResponseSchema.parse({ opportunity }).opportunity.bundle_status).toBe("not_requested");
  });
});
