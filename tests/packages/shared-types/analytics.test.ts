import { describe, expect, it } from "vitest";

import {
  ANALYTICS_BUNDLE_SCHEMA_VERSION,
  ANALYTICS_EVENT_SCHEMA_VERSION,
  AnalyticsBundleV1Schema,
  AnalyticsEventEnvelopeSchema,
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
