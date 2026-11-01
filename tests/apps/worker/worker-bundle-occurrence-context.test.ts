import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { BundleV1Schema, createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { processNextBuildBundleJob } from "../../../apps/worker/src/processor.js";

describe("worker bundle occurrence context", () => {
  it("should derive rich bundle context blocks from incident event envelopes and use persisted generation metadata", async (): Promise<void> => {
    const putObject = vi.fn().mockResolvedValue(undefined);

    const result = await processNextBuildBundleJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_rich",
          incident_id: "inc_rich",
          event_id: "00000000-0000-4000-8000-000000000201",
          occurred_at: "2026-03-12T00:00:10.000Z",
          occurrence_count: 3,
          trigger: "deploy_metadata"
        })
      },
      incidentStore: {
        getBundleBuildContext: vi.fn().mockResolvedValue({
          incident_id: "inc_rich",
          project_id: "proj_rich",
          service_id: "svc_rich",
          service_name: "checkout-api",
          service_runtime: "node",
          service_framework: "fastify",
          environment: "production",
          fingerprint: "fp_rich",
          title: "TypeError at checkout",
          severity: "high",
          first_seen_at: "2026-03-12T00:00:05.000Z",
          last_seen_at: "2026-03-12T00:00:40.000Z",
          occurrence_count: 3,
          source_event_types: [
            "backend_exception",
            "request_event",
            "log_event",
            "frontend_exception",
            "deploy_metadata"
          ]
        }),
        reserveBundleGeneration: vi.fn().mockResolvedValue({
          generation_number: 2,
          created_at: "2026-03-12T00:01:00.000Z",
          updated_at: "2026-03-12T00:01:00.000Z",
          source_event_id: "00000000-0000-4000-8000-000000000201",
          source_occurred_at: "2026-03-12T00:00:10.000Z",
          trigger: "deploy_metadata"
        }),
        listIncidentEventReferences: vi.fn().mockResolvedValue([
          {
            event_id: "00000000-0000-4000-8000-000000000201",
            event_type: "backend_exception",
            occurred_at: "2026-03-12T00:00:10.000Z"
          },
          {
            event_id: "00000000-0000-4000-8000-000000000202",
            event_type: "request_event",
            occurred_at: "2026-03-12T00:00:12.000Z"
          },
          {
            event_id: "00000000-0000-4000-8000-000000000203",
            event_type: "log_event",
            occurred_at: "2026-03-12T00:00:14.000Z"
          },
          {
            event_id: "00000000-0000-4000-8000-000000000204",
            event_type: "frontend_breadcrumb",
            occurred_at: "2026-03-12T00:00:16.000Z"
          },
          {
            event_id: "00000000-0000-4000-8000-000000000205",
            event_type: "frontend_exception",
            occurred_at: "2026-03-12T00:00:18.000Z"
          },
          {
            event_id: "00000000-0000-4000-8000-000000000206",
            event_type: "deploy_metadata",
            occurred_at: "2026-03-12T00:00:20.000Z"
          }
        ]),
        listProbeEventCandidatesForServiceWindow: vi.fn().mockResolvedValue([])
      },
      objectStore: {
        putObject,
        getObject: vi.fn((input: { key: string }) => {
          if (input.key.endsWith("00000000-0000-4000-8000-000000000201.json.gz")) {
            return Promise.resolve(
              gzipSync(
                Buffer.from(
                  JSON.stringify(
                    createEventEnvelope({
                      event_id: "00000000-0000-4000-8000-000000000201",
                      event_type: "backend_exception",
                      occurred_at: "2026-03-12T00:00:10.000Z",
                      service: {
                        name: "checkout-api",
                        runtime: "node",
                        framework: "fastify",
                        environment: "production"
                      },
                      correlation: {
                        request_id: "req_123",
                        trace_id: "trace_123",
                        session_id: null,
                        user_id_hash: null
                      },
                      payload: {
                        name: "TypeError",
                        message: "boom",
                        stack: "TypeError: boom\n    at processOrder (src/checkout.ts:42:11)",
                        handled: false,
                        request: {
                          method: "POST",
                          path: "/checkout",
                          query: { coupon: "SAVE10" },
                          headers: { "content-type": "application/json" },
                          body: { amount: 42 }
                        },
                        response: {
                          status_code: 500
                        },
                        runtime: {
                          version: "22.0.0"
                        }
                      }
                    })
                  ),
                  "utf8"
                )
              )
            );
          }

          if (input.key.endsWith("00000000-0000-4000-8000-000000000202.json.gz")) {
            return Promise.resolve(
              gzipSync(
                Buffer.from(
                  JSON.stringify(
                    createEventEnvelope({
                      event_id: "00000000-0000-4000-8000-000000000202",
                      event_type: "request_event",
                      occurred_at: "2026-03-12T00:00:12.000Z",
                      service: {
                        name: "checkout-api",
                        runtime: "node",
                        framework: "fastify",
                        environment: "production"
                      },
                      correlation: {
                        request_id: "req_123",
                        trace_id: "trace_123",
                        session_id: null,
                        user_id_hash: null
                      },
                      payload: {
                        method: "POST",
                        path: "/checkout",
                        query: { coupon: "SAVE10" },
                        headers: { "content-type": "application/json" },
                        body: { amount: 42 },
                        response_status: 500,
                        duration_ms: 120,
                        route_template: "/checkout"
                      }
                    })
                  ),
                  "utf8"
                )
              )
            );
          }

          if (input.key.endsWith("00000000-0000-4000-8000-000000000203.json.gz")) {
            return Promise.resolve(
              gzipSync(
                Buffer.from(
                  JSON.stringify(
                    createEventEnvelope({
                      event_id: "00000000-0000-4000-8000-000000000203",
                      event_type: "log_event",
                      occurred_at: "2026-03-12T00:00:14.000Z",
                      service: {
                        name: "checkout-api",
                        runtime: "node",
                        framework: "fastify",
                        environment: "production"
                      },
                      payload: {
                        level: "error",
                        message: "payment failed",
                        attributes: { orderId: "ord_123" }
                      }
                    })
                  ),
                  "utf8"
                )
              )
            );
          }

          if (input.key.endsWith("00000000-0000-4000-8000-000000000204.json.gz")) {
            return Promise.resolve(
              gzipSync(
                Buffer.from(
                  JSON.stringify(
                    createEventEnvelope({
                      event_id: "00000000-0000-4000-8000-000000000204",
                      event_type: "frontend_breadcrumb",
                      occurred_at: "2026-03-12T00:00:16.000Z",
                      service: {
                        name: "checkout-api",
                        runtime: "browser-js",
                        framework: "react",
                        environment: "production"
                      },
                      payload: {
                        breadcrumb_type: "route_change",
                        route: "/checkout",
                        data: { from: "/cart", to: "/checkout" }
                      }
                    })
                  ),
                  "utf8"
                )
              )
            );
          }

          if (input.key.endsWith("00000000-0000-4000-8000-000000000205.json.gz")) {
            return Promise.resolve(
              gzipSync(
                Buffer.from(
                  JSON.stringify(
                    createEventEnvelope({
                      event_id: "00000000-0000-4000-8000-000000000205",
                      event_type: "frontend_exception",
                      occurred_at: "2026-03-12T00:00:18.000Z",
                      service: {
                        name: "checkout-api",
                        runtime: "browser-js",
                        framework: "react",
                        environment: "production"
                      },
                      payload: {
                        name: "TypeError",
                        message: "Cannot read properties of null",
                        stack:
                          "TypeError: Cannot read properties of null\n    at CheckoutPage (src/Checkout.tsx:12:3)",
                        route: "/checkout",
                        browser: { name: "Chrome", version: "122.0.0" },
                        device: {
                          user_agent: "Mozilla/5.0",
                          os: { name: "macOS", version: "14.4" },
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
                    })
                  ),
                  "utf8"
                )
              )
            );
          }

          return Promise.resolve(
            gzipSync(
              Buffer.from(
                JSON.stringify(
                  createEventEnvelope({
                    event_id: "00000000-0000-4000-8000-000000000206",
                    event_type: "deploy_metadata",
                    occurred_at: "2026-03-12T00:00:20.000Z",
                    service: {
                      name: "checkout-api",
                      runtime: "node",
                      framework: "fastify",
                      environment: "production"
                    },
                    payload: {
                      commit_sha: "abcdef1234567890",
                      version: "v2.4.0",
                      branch: "main",
                      environment: "production",
                      deployed_at: "2026-03-12T00:00:00.000Z"
                    }
                  })
                ),
                "utf8"
              )
            )
          );
        })
      }
    });

    expect(result).toEqual({ processed: true });

    const payload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    const bundle = BundleV1Schema.parse(JSON.parse(gunzipSync(payload.body).toString("utf8")));

    expect(bundle.metadata.generation_number).toBe(2);
    expect(bundle.metadata.created_at).toBe("2026-03-12T00:01:00.000Z");
    expect(bundle.metadata.updated_at).toBe("2026-03-12T00:01:00.000Z");
    expect(bundle.captured_at).toBe("2026-03-12T00:00:10.000Z");
    expect(bundle.signal.signal_id).toBe("00000000-0000-4000-8000-000000000201");
    expect(bundle.context.request).toEqual({
      version: 1,
      method: "POST",
      path: "/checkout",
      route_template: "/checkout",
      query: { coupon: "SAVE10" },
      headers: { "content-type": "application/json" },
      body: { amount: 42 },
      request_id: "req_123"
    });
    expect(bundle.context.response).toEqual({
      version: 1,
      status_code: 500,
      duration_ms: 120
    });
    expect(bundle.context.logs).toEqual({
      version: 1,
      items: [
        {
          level: "error",
          message: "payment failed",
          timestamp: "2026-03-12T00:00:14.000Z",
          attributes: { orderId: "ord_123" }
        }
      ]
    });
    expect(bundle.context.frontend).toEqual({
      version: 1,
      route_changes: [{ from: "/cart", to: "/checkout", ts: "2026-03-12T00:00:16.000Z" }],
      clicks: [],
      form_submissions: [],
      console_logs: [],
      network_requests: [],
      exceptions: [
        {
          name: "TypeError",
          message: "Cannot read properties of null",
          route: "/checkout",
          browser: { name: "Chrome", version: "122.0.0" },
          ts: "2026-03-12T00:00:18.000Z"
        }
      ],
      dom_context: {
        mode: "lightweight",
        html_excerpt: "<button>Pay</button>"
      }
    });
    expect(bundle.context.deploy).toEqual({
      version: 1,
      commit_sha: "abcdef1234567890",
      deploy_version: "v2.4.0",
      branch: "main",
      deployed_at: "2026-03-12T00:00:00.000Z",
      regression_window: false
    });
    expect(bundle.context.runtime).toEqual({
      version: 1,
      name: "node",
      runtime_version: "22.0.0",
      platform: null,
      arch: null,
      pid: null,
      cwd: null,
      uptime_sec: null,
      hostname: null,
      thread_id: null,
      framework: "fastify",
      framework_version: null,
      memory: null,
      framework_extras: null
    });
    expect(bundle.context.git).toEqual({
      version: 1,
      commit: "abcdef1234567890",
      commit_short: "abcdef1",
      branch: "main",
      repo: null,
      dirty: false,
      source: "env"
    });
    // The device belongs to a neighbouring browser error, not the primary backend failure.
    expect(bundle.context.device).toBeNull();
  });
});
