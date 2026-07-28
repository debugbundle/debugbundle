import { describe, expect, it } from "vitest";

import {
  classifyInstalledMobileEventCompatibility,
  objectWrapCompatibleProbeData,
  validateEvent
} from "../../../packages/event-normalizer/src/index.js";
import {
  createLegacyAndroidFrontendException,
  createLegacySwiftFrontendException
} from "../../helpers/mobile-sdk-event-fixtures.ts";

function createLegacyAndroidEvent(
  eventType: string,
  payload: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...createLegacyAndroidFrontendException(),
    event_type: eventType,
    payload
  };
}

describe("installed SDK event compatibility", () => {
  it("classifies only the bounded shipped mobile shapes for compatibility metrics", (): void => {
    expect(classifyInstalledMobileEventCompatibility(createLegacyAndroidFrontendException())).toBe(
      "legacy_android_event"
    );
    expect(classifyInstalledMobileEventCompatibility(createLegacySwiftFrontendException())).toBe(
      "legacy_swift_event"
    );
    expect(
      classifyInstalledMobileEventCompatibility({
        ...createLegacyAndroidFrontendException(),
        sdk_name: "@debugbundle/sdk-browser"
      })
    ).toBeNull();
    const canonical: Record<string, unknown> = {
      ...createLegacyAndroidFrontendException(),
      schema_version: "2026-03-01",
      event_id: "88888888-8888-4888-8888-888888888888",
      payload: {
        name: "CanonicalError",
        message: "canonical",
        stack: "CanonicalError: canonical"
      }
    };
    delete canonical["device"];
    expect(classifyInstalledMobileEventCompatibility(canonical)).toBeNull();
  });

  it("normalizes the shipped Android mobile envelope into the canonical payload", (): void => {
    const result = validateEvent(createLegacyAndroidFrontendException());

    expect(result.success).toBe(true);
    if (!result.success || result.data.event_type !== "frontend_exception") return;
    expect(result.data).toMatchObject({
      sdk_name: "@debugbundle/sdk-android",
      service: {
        runtime: "android"
      },
      context: {
        screen: "Checkout"
      },
      payload: {
        name: "java.lang.IllegalStateException",
        message: "checkout failed",
        device: {
          app_version: "1.2.3",
          os: {
            name: "Android"
          }
        }
      }
    });
    expect("device" in result.data).toBe(false);
  });

  it("normalizes the shipped Swift envelope and derives a deterministic event id", (): void => {
    const first = validateEvent(createLegacySwiftFrontendException());
    const second = validateEvent(createLegacySwiftFrontendException());

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success || first.data.event_type !== "frontend_exception") return;
    expect(first.data.event_id).toBe(second.data.event_id);
    expect(first.data).toMatchObject({
      schema_version: "2026-03-01",
      sdk_name: "@debugbundle/sdk-swift",
      service: {
        name: "checkout-mobile",
        environment: "production",
        runtime: "swift"
      },
      context: {
        screen: "Checkout"
      },
      payload: {
        name: "CheckoutError",
        message: "checkout failed",
        device: {
          app_version: "1.2.3",
          os: {
            name: "iOS"
          }
        }
      }
    });
  });

  it("object-wraps installed-client scalar standalone and inline probe data", (): void => {
    const standalone = validateEvent({
      schema_version: "2026-03-01",
      event_id: "88888888-8888-4888-8888-888888888888",
      event_type: "probe_event",
      sdk_name: "@debugbundle/sdk-java",
      sdk_version: "1.2.0",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "java",
        framework: null
      },
      occurred_at: "2026-07-27T12:00:00.000Z",
      payload: {
        label: "checkout.count",
        data: 2,
        activation_id: "99999999-9999-4999-8999-999999999999",
        probe_label_pattern: "checkout.*"
      }
    });
    const exception = createLegacyAndroidFrontendException();
    const payload = exception["payload"] as Record<string, unknown>;
    const probeData = payload["probe_data"] as { items: Array<Record<string, unknown>> };
    probeData.items[0]!["data"] = ["cart", 2];
    const inline = validateEvent(exception);

    expect(standalone.success).toBe(true);
    if (standalone.success && standalone.data.event_type === "probe_event") {
      expect(standalone.data.payload.data).toEqual({ value: 2 });
    }
    expect(inline.success).toBe(true);
    if (inline.success && inline.data.event_type === "frontend_exception") {
      expect(inline.data.payload.probe_data?.items[0]?.data).toEqual({ value: ["cart", 2] });
    }
  });

  it("normalizes legacy mobile request fields, URL query data, and optional response data", (): void => {
    const result = validateEvent(
      createLegacyAndroidEvent("request_event", {
        method: "POST",
        url: "https://example.test/orders/42?expand=items&locale=en",
        headers: {
          accept: "application/json"
        },
        body: {
          sku: "debug-bundle"
        },
        status_code: 503,
        duration_ms: 12.5,
        route_template: "/orders/{id}",
        response_headers: {
          "content-type": "application/json"
        },
        response_body: {
          error: "unavailable"
        },
        context: {
          retry_count: 2
        }
      })
    );

    expect(result.success).toBe(true);
    if (!result.success || result.data.event_type !== "request_event") return;
    expect(result.data).toMatchObject({
      context: {
        retry_count: 2
      },
      payload: {
        method: "POST",
        path: "/orders/42",
        query: {
          expand: "items",
          locale: "en"
        },
        response_status: 503,
        duration_ms: 12.5,
        route_template: "/orders/{id}",
        response_headers: {
          "content-type": "application/json"
        },
        response_body: {
          error: "unavailable"
        },
        device: {
          os: {
            name: "Android"
          }
        }
      }
    });
  });

  it("preserves an invalid legacy request URL as a non-empty fallback path", (): void => {
    const event = createLegacyAndroidEvent("request_event", {
      method: 1,
      url: "http://[",
      response_status: 0,
      duration_ms: 0
    });
    event["correlation"] = "legacy-correlation";
    const result = validateEvent(event);

    expect(result.success).toBe(true);
    if (!result.success || result.data.event_type !== "request_event") return;
    expect(result.data.payload.method).toBe("1");
    expect(result.data.payload.path).toBe("http://[");
    expect(result.data.payload.query).toEqual({});
    expect(result.data.correlation).toBeUndefined();
  });

  it("normalizes legacy mobile log attributes and context without losing custom fields", (): void => {
    const result = validateEvent(
      createLegacyAndroidEvent("log_event", {
        level: "warning",
        message: "checkout retry",
        attributes: {
          logger: "Checkout"
        },
        context: {
          retry_count: 2
        },
        thread: "main"
      })
    );

    expect(result.success).toBe(true);
    if (!result.success || result.data.event_type !== "log_event") return;
    expect(result.data).toMatchObject({
      context: {
        retry_count: 2
      },
      payload: {
        level: "warning",
        message: "checkout retry",
        attributes: {
          logger: "Checkout",
          retry_count: 2,
          thread: "main"
        }
      }
    });
  });

  it("normalizes legacy mobile breadcrumbs, suppression summaries, and probes", (): void => {
    const breadcrumb = validateEvent(
      createLegacyAndroidEvent("frontend_breadcrumb", {
        breadcrumbType: "screen_transition",
        route: "Checkout",
        data: {
          previous_screen: "Cart"
        }
      })
    );
    const suppressed = validateEvent(
      createLegacyAndroidEvent("error_suppressed", {
        fingerprint: "mobile-checkout",
        suppressed_count: 4,
        window_seconds: 0,
        first_seen: "2026-07-27T11:59:00.000Z",
        last_seen: "2026-07-27T12:00:00.000Z"
      })
    );
    const probe = validateEvent(
      createLegacyAndroidEvent("probe_event", {
        label: "checkout.cart",
        data: ["cart", 2],
        activation_id: "77777777-7777-4777-8777-777777777777"
      })
    );

    expect(breadcrumb.success).toBe(true);
    if (breadcrumb.success && breadcrumb.data.event_type === "frontend_breadcrumb") {
      expect(breadcrumb.data.payload).toMatchObject({
        breadcrumb_type: "screen_transition",
        route: "Checkout",
        data: {
          previous_screen: "Cart"
        }
      });
    }

    expect(suppressed.success).toBe(true);
    if (suppressed.success && suppressed.data.event_type === "error_suppressed") {
      expect(suppressed.data.payload).toMatchObject({
        fingerprint: "mobile-checkout",
        suppressed_count: 4,
        window_seconds: 1
      });
    }

    expect(probe.success).toBe(true);
    if (probe.success && probe.data.event_type === "probe_event") {
      expect(probe.data.payload).toMatchObject({
        label: "checkout.cart",
        data: {
          value: ["cart", 2]
        },
        activation_id: "77777777-7777-4777-8777-777777777777",
        probe_label_pattern: "checkout.cart"
      });
    }
  });

  it("does not make an unsupported installed-mobile event type valid", (): void => {
    const result = validateEvent(
      createLegacyAndroidEvent("unsupported_mobile_event", {
        custom: true
      })
    );

    expect(result.success).toBe(false);
  });

  it("normalizes a minimal installed-mobile exception without optional context buffers", (): void => {
    const result = validateEvent(
      createLegacyAndroidEvent("frontend_exception", {
        error: {
          message: "minimal failure"
        }
      })
    );

    expect(result.success).toBe(true);
    if (!result.success || result.data.event_type !== "frontend_exception") return;
    expect(result.data.payload).toMatchObject({
      name: "MobileError",
      message: "minimal failure",
      stack: "MobileError: minimal failure"
    });
    expect(result.data.payload.breadcrumbs).toBeUndefined();
    expect(result.data.payload.probe_data).toBeUndefined();
  });

  it("object-wraps scalar inline probe items on otherwise canonical envelopes", (): void => {
    const payload: Record<string, unknown> = {
      probe_data: {
        version: 1,
        items: [
          {
            label: "checkout.cart",
            data: 2,
            timestamp: "2026-07-27T12:00:00.000Z",
            activation_id: null
          }
        ]
      }
    };

    objectWrapCompatibleProbeData("frontend_exception", payload);

    expect(payload).toMatchObject({
      probe_data: {
        items: [
          {
            data: {
              value: 2
            }
          }
        ]
      }
    });
  });
});
