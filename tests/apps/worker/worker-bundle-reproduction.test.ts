import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { processNextBuildReproductionJob } from "../../../apps/worker/src/processor.js";
import { buildReproductionObjectKey } from "../../../packages/storage/src/index.js";
import { createReproductionBundle } from "../../helpers/worker-bundle-delivery.js";

describe("worker bundle reproduction", () => {
  it("should persist deterministic reproduction artifact bytes for build-reproduction jobs", async (): Promise<void> => {
    const bundle = createReproductionBundle({ includeRequest: true });

    const getObject = vi
      .fn()
      .mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(bundle), "utf8")));
    const putObject = vi.fn().mockResolvedValue(undefined);
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");

    const result = await processNextBuildReproductionJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          incident_id: "inc_123",
          bundle_key: "bundles/proj_123/inc_123/bundle.json.gz",
          bundle_version: 1,
          occurred_at: "2026-03-12T00:00:00.000Z"
        })
      },
      accountAnalyticsStore: {
        recordMetricDeltas
      },
      resolveOrganizationIdForProject: vi.fn().mockResolvedValue("org_123"),
      objectStore: {
        getObject,
        putObject
      }
    });

    expect(result).toEqual({ processed: true });
    expect(getObject).toHaveBeenCalledWith({
      key: "bundles/proj_123/inc_123/bundle.json.gz"
    });
    expect(putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: buildReproductionObjectKey("proj_123", "inc_123"),
        contentType: "application/json",
        contentEncoding: "gzip"
      })
    );
    expect(recordMetricDeltas).toHaveBeenCalledWith({
      organization_id: "org_123",
      occurred_at: "2026-03-12T00:00:00.000Z",
      source: "worker.build_reproduction",
      dedupe_key: "reproduction_created:inc_123:2",
      deltas: {
        reproductions_created: 1
      }
    });

    const firstPayload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    expect(JSON.parse(gunzipSync(firstPayload.body).toString("utf8"))).toEqual({
      possible: false,
      confidence: 0.1,
      reason: "request_target_unavailable",
      artifacts: {
        curl: "curl -X POST 'https://example.invalid/checkout?coupon=SAVE10' -H 'content-type: application/json' --data-raw '{\"amount\":42}'",
        httpie:
          "printf '%s' '{\"amount\":42}' | http POST 'https://example.invalid/checkout?coupon=SAVE10' 'content-type:application/json'",
        json_spec: {
          method: "POST",
          url: "https://example.invalid/checkout?coupon=SAVE10",
          headers: {
            "content-type": "application/json"
          },
          body: {
            amount: 42
          }
        }
      },
      feasibility_reference: null
    });

    await processNextBuildReproductionJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          incident_id: "inc_123",
          bundle_key: "bundles/proj_123/inc_123/bundle.json.gz",
          bundle_version: 1,
          occurred_at: "2026-03-12T00:00:00.000Z"
        })
      },
      objectStore: {
        getObject,
        putObject
      }
    });

    const secondPayload = putObject.mock.calls[1]?.[0] as { body: Buffer };
    expect(firstPayload.body.equals(secondPayload.body)).toBe(true);
  });

  it("should record reproduction failure when the bundle artifact is missing", async (): Promise<void> => {
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");

    const result = await processNextBuildReproductionJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          incident_id: "inc_123",
          bundle_key: "bundles/proj_123/inc_123/bundle.json.gz",
          bundle_version: 1,
          occurred_at: "2026-03-12T00:00:00.000Z"
        })
      },
      accountAnalyticsStore: {
        recordMetricDeltas
      },
      resolveOrganizationIdForProject: vi.fn().mockResolvedValue("org_123"),
      objectStore: {
        getObject: vi.fn().mockRejectedValue(new Error("missing_bundle")),
        putObject: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "bundle_missing" });
    expect(recordMetricDeltas).toHaveBeenCalledWith({
      organization_id: "org_123",
      occurred_at: "2026-03-12T00:00:00.000Z",
      source: "worker.build_reproduction",
      dedupe_key: "reproduction_failed:inc_123:bundle_missing:2026-03-12T00:00:00.000Z",
      deltas: {
        reproductions_failed: 1
      }
    });
  });

  it("should add a deterministic incomplete template when request context appears without an origin", async (): Promise<void> => {
    const getObject = vi
      .fn()
      .mockResolvedValueOnce(
        gzipSync(
          Buffer.from(JSON.stringify(createReproductionBundle({ includeRequest: false })), "utf8")
        )
      )
      .mockResolvedValueOnce(
        gzipSync(
          Buffer.from(JSON.stringify(createReproductionBundle({ includeRequest: true })), "utf8")
        )
      )
      .mockResolvedValueOnce(
        gzipSync(
          Buffer.from(JSON.stringify(createReproductionBundle({ includeRequest: true })), "utf8")
        )
      );
    const putObject = vi.fn().mockResolvedValue(undefined);

    expect(
      await processNextBuildReproductionJob({
        queue: {
          enqueue: vi.fn(),
          dequeue: vi.fn().mockResolvedValue({
            project_id: "proj_123",
            incident_id: "inc_123",
            bundle_key: "bundles/proj_123/inc_123/bundle.json.gz",
            bundle_version: 1,
            occurred_at: "2026-03-12T00:00:00.000Z"
          })
        },
        objectStore: {
          getObject,
          putObject
        }
      })
    ).toEqual({ processed: true });

    const initialPayload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    expect(JSON.parse(gunzipSync(initialPayload.body).toString("utf8"))).toEqual({
      possible: false,
      confidence: 0.1,
      reason: "request_context_missing",
      artifacts: null,
      feasibility_reference: null
    });

    expect(
      await processNextBuildReproductionJob({
        queue: {
          enqueue: vi.fn(),
          dequeue: vi.fn().mockResolvedValue({
            project_id: "proj_123",
            incident_id: "inc_123",
            bundle_key: "bundles/proj_123/inc_123/bundle.json.gz",
            bundle_version: 1,
            occurred_at: "2026-03-12T00:10:00.000Z"
          })
        },
        objectStore: {
          getObject,
          putObject
        }
      })
    ).toEqual({ processed: true });

    const upgradedPayload = putObject.mock.calls[1]?.[0] as { body: Buffer };
    expect(JSON.parse(gunzipSync(upgradedPayload.body).toString("utf8"))).toEqual({
      possible: false,
      confidence: 0.1,
      reason: "request_target_unavailable",
      artifacts: {
        curl: "curl -X POST 'https://example.invalid/checkout?coupon=SAVE10' -H 'content-type: application/json' --data-raw '{\"amount\":42}'",
        httpie:
          "printf '%s' '{\"amount\":42}' | http POST 'https://example.invalid/checkout?coupon=SAVE10' 'content-type:application/json'",
        json_spec: {
          method: "POST",
          url: "https://example.invalid/checkout?coupon=SAVE10",
          headers: {
            "content-type": "application/json"
          },
          body: {
            amount: 42
          }
        }
      },
      feasibility_reference: null
    });

    expect(
      await processNextBuildReproductionJob({
        queue: {
          enqueue: vi.fn(),
          dequeue: vi.fn().mockResolvedValue({
            project_id: "proj_123",
            incident_id: "inc_123",
            bundle_key: "bundles/proj_123/inc_123/bundle.json.gz",
            bundle_version: 1,
            occurred_at: "2026-03-12T00:10:00.000Z"
          })
        },
        objectStore: {
          getObject,
          putObject
        }
      })
    ).toEqual({ processed: true });

    const replayPayload = putObject.mock.calls[2]?.[0] as { body: Buffer };
    expect(upgradedPayload.body.equals(replayPayload.body)).toBe(true);
  });
});
