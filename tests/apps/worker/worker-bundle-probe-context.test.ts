import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { BundleV1Schema, createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { processNextBuildBundleJob } from "../../../apps/worker/src/processor.js";
import { createReservedBundleGeneration } from "../../helpers/worker-bundle-delivery.js";

describe("worker bundle probe context", () => {
  it("should merge remote probe_event context deterministically using incident-aligned matching", async (): Promise<void> => {
    const putObject = vi.fn().mockResolvedValue(undefined);

    const result = await processNextBuildBundleJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_probe",
          incident_id: "inc_probe",
          event_id: "evt_build",
          occurred_at: "2026-03-12T00:00:00.000Z",
          occurrence_count: 3,
          trigger: "deploy_metadata"
        })
      },
      incidentStore: {
        getBundleBuildContext: vi.fn().mockResolvedValue({
          incident_id: "inc_probe",
          project_id: "proj_probe",
          service_id: "svc_probe",
          service_name: "checkout-api",
          service_runtime: "node",
          service_framework: "fastify",
          environment: "production",
          fingerprint: "fp_probe",
          title: "TypeError at checkout",
          severity: "high",
          first_seen_at: "2026-03-12T00:00:00.000Z",
          last_seen_at: "2026-03-12T00:01:00.000Z",
          occurrence_count: 3,
          source_event_types: ["backend_exception", "request_event"]
        }),
        reserveBundleGeneration: vi.fn().mockResolvedValue(
          createReservedBundleGeneration({
            generation_number: 3,
            source_event_id: "evt_build",
            trigger: "deploy_metadata"
          })
        ),
        listIncidentEventReferences: vi.fn().mockResolvedValue([
          {
            event_id: "00000000-0000-4000-8000-000000000101",
            event_type: "backend_exception",
            occurred_at: "2026-03-12T00:00:10.000Z"
          }
        ]),
        listProbeEventCandidatesForServiceWindow: vi.fn().mockResolvedValue([
          {
            event_id: "00000000-0000-4000-8000-000000000102",
            occurred_at: "2026-03-12T00:00:20.000Z"
          },
          {
            event_id: "00000000-0000-4000-8000-000000000103",
            occurred_at: "2026-03-12T00:00:25.000Z"
          },
          {
            event_id: "00000000-0000-4000-8000-000000000104",
            occurred_at: "2026-03-12T00:00:30.000Z"
          }
        ])
      },
      objectStore: {
        putObject,
        getObject: vi.fn((input: { key: string }) => {
          if (input.key.endsWith("00000000-0000-4000-8000-000000000101.json.gz")) {
            return Promise.resolve(
              gzipSync(
                Buffer.from(
                  JSON.stringify(
                    createEventEnvelope({
                      event_id: "00000000-0000-4000-8000-000000000101",
                      event_type: "backend_exception",
                      occurred_at: "2026-03-12T00:00:10.000Z",
                      service: {
                        name: "checkout-api",
                        runtime: "node",
                        framework: "fastify",
                        environment: "production"
                      },
                      correlation: {
                        request_id: null,
                        trace_id: "trace-match",
                        session_id: null,
                        user_id_hash: null
                      },
                      payload: {
                        name: "TypeError",
                        message: "boom",
                        stack: "TypeError: boom\\n at src/checkout.ts:10:2",
                        handled: false,
                        request: {
                          method: "GET",
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
                        },
                        probe_data: {
                          version: 1,
                          items: [
                            {
                              label: "checkout.tax",
                              data: {
                                step: "tax",
                                value: 12
                              },
                              timestamp: "2026-03-12T00:00:20.000Z",
                              activation_id: null
                            },
                            {
                              label: "checkout.inline_only",
                              data: {
                                from: "inline"
                              },
                              timestamp: "2026-03-12T00:00:15.000Z",
                              activation_id: null
                            }
                          ]
                        }
                      }
                    })
                  ),
                  "utf8"
                )
              )
            );
          }

          if (input.key.endsWith("00000000-0000-4000-8000-000000000102.json.gz")) {
            return Promise.resolve(
              gzipSync(
                Buffer.from(
                  JSON.stringify(
                    createEventEnvelope({
                      event_id: "00000000-0000-4000-8000-000000000102",
                      event_type: "probe_event",
                      occurred_at: "2026-03-12T00:00:20.000Z",
                      service: {
                        name: "checkout-api",
                        runtime: "node",
                        framework: "fastify",
                        environment: "production"
                      },
                      correlation: {
                        request_id: null,
                        trace_id: "trace-match",
                        session_id: null,
                        user_id_hash: null
                      },
                      payload: {
                        label: "checkout.tax",
                        data: {
                          step: "tax",
                          value: 12
                        },
                        activation_id: null,
                        probe_label_pattern: "checkout.*"
                      }
                    })
                  ),
                  "utf8"
                )
              )
            );
          }

          if (input.key.endsWith("00000000-0000-4000-8000-000000000103.json.gz")) {
            return Promise.resolve(
              gzipSync(
                Buffer.from(
                  JSON.stringify(
                    createEventEnvelope({
                      event_id: "00000000-0000-4000-8000-000000000103",
                      event_type: "probe_event",
                      occurred_at: "2026-03-12T00:00:25.000Z",
                      service: {
                        name: "checkout-api",
                        runtime: "node",
                        framework: "fastify",
                        environment: "production"
                      },
                      correlation: {
                        request_id: null,
                        trace_id: "trace-other",
                        session_id: null,
                        user_id_hash: null
                      },
                      payload: {
                        label: "checkout.miss",
                        data: {
                          ignored: true
                        },
                        activation_id: "00000000-0000-4000-8000-000000000012",
                        probe_label_pattern: "checkout.*"
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
                    event_id: "00000000-0000-4000-8000-000000000104",
                    event_type: "probe_event",
                    occurred_at: "2026-03-12T00:00:30.000Z",
                    service: {
                      name: "checkout-api",
                      runtime: "node",
                      framework: "fastify",
                      environment: "production"
                    },
                    correlation: {
                      request_id: null,
                      trace_id: null,
                      session_id: null,
                      user_id_hash: null
                    },
                    payload: {
                      label: "checkout.no_trace",
                      data: {
                        fallback: true
                      },
                      activation_id: "00000000-0000-4000-8000-000000000013",
                      probe_label_pattern: "checkout.*"
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

    expect(bundle.context.probe_data).toEqual({
      version: 1,
      items: [
        {
          label: "checkout.inline_only",
          data: {
            from: "inline"
          },
          timestamp: "2026-03-12T00:00:15.000Z",
          activation_id: null
        },
        {
          label: "checkout.tax",
          data: {
            step: "tax",
            value: 12
          },
          timestamp: "2026-03-12T00:00:20.000Z",
          activation_id: null
        },
        {
          label: "checkout.no_trace",
          data: {
            fallback: true
          },
          timestamp: "2026-03-12T00:00:30.000Z",
          activation_id: "00000000-0000-4000-8000-000000000013"
        }
      ]
    });
  });

  it("should normalize store timestamp text to strict ISO datetimes in build-bundle artifacts", async (): Promise<void> => {
    const putObject = vi.fn().mockResolvedValue(undefined);

    const result = await processNextBuildBundleJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          incident_id: "inc_123",
          event_id: "evt_123",
          occurred_at: "2026-03-12T00:00:00.000Z",
          occurrence_count: 2,
          trigger: "occurrence_threshold"
        })
      },
      incidentStore: {
        // Postgres text can include a space separator and timezone offset.
        getBundleBuildContext: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
          project_id: "proj_123",
          service_id: "svc_123",
          service_name: "checkout-api",
          service_runtime: "node",
          service_framework: "fastify",
          environment: "production",
          fingerprint: "fp_123",
          title: "TypeError at checkout",
          severity: "high",
          first_seen_at: "2026-03-11 23:59:00+00",
          last_seen_at: "2026-03-12 00:00:00+00",
          occurrence_count: 2,
          source_event_types: ["backend_exception"]
        }),
        reserveBundleGeneration: vi.fn().mockResolvedValue(
          createReservedBundleGeneration({
            generation_number: 1,
            created_at: "2026-03-12 00:00:00+00",
            updated_at: "2026-03-12 00:00:00+00"
          })
        )
      },
      objectStore: {
        putObject
      }
    });

    expect(result).toEqual({ processed: true });

    const payload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    const bundle = BundleV1Schema.parse(JSON.parse(gunzipSync(payload.body).toString("utf8")));

    expect(bundle.captured_at).toBe("2026-03-12T00:00:00.000Z");
    expect(bundle.signal.first_seen_at).toBe("2026-03-11T23:59:00.000Z");
    expect(bundle.signal.last_seen_at).toBe("2026-03-12T00:00:00.000Z");
    expect(bundle.metadata.created_at).toBe("2026-03-12T00:00:00.000Z");
    expect(bundle.metadata.updated_at).toBe("2026-03-12T00:00:00.000Z");
  });
});
