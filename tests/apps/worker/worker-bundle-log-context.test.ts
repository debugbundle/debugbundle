import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { BundleV1Schema, createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { processNextBuildBundleJob } from "../../../apps/worker/src/processor.js";
import { createReservedBundleGeneration } from "../../helpers/worker-bundle-delivery.js";

describe("worker bundle log context", () => {
  it("should include sampled log candidates correlated with incident request context", async (): Promise<void> => {
    const putObject = vi.fn().mockResolvedValue(undefined);
    const matchingLogEventId = "00000000-0000-4000-8000-000000000302";
    const unrelatedLogEventId = "00000000-0000-4000-8000-000000000303";

    const result = await processNextBuildBundleJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_logs",
          incident_id: "inc_logs",
          event_id: "00000000-0000-4000-8000-000000000301",
          occurred_at: "2026-03-12T00:00:10.000Z",
          occurrence_count: 1,
          trigger: "occurrence_threshold"
        })
      },
      incidentStore: {
        getBundleBuildContext: vi.fn().mockResolvedValue({
          incident_id: "inc_logs",
          project_id: "proj_logs",
          service_id: "svc_logs",
          service_name: "debugbundle-api",
          service_runtime: "node",
          service_framework: "fastify",
          environment: "production",
          fingerprint: "fp_logs",
          title: "github_api_invalid_response",
          severity: "high",
          first_seen_at: "2026-03-12T00:00:10.000Z",
          last_seen_at: "2026-03-12T00:00:10.000Z",
          occurrence_count: 1,
          source_event_types: ["backend_exception"]
        }),
        reserveBundleGeneration: vi.fn().mockResolvedValue(
          createReservedBundleGeneration({
            source_event_id: "00000000-0000-4000-8000-000000000301",
            source_occurred_at: "2026-03-12T00:00:10.000Z"
          })
        ),
        listIncidentEventReferences: vi.fn().mockResolvedValue([
          {
            event_id: "00000000-0000-4000-8000-000000000301",
            event_type: "backend_exception",
            occurred_at: "2026-03-12T00:00:10.000Z"
          }
        ]),
        listLogEventCandidatesForServiceWindow: vi.fn().mockResolvedValue([
          {
            event_id: matchingLogEventId,
            occurred_at: "2026-03-12T00:00:09.500Z"
          },
          {
            event_id: unrelatedLogEventId,
            occurred_at: "2026-03-12T00:00:09.750Z"
          }
        ]),
        listProbeEventCandidatesForServiceWindow: vi.fn().mockResolvedValue([])
      },
      objectStore: {
        putObject,
        getObject: vi.fn((input: { key: string }) => {
          if (input.key.endsWith("00000000-0000-4000-8000-000000000301.json.gz")) {
            return Promise.resolve(
              gzipSync(
                Buffer.from(
                  JSON.stringify(
                    createEventEnvelope({
                      event_id: "00000000-0000-4000-8000-000000000301",
                      event_type: "backend_exception",
                      occurred_at: "2026-03-12T00:00:10.000Z",
                      service: {
                        name: "debugbundle-api",
                        runtime: "node",
                        framework: "fastify",
                        environment: "production"
                      },
                      correlation: {
                        request_id: "req_install_url",
                        trace_id: "trace_install_url",
                        session_id: null,
                        user_id_hash: null
                      },
                      payload: {
                        name: "Error",
                        message: "github_api_invalid_response",
                        stack:
                          "Error: github_api_invalid_response\n    at getInstallUrl (apps/api/src/github-app.ts:1:1)",
                        handled: false,
                        request: {
                          method: "GET",
                          path: "/v1/github/app/install-url",
                          query: {},
                          headers: {},
                          body: null
                        },
                        response: {
                          status_code: 500
                        },
                        runtime: {
                          version: "24.0.0"
                        }
                      }
                    })
                  ),
                  "utf8"
                )
              )
            );
          }

          const eventId = input.key.endsWith(`${matchingLogEventId}.json.gz`)
            ? matchingLogEventId
            : unrelatedLogEventId;
          return Promise.resolve(
            gzipSync(
              Buffer.from(
                JSON.stringify(
                  createEventEnvelope({
                    event_id: eventId,
                    event_type: "log_event",
                    occurred_at:
                      eventId === matchingLogEventId
                        ? "2026-03-12T00:00:09.500Z"
                        : "2026-03-12T00:00:09.750Z",
                    service: {
                      name: "debugbundle-api",
                      runtime: "node",
                      framework: "fastify",
                      environment: "production"
                    },
                    correlation: {
                      request_id: eventId === matchingLogEventId ? "req_install_url" : "req_other",
                      trace_id:
                        eventId === matchingLogEventId ? "trace_install_url" : "trace_other",
                      session_id: null,
                      user_id_hash: null
                    },
                    payload: {
                      level: "error",
                      message:
                        eventId === matchingLogEventId
                          ? "github app returned invalid response"
                          : "unrelated failure",
                      attributes: {
                        upstream: "github"
                      }
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

    expect(bundle.context.logs).toEqual({
      version: 1,
      items: [
        {
          level: "error",
          message: "github app returned invalid response",
          timestamp: "2026-03-12T00:00:09.500Z",
          attributes: {
            upstream: "github"
          }
        }
      ]
    });
  });
});
