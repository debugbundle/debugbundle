import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BundleV1Schema,
  EventEnvelopeSchema,
  EventTypeValues,
  createEventEnvelope,
  type EventEnvelope
} from "../../../packages/shared-types/src/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Minimal valid bundle fixture
// ---------------------------------------------------------------------------

function createMinimalBundle(): Record<string, unknown> {
  return {
    bundle_version: 1,
    bundle_id: "bundle-001",
    bundle_type: "failure",
    captured_at: "2026-03-10T12:00:00.000Z",
    sdk: { name: "debugbundle-node", version: "0.1.0" },
    project: { id: "proj-1", slug: "my-project", environment: "production" },
    service: {
      id: "svc-1",
      name: "checkout-api",
      runtime: "node",
      framework: "fastify",
      version: "1.2.0",
      region: "us-east-1"
    },
    signal: {
      signal_id: "sig-1",
      signal_type: "exception",
      severity: "high",
      fingerprint: "abc123def456",
      first_seen_at: "2026-03-10T12:00:00.000Z",
      last_seen_at: "2026-03-10T12:00:00.000Z",
      occurrence_count: 1,
      source_event_types: ["backend_exception"]
    },
    summary: {
      title: "TypeError in checkout",
      description: "Cannot read property 'id' of undefined",
      likely_cause: null,
      confidence: 0.8,
      recommended_action: null,
      severity: "high",
      error_type: "TypeError",
      error_message: "Cannot read property 'id' of undefined",
      first_application_frame: { file: "src/checkout.ts", line: 10, function: "processOrder" },
      primary_signal: "backend_exception",
      signals: {
        new_deploy: false,
        regression_suspected: false,
        customer_visible: true
      }
    },
    impact: {
      affected_users_estimate: 50,
      affected_requests_estimate: 200,
      business_criticality: "high",
      customer_visible: true,
      regression_suspected: false
    },
    context: {
      error: {
        version: 1,
        name: "TypeError",
        message: "Cannot read property 'id' of undefined",
        stack: "TypeError: Cannot read...\n at processOrder (src/checkout.ts:10:2)",
        handled: false,
        top_frames: ["at processOrder (src/checkout.ts:10:2)"]
      },
      runtime: {
        version: 1,
        name: "node",
        runtime_version: "22.13.0",
        platform: "linux",
        arch: "x64",
        pid: 12345,
        cwd: "/app",
        uptime_sec: 3600,
        hostname: "checkout-pod-abc",
        thread_id: null,
        framework: "fastify",
        framework_version: "4.28.0",
        memory: {
          rss: 150_000_000,
          heap_total: 100_000_000,
          heap_used: 80_000_000,
          external: 5_000_000,
          peak: 160_000_000
        }
      },
      environment: {
        version: 1,
        os: "linux",
        host: "checkout-pod-abc",
        container_id: "abc123"
      }
    },
    reproduction: {
      possible: true,
      confidence: 0.9,
      reason: "Standard HTTP request failure with full context",
      artifacts: {
        curl: "curl -X GET https://api.example.com/users/123",
        httpie: "http GET https://api.example.com/users/123",
        json_spec: {
          method: "GET",
          url: "https://api.example.com/users/123",
          headers: {},
          body: null
        }
      }
    },
    verification: {
      verification_type: "automated",
      synthetic: false,
      local_verified: false,
      production_verified: false
    },
    links: {
      self: null,
      reproduction: null,
      incident: null,
      project: null,
      docs: null
    },
    redaction: {
      redacted: true,
      fields: ["context.error.stack"],
      notes: null
    },
    metadata: {
      created_at: "2026-03-10T12:01:00.000Z",
      updated_at: "2026-03-10T12:01:00.000Z",
      generator_version: "0.1.0",
      generation_number: 1
    }
  };
}

