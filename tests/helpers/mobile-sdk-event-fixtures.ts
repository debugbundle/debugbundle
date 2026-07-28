const OCCURRED_AT = "2026-07-27T12:00:00.000Z";

export function createCanonicalMobileDevice(): Record<string, unknown> {
  return {
    user_agent: null,
    os: {
      name: "Android",
      version: "16"
    },
    device_type: "mobile",
    screen: {
      width: 1080,
      height: 2400
    },
    viewport: {
      width: 1080,
      height: 2400
    },
    device_pixel_ratio: null,
    touch_capable: true,
    language: "en-US",
    connection_type: "wifi",
    color_scheme_preference: null,
    app_version: "1.2.3",
    build_number: "42",
    release_channel: "production",
    api_level: 36,
    manufacturer: "Google",
    model: "Pixel",
    timezone: "Europe/Malta",
    battery_level: 0.8,
    battery_charging: false,
    free_disk_bytes: 10_000,
    free_memory_bytes: 20_000,
    jailbroken: null
  };
}

function createLegacyAndroidDevice(): Record<string, unknown> {
  return {
    app_version: "1.2.3",
    build_number: "42",
    release_channel: "production",
    os_name: "Android",
    os_version: "16",
    api_level: 36,
    manufacturer: "Google",
    model: "Pixel",
    device_type: "mobile",
    screen_width: 1080,
    screen_height: 2400,
    locale: "en-US",
    timezone: "Europe/Malta",
    connection_type: "wifi",
    battery_level: 0.8,
    battery_charging: false,
    free_disk_bytes: 10_000,
    free_memory_bytes: 20_000,
    rooted: null
  };
}

export function createCanonicalMobileFrontendException(): Record<string, unknown> {
  return {
    schema_version: "2026-03-01",
    event_id: "11111111-1111-4111-8111-111111111111",
    event_type: "frontend_exception",
    sdk_name: "@debugbundle/sdk-android",
    sdk_version: "1.2.0",
    service: {
      name: "checkout-mobile",
      environment: "production",
      runtime: "android",
      framework: null
    },
    occurred_at: OCCURRED_AT,
    correlation: {
      trace_id: "trace-mobile"
    },
    context: {
      screen: "Checkout"
    },
    payload: {
      name: "IllegalStateException",
      message: "checkout failed",
      stack: "IllegalStateException: checkout failed\n at Checkout.submit(Checkout.kt:42)",
      route: "Checkout",
      breadcrumbs: [
        {
          ts: "2026-07-27T11:59:59.000Z",
          breadcrumb_type: "screen_transition",
          route: "Checkout",
          data: {
            previous_screen: "Cart"
          }
        }
      ],
      probe_data: {
        version: 1,
        items: [
          {
            label: "checkout.cart",
            data: {
              item_count: 2
            },
            timestamp: "2026-07-27T11:59:58.000Z",
            activation_id: null
          }
        ]
      },
      device: createCanonicalMobileDevice()
    }
  };
}

export function createCanonicalMobileEvent(eventType: string): Record<string, unknown> {
  const base = createCanonicalMobileFrontendException();
  base["event_type"] = eventType;
  base["event_id"] =
    eventType === "request_event"
      ? "22222222-2222-4222-8222-222222222222"
      : eventType === "log_event"
        ? "33333333-3333-4333-8333-333333333333"
        : eventType === "frontend_breadcrumb"
          ? "44444444-4444-4444-8444-444444444444"
          : eventType === "error_suppressed"
            ? "55555555-5555-4555-8555-555555555555"
            : "66666666-6666-4666-8666-666666666666";

  const device = createCanonicalMobileDevice();
  if (eventType === "request_event") {
    base["payload"] = {
      method: "POST",
      path: "/checkout",
      query: {},
      headers: {},
      response_status: 503,
      duration_ms: 125,
      route_template: "/checkout",
      response_headers: {},
      device
    };
  } else if (eventType === "log_event") {
    base["payload"] = {
      level: "error",
      message: "checkout failed",
      attributes: {
        logger: "Checkout"
      },
      device
    };
  } else if (eventType === "frontend_breadcrumb") {
    base["payload"] = {
      breadcrumb_type: "screen_transition",
      route: "Checkout",
      data: {
        previous_screen: "Cart"
      },
      device
    };
  } else if (eventType === "error_suppressed") {
    base["payload"] = {
      fingerprint: "mobile-checkout",
      suppressed_count: 4,
      window_seconds: 60,
      first_seen: "2026-07-27T11:59:00.000Z",
      last_seen: OCCURRED_AT,
      device
    };
  } else if (eventType === "probe_event") {
    base["payload"] = {
      label: "checkout.cart",
      data: {
        item_count: 2
      },
      activation_id: "77777777-7777-4777-8777-777777777777",
      probe_label_pattern: "checkout.*",
      device
    };
  }
  return base;
}

export function createLegacyAndroidFrontendException(): Record<string, unknown> {
  const canonical = createCanonicalMobileFrontendException();
  const payload = canonical["payload"] as Record<string, unknown>;
  return {
    ...canonical,
    sdk_version: "1.1.0",
    service: {
      name: "checkout-mobile",
      environment: "production",
      runtime: "kotlin",
      framework: null
    },
    payload: {
      error: {
        type: "java.lang.IllegalStateException",
        message: "checkout failed",
        stack_trace: ["Checkout.submit(Checkout.kt:42)"]
      },
      context: {
        screen: "Checkout"
      },
      breadcrumbs: payload["breadcrumbs"],
      probe_data: payload["probe_data"]
    },
    device: createLegacyAndroidDevice()
  };
}

export function createLegacySwiftFrontendException(): Record<string, unknown> {
  return {
    sdk_name: "@debugbundle/sdk-swift",
    sdk_version: "1.1.0",
    service: "checkout-mobile",
    environment: "production",
    event_type: "frontend_exception",
    occurred_at: OCCURRED_AT,
    correlation: {
      trace_id: "trace-mobile"
    },
    payload: {
      error: {
        type: "CheckoutError",
        domain: "Checkout",
        code: 42,
        message: "checkout failed"
      },
      context: {
        screen: "Checkout"
      },
      breadcrumbs: [
        {
          breadcrumb_type: "screen_transition",
          occurred_at: "2026-07-27T11:59:59.000Z",
          route: "Checkout",
          data: {
            previous_screen: "Cart"
          }
        }
      ],
      probe_data: {
        checkout: [2]
      }
    },
    device: {
      appVersion: "1.2.3",
      buildNumber: "42",
      releaseChannel: "production",
      osName: "iOS",
      osVersion: "18",
      manufacturer: "Apple",
      model: "iPhone",
      deviceType: "mobile",
      screenResolution: "1179x2556",
      locale: "en-US",
      timezone: "Europe/Malta",
      networkConnectionType: "wifi",
      batteryLevel: 0.8,
      charging: false,
      freeDiskBytes: 10_000,
      freeMemoryBytes: 20_000,
      jailbroken: null
    },
    release_channel: "production",
    app_version: "1.2.3",
    build_number: "42"
  };
}
