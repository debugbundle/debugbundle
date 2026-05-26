import { describe, expect, it } from "vitest";

import {
  fingerprint,
  inferMatchedFields,
  normalizeEvent,
  validateEvent
} from "../../../packages/event-normalizer/src/index.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";

describe("event-normalizer", () => {
  it("should normalize dynamic route segments and volatile message values", (): void => {
    const event = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "User 123 failed at 2026-03-10T10:10:10.000Z with id 550e8400-e29b-41d4-a716-446655440000",
        stack: "TypeError: boom\\n at src/checkout.ts:10:2",
        handled: false,
        request: {
          method: "GET",
          path: "/users/550e8400-e29b-41d4-a716-446655440000/orders/123",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const normalized = normalizeEvent(event);

    expect(normalized.route_template).toBe("/users/{param}/orders/{param}");
    expect(normalized.normalized_message).toContain("{dynamic}");
  });

  it("should generate deterministic fingerprint for structurally equivalent failures", (): void => {
    const eventA = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "User 123 failed",
        stack: "TypeError: boom\\n at src/checkout.ts:10:2",
        handled: false,
        request: {
          method: "GET",
          path: "/users/123/orders/999",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const eventB = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "User 456 failed",
        stack: "TypeError: boom\\n at src/checkout.ts:10:2",
        handled: false,
        request: {
          method: "GET",
          path: "/users/456/orders/888",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const fingerprintA = fingerprint(normalizeEvent(eventA));
    const fingerprintB = fingerprint(normalizeEvent(eventB));

    expect(fingerprintA).toBe(fingerprintB);
  });

  it("should reject malformed events at validation boundary", (): void => {
    const badEvent = {
      event_type: "not-real",
      payload: {}
    };

    const result = validateEvent(badEvent);

    expect(result.success).toBe(false);
  });

  it("should canonicalize UUID/email/timestamp/IP/hex tokens in normalized messages", (): void => {
    const event = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message:
          "failure id 550e8400-e29b-41d4-a716-446655440000 user jane@example.com at 2026-03-10T10:10:10.000Z from 10.23.45.67 hash deadbeefcafebabe",
        stack: "TypeError: boom\\n at src/checkout.ts:10:2",
        handled: false,
        request: {
          method: "GET",
          path: "/users/123/orders/999",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const normalized = normalizeEvent(event);

    expect(normalized.normalized_message).toBe(
      "failure id {dynamic} user {dynamic} at {dynamic} from {dynamic} hash {dynamic}"
    );
  });

  it("should select application stack frames from escaped-newline stacks and drop vendor frames", (): void => {
    const event = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "boom",
        stack:
          "TypeError: boom\\n    at fromVendor (/srv/app/node_modules/pkg/index.js:9:1)\\n    at handleCheckout (/srv/app/src/checkout.ts:42:7)",
        handled: false,
        request: {
          method: "GET",
          path: "/users/123/orders/999",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const normalized = normalizeEvent(event);

    expect(normalized.top_frames).toEqual(["at handleCheckout (/srv/app/src/checkout.ts:42:7)"]);
  });

  it("should normalize equivalent routes with query/hash noise to stable templates and fingerprints", (): void => {
    const eventA = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "checkout failed for user 123",
        stack: "TypeError: boom\\n at src/checkout.ts:10:2",
        handled: false,
        request: {
          method: "GET",
          path: "/users/123/orders/456?expand=items#details",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const eventB = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "checkout failed for user 999",
        stack: "TypeError: boom\\n at src/checkout.ts:10:2",
        handled: false,
        request: {
          method: "GET",
          path: "/users/999/orders/888?expand=payments#summary",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const normalizedA = normalizeEvent(eventA);
    const normalizedB = normalizeEvent(eventB);

    expect(normalizedA.route_template).toBe("/users/{param}/orders/{param}");
    expect(normalizedB.route_template).toBe("/users/{param}/orders/{param}");
    expect(fingerprint(normalizedA)).toBe(fingerprint(normalizedB));
  });

  it("should normalize percent-encoded dynamic route segments to stable templates and fingerprints", (): void => {
    const eventA = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "checkout failed for user 123",
        stack: "TypeError: boom\\n at src/checkout.ts:10:2",
        handled: false,
        request: {
          method: "GET",
          path: "/users/%31%32%33/orders/%34%35%36",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const eventB = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "checkout failed for user 999",
        stack: "TypeError: boom\\n at src/checkout.ts:10:2",
        handled: false,
        request: {
          method: "GET",
          path: "/users/999/orders/888",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const normalizedA = normalizeEvent(eventA);
    const normalizedB = normalizeEvent(eventB);

    expect(normalizedA.route_template).toBe("/users/{param}/orders/{param}");
    expect(normalizedB.route_template).toBe("/users/{param}/orders/{param}");
    expect(fingerprint(normalizedA)).toBe(fingerprint(normalizedB));
  });

  it("should normalize malformed percent-encoded dynamic segments to stable templates and fingerprints", (): void => {
    const eventA = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "checkout failed for user 123",
        stack: "TypeError: boom\\n at src/checkout.ts:10:2",
        handled: false,
        request: {
          method: "GET",
          path: "/users/%31%32%/orders/%34%35%",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const eventB = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "checkout failed for user 999",
        stack: "TypeError: boom\\n at src/checkout.ts:10:2",
        handled: false,
        request: {
          method: "GET",
          path: "/users/%39%39%/orders/%38%38%",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const normalizedA = normalizeEvent(eventA);
    const normalizedB = normalizeEvent(eventB);

    expect(normalizedA.route_template).toBe("/users/{param}/orders/{param}");
    expect(normalizedB.route_template).toBe("/users/{param}/orders/{param}");
    expect(fingerprint(normalizedA)).toBe(fingerprint(normalizedB));
  });

  it("should normalize encoded slash-bearing dynamic segments to stable templates and fingerprints", (): void => {
    const eventA = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "checkout failed for user 123",
        stack: "TypeError: boom\\n at src/checkout.ts:10:2",
        handled: false,
        request: {
          method: "GET",
          path: "/users/abc%2Fdef/orders/123",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const eventB = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "checkout failed for user 999",
        stack: "TypeError: boom\\n at src/checkout.ts:10:2",
        handled: false,
        request: {
          method: "GET",
          path: "/users/xyz%2Fuvw/orders/999",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    const normalizedA = normalizeEvent(eventA);
    const normalizedB = normalizeEvent(eventB);

    expect(normalizedA.route_template).toBe("/users/{param}/orders/{param}");
    expect(normalizedB.route_template).toBe("/users/{param}/orders/{param}");
    expect(fingerprint(normalizedA)).toBe(fingerprint(normalizedB));
  });

  it("should normalize frontend resource-load errors to stable fingerprints and matched fields", (): void => {
    const eventA = createEventEnvelope({
      event_type: "frontend_exception",
      service: {
        name: "checkout-web",
        environment: "production",
        runtime: "browser",
        framework: "react"
      },
      payload: {
        name: "Error",
        message: "Browser resource load error",
        stack: "Error: Browser resource load error\\n    at chunkLoader (https://app.example/assets/chunk.js:42:1)",
        route: "/checkout",
        browser: {
          name: "Chrome",
          version: "126.0.0.0"
        },
        browser_event: {
          kind: "resource_error",
          message: null,
          file_name: null,
          line_number: null,
          column_number: null,
          target: {
            tag_name: "script",
            source_url: "https://cdn.example/assets/app.js?token=one#chunk"
          },
          opaque: true
        }
      }
    });

    const eventB = createEventEnvelope({
      event_type: "frontend_exception",
      service: {
        name: "checkout-web",
        environment: "production",
        runtime: "browser",
        framework: "react"
      },
      payload: {
        name: "Error",
        message: "Browser resource load error",
        stack: "Error: Browser resource load error\\n    at chunkLoader (https://app.example/assets/chunk.js:99:1)",
        route: "/checkout",
        browser: {
          name: "Chrome",
          version: "126.0.0.0"
        },
        browser_event: {
          kind: "resource_error",
          message: null,
          file_name: null,
          line_number: null,
          column_number: null,
          target: {
            tag_name: "script",
            source_url: "https://cdn.example/assets/app.js?token=two#bootstrap"
          },
          opaque: true
        }
      }
    });

    const normalizedA = normalizeEvent(eventA);
    const normalizedB = normalizeEvent(eventB);

    expect(normalizedA.error_type).toBe("Error");
    expect(normalizedA.route_template).toBe("/checkout");
    expect(normalizedA.browser_event_kind).toBe("resource_error");
    expect(normalizedA.resource_host).toBe("cdn.example");
    expect(normalizedA.resource_path).toBe("/assets/app.js");
    expect(normalizedA.top_frames).toEqual([]);
    expect(inferMatchedFields(normalizedA)).toEqual(
      expect.arrayContaining(["error_type", "route_template", "browser_event_kind", "resource_host", "resource_path"])
    );
    expect(fingerprint(normalizedA)).toBe(fingerprint(normalizedB));
  });

  it("should distinguish frontend resource-load errors from different hosts", (): void => {
    const eventA = createEventEnvelope({
      event_type: "frontend_exception",
      service: {
        name: "checkout-web",
        environment: "production",
        runtime: "browser",
        framework: "react"
      },
      payload: {
        name: "Error",
        message: "Browser resource load error",
        stack: "Error: Browser resource load error\\n    at onError (https://app.example/debugbundle.js:10:1)",
        route: "/checkout",
        browser: {
          name: "Chrome",
          version: "126.0.0.0"
        },
        browser_event: {
          kind: "resource_error",
          message: null,
          file_name: null,
          line_number: null,
          column_number: null,
          target: {
            tag_name: "script",
            source_url: "https://cdn-one.example/assets/app.js"
          },
          opaque: true
        }
      }
    });

    const eventB = createEventEnvelope({
      event_type: "frontend_exception",
      service: {
        name: "checkout-web",
        environment: "production",
        runtime: "browser",
        framework: "react"
      },
      payload: {
        name: "Error",
        message: "Browser resource load error",
        stack: "Error: Browser resource load error\\n    at onError (https://app.example/debugbundle.js:10:1)",
        route: "/checkout",
        browser: {
          name: "Chrome",
          version: "126.0.0.0"
        },
        browser_event: {
          kind: "resource_error",
          message: null,
          file_name: null,
          line_number: null,
          column_number: null,
          target: {
            tag_name: "script",
            source_url: "https://cdn-two.example/assets/app.js"
          },
          opaque: true
        }
      }
    });

    expect(fingerprint(normalizeEvent(eventA))).not.toBe(fingerprint(normalizeEvent(eventB)));
  });
});