describe("shared-types event envelope", () => {
  it("should parse a valid backend_exception envelope", (): void => {
    const envelope: EventEnvelope = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "Cannot read property 'id' of undefined",
        stack: "TypeError: ...",
        handled: false,
        request: {
          method: "GET",
          path: "/users/123",
          query: {},
          headers: {
            authorization: "Bearer abc"
          },
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.13.0"
        }
      }
    });

    const parsed = EventEnvelopeSchema.parse(envelope);

    expect(parsed.event_type).toBe("backend_exception");
    expect(EventTypeValues).toContain(parsed.event_type);
  });

  it("should reject missing required fields", (): void => {
    const invalidEnvelope = {
      schema_version: "2026-03-01",
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      event_type: "log_event",
      occurred_at: "2026-03-10T00:00:00.000Z",
      service: {
        name: "api"
      },
      payload: {
        level: "error",
        message: "boom",
        attributes: {}
      }
    };

    const result = EventEnvelopeSchema.safeParse(invalidEnvelope);

    expect(result.success).toBe(false);
  });

  it("should parse a frontend_exception with device context", (): void => {
    const envelope: EventEnvelope = createEventEnvelope({
      event_type: "frontend_exception",
      service: {
        name: "checkout-spa",
        environment: "production",
        runtime: "browser-js",
        framework: "react"
      },
      payload: {
        name: "TypeError",
        message: "Cannot read properties of null",
        stack: "TypeError: Cannot read properties of null\n  at CheckoutPage (src/pages/Checkout.tsx:42)",
        route: "/checkout",
        browser: { name: "Chrome", version: "122.0.6261.94" },
        device: {
          user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          os: { name: "macOS", version: "14.3" },
          device_type: "desktop",
          screen: { width: 2560, height: 1440 },
          viewport: { width: 1280, height: 720 },
          device_pixel_ratio: 2.0,
          touch_capable: false,
          language: "en-US",
          connection_type: "4g",
          color_scheme_preference: "dark"
        },
        dom_context: { mode: "lightweight", html_excerpt: "<button id=\"pay\">Pay Now</button>" }
      }
    });

    const parsed = EventEnvelopeSchema.parse(envelope);

    expect(parsed.event_type).toBe("frontend_exception");
  });

  it("should parse a frontend_exception without device context (backwards compatible)", (): void => {
    const envelope: EventEnvelope = createEventEnvelope({
      event_type: "frontend_exception",
      service: {
        name: "checkout-spa",
        environment: "production",
        runtime: "browser-js",
        framework: "react"
      },
      payload: {
        name: "TypeError",
        message: "Cannot read properties of null",
        stack: "TypeError: Cannot read properties of null\n  at CheckoutPage (src/pages/Checkout.tsx:42)",
        route: "/checkout",
        browser: { name: "Chrome", version: "122.0" },
        dom_context: null
      }
    });

    const parsed = EventEnvelopeSchema.parse(envelope);

    expect(parsed.event_type).toBe("frontend_exception");
  });

  it("should parse a frontend_exception with inline breadcrumbs", (): void => {
    const envelope: EventEnvelope = createEventEnvelope({
      event_type: "frontend_exception",
      service: {
        name: "checkout-spa",
        environment: "production",
        runtime: "browser-js",
        framework: "react"
      },
      payload: {
        name: "TypeError",
        message: "Cannot read properties of null",
        stack: "TypeError: Cannot read properties of null\n  at CheckoutPage (src/pages/Checkout.tsx:42)",
        route: "/checkout",
        browser: { name: "Chrome", version: "122.0" },
        dom_context: { mode: "lightweight", html_excerpt: "<button id=\"pay\">Pay</button>" },
        breadcrumbs: [
          {
            breadcrumb_type: "route_change",
            route: "/checkout",
            ts: "2026-03-14T00:00:00.000Z",
            data: {
              from: "/cart",
              to: "/checkout"
            }
          }
        ]
      }
    });

    const parsed = EventEnvelopeSchema.parse(envelope);

    expect(parsed.event_type).toBe("frontend_exception");
    if (parsed.event_type === "frontend_exception") {
      expect(parsed.payload.breadcrumbs).toHaveLength(1);
    }
  });

  it("should parse enriched browser-native exception metadata", (): void => {
    const envelope: EventEnvelope = createEventEnvelope({
      event_type: "frontend_exception",
      service: {
        name: "checkout-spa",
        environment: "production",
        runtime: "browser-js",
        framework: "react"
      },
      payload: {
        name: "Error",
        message: "Browser resource load error",
        stack: "Error: Browser resource load error",
        route: "/checkout",
        browser: { name: "Chrome", version: "122.0" },
        browser_event: {
          kind: "resource_error",
          message: null,
          file_name: null,
          line_number: null,
          column_number: null,
          target: {
            tag_name: "script",
            source_url: "https://cdn.example/app.js",
            attributes: {
              cross_origin: "anonymous",
              async: true,
              integrity_present: true
            }
          },
          page: {
            url: "https://example.com/checkout",
            referrer: "https://example.com/cart",
            ready_state: "interactive",
            visibility_state: "visible"
          },
          opaque: true
        }
      }
    });

    const parsed = EventEnvelopeSchema.parse(envelope);

    expect(parsed.event_type).toBe("frontend_exception");
    if (parsed.event_type === "frontend_exception") {
      expect(parsed.payload.browser_event?.target?.attributes?.integrity_present).toBe(true);
      expect(parsed.payload.browser_event?.page?.ready_state).toBe("interactive");
    }
  });

  it("should use crypto.randomUUID when createEventEnvelope generates an event id", (): void => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-2222-4333-8444-555555555555"
    });

    const envelope = createEventEnvelope({
      event_type: "log_event",
      service: {
        name: "checkout-api",
        environment: "production"
      },
      payload: {
        level: "error",
        message: "boom",
        attributes: {}
      }
    });

    expect(envelope.event_id).toBe("11111111-2222-4333-8444-555555555555");
    expect(envelope.correlation).toEqual({
      request_id: null,
      trace_id: null,
      session_id: null,
      user_id_hash: null
    });
  });

  it("should fall back to crypto.getRandomValues when randomUUID is unavailable", (): void => {
    vi.stubGlobal("crypto", {
      getRandomValues: (array: Uint8Array) => {
        array.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
        return array;
      }
    });

    const envelope = createEventEnvelope({
      event_type: "log_event",
      service: {
        name: "checkout-api",
        environment: "production"
      },
      payload: {
        level: "warning",
        message: "fallback",
        attributes: {}
      }
    });

    expect(envelope.event_id).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });
});

