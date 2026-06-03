import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildBundle } from "../../../packages/bundle-engine/src/index.js";
import { BundleV1Schema, createEventEnvelope } from "../../../packages/shared-types/src/index.js";

const deployMetadataGoldenFixture = readFileSync(
  new URL("../../fixtures/build-bundle.deploy-metadata.golden.json", import.meta.url),
  "utf8"
).trim();

describe("bundle-engine", () => {
  it("should produce deterministic deploy_metadata bundle output matching golden fixture", (): void => {
    const bundle = buildBundle({
      job: {
        trigger: "deploy_metadata"
      },
      incident: {
        incident_id: "inc_fixture",
        project_id: "proj_fixture",
        service_id: "svc_fixture",
        service_name: "checkout-api",
        service_runtime: "node",
        service_framework: "fastify",
        environment: "production",
        fingerprint: "fp_fixture",
        title: "TypeError at checkout",
        severity: "high",
        first_seen_at: "2026-03-11T23:59:00.000Z",
        last_seen_at: "2026-03-12T00:00:00.000Z",
        occurrence_count: 3,
        source_event_types: ["request_event", "backend_exception"]
      },
      bundleMetadata: {
        generation_number: 3,
        created_at: "2026-03-12T00:00:00.000Z",
        updated_at: "2026-03-12T00:00:00.000Z",
        source_event_id: "evt_fixture",
        source_occurred_at: "2026-03-12T00:00:00.000Z"
      },
      sourceEnvelopes: [],
      probeDataItems: []
    });

    const serializedBundle = JSON.stringify(bundle);

    expect(serializedBundle).toBe(deployMetadataGoldenFixture);
    expect(BundleV1Schema.parse(bundle)).toEqual(BundleV1Schema.parse(JSON.parse(deployMetadataGoldenFixture)));
  });

  it("should keep probe_data items deterministic in output ordering", (): void => {
    const bundle = buildBundle({
      job: {
        trigger: "new_context_type"
      },
      incident: {
        incident_id: "inc_probe_order",
        project_id: "proj_probe_order",
        service_id: "svc_probe_order",
        service_name: "checkout-api",
        service_runtime: "node",
        service_framework: "fastify",
        environment: "production",
        fingerprint: "fp_probe_order",
        title: "TypeError at checkout",
        severity: "high",
        first_seen_at: "2026-03-12T00:00:00.000Z",
        last_seen_at: "2026-03-12T00:01:00.000Z",
        occurrence_count: 2,
        source_event_types: ["backend_exception"]
      },
      bundleMetadata: {
        generation_number: 2,
        created_at: "2026-03-12T00:01:00.000Z",
        updated_at: "2026-03-12T00:01:00.000Z",
        source_event_id: "evt_probe_order",
        source_occurred_at: "2026-03-12T00:01:00.000Z"
      },
      sourceEnvelopes: [],
      probeDataItems: [
        {
          label: "checkout.inline_only",
          data: { from: "inline" },
          timestamp: "2026-03-12T00:00:15.000Z",
          activation_id: null
        },
        {
          label: "checkout.no_trace",
          data: { fallback: true },
          timestamp: "2026-03-12T00:00:30.000Z",
          activation_id: "00000000-0000-4000-8000-000000000013"
        }
      ]
    });

    expect(bundle.context.probe_data).toEqual({
      version: 1,
      items: [
        {
          label: "checkout.inline_only",
          data: { from: "inline" },
          timestamp: "2026-03-12T00:00:15.000Z",
          activation_id: null
        },
        {
          label: "checkout.no_trace",
          data: { fallback: true },
          timestamp: "2026-03-12T00:00:30.000Z",
          activation_id: "00000000-0000-4000-8000-000000000013"
        }
      ]
    });
  });

  it("should apply fallback source-event/service branches for regression trigger", (): void => {
    const bundle = buildBundle({
      job: {
        trigger: "regression_reopen"
      },
      incident: {
        incident_id: "inc_regression",
        project_id: "proj_regression",
        service_id: null,
        service_name: "checkout-api",
        service_runtime: "node",
        service_framework: "fastify",
        environment: "production",
        fingerprint: "fp_regression",
        title: "TypeError at checkout",
        severity: "high",
        first_seen_at: "2026-03-12T00:00:00.000Z",
        last_seen_at: "2026-03-12T00:02:00.000Z",
        occurrence_count: 1,
        source_event_types: []
      },
      bundleMetadata: {
        generation_number: 1,
        created_at: "2026-03-12T00:02:00.000Z",
        updated_at: "2026-03-12T00:02:00.000Z",
        source_event_id: "evt_regression",
        source_occurred_at: "2026-03-12T00:02:00.000Z"
      },
      sourceEnvelopes: [],
      probeDataItems: []
    });

    expect(bundle.service.id).toBe("svc_unknown");
    expect(bundle.summary.error_type).toBe("backend_exception");
    expect(bundle.summary.signals.new_deploy).toBe(false);
    expect(bundle.summary.signals.regression_suspected).toBe(true);
    expect(bundle.impact.regression_suspected).toBe(true);
  });

  it("should emit explicit null context gaps for unavailable blocks", (): void => {
    const bundle = buildBundle({
      job: {
        trigger: "occurrence_threshold"
      },
      incident: {
        incident_id: "inc_context_gaps",
        project_id: "proj_context_gaps",
        service_id: "svc_context_gaps",
        service_name: "checkout-api",
        service_runtime: "node",
        service_framework: "fastify",
        environment: "production",
        fingerprint: "fp_context_gaps",
        title: "TypeError at checkout",
        severity: "high",
        first_seen_at: "2026-03-12T00:00:00.000Z",
        last_seen_at: "2026-03-12T00:01:00.000Z",
        occurrence_count: 2,
        source_event_types: ["backend_exception"]
      },
      bundleMetadata: {
        generation_number: 1,
        created_at: "2026-03-12T00:01:00.000Z",
        updated_at: "2026-03-12T00:01:00.000Z",
        source_event_id: "evt_context_gaps",
        source_occurred_at: "2026-03-12T00:01:00.000Z"
      },
      sourceEnvelopes: [],
      probeDataItems: []
    });

    expect(bundle.context.request).toBeNull();
    expect(bundle.context.response).toBeNull();
    expect(bundle.context.logs).toBeNull();
    expect(bundle.context.frontend).toBeNull();
    expect(bundle.context.environment).toBeNull();
    expect(bundle.context.deploy).toBeNull();
    expect(bundle.context.runtime).toBeNull();
    expect(bundle.context.git).toBeNull();
    expect(bundle.context.dependencies).toBeNull();
    expect(bundle.context.device).toBeNull();
  });

  it("should build rich context blocks from mixed source envelopes", (): void => {
    const bundle = buildBundle({
      job: {
        trigger: "new_context_type"
      },
      incident: {
        incident_id: "inc_rich",
        project_id: "proj_rich",
        service_id: "svc_rich",
        service_name: "checkout-api",
        service_runtime: null,
        service_framework: null,
        environment: "production",
        fingerprint: "fp_rich",
        title: "Frontend checkout failure",
        severity: "high",
        first_seen_at: "2026-03-12T00:00:00.000Z",
        last_seen_at: "2026-03-12T00:01:00.000Z",
        occurrence_count: 4,
        source_event_types: ["request_event", "frontend_exception", "deploy_metadata"]
      },
      bundleMetadata: {
        generation_number: 4,
        created_at: "2026-03-12T00:01:00.000Z",
        updated_at: "2026-03-12T00:01:05.000Z",
        source_event_id: "00000000-0000-4000-8000-000000000307",
        source_occurred_at: "2026-03-12T00:00:30.000Z"
      },
      sourceEnvelopes: [
        createEventEnvelope({
          event_id: "00000000-0000-4000-8000-000000000301",
          event_type: "frontend_breadcrumb",
          occurred_at: "2026-03-12T00:00:10.000Z",
          service: {
            name: "checkout-api",
            environment: "production",
            runtime: "browser-js",
            framework: "react"
          },
          payload: {
            breadcrumb_type: "route_change",
            route: "/checkout",
            data: {
              from: "/cart",
              to: "/checkout"
            }
          }
        }),
        createEventEnvelope({
          event_id: "00000000-0000-4000-8000-000000000302",
          event_type: "frontend_breadcrumb",
          occurred_at: "2026-03-12T00:00:11.000Z",
          service: {
            name: "checkout-api",
            environment: "production",
            runtime: "browser-js",
            framework: "react"
          },
          payload: {
            breadcrumb_type: "click",
            route: "/checkout",
            data: {}
          }
        }),
        createEventEnvelope({
          event_id: "00000000-0000-4000-8000-000000000303",
          event_type: "frontend_breadcrumb",
          occurred_at: "2026-03-12T00:00:12.000Z",
          service: {
            name: "checkout-api",
            environment: "production",
            runtime: "browser-js",
            framework: "react"
          },
          payload: {
            breadcrumb_type: "network_request",
            route: "/checkout",
            data: {
              url: "/api/pay"
            }
          }
        }),
        createEventEnvelope({
          event_id: "00000000-0000-4000-8000-000000000304",
          event_type: "frontend_breadcrumb",
          occurred_at: "2026-03-12T00:00:13.000Z",
          service: {
            name: "checkout-api",
            environment: "production",
            runtime: "browser-js",
            framework: "react"
          },
          payload: {
            breadcrumb_type: "form_submit",
            route: "/checkout",
            data: {
              form: "payment",
              fields: {
                has_coupon: true
              }
            }
          }
        }),
        createEventEnvelope({
          event_id: "00000000-0000-4000-8000-000000000305",
          event_type: "frontend_breadcrumb",
          occurred_at: "2026-03-12T00:00:14.000Z",
          service: {
            name: "checkout-api",
            environment: "production",
            runtime: "browser-js",
            framework: "react"
          },
          payload: {
            breadcrumb_type: "console_log",
            route: "/checkout",
            data: {
              level: "warn",
              message: "payment widget fallback"
            }
          }
        }),
        createEventEnvelope({
          event_id: "00000000-0000-4000-8000-000000000306",
          event_type: "frontend_exception",
          occurred_at: "2026-03-12T00:00:20.000Z",
          service: {
            name: "checkout-api",
            environment: "production",
            runtime: "browser-js",
            framework: "react"
          },
          payload: {
            name: "TypeError",
            message: "Cannot read properties of undefined",
            stack: "TypeError: Cannot read properties of undefined\n    at CheckoutPage (src/Checkout.tsx:12:3)",
            route: "/checkout",
            browser: {
              name: "Chrome",
              version: "122.0"
            },
            device: {
              user_agent: "Mozilla/5.0",
              os: { name: "macOS", version: "14" },
              device_type: "desktop",
              screen: { width: 1728, height: 1117 },
              viewport: { width: 1440, height: 900 },
              device_pixel_ratio: 2,
              touch_capable: false,
              language: "en-US",
              connection_type: "4g",
              color_scheme_preference: "light"
            },
            dom_context: {
              mode: "lightweight",
              html_excerpt: "<button>Pay</button>"
            }
          }
        }),
        createEventEnvelope({
          event_id: "00000000-0000-4000-8000-000000000307",
          event_type: "request_event",
          occurred_at: "2026-03-12T00:00:30.000Z",
          service: {
            name: "checkout-api",
            environment: "production",
            runtime: "node",
            framework: "fastify"
          },
          payload: {
            method: "POST",
            path: "/checkout",
            route_template: "/checkout",
            query: { cart: "abc" },
            headers: { "content-type": "application/json" },
            body: { total: 1200 },
            response_status: 500,
            duration_ms: 320
          }
        }),
        createEventEnvelope({
          event_id: "00000000-0000-4000-8000-000000000309",
          event_type: "backend_exception",
          occurred_at: "2026-03-12T00:00:35.000Z",
          service: {
            name: "checkout-api",
            environment: "production",
            runtime: "node",
            framework: "fastify"
          },
          payload: {
            name: "TypeError",
            message: "Server failure",
            stack: "TypeError: Server failure\n    at handler (/srv/index.ts:10:5)",
            handled: false,
            request: {
              method: "POST",
              path: "/checkout",
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
        }),
        createEventEnvelope({
          event_id: "00000000-0000-4000-8000-000000000308",
          event_type: "deploy_metadata",
          occurred_at: "2026-03-12T00:00:40.000Z",
          service: {
            name: "checkout-api",
            environment: "production",
            runtime: "node",
            framework: "fastify"
          },
          payload: {
            commit_sha: "abcdef1234567890",
            version: "v2.4.0",
            branch: "main",
            environment: "production",
            deployed_at: "2026-03-12T00:00:39.000Z"
          }
        })
      ],
      probeDataItems: []
    });

    expect(bundle.signal.signal_type).toBe("request_failure");
    expect(bundle.context.request?.route_template).toBe("/checkout");
    expect(bundle.context.response?.duration_ms).toBe(320);
    expect(bundle.context.frontend?.route_changes).toHaveLength(1);
    expect(bundle.context.frontend?.clicks[0]).toEqual({
      selector: "unknown",
      label: "unknown",
      ts: "2026-03-12T00:00:11.000Z"
    });
    expect(bundle.context.frontend?.network_requests[0]).toEqual({
      method: "GET",
      url: "/api/pay",
      status: 0,
      ts: "2026-03-12T00:00:12.000Z"
    });
    expect(bundle.context.deploy?.regression_window).toBe(false);
    expect(bundle.context.git?.commit_short).toBe("abcdef1");
    expect(bundle.context.runtime?.name).toBe("node");
    expect(bundle.context.device?.browser.name).toBe("Chrome");
  });

  it("should include inline frontend exception breadcrumbs without requiring standalone breadcrumb envelopes", (): void => {
    const bundle = buildBundle({
      job: {
        trigger: "occurrence_threshold"
      },
      incident: {
        incident_id: "inc_inline_breadcrumbs",
        project_id: "proj_inline_breadcrumbs",
        service_id: "svc_inline_breadcrumbs",
        service_name: "checkout-web",
        service_runtime: "browser",
        service_framework: "react",
        environment: "production",
        fingerprint: "fp_inline_breadcrumbs",
        title: "Frontend checkout failure",
        severity: "high",
        first_seen_at: "2026-03-12T00:00:00.000Z",
        last_seen_at: "2026-03-12T00:01:00.000Z",
        occurrence_count: 1,
        source_event_types: ["frontend_exception"]
      },
      bundleMetadata: {
        generation_number: 1,
        created_at: "2026-03-12T00:01:00.000Z",
        updated_at: "2026-03-12T00:01:00.000Z",
        source_event_id: "00000000-0000-4000-8000-000000000401",
        source_occurred_at: "2026-03-12T00:00:20.000Z"
      },
      sourceEnvelopes: [
        createEventEnvelope({
          event_id: "00000000-0000-4000-8000-000000000401",
          event_type: "frontend_exception",
          occurred_at: "2026-03-12T00:00:20.000Z",
          service: {
            name: "checkout-web",
            environment: "production",
            runtime: "browser",
            framework: "react"
          },
          payload: {
            name: "TypeError",
            message: "Cannot read properties of undefined",
            stack: "TypeError: Cannot read properties of undefined\n    at CheckoutPage (src/Checkout.tsx:12:3)",
            route: "/checkout",
            browser: {
              name: "Chrome",
              version: "122.0"
            },
            breadcrumbs: [
              {
                breadcrumb_type: "route_change",
                route: "/checkout",
                data: {
                  from: "/cart",
                  to: "/checkout"
                },
                ts: "2026-03-12T00:00:10.000Z"
              },
              {
                breadcrumb_type: "click",
                route: "/checkout",
                data: {
                  selector: "button.pay",
                  label: "Pay now"
                },
                ts: "2026-03-12T00:00:11.000Z"
              },
              {
                breadcrumb_type: "network_request",
                route: "/checkout",
                data: {
                  method: "POST",
                  url: "/api/pay",
                  status_code: 500,
                  duration_ms: 320
                },
                ts: "2026-03-12T00:00:12.000Z"
              }
            ]
          }
        })
      ],
      probeDataItems: []
    });

    expect(bundle.context.frontend?.route_changes).toEqual([
      {
        from: "/cart",
        to: "/checkout",
        ts: "2026-03-12T00:00:10.000Z"
      }
    ]);
    expect(bundle.context.frontend?.clicks).toEqual([
      {
        selector: "button.pay",
        label: "Pay now",
        ts: "2026-03-12T00:00:11.000Z"
      }
    ]);
    expect(bundle.context.frontend?.network_requests).toEqual([
      {
        method: "POST",
        url: "/api/pay",
        status: 500,
        ts: "2026-03-12T00:00:12.000Z",
        duration_ms: 320
      }
    ]);
  });

  it("should describe opaque browser window errors without using the SDK fallback frame as app code", (): void => {
    const bundle = buildBundle({
      job: {
        trigger: "occurrence_threshold"
      },
      incident: {
        incident_id: "inc_opaque_browser_error",
        project_id: "proj_opaque_browser_error",
        service_id: "svc_opaque_browser_error",
        service_name: "browser-app",
        service_runtime: "browser",
        service_framework: null,
        environment: "production",
        fingerprint: "fp_opaque_browser_error",
        title: "frontend_exception",
        severity: "high",
        first_seen_at: "2026-05-25T18:23:44.380Z",
        last_seen_at: "2026-05-25T18:34:04.235Z",
        occurrence_count: 4,
        source_event_types: ["frontend_exception"]
      },
      bundleMetadata: {
        generation_number: 2,
        created_at: "2026-05-25T18:34:14.859Z",
        updated_at: "2026-05-25T18:34:14.859Z",
        source_event_id: "00000000-0000-4000-8000-000000000601",
        source_occurred_at: "2026-05-25T18:34:04.235Z"
      },
      sourceEnvelopes: [
        createEventEnvelope({
          event_id: "00000000-0000-4000-8000-000000000601",
          event_type: "frontend_exception",
          occurred_at: "2026-05-25T18:34:04.235Z",
          service: {
            name: "browser-app",
            environment: "production",
            runtime: "browser",
            framework: null
          },
          payload: {
            name: "Error",
            message: "Window error",
            stack:
              "Error: Window error\n" +
              "    at onError (https://app.example/wp-content/plugins/debugbundle/assets/dist/debugbundle-browser.js:6208:81)",
            route: "/collaborate/index.xhtml",
            browser: {
              name: "Chrome",
              version: "147.0.0.0"
            },
            browser_event: {
              kind: "window_error",
              message: null,
              file_name: "https://app.example/assets/app.js",
              line_number: 12,
              column_number: 4,
              target: {
                tag_name: "script",
                source_url: "https://app.example/assets/app.js",
                attributes: {
                  cross_origin: "anonymous",
                  async: true,
                  integrity_present: true
                }
              },
              page: {
                url: "https://app.example/collaborate/index.xhtml",
                referrer: "https://app.example/home",
                ready_state: "interactive",
                visibility_state: "visible"
              },
              opaque: true
            }
          }
        })
      ],
      probeDataItems: []
    });

    expect(bundle.summary.first_application_frame).toBeNull();
    expect(bundle.summary.likely_cause).toBe(
      "The browser reported an opaque window error without a usable application stack."
    );
    expect(bundle.summary.recommended_action).toBe(
      "Inspect browser console output, resource loading, cross-origin script settings, and framework-level error boundaries for the affected route."
    );
    expect(bundle.context.frontend?.exceptions[0]).toEqual({
      name: "Error",
      message: "Window error",
      route: "/collaborate/index.xhtml",
      browser: {
        name: "Chrome",
        version: "147.0.0.0"
      },
      ts: "2026-05-25T18:34:04.235Z",
      browser_event: {
        kind: "window_error",
        message: null,
        file_name: "https://app.example/assets/app.js",
        line_number: 12,
        column_number: 4,
        target: {
          tag_name: "script",
          source_url: "https://app.example/assets/app.js",
          attributes: {
            cross_origin: "anonymous",
            async: true,
            integrity_present: true
          }
        },
        page: {
          url: "https://app.example/collaborate/index.xhtml",
          referrer: "https://app.example/home",
          ready_state: "interactive",
          visibility_state: "visible"
        },
        opaque: true
      }
    });
  });

  it("should enrich backend exception bundles with agent-ready context from existing fields", (): void => {
    const bundle = buildBundle({
      job: {
        trigger: "occurrence_threshold"
      },
      incident: {
        incident_id: "75f07eaf-e1ad-4a8a-abb2-2f2f030e6c37",
        project_id: "proj_debugbundle_api",
        service_id: "svc_debugbundle_api",
        service_name: "debugbundle-api",
        service_runtime: "node",
        service_framework: "fastify",
        environment: "production",
        fingerprint: "fp_github_install_url",
        title: "github_api_invalid_response",
        severity: "high",
        first_seen_at: "2026-05-11T16:02:29.716Z",
        last_seen_at: "2026-05-11T16:02:29.716Z",
        occurrence_count: 1,
        source_event_types: ["backend_exception"]
      },
      bundleMetadata: {
        generation_number: 1,
        created_at: "2026-05-11T16:02:29.716Z",
        updated_at: "2026-05-11T16:02:29.716Z",
        source_event_id: "00000000-0000-4000-8000-000000000501",
        source_occurred_at: "2026-05-11T16:02:29.716Z"
      },
      linkBaseUrls: {
        api: "https://api.debugbundle.com",
        app: "https://app.debugbundle.com",
        docs: "https://debugbundle.com/docs"
      },
      configuredDeploy: {
        commit_sha: "efae41568986daaf8c54777ca8e63d838a4c319f",
        deploy_version: "efae41568986",
        branch: "main",
        deployed_at: "2026-05-11T16:20:00.000Z",
        repo: "debugbundle/debugbundle"
      },
      sourceEnvelopes: [
        createEventEnvelope({
          event_id: "00000000-0000-4000-8000-000000000501",
          event_type: "backend_exception",
          occurred_at: "2026-05-11T16:02:29.716Z",
          service: {
            name: "debugbundle-api",
            environment: "production",
            runtime: "node",
            framework: "fastify"
          },
          payload: {
            name: "Error",
            message: "github_api_invalid_response",
            stack:
              "Error: github_api_invalid_response\n" +
              "    at requestJson (apps/api/src/github-app.ts:42:11)\n" +
              "    at getInstallUrl (apps/api/src/github-app.ts:88:18)\n" +
              "    at handler (apps/api/src/routes/github.ts:53:27)",
            handled: false,
            request: {
              method: "GET",
              path: "/v1/github/app/install-url",
              query: {},
              headers: {
                cookie: "[REDACTED]",
                authorization: "[REDACTED]",
                accept: "application/json"
              },
              body: null
            },
            response: {
              status_code: 500,
              body: {
                error: "internal_server_error"
              }
            },
            runtime: {
              version: "24.0.0",
              platform: "linux",
              arch: "arm64",
              pid: 123,
              cwd: "/srv/debugbundle",
              uptime_sec: 456.7,
              hostname: "api-host-1",
              memory: {
                rss: 120000000,
                heap_total: 64000000,
                heap_used: 32000000,
                external: 1000000,
                peak: null
              }
            }
          }
        })
      ],
      probeDataItems: []
    });

    expect(bundle.context.request?.route_template).toBe("/v1/github/app/install-url");
    expect(bundle.context.dependencies).toEqual({
      version: 1,
      items: [
        {
          name: "github_api",
          status: "failed",
          notes: "GitHub API returned an unexpected response shape while handling GET /v1/github/app/install-url."
        }
      ]
    });
    expect(bundle.summary.likely_cause).toContain("GitHub API returned a response that did not match the expected schema");
    expect(bundle.summary.recommended_action).toContain("Inspect the GitHub API response handling");
    expect(bundle.summary.confidence).toBeGreaterThan(0.5);
    expect(bundle.context.deploy).toEqual({
      version: 1,
      commit_sha: "efae41568986daaf8c54777ca8e63d838a4c319f",
      deploy_version: "efae41568986",
      branch: "main",
      deployed_at: "2026-05-11T16:20:00.000Z",
      regression_window: false
    });
    expect(bundle.context.git).toEqual({
      version: 1,
      commit: "efae41568986daaf8c54777ca8e63d838a4c319f",
      commit_short: "efae415",
      branch: "main",
      repo: "debugbundle/debugbundle",
      dirty: false,
      source: "env"
    });
    expect(bundle.context.runtime).toMatchObject({
      version: 1,
      name: "node",
      runtime_version: "24.0.0",
      platform: "linux",
      arch: "arm64",
      pid: 123,
      cwd: "/srv/debugbundle",
      uptime_sec: 456.7,
      hostname: "api-host-1",
      memory: {
        rss: 120000000,
        heap_total: 64000000,
        heap_used: 32000000,
        external: 1000000,
        peak: null
      }
    });
    expect(bundle.links).toEqual({
      self: "https://api.debugbundle.com/v1/incidents/75f07eaf-e1ad-4a8a-abb2-2f2f030e6c37/bundle",
      reproduction: "https://api.debugbundle.com/v1/incidents/75f07eaf-e1ad-4a8a-abb2-2f2f030e6c37/reproduction",
      incident: "https://app.debugbundle.com/incidents/75f07eaf-e1ad-4a8a-abb2-2f2f030e6c37",
      project: "https://app.debugbundle.com/projects/proj_debugbundle_api",
      docs: "https://debugbundle.com/docs/bundles"
    });
    expect(bundle.redaction.fields).toEqual(["context.request.headers.authorization", "context.request.headers.cookie"]);
    expect(bundle.redaction.notes).toBe("Sensitive bundle fields were redacted before storage.");
  });

  it("should fallback service runtime/framework to null when only probe events exist", (): void => {
    const bundle = buildBundle({
      job: {
        trigger: "occurrence_threshold"
      },
      incident: {
        incident_id: "inc_probe_only",
        project_id: "proj_probe_only",
        service_id: "svc_probe_only",
        service_name: "checkout-api",
        service_runtime: null,
        service_framework: null,
        environment: "production",
        fingerprint: "fp_probe_only",
        title: "Probe-only incident",
        severity: "low",
        first_seen_at: "2026-03-12T00:00:00.000Z",
        last_seen_at: "2026-03-12T00:00:01.000Z",
        occurrence_count: 1,
        source_event_types: []
      },
      bundleMetadata: {
        generation_number: 1,
        created_at: "2026-03-12T00:00:01.000Z",
        updated_at: "2026-03-12T00:00:01.000Z",
        source_event_id: "00000000-0000-4000-8000-000000000411",
        source_occurred_at: "2026-03-12T00:00:01.000Z"
      },
      sourceEnvelopes: [
        createEventEnvelope({
          event_id: "00000000-0000-4000-8000-000000000412",
          event_type: "probe_event",
          occurred_at: "2026-03-12T00:00:00.000Z",
          service: {
            name: "checkout-api",
            environment: "production",
            runtime: "node",
            framework: "fastify"
          },
          payload: {
            label: "checkout.cache",
            data: { hit: true },
            activation_id: null,
            probe_label_pattern: "checkout.*"
          }
        }),
        createEventEnvelope({
          event_id: "00000000-0000-4000-8000-000000000411",
          event_type: "probe_event",
          occurred_at: "2026-03-12T00:00:00.000Z",
          service: {
            name: "checkout-api",
            environment: "production",
            runtime: "node",
            framework: "fastify"
          },
          payload: {
            label: "checkout.db",
            data: { retries: 1 },
            activation_id: null,
            probe_label_pattern: "checkout.*"
          }
        })
      ],
      probeDataItems: []
    });

    expect(bundle.service.runtime).toBeNull();
    expect(bundle.service.framework).toBeNull();
    expect(bundle.signal.signal_id).toBe("00000000-0000-4000-8000-000000000411");
  });
});
