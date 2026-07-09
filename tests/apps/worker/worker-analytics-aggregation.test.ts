import { gunzipSync, gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { processNextAggregateAnalyticsEventsJob } from "../../../apps/worker/src/analytics-aggregation.js";
import type { AnalyticsEventEnvelope } from "../../../packages/shared-types/src/index.js";

function createAnalyticsEvent(overrides: Partial<AnalyticsEventEnvelope> = {}): AnalyticsEventEnvelope {
  return {
    schema_version: "2026-07-analytics-01",
    event_id: "550e8400-e29b-41d4-a716-446655440000",
    event_type: "analytics_event",
    occurred_at: "2026-03-10T13:45:27.000Z",
    sdk_name: "@debugbundle/sdk-browser",
    sdk_version: "1.0.0",
    service: {
      name: "web",
      runtime: "browser",
      framework: "react",
      environment: "production"
    },
    correlation: {
      session_id: "sess_123",
      visitor_id_hash: null,
      user_id_hash: null,
      trace_id: null,
      deploy_id: null
    },
    payload: {
      kind: "page_view",
      route: {
        path: "/pricing",
        normalized_path: "/pricing",
        title: "Pricing"
      },
      dimensions: {
        auth_state: "anonymous",
        device_type: "desktop",
        browser_family: "Chrome",
        browser_major: 125,
        os_family: "macOS",
        os_major: 14,
        language: "en",
        locale: "en-US",
        viewport_bucket: "large",
        referrer_domain: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        country_code: null,
        region_code: null
      },
      custom_dimensions: {}
    },
    ...overrides
  };
}

describe("worker processor - aggregate-analytics-events", () => {
  it("loads raw analytics event objects and records aggregate rollups", async (): Promise<void> => {
    const event = createAnalyticsEvent();
    const queue = {
      dequeue: vi.fn().mockResolvedValue({
        project_id: "11111111-1111-4111-8111-111111111111",
        event_id: event.event_id,
        object_key: "analytics-events/11111111-1111-4111-8111-111111111111/event.json.gz"
      })
    };
    const objectStore = {
      getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event), "utf8")))
    };
    const analyticsRollupStore = {
      recordAnalyticsEvent: vi.fn().mockResolvedValue({ recorded: true })
    };

    await expect(
      processNextAggregateAnalyticsEventsJob({
        queue,
        objectStore,
        analyticsRollupStore
      })
    ).resolves.toEqual({ processed: true });

    expect(analyticsRollupStore.recordAnalyticsEvent).toHaveBeenCalledWith({
      project_id: "11111111-1111-4111-8111-111111111111",
      event
    });
  });

  it("captures a bounded retained journey sample after a new rollup event is recorded", async (): Promise<void> => {
    const event = createAnalyticsEvent({
      payload: {
        ...createAnalyticsEvent().payload,
        kind: "route_change",
        previous_route: {
          path: "/",
          normalized_path: "/",
          title: "Home"
        }
      }
    });
    const putObject = vi.fn().mockResolvedValue(undefined);
    const recordAnalyticsJourneySample = vi.fn().mockResolvedValue({
      sample_id: "22222222-2222-5222-8222-222222222222"
    });
    const objectStore = {
      getObject: vi
        .fn()
        .mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify(event), "utf8")))
        .mockRejectedValueOnce(new Error("s3_object_not_found")),
      putObject
    };

    await expect(
      processNextAggregateAnalyticsEventsJob({
        queue: {
          dequeue: vi.fn().mockResolvedValue({
            project_id: "11111111-1111-4111-8111-111111111111",
            event_id: event.event_id,
            object_key: "analytics-events/11111111-1111-4111-8111-111111111111/event.json.gz"
          })
        },
        objectStore,
        analyticsRollupStore: {
          recordAnalyticsEvent: vi.fn().mockResolvedValue({ recorded: true })
        },
        analyticsJourneySamples: {
          analyticsSettingsStore: {
            getAnalyticsSettingsByProjectId: vi.fn().mockResolvedValue({
              enabled: true,
              journey_sample_rate: 1,
              sample_retention_days: 7
            })
          },
          analyticsJourneySampleStore: {
            reserveAnalyticsJourneySample: vi.fn().mockResolvedValue("exists"),
            recordAnalyticsJourneySample,
            deleteAnalyticsJourneySampleForProject: vi.fn()
          },
          objectStore
        }
      })
    ).resolves.toEqual({ processed: true });

    expect(putObject).toHaveBeenCalledWith(expect.objectContaining({
      key: expect.stringMatching(
        /^analytics-journeys\/11111111-1111-4111-8111-111111111111\/[0-9a-f-]+\.json\.gz$/
      ),
      contentType: "application/json",
      contentEncoding: "gzip"
    }));
    const payload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    const artifact = JSON.parse(gunzipSync(payload.body).toString("utf8")) as Record<string, unknown>;
    expect(artifact).toMatchObject({
      schema_version: "analytics_journey_sample.v1",
      project_id: "11111111-1111-4111-8111-111111111111",
      service: "web",
      environment: "production"
    });
    expect(artifact["events"]).toEqual([
      expect.objectContaining({
        event_id: event.event_id,
        kind: "route_change",
        route: event.payload.route,
        previous_route: event.payload.previous_route
      })
    ]);
    expect(recordAnalyticsJourneySample).toHaveBeenCalledWith(expect.objectContaining({
      project_id: "11111111-1111-4111-8111-111111111111",
      service: "web",
      environment: "production",
      analysis_tags: expect.arrayContaining([
        "route_change",
        "transition:/->/pricing"
      ]),
      object_key: expect.stringMatching(/^analytics-journeys\//),
      expires_at: "2026-03-17T13:45:27.000Z"
    }));
  });

  it("runs journey sample capture on duplicate rollup events so replay can repair sample metadata", async (): Promise<void> => {
    const event = createAnalyticsEvent();
    const putObject = vi.fn().mockResolvedValue(undefined);
    const recordAnalyticsJourneySample = vi.fn().mockResolvedValue({});
    const objectStore = {
      getObject: vi
        .fn()
        .mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify(event), "utf8")))
        .mockRejectedValueOnce(new Error("s3_object_not_found")),
      putObject
    };

    await expect(
      processNextAggregateAnalyticsEventsJob({
        queue: {
          dequeue: vi.fn().mockResolvedValue({
            project_id: "11111111-1111-4111-8111-111111111111",
            event_id: event.event_id,
            object_key: "analytics-events/11111111-1111-4111-8111-111111111111/event.json.gz"
          })
        },
        objectStore,
        analyticsRollupStore: {
          recordAnalyticsEvent: vi.fn().mockResolvedValue({ recorded: false })
        },
        analyticsJourneySamples: {
          analyticsSettingsStore: {
            getAnalyticsSettingsByProjectId: vi.fn().mockResolvedValue({
              enabled: true,
              journey_sample_rate: 1,
              sample_retention_days: 7
            })
          },
          analyticsJourneySampleStore: {
            reserveAnalyticsJourneySample: vi.fn().mockResolvedValue("exists"),
            recordAnalyticsJourneySample,
            deleteAnalyticsJourneySampleForProject: vi.fn()
          },
          objectStore
        }
      })
    ).resolves.toEqual({ processed: true });

    expect(putObject).toHaveBeenCalledTimes(1);
    expect(recordAnalyticsJourneySample).toHaveBeenCalledTimes(1);
  });

  it("returns no_jobs when the analytics aggregation queue is empty", async (): Promise<void> => {
    await expect(
      processNextAggregateAnalyticsEventsJob({
        queue: { dequeue: vi.fn().mockResolvedValue(null) },
        objectStore: { getObject: vi.fn() },
        analyticsRollupStore: { recordAnalyticsEvent: vi.fn() }
      })
    ).resolves.toEqual({ processed: false, reason: "no_jobs" });
  });

  it("rejects invalid stored analytics payloads without updating rollups", async (): Promise<void> => {
    const analyticsRollupStore = {
      recordAnalyticsEvent: vi.fn()
    };

    await expect(
      processNextAggregateAnalyticsEventsJob({
        queue: {
          dequeue: vi.fn().mockResolvedValue({
            project_id: "11111111-1111-4111-8111-111111111111",
            event_id: "550e8400-e29b-41d4-a716-446655440000",
            object_key: "analytics-events/11111111-1111-4111-8111-111111111111/invalid.json.gz"
          })
        },
        objectStore: {
          getObject: vi.fn().mockResolvedValue(
            gzipSync(Buffer.from(JSON.stringify({ event_type: "analytics_event" }), "utf8"))
          )
        },
        analyticsRollupStore
      })
    ).resolves.toEqual({ processed: false, reason: "invalid_analytics_event" });

    expect(analyticsRollupStore.recordAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("rejects analytics objects that do not match the queued event identity", async (): Promise<void> => {
    const event = createAnalyticsEvent({
      event_id: "650e8400-e29b-41d4-a716-446655440000",
      project_id: "22222222-2222-4222-8222-222222222222"
    });
    const analyticsRollupStore = {
      recordAnalyticsEvent: vi.fn()
    };

    await expect(
      processNextAggregateAnalyticsEventsJob({
        queue: {
          dequeue: vi.fn().mockResolvedValue({
            project_id: "11111111-1111-4111-8111-111111111111",
            event_id: "550e8400-e29b-41d4-a716-446655440000",
            object_key: "analytics-events/11111111-1111-4111-8111-111111111111/mismatch.json.gz"
          })
        },
        objectStore: {
          getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event), "utf8")))
        },
        analyticsRollupStore
      })
    ).resolves.toEqual({ processed: false, reason: "analytics_event_mismatch" });

    expect(analyticsRollupStore.recordAnalyticsEvent).not.toHaveBeenCalled();
  });
});