describe("shared-types BundleV1Schema", () => {
  it("should parse a valid minimal bundle", (): void => {
    const bundle = createMinimalBundle();
    const result = BundleV1Schema.safeParse(bundle);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bundle_version).toBe(1);
      expect(result.data.bundle_type).toBe("failure");
      expect(result.data.sdk.name).toBe("debugbundle-node");
    }
  });

  it("should enforce bundle_version as literal 1", (): void => {
    const bundle = createMinimalBundle();
    bundle["bundle_version"] = 2;

    expect(BundleV1Schema.safeParse(bundle).success).toBe(false);
  });

  it("should reject string bundle_version", (): void => {
    const bundle = createMinimalBundle();
    bundle["bundle_version"] = "v1";

    expect(BundleV1Schema.safeParse(bundle).success).toBe(false);
  });

  it("should enforce valid bundle_type enum", (): void => {
    const bundle = createMinimalBundle();
    bundle["bundle_type"] = "unknown";

    expect(BundleV1Schema.safeParse(bundle).success).toBe(false);
  });

  it("should accept improvement bundle type", (): void => {
    const bundle = createMinimalBundle();
    bundle["bundle_type"] = "improvement";

    expect(BundleV1Schema.safeParse(bundle).success).toBe(true);
  });

  it("should enforce captured_at as ISO datetime", (): void => {
    const bundle = createMinimalBundle();
    bundle["captured_at"] = "not-a-date";

    expect(BundleV1Schema.safeParse(bundle).success).toBe(false);
  });

  it("should enforce signal_type enum", (): void => {
    const bundle = createMinimalBundle();
    (bundle["signal"] as Record<string, unknown>)["signal_type"] = "not_valid";

    expect(BundleV1Schema.safeParse(bundle).success).toBe(false);
  });

  it("should accept all valid signal_type values", (): void => {
    const signalTypes = [
      "exception",
      "fatal_error",
      "request_failure",
      "frontend_exception",
      "warning",
      "deprecation",
      "performance_issue",
      "retry_loop",
      "slow_query"
    ];

    for (const signalType of signalTypes) {
      const bundle = createMinimalBundle();
      (bundle["signal"] as Record<string, unknown>)["signal_type"] = signalType;

      expect(BundleV1Schema.safeParse(bundle).success).toBe(true);
    }
  });

  it("should enforce severity enum in summary", (): void => {
    const bundle = createMinimalBundle();
    (bundle["summary"] as Record<string, unknown>)["severity"] = "extreme";

    expect(BundleV1Schema.safeParse(bundle).success).toBe(false);
  });

  it("should enforce version: 1 on context blocks", (): void => {
    const bundle = createMinimalBundle();
    const ctx = bundle["context"] as Record<string, Record<string, unknown>>;
    ctx["error"] = { ...ctx["error"], version: 2 };

    expect(BundleV1Schema.safeParse(bundle).success).toBe(false);
  });

  it("should allow null context error", (): void => {
    const bundle = createMinimalBundle();
    (bundle["context"] as Record<string, unknown>)["error"] = null;

    expect(BundleV1Schema.safeParse(bundle).success).toBe(true);
  });

  it("should allow optional context blocks to be omitted", (): void => {
    const bundle = createMinimalBundle();
    const ctx = bundle["context"] as Record<string, unknown>;
    delete ctx["error"];
    delete ctx["runtime"];
    delete ctx["environment"];

    expect(BundleV1Schema.safeParse(bundle).success).toBe(true);
  });

  it("should validate wrapped array blocks (logs)", (): void => {
    const bundle = createMinimalBundle();
    (bundle["context"] as Record<string, unknown>)["logs"] = {
      version: 1,
      items: [
        {
          level: "error",
          message: "Something went wrong",
          timestamp: "2026-03-10T12:00:00.000Z",
          attributes: { trace_id: "abc" }
        }
      ]
    };

    expect(BundleV1Schema.safeParse(bundle).success).toBe(true);
  });

  it("should reject logs without version field", (): void => {
    const bundle = createMinimalBundle();
    (bundle["context"] as Record<string, unknown>)["logs"] = {
      items: [
        {
          level: "error",
          message: "oops",
          timestamp: "2026-03-10T12:00:00.000Z",
          attributes: {}
        }
      ]
    };

    expect(BundleV1Schema.safeParse(bundle).success).toBe(false);
  });

  it("should validate dependencies wrapped array block", (): void => {
    const bundle = createMinimalBundle();
    (bundle["context"] as Record<string, unknown>)["dependencies"] = {
      version: 1,
      items: [
        { name: "postgres", status: "ok", notes: null },
        { name: "redis", status: "degraded", notes: "high latency" }
      ]
    };

    expect(BundleV1Schema.safeParse(bundle).success).toBe(true);
  });

  it("should validate probe_data wrapped array block", (): void => {
    const bundle = createMinimalBundle();
    (bundle["context"] as Record<string, unknown>)["probe_data"] = {
      version: 1,
      items: [
        {
          label: "user-state",
          data: { cart_items: 3 },
          timestamp: "2026-03-10T12:00:00.000Z",
          activation_id: null
        }
      ]
    };

    expect(BundleV1Schema.safeParse(bundle).success).toBe(true);
  });

  it("should validate git context block", (): void => {
    const bundle = createMinimalBundle();
    (bundle["context"] as Record<string, unknown>)["git"] = {
      version: 1,
      commit: "abc123def456",
      commit_short: "abc123d",
      branch: "main",
      repo: "org/repo",
      dirty: false,
      source: "env"
    };

    expect(BundleV1Schema.safeParse(bundle).success).toBe(true);
  });

  it("should enforce git source enum", (): void => {
    const bundle = createMinimalBundle();
    (bundle["context"] as Record<string, unknown>)["git"] = {
      version: 1,
      commit: null,
      commit_short: null,
      branch: null,
      repo: null,
      dirty: false,
      source: "magic"
    };

    expect(BundleV1Schema.safeParse(bundle).success).toBe(false);
  });

  it("should enforce generation_number as positive integer", (): void => {
    const bundle = createMinimalBundle();
    (bundle["metadata"] as Record<string, unknown>)["generation_number"] = 0;

    expect(BundleV1Schema.safeParse(bundle).success).toBe(false);
  });

  it("should enforce confidence range 0-1", (): void => {
    const bundle = createMinimalBundle();
    (bundle["summary"] as Record<string, unknown>)["confidence"] = 1.5;

    expect(BundleV1Schema.safeParse(bundle).success).toBe(false);
  });

  it("should reject missing required top-level fields", (): void => {
    const bundle = createMinimalBundle();
    delete bundle["sdk"];

    expect(BundleV1Schema.safeParse(bundle).success).toBe(false);
  });

  it("should validate frontend context block", (): void => {
    const bundle = createMinimalBundle();
    (bundle["context"] as Record<string, unknown>)["frontend"] = {
      version: 1,
      route_changes: [{ from: "/home", to: "/checkout", ts: "2026-03-10T12:00:00.000Z" }],
      clicks: [{ selector: "#buy-btn", label: "Buy Now", ts: "2026-03-10T12:00:00.000Z" }],
      form_submissions: [],
      console_logs: [],
      network_requests: [{ method: "POST", url: "/api/order", status: 500, ts: "2026-03-10T12:00:00.000Z" }],
      exceptions: [],
      dom_context: { mode: "lightweight", html_excerpt: "<div>...</div>" }
    };

    expect(BundleV1Schema.safeParse(bundle).success).toBe(true);
  });

  it("should validate request context block", (): void => {
    const bundle = createMinimalBundle();
    (bundle["context"] as Record<string, unknown>)["request"] = {
      version: 1,
      method: "POST",
      path: "/api/checkout",
      route_template: "/api/checkout",
      query: { page: "1" },
      headers: { "content-type": "application/json" },
      body: { items: [1, 2, 3] },
      request_id: "req-abc"
    };

    expect(BundleV1Schema.safeParse(bundle).success).toBe(true);
  });

  it("should validate response context block", (): void => {
    const bundle = createMinimalBundle();
    (bundle["context"] as Record<string, unknown>)["response"] = {
      version: 1,
      status_code: 500,
      duration_ms: 120.5
    };

    expect(BundleV1Schema.safeParse(bundle).success).toBe(true);
  });

  it("should validate deploy context block", (): void => {
    const bundle = createMinimalBundle();
    (bundle["context"] as Record<string, unknown>)["deploy"] = {
      version: 1,
      commit_sha: "abc123",
      deploy_version: "v1.2.3",
      branch: "main",
      deployed_at: "2026-03-10T11:00:00.000Z",
      regression_window: true
    };

    expect(BundleV1Schema.safeParse(bundle).success).toBe(true);
  });

  it("should allow runtime memory and framework_extras to be null", (): void => {
    const bundle = createMinimalBundle();
    (bundle["context"] as Record<string, unknown>)["runtime"] = {
      version: 1,
      name: "node",
      runtime_version: null,
      platform: null,
      arch: null,
      pid: null,
      cwd: null,
      uptime_sec: null,
      hostname: null,
      thread_id: null,
      framework: null,
      framework_version: null,
      memory: null,
      framework_extras: null
    };

    expect(BundleV1Schema.safeParse(bundle).success).toBe(true);
  });

  it("should validate device context block", (): void => {
    const bundle = createMinimalBundle();
    (bundle["context"] as Record<string, unknown>)["device"] = {
      version: 1,
      user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      browser: { name: "Chrome", version: "122.0.6261.94" },
      os: { name: "macOS", version: "14.3" },
      device_type: "desktop",
      screen: { width: 2560, height: 1440 },
      viewport: { width: 1280, height: 720 },
      device_pixel_ratio: 2.0,
      touch_capable: false,
      language: "en-US",
      connection_type: "4g",
      color_scheme_preference: "dark"
    };

    expect(BundleV1Schema.safeParse(bundle).success).toBe(true);
  });

  it("should validate device context with nullable fields", (): void => {
    const bundle = createMinimalBundle();
    (bundle["context"] as Record<string, unknown>)["device"] = {
      version: 1,
      user_agent: null,
      browser: { name: null, version: null },
      os: { name: null, version: null },
      device_type: "unknown",
      screen: { width: 0, height: 0 },
      viewport: { width: 0, height: 0 },
      device_pixel_ratio: null,
      touch_capable: null,
      language: null,
      connection_type: null,
      color_scheme_preference: null
    };

    expect(BundleV1Schema.safeParse(bundle).success).toBe(true);
  });

  it("should enforce device_type enum", (): void => {
    const bundle = createMinimalBundle();
    (bundle["context"] as Record<string, unknown>)["device"] = {
      version: 1,
      user_agent: null,
      browser: { name: null, version: null },
      os: { name: null, version: null },
      device_type: "smartwatch",
      screen: { width: 0, height: 0 },
      viewport: { width: 0, height: 0 },
      device_pixel_ratio: null,
      touch_capable: null,
      language: null,
      connection_type: null,
      color_scheme_preference: null
    };

    expect(BundleV1Schema.safeParse(bundle).success).toBe(false);
  });

  it("should enforce version: 1 on device context block", (): void => {
    const bundle = createMinimalBundle();
    (bundle["context"] as Record<string, unknown>)["device"] = {
      version: 2,
      user_agent: null,
      browser: { name: null, version: null },
      os: { name: null, version: null },
      device_type: "desktop",
      screen: { width: 0, height: 0 },
      viewport: { width: 0, height: 0 },
      device_pixel_ratio: null,
      touch_capable: null,
      language: null,
      connection_type: null,
      color_scheme_preference: null
    };

    expect(BundleV1Schema.safeParse(bundle).success).toBe(false);
  });

  it("should allow device context to be omitted", (): void => {
    const bundle = createMinimalBundle();
    const ctx = bundle["context"] as Record<string, unknown>;
    expect(ctx["device"]).toBeUndefined();

    expect(BundleV1Schema.safeParse(bundle).success).toBe(true);
  });

  it("should validate mobile device context", (): void => {
    const bundle = createMinimalBundle();
    (bundle["context"] as Record<string, unknown>)["device"] = {
      version: 1,
      user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)",
      browser: { name: "Safari", version: "17.4" },
      os: { name: "iOS", version: "17.4" },
      device_type: "mobile",
      screen: { width: 1170, height: 2532 },
      viewport: { width: 390, height: 844 },
      device_pixel_ratio: 3.0,
      touch_capable: true,
      language: "en-GB",
      connection_type: "4g",
      color_scheme_preference: "light"
    };

    expect(BundleV1Schema.safeParse(bundle).success).toBe(true);
  });
});
